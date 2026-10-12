import "server-only";

import type { RequestPerformanceContext } from "../request-performance";
import { resilientRead, type ReadResult } from "../resilient-read";
import type { AuthenticatedRequestContext } from "../supabase/server";
import {
  getInProgressSessionForUser,
  listExerciseRoutineMemberships,
  listExercises,
  listRoutines,
  listTrainingDaysInMonth,
  TrainingResourceNotFoundError,
  updateExercise,
  updateRoutine,
} from "../phase2/training";
import {
  getInitialPlanStatus,
  importInitialTrainingPlan,
} from "../phase2/training-robust";
import type { ExerciseRoutineMembership } from "../phase2/exercise-insights";
import {
  MobileApiConflictError,
  MobileApiNotFoundError,
  MobileApiValidationError,
} from "./auth";
import type {
  MobileTrainingExerciseMutationResponse,
  MobileTrainingExerciseStatusResponse,
  MobileTrainingInitialPlanResponse,
  MobileTrainingRoutineCreateResponse,
  MobileTrainingRoutineDuplicateResponse,
  MobileTrainingRoutineOrderResponse,
  MobileTrainingRoutineDetailResponse,
  MobileTrainingRoutineIdentityResponse,
  MobileTrainingRoutineStatusResponse,
  MobileTrainingSessionStartResponse,
} from "./contracts";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";
import {
  buildMobileTrainingExercisesResponse,
  buildMobileTrainingResponse,
  parseMobileTrainingExerciseCreate,
  parseMobileTrainingExercisePatch,
  parseMobileTrainingId,
  parseMobileTrainingRoutineCreate,
  parseMobileTrainingRoutineDuplicate,
  parseMobileTrainingRoutineDuplicateResponse,
  parseMobileTrainingRoutineOrder,
  parseMobileTrainingRoutineOrderResponse,
  parseMobileTrainingRoutinesSnapshot,
  parseMobileTrainingRoutineDetailResponse,
  parseMobileTrainingRoutineIdentity,
  parseMobileTrainingRoutineIdentityResponse,
  parseMobileTrainingRoutineStatus,
  parseMobileTrainingRoutineTemplate,
  parseMobileTrainingSessionStart,
  parseMobileTrainingSessionStartResponse,
} from "./training";

type RpcError = { code?: string; message?: string };
type IdempotentRpcRow = {
  response_status: number;
  response_body: unknown;
  replayed: boolean;
};

function authenticatedContext(
  context: MobileSupabaseAuthenticatedContext,
  requestPerformance: RequestPerformanceContext,
): AuthenticatedRequestContext {
  return {
    supabase: context.supabase,
    userId: context.userId,
    requestPerformance,
  };
}

function errorRecord(value: unknown): RpcError {
  if (typeof value !== "object" || value === null) return {};
  const record = value as Record<string, unknown>;
  return {
    code: typeof record.code === "string" ? record.code : undefined,
    message: typeof record.message === "string" ? record.message : undefined,
  };
}

function causeOf(value: unknown): unknown {
  return value instanceof Error ? value.cause : undefined;
}

function throwTrainingMutationError(
  value: unknown,
  duplicateMessage?: string,
): never {
  if (value instanceof MobileApiValidationError) throw value;
  if (value instanceof MobileApiNotFoundError) throw value;
  if (value instanceof TrainingResourceNotFoundError) {
    throw new MobileApiNotFoundError(value.message);
  }

  const direct = errorRecord(value);
  const caused = errorRecord(causeOf(value));
  const code = direct.code ?? caused.code;
  const message = direct.message ?? caused.message ?? "";
  if (
    code === "P0002"
    && (message.includes("TRAINING_EXERCISE_NOT_FOUND")
      || message.includes("TRAINING_ROUTINE_NOT_FOUND")
      || message.includes("TRAINING_ROUTINE_EXERCISE_NOT_FOUND"))
  ) {
    throw new MobileApiNotFoundError(
      message.includes("ROUTINE_EXERCISE")
        ? "Ejercicio de rutina no encontrado."
        : message.includes("ROUTINE")
        ? "Rutina no encontrada."
        : "Ejercicio no encontrado.",
    );
  }
  if (message.includes("IDEMPOTENCY_KEY_REUSED")) {
    throw new MobileApiConflictError(
      "La clave de idempotencia ya fue usada con otros datos.",
    );
  }
  if (code === "40001" && message.includes("ROUTINE_LIST_CHANGED")) {
    throw new MobileApiConflictError(
      "La lista cambió en otro dispositivo. Recargá antes de guardar.",
      "ROUTINE_LIST_CHANGED",
    );
  }
  if (code === "40001" && message.includes("ROUTINE_TEMPLATE_CHANGED")) {
    throw new MobileApiConflictError(
      "La plantilla cambió en otro dispositivo. Recargá antes de guardar.",
      "ROUTINE_TEMPLATE_CHANGED",
    );
  }
  if (code === "40001" && message.includes("ROUTINE_CHANGED")) {
    throw new MobileApiConflictError(
      "La rutina cambió en otro dispositivo. Recargá antes de guardar.",
      "ROUTINE_CHANGED",
    );
  }
  if (code === "23505") {
    throw new MobileApiValidationError(
      duplicateMessage ?? "Ya existe un recurso con ese nombre.",
    );
  }
  if (
    message.includes("TRAINING_ROUTINE_TEMPLATE_CORRUPT") ||
    message.includes("TRAINING_SESSION_START_FAILED")
  ) {
    throw value;
  }
  if (
    code === "22P02" ||
    code === "22023" ||
    code === "23514" ||
    code === "P0001"
  ) {
    throw new MobileApiValidationError(
      message.replace(/^.*?:\s*/, "") || "Los datos no son válidos.",
    );
  }
  throw value;
}

function parseDatabaseResponse<T>(parser: (value: unknown) => T, value: unknown): T {
  try {
    return parser(value);
  } catch (error) {
    throw new Error("Invalid Mobile Training database response", { cause: error });
  }
}

function parseIdempotentRpcRow(value: unknown): IdempotentRpcRow {
  const row = Array.isArray(value) ? value[0] : value;
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    throw new Error("Invalid idempotent RPC response");
  }
  const record = row as Record<string, unknown>;
  if (
    typeof record.response_status !== "number" ||
    typeof record.response_body !== "object" ||
    record.response_body === null ||
    typeof record.replayed !== "boolean"
  ) {
    throw new Error("Invalid idempotent RPC response");
  }
  return {
    response_status: record.response_status,
    response_body: record.response_body,
    replayed: record.replayed,
  };
}

function objectBody(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid training mutation response");
  }
  return value as Record<string, unknown>;
}

export async function readMobileTraining(
  month: `${number}-${number}`,
  context: MobileSupabaseAuthenticatedContext,
  requestPerformance: RequestPerformanceContext,
) {
  const auth = authenticatedContext(context, requestPerformance);
  const performanceBase = {
    route: "/api/mobile/v1/training",
    layer: "database" as const,
    ...requestPerformance,
  };
  const [activeSession, calendar] = await Promise.all([
    resilientRead(
      { ...performanceBase, operation: "mobile.training.active-session" },
      () => getInProgressSessionForUser(auth),
    ),
    resilientRead(
      { ...performanceBase, operation: "mobile.training.calendar" },
      () => listTrainingDaysInMonth({ month }, auth),
    ),
  ]);
  return buildMobileTrainingResponse(month, { activeSession, calendar });
}

export async function readMobileTrainingRoutines(
  context: MobileSupabaseAuthenticatedContext,
  requestPerformance: RequestPerformanceContext,
) {
  const auth = authenticatedContext(context, requestPerformance);
  const performanceBase = {
    route: "/api/mobile/v1/training/routines",
    layer: "database" as const,
    ...requestPerformance,
  };
  const [snapshot, initialPlan] = await Promise.all([
    resilientRead(
      { ...performanceBase, operation: "mobile.training.routines.snapshot" },
      async () => {
        const { data, error } = await context.supabase.rpc("mobile_training_routines_snapshot");
        if (error) throw error;
        return parseDatabaseResponse(parseMobileTrainingRoutinesSnapshot, data);
      },
    ),
    resilientRead(
      { ...performanceBase, operation: "mobile.training.initial-plan.status" },
      () => getInitialPlanStatus(auth),
    ),
  ]);
  return {
    routines: snapshot.status === "ok"
      ? { status: "ok" as const, data: snapshot.data.routines }
      : { status: "unavailable" as const },
    listVersion: snapshot.status === "ok"
      ? { status: "ok" as const, data: snapshot.data.listVersion }
      : { status: "unavailable" as const },
    initialPlan,
  };
}

export async function readMobileTrainingExercises(
  context: MobileSupabaseAuthenticatedContext,
  requestPerformance: RequestPerformanceContext,
) {
  const auth = authenticatedContext(context, requestPerformance);
  const performanceBase = {
    route: "/api/mobile/v1/training/exercises",
    layer: "database" as const,
    ...requestPerformance,
  };
  const [exercises, routines] = await Promise.all([
    resilientRead(
      { ...performanceBase, operation: "mobile.training.exercises.list" },
      () => listExercises({ includeArchived: true }, auth),
    ),
    resilientRead(
      { ...performanceBase, operation: "mobile.training.exercises.routines" },
      () => listRoutines({ includeArchived: false }, auth),
    ),
  ]);

  let memberships: ReadResult<Map<string, ExerciseRoutineMembership[]>>;
  if (routines.status === "ok") {
    memberships = await resilientRead(
      { ...performanceBase, operation: "mobile.training.exercises.memberships" },
      () => listExerciseRoutineMemberships(routines.data.map((routine) => routine.id), auth),
    );
  } else {
    memberships = { status: "unavailable" };
  }

  return buildMobileTrainingExercisesResponse({ exercises, routines, memberships });
}

export async function createMobileTrainingRoutine(
  payload: unknown,
  context: MobileSupabaseAuthenticatedContext,
): Promise<MobileTrainingRoutineCreateResponse> {
  const input = parseMobileTrainingRoutineCreate(payload);
  const { data, error } = await context.supabase.rpc(
    "mobile_create_training_routine",
    {
      p_idempotency_key: input.idempotencyKey,
      p_name: input.name,
      p_color: input.color,
    },
  );
  if (error) throwTrainingMutationError(error, "Ya existe una rutina con ese nombre.");
  const result = parseIdempotentRpcRow(data);
  if (result.response_status !== 201) {
    throw new Error("Invalid routine create status");
  }
  const body = objectBody(result.response_body);
  if (typeof body.routine !== "object" || body.routine === null) {
    throw new Error("Invalid routine create body");
  }
  return result.response_body as MobileTrainingRoutineCreateResponse;
}

export async function duplicateMobileTrainingRoutine(
  routineId: unknown, payload: unknown, context: MobileSupabaseAuthenticatedContext,
): Promise<MobileTrainingRoutineDuplicateResponse> {
  const id = parseMobileTrainingId(routineId, "La rutina");
  const input = parseMobileTrainingRoutineDuplicate(payload);
  const { data, error } = await context.supabase.rpc("mobile_duplicate_training_routine", {
    p_routine_id: id, p_name: input.name, p_color: input.color, p_idempotency_key: input.idempotencyKey,
    p_expected_updated_at: input.expectedUpdatedAt, p_expected_template_version: input.expectedTemplateVersion,
  });
  if (error) throwTrainingMutationError(error, "Ya existe una rutina con ese nombre.");
  const result = parseIdempotentRpcRow(data);
  if (result.response_status !== 201) throw new Error("Invalid duplicate routine response status");
  return parseDatabaseResponse(parseMobileTrainingRoutineDuplicateResponse, result.response_body);
}

export async function reorderMobileTrainingRoutines(
  payload: unknown, context: MobileSupabaseAuthenticatedContext,
): Promise<MobileTrainingRoutineOrderResponse> {
  const input = parseMobileTrainingRoutineOrder(payload);
  const { data, error } = await context.supabase.rpc("mobile_reorder_training_routines", {
    p_routine_ids: input.routineIds, p_expected_list_version: input.expectedListVersion, p_idempotency_key: input.idempotencyKey,
  });
  if (error) throwTrainingMutationError(error);
  const result = parseIdempotentRpcRow(data);
  if (result.response_status !== 200) throw new Error("Invalid reorder routine response status");
  const response = parseDatabaseResponse(parseMobileTrainingRoutineOrderResponse, result.response_body);
  if (JSON.stringify(response.routineIds) !== JSON.stringify(input.routineIds) || response.listVersion < input.expectedListVersion) {
    throw new Error("Invalid reorder routine database response");
  }
  return response;
}

export async function readMobileTrainingRoutineDetail(
  id: unknown,
  context: MobileSupabaseAuthenticatedContext,
): Promise<MobileTrainingRoutineDetailResponse> {
  const routineId = parseMobileTrainingId(id, "La rutina");
  const { data, error } = await context.supabase.rpc(
    "mobile_training_routine_detail",
    { p_routine_id: routineId },
  );
  if (error) throwTrainingMutationError(error);
  return parseDatabaseResponse(parseMobileTrainingRoutineDetailResponse, data);
}

export async function updateMobileTrainingRoutineIdentity(
  id: unknown,
  payload: unknown,
  context: MobileSupabaseAuthenticatedContext,
): Promise<MobileTrainingRoutineIdentityResponse> {
  const routineId = parseMobileTrainingId(id, "La rutina");
  const input = parseMobileTrainingRoutineIdentity(payload);
  const { data, error } = await context.supabase.rpc(
    "mobile_update_training_routine_identity",
    {
      p_routine_id: routineId,
      p_name: input.name,
      p_color: input.color,
      p_expected_updated_at: input.expectedUpdatedAt,
    },
  );
  if (error) {
    throwTrainingMutationError(error, "Ya existe una rutina con ese nombre.");
  }
  return parseDatabaseResponse(parseMobileTrainingRoutineIdentityResponse, data);
}

export async function replaceMobileTrainingRoutineTemplate(
  id: unknown,
  payload: unknown,
  context: MobileSupabaseAuthenticatedContext,
): Promise<MobileTrainingRoutineDetailResponse> {
  const routineId = parseMobileTrainingId(id, "La rutina");
  const input = parseMobileTrainingRoutineTemplate(payload);
  const { data, error } = await context.supabase.rpc(
    "mobile_replace_training_routine_template",
    {
      p_routine_id: routineId,
      p_expected_template_version: input.expectedTemplateVersion,
      p_items: input.items,
    },
  );
  if (error) throwTrainingMutationError(error);
  return parseDatabaseResponse(parseMobileTrainingRoutineDetailResponse, data);
}

export async function startMobileTrainingSession(
  payload: unknown,
  context: MobileSupabaseAuthenticatedContext,
): Promise<{ status: 201 | 409; body: MobileTrainingSessionStartResponse }> {
  const input = parseMobileTrainingSessionStart(payload);
  const { data, error } = await context.supabase.rpc(
    "mobile_start_training_session",
    {
      p_idempotency_key: input.idempotencyKey,
      p_routine_id: input.routineId,
    },
  );
  if (error) throwTrainingMutationError(error);
  const result = parseIdempotentRpcRow(data);
  if (result.response_status !== 201 && result.response_status !== 409) {
    throw new Error("Invalid training session start status");
  }
  const body = parseDatabaseResponse(
    parseMobileTrainingSessionStartResponse,
    result.response_body,
  );
  if (
    (result.response_status === 201 && body.status !== "started") ||
    (result.response_status === 409 && body.status !== "active")
  ) {
    throw new Error("Mismatched training session start response");
  }
  return { status: result.response_status, body };
}

export async function setMobileTrainingRoutineStatus(
  id: unknown,
  payload: unknown,
  context: MobileSupabaseAuthenticatedContext,
  requestPerformance: RequestPerformanceContext,
): Promise<MobileTrainingRoutineStatusResponse> {
  const routineId = parseMobileTrainingId(id, "La rutina");
  const input = parseMobileTrainingRoutineStatus(payload);
  try {
    const routine = await updateRoutine(
      { id: routineId, is_active: input.isActive },
      authenticatedContext(context, requestPerformance),
    );
    return {
      routine: {
        id: routine.id,
        isActive: routine.is_active,
        updatedAt: routine.updated_at,
      },
    };
  } catch (error) {
    throwTrainingMutationError(error);
  }
}

export async function importMobileInitialTrainingPlan(
  context: MobileSupabaseAuthenticatedContext,
  requestPerformance: RequestPerformanceContext,
): Promise<MobileTrainingInitialPlanResponse> {
  try {
    return await importInitialTrainingPlan(
      authenticatedContext(context, requestPerformance),
    );
  } catch (error) {
    throwTrainingMutationError(error);
  }
}

export async function createMobileTrainingExercise(
  payload: unknown,
  context: MobileSupabaseAuthenticatedContext,
): Promise<MobileTrainingExerciseMutationResponse> {
  const input = parseMobileTrainingExerciseCreate(payload);
  const { data, error } = await context.supabase.rpc(
    "mobile_create_training_exercise",
    {
      p_idempotency_key: input.idempotencyKey,
      p_exercise: input.publicExercise,
      p_routine_ids: input.routineIds,
    },
  );
  if (error) throwTrainingMutationError(error, "Ya existe un ejercicio con ese nombre.");
  const result = parseIdempotentRpcRow(data);
  if (result.response_status !== 201) {
    throw new Error("Invalid exercise create status");
  }
  const body = objectBody(result.response_body);
  if (typeof body.exercise !== "object" || body.exercise === null) {
    throw new Error("Invalid exercise create body");
  }
  return result.response_body as MobileTrainingExerciseMutationResponse;
}

export async function patchMobileTrainingExercise(
  id: unknown,
  payload: unknown,
  context: MobileSupabaseAuthenticatedContext,
  requestPerformance: RequestPerformanceContext,
): Promise<MobileTrainingExerciseMutationResponse | MobileTrainingExerciseStatusResponse> {
  const exerciseId = parseMobileTrainingId(id, "El ejercicio");
  const input = parseMobileTrainingExercisePatch(payload);
  const auth = authenticatedContext(context, requestPerformance);
  try {
    if (input.operation === "set_status") {
      const exercise = await updateExercise(
        { id: exerciseId, is_active: input.isActive },
        auth,
      );
      return {
        exercise: {
          id: exercise.id,
          isActive: exercise.is_active,
          updatedAt: exercise.updated_at,
        },
      };
    }

    const { data, error } = await context.supabase.rpc(
      "mobile_update_training_exercise",
      {
        p_exercise_id: exerciseId,
        p_exercise: input.publicExercise,
        p_routine_ids: input.routineIds,
      },
    );
    if (error) {
      throwTrainingMutationError(
        error,
        "Ya existe un ejercicio con ese nombre.",
      );
    }
    const body = objectBody(data);
    if (typeof body.exercise !== "object" || body.exercise === null) {
      throw new Error("Invalid exercise update body");
    }
    return data as MobileTrainingExerciseMutationResponse;
  } catch (error) {
    throwTrainingMutationError(error, "Ya existe un ejercicio con ese nombre.");
  }
}
