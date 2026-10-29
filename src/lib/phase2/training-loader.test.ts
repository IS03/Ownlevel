import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { loadCompletedTrainingData, readAllTrainingRows } from "./training-robust";
import { buildTrainingAnalysis } from "./training-analysis";
import { buildTrainingLoadComparison } from "../progress/training-performance";
import { addProgressIsoDays, getPreviousProgressPeriod } from "../progress/analytics";

const TODAY = "2026-10-05";
const USER = "owner";
type Row = Record<string, unknown> & { id: string; user_id: string };
const uuid = (prefix: number, n: number) => `${String(prefix).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** 400 completed sessions over ~2 years, 2 exercises × 3 completed sets each (2400 sets), plus noise that must be excluded. */
function dataset() {
  const tables: Record<string, Row[]> = { workout_sessions: [], workout_session_exercises: [], workout_sets: [], day_logs: [] };
  for (let i = 0; i < 400; i += 1) {
    const date = addProgressIsoDays(TODAY, -Math.floor(i * 1.8));
    const dayId = uuid(1, i), sessionId = uuid(2, i);
    if (!tables.day_logs.some(d => d.log_date === date)) tables.day_logs.push({ id: dayId, user_id: USER, log_date: date });
    const day = tables.day_logs.find(d => d.log_date === date)!;
    tables.workout_sessions.push({ id: sessionId, user_id: USER, day_log_id: day.id, status: "completed", started_at: `${date}T10:00:00Z`, ended_at: `${date}T11:00:00Z`,
      routine_id: null, routine_name_snapshot: "Full", session_name: null, energy_level: null, performance_level: null, pain_level: null });
    for (let e = 0; e < 2; e += 1) {
      const exId = uuid(3, i * 2 + e);
      tables.workout_session_exercises.push({ id: exId, user_id: USER, workout_session_id: sessionId, exercise_id: uuid(9, e), nombre_snapshot: `Ejercicio ${e}`,
        grupo_muscular_snapshot: "pecho", muscle_group_label_snapshot: null, weight_mode_snapshot: "Peso total", is_completed: true });
      for (let k = 0; k < 3; k += 1) tables.workout_sets.push({ id: uuid(4, (i * 2 + e) * 3 + k), user_id: USER, workout_session_exercise_id: exId, is_completed: true, actual_reps: 8, actual_weight_kg: 50 + e });
    }
  }
  // Noise: another user, a discarded session and incomplete sets are never counted.
  tables.workout_sessions.push({ id: uuid(5, 1), user_id: USER, day_log_id: tables.day_logs[0].id, status: "discarded", started_at: null, ended_at: null });
  tables.workout_session_exercises.push({ id: uuid(5, 2), user_id: USER, workout_session_id: uuid(5, 1), exercise_id: uuid(9, 0), is_completed: true });
  tables.workout_sets.push({ id: uuid(5, 3), user_id: USER, workout_session_exercise_id: uuid(5, 2), is_completed: true, actual_reps: 99, actual_weight_kg: 999 });
  tables.workout_sets.push({ id: uuid(5, 4), user_id: "stranger", workout_session_exercise_id: uuid(3, 0), is_completed: true, actual_reps: 1, actual_weight_kg: 1 });
  tables.workout_sets.push({ id: uuid(5, 5), user_id: USER, workout_session_exercise_id: uuid(3, 0), is_completed: false, actual_reps: 1, actual_weight_kg: 1 });
  return tables;
}

/** PostgREST emulation: max rows per response, and long `.in()` lists rejected (URL limit). */
function fakeSupabase(tables: Record<string, Row[]>, maxRows: number) {
  const queries: { table: string; returned: number }[] = [];
  return {
    queries,
    client: {
      from(table: string) {
        const filters: ((row: Row) => boolean)[] = [];
        let orders: { column: string; ascending: boolean }[] = [];
        let embedDay = false, counted = false;
        const builder = {
          select(columns: string, options?: { count?: string }) { embedDay = columns.includes("day:day_logs"); counted = options?.count === "exact"; return builder; },
          eq(column: string, value: unknown) { filters.push(row => row[column] === value); return builder; },
          in(column: string, values: unknown[]) {
            if (values.length > 100) throw new Error("URL too long");
            filters.push(row => values.includes(row[column])); return builder;
          },
          order(column: string, options: { ascending: boolean }) { orders = [...orders, { column, ...options }]; return builder; },
          limit: (n: number) => builder.range(0, n - 1),
          range(from: number, to: number) {
            const rows = tables[table].filter(row => filters.every(f => f(row))).sort((a, b) => {
              for (const o of orders) {
                const x = String(a[o.column] ?? ""), y = String(b[o.column] ?? "");
                if (x !== y) return (x < y ? -1 : 1) * (o.ascending ? 1 : -1);
              }
              return 0;
            });
            const page = rows.slice(from, Math.min(to + 1, from + maxRows));
            // The session's own date comes embedded (owner-scoped, as RLS would).
            const data = embedDay ? page.map(row => ({ ...row, day: tables.day_logs.find(d => d.id === row.day_log_id && d.user_id === row.user_id) ?? null })) : page;
            queries.push({ table, returned: data.length });
            const result = Promise.resolve({ data, error: null, ...(counted ? { count: rows.length } : {}) });
            return Object.assign(result, { returns: () => result });
          },
        };
        return builder;
      },
    },
  };
}

describe("Training loader reads every completed set (no PostgREST truncation, no huge .in())", () => {
  it.each([1000, 250])("server cap %i: all sessions, exercises and sets are loaded with a fixed set of paged queries", async cap => {
    const tables = dataset();
    const fake = fakeSupabase(tables, cap);
    const data = await loadCompletedTrainingData({ supabase: fake.client as never, userId: USER });
    expect(data.sessions).toHaveLength(400); // no 500-row (or any) cap
    expect(data.sessionExercises).toHaveLength(800);
    expect(data.sets).toHaveLength(2400);
    expect(data.sets.some(set => set.actual_weight_kg === 999 || set.actual_reps === 1)).toBe(false);
    expect(new Set(data.sets.map(set => set.id)).size).toBe(2400);
    // Deterministic, owner-scoped paging: 3 tables (dates come with the sessions), each read until its exact count.
    expect(new Set(fake.queries.map(q => q.table))).toEqual(new Set(["workout_sessions", "workout_session_exercises", "workout_sets"]));
    expect(fake.queries.filter(q => q.table === "workout_sets").length).toBe(Math.ceil(2403 / cap));
    expect(fake.queries.every(q => q.returned > 0)).toBe(true);
  });
  it("current + previous period analytics use every set", async () => {
    const fake = fakeSupabase(dataset(), 1000);
    const data = await loadCompletedTrainingData({ supabase: fake.client as never, userId: USER });
    const current = buildTrainingAnalysis(data, { today: TODAY, period: "1y" });
    const previousRange = getPreviousProgressPeriod(current.range);
    const previous = buildTrainingAnalysis(data, { today: previousRange.end, period: "1y", range: previousRange });
    const inRange = (start: string, end: string) => data.sessions.filter(s => { const d = data.dateByDayLog.get(s.day_log_id)!; return d >= start && d <= end; }).length;
    expect(current.summary.sessions).toBe(inRange(current.range.start, current.range.end));
    expect(current.summary.sets).toBe(current.summary.sessions * 6);
    expect(previous.summary.sets).toBe(inRange(previousRange.start, previousRange.end) * 6);
    expect(current.summary.sets + previous.summary.sets).toBeGreaterThan(1000);
    const load = buildTrainingLoadComparison({ source: data, primary: current, reference: previous,
      referenceDefinition: { type: "previous_period", period: previousRange, label: "Período anterior" }, metricKeys: ["training.load.sets"] });
    expect(load.results[0].valueA).toBe(current.summary.sets);
    expect(load.results[0].valueB).toBe(previous.summary.sets);
  });
  it("readAllTrainingRows advances by received rows and surfaces errors", async () => {
    const rows = Array.from({ length: 1234 }, (_, i) => i);
    const read = await readAllTrainingRows("x", (from, to) => Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 300)), error: null }));
    expect(read).toEqual(rows);
    await expect(readAllTrainingRows("Leer", () => Promise.resolve({ data: null, error: { message: "boom" } }))).rejects.toThrow("Leer: boom");
  });
});
