import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { loadCompletedTrainingData, readAllTrainingRows } from "./training-robust";
import { trainingLoadSamples } from "../progress/training-performance";
import { addProgressIsoDays } from "../progress/analytics";
import type { WorkoutSession, WorkoutSessionExercise, WorkoutSet } from "./types";

const TODAY = "2026-10-29";
const USER = "owner";
type Row = Record<string, unknown> & { id: string; user_id: string };
type Tables = Record<"workout_sessions" | "workout_session_exercises" | "workout_sets" | "day_logs", Row[]>;
const id = (prefix: number, n: number) => `${String(prefix).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;

/**
 * PostgREST emulation for these reads: owner filters, an embedded day (owner-
 * scoped, as RLS would), a stable order, a server cap per response and exact counts.
 */
function fakeSupabase(tables: Tables, maxRows: number) {
  const queries: { table: string; returned: number; counted: boolean }[] = [];
  const byId = (table: keyof Tables) => new Map(tables[table].map(row => [row.id, row]));
  const raw = { day_logs: byId("day_logs"), workout_sessions: byId("workout_sessions"), workout_session_exercises: byId("workout_session_exercises"), workout_sets: byId("workout_sets") };
  const days = raw.day_logs, sessions = raw.workout_sessions, exercises = raw.workout_session_exercises;
  const owned = (row: Row | undefined, owner: unknown) => row && row.user_id === owner ? row : null;
  const sessionOf = (sessionId: unknown, owner: unknown) => {
    const session = owned(sessions.get(String(sessionId)), owner);
    return session ? { ...session, day: owned(days.get(String(session.day_log_id)), owner) } : null;
  };
  const embedded = (table: keyof Tables, row: Row): Record<string, unknown> => {
    if (table === "workout_sessions") return { day: owned(days.get(String(row.day_log_id)), row.user_id) };
    if (table === "workout_session_exercises") return { session: sessionOf(row.workout_session_id, row.user_id) };
    if (table === "workout_sets") {
      const exercise = owned(exercises.get(String(row.workout_session_exercise_id)), row.user_id);
      return { exercise: exercise ? { ...exercise, session: sessionOf(exercise.workout_session_id, row.user_id) } : null };
    }
    return {};
  };
  const augmented = new Map<keyof Tables, Record<string, unknown>[]>();
  const rowsOf = (table: keyof Tables) => {
    if (!augmented.has(table)) augmented.set(table, tables[table].map(row => ({ ...row, ...embedded(table, row) })));
    return augmented.get(table)!;
  };
  const at = (value: unknown, path: string[]): unknown => path.reduce<unknown>((v, key) => (v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined), value);
  return {
    queries,
    client: {
      from(table: keyof Tables) {
        const filters: ((row: Record<string, unknown>) => boolean)[] = [];
        let orders: { column: string; ascending: boolean }[] = [];
        let columns = "*", counted = false;
        const builder = {
          select(cols: string, options?: { count?: string }) { columns = cols; counted = options?.count === "exact"; return builder; },
          eq(path: string, value: unknown) { filters.push(row => at(row, path.split(".")) === value); return builder; },
          order(column: string, options: { ascending: boolean }) { orders = [...orders, { column, ...options }]; return builder; },
          range(from: number, to: number) {
            const rows = rowsOf(table)
              .filter(row => filters.every(f => f(row)))
              .sort((a, b) => {
                for (const o of orders) {
                  const x = String(a[o.column] ?? ""), y = String(b[o.column] ?? "");
                  if (x !== y) return (x < y ? -1 : 1) * (o.ascending ? 1 : -1);
                }
                return 0;
              });
            const projected = rows.map(row => {
              if (columns === "id, log_date") return { id: row.id, log_date: row.log_date };
              const base: Record<string, unknown> = { ...raw[table].get(String(row.id)) };
              for (const alias of ["day", "session", "exercise"]) if (columns.includes(`${alias}:`)) base[alias] = row[alias] ?? null;
              return base;
            });
            const data = projected.slice(from, Math.min(to + 1, from + maxRows));
            queries.push({ table, returned: data.length, counted });
            return { returns: () => Promise.resolve({ data, error: null, ...(counted ? { count: rows.length } : {}) }),
              then: (resolve: (v: unknown) => unknown) => resolve({ data, error: null, ...(counted ? { count: rows.length } : {}) }) };
          },
        };
        return builder;
      },
    },
  };
}

/** The loader exactly as it was before this change: the "before" of every comparison. */
async function legacyLoad(supabase: ReturnType<typeof fakeSupabase>["client"], userId: string) {
  const readAll = async <T,>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) => {
    const rows: T[] = [];
    for (;;) { const { data } = await page(rows.length, rows.length + 999); if (!data?.length) return rows; rows.push(...data); }
  };
  const sessions = await readAll<WorkoutSession>((f, t) => supabase.from("workout_sessions").select("*").eq("user_id", userId).eq("status", "completed")
    .order("ended_at", { ascending: false }).order("id", { ascending: true }).range(f, t) as never);
  if (!sessions.length) return { sessions: [], sessionExercises: [], sets: [], dateByDayLog: new Map<string, string>() };
  const sessionIds = new Set(sessions.map(s => s.id)), dayLogIds = new Set(sessions.map(s => s.day_log_id));
  const [allExercises, days, allSets] = await Promise.all([
    readAll<WorkoutSessionExercise>((f, t) => supabase.from("workout_session_exercises").select("*").eq("user_id", userId).order("id", { ascending: true }).range(f, t) as never),
    readAll<{ id: string; log_date: string }>((f, t) => supabase.from("day_logs").select("id, log_date").eq("user_id", userId).order("id", { ascending: true }).range(f, t) as never),
    readAll<WorkoutSet>((f, t) => supabase.from("workout_sets").select("*").eq("user_id", userId).eq("is_completed", true).order("id", { ascending: true }).range(f, t) as never),
  ]);
  const sessionExercises = allExercises.filter(e => sessionIds.has(e.workout_session_id));
  const exerciseIds = new Set(sessionExercises.map(e => e.id));
  return { sessions, sessionExercises, sets: allSets.filter(s => exerciseIds.has(s.workout_session_exercise_id)),
    dateByDayLog: new Map(days.filter(d => dayLogIds.has(d.id)).map(d => [d.id, d.log_date])) };
}

type Shape = { days: number; completed: number; perSession: number; setsPerExercise: number };
/**
 * Completed sessions every `days / completed` days (two on some days, to pin the
 * same-date order), plus everything a full read must skip: discarded and
 * in-progress sessions with sets, incomplete sets, uncompleted exercises,
 * nutrition-only days, a completed session without end, and another user.
 */
function dataset({ days, completed, perSession, setsPerExercise }: Shape): Tables {
  const t: Tables = { workout_sessions: [], workout_session_exercises: [], workout_sets: [], day_logs: [] };
  let n = 0;
  const dayFor = (date: string, user = USER) => {
    const found = t.day_logs.find(d => d.log_date === date && d.user_id === user);
    if (found) return found;
    const row = { id: id(1, n++), user_id: user, log_date: date };
    t.day_logs.push(row); return row;
  };
  const session = (date: string, status: string, user = USER, hour = 10, ended = true) => {
    const s = { id: id(2, n++), user_id: user, day_log_id: dayFor(date, user).id, status, routine_id: null, routine_name_snapshot: "Push", session_name: null,
      started_at: `${date}T${hour}:00:00Z`, ended_at: status === "completed" && ended ? `${date}T${hour + 1}:00:00Z` : null, energy_level: null, performance_level: null, pain_level: null };
    t.workout_sessions.push(s);
    for (let e = 0; e < perSession; e += 1) {
      const ex = { id: id(3, n++), user_id: user, workout_session_id: s.id, exercise_id: id(9, e % 5), nombre_snapshot: `Ejercicio ${e % 5}`, grupo_muscular_snapshot: "pecho",
        muscle_group_label_snapshot: null, weight_mode_snapshot: "Peso total", exercise_order: e, is_completed: e !== perSession - 1 || status !== "completed" ? true : n % 3 !== 0 };
      t.workout_session_exercises.push(ex);
      for (let k = 0; k < setsPerExercise; k += 1) {
        t.workout_sets.push({ id: id(4, n++), user_id: user, workout_session_exercise_id: ex.id, set_number: k + 1, is_completed: k !== setsPerExercise - 1 || n % 4 !== 0,
          actual_reps: 6 + ((n + k) % 6), actual_weight_kg: 40 + ((n * 7) % 50) });
      }
    }
    return s;
  };
  const step = days / completed;
  for (let i = 0; i < completed; i += 1) {
    const date = addProgressIsoDays(TODAY, -Math.floor(i * step));
    session(date, "completed", USER, 8 + (i % 2) * 9);
  }
  // Same day and same end: only the id breaks the tie (records and charts keep that order).
  if (completed) for (let k = 0; k < 3; k += 1) session(addProgressIsoDays(TODAY, -10), "completed", USER, 15);
  for (let i = 0; i < Math.ceil(completed * 0.3); i += 1) session(addProgressIsoDays(TODAY, -Math.floor(i * step * 2.3)), "discarded");
  session(TODAY, "in_progress", USER, 20);
  session(addProgressIsoDays(TODAY, -3), "completed", USER, 22, false);
  for (let i = 0; i < Math.ceil(days * 0.6); i += 1) dayFor(addProgressIsoDays(TODAY, -i)); // nutrition-only days
  for (let i = 0; i < 10; i += 1) session(addProgressIsoDays(TODAY, -i * 2), "completed", "stranger");
  return t;
}

const sorted = (map: Map<string, string>) => [...map].sort(([a], [b]) => a.localeCompare(b));
const rows = (q: { returned: number }[]) => q.reduce((s, x) => s + x.returned, 0);
const run = async (tables: Tables, cap: number, load: (c: never) => Promise<unknown>) => {
  const fake = fakeSupabase(tables, cap);
  const data = await load(fake.client as never);
  return { data: data as Awaited<ReturnType<typeof loadCompletedTrainingData>>, queries: fake.queries };
};

describe("Training loader: same data with fewer requests", () => {
  it.each([1000, 250, 60])("full history is identical to the previous loader (server cap %i)", async cap => {
    const tables = dataset({ days: 400, completed: 300, perSession: 3, setsPerExercise: 4 });
    const before = await run(tables, cap, c => legacyLoad(c, USER));
    const after = await run(tables, cap, c => loadCompletedTrainingData({ supabase: c, userId: USER }));
    expect(after.data.sets.length).toBeGreaterThan(2000);
    expect(after.data.sessions).toEqual(before.data.sessions);
    expect(after.data.sessionExercises).toEqual(before.data.sessionExercises);
    expect(after.data.sets).toEqual(before.data.sets);
    expect(sorted(after.data.dateByDayLog)).toEqual(sorted(before.data.dateByDayLog));
    // Same-date sessions keep the previous order (ended_at desc, id asc), which records rely on.
    expect(after.data.sessions.map(s => s.id)).toEqual(before.data.sessions.map(s => s.id));
    // No day_logs read and no trailing empty page: each table ends on its exact count.
    expect(after.queries.some(q => q.table === "day_logs")).toBe(false);
    expect(after.queries.every(q => q.returned > 0)).toBe(true);
    expect(after.queries.length).toBeLessThan(before.queries.length);
  });
  it("an empty history and a history with no completed session read only the sessions", async () => {
    for (const tables of [dataset({ days: 0, completed: 0, perSession: 0, setsPerExercise: 0 }), { workout_sessions: [], workout_session_exercises: [], workout_sets: [], day_logs: [] }]) {
      tables.workout_sessions = tables.workout_sessions.filter(s => s.status !== "completed" || s.user_id !== USER);
      const before = await run(tables, 1000, c => legacyLoad(c, USER));
      const after = await run(tables, 1000, c => loadCompletedTrainingData({ supabase: c, userId: USER }));
      expect(after.data).toEqual(before.data);
      expect(after.queries.map(q => q.table)).toEqual(["workout_sessions"]);
    }
  });
  it("a server cap below the page size still reads every row: the count, not a short page, ends the read", async () => {
    const read = (cap: number, total: number) => {
      const all = Array.from({ length: total }, (_, i) => i);
      return readAllTrainingRows("x", (from, to) => Promise.resolve({ data: all.slice(from, Math.min(to + 1, from + cap)), error: null, count: from === 0 ? total : null }));
    };
    await expect(read(1000, 1947)).resolves.toHaveLength(1947);
    await expect(read(300, 1947)).resolves.toHaveLength(1947);
    await expect(read(1000, 0)).resolves.toEqual([]);
    // Without a count (an older server or a caller that does not ask), only an empty page ends it.
    const pages: number[] = [];
    const all = Array.from({ length: 1500 }, (_, i) => i);
    await readAllTrainingRows("x", (from, to) => { pages.push(from); return Promise.resolve({ data: all.slice(from, to + 1), error: null }); });
    expect(pages).toEqual([0, 1000, 1500]);
  });

  it("sessions only give the same training days for Etapas, without exercises or sets", async () => {
    const tables = dataset({ days: 400, completed: 300, perSession: 3, setsPerExercise: 4 });
    const full = await run(tables, 1000, c => legacyLoad(c, USER));
    const light = await run(tables, 1000, c => loadCompletedTrainingData({ supabase: c, userId: USER }, { sessionsOnly: true }));
    const dates = (data: typeof full.data) => (trainingLoadSamples(data).get("training.load.sessions") ?? []).map(s => s.date);
    expect(dates(light.data)).toEqual(dates(full.data));
    expect(light.queries.map(q => q.table)).toEqual(["workout_sessions"]);
  });
  it("reproducible scenario sized like the main account: requests and rows per endpoint", async () => {
    // ~80 days, 100 completed sessions, ~5 exercises and ~3 sets each (29/10/2026 volumes).
    const tables = dataset({ days: 80, completed: 100, perSession: 5, setsPerExercise: 3 });
    const measure = async (load: (c: never) => Promise<unknown>) => { const r = await run(tables, 1000, load); return { requests: r.queries.length, rows: rows(r.queries) }; };
    const table = {
      // Resumen, Entrenamiento, Detalle, récords de Inicio, Explorar, Vistas, Influencia e Insight.
      "Historia completa": [await measure(c => legacyLoad(c, USER)), await measure(c => loadCompletedTrainingData({ supabase: c, userId: USER }))],
      "Etapas": [await measure(c => legacyLoad(c, USER)), await measure(c => loadCompletedTrainingData({ supabase: c, userId: USER }, { sessionsOnly: true }))],
    };
    if (process.env.MEASURE) console.log(JSON.stringify(table, null, 1));
    for (const [before, after] of Object.values(table)) {
      expect(after.requests).toBeLessThan(before.requests);
      expect(after.rows).toBeLessThanOrEqual(before.rows);
    }
    expect(table["Etapas"][1].requests).toBe(1);
  });
});
