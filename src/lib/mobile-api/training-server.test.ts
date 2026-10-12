import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInProgressSessionForUser: vi.fn(),
  listExerciseRoutineMemberships: vi.fn(),
  listExercises: vi.fn(),
  listRoutineOverviews: vi.fn(),
  listRoutines: vi.fn(),
  listTrainingDaysInMonth: vi.fn(),
  updateExercise: vi.fn(),
  updateRoutine: vi.fn(),
  getInitialPlanStatus: vi.fn(),
  importInitialTrainingPlan: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../phase2/training", () => {
  class TrainingResourceNotFoundError extends Error {}
  return {
    ...mocks,
    TrainingResourceNotFoundError,
  };
});
vi.mock("../phase2/training-robust", () => ({
  getInitialPlanStatus: mocks.getInitialPlanStatus,
  importInitialTrainingPlan: mocks.importInitialTrainingPlan,
}));

import {
  createMobileTrainingExercise,
  createMobileTrainingRoutine,
  importMobileInitialTrainingPlan,
  patchMobileTrainingExercise,
  readMobileTraining,
  readMobileTrainingExercises,
  readMobileTrainingRoutineDetail,
  readMobileTrainingRoutines,
  replaceMobileTrainingRoutineTemplate,
  setMobileTrainingRoutineStatus,
  startMobileTrainingSession,
  updateMobileTrainingRoutineIdentity,
} from "./training-server";
import {
  handleMobileMutationRequest,
  MobileApiConflictError,
  MobileApiNotFoundError,
  MobileApiValidationError,
} from "./auth";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";

const requestPerformance = {} as never;
const routineId = "11111111-1111-4111-8111-111111111111";
const exerciseId = "22222222-2222-4222-8222-222222222222";

function context(rpc = vi.fn()) {
  return {
    userId: "user-1",
    supabase: { rpc },
    repository: {},
  } as unknown as MobileSupabaseAuthenticatedContext;
}

const routineRow = {
  id: routineId,
  user_id: "user-1",
  source_key: null,
  nombre: "Push",
  color: "violet",
  routine_order: 1,
  notes: null,
  is_active: true,
  created_at: "2026-09-20T12:00:00.000Z",
  updated_at: "2026-09-20T12:00:00.000Z",
};

const exerciseRow = {
  id: exerciseId,
  user_id: "user-1",
  source_key: null,
  nombre: "Press",
  grupo_muscular: "pecho",
  muscle_group_label: null,
  implement: "Barra",
  weight_mode: "Peso total",
  series_sugeridas: 4,
  reps_sugeridas: 8,
  peso_sugerido: 80,
  rir_sugerido: 2,
  descanso_min_sugerido_segundos: 90,
  descanso_max_sugerido_segundos: 120,
  notes: null,
  is_active: true,
  created_at: "2026-09-20T12:00:00.000Z",
  updated_at: "2026-09-20T12:00:00.000Z",
};

const exercisePayload = {
  name: "Press",
  muscleGroup: "pecho",
  muscleGroupLabel: null,
  implement: "Barra",
  weightMode: "Peso total",
  suggestedSets: 4,
  suggestedReps: 8,
  suggestedWeight: 80,
  suggestedRir: 2,
  suggestedRestMinSeconds: 90,
  suggestedRestMaxSeconds: 120,
  notes: null,
};

const routineDetail = {
  routine: {
    id: routineId,
    name: "PUSH",
    color: "violet",
    isActive: true,
    updatedAt: routineRow.updated_at,
    templateVersion: 3,
  },
  items: [],
};

describe("Mobile Training server adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getInProgressSessionForUser.mockResolvedValue(null);
    mocks.listTrainingDaysInMonth.mockResolvedValue(new Map());
    mocks.listRoutines.mockResolvedValue([]);
    mocks.listRoutineOverviews.mockResolvedValue(new Map());
    mocks.getInitialPlanStatus.mockResolvedValue({ imported: false, routinesFound: 0 });
    mocks.listExercises.mockResolvedValue([]);
    mocks.listExerciseRoutineMemberships.mockResolvedValue(new Map());
  });

  it("keeps landing failures independent with the Bearer-derived context", async () => {
    mocks.getInProgressSessionForUser.mockRejectedValue(new Error("active unavailable"));
    const auth = context();
    const result = await readMobileTraining("2026-09", auth, requestPerformance);

    expect(result.activeSession).toEqual({ status: "unavailable" });
    expect(result.calendar).toEqual({
      status: "ok",
      data: { month: "2026-09", days: [] },
    });
    expect(mocks.listTrainingDaysInMonth).toHaveBeenCalledWith(
      { month: "2026-09" },
      expect.objectContaining({ userId: "user-1" }),
    );
  });

  it("does not turn an atomic list failure into zero counts or a fake version", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error("snapshot unavailable") });
    const result = await readMobileTrainingRoutines(context(rpc), requestPerformance);
    expect(result.listVersion).toEqual({ status: "unavailable" });
    expect(result.routines).toEqual({ status: "unavailable" });
    expect(result.initialPlan).toEqual({
      status: "ok",
      data: { imported: false, routinesFound: 0 },
    });
  });

  it("makes membership failure invalidate the atomic exercise catalog", async () => {
    mocks.listExercises.mockResolvedValue([exerciseRow]);
    mocks.listRoutines.mockResolvedValue([routineRow]);
    mocks.listExerciseRoutineMemberships.mockRejectedValue(new Error("membership unavailable"));
    const result = await readMobileTrainingExercises(context(), requestPerformance);
    expect(result).toEqual({ catalog: { status: "unavailable" } });
  });

  it("uses the transactional routine RPC without forwarding client ownership", async () => {
    const body = {
      routine: {
        id: routineId,
        name: "Push",
        color: "violet",
        order: 1,
        isActive: true,
        exerciseCount: 0,
        setCount: 0,
      },
    };
    const rpc = vi.fn().mockResolvedValue({
      data: [{ response_status: 201, response_body: body, replayed: false }],
      error: null,
    });
    await expect(
      createMobileTrainingRoutine(
        { name: "Push", color: "violet", idempotencyKey: "routine:1" },
        context(rpc),
      ),
    ).resolves.toEqual(body);
    expect(rpc).toHaveBeenCalledWith("mobile_create_training_routine", {
      p_idempotency_key: "routine:1",
      p_name: "Push",
      p_color: "violet",
    });
  });

  it("returns the exact stored exercise warning on first response or replay", async () => {
    const body = {
      exercise: { ...exercisePayload, id: exerciseId, isActive: true, routineIds: [], updatedAt: exerciseRow.updated_at },
      warning: "Ejercicio creado. No pudo agregarse a la rutina; podés reintentarlo al editarlo.",
    };
    const rpc = vi.fn().mockResolvedValue({
      data: [{ response_status: 201, response_body: body, replayed: true }],
      error: null,
    });
    await expect(
      createMobileTrainingExercise(
        { exercise: exercisePayload, routineIds: [routineId], idempotencyKey: "exercise:1" },
        context(rpc),
      ),
    ).resolves.toEqual(body);
  });

  it("maps database idempotency mismatch and duplicate-name errors", async () => {
    const mismatchRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "IDEMPOTENCY_KEY_REUSED" },
    });
    await expect(
      createMobileTrainingRoutine(
        { name: "Push", color: null, idempotencyKey: "routine:1" },
        context(mismatchRpc),
      ),
    ).rejects.toBeInstanceOf(MobileApiConflictError);

    const duplicateRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    await expect(
      createMobileTrainingRoutine(
        { name: "Push", color: null, idempotencyKey: "routine:2" },
        context(duplicateRpc),
      ),
    ).rejects.toBeInstanceOf(MobileApiValidationError);
  });

  it("applies routine archive and restore as desired state", async () => {
    mocks.updateRoutine.mockImplementation(async (input) => ({
      ...routineRow,
      is_active: input.is_active,
    }));
    const auth = context();
    await expect(
      setMobileTrainingRoutineStatus(routineId, { isActive: false }, auth, requestPerformance),
    ).resolves.toEqual({
      routine: { id: routineId, isActive: false, updatedAt: routineRow.updated_at },
    });
    await setMobileTrainingRoutineStatus(routineId, { isActive: true }, auth, requestPerformance);
    expect(mocks.updateRoutine).toHaveBeenNthCalledWith(
      2,
      { id: routineId, is_active: true },
      expect.objectContaining({ userId: "user-1" }),
    );
  });

  it("updates an exercise and its memberships through one atomic RPC", async () => {
    const body = {
      exercise: {
        ...exercisePayload,
        id: exerciseId,
        isActive: true,
        routineIds: [routineId],
        updatedAt: exerciseRow.updated_at,
      },
    };
    const rpc = vi.fn().mockResolvedValue({ data: body, error: null });
    const result = await patchMobileTrainingExercise(
      exerciseId,
      { operation: "update", exercise: exercisePayload, routineIds: [routineId] },
      context(rpc),
      requestPerformance,
    );
    expect(result).toEqual(body);
    expect(rpc).toHaveBeenCalledWith("mobile_update_training_exercise", {
      p_exercise_id: exerciseId,
      p_exercise: exercisePayload,
      p_routine_ids: [routineId],
    });
    expect(mocks.updateExercise).not.toHaveBeenCalled();
  });

  it.each(["ajena", "archivada", "inexistente"])(
    "maps an %s desired routine to validation instead of unavailable",
    async (kind) => {
      const rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "22023", message: `Rutina ${kind}` },
      });
      await expect(
        patchMobileTrainingExercise(
          exerciseId,
          { operation: "update", exercise: exercisePayload, routineIds: [routineId] },
          context(rpc),
          requestPerformance,
        ),
      ).rejects.toBeInstanceOf(MobileApiValidationError);
    },
  );

  it("maps a missing or foreign target exercise to not found", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "TRAINING_EXERCISE_NOT_FOUND" },
    });
    await expect(
      patchMobileTrainingExercise(
        exerciseId,
        { operation: "update", exercise: exercisePayload, routineIds: [] },
        context(rpc),
        requestPerformance,
      ),
    ).rejects.toBeInstanceOf(MobileApiNotFoundError);
  });

  it("maps a missing or foreign nested routine exercise to not found", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "TRAINING_ROUTINE_EXERCISE_NOT_FOUND" },
    });
    await expect(
      replaceMobileTrainingRoutineTemplate(
        routineId,
        {
          expectedTemplateVersion: 3,
          items: [{
            routineExerciseId: "33333333-3333-4333-8333-333333333333",
            exerciseId,
            targets: {
              nextAdjustment: "maintain",
              nextAdjustmentNote: null,
              restMinSeconds: 90,
              restMaxSeconds: 120,
              notes: null,
              sets: [{
                setNumber: 1,
                targetReps: 8,
                targetWeightKg: 80,
                targetRir: 2,
                notes: null,
              }],
            },
          }],
        },
        context(rpc),
      ),
    ).rejects.toBeInstanceOf(MobileApiNotFoundError);
  });

  it("maps an unexpected atomic membership failure to 503", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "membership trigger failed" },
    });
    const result = await handleMobileMutationRequest("Bearer valid", {
      authenticate: async () => context(rpc),
      mutate: (authenticated) =>
        patchMobileTrainingExercise(
          exerciseId,
          { operation: "update", exercise: exercisePayload, routineIds: [] },
          authenticated,
          requestPerformance,
        ),
    });
    expect(result).toEqual({
      status: 503,
      body: { error: "DATA_UNAVAILABLE" },
    });
  });

  it("preserves initial-plan semantics through the authenticated context", async () => {
    mocks.importInitialTrainingPlan.mockResolvedValue({ routines: 3, exercises: 27 });
    await expect(
      importMobileInitialTrainingPlan(context(), requestPerformance),
    ).resolves.toEqual({ routines: 3, exercises: 27 });
    expect(mocks.importInitialTrainingPlan).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" }),
    );
  });

  it("reads an atomic routine detail and maps cross-user rows to 404", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: routineDetail, error: null });
    await expect(readMobileTrainingRoutineDetail(routineId, context(rpc)))
      .resolves.toEqual(routineDetail);
    expect(rpc).toHaveBeenCalledWith("mobile_training_routine_detail", {
      p_routine_id: routineId,
    });

    const missingRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "TRAINING_ROUTINE_NOT_FOUND" },
    });
    await expect(readMobileTrainingRoutineDetail(routineId, context(missingRpc)))
      .rejects.toBeInstanceOf(MobileApiNotFoundError);
  });

  it("uses identity and template CAS RPCs without forwarding a user id", async () => {
    const identityRpc = vi.fn().mockResolvedValue({
      data: { routine: routineDetail.routine },
      error: null,
    });
    await updateMobileTrainingRoutineIdentity(
      routineId,
      {
        name: "Push",
        color: "violet",
        expectedUpdatedAt: routineRow.updated_at,
      },
      context(identityRpc),
    );
    expect(identityRpc).toHaveBeenCalledWith(
      "mobile_update_training_routine_identity",
      expect.not.objectContaining({ userId: expect.anything() }),
    );

    const templateRpc = vi.fn().mockResolvedValue({ data: routineDetail, error: null });
    await replaceMobileTrainingRoutineTemplate(
      routineId,
      { expectedTemplateVersion: 3, items: [] },
      context(templateRpc),
    );
    expect(templateRpc).toHaveBeenCalledWith(
      "mobile_replace_training_routine_template",
      {
        p_routine_id: routineId,
        p_expected_template_version: 3,
        p_items: [],
      },
    );
  });

  it.each([
    ["ROUTINE_CHANGED", "ROUTINE_CHANGED"],
    ["ROUTINE_TEMPLATE_CHANGED", "ROUTINE_TEMPLATE_CHANGED"],
  ] as const)("maps %s CAS conflicts to stable 409 codes", async (message, code) => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "40001", message },
    });
    const operation = code === "ROUTINE_CHANGED"
      ? updateMobileTrainingRoutineIdentity(
          routineId,
          { name: "Push", color: null, expectedUpdatedAt: routineRow.updated_at },
          context(rpc),
        )
      : replaceMobileTrainingRoutineTemplate(
          routineId,
          { expectedTemplateVersion: 3, items: [] },
          context(rpc),
        );
    await expect(operation).rejects.toMatchObject({ code });
  });

  it("returns the exact durable start or active response from the ledger", async () => {
    const started = {
      status: "started",
      session: {
        id: "44444444-4444-4444-8444-444444444444",
        routineId,
        name: "PUSH",
        logDate: "2026-09-28",
        startedAt: routineRow.updated_at,
      },
    };
    const rpc = vi.fn().mockResolvedValue({
      data: [{ response_status: 201, response_body: started, replayed: true }],
      error: null,
    });
    await expect(startMobileTrainingSession(
      { routineId, idempotencyKey: "session:start:1" },
      context(rpc),
    )).resolves.toEqual({ status: 201, body: started });
    expect(rpc).toHaveBeenCalledWith("mobile_start_training_session", {
      p_idempotency_key: "session:start:1",
      p_routine_id: routineId,
    });

    const active = {
      ...started,
      status: "active",
      code: "ACTIVE_SESSION_EXISTS",
    };
    rpc.mockResolvedValueOnce({
      data: [{ response_status: 409, response_body: active, replayed: false }],
      error: null,
    });
    await expect(startMobileTrainingSession(
      { routineId, idempotencyKey: "session:start:2" },
      context(rpc),
    )).resolves.toEqual({ status: 409, body: active });
  });
});
