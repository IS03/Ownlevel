import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MobileApiNotFoundError, MobileApiValidationError } from "./auth";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";
import type { RobustExerciseHistoryItem } from "../phase2/training-robust";
import type { TrainingHistoryDirectory } from "../phase2/training-history";

const mocks = vi.hoisted(() => ({ readAuth: vi.fn(), writeAuth: vi.fn(), directory: vi.fn(), exerciseHistory: vi.fn(), catalog: vi.fn(), completeHistory: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./supabase", () => ({ authenticateMobileAccessToken: mocks.readAuth, authenticateMobileMutationAccessToken: mocks.writeAuth }));
vi.mock("../phase2/training-robust", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../phase2/training-robust")>()),
  getTrainingHistoryDirectory: mocks.directory, listRobustExerciseHistory: mocks.exerciseHistory, listCompleteRobustExerciseHistory: mocks.completeHistory,
}));
vi.mock("../phase2/training", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../phase2/training")>()), listExercises: mocks.catalog,
}));
import { listMobileTrainingHistoryExercises, readMobileTrainingExerciseHistory } from "./training-session-server";
import { parseExerciseHistoryLimit } from "./training-session";
import { GET as exercisesGET } from "../../app/api/mobile/v1/training/history/exercises/route";
import { GET as exerciseGET } from "../../app/api/mobile/v1/training/history/exercises/[exerciseId]/route";

const exerciseId = "34300000-0000-4000-8000-000000000401";
const context = { userId: "bearer-owner", supabase: {} } as unknown as MobileSupabaseAuthenticatedContext;
const performance = { requestId: "test" } as never;

function item(sessionId: string, logDate: string, endedAt: string, sets: Array<[number | null, number | null, boolean, number | null]>): RobustExerciseHistoryItem {
  return {
    logDate,
    session: { id: sessionId, ended_at: endedAt, routine_id: null, routine_name_snapshot: "PUSH", session_name: null } as never,
    exercise: {
      decision: "maintain", weight_mode_snapshot: "total", nombre_snapshot: "Press banca", grupo_muscular_snapshot: "pecho",
      muscle_group_label_snapshot: null, implement_snapshot: "barra",
      sets: sets.map(([weight, reps, completed, rir], index) => ({ id: `${sessionId}-${index}`, set_number: index + 1, target_reps: 8,
        target_weight_kg: null, target_rir: rir, actual_reps: reps, actual_weight_kg: weight, is_completed: completed })),
    } as never,
  };
}

describe("M3.4-3 exercise history reads", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("lists only exercises with recorded history, most recent first, with server-derived marks", async () => {
    const exercise = (id: string, lastDate: string | null, sessions: number) => ({ id, name: id, muscleGroup: null, muscleLabel: null,
      implement: null, weightMode: null, lastDate, sessions, appearances: sessions, lastMark: sessions ? { weightKg: 50, reps: 5 } : null,
      bestMark: null, routineIds: [] });
    mocks.directory.mockResolvedValue({ exercises: [exercise("old", "2026-09-01", 1), exercise("never", null, 0), exercise("new", "2026-10-01", 2)],
      routines: [] } satisfies TrainingHistoryDirectory);
    const result = await listMobileTrainingHistoryExercises(context, performance);
    expect(result.exercises.map((row) => row.id)).toEqual(["new", "old"]);
    expect(result.exercises[0]).toEqual({ id: "new", name: "new", muscleGroup: null, muscleLabel: null, implement: null, weightMode: null,
      lastDate: "2026-10-01", sessions: 2, lastMark: { weightKg: 50, reps: 5 }, bestMark: null });
    expect(mocks.directory).toHaveBeenCalledWith(expect.objectContaining({ userId: "bearer-owner" }));
  });
  it("returns snapshot identity, latest/best marks and a bounded page; empty history is not a 404", async () => {
    mocks.catalog.mockResolvedValue([{ id: exerciseId, nombre: "Press (catálogo)", grupo_muscular: "pecho", muscle_group_label: null, implement: null, weight_mode: null }]);
    mocks.exerciseHistory.mockResolvedValue([
      item("s3", "2026-10-02", "2026-10-02T12:00:00Z", [[60, 5, true, 2], [62.5, 3, false, null]]),
      item("s2", "2026-09-25", "2026-09-25T12:00:00Z", [[70, 3, true, 1]]),
      item("s1", "2026-09-18", "2026-09-18T12:00:00Z", [[null, null, false, null]]),
    ]);
    const result = await readMobileTrainingExerciseHistory(exerciseId, new URLSearchParams("limit=2"), context, performance);
    expect(result.exercise).toMatchObject({ id: exerciseId, name: "Press banca", implement: "barra" });
    expect(result.latest).toEqual({ sessionId: "s3", logDate: "2026-10-02", routineName: "PUSH", mark: { weightKg: 60, reps: 5 }, completedSets: 1, rirValues: [2] });
    expect(result.best).toMatchObject({ sessionId: "s2", mark: { weightKg: 70, reps: 3 } });
    expect(result.sessions.map((session) => session.sessionId)).toEqual(["s3", "s2"]); expect(result.hasMore).toBe(true);
    expect(mocks.exerciseHistory).toHaveBeenCalledWith({ exerciseId, limit: 500 }, expect.objectContaining({ userId: "bearer-owner" }));

    mocks.exerciseHistory.mockResolvedValue([]);
    const empty = await readMobileTrainingExerciseHistory(exerciseId, new URLSearchParams(), context, performance);
    expect(empty).toMatchObject({ exercise: { name: "Press (catálogo)" }, latest: null, best: null, sessions: [], hasMore: false });
  });
  it("computes filtered latest/best before paging, including a record older than 500 sessions", async () => {
    const routineId = "34300000-0000-4000-8000-000000000501", other = "34300000-0000-4000-8000-000000000502";
    mocks.catalog.mockResolvedValue([]);
    const rows = Array.from({ length: 501 }, (_, index) => ({ ...item(`s${index}`, "2026-09-01", "2026-09-01T12:00:00Z", [[index === 500 ? 200 : 50, 5, true, null]]),
      session: { ...item(`s${index}`, "2026-09-01", "2026-09-01T12:00:00Z", []).session, routine_id: routineId } }));
    const foreignRoutine = { ...rows[0], session: { ...rows[0].session, id: "other-routine", routine_id: other }, exercise: { ...rows[0].exercise, sets: [{ ...rows[0].exercise.sets[0], actual_weight_kg: 300 }] } };
    mocks.completeHistory.mockResolvedValue([foreignRoutine, ...rows]);
    const result = await readMobileTrainingExerciseHistory(exerciseId, new URLSearchParams(`historyByRoutine=1&routineId=${routineId}&limit=2`), context, performance);
    expect(result.best).toMatchObject({ sessionId: "s500", routineId, mark: { weightKg: 200 } });
    expect(result.sessions).toHaveLength(2); expect(result.hasMore).toBe(true);
    expect(result.sessions.every(row => row.routineId === routineId)).toBe(true);
    expect(result.routines?.map(row => row.id).sort()).toEqual([routineId, other]);
    expect(mocks.completeHistory).toHaveBeenCalledWith(exerciseId, expect.objectContaining({ userId: "bearer-owner" }));
    expect(mocks.exerciseHistory).not.toHaveBeenCalled();
    const empty = await readMobileTrainingExerciseHistory(exerciseId, new URLSearchParams(`routineId=${exerciseId}`), context, performance);
    expect(empty).toMatchObject({ latest: null, best: null, sessions: [], hasMore: false });
    mocks.completeHistory.mockRejectedValue(new Error("unavailable"));
    await expect(readMobileTrainingExerciseHistory(exerciseId, new URLSearchParams("historyByRoutine=1"), context, performance)).rejects.toThrow("unavailable");
    await expect(readMobileTrainingExerciseHistory(exerciseId, new URLSearchParams("routineId=bad"), context, performance)).rejects.toBeInstanceOf(MobileApiValidationError);
  });
  it("rejects unknown/foreign exercises and invalid limits", async () => {
    mocks.catalog.mockResolvedValue([]); mocks.exerciseHistory.mockResolvedValue([]);
    await expect(readMobileTrainingExerciseHistory(exerciseId, new URLSearchParams(), context, performance)).rejects.toBeInstanceOf(MobileApiNotFoundError);
    expect(parseExerciseHistoryLimit(null)).toBe(20); expect(parseExerciseHistoryLimit("100")).toBe(100);
    for (const invalid of ["0", "101", "1.5", "x"]) expect(() => parseExerciseHistoryLimit(invalid)).toThrow(MobileApiValidationError);
  });
  it("wires both routes behind the read token", async () => {
    mocks.readAuth.mockResolvedValue(context);
    mocks.directory.mockResolvedValue({ exercises: [], routines: [] });
    const list = await exercisesGET(new NextRequest("https://example.test/api/mobile/v1/training/history/exercises", { headers: { authorization: "Bearer read" } }));
    expect(list.status).toBe(200); expect(await list.json()).toEqual({ exercises: [] }); expect(mocks.readAuth).toHaveBeenCalledWith("read");
    mocks.catalog.mockResolvedValue([]); mocks.exerciseHistory.mockResolvedValue([]);
    const missing = await exerciseGET(new NextRequest("https://example.test/x", { headers: { authorization: "Bearer read" } }), { params: Promise.resolve({ exerciseId }) });
    expect(missing.status).toBe(404);
    const invalid = await exerciseGET(new NextRequest("https://example.test/x", { headers: { authorization: "Bearer read" } }), { params: Promise.resolve({ exerciseId: "nope" }) });
    expect(invalid.status).toBe(400);
    const anonymous = await exercisesGET(new NextRequest("https://example.test/x"));
    expect(anonymous.status).toBe(401); expect(mocks.writeAuth).not.toHaveBeenCalled();
  });
});
