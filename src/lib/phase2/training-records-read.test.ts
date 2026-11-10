import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { loadTrainingRecordsData, trainingRecordsSource, type TrainingRecordsRead } from "./training-robust";

const MIGRATION = "supabase/migrations/20261030235611_training_records_read_expand.sql";
const MIGRATION_V2 = "supabase/migrations/20261110120000_training_records_read_v2_expand.sql";
const read: TrainingRecordsRead = {
  sessions: [{ id: "s1", day_log_id: "d1", status: "completed", started_at: "2026-09-10T10:00:00Z", ended_at: "2026-09-10T11:00:00Z",
    routine_id: null, routine_name_snapshot: null, session_name: null, day: { log_date: "2026-09-10" } } as never],
  exercises: [{ id: "x1", workout_session_id: "s1", exercise_id: "bench", is_completed: true, nombre_snapshot: "Press banca",
    grupo_muscular_snapshot: "pecho", muscle_group_label_snapshot: null, weight_mode_snapshot: "Peso total", implement_snapshot: "Barra",
    configuration_kind: "recorded", configuration_label: "Agarre Cerrado" } as never],
  sets: [{ id: "t1", workout_session_exercise_id: "x1", is_completed: true, actual_reps: 8, actual_weight_kg: 60 } as never],
  history: [{ exercise_id: "bench", weight_mode_snapshot: "Peso total", implement_snapshot: "Barra", configuration_kind: "recorded", configuration_label: "agarre cerrado", load: 60, reps: 10 },
    { exercise_id: "bench", weight_mode_snapshot: " por  Mancuerna", implement_snapshot: "Mancuernas", configuration_kind: "not_applicable", configuration_label: null, load: 30, reps: 12 }],
};

/** A Supabase client whose RPC answers `rpc` and whose paged tables are empty (the fallback read). */
function client(rpc: { data: unknown; error: { code: string; message: string } | null }) {
  const tables: string[] = [];
  const page = { data: [], error: null, count: 0 };
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "range", "returns"]) chain[method] = () => chain;
  chain.then = (resolve: (value: typeof page) => unknown) => Promise.resolve(page).then(resolve);
  const supabase = { rpc: vi.fn(async () => rpc), from: vi.fn((table: string) => { tables.push(table); return chain; }) };
  return { context: { userId: "owner", supabase } as never, supabase, tables };
}

describe("Home's records read", () => {
  it("keeps the window rows and dates older history the day before the window, one exercise and one set per aggregate", () => {
    const source = trainingRecordsSource(read, "2026-09-01");
    expect(source.sessions.map(session => session.id)).toEqual(["s1", "record-history"]);
    expect(source.sessions[0]).not.toHaveProperty("day");
    expect(source.dateByDayLog).toEqual(new Map([["d1", "2026-09-10"], ["record-history", "2026-08-31"]]));
    expect(source.sessions[1]).toMatchObject({ status: "completed", ended_at: "2026-08-31T00:00:00Z" });
    expect(source.sessionExercises.slice(1)).toMatchObject([
      { workout_session_id: "record-history", exercise_id: "bench", is_completed: true, weight_mode_snapshot: "Peso total" },
      { workout_session_id: "record-history", exercise_id: "bench", is_completed: true, weight_mode_snapshot: " por  Mancuerna" }]);
    expect(source.sets.slice(1)).toMatchObject([{ is_completed: true, actual_reps: 10, actual_weight_kg: 60 }, { is_completed: true, actual_reps: 12, actual_weight_kg: 30 }]);
    expect(trainingRecordsSource({ ...read, history: [] }, "2026-09-01").sessions).toHaveLength(1);
  });
  it("P1-C2: carries the implement and the variant identity of window rows and aggregates, never the stored columns", () => {
    const source = trainingRecordsSource(read, "2026-09-01");
    expect(source.sessionExercises[0]).not.toHaveProperty("configuration_kind");
    expect(source.sessionExercises[0]).not.toHaveProperty("configuration_label");
    expect(source.sessionExercises.map(row => row.implement_snapshot)).toEqual(["Barra", "Barra", "Mancuernas"]);
    expect(source.configurations).toEqual(new Map([["x1", "recorded:agarre cerrado"], ["record-history-0", "recorded:agarre cerrado"], ["record-history-1", "not_applicable"]]));
    // A v1-shaped answer (no implement, no variant) knows no variant: nothing is assumed.
    const v1 = trainingRecordsSource({ ...read, exercises: read.exercises.map(row => ({ ...row, configuration_kind: undefined, configuration_label: undefined }) as never),
      history: read.history.map(({ exercise_id, weight_mode_snapshot, load, reps }) => ({ exercise_id, weight_mode_snapshot, load, reps })) }, "2026-09-01");
    expect(v1.configurations).toEqual(new Map());
    expect(v1.sessionExercises.slice(1).map(row => row.implement_snapshot)).toEqual([null, null]);
  });
  it("calls the RPC from the window's first day", async () => {
    const { context, supabase, tables } = client({ data: read, error: null });
    const source = await loadTrainingRecordsData(context, "2026-09-01");
    expect(supabase.rpc).toHaveBeenCalledWith("mobile_read_training_records_v2", { p_from: "2026-09-01" });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(tables).toEqual([]);
    expect(source.sessions).toHaveLength(2);
  });
  it("falls back to the narrow paged read only while the function does not exist", async () => {
    const missing = client({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    expect(await loadTrainingRecordsData(missing.context, "2026-09-01")).toMatchObject({ sessions: [], sets: [] });
    expect(missing.tables).toEqual(["workout_sessions"]);
    // Never v1 as a fallback: without implement and variant every comparison would read as unknown.
    expect(missing.supabase.rpc).toHaveBeenCalledTimes(1);
    const failed = client({ data: null, error: { code: "57014", message: "canceling statement" } });
    await expect(loadTrainingRecordsData(failed.context, "2026-09-01")).rejects.toThrow("Leer récords");
    expect(failed.tables).toEqual([]);
    await expect(loadTrainingRecordsData(client({ data: { sessions: [] }, error: null }).context, "2026-09-01")).rejects.toThrow("respuesta inválida");
  });
  it("keeps the RPC invoker-scoped, owner-filtered, read-only and reversible", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toContain("stable security invoker set search_path=''");
    expect(sql).not.toContain("security definer");
    expect(sql).toContain("u uuid := (select auth.uid())");
    expect(sql).toContain("errcode='PT401'");
    for (const owned of ["s.user_id = u", "x.user_id = u", "t.user_id = u", "d.user_id = u"]) expect(sql).toContain(owned);
    // The record rule's own filters on older history.
    expect(sql).toContain("s.status = 'completed' and s.ended_at is not null");
    expect(sql).toContain("t.is_completed and t.actual_reps > 0");
    expect(sql).toContain("t.actual_weight_kg > 0 and t.actual_weight_kg < 'Infinity'::numeric");
    expect(sql).toContain("group by x.exercise_id, x.weight_mode_snapshot, t.actual_weight_kg");
    expect(sql).not.toMatch(/\b(insert|update|delete)\s+(into|from)?\s*public\./i);
    expect(sql).not.toMatch(/create (unique )?index|alter table|create policy/i);
    expect(sql).toContain("revoke all on function public.mobile_read_training_records(date) from public, anon;");
    expect(sql).toContain("grant execute on function public.mobile_read_training_records(date) to authenticated;");
    expect(sql).toContain("drop function if exists public.mobile_read_training_records(date);");
  });
  it("P1-C2: v2 is a new invoker-scoped, owner-filtered, read-only and reversible function; v1 stays as it was", () => {
    const sql = readFileSync(MIGRATION_V2, "utf8");
    expect(sql).toContain("create function public.mobile_read_training_records_v2(p_from date)");
    expect(sql).not.toMatch(/(create or replace|drop|alter) function public\.mobile_read_training_records\(/i);
    expect(sql).toContain("stable security invoker set search_path=''");
    expect(sql).not.toContain("security definer");
    expect(sql).toContain("u uuid := (select auth.uid())");
    expect(sql).toContain("errcode='PT401'");
    for (const owned of ["s.user_id = u", "x.user_id = u", "t.user_id = u", "d.user_id = u", "c.user_id = u"]) expect(sql).toContain(owned);
    // Window rows: implement and the variant as stored, left-joined (unknown stays null).
    expect(sql).toContain("x.weight_mode_snapshot, x.implement_snapshot,");
    expect(sql).toContain("left join public.workout_session_exercise_configurations c on c.session_exercise_id = x.id and c.user_id = u");
    // Older history: the record rule's filters, and only aggregates whose implement and variant are known.
    expect(sql).toContain("s.status = 'completed' and s.ended_at is not null");
    expect(sql).toContain("t.is_completed and t.actual_reps > 0");
    expect(sql).toContain("t.actual_weight_kg > 0 and t.actual_weight_kg < 'Infinity'::numeric");
    expect(sql).toContain("join public.workout_session_exercise_configurations c on c.session_exercise_id = x.id and c.user_id = u and c.kind is not null");
    expect(sql).toContain("nullif(btrim(x.implement_snapshot), '') is not null");
    expect(sql).toContain("group by x.exercise_id, x.weight_mode_snapshot, x.implement_snapshot, c.kind, c.label, t.actual_weight_kg");
    expect(sql).not.toMatch(/\b(insert|update|delete)\s+(into|from)?\s*public\./i);
    expect(sql).not.toMatch(/create (unique )?index|alter table|create policy/i);
    expect(sql).toContain("revoke all on function public.mobile_read_training_records_v2(date) from public, anon;");
    expect(sql).toContain("grant execute on function public.mobile_read_training_records_v2(date) to authenticated;");
    expect(sql).toContain("drop function if exists public.mobile_read_training_records_v2(date);");
  });
});
