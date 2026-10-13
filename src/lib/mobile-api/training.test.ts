import { describe, expect, it, vi } from "vitest";

import type { RoutineOverview } from "@/lib/phase2/routine-overview";
import type { Exercise, Routine, WorkoutSession } from "@/lib/phase2/types";
import {
  handleMobileAuthenticatedRequest,
  handleMobileMutationRequest,
  MobileApiConflictError,
} from "./auth";
import {
  buildMobileTrainingExercisesResponse,
  buildMobileTrainingResponse,
  buildMobileTrainingRoutinesResponse,
  parseMobileTrainingExerciseCreate,
  parseMobileTrainingExercisePatch,
  parseMobileTrainingInitialPlan,
  parseMobileTrainingMonth,
  parseMobileTrainingRoutineCreate,
  parseMobileTrainingRoutineStatus,
} from "./training";

const routine = (
  overrides: Partial<Routine> = {},
): Routine => ({
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "user-1",
  source_key: null,
  nombre: "Push",
  color: "violet",
  routine_order: 1,
  notes: null,
  is_active: true,
  created_at: "2026-09-20T12:00:00.000Z",
  updated_at: "2026-09-20T12:00:00.000Z",
  ...overrides,
});

const exercise = (
  overrides: Partial<Exercise> = {},
): Exercise => ({
  id: "22222222-2222-4222-8222-222222222222",
  user_id: "user-1",
  source_key: null,
  nombre: "Press banca",
  grupo_muscular: "pecho",
  muscle_group_label: "Pectoral",
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
  ...overrides,
});

const activeSession = {
  session: {
    id: "33333333-3333-4333-8333-333333333333",
    session_name: null,
    routine_name_snapshot: "Push",
  } as WorkoutSession,
  log_date: "2026-09-20",
};

describe("Mobile API v1 Training", () => {
  it("rejects a missing Bearer before reading Training", async () => {
    const authenticate = vi.fn();
    const read = vi.fn();
    await expect(
      handleMobileAuthenticatedRequest(null, { authenticate, read }),
    ).resolves.toEqual({ status: 401, body: { error: "UNAUTHORIZED" } });
    expect(authenticate).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("keeps an absent active session and a confirmed empty calendar as real empty data", () => {
    expect(
      buildMobileTrainingResponse("2026-09", {
        activeSession: { status: "ok", data: null },
        calendar: { status: "ok", data: new Map() },
      }),
    ).toEqual({
      activeSession: { status: "ok", data: null },
      calendar: { status: "ok", data: { month: "2026-09", days: [] } },
    });
  });

  it("maps an active session and stable sorted calendar colors", () => {
    const result = buildMobileTrainingResponse("2026-09", {
      activeSession: { status: "ok", data: activeSession },
      calendar: {
        status: "ok",
        data: new Map([
          ["2026-09-20", ["violet", "blue"]],
          ["2026-09-03", ["rose"]],
        ]),
      },
    });

    expect(result.activeSession).toEqual({
      status: "ok",
      data: {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Push",
        logDate: "2026-09-20",
      },
    });
    expect(result.calendar).toEqual({
      status: "ok",
      data: {
        month: "2026-09",
        days: [
          { date: "2026-09-03", colors: ["rose"] },
          { date: "2026-09-20", colors: ["violet", "blue"] },
        ],
      },
    });
  });

  it("preserves independent unavailable landing reads", () => {
    expect(
      buildMobileTrainingResponse("2026-09", {
        activeSession: { status: "unavailable" },
        calendar: { status: "ok", data: new Map() },
      }),
    ).toEqual({
      activeSession: { status: "unavailable" },
      calendar: { status: "ok", data: { month: "2026-09", days: [] } },
    });
    expect(
      buildMobileTrainingResponse("2026-09", {
        activeSession: { status: "ok", data: activeSession },
        calendar: { status: "unavailable" },
      }).calendar,
    ).toEqual({ status: "unavailable" });
  });

  it("rejects invalid months through the authenticated read handler", async () => {
    expect(() => parseMobileTrainingMonth("2026-9")).toThrow("YYYY-MM");
    await expect(
      handleMobileAuthenticatedRequest("Bearer valid", {
        authenticate: async () => ({ userId: "user-1" }),
        read: async () => parseMobileTrainingMonth("2026-13"),
      }),
    ).resolves.toEqual({
      status: 400,
      body: { error: "VALIDATION_ERROR", message: "El mes debe tener formato YYYY-MM." },
    });
  });

  it("maps active and archived routines with real overview counts and order", () => {
    const archived = routine({
      id: "44444444-4444-4444-8444-444444444444",
      nombre: "Legacy",
      color: "blue",
      routine_order: 2,
      is_active: false,
    });
    const overviews = new Map<string, RoutineOverview>([
      [routine().id, { exerciseCount: 6, setCount: 18, exerciseNames: [], muscleGroups: [] }],
      [archived.id, { exerciseCount: 2, setCount: 5, exerciseNames: [], muscleGroups: [] }],
    ]);
    const result = buildMobileTrainingRoutinesResponse({
      routines: { status: "ok", data: [routine(), archived] },
      overviews: { status: "ok", data: overviews },
      initialPlan: { status: "ok", data: { imported: true, routinesFound: 3 } },
    });

    expect(result.routines).toEqual({
      status: "ok",
      data: [
        expect.objectContaining({ name: "Push", order: 1, isActive: true, exerciseCount: 6, setCount: 18 }),
        expect.objectContaining({ name: "Legacy", order: 2, isActive: false, color: "blue", exerciseCount: 2, setCount: 5 }),
      ],
    });
  });

  it("does not replace unavailable routine overviews with zeroes", () => {
    const result = buildMobileTrainingRoutinesResponse({
      routines: { status: "ok", data: [routine()] },
      overviews: { status: "unavailable" },
      initialPlan: { status: "unavailable" },
    });
    expect(result).toEqual({
      routines: { status: "unavailable" },
      initialPlan: { status: "unavailable" },
    });

    expect(
      buildMobileTrainingRoutinesResponse({
        routines: { status: "ok", data: [] },
        overviews: { status: "ok", data: new Map() },
        initialPlan: { status: "ok", data: { imported: false, routinesFound: 0 } },
      }).routines,
    ).toEqual({ status: "ok", data: [] });

    expect(
      buildMobileTrainingRoutinesResponse({
        routines: { status: "ok", data: [routine()] },
        overviews: { status: "ok", data: new Map() },
        initialPlan: { status: "ok", data: { imported: false, routinesFound: 0 } },
      }).routines,
    ).toEqual({ status: "unavailable" });
  });

  it("returns an atomic exercise catalog with active memberships", () => {
    const result = buildMobileTrainingExercisesResponse({
      exercises: { status: "ok", data: [exercise()] },
      routines: { status: "ok", data: [routine()] },
      memberships: {
        status: "ok",
        data: new Map([
          [exercise().id, [{ id: routine().id, nombre: "Push", color: "violet" }]],
        ]),
      },
    });
    expect(result.catalog).toEqual({
      status: "ok",
      data: {
        exercises: [
          expect.objectContaining({
            name: "Press banca",
            routineIds: [routine().id],
            suggestedSets: 4,
          }),
        ],
        routines: [{ id: routine().id, name: "Push", color: "violet" }],
      },
    });
  });

  it("makes the full catalog unavailable instead of returning false empty memberships", () => {
    expect(
      buildMobileTrainingExercisesResponse({
        exercises: { status: "ok", data: [exercise()] },
        routines: { status: "ok", data: [routine()] },
        memberships: { status: "unavailable" },
      }),
    ).toEqual({ catalog: { status: "unavailable" } });
  });

  it("validates creates and desired-state patches", () => {
    expect(
      parseMobileTrainingRoutineCreate({
        name: " Push ",
        color: "violet",
        idempotencyKey: "routine:1",
      }),
    ).toEqual({ name: "Push", color: "violet", idempotencyKey: "routine:1" });
    expect(parseMobileTrainingRoutineStatus({ isActive: false }))
      .toEqual({ isActive: false });

    const created = parseMobileTrainingExerciseCreate({
      exercise: {
        name: " Press banca ",
        muscleGroup: "pecho",
        muscleGroupLabel: "",
        implement: "Barra",
        weightMode: "Peso total",
        suggestedSets: 4,
        suggestedReps: 8,
        suggestedWeight: 80,
        suggestedRir: 2,
        suggestedRestMinSeconds: 90,
        suggestedRestMaxSeconds: 120,
        notes: "",
      },
      routineIds: [routine().id, routine().id],
      idempotencyKey: "exercise:1",
    });
    expect(created.publicExercise.name).toBe("Press banca");
    expect(created.routineIds).toEqual([routine().id]);
    expect(
      parseMobileTrainingExercisePatch({ operation: "set_status", isActive: false }),
    ).toEqual({ operation: "set_status", isActive: false });
    expect(parseMobileTrainingInitialPlan({})).toBeUndefined();
  });

  it("rejects user ownership fields and arbitrary unknown properties", () => {
    expect(() =>
      parseMobileTrainingRoutineCreate({
        name: "Push",
        color: "violet",
        idempotencyKey: "routine:1",
        userId: "attacker",
      }),
    ).toThrow("propiedades no permitidas");
    expect(() =>
      parseMobileTrainingRoutineStatus({ isActive: false, user_id: "attacker" }),
    ).toThrow("propiedades no permitidas");
    expect(() => parseMobileTrainingInitialPlan({ arbitrary: true }))
      .toThrow("propiedades no permitidas");
    expect(() =>
      parseMobileTrainingExercisePatch({
        operation: "set_status",
        isActive: false,
        extra: true,
      }),
    ).toThrow("propiedades no permitidas");
  });

  it.each([
    [
      "client userId",
      () => parseMobileTrainingRoutineCreate({
        name: "Push",
        color: "violet",
        idempotencyKey: "routine:1",
        userId: "attacker",
      }),
    ],
    [
      "an arbitrary root key",
      () => parseMobileTrainingExercisePatch({
        operation: "set_status",
        isActive: false,
        arbitrary: true,
      }),
    ],
    [
      "an unknown nested exercise key",
      () => parseMobileTrainingExerciseCreate({
        exercise: { name: "Press", arbitrary: true },
        routineIds: [],
        idempotencyKey: "exercise:1",
      }),
    ],
  ])("maps %s to HTTP 400", async (_label, parse) => {
    await expect(
      handleMobileMutationRequest("Bearer valid", {
        authenticate: async () => ({ userId: "user-1" }),
        mutate: async () => parse(),
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: { error: "VALIDATION_ERROR" },
    });
  });

  it("rejects unknown properties in the nested exercise DTO", () => {
    expect(() =>
      parseMobileTrainingExerciseCreate({
        exercise: {
          name: "Press",
          unexpected: "value",
        },
        routineIds: [],
        idempotencyKey: "exercise:1",
      }),
    ).toThrow("propiedades no permitidas");
  });

  it.each([
    ["a non-string name", { name: 123 }],
    ["a number encoded as text", { name: "Press", suggestedSets: "4" }],
    ["a boolean text field", { name: "Press", notes: false }],
  ])("rejects %s in an exercise mutation", (_label, exerciseInput) => {
    expect(() =>
      parseMobileTrainingExerciseCreate({
        exercise: exerciseInput,
        routineIds: [],
        idempotencyKey: "exercise:strict",
      }),
    ).toThrow();
  });

  it("rejects invalid colors, malformed exercises, and more than one create membership", () => {
    expect(() =>
      parseMobileTrainingRoutineCreate({
        name: "Push",
        color: "magenta",
        idempotencyKey: "routine:1",
      }),
    ).toThrow("color");
    expect(() =>
      parseMobileTrainingExerciseCreate({
        exercise: { name: "" },
        routineIds: [],
        idempotencyKey: "exercise:1",
      }),
    ).toThrow("Nombre");
    expect(() =>
      parseMobileTrainingExerciseCreate({
        exercise: {
          name: "Press",
          muscleGroup: null,
          muscleGroupLabel: null,
          implement: null,
          weightMode: null,
          suggestedSets: null,
          suggestedReps: null,
          suggestedWeight: null,
          suggestedRir: null,
          suggestedRestMinSeconds: null,
          suggestedRestMaxSeconds: null,
          notes: null,
        },
        routineIds: [
          "11111111-1111-4111-8111-111111111111",
          "44444444-4444-4444-8444-444444444444",
        ],
        idempotencyKey: "exercise:1",
      }),
    ).toThrow("una sola rutina");
  });

  it("maps an idempotency mismatch to a stable 409 response", async () => {
    await expect(
      handleMobileMutationRequest("Bearer valid", {
        authenticate: async () => ({ userId: "user-1" }),
        mutate: async () => {
          throw new MobileApiConflictError("La clave ya fue usada.");
        },
      }),
    ).resolves.toEqual({
      status: 409,
      body: {
        error: "IDEMPOTENCY_KEY_REUSED",
        message: "La clave ya fue usada.",
      },
    });
  });
});

it("validates identity-only CAS and refuses defaults, ownership and membership injection", () => {
  const identity = { name: "Press", muscleGroup: "pecho", muscleGroupLabel: null, implement: null, weightMode: null, notes: null };
  const body = { operation: "update_identity", exercise: identity, expectedUpdatedAt: "2026-10-13T18:00:00.123456Z" };
  expect(parseMobileTrainingExercisePatch(body)).toEqual({ operation: "update_identity", expectedUpdatedAt: body.expectedUpdatedAt, publicExercise: identity });
  for (const invalid of [{ ...body, routineIds: [] }, { ...body, userId: "other" }, { ...body, expectedUpdatedAt: undefined }, { ...body, exercise: { ...identity, suggestedReps: 8 } }]) {
    expect(() => parseMobileTrainingExercisePatch(invalid)).toThrow();
  }
});
