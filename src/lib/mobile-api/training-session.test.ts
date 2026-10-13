import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkoutSessionDetail } from "../phase2/types";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";
import { handleMobileAuthenticatedResourceRequest, handleMobileMutationRequest, MobileApiUnauthorizedError } from "./auth";
import { parseSessionSave, parseSessionAdd, parseSessionRemove, parseSessionCancel, sessionDetailDto } from "./training-session";

const mocks = vi.hoisted(() => ({ detail: vi.fn(), history: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../phase2/training-robust", () => ({ getWorkoutSessionDetail: mocks.detail, listRecentRobustExerciseHistoryByExercise: mocks.history }));
import { readMobileSession, readMobileSessionExercise, saveMobileSessionExercise, addMobileSessionExercise, removeMobileSessionExercise, cancelMobileSession } from "./training-session-server";

const sessionId = "33300000-0000-4000-8000-000000000001";
const exerciseId = "33300000-0000-4000-8000-000000000002";
const relationId = "33300000-0000-4000-8000-000000000003";
const timestamp = "2026-09-29T12:00:00.123456+00:00";
const payload = {
  isCompleted: true, decision: "maintain", decisionNote: "", applyToRoutine: false, notes: "session note",
  sets: [{ setNumber: 1, targetReps: 8, targetWeightKg: 0, targetRir: 0,
    actualReps: 0, actualWeightKg: null, isCompleted: true, notes: null }],
};
const catalog = {
  name: "NEW", muscleGroup: "pecho", muscleGroupLabel: null, implement: null, weightMode: null,
  suggestedSets: 1, suggestedReps: null, suggestedWeight: null, suggestedRir: null,
  suggestedRestMinSeconds: null, suggestedRestMaxSeconds: null, notes: null,
};
const domainPayload = parseSessionSave({ expectedUpdatedAt: timestamp, payload }).payload;
const detail = {
  session: { id: sessionId, routine_id: null, routine_name_snapshot: "OLD ROUTINE", session_name: "SESSION", status: "in_progress",
    started_at: timestamp, ended_at: null, updated_at: timestamp,
    energy_level: null, performance_level: null, pain_level: null, pain_note: null,
    treadmill_minutes: null, treadmill_distance_km: null, treadmill_speed_kmh: null, treadmill_incline_percent: null, notes: null },
  routineColor: null, logDate: "2026-09-29",
  exercises: [{ id: relationId, exercise_id: exerciseId, routine_exercise_id: null, exercise_order: 3,
    nombre_snapshot: "OLD NAME", grupo_muscular_snapshot: "pecho", muscle_group_label_snapshot: null,
    implement_snapshot: "OLD IMPLEMENT", weight_mode_snapshot: null, rest_min_seconds_snapshot: 90, rest_max_seconds_snapshot: 120,
    next_adjustment_snapshot: "increase_reps", next_adjustment_note_snapshot: null, updated_at: timestamp,
    decision: "maintain", decision_note: null, apply_to_routine: false, notes: "session note", sets: domainPayload.sets }],
} as WorkoutSessionDetail;
function context(rpc = vi.fn(), from = vi.fn()): MobileSupabaseAuthenticatedContext {
  return { userId: "owner", supabase: { rpc, from } } as unknown as MobileSupabaseAuthenticatedContext;
}
const performance = { requestKind: "navigation" as const };
const request = <T>(operation: () => Promise<T>) => handleMobileMutationRequest("Bearer token", { authenticate: async () => context(), mutate: operation });

describe("M3.3B active session codecs", () => {
  it("preserves opaque microseconds, zero vs missing, and the complete exercise CAS payload", () => {
    expect(parseSessionSave({ expectedUpdatedAt: timestamp, payload })).toEqual({ expectedUpdatedAt: timestamp, payload: domainPayload });
    expect(domainPayload.sets[0]).toMatchObject({ actual_reps: 0, actual_weight_kg: null, target_rir: 0 });
    expect(() => parseSessionSave({ expectedUpdatedAt: "2026-02-30T12:00:00Z", payload })).toThrow();
    expect(() => parseSessionSave({ expectedUpdatedAt: timestamp, payload, userId: "other" })).toThrow();
    expect(() => parseSessionSave({ expectedUpdatedAt: timestamp, payload: { ...payload, sets: [{ ...payload.sets[0], actualRir: 2 }] } })).toThrow();
  });
  it("projects blank appended sets and absent rest without fallback to catalog suggestions", () => {
    const set = { set_number: 1, target_reps: null, target_weight_kg: null, target_rir: null, actual_reps: null, actual_weight_kg: null, is_completed: false, notes: null };
    const source = { ...detail, exercises: [{ ...detail.exercises[0], rest_min_seconds_snapshot: null, rest_max_seconds_snapshot: null,
      next_adjustment_snapshot: "maintain" as const, is_completed: false, notes: null, sets: [set] }] } as WorkoutSessionDetail;
    const row = sessionDetailDto(source, { status: "ok", data: {} }).exercises[0];
    expect(row).toMatchObject({ restMinSecondsSnapshot: null, restMaxSecondsSnapshot: null, payload: {
      isCompleted: false, decision: "maintain", applyToRoutine: false, sets: [{ setNumber: 1, targetReps: null, targetWeightKg: null, targetRir: null,
        actualReps: null, actualWeightKg: null, isCompleted: false }] } });
    expect(parseSessionSave({ expectedUpdatedAt: timestamp, payload: row.payload }).payload.sets).toEqual([set]);
  });
  it("projects extras opt-in only for adopting clients and preserves linked semantics", () => {
    const source = { ...detail, exercises: [{ ...detail.exercises[0], add_to_routine_on_finish: true }] };
    expect(sessionDetailDto(source, { status: "unavailable" }).exercises[0].payload.applyToRoutine).toBe(false);
    expect(sessionDetailDto(source, { status: "unavailable" }, true).exercises[0].payload.applyToRoutine).toBe(true);
    source.exercises[0].routine_exercise_id = exerciseId;
    expect(sessionDetailDto(source, { status: "unavailable" }, true).exercises[0].payload.applyToRoutine).toBe(false);
  });
  it("validates recursive runtime types, completion invariants and set numbering", () => {
    for (const invalid of [
      { ...payload, isCompleted: false }, { ...payload, applyToRoutine: "true" },
      { ...payload, decision: "custom", decisionNote: " " },
      { ...payload, sets: [] }, { ...payload, sets: [{ ...payload.sets[0], actualReps: null }] },
      { ...payload, sets: [{ ...payload.sets[0], actualReps: "8" }] },
      { ...payload, sets: [{ ...payload.sets[0], setNumber: 2 }] },
      { ...payload, sets: [{ ...payload.sets[0], targetRir: 11 }] },
      { ...payload, sets: [{ ...payload.sets[0], actualWeightKg: 1.234 }] },
    ]) expect(() => parseSessionSave({ expectedUpdatedAt: timestamp, payload: invalid })).toThrow();
  });
  it("normalizes storage-equivalent empty notes and decisions for response-lost equality", () => {
    const parsed = parseSessionSave({ expectedUpdatedAt: timestamp, payload: {
      ...payload, decision: "custom", decisionNote: " reminder ", sets: [{ ...payload.sets[0], notes: "" }],
    } });
    expect(parsed.payload.decision_note).toBe("reminder");
    expect(parsed.payload.sets[0].notes).toBeNull();
  });
  it("rejects arbitrary ownership and fields in every structural operation", () => {
    expect(parseSessionAdd({ operation: "create_and_add", exercise: catalog, idempotencyKey: "create:1" }).operation).toBe("create_and_add");
    for (const operation of [
      () => parseSessionAdd({ operation: "add_existing", exerciseId, idempotencyKey: "add:1", userId: "other" }),
      () => parseSessionAdd({ operation: "create_and_add", exercise: { ...catalog, user_id: "other" }, idempotencyKey: "create:1" }),
      () => parseSessionRemove({ expectedUpdatedAt: timestamp, idempotencyKey: "remove:1", userId: "other" }),
      () => parseSessionCancel({ idempotencyKey: "cancel:1", metadata: {} }),
    ]) expect(operation).toThrow();
  });
});
describe("M3.3B Bearer server adapters", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.detail.mockResolvedValue(detail); mocks.history.mockResolvedValue({ [exerciseId]: [] }); });
  it("keeps auxiliary history failure independent and snapshots intact", async () => {
    mocks.history.mockRejectedValue(new Error("offline"));
    const ctx = context();
    const result = await readMobileSession(sessionId, ctx, performance);
    expect(result.quickHistory).toEqual({ status: "unavailable" });
    expect(result.exercises[0]).toMatchObject({ id: relationId, order: 3, nameSnapshot: "OLD NAME", restMaxSecondsSnapshot: 120, updatedAt: timestamp });
    expect(mocks.detail).toHaveBeenCalledWith(sessionId, expect.objectContaining({ userId: "owner", supabase: ctx.supabase }));
    expect(mocks.history).toHaveBeenCalledWith({ exerciseIds: [exerciseId], limitPerExercise: 6 }, expect.objectContaining({ userId: "owner" }));
    expect(await readMobileSession(sessionId, ctx, performance)).toMatchObject({ session: { metadata: { painLevel: null } } });
  });
  it("distinguishes an empty history from unavailable and skips history for closed sessions", async () => {
    expect((await readMobileSession(sessionId, context(), performance)).quickHistory).toEqual({ status: "ok", data: { [exerciseId]: [] } });
    mocks.detail.mockResolvedValue({ ...detail, session: { ...detail.session, status: "completed" } });
    const result = await readMobileSession(sessionId, context(), performance);
    expect(result.session.status).toBe("completed");
    expect(mocks.history).toHaveBeenCalledTimes(1);
  });
  it("keeps history serialization failures independent from the operational detail", async () => {
    mocks.history.mockResolvedValue({ [exerciseId]: [null] });
    const result = await readMobileSession(sessionId, context(), performance);
    expect(result.exercises).toHaveLength(1);
    expect(result.quickHistory).toEqual({ status: "unavailable" });
  });
  it("returns real 404 for absent/foreign detail, 503 for query failure, 401 for rejected Bearer", async () => {
    const read = () => readMobileSession(sessionId, context(), performance);
    const handle = () => handleMobileAuthenticatedResourceRequest("Bearer token", { authenticate: async () => context(), read });
    mocks.detail.mockResolvedValue(null);
    expect(await handle()).toMatchObject({ status: 404, body: { error: "NOT_FOUND" } });
    mocks.detail.mockRejectedValue(new Error("database unavailable"));
    expect(await handle()).toEqual({ status: 503, body: { error: "DATA_UNAVAILABLE" } });
    expect(await handleMobileAuthenticatedResourceRequest("Bearer bad", { authenticate: async () => { throw new MobileApiUnauthorizedError(); }, read }))
      .toEqual({ status: 401, body: { error: "UNAUTHORIZED" } });
  });
  it("reads status, payload and version in one scoped query without false removed on errors", async () => {
    const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder);
    const from = vi.fn().mockReturnValue(builder);
    builder.maybeSingle.mockResolvedValue({ data: { status: "in_progress", exercises: detail.exercises }, error: null });
    expect(await readMobileSessionExercise(sessionId, relationId, context(undefined, from))).toEqual({ status: "active", updatedAt: timestamp, payload });
    expect(builder.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(builder.eq).toHaveBeenCalledWith("exercises.id", relationId);
    builder.maybeSingle.mockResolvedValue({ data: { status: "in_progress", exercises: [] }, error: null });
    expect(await readMobileSessionExercise(sessionId, relationId, context(undefined, from))).toEqual({ status: "removed" });
    builder.maybeSingle.mockResolvedValue({ data: { status: "completed", exercises: [] }, error: null });
    expect(await readMobileSessionExercise(sessionId, relationId, context(undefined, from))).toEqual({ status: "session_closed", sessionStatus: "completed" });
    builder.maybeSingle.mockResolvedValue({ data: null, error: { code: "network" } });
    await expect(readMobileSessionExercise(sessionId, relationId, context(undefined, from))).rejects.toThrow("unavailable");
    builder.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await handleMobileAuthenticatedResourceRequest("Bearer token", { authenticate: async () => context(undefined, from),
      read: (ctx) => readMobileSessionExercise(sessionId, relationId, ctx) })).toMatchObject({ status: 404 });
  });
  it("uses the v2 CAS writer only on explicit adoption, with no retry or fallback", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: timestamp, error: null });
    await saveMobileSessionExercise(sessionId, relationId, { expectedUpdatedAt: timestamp, payload: { ...payload, applyToRoutine: true } }, context(rpc), true);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("mobile_save_workout_exercise_v2", { p_session_id: sessionId, p_session_exercise_id: relationId, p_expected_updated_at: timestamp, p_payload: { ...domainPayload, apply_to_routine: true } });
    rpc.mockClear().mockResolvedValue({ data: null, error: { code: "PGRST202", message: "RPC missing" } });
    await expect(saveMobileSessionExercise(sessionId, relationId, { expectedUpdatedAt: timestamp, payload }, context(rpc), true)).rejects.toThrow("unavailable");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("keeps read-back coherent with the opt-in and does not require the new column for old requests", async () => {
    const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder);
    const from = vi.fn().mockReturnValue(builder);
    builder.maybeSingle.mockResolvedValue({ data: { status: "in_progress", exercises: [{ ...detail.exercises[0], add_to_routine_on_finish: true }] }, error: null });
    const result = await readMobileSessionExercise(sessionId, relationId, context(undefined, from), true);
    expect(result).toMatchObject({ status: "active", updatedAt: timestamp, payload: { applyToRoutine: true } });
    expect(builder.select).toHaveBeenLastCalledWith(expect.stringContaining("add_to_routine_on_finish"));
    await readMobileSessionExercise(sessionId, relationId, context(undefined, from));
    expect(builder.select).toHaveBeenLastCalledWith(expect.not.stringContaining("add_to_routine_on_finish"));
  });
  it("sends one association-bound CAS write and exposes stable errors", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: timestamp, error: null });
    expect(await saveMobileSessionExercise(sessionId, relationId, { expectedUpdatedAt: timestamp, payload }, context(rpc)))
      .toEqual({ sessionExerciseId: relationId, updatedAt: timestamp });
    expect(rpc).toHaveBeenCalledWith("mobile_save_workout_exercise", { p_session_id: sessionId, p_session_exercise_id: relationId, p_expected_updated_at: timestamp, p_payload: domainPayload });
    for (const [code, status, message] of [
      ["SESSION_EXERCISE_CHANGED", 409, "40001"], ["SESSION_CLOSED", 409, "P0001"],
      ["SESSION_EXERCISE_REMOVED", 409, "P0001"], ["TRAINING_SESSION_NOT_FOUND", 404, "P0002"],
    ] as const) {
      rpc.mockResolvedValue({ data: null, error: { message: code, code: message } });
      expect(await request(() => saveMobileSessionExercise(sessionId, relationId, { expectedUpdatedAt: timestamp, payload }, context(rpc))))
        .toMatchObject({ status, body: { error: status === 404 ? "NOT_FOUND" : code } });
    }
  });
  it("does not repeat an ambiguous save and lets read-back identify the committed payload", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "57014" } });
    expect(await request(() => saveMobileSessionExercise(sessionId, relationId, { expectedUpdatedAt: timestamp, payload }, context(rpc))))
      .toEqual({ status: 503, body: { error: "DATA_UNAVAILABLE" } });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(sessionDetailDto(detail, { status: "unavailable" }).exercises[0].payload).toEqual(payload);
  });
  it.each([false, true])("reuses the exact structural result on first call/replay=%s", async (replayed) => {
    const body = { status: "added", sessionId, sessionExerciseId: relationId, exerciseId };
    const rpc = vi.fn().mockResolvedValue({ data: [{ response_status: 201, response_body: body, replayed }], error: null });
    const ctx = context(rpc);
    expect(await addMobileSessionExercise(sessionId, { operation: "add_existing", exerciseId, idempotencyKey: "add:1" }, ctx)).toEqual(body);
    expect(await addMobileSessionExercise(sessionId, { operation: "create_and_add", exercise: catalog, idempotencyKey: "create:1" }, ctx)).toEqual(body);
    expect(rpc).toHaveBeenLastCalledWith("mobile_mutate_workout_session", expect.objectContaining({ p_operation: "create_and_add", p_exercise: catalog }));
    const removed = { status: "removed", sessionId, sessionExerciseId: relationId };
    rpc.mockResolvedValue({ data: [{ response_status: 200, response_body: removed, replayed }], error: null });
    expect(await removeMobileSessionExercise(sessionId, relationId, { expectedUpdatedAt: timestamp, idempotencyKey: "remove:1" }, ctx)).toEqual(removed);
    expect(rpc).toHaveBeenLastCalledWith("mobile_mutate_workout_session", { p_session_id: sessionId, p_operation: "remove", p_session_exercise_id: relationId, p_expected_updated_at: timestamp, p_idempotency_key: "remove:1" });
    const cancelled = { status: "cancelled", sessionId };
    rpc.mockResolvedValue({ data: [{ response_status: 200, response_body: cancelled, replayed }], error: null });
    expect(await cancelMobileSession(sessionId, { idempotencyKey: "cancel:1" }, ctx)).toEqual(cancelled);
  });
  it("rejects ledger mismatch and validates database responses as server failures", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "IDEMPOTENCY_KEY_REUSED" } });
    expect(await request(() => cancelMobileSession(sessionId, { idempotencyKey: "key" }, context(rpc)))).toMatchObject({ status: 409, body: { error: "IDEMPOTENCY_KEY_REUSED" } });
    rpc.mockResolvedValue({ data: [{ response_status: 201, response_body: { status: "added", sessionId, sessionExerciseId: "invalid", exerciseId }, replayed: false }], error: null });
    expect(await request(() => addMobileSessionExercise(sessionId, { operation: "add_existing", exerciseId, idempotencyKey: "key" }, context(rpc)))).toMatchObject({ status: 503 });
    rpc.mockResolvedValue({ data: "bad version", error: null });
    expect(await request(() => saveMobileSessionExercise(sessionId, relationId, { expectedUpdatedAt: timestamp, payload }, context(rpc)))).toMatchObject({ status: 503 });
  });
});

const sql = readFileSync("supabase/migrations/20260929220000_mobile_active_session_expand.sql", "utf8");
function sqlFunction(name: string) {
  const match = sql.match(new RegExp(`create(?: or replace)? function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`));
  expect(match, name).not.toBeNull(); return match![0];
}
describe("M3.3B shared SQL concurrency/security contract", () => {
  it("normalizes only intentional Mobile CAS conflicts to PostgREST 409", () => {
    const fix = readFileSync("supabase/migrations/20260930030000_mobile_active_session_conflict_status.sql", "utf8");
    expect(fix).toContain("when serialization_failure then");
    expect(fix).toContain("sqlerrm = ''SESSION_EXERCISE_CHANGED''");
    expect(fix).toContain("errcode = ''PT409''");
    expect(fix).toContain("public.mobile_save_workout_exercise(uuid,uuid,timestamptz,jsonb)");
    expect(fix).toContain("public.mobile_mutate_workout_session(uuid,text,text,uuid,timestamptz,uuid,jsonb)");
    expect(fix).not.toMatch(/create table|add column|service_role|p_user_id/);
  });
  it("uses one existing user lock and parent-first order in shared Web/Mobile primitives", () => {
    const lock = sqlFunction("lock_active_workout_session");
    expect(lock.indexOf("lock_training_user_mutations()")).toBeLessThan(lock.indexOf("for update"));
    expect(lock).toContain("user_id = v_user_id");
    for (const name of ["save_workout_exercise", "append_workout_exercise", "remove_workout_exercise", "cancel_workout_session", "mobile_save_workout_exercise"]) {
      const body = sqlFunction(name);
      expect(body).toContain("lock_active_workout_session");
      expect(body).toContain("security invoker");
      if (body.includes("for update")) expect(body.indexOf("lock_active_workout_session")).toBeLessThan(body.indexOf("for update"));
    }
    const finish = readFileSync("supabase/migrations/20260928140340_mobile_routine_editor_start_expand.sql", "utf8")
      .split("create or replace function public.finish_workout_session(")[1].split("\n$$;")[0];
    expect(finish.indexOf("lock_training_user_mutations()")).toBeLessThan(finish.indexOf("for update"));
    expect(sql).not.toMatch(/create table|add column|update public\.routine_exercises/);
  });
  it("keeps CAS opaque and strictly advancing and protects remove from unseen versions", () => {
    expect(sqlFunction("save_workout_exercise")).toContain("v_row.updated_at is distinct from p_expected_updated_at");
    expect(sqlFunction("remove_workout_exercise")).toContain("v_version is distinct from p_expected_updated_at");
    expect(sqlFunction("set_workout_exercise_updated_at")).toContain("old.updated_at + interval '1 microsecond'");
    expect(sql).toContain("clock_timestamp()");
    expect(sqlFunction("save_workout_exercise")).toContain("ownlevel.workout_save_mode");
    expect(sqlFunction("mobile_save_workout_exercise")).toContain("workout_session_id = p_session_id and user_id = v_user_id");
  });
  it("scopes/replays structural intents and atomically composes existing create + append", () => {
    const body = sqlFunction("mobile_mutate_workout_session");
    expect(body.indexOf("lock_training_user_mutations()")).toBeLessThan(body.indexOf("for update"));
    expect(body).toContain("where user_id = v_user_id and operation = v_operation and idempotency_key = p_idempotency_key");
    expect(body.indexOf("v_ledger.state = 'completed'")).toBeLessThan(body.indexOf("perform public.lock_active_workout_session"));
    expect(body).toContain("v_ledger.response_status, v_ledger.response_body, true");
    expect(body).toContain("public.mobile_create_training_exercise(");
    expect(body).toContain("public.append_workout_exercise(");
    expect(body).not.toContain("exception when others");
    expect(body).toContain("security definer");
    expect(sql).toContain("Expected catalog ledger primitive not found");
    expect(sql).toContain("extensions.digest(");
    expect(sql).not.toContain("p_user_id");
    expect(sql).not.toContain("service_role");
    expect(sql).toContain("revoke all on function public.mobile_mutate_workout_session(uuid,text,text,uuid,timestamptz,uuid,jsonb) from public, anon");
    expect(sql).toContain("grant execute on function public.mobile_mutate_workout_session(uuid,text,text,uuid,timestamptz,uuid,jsonb) to authenticated");
  });
  it("adopts shared remove/cancel in Web rather than leaving a separate read/check/delete race", () => {
    expect(readFileSync("src/lib/phase2/training.ts", "utf8")).toContain('supabase.rpc("remove_workout_exercise"');
    expect(readFileSync("src/lib/phase2/training-robust.ts", "utf8")).toContain('supabase.rpc("cancel_workout_session"');
    expect(readFileSync("src/app/(app)/train/session/[id]/session-editor.tsx", "utf8")).toContain('formData.set("expected_updated_at", serverVersionsRef.current[exerciseId])');
    expect(readFileSync("src/app/(app)/train/session/[id]/session-editor.tsx", "utf8"))
      .toContain('getErrorCategory(exerciseId) === "conflict"');
  });
});

// Step 2 must preserve the shared security/locking prefix and structure CAS.
describe("active-session blank append migration", () => {
  const migration = readFileSync("supabase/migrations/20261013231609_active_session_append_empty_sets.sql", "utf8");
  it("retains ownership, source validation, active-session lock and duplicate checks verbatim", () => {
    const original = sqlFunction("append_workout_exercise");
    const checks = original.slice(original.indexOf("begin\n"), original.indexOf("  v_sets :="));
    expect(migration).toContain(checks);
    expect(migration).toContain("security invoker\nset search_path = ''");
    expect(migration).toContain("where id = p_session_id and user_id = v_user_id;");
    expect(migration).toContain("revoke all on function public.append_workout_exercise(uuid,uuid,text) from public, anon");
    expect(migration).toContain("grant execute on function public.append_workout_exercise(uuid,uuid,text) to authenticated");
    expect(migration).not.toMatch(/create table|add column|security definer|p_user_id|service_role/);
  });
});
