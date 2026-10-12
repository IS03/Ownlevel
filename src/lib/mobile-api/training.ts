import type { ExerciseMutationInput } from "../phase2/exercise-mutation";
import { normalizeExerciseMutation } from "../phase2/exercise-mutation";
import type { ExerciseRoutineMembership } from "../phase2/exercise-insights";
import { isRoutineColorKey } from "../phase2/routine-colors";
import type { RoutineOverview } from "../phase2/routine-overview";
import type { Exercise, Routine } from "../phase2/types";
import {
  assertAdjustment,
  validateRoutineExercisePayload,
} from "../phase2/training-validation";
import { toWorkoutStartActiveSession } from "../phase2/workout-start";
import type { ReadResult } from "../resilient-read";
import { MobileApiValidationError } from "./auth";
import type {
  MobileReadResult,
  MobileRoutineColorKey,
  MobileTrainingExerciseDto,
  MobileTrainingExerciseMutationDto,
  MobileTrainingExercisesResponse,
  MobileTrainingExerciseStatusPayload,
  MobileTrainingResponse,
  MobileTrainingRoutineCreatePayload,
  MobileTrainingRoutineDuplicatePayload,
  MobileTrainingRoutineDuplicateResponse,
  MobileTrainingRoutineDto,
  MobileTrainingRoutineOrderPayload,
  MobileTrainingRoutineOrderResponse,
  MobileTrainingRoutineDetailResponse,
  MobileTrainingRoutineIdentityPayload,
  MobileTrainingRoutineIdentityResponse,
  MobileTrainingRoutineTemplatePayload,
  MobileTrainingRoutinesResponse,
  MobileTrainingRoutineStatusPayload,
  MobileTrainingSessionStartPayload,
  MobileTrainingSessionStartResponse,
} from "./contracts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;

type ActiveSessionSource = Parameters<typeof toWorkoutStartActiveSession>[0];

export type MobileTrainingLandingSources = {
  activeSession: ReadResult<ActiveSessionSource | null>;
  calendar: ReadResult<Map<string, MobileRoutineColorKey[]>>;
};

export type MobileTrainingRoutineSources = {
  routines: ReadResult<Routine[]>;
  overviews: ReadResult<Map<string, RoutineOverview>>;
  initialPlan: ReadResult<{ imported: boolean; routinesFound: number }>;
};

export type MobileTrainingExerciseSources = {
  exercises: ReadResult<Exercise[]>;
  routines: ReadResult<Routine[]>;
  memberships: ReadResult<Map<string, ExerciseRoutineMembership[]>>;
};

export type ParsedMobileTrainingExerciseMutation = {
  exercise: ExerciseMutationInput;
  publicExercise: MobileTrainingExerciseMutationDto;
};

export type ParsedMobileTrainingExercisePatch =
  | {
      operation: "update";
      exercise: ExerciseMutationInput;
      publicExercise: MobileTrainingExerciseMutationDto;
      routineIds: string[];
    }
  | MobileTrainingExerciseStatusPayload;

export type ParsedMobileTrainingExerciseCreate =
  ParsedMobileTrainingExerciseMutation & {
    routineIds: [] | [string];
    idempotencyKey: string;
  };

function mapReadResult<T, U>(
  result: ReadResult<T>,
  transform: (data: T) => U,
): MobileReadResult<U> {
  return result.status === "ok"
    ? { status: "ok", data: transform(result.data) }
    : { status: "unavailable" };
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MobileApiValidationError(`${label} no es válido.`);
  }
  return value as Record<string, unknown>;
}

function strictObject(
  value: unknown,
  label: string,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  const input = objectValue(value, label);
  const allowed = new Set(allowedKeys);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new MobileApiValidationError(`${label} contiene propiedades no permitidas.`);
  }
  return input;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new MobileApiValidationError(`${label} es obligatorio.`);
  }
  return value.trim();
}

function nullableText(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new MobileApiValidationError(`${label} no es válido.`);
  }
  return value;
}

function nullableNumber(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MobileApiValidationError(`${label} no es válido.`);
  }
  return value;
}

function requiredInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new MobileApiValidationError(`${label} no es válido.`);
  }
  return value as number;
}

function requiredTimestamp(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new MobileApiValidationError(`${label} no es válido.`);
  }
  return value;
}

export function parseMobileTrainingMonth(value: unknown): `${number}-${number}` {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new MobileApiValidationError("El mes debe tener formato YYYY-MM.");
  }
  return value as `${number}-${number}`;
}

export function parseMobileTrainingId(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new MobileApiValidationError(`${label} no es válido.`);
  }
  return value;
}

export function parseMobileIdempotencyKey(value: unknown): string {
  const key = requiredText(value, "La operación");
  if (key.length > 128 || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new MobileApiValidationError("La operación no es válida.");
  }
  return key;
}

function parseRoutineIds(value: unknown, maximum: number): string[] {
  if (!Array.isArray(value)) {
    throw new MobileApiValidationError("Las rutinas seleccionadas no son válidas.");
  }
  const ids = [...new Set(value.map((id) => parseMobileTrainingId(id, "La rutina")))].sort();
  if (ids.length > maximum) {
    throw new MobileApiValidationError(
      maximum === 1
        ? "Al crear un ejercicio podés elegir una sola rutina."
        : "Seleccionaste demasiadas rutinas.",
    );
  }
  return ids;
}

function publicExerciseMutation(
  exercise: ExerciseMutationInput,
): MobileTrainingExerciseMutationDto {
  return {
    name: exercise.nombre,
    muscleGroup: exercise.grupo_muscular,
    muscleGroupLabel: exercise.muscle_group_label,
    implement: exercise.implement,
    weightMode: exercise.weight_mode,
    suggestedSets: exercise.series_sugeridas,
    suggestedReps: exercise.reps_sugeridas,
    suggestedWeight: exercise.peso_sugerido,
    suggestedRir: exercise.rir_sugerido,
    suggestedRestMinSeconds: exercise.descanso_min_sugerido_segundos,
    suggestedRestMaxSeconds: exercise.descanso_max_sugerido_segundos,
    notes: exercise.notes,
  };
}

export function parseMobileTrainingExerciseMutation(
  value: unknown,
): ParsedMobileTrainingExerciseMutation {
  const input = strictObject(value, "El ejercicio", [
    "name",
    "muscleGroup",
    "muscleGroupLabel",
    "implement",
    "weightMode",
    "suggestedSets",
    "suggestedReps",
    "suggestedWeight",
    "suggestedRir",
    "suggestedRestMinSeconds",
    "suggestedRestMaxSeconds",
    "notes",
  ]);
  try {
    const exercise = normalizeExerciseMutation({
      nombre: input.name,
      grupo_muscular: input.muscleGroup,
      muscle_group_label: input.muscleGroupLabel,
      implement: input.implement,
      weight_mode: input.weightMode,
      series_sugeridas: input.suggestedSets,
      reps_sugeridas: input.suggestedReps,
      peso_sugerido: input.suggestedWeight,
      rir_sugerido: input.suggestedRir,
      descanso_min_sugerido_segundos: input.suggestedRestMinSeconds,
      descanso_max_sugerido_segundos: input.suggestedRestMaxSeconds,
      notes: input.notes,
    });
    const hasRestMin = exercise.descanso_min_sugerido_segundos !== null;
    const hasRestMax = exercise.descanso_max_sugerido_segundos !== null;
    if (hasRestMin !== hasRestMax) {
      throw new Error("Completá ambos descansos sugeridos o dejá ambos vacíos.");
    }
    return { exercise, publicExercise: publicExerciseMutation(exercise) };
  } catch (error) {
    throw new MobileApiValidationError(
      error instanceof Error ? error.message : "El ejercicio no es válido.",
    );
  }
}

export function parseMobileTrainingRoutineCreate(
  value: unknown,
): MobileTrainingRoutineCreatePayload {
  const input = strictObject(value, "La rutina", [
    "name",
    "color",
    "idempotencyKey",
  ]);
  const color = input.color;
  if (color !== null && !isRoutineColorKey(color)) {
    throw new MobileApiValidationError("Elegí un color de rutina válido.");
  }
  return {
    name: requiredText(input.name, "El nombre"),
    color,
    idempotencyKey: parseMobileIdempotencyKey(input.idempotencyKey),
  };
}

export function parseMobileTrainingRoutineDuplicate(value: unknown): MobileTrainingRoutineDuplicatePayload {
  const input = strictObject(value, "La copia", [
    "name", "color", "idempotencyKey", "expectedUpdatedAt", "expectedTemplateVersion",
  ]);
  return {
    ...parseMobileTrainingRoutineCreate({ name: input.name, color: input.color, idempotencyKey: input.idempotencyKey }),
    expectedUpdatedAt: requiredTimestamp(input.expectedUpdatedAt, "La versión de la rutina"),
    expectedTemplateVersion: requiredInteger(input.expectedTemplateVersion, "La versión de la plantilla", 1),
  };
}

function orderedRoutineIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 1000) {
    throw new MobileApiValidationError("El orden de las rutinas no es válido.");
  }
  const ids = value.map(id => parseMobileTrainingId(id, "La rutina").toLowerCase());
  if (new Set(ids).size !== ids.length) {
    throw new MobileApiValidationError("El orden contiene rutinas repetidas.");
  }
  return ids;
}

export function parseMobileTrainingRoutineOrder(value: unknown): MobileTrainingRoutineOrderPayload {
  const input = strictObject(value, "El orden", ["routineIds", "expectedListVersion", "idempotencyKey"]);
  return {
    routineIds: orderedRoutineIds(input.routineIds),
    expectedListVersion: requiredInteger(input.expectedListVersion, "La versión de la lista"),
    idempotencyKey: parseMobileIdempotencyKey(input.idempotencyKey),
  };
}

function routineSummary(value: unknown): MobileTrainingRoutineDto {
  const input = objectValue(value, "La rutina");
  if ((input.color !== null && !isRoutineColorKey(input.color)) || typeof input.isActive !== "boolean") {
    throw new MobileApiValidationError("La rutina no es válida.");
  }
  const order = requiredInteger(input.order, "El orden", 1);
  if (order > 1000) throw new MobileApiValidationError("El orden no es válido.");
  return {
    id: parseMobileTrainingId(input.id, "La rutina"), name: requiredText(input.name, "El nombre"),
    color: input.color, order, isActive: input.isActive,
    exerciseCount: requiredInteger(input.exerciseCount, "La cantidad de ejercicios"),
    setCount: requiredInteger(input.setCount, "La cantidad de series"),
  };
}

export function parseMobileTrainingRoutinesSnapshot(value: unknown): {
  routines: MobileTrainingRoutineDto[]; listVersion: number;
} {
  const input = objectValue(value, "La lista");
  if (!Array.isArray(input.routines)) throw new MobileApiValidationError("La lista no es válida.");
  const routines = input.routines.map(routineSummary);
  if (new Set(routines.map(routine => routine.id.toLowerCase())).size !== routines.length) {
    throw new MobileApiValidationError("La lista contiene rutinas repetidas.");
  }
  return { routines, listVersion: requiredInteger(input.listVersion, "La versión de la lista") };
}

export function parseMobileTrainingRoutineDuplicateResponse(value: unknown): MobileTrainingRoutineDuplicateResponse {
  const input = objectValue(value, "La copia");
  const routine = routineSummary(input.routine);
  if (!routine.isActive) throw new MobileApiValidationError("La copia no está activa.");
  return { routine };
}

export function parseMobileTrainingRoutineOrderResponse(value: unknown): MobileTrainingRoutineOrderResponse {
  const input = objectValue(value, "El orden");
  return { routineIds: orderedRoutineIds(input.routineIds), listVersion: requiredInteger(input.listVersion, "La versión de la lista") };
}

export function parseMobileTrainingRoutineStatus(
  value: unknown,
): MobileTrainingRoutineStatusPayload {
  const input = strictObject(value, "La rutina", ["isActive"]);
  if (typeof input.isActive !== "boolean") {
    throw new MobileApiValidationError("El estado de la rutina no es válido.");
  }
  return { isActive: input.isActive };
}

export function parseMobileTrainingRoutineIdentity(
  value: unknown,
): MobileTrainingRoutineIdentityPayload {
  const input = strictObject(value, "La identidad de la rutina", [
    "name",
    "color",
    "expectedUpdatedAt",
  ]);
  if (input.color !== null && !isRoutineColorKey(input.color)) {
    throw new MobileApiValidationError("Elegí un color de rutina válido.");
  }
  return {
    name: requiredText(input.name, "El nombre"),
    color: input.color,
    expectedUpdatedAt: requiredTimestamp(
      input.expectedUpdatedAt,
      "La versión de la rutina",
    ),
  };
}

export function parseMobileTrainingRoutineTemplate(
  value: unknown,
): MobileTrainingRoutineTemplatePayload {
  const input = strictObject(value, "La plantilla", [
    "expectedTemplateVersion",
    "items",
  ]);
  const expectedTemplateVersion = requiredInteger(
    input.expectedTemplateVersion,
    "La versión de la plantilla",
    1,
  );
  if (!Array.isArray(input.items) || input.items.length > 10_000) {
    throw new MobileApiValidationError("La plantilla no es válida.");
  }

  const items = input.items.map((rawItem, itemIndex) => {
    const item = strictObject(rawItem, `El ejercicio ${itemIndex + 1}`, [
      "routineExerciseId",
      "exerciseId",
      "targets",
    ]);
    const routineExerciseId = item.routineExerciseId === null
      ? null
      : parseMobileTrainingId(item.routineExerciseId, "La relación de rutina");
    const exerciseId = parseMobileTrainingId(item.exerciseId, "El ejercicio");
    const targetInput = strictObject(item.targets, "Los objetivos", [
      "nextAdjustment",
      "nextAdjustmentNote",
      "restMinSeconds",
      "restMaxSeconds",
      "notes",
      "sets",
    ]);
    if (typeof targetInput.nextAdjustment !== "string") {
      throw new MobileApiValidationError("El ajuste no es válido.");
    }
    try {
      assertAdjustment(targetInput.nextAdjustment);
    } catch (error) {
      throw new MobileApiValidationError(
        error instanceof Error ? error.message : "El ajuste no es válido.",
      );
    }
    if (!Array.isArray(targetInput.sets)) {
      throw new MobileApiValidationError("Las series no son válidas.");
    }
    const sets = targetInput.sets.map((rawSet, setIndex) => {
      const set = strictObject(rawSet, `La serie ${setIndex + 1}`, [
        "setNumber",
        "targetReps",
        "targetWeightKg",
        "targetRir",
        "notes",
      ]);
      return {
        setNumber: requiredInteger(set.setNumber, "El número de serie", 1),
        targetReps: nullableNumber(set.targetReps, "Las repeticiones"),
        targetWeightKg: nullableNumber(set.targetWeightKg, "El peso"),
        targetRir: nullableNumber(set.targetRir, "El RIR"),
        notes: nullableText(set.notes, "Las notas de la serie"),
      };
    });
    const targets = {
      nextAdjustment: targetInput.nextAdjustment,
      nextAdjustmentNote: nullableText(
        targetInput.nextAdjustmentNote,
        "La nota del ajuste",
      ),
      restMinSeconds: nullableNumber(
        targetInput.restMinSeconds,
        "El descanso mínimo",
      ),
      restMaxSeconds: nullableNumber(
        targetInput.restMaxSeconds,
        "El descanso máximo",
      ),
      notes: nullableText(targetInput.notes, "Las notas"),
      sets,
    };
    try {
      validateRoutineExercisePayload({
        next_adjustment: targets.nextAdjustment,
        rest_min_seconds: targets.restMinSeconds,
        rest_max_seconds: targets.restMaxSeconds,
        notes: targets.notes ?? "",
        sets: targets.sets.map((set) => ({
          set_number: set.setNumber,
          target_reps: set.targetReps,
          target_weight_kg: set.targetWeightKg,
          target_rir: set.targetRir,
          notes: set.notes,
        })),
      });
    } catch (error) {
      throw new MobileApiValidationError(
        error instanceof Error ? error.message : "Los objetivos no son válidos.",
      );
    }
    return { routineExerciseId, exerciseId, targets };
  });

  if (new Set(items.map((item) => item.exerciseId)).size !== items.length) {
    throw new MobileApiValidationError(
      "Un ejercicio no puede repetirse en la rutina.",
    );
  }
  return { expectedTemplateVersion, items };
}

export function parseMobileTrainingSessionStart(
  value: unknown,
): MobileTrainingSessionStartPayload {
  const input = strictObject(value, "El inicio de sesión", [
    "routineId",
    "idempotencyKey",
  ]);
  return {
    routineId: input.routineId === null
      ? null
      : parseMobileTrainingId(input.routineId, "La rutina"),
    idempotencyKey: parseMobileIdempotencyKey(input.idempotencyKey),
  };
}

const MUSCLE_GROUPS = new Set([
  "pecho",
  "espalda",
  "piernas",
  "hombros",
  "bíceps",
  "tríceps",
  "abdomen",
  "cardio",
]);

export function parseMobileTrainingRoutineDetailResponse(
  value: unknown,
): MobileTrainingRoutineDetailResponse {
  const root = strictObject(value, "La rutina recibida", ["routine", "items"]);
  const routine = strictObject(root.routine, "La rutina recibida", [
    "id",
    "name",
    "color",
    "isActive",
    "updatedAt",
    "templateVersion",
  ]);
  if (routine.color !== null && !isRoutineColorKey(routine.color)) {
    throw new Error("Invalid routine detail color");
  }
  if (typeof routine.isActive !== "boolean") {
    throw new Error("Invalid routine detail status");
  }
  const templateVersion = requiredInteger(
    routine.templateVersion,
    "La versión de la plantilla",
    1,
  );
  if (!Array.isArray(root.items)) {
    throw new Error("Invalid routine detail items");
  }

  const rawItems = root.items.map((rawItem, index) => {
    const item = strictObject(rawItem, "El ejercicio recibido", [
      "routineExerciseId",
      "exerciseOrder",
      "exercise",
      "updatedAt",
      "targets",
    ]);
    const exercise = strictObject(item.exercise, "El ejercicio recibido", [
      "id",
      "name",
      "muscleGroup",
      "muscleGroupLabel",
      "implement",
      "weightMode",
      "isActive",
    ]);
    if (
      exercise.muscleGroup !== null &&
      (typeof exercise.muscleGroup !== "string" ||
        !MUSCLE_GROUPS.has(exercise.muscleGroup))
    ) {
      throw new Error("Invalid routine detail muscle group");
    }
    if (typeof exercise.isActive !== "boolean") {
      throw new Error("Invalid routine detail exercise status");
    }
    return {
      routineExerciseId: parseMobileTrainingId(
        item.routineExerciseId,
        "La relación de rutina",
      ),
      exerciseOrder: requiredInteger(
        item.exerciseOrder,
        "El orden del ejercicio",
        1,
      ),
      exercise: {
        id: parseMobileTrainingId(exercise.id, "El ejercicio"),
        name: requiredText(exercise.name, "El nombre del ejercicio"),
        muscleGroup: exercise.muscleGroup,
        muscleGroupLabel: nullableText(
          exercise.muscleGroupLabel,
          "El músculo específico",
        ),
        implement: nullableText(exercise.implement, "El implemento"),
        weightMode: nullableText(exercise.weightMode, "El registro de carga"),
        isActive: exercise.isActive,
      },
      updatedAt: requiredTimestamp(item.updatedAt, "La versión del ejercicio"),
      targets: item.targets,
      index,
    };
  });

  const parsedTemplate = parseMobileTrainingRoutineTemplate({
    expectedTemplateVersion: templateVersion,
    items: rawItems.map((item) => ({
      routineExerciseId: item.routineExerciseId,
      exerciseId: item.exercise.id,
      targets: item.targets,
    })),
  });

  return {
    routine: {
      id: parseMobileTrainingId(routine.id, "La rutina"),
      name: requiredText(routine.name, "El nombre"),
      color: routine.color,
      isActive: routine.isActive,
      updatedAt: requiredTimestamp(routine.updatedAt, "La versión de la rutina"),
      templateVersion,
    },
    items: rawItems.map((item, index) => ({
      routineExerciseId: item.routineExerciseId,
      exerciseOrder: item.exerciseOrder,
      exercise: item.exercise,
      updatedAt: item.updatedAt,
      targets: parsedTemplate.items[index]!.targets,
    })),
  } as MobileTrainingRoutineDetailResponse;
}

export function parseMobileTrainingRoutineIdentityResponse(
  value: unknown,
): MobileTrainingRoutineIdentityResponse {
  const root = strictObject(value, "La rutina recibida", ["routine"]);
  return {
    routine: parseMobileTrainingRoutineDetailResponse({
      routine: root.routine,
      items: [],
    }).routine,
  };
}

export function parseMobileTrainingSessionStartResponse(
  value: unknown,
): MobileTrainingSessionStartResponse {
  const root = objectValue(value, "La sesión recibida");
  const status = root.status;
  const allowed = status === "active"
    ? ["status", "code", "session"]
    : ["status", "session"];
  const strict = strictObject(value, "La sesión recibida", allowed);
  if (status !== "started" && status !== "active") {
    throw new Error("Invalid training session status");
  }
  if (status === "active" && strict.code !== "ACTIVE_SESSION_EXISTS") {
    throw new Error("Invalid active session conflict");
  }
  const session = strictObject(strict.session, "La sesión recibida", [
    "id",
    "routineId",
    "name",
    "logDate",
    "startedAt",
  ]);
  if (
    typeof session.logDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(session.logDate)
  ) {
    throw new Error("Invalid training session date");
  }
  const parsedSession = {
    id: parseMobileTrainingId(session.id, "La sesión"),
    routineId: session.routineId === null
      ? null
      : parseMobileTrainingId(session.routineId, "La rutina"),
    name: requiredText(session.name, "El nombre de la sesión"),
    logDate: session.logDate,
    startedAt: requiredTimestamp(session.startedAt, "El inicio de la sesión"),
  };
  return status === "started"
    ? { status, session: parsedSession }
    : { status, code: "ACTIVE_SESSION_EXISTS", session: parsedSession };
}

export function parseMobileTrainingExerciseCreate(
  value: unknown,
): ParsedMobileTrainingExerciseCreate {
  const input = strictObject(value, "El ejercicio", [
    "exercise",
    "routineIds",
    "idempotencyKey",
  ]);
  const parsed = parseMobileTrainingExerciseMutation(input.exercise);
  const routineIds = parseRoutineIds(input.routineIds, 1) as [] | [string];
  return {
    ...parsed,
    routineIds,
    idempotencyKey: parseMobileIdempotencyKey(input.idempotencyKey),
  };
}

export function parseMobileTrainingExercisePatch(
  value: unknown,
): ParsedMobileTrainingExercisePatch {
  const input = objectValue(value, "La operación");
  if (input.operation === "set_status") {
    strictObject(value, "La operación", ["operation", "isActive"]);
    if (typeof input.isActive !== "boolean") {
      throw new MobileApiValidationError("El estado del ejercicio no es válido.");
    }
    return { operation: "set_status", isActive: input.isActive };
  }
  if (input.operation === "update") {
    strictObject(value, "La operación", ["operation", "exercise", "routineIds"]);
    const parsed = parseMobileTrainingExerciseMutation(input.exercise);
    return {
      operation: "update",
      ...parsed,
      routineIds: parseRoutineIds(input.routineIds, 100),
    } satisfies ParsedMobileTrainingExercisePatch;
  }
  throw new MobileApiValidationError("La operación no es válida.");
}

export function parseMobileTrainingInitialPlan(value: unknown): void {
  strictObject(value, "La importación", []);
}

export function buildMobileTrainingResponse(
  month: string,
  sources: MobileTrainingLandingSources,
): MobileTrainingResponse {
  return {
    activeSession: mapReadResult(sources.activeSession, (active) =>
      active ? toWorkoutStartActiveSession(active) : null,
    ),
    calendar: mapReadResult(sources.calendar, (calendar) => ({
      month,
      days: [...calendar]
        .map(([date, colors]) => ({ date, colors }))
        .sort((left, right) => left.date.localeCompare(right.date)),
    })),
  };
}

export function buildMobileTrainingRoutinesResponse(
  sources: MobileTrainingRoutineSources,
): MobileTrainingRoutinesResponse {
  let routines: MobileTrainingRoutinesResponse["routines"] = {
    status: "unavailable",
  };
  if (sources.routines.status === "ok" && sources.overviews.status === "ok") {
    const overviews = sources.overviews.data;
    if (sources.routines.data.every((routine) => overviews.has(routine.id))) {
      routines = {
        status: "ok",
        data: sources.routines.data.map((routine) => {
          const overview = overviews.get(routine.id)!;
          return {
            id: routine.id,
            name: routine.nombre,
            color: routine.color,
            order: routine.routine_order,
            isActive: routine.is_active,
            exerciseCount: overview.exerciseCount,
            setCount: overview.setCount,
          };
        }),
      };
    }
  }

  return {
    routines,
    initialPlan: mapReadResult(sources.initialPlan, (status) => status),
  };
}

export function mobileTrainingExerciseDto(
  exercise: Exercise,
  routineIds: string[],
): MobileTrainingExerciseDto {
  return {
    id: exercise.id,
    name: exercise.nombre,
    muscleGroup: exercise.grupo_muscular,
    muscleGroupLabel: exercise.muscle_group_label,
    implement: exercise.implement,
    weightMode: exercise.weight_mode,
    suggestedSets: exercise.series_sugeridas,
    suggestedReps: exercise.reps_sugeridas,
    suggestedWeight: exercise.peso_sugerido,
    suggestedRir: exercise.rir_sugerido,
    suggestedRestMinSeconds: exercise.descanso_min_sugerido_segundos,
    suggestedRestMaxSeconds: exercise.descanso_max_sugerido_segundos,
    notes: exercise.notes,
    isActive: exercise.is_active,
    routineIds: [...new Set(routineIds)].sort(),
    updatedAt: exercise.updated_at,
  };
}

export function buildMobileTrainingExercisesResponse(
  sources: MobileTrainingExerciseSources,
): MobileTrainingExercisesResponse {
  if (
    sources.exercises.status === "unavailable" ||
    sources.routines.status === "unavailable" ||
    sources.memberships.status === "unavailable"
  ) {
    return { catalog: { status: "unavailable" } };
  }

  return {
    catalog: {
      status: "ok",
      data: {
        exercises: sources.exercises.data.map((exercise) =>
          mobileTrainingExerciseDto(
            exercise,
            (sources.memberships.status === "ok"
              ? sources.memberships.data.get(exercise.id)
              : undefined
            )?.map((membership) => membership.id) ?? [],
          ),
        ),
        routines: sources.routines.data.map((routine) => ({
          id: routine.id,
          name: routine.nombre,
          color: routine.color,
        })),
      },
    },
  };
}
