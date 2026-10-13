import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MobileApiConflictError, MobileApiNotFoundError, MobileApiUnauthorizedError, MobileApiValidationError } from "./auth";
import {
  encodeTrainingHistoryCursor, parseMobileTrainingDate, parseSessionCorrection, parseSessionFinish, parseSessionFinishedResponse,
  parseTrainingHistoryCursor, parseTrainingHistoryLimit, sessionCorrectionDomainPayload, sessionFinishDomainMetadata,
} from "./training-session";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";
import type { CompletedSessionSummary } from "../phase2/types";

const mocks = vi.hoisted(() => ({ readAuth: vi.fn(), writeAuth: vi.fn(), history: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: mocks.readAuth, authenticateMobileMutationAccessToken: mocks.writeAuth }));
vi.mock("../phase2/training-robust", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../phase2/training-robust")>()), listCompletedSessionHistory: mocks.history,
}));
import { correctMobileSession, discardMobileSession, finishMobileSession, listMobileTrainingHistory, readMobileTrainingDay } from "./training-session-server";
import { POST as finishPOST } from "../../app/api/mobile/v1/training/sessions/[sessionId]/finish/route";
import { PUT as correctionPUT } from "../../app/api/mobile/v1/training/sessions/[sessionId]/correction/route";
import { POST as discardPOST } from "../../app/api/mobile/v1/training/sessions/[sessionId]/discard/route";
import { GET as historyGET } from "../../app/api/mobile/v1/training/history/route";
import { GET as dayGET } from "../../app/api/mobile/v1/training/days/[date]/route";

const sessionId = "34100000-0000-4000-8000-000000000301", routineId = "34100000-0000-4000-8000-000000000302";
const exerciseId = "34100000-0000-4000-8000-000000000401";
const version = "2026-10-01T23:57:00.123456+00:00", later = "2026-10-02T00:41:10.654321+00:00";
const finishInput = { metadata: { energyLevel: 4, performanceLevel: null, painLevel: 0, notes: "" }, idempotencyKey: "finish:1" };
const finished = {
  status: "finished", sessionId, sessionStatus: "completed", name: "PULL", routineId, logDate: "2026-10-01",
  startedAt: version, endedAt: later, sessionUpdatedAt: later,
  metadata: { energyLevel: 4, performanceLevel: null, painLevel: 0, notes: null },
  exerciseCount: 2, completedExerciseCount: 1, completedSetCount: 3,
} as const;
const correctionMetadata = { energyLevel: 3, performanceLevel: null, painLevel: 0, painNote: "", treadmillMinutes: null,
  treadmillDistanceKm: 1.25, treadmillSpeedKmh: null, treadmillInclinePercent: null, notes: "nota" };
const correctionInput = {
  expectedSessionUpdatedAt: version, metadata: correctionMetadata, idempotencyKey: "correct:1",
  exercises: [{ sessionExerciseId: exerciseId, expectedUpdatedAt: version, notes: "",
    sets: [{ setNumber: 1, actualReps: 10, actualWeightKg: 42.5, notes: "x" }, { setNumber: 2, actualReps: null, actualWeightKg: null, notes: null }] }],
};
const corrected = {
  status: "corrected", sessionId, sessionUpdatedAt: later,
  metadata: { ...correctionMetadata, painNote: null },
  exercises: [{ id: exerciseId, updatedAt: later, notes: null, sets: correctionInput.exercises[0].sets }],
};
const discarded = { status: "discarded", sessionId, sessionUpdatedAt: later } as const;
function context(rpc = vi.fn()) { return { userId: "bearer-owner", supabase: { rpc } } as unknown as MobileSupabaseAuthenticatedContext; }
const ledger = (body: unknown, replayed = false) => vi.fn().mockResolvedValue({ data: [{ response_status: 200, response_body: body, replayed }], error: null });
const failing = (message: string, code = "P0001") => vi.fn().mockResolvedValue({ data: null, error: { code, message } });
function summary(id: string, endedAt: string, startedAt = version): CompletedSessionSummary {
  return { id, routineId, routineName: "PULL", logDate: "2026-10-01", startedAt, endedAt, durationMilliseconds: 600000,
    exercisesCompleted: 2, completedSets: 6, volumeKg: 1200, routineColor: "violet", muscleGroups: ["espalda"] };
}

describe("M3.4-1 finish contract", () => {
  it("accepts exactly the active Web finish fields, keeps null != 0 and canonicalizes empty notes", () => {
    const parsed = parseSessionFinish(finishInput);
    expect(parsed).toEqual({ metadata: { energyLevel: 4, performanceLevel: null, painLevel: 0, notes: null }, idempotencyKey: "finish:1" });
    expect(sessionFinishDomainMetadata(parsed.metadata)).toEqual({ energy_level: 4, performance_level: null, pain_level: 0, notes: null });
    expect(parseSessionFinish({ ...finishInput, metadata: { ...finishInput.metadata, notes: null } }).metadata.notes).toBeNull();
    for (const metadata of [
      { ...finishInput.metadata, painNote: "x" }, { ...finishInput.metadata, treadmillMinutes: 10 },
      { ...finishInput.metadata, sessionName: "x" }, { ...finishInput.metadata, absCompleted: true },
      { energyLevel: 4, performanceLevel: null, painLevel: 0 }, { ...finishInput.metadata, energyLevel: 6 },
      { ...finishInput.metadata, energyLevel: 0 }, { ...finishInput.metadata, painLevel: 11 }, { ...finishInput.metadata, energyLevel: 3.5 },
      { ...finishInput.metadata, energyLevel: "4" }, null,
    ]) expect(() => parseSessionFinish({ ...finishInput, metadata })).toThrow(MobileApiValidationError);
    expect(() => parseSessionFinish({ ...finishInput, userId: "attacker" })).toThrow(MobileApiValidationError);
    expect(() => parseSessionFinish({ metadata: finishInput.metadata })).toThrow(MobileApiValidationError);
    expect(() => parseSessionFinish({ ...finishInput, idempotencyKey: "bad key" })).toThrow(MobileApiValidationError);
  });
  it.each([false, true])("returns the stored server truth (replayed=%s) and calls only the idempotent wrapper", async (replayed) => {
    const rpc = ledger(finished, replayed);
    expect(await finishMobileSession(sessionId.toUpperCase(), finishInput, context(rpc))).toEqual(finished);
    expect(rpc).toHaveBeenCalledWith("mobile_finish_training_session", { p_session_id: sessionId,
      p_metadata: { energy_level: 4, performance_level: null, pain_level: 0, notes: null }, p_idempotency_key: "finish:1" });
  });
  it("adopts the v2 finish receipt only when requested and preserves strict validation", async () => {
    const routineAdditions = ["added", "already_in_routine", "routine_unavailable", "no_completed_sets"].map(outcome => ({ sessionExerciseId: exerciseId, exerciseId, name: "PULLOVER", outcome }));
    const rpc = ledger({ ...finished, routineAdditions });
    expect(await finishMobileSession(sessionId, finishInput, context(rpc), true)).toEqual({ ...finished, routineAdditions });
    expect(rpc).toHaveBeenCalledWith("mobile_finish_training_session_v2", expect.objectContaining({ p_idempotency_key: "finish:1" }));
    for (const invalid of [null, {}, [{ ...routineAdditions[0], outcome: "maybe" }], [{ ...routineAdditions[0], userId: "other" }]])
      expect(() => parseSessionFinishedResponse({ ...finished, routineAdditions: invalid })).toThrow();
    mocks.writeAuth.mockResolvedValue(context(rpc));
    const response = await finishPOST(new NextRequest("https://example.test/api/mobile/v1/training/sessions/session/finish?routineAdditions=1", {
      method: "POST", headers: { authorization: "Bearer valid", "content-type": "application/json" }, body: JSON.stringify(finishInput),
    }), { params: Promise.resolve({ sessionId }) });
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ routineAdditions });
  });
  it("maps domain outcomes to the stable Mobile error contract without leaking SQL", async () => {
    const cases: Array<[string, string, unknown]> = [
      ["NO_COMPLETED_SETS", "P0001", "NO_COMPLETED_SETS"], ["SESSION_CLOSED", "P0001", "SESSION_CLOSED"],
      ["IDEMPOTENCY_KEY_REUSED", "PT409", "IDEMPOTENCY_KEY_REUSED"],
    ];
    for (const [message, code, expected] of cases) {
      await expect(finishMobileSession(sessionId, finishInput, context(failing(message, code)))).rejects.toMatchObject({ code: expected });
      await expect(finishMobileSession(sessionId, finishInput, context(failing(message, code)))).rejects.toBeInstanceOf(MobileApiConflictError);
    }
    await expect(finishMobileSession(sessionId, finishInput, context(failing("TRAINING_SESSION_NOT_FOUND", "P0002")))).rejects.toBeInstanceOf(MobileApiNotFoundError);
    await expect(finishMobileSession(sessionId, finishInput, context(failing("UNAUTHORIZED")))).rejects.toBeInstanceOf(MobileApiUnauthorizedError);
    await expect(finishMobileSession(sessionId, finishInput, context(failing("bad", "22023")))).rejects.toBeInstanceOf(MobileApiValidationError);
    await expect(finishMobileSession(sessionId, finishInput, context(failing("check", "23514")))).rejects.toBeInstanceOf(MobileApiValidationError);
    const unknown = finishMobileSession(sessionId, finishInput, context(failing('relation "x" does not exist', "42P01")));
    await expect(unknown).rejects.not.toBeInstanceOf(MobileApiValidationError);
  });
  it("rejects malformed or mismatched database responses instead of fabricating a finish", async () => {
    for (const body of [{ ...finished, sessionId: routineId }, { ...finished, completedSetCount: -1 }, { ...finished, sessionStatus: "discarded" },
      { ...finished, endedAt: "yesterday" }, { ...finished, extra: true }]) {
      await expect(finishMobileSession(sessionId, finishInput, context(ledger(body)))).rejects.toThrow(/Invalid finish database response/);
    }
    await expect(finishMobileSession(sessionId, finishInput, context(vi.fn().mockResolvedValue({ data: [{ response_status: 201, response_body: finished, replayed: false }], error: null }))))
      .rejects.toThrow(/Invalid finish result/);
    expect(parseSessionFinishedResponse(finished)).toEqual(finished);
  });
});

describe("M3.4-1 correction contract", () => {
  it("allows only actuals/notes/correction metadata, addressed by set number", () => {
    const parsed = parseSessionCorrection(correctionInput);
    expect(sessionCorrectionDomainPayload(parsed)).toEqual({
      metadata: { energy_level: 3, performance_level: null, pain_level: 0, pain_note: null, treadmill_minutes: null,
        treadmill_distance_km: 1.25, treadmill_speed_kmh: null, treadmill_incline_percent: null, notes: "nota" },
      exercises: [{ session_exercise_id: exerciseId, expected_updated_at: version, notes: null,
        sets: [{ set_number: 1, actual_reps: 10, actual_weight_kg: 42.5, notes: "x" }, { set_number: 2, actual_reps: null, actual_weight_kg: null, notes: null }] }],
    });
    const exercise = correctionInput.exercises[0];
    for (const invalid of [
      { ...correctionInput, metadata: { ...correctionMetadata, treadmillMinutes: undefined } },
      { ...correctionInput, metadata: { ...correctionMetadata, sessionName: "x" } },
      { ...correctionInput, metadata: { ...correctionMetadata, painLevel: 11 } },
      { ...correctionInput, exercises: [{ ...exercise, sets: [{ ...exercise.sets[0], isCompleted: false }] }] },
      { ...correctionInput, exercises: [{ ...exercise, sets: [{ ...exercise.sets[0], targetReps: 8 }] }] },
      { ...correctionInput, exercises: [{ ...exercise, sets: [exercise.sets[0], exercise.sets[0]] }] },
      { ...correctionInput, exercises: [{ ...exercise, sets: [{ ...exercise.sets[0], actualReps: 1.5 }] }] },
      { ...correctionInput, exercises: [{ ...exercise, sets: [{ ...exercise.sets[0], actualWeightKg: 10000 }] }] },
      { ...correctionInput, exercises: [{ ...exercise, sets: [{ ...exercise.sets[0], setNumber: 0 }] }] },
      { ...correctionInput, exercises: [exercise, { ...exercise, sessionExerciseId: exerciseId.toUpperCase() }] },
      { ...correctionInput, exercises: [{ ...exercise, routineExerciseId: routineId }] },
      { ...correctionInput, exercises: [{ ...exercise, nameSnapshot: "OTHER" }] },
      { ...correctionInput, expectedSessionUpdatedAt: "2026-02-30T12:00:00Z" },
      { ...correctionInput, status: "in_progress" },
    ]) expect(() => parseSessionCorrection(invalid)).toThrow(MobileApiValidationError);
  });
  it("uses CAS and idempotency through the wrapper, with stable conflicts", async () => {
    const rpc = ledger(corrected);
    expect(await correctMobileSession(sessionId, correctionInput, context(rpc))).toEqual(corrected);
    expect(rpc).toHaveBeenCalledWith("mobile_correct_completed_session", expect.objectContaining({
      p_session_id: sessionId, p_expected_session_updated_at: version, p_idempotency_key: "correct:1" }));
    for (const message of ["SESSION_CHANGED", "SESSION_EXERCISE_CHANGED", "IDEMPOTENCY_KEY_REUSED", "SESSION_DISCARDED", "SESSION_NOT_COMPLETED"]) {
      await expect(correctMobileSession(sessionId, correctionInput, context(failing(message, "PT409")))).rejects.toMatchObject({ code: message });
    }
    await expect(correctMobileSession(sessionId, correctionInput, context(failing("TRAINING_SESSION_NOT_FOUND", "P0002")))).rejects.toBeInstanceOf(MobileApiNotFoundError);
    await expect(correctMobileSession(sessionId, correctionInput, context(ledger({ ...corrected, sessionId: routineId })))).rejects.toThrow(/Invalid correction/);
  });
});

describe("M3.4-1 discard contract", () => {
  it("replays exactly and maps already-discarded/active/foreign sessions", async () => {
    const rpc = ledger(discarded, true);
    expect(await discardMobileSession(sessionId, { idempotencyKey: "discard:1" }, context(rpc))).toEqual(discarded);
    expect(rpc).toHaveBeenCalledWith("mobile_discard_completed_session", { p_session_id: sessionId, p_idempotency_key: "discard:1" });
    await expect(discardMobileSession(sessionId, { idempotencyKey: "discard:1", restore: true }, context(rpc))).rejects.toBeInstanceOf(MobileApiValidationError);
    for (const message of ["SESSION_DISCARDED", "SESSION_NOT_COMPLETED", "IDEMPOTENCY_KEY_REUSED"]) {
      await expect(discardMobileSession(sessionId, { idempotencyKey: "discard:2" }, context(failing(message)))).rejects.toMatchObject({ code: message });
    }
    await expect(discardMobileSession(sessionId, { idempotencyKey: "discard:2" }, context(failing("TRAINING_SESSION_NOT_FOUND", "P0002")))).rejects.toBeInstanceOf(MobileApiNotFoundError);
  });
});

describe("M3.4-1 history and day reads", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  const performance = {} as Parameters<typeof listMobileTrainingHistory>[2];
  it("pages newest-first with an opaque, verbatim keyset cursor", async () => {
    const rows = [summary("34100000-0000-4000-8000-000000000003", "2026-10-03T10:00:00.000003+00:00"),
      summary("34100000-0000-4000-8000-000000000002", "2026-10-02T10:00:00.000002+00:00"),
      summary("34100000-0000-4000-8000-000000000001", "2026-10-01T10:00:00.000001+00:00")];
    mocks.history.mockResolvedValueOnce(rows);
    const first = await listMobileTrainingHistory(new URLSearchParams({ limit: "2" }), context(), performance);
    expect(mocks.history).toHaveBeenCalledWith({ limit: 3, before: undefined }, expect.objectContaining({ userId: "bearer-owner" }));
    expect(first.sessions.map((session) => session.id)).toEqual(rows.slice(0, 2).map((row) => row.id));
    expect(first.sessions[0]).toEqual({ id: rows[0].id, routineId, routineName: "PULL", routineColor: "violet", logDate: "2026-10-01",
      startedAt: version, endedAt: rows[0].endedAt, durationMilliseconds: 600000, exercisesCompleted: 2, completedSets: 6, volumeKg: 1200 });
    expect(parseTrainingHistoryCursor(first.nextCursor)).toEqual({ endedAt: rows[1].endedAt, id: rows[1].id });
    mocks.history.mockResolvedValueOnce(rows.slice(2));
    const second = await listMobileTrainingHistory(new URLSearchParams({ limit: "2", cursor: first.nextCursor! }), context(), performance);
    expect(mocks.history).toHaveBeenLastCalledWith({ limit: 3, before: { endedAt: rows[1].endedAt, id: rows[1].id } }, expect.anything());
    expect(second).toEqual({ sessions: [expect.objectContaining({ id: rows[2].id })], nextCursor: null });
  });
  it("distinguishes a real empty history from an unavailable read", async () => {
    mocks.history.mockResolvedValueOnce([]);
    expect(await listMobileTrainingHistory(new URLSearchParams(), context(), performance)).toEqual({ sessions: [], nextCursor: null });
    expect(mocks.history).toHaveBeenLastCalledWith({ limit: 21, before: undefined }, expect.anything());
    mocks.readAuth.mockResolvedValue({ userId: "bearer-owner", supabase: {} });
    mocks.history.mockRejectedValueOnce(new Error("private database error"));
    const unavailable = await historyGET(new NextRequest("https://example.test/api/mobile/v1/training/history", { headers: { authorization: "Bearer read" } }));
    expect(unavailable.status).toBe(503); expect(await unavailable.json()).toEqual({ error: "DATA_UNAVAILABLE" });
  });
  it("validates cursor, limit and real calendar dates", () => {
    const cursor = { endedAt: "2026-10-01T10:00:00.123456+00:00", id: sessionId };
    expect(parseTrainingHistoryCursor(encodeTrainingHistoryCursor(cursor))).toEqual(cursor);
    for (const invalid of ["%%%", Buffer.from('["x","y"]').toString("base64url"), Buffer.from(`["${cursor.endedAt}","${sessionId}","x"]`).toString("base64url"),
      Buffer.from(`["2026-10-01T10:00:00Z\\",id.gt.0","${sessionId}"]`).toString("base64url")]) {
      expect(() => parseTrainingHistoryCursor(invalid)).toThrow(MobileApiValidationError);
    }
    expect(parseTrainingHistoryLimit(null)).toBe(20); expect(parseTrainingHistoryLimit("50")).toBe(50);
    for (const invalid of ["0", "51", "-1", "1.5", "abc"]) expect(() => parseTrainingHistoryLimit(invalid)).toThrow(MobileApiValidationError);
    expect(parseMobileTrainingDate("2026-10-01")).toBe("2026-10-01");
    for (const invalid of ["2026-02-30", "2026-13-01", "01-10-2026", "2026-10-1"]) expect(() => parseMobileTrainingDate(invalid)).toThrow(MobileApiValidationError);
  });
  it("returns the stored day's sessions in training order with the Web day summary", async () => {
    mocks.history.mockResolvedValueOnce([summary("34100000-0000-4000-8000-000000000002", later, "2026-10-01T18:00:00+00:00"),
      summary("34100000-0000-4000-8000-000000000001", version, "2026-10-01T08:00:00+00:00")]);
    const day = await readMobileTrainingDay("2026-10-01", context(), performance);
    expect(mocks.history).toHaveBeenCalledWith({ logDate: "2026-10-01", limit: 100 }, expect.anything());
    expect(day.sessions.map((session) => session.id)).toEqual(["34100000-0000-4000-8000-000000000001", "34100000-0000-4000-8000-000000000002"]);
    expect(day.summary).toEqual({ sessionCount: 2, exercisesCompleted: 4, completedSets: 12, durationMilliseconds: 1200000, volumeKg: 2400 });
    mocks.history.mockResolvedValueOnce([]);
    expect(await readMobileTrainingDay("2026-10-05", context(), performance)).toEqual({ date: "2026-10-05", sessions: [],
      summary: { sessionCount: 0, exercisesCompleted: 0, completedSets: 0, durationMilliseconds: 0, volumeKg: 0 } });
  });
});

describe("M3.4-1 route wiring", () => {
  const params = { params: Promise.resolve({ sessionId }) };
  const mutation = (method: string, body: unknown) => new NextRequest("https://example.test/api/mobile/v1/training/sessions/x", {
    method, headers: { authorization: "Bearer write", "content-type": "application/json" }, body: JSON.stringify(body) });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readAuth.mockResolvedValue({ userId: "bearer-owner", supabase: {} });
  });
  it("authenticates writes with the mutation token and returns 200/409/404 bodies", async () => {
    mocks.writeAuth.mockResolvedValue(context(ledger(finished)));
    const ok = await finishPOST(mutation("POST", finishInput), params);
    expect(ok.status).toBe(200); expect(await ok.json()).toEqual(finished); expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(mocks.writeAuth).toHaveBeenCalledWith("write"); expect(mocks.readAuth).not.toHaveBeenCalled();
    mocks.writeAuth.mockResolvedValue(context(failing("NO_COMPLETED_SETS")));
    const empty = await finishPOST(mutation("POST", finishInput), params);
    expect(empty.status).toBe(409); expect(await empty.json()).toMatchObject({ error: "NO_COMPLETED_SETS" });
    mocks.writeAuth.mockResolvedValue(context(failing("TRAINING_SESSION_NOT_FOUND", "P0002")));
    expect((await correctionPUT(mutation("PUT", correctionInput), params)).status).toBe(404);
    mocks.writeAuth.mockResolvedValue(context(ledger(discarded)));
    expect(await (await discardPOST(mutation("POST", { idempotencyKey: "discard:1" }), params)).json()).toEqual(discarded);
    const unauthorized = await finishPOST(new NextRequest("https://example.test/x", { method: "POST", body: "{}" }), params);
    expect(unauthorized.status).toBe(401);
  });
  it("authenticates reads with the access token and validates the day path", async () => {
    mocks.history.mockResolvedValue([]);
    const day = await dayGET(new NextRequest("https://example.test/api/mobile/v1/training/days/2026-10-01", { headers: { authorization: "Bearer read" } }),
      { params: Promise.resolve({ date: "2026-10-01" }) });
    expect(day.status).toBe(200); expect(mocks.readAuth).toHaveBeenCalledWith("read"); expect(mocks.writeAuth).not.toHaveBeenCalled();
    const invalid = await dayGET(new NextRequest("https://example.test/x", { headers: { authorization: "Bearer read" } }), { params: Promise.resolve({ date: "2026-02-30" }) });
    expect(invalid.status).toBe(400);
    const badCursor = await historyGET(new NextRequest("https://example.test/api/mobile/v1/training/history?cursor=%%", { headers: { authorization: "Bearer read" } }));
    expect(badCursor.status).toBe(400);
  });
});
