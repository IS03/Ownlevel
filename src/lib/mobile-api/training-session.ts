import type { WorkoutExercisePayload, WorkoutSessionDetail, WorkoutSessionExerciseDetail } from "../phase2/types";
import { validateCompletedSessionCorrection, validateSessionMetadata, validateWorkoutExercisePayload } from "../phase2/training-validation";
import { MobileApiValidationError } from "./auth";
import type { MobileReadResult, MobileRoutineColorKey, MobileTrainingMuscleGroup } from "./contracts";
import { parseMobileIdempotencyKey, parseMobileTrainingExerciseMutation, parseMobileTrainingId } from "./training";

export type SessionSetDto = {
  setNumber: number;
  targetReps: number | null;
  targetWeightKg: number | null;
  targetRir: number | null;
  actualReps: number | null;
  actualWeightKg: number | null;
  isCompleted: boolean;
  notes: string | null;
};
export type SessionExercisePayloadDto = {
  isCompleted: boolean;
  decision: "maintain" | "increase_weight" | "increase_reps" | "custom";
  decisionNote: string;
  applyToRoutine: boolean;
  notes: string;
  sets: SessionSetDto[];
};
export type SessionExerciseDto = {
  id: string;
  exerciseId: string;
  routineExerciseId: string | null;
  order: number;
  nameSnapshot: string;
  muscleGroupSnapshot: MobileTrainingMuscleGroup | null;
  muscleGroupLabelSnapshot: string | null;
  implementSnapshot: string | null;
  weightModeSnapshot: string | null;
  restMinSecondsSnapshot: number | null;
  restMaxSecondsSnapshot: number | null;
  nextAdjustmentSnapshot: SessionExercisePayloadDto["decision"];
  nextAdjustmentNoteSnapshot: string | null;
  updatedAt: string;
  payload: SessionExercisePayloadDto;
};
export type SessionMetadataDto = {
  energyLevel: number | null;
  performanceLevel: number | null;
  painLevel: number | null;
  painNote: string | null;
  treadmillMinutes: number | null;
  treadmillDistanceKm: number | null;
  treadmillSpeedKmh: number | null;
  treadmillInclinePercent: number | null;
  notes: string | null;
};
export type QuickSessionHistoryDto = {
  sessionId: string;
  logDate: string;
  completedAt: string | null;
  routineId: string | null;
  routineName: string;
  decision: SessionExercisePayloadDto["decision"];
  sets: SessionSetDto[];
};
export type SessionDetailDto = {
  session: {
    id: string;
    routineId: string | null;
    routineNameSnapshot: string | null;
    name: string;
    status: "in_progress" | "completed" | "discarded";
    logDate: string;
    startedAt: string;
    endedAt: string | null;
    updatedAt: string;
    routineColor: MobileRoutineColorKey | null;
    metadata: SessionMetadataDto;
  };
  exercises: SessionExerciseDto[];
  quickHistory: MobileReadResult<Record<string, QuickSessionHistoryDto[]>>;
};
export type SessionExerciseSyncDto =
  | { status: "active"; updatedAt: string; payload: SessionExercisePayloadDto }
  | { status: "session_closed"; sessionStatus: "completed" | "discarded" }
  | { status: "removed" };
export type SessionStructuralDto =
  | { status: "added"; sessionId: string; sessionExerciseId: string; exerciseId: string }
  | { status: "removed"; sessionId: string; sessionExerciseId: string }
  | { status: "cancelled"; sessionId: string };
export type SessionExerciseOrderInput = {
  orderedSessionExerciseIds: string[];
  expectedSessionUpdatedAt: string;
  idempotencyKey: string;
};
export type SessionExerciseOrderDto = {
  status: "reordered";
  sessionId: string;
  sessionUpdatedAt: string;
  orderedSessionExerciseIds: string[];
};

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))) {
    throw new MobileApiValidationError("El contenido contiene propiedades no permitidas.");
  }
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new MobileApiValidationError("El texto no es válido.");
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new MobileApiValidationError("El estado no es válido.");
  return value;
}
function number(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new MobileApiValidationError("El número no es válido.");
  return value;
}
export function parseSessionVersion(value: unknown): string {
  // Validate, but NEVER reserialize through Date: PostgreSQL microseconds are CAS.
  const match = typeof value === "string"
    ? /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value)
    : null;
  const day = match ? new Date(`${match[1]}T00:00:00Z`) : null;
  if (!match || !day || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== match[1] ||
    Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59 ||
    (match[5] !== undefined && (Number(match[5]) > 23 || Number(match[6]) > 59)) ||
    !Number.isFinite(Date.parse(value as string))) {
    throw new MobileApiValidationError("La versión del ejercicio no es válida.");
  }
  return value as string;
}
export function parseSessionSave(value: unknown): { expectedUpdatedAt: string; payload: WorkoutExercisePayload } {
  const input = object(value, ["expectedUpdatedAt", "payload"]);
  const raw = object(input.payload, ["isCompleted", "decision", "decisionNote", "applyToRoutine", "notes", "sets"]);
  if (!Array.isArray(raw.sets)) throw new MobileApiValidationError("Las series no son válidas.");
  const payload: WorkoutExercisePayload = {
    is_completed: boolean(raw.isCompleted),
    decision: text(raw.decision) as WorkoutExercisePayload["decision"],
    decision_note: text(raw.decisionNote),
    apply_to_routine: boolean(raw.applyToRoutine),
    notes: text(raw.notes),
    sets: raw.sets.map((value) => {
      const set = object(value, ["setNumber", "targetReps", "targetWeightKg", "targetRir", "actualReps", "actualWeightKg", "isCompleted", "notes"]);
      return {
        set_number: number(set.setNumber) as number,
        target_reps: number(set.targetReps), target_weight_kg: number(set.targetWeightKg),
        target_rir: number(set.targetRir), actual_reps: number(set.actualReps),
        actual_weight_kg: number(set.actualWeightKg), is_completed: boolean(set.isCompleted),
        notes: set.notes === null ? null : text(set.notes),
      };
    }),
  };
  try { validateWorkoutExercisePayload(payload); }
  catch (error) { throw new MobileApiValidationError(error instanceof Error ? error.message : "El ejercicio no es válido."); }
  // Match storage normalization for exact response-lost/read-back equality.
  payload.decision_note = payload.decision === "custom" ? payload.decision_note.trim() : "";
  payload.sets = payload.sets.map((set) => ({ ...set, notes: set.notes === "" ? null : set.notes }));
  return { expectedUpdatedAt: parseSessionVersion(input.expectedUpdatedAt), payload };
}
export function parseSessionAdd(value: unknown) {
  const input = object(value, ["operation", "exerciseId", "exercise", "idempotencyKey"]);
  const idempotencyKey = parseMobileIdempotencyKey(input.idempotencyKey);
  if (input.operation === "add_existing") {
    object(value, ["operation", "exerciseId", "idempotencyKey"]);
    return { operation: input.operation, exerciseId: parseMobileTrainingId(input.exerciseId, "El ejercicio"), idempotencyKey } as const;
  }
  if (input.operation === "create_and_add") {
    object(value, ["operation", "exercise", "idempotencyKey"]);
    return { operation: input.operation, exercise: parseMobileTrainingExerciseMutation(input.exercise).publicExercise, idempotencyKey } as const;
  }
  throw new MobileApiValidationError("La operación no es válida.");
}
export function parseSessionRemove(value: unknown) {
  const input = object(value, ["expectedUpdatedAt", "idempotencyKey"]);
  return { expectedUpdatedAt: parseSessionVersion(input.expectedUpdatedAt), idempotencyKey: parseMobileIdempotencyKey(input.idempotencyKey) };
}
export function parseSessionCancel(value: unknown) {
  const input = object(value, ["idempotencyKey"]);
  return { idempotencyKey: parseMobileIdempotencyKey(input.idempotencyKey) };
}
function orderedSessionIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 10000) throw new MobileApiValidationError("El orden enviado no es válido.");
  const ids = value.map(id => parseMobileTrainingId(id, "El ejercicio de sesión").toLowerCase());
  if (new Set(ids).size !== ids.length) throw new MobileApiValidationError("Los ejercicios no pueden repetirse.");
  return ids;
}
export function parseSessionExerciseOrder(value: unknown): SessionExerciseOrderInput {
  const input = object(value, ["orderedSessionExerciseIds", "expectedSessionUpdatedAt", "idempotencyKey"]);
  return { orderedSessionExerciseIds: orderedSessionIds(input.orderedSessionExerciseIds),
    expectedSessionUpdatedAt: parseSessionVersion(input.expectedSessionUpdatedAt), idempotencyKey: parseMobileIdempotencyKey(input.idempotencyKey) };
}
export function parseSessionExerciseOrderResponse(value: unknown): SessionExerciseOrderDto {
  const input = object(value, ["status", "sessionId", "sessionUpdatedAt", "orderedSessionExerciseIds"]);
  if (input.status !== "reordered") throw new MobileApiValidationError("La respuesta de orden no es válida.");
  return { status: "reordered", sessionId: parseMobileTrainingId(input.sessionId, "La sesión"),
    sessionUpdatedAt: parseSessionVersion(input.sessionUpdatedAt), orderedSessionExerciseIds: orderedSessionIds(input.orderedSessionExerciseIds) };
}

export function sessionPayloadDto(payload: WorkoutExercisePayload): SessionExercisePayloadDto {
  return {
    isCompleted: payload.sets.some((set) => set.is_completed), decision: payload.decision,
    decisionNote: payload.decision === "custom" ? payload.decision_note.trim() : "",
    applyToRoutine: payload.apply_to_routine, notes: payload.notes,
    sets: payload.sets.map((set) => ({
      setNumber: set.set_number, targetReps: set.target_reps, targetWeightKg: set.target_weight_kg,
      targetRir: set.target_rir, actualReps: set.actual_reps, actualWeightKg: set.actual_weight_kg,
      isCompleted: set.is_completed, notes: set.notes === "" ? null : set.notes,
    })),
  };
}
export function sessionExerciseDto(exercise: WorkoutSessionExerciseDetail, routineAdditions = false): SessionExerciseDto {
  return {
    id: exercise.id, exerciseId: exercise.exercise_id, routineExerciseId: exercise.routine_exercise_id,
    order: exercise.exercise_order, nameSnapshot: exercise.nombre_snapshot,
    muscleGroupSnapshot: exercise.grupo_muscular_snapshot, muscleGroupLabelSnapshot: exercise.muscle_group_label_snapshot,
    implementSnapshot: exercise.implement_snapshot, weightModeSnapshot: exercise.weight_mode_snapshot,
    restMinSecondsSnapshot: exercise.rest_min_seconds_snapshot, restMaxSecondsSnapshot: exercise.rest_max_seconds_snapshot,
    nextAdjustmentSnapshot: exercise.next_adjustment_snapshot, nextAdjustmentNoteSnapshot: exercise.next_adjustment_note_snapshot,
    updatedAt: exercise.updated_at,
    payload: sessionPayloadDto({
      is_completed: exercise.sets.some((set) => set.is_completed), decision: exercise.decision,
      decision_note: exercise.decision_note ?? "", apply_to_routine: exercise.routine_exercise_id ? exercise.apply_to_routine : routineAdditions && exercise.add_to_routine_on_finish === true,
      notes: exercise.notes ?? "", sets: exercise.sets,
    }),
  };
}
export function sessionDetailDto(detail: WorkoutSessionDetail, quickHistory: SessionDetailDto["quickHistory"], routineAdditions = false): SessionDetailDto {
  const s = detail.session;
  return {
    session: {
      id: s.id, routineId: s.routine_id, routineNameSnapshot: s.routine_name_snapshot,
      name: s.session_name ?? s.routine_name_snapshot ?? "Sesión libre", status: s.status,
      logDate: detail.logDate, startedAt: s.started_at, endedAt: s.ended_at, updatedAt: s.updated_at,
      routineColor: detail.routineColor,
      metadata: {
        energyLevel: s.energy_level, performanceLevel: s.performance_level, painLevel: s.pain_level,
        painNote: s.pain_note, treadmillMinutes: s.treadmill_minutes, treadmillDistanceKm: s.treadmill_distance_km,
        treadmillSpeedKmh: s.treadmill_speed_kmh, treadmillInclinePercent: s.treadmill_incline_percent, notes: s.notes,
      },
    },
    exercises: detail.exercises.map(exercise => sessionExerciseDto(exercise, routineAdditions)), quickHistory,
  };
}

// M3.4-1 — finish, historical correction, discard and history reads.
export type SessionFinishMetadataDto = {
  energyLevel: number | null;
  performanceLevel: number | null;
  painLevel: number | null;
  notes: string | null;
};
export type SessionFinishInput = { metadata: SessionFinishMetadataDto; idempotencyKey: string };
export type RoutineAdditionDto = { sessionExerciseId: string; exerciseId: string; name: string; outcome: "added" | "already_in_routine" | "routine_unavailable" | "no_completed_sets" };
export type SessionFinishedDto = {
  routineAdditions?: RoutineAdditionDto[];
  status: "finished";
  sessionId: string;
  sessionStatus: "completed";
  name: string;
  routineId: string | null;
  logDate: string;
  startedAt: string;
  endedAt: string;
  sessionUpdatedAt: string;
  metadata: SessionFinishMetadataDto;
  exerciseCount: number;
  completedExerciseCount: number;
  completedSetCount: number;
};
export type SessionCorrectionSetDto = {
  setNumber: number;
  actualReps: number | null;
  actualWeightKg: number | null;
  notes: string | null;
};
export type SessionCorrectionInput = {
  expectedSessionUpdatedAt: string;
  metadata: SessionMetadataDto;
  exercises: Array<{ sessionExerciseId: string; expectedUpdatedAt: string; notes: string | null; sets: SessionCorrectionSetDto[] }>;
  idempotencyKey: string;
};
export type SessionCorrectedDto = {
  status: "corrected";
  sessionId: string;
  sessionUpdatedAt: string;
  metadata: SessionMetadataDto;
  exercises: Array<{ id: string; updatedAt: string; notes: string | null; sets: SessionCorrectionSetDto[] }>;
};
export type SessionDiscardedDto = { status: "discarded"; sessionId: string; sessionUpdatedAt: string };
export type TrainingHistorySessionDto = {
  id: string;
  routineId: string | null;
  routineName: string;
  routineColor: MobileRoutineColorKey | null;
  logDate: string;
  startedAt: string;
  endedAt: string;
  durationMilliseconds: number | null;
  exercisesCompleted: number;
  completedSets: number;
  volumeKg: number | null;
};
export type TrainingHistoryResponse = { sessions: TrainingHistorySessionDto[]; nextCursor: string | null };
/** One month of stored training days with the person-relative intensity (1–4); absent days = not trained. */
export type TrainingHistoryMonthResponse = {
  month: string;
  days: Array<{ date: string; sessions: number; completedSets: number; level: 1 | 2 | 3 | 4 }>;
};
/** Completed sessions of `date` and of the same weekday in the previous `weeks`: the routine recommendation's input. */
export type TrainingWeekdaySessionsResponse = {
  date: string;
  weeks: number;
  sessions: Array<{ id: string; routineId: string | null; logDate: string }>;
};
export const TRAINING_WEEKDAY_WEEKS_MAX = 26;
export function parseMobileTrainingWeeks(value: unknown): number {
  const weeks = typeof value === "string" && /^\d{1,2}$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > TRAINING_WEEKDAY_WEEKS_MAX) throw new MobileApiValidationError("Las semanas no son válidas.");
  return weeks;
}
export type TrainingDayResponse = {
  date: string;
  sessions: TrainingHistorySessionDto[];
  summary: { sessionCount: number; exercisesCompleted: number; completedSets: number; durationMilliseconds: number | null; volumeKg: number | null };
};

function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}
// Storage stores '' as NULL; normalize first so retries hash identically.
function storedText(value: unknown): string | null {
  const result = nullableText(value);
  return result === "" ? null : result;
}
function required(input: Record<string, unknown>, keys: readonly string[]) {
  if (keys.some((key) => !Object.hasOwn(input, key))) throw new MobileApiValidationError("Faltan datos obligatorios.");
}
function counter(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new MobileApiValidationError("El conteo no es válido.");
  return value;
}
const FINISH_METADATA_KEYS = ["energyLevel", "performanceLevel", "painLevel", "notes"] as const;
function finishMetadata(value: unknown): SessionFinishMetadataDto {
  const input = object(value, FINISH_METADATA_KEYS); required(input, FINISH_METADATA_KEYS);
  return { energyLevel: number(input.energyLevel), performanceLevel: number(input.performanceLevel),
    painLevel: number(input.painLevel), notes: storedText(input.notes) };
}
export function parseSessionFinish(value: unknown): SessionFinishInput {
  const input = object(value, ["metadata", "idempotencyKey"]); required(input, ["metadata", "idempotencyKey"]);
  const metadata = finishMetadata(input.metadata);
  try {
    validateSessionMetadata({ session_name: "", energy_level: metadata.energyLevel, performance_level: metadata.performanceLevel,
      pain_level: metadata.painLevel, pain_note: "", treadmill_minutes: null, treadmill_distance_km: null,
      treadmill_speed_kmh: null, treadmill_incline_percent: null, notes: metadata.notes ?? "" });
  } catch (error) { throw new MobileApiValidationError(error instanceof Error ? error.message : "El resumen no es válido."); }
  return { metadata, idempotencyKey: parseMobileIdempotencyKey(input.idempotencyKey) };
}
export function sessionFinishDomainMetadata(metadata: SessionFinishMetadataDto) {
  return { energy_level: metadata.energyLevel, performance_level: metadata.performanceLevel,
    pain_level: metadata.painLevel, notes: metadata.notes };
}
function parseRoutineAdditions(value: unknown): RoutineAdditionDto[] {
  if (!Array.isArray(value)) throw new MobileApiValidationError("El resumen de rutina no es válido.");
  return value.map(raw => {
    const row = object(raw, ["sessionExerciseId", "exerciseId", "name", "outcome"]);
    if (!["added", "already_in_routine", "routine_unavailable", "no_completed_sets"].includes(String(row.outcome))) throw new MobileApiValidationError("El resultado de rutina no es válido.");
    return { sessionExerciseId: parseMobileTrainingId(row.sessionExerciseId, "El ejercicio de sesión"), exerciseId: parseMobileTrainingId(row.exerciseId, "El ejercicio"), name: text(row.name), outcome: row.outcome as RoutineAdditionDto["outcome"] };
  });
}
export function parseSessionFinishedResponse(value: unknown): SessionFinishedDto {
  const input = object(value, ["status", "sessionId", "sessionStatus", "name", "routineId", "logDate", "startedAt", "endedAt",
    "sessionUpdatedAt", "metadata", "exerciseCount", "completedExerciseCount", "completedSetCount", "routineAdditions"]);
  if (input.status !== "finished" || input.sessionStatus !== "completed") throw new MobileApiValidationError("La respuesta de finalización no es válida.");
  return {
    ...(input.routineAdditions === undefined ? {} : { routineAdditions: parseRoutineAdditions(input.routineAdditions) }),
    status: "finished", sessionId: parseMobileTrainingId(input.sessionId, "La sesión"), sessionStatus: "completed",
    name: text(input.name), routineId: input.routineId === null ? null : parseMobileTrainingId(input.routineId, "La rutina"),
    logDate: parseMobileTrainingDate(input.logDate), startedAt: parseSessionVersion(input.startedAt),
    endedAt: parseSessionVersion(input.endedAt), sessionUpdatedAt: parseSessionVersion(input.sessionUpdatedAt),
    metadata: finishMetadata(input.metadata), exerciseCount: counter(input.exerciseCount),
    completedExerciseCount: counter(input.completedExerciseCount), completedSetCount: counter(input.completedSetCount),
  };
}

const CORRECTION_METADATA_KEYS = ["energyLevel", "performanceLevel", "painLevel", "painNote", "treadmillMinutes",
  "treadmillDistanceKm", "treadmillSpeedKmh", "treadmillInclinePercent", "notes"] as const;
function correctionMetadata(value: unknown): SessionMetadataDto {
  const input = object(value, CORRECTION_METADATA_KEYS); required(input, CORRECTION_METADATA_KEYS);
  return { energyLevel: number(input.energyLevel), performanceLevel: number(input.performanceLevel), painLevel: number(input.painLevel),
    painNote: storedText(input.painNote), treadmillMinutes: number(input.treadmillMinutes), treadmillDistanceKm: number(input.treadmillDistanceKm),
    treadmillSpeedKmh: number(input.treadmillSpeedKmh), treadmillInclinePercent: number(input.treadmillInclinePercent), notes: storedText(input.notes) };
}
function correctionSet(value: unknown): SessionCorrectionSetDto {
  const input = object(value, ["setNumber", "actualReps", "actualWeightKg", "notes"]);
  required(input, ["setNumber", "actualReps", "actualWeightKg", "notes"]);
  const setNumber = number(input.setNumber);
  if (setNumber === null || !Number.isInteger(setNumber) || setNumber < 1 || setNumber > 50) throw new MobileApiValidationError("La serie no es válida.");
  return { setNumber, actualReps: number(input.actualReps), actualWeightKg: number(input.actualWeightKg), notes: storedText(input.notes) };
}
export function parseSessionCorrection(value: unknown): SessionCorrectionInput {
  const input = object(value, ["expectedSessionUpdatedAt", "metadata", "exercises", "idempotencyKey"]);
  required(input, ["expectedSessionUpdatedAt", "metadata", "exercises", "idempotencyKey"]);
  if (!Array.isArray(input.exercises) || input.exercises.length > 200) throw new MobileApiValidationError("Los ejercicios no son válidos.");
  const exercises = input.exercises.map((raw) => {
    const exercise = object(raw, ["sessionExerciseId", "expectedUpdatedAt", "notes", "sets"]);
    required(exercise, ["sessionExerciseId", "expectedUpdatedAt", "notes", "sets"]);
    if (!Array.isArray(exercise.sets) || exercise.sets.length > 50) throw new MobileApiValidationError("Las series no son válidas.");
    const sets = exercise.sets.map(correctionSet);
    if (new Set(sets.map((set) => set.setNumber)).size !== sets.length) throw new MobileApiValidationError("Las series no pueden repetirse.");
    return { sessionExerciseId: parseMobileTrainingId(exercise.sessionExerciseId, "El ejercicio de sesión").toLowerCase(),
      expectedUpdatedAt: parseSessionVersion(exercise.expectedUpdatedAt), notes: storedText(exercise.notes), sets };
  });
  if (new Set(exercises.map((exercise) => exercise.sessionExerciseId)).size !== exercises.length) {
    throw new MobileApiValidationError("Los ejercicios no pueden repetirse.");
  }
  const parsed: SessionCorrectionInput = { expectedSessionUpdatedAt: parseSessionVersion(input.expectedSessionUpdatedAt),
    metadata: correctionMetadata(input.metadata), exercises, idempotencyKey: parseMobileIdempotencyKey(input.idempotencyKey) };
  // Reuse the Web correction rules. Sets are addressed by set number here; the
  // database wrapper resolves them to their IDs within the owned exercise.
  try {
    validateCompletedSessionCorrection({
      sessionId: "mobile", expectedSessionUpdatedAt: parsed.expectedSessionUpdatedAt,
      metadata: sessionCorrectionDomainMetadata(parsed.metadata),
      exercises: parsed.exercises.map((exercise) => ({ id: exercise.sessionExerciseId, expectedUpdatedAt: exercise.expectedUpdatedAt,
        notes: exercise.notes ?? "", sets: exercise.sets.map((set) => ({ id: String(set.setNumber), actual_reps: set.actualReps,
          actual_weight_kg: set.actualWeightKg, notes: set.notes ?? "" })) })),
    });
  } catch (error) { throw new MobileApiValidationError(error instanceof Error ? error.message : "La corrección no es válida."); }
  return parsed;
}
function sessionCorrectionDomainMetadata(metadata: SessionMetadataDto) {
  return { energy_level: metadata.energyLevel, performance_level: metadata.performanceLevel, pain_level: metadata.painLevel,
    pain_note: metadata.painNote ?? "", treadmill_minutes: metadata.treadmillMinutes, treadmill_distance_km: metadata.treadmillDistanceKm,
    treadmill_speed_kmh: metadata.treadmillSpeedKmh, treadmill_incline_percent: metadata.treadmillInclinePercent, notes: metadata.notes ?? "" };
}
export function sessionCorrectionDomainPayload(input: SessionCorrectionInput) {
  return {
    metadata: { ...sessionCorrectionDomainMetadata(input.metadata), pain_note: input.metadata.painNote, notes: input.metadata.notes },
    exercises: input.exercises.map((exercise) => ({
      session_exercise_id: exercise.sessionExerciseId, expected_updated_at: exercise.expectedUpdatedAt, notes: exercise.notes,
      sets: exercise.sets.map((set) => ({ set_number: set.setNumber, actual_reps: set.actualReps, actual_weight_kg: set.actualWeightKg, notes: set.notes })),
    })),
  };
}
export function parseSessionCorrectedResponse(value: unknown): SessionCorrectedDto {
  const input = object(value, ["status", "sessionId", "sessionUpdatedAt", "metadata", "exercises"]);
  if (input.status !== "corrected" || !Array.isArray(input.exercises)) throw new MobileApiValidationError("La respuesta de corrección no es válida.");
  return {
    status: "corrected", sessionId: parseMobileTrainingId(input.sessionId, "La sesión"),
    sessionUpdatedAt: parseSessionVersion(input.sessionUpdatedAt), metadata: correctionMetadata(input.metadata),
    exercises: input.exercises.map((raw) => {
      const exercise = object(raw, ["id", "updatedAt", "notes", "sets"]);
      if (!Array.isArray(exercise.sets)) throw new MobileApiValidationError("La respuesta de corrección no es válida.");
      return { id: parseMobileTrainingId(exercise.id, "El ejercicio de sesión"), updatedAt: parseSessionVersion(exercise.updatedAt),
        notes: nullableText(exercise.notes), sets: exercise.sets.map(correctionSet) };
    }),
  };
}
export function parseSessionDiscard(value: unknown) {
  const input = object(value, ["idempotencyKey"]);
  return { idempotencyKey: parseMobileIdempotencyKey(input.idempotencyKey) };
}
export function parseSessionDiscardedResponse(value: unknown): SessionDiscardedDto {
  const input = object(value, ["status", "sessionId", "sessionUpdatedAt"]);
  if (input.status !== "discarded") throw new MobileApiValidationError("La respuesta de eliminación no es válida.");
  return { status: "discarded", sessionId: parseMobileTrainingId(input.sessionId, "La sesión"), sessionUpdatedAt: parseSessionVersion(input.sessionUpdatedAt) };
}

export function parseMobileTrainingDate(value: unknown): string {
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new MobileApiValidationError("La fecha debe tener formato YYYY-MM-DD.");
  }
  return value as string;
}
export type TrainingHistoryCursor = { endedAt: string; id: string };
// Opaque to clients; the timestamp is kept verbatim (microsecond keyset).
export function encodeTrainingHistoryCursor(cursor: TrainingHistoryCursor): string {
  return Buffer.from(JSON.stringify([cursor.endedAt, cursor.id]), "utf8").toString("base64url");
}
export function parseTrainingHistoryCursor(value: string | null): TrainingHistoryCursor | undefined {
  if (value === null) return undefined;
  try {
    if (value.length > 200 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("format");
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Array.isArray(decoded) || decoded.length !== 2) throw new Error("shape");
    return { endedAt: parseSessionVersion(decoded[0]), id: parseMobileTrainingId(decoded[1], "El cursor").toLowerCase() };
  } catch { throw new MobileApiValidationError("El cursor no es válido."); }
}
export function parseTrainingHistoryLimit(value: string | null): number {
  if (value === null) return 20;
  if (!/^\d{1,3}$/.test(value) || Number(value) < 1 || Number(value) > 50) throw new MobileApiValidationError("El límite no es válido.");
  return Number(value);
}

// M3.4-3 — exercise history reads (additive). Marks are computed server-side
// with the Web domain helpers so Mobile never re-derives "best"/"latest".
export type TrainingHistoryMarkDto = { weightKg: number | null; reps: number | null };
export type TrainingHistoryExerciseDto = {
  id: string;
  name: string;
  muscleGroup: string | null;
  muscleLabel: string | null;
  implement: string | null;
  weightMode: string | null;
  lastDate: string | null;
  sessions: number;
  lastMark: TrainingHistoryMarkDto | null;
  bestMark: TrainingHistoryMarkDto | null;
};
export type TrainingHistoryExercisesResponse = { exercises: TrainingHistoryExerciseDto[] };
export type TrainingExerciseHistorySessionDto = {
  routineId?: string | null;
  sessionId: string;
  logDate: string;
  routineName: string;
  mark: TrainingHistoryMarkDto | null;
  completedSets: number;
  rirValues: number[];
};
export type TrainingExerciseHistoryResponse = {
  routines?: Array<{ id: string; name: string }>;
  exercise: { id: string; name: string; muscleGroup: string | null; muscleLabel: string | null; implement: string | null; weightMode: string | null };
  latest: TrainingExerciseHistorySessionDto | null;
  best: TrainingExerciseHistorySessionDto | null;
  sessions: TrainingExerciseHistorySessionDto[];
  hasMore: boolean;
};
export function parseExerciseHistoryLimit(value: string | null): number {
  if (value === null) return 20;
  if (!/^\d{1,3}$/.test(value) || Number(value) < 1 || Number(value) > 100) throw new MobileApiValidationError("El límite no es válido.");
  return Number(value);
}

const TRAINING_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
export function parseMobileTrainingMonth(value: unknown): string {
  if (typeof value !== "string" || !TRAINING_MONTH.test(value)) throw new MobileApiValidationError("El mes no es válido.");
  return value;
}
