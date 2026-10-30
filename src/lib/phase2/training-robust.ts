import "server-only";

import {
  measurePerformance,
} from "@/lib/request-performance";
import { getOrCreateDayLog } from "@/lib/phase1/day-log";
import {
  buildHomeActiveSessionSummary,
  type HomeActiveSessionSummary,
} from "@/lib/home-dashboard";
import {
  requireAuthenticatedRequestContext,
  type AuthenticatedRequestContext,
} from "@/lib/supabase/server";
import { getPreviousProgressPeriod } from "../progress/analytics/periods";
import type { ProgressTemporalComparisonReference } from "../progress/comparisons";
import {
  buildTrainingGeneralAnalytics,
  type TrainingGeneralAnalytics,
} from "../progress/training-performance";
import {
  buildTrainingRoutinesAnalytics,
  type TrainingRoutinesAnalytics,
} from "../progress/training-routines";
import {
  buildTrainingMusclesAnalytics,
  type TrainingMusclesAnalytics,
} from "../progress/training-muscles";
import {
  buildTrainingExercisesAnalytics,
  type TrainingExercisesAnalytics,
} from "../progress/training-exercises";
import { todayInCordoba } from "./cordoba-date";
import { INITIAL_TRAINING_PLAN } from "./initial-plan";
import {
  addUtcDays,
  buildWeeklyTrainingSummaries,
  mondayOfIsoDate,
} from "./training-progress-summary";
import {
  buildTrainingAnalysis,
  type TrainingAnalysis,
  type TrainingAnalysisPeriod,
} from "./training-analysis";
import { listExercises, listRoutines } from "./training";
import { daysBetweenIsoDates } from "./session-history";
import { buildTrainingHistoryDirectory, type TrainingHistoryDirectory } from "./training-history";
import { resolveWorkoutSessionLookup } from "./training-session-lookup";
import { summarizeTrainingSessionVolume } from "./training-day-summary";
import {
  validateCompletedSessionCorrection,
  validateRoutineExercisePayload,
  validateSessionMetadata,
  validateWorkoutExercisePayload,
} from "./training-validation";
import type {
  EditableWorkoutSet,
  CompletedSessionCorrectionInput,
  CompletedSessionSummary,
  ExerciseProgressSummary,
  Routine,
  RoutineExercisePayload,
  RoutineExerciseSet,
  RoutineExerciseTemplate,
  RoutineContinuity,
  SessionMetadataInput,
  WeeklyTrainingSummary,
  WorkoutExercisePayload,
  WorkoutSession,
  WorkoutSessionDetail,
  WorkoutSessionExercise,
  WorkoutSessionExerciseDetail,
  WorkoutSet,
} from "./types";
import type { RoutineColorKey } from "./routine-colors";

type ErrorLike = {
  code?: string;
  message?: string;
};

function errorLike(value: unknown): ErrorLike {
  if (typeof value !== "object" || value === null) return {};
  const record = value as Record<string, unknown>;
  return {
    code: typeof record.code === "string" ? record.code : undefined,
    message: typeof record.message === "string" ? record.message : undefined,
  };
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requireUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`${label}: respuesta inválida de la base.`);
  }
  return value;
}

async function getAuthedContext(
  context?: AuthenticatedRequestContext,
): Promise<AuthenticatedRequestContext> {
  return context ?? requireAuthenticatedRequestContext();
}

function throwRpcError(label: string, value: unknown): never {
  const { code, message } = errorLike(value);
  if (code === "40001") {
    throw new Error(
      "Este ejercicio cambió en otro dispositivo. Recargá la sesión antes de guardar.",
      { cause: value },
    );
  }
  throw new Error(`${label}: ${message ?? "error inesperado."}`, { cause: value });
}

export type WorkoutSaveErrorCategory =
  | "transient"
  | "conflict"
  | "timeout"
  | "session_closed"
  | "removed"
  | "validation";

export class WorkoutSaveError extends Error {
  constructor(
    public readonly category: WorkoutSaveErrorCategory,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "WorkoutSaveError";
  }
}

export function workoutSaveErrorCategory(error: unknown): WorkoutSaveErrorCategory {
  return error instanceof WorkoutSaveError ? error.category : "transient";
}

function throwWorkoutSaveRpcError(value: unknown): never {
  const { code, message } = errorLike(value);
  const normalized = message?.toLocaleLowerCase("es") ?? "";
  if (code === "40001") {
    throw new WorkoutSaveError(
      "conflict",
      "Este ejercicio cambió en otra pestaña. Estamos comprobando la versión guardada.",
      value,
    );
  }
  if (
    code === "55P03" ||
    code === "57014" ||
    normalized.includes("lock timeout") ||
    normalized.includes("statement timeout") ||
    normalized.includes("aborted") ||
    normalized.includes("timed out")
  ) {
    throw new WorkoutSaveError(
      "timeout",
      "El guardado demoró demasiado. Tus cambios siguen acá; reintentá.",
      value,
    );
  }
  if (
    message === "SESSION_CLOSED" ||
    normalized.includes("sesión ya finalizó") ||
    normalized.includes("sesion ya finalizo") ||
    normalized.includes("sesión ya fue finalizada")
  ) {
    throw new WorkoutSaveError(
      "session_closed",
      "La sesión ya fue finalizada. Actualizá para ver el estado guardado.",
      value,
    );
  }
  if (message === "SESSION_EXERCISE_REMOVED" || message === "TRAINING_SESSION_EXERCISE_NOT_FOUND" || message === "TRAINING_SESSION_NOT_FOUND") {
    throw new WorkoutSaveError("removed", "Este ejercicio o sesión ya no está disponible. Actualizá para continuar.", value);
  }
  if (code === "P0001" || code === "22023" || code === "22P02" || code === "23514") {
    throw new WorkoutSaveError(
      "validation",
      message ?? "Los datos del ejercicio no son válidos.",
      value,
    );
  }
  throw new WorkoutSaveError(
    "transient",
    "No se pudo guardar. Revisá la conexión y reintentá.",
    value,
  );
}

export { todayInCordoba } from "./cordoba-date";

export async function getInitialPlanStatus(
  context?: AuthenticatedRequestContext,
): Promise<{
  imported: boolean;
  routinesFound: number;
}> {
  const { supabase, userId } = await getAuthedContext(context);
  const keys = INITIAL_TRAINING_PLAN.routines.map((routine) => routine.source_key);
  const { data, error } = await supabase
    .from("routines")
    .select("source_key")
    .eq("user_id", userId)
    .in("source_key", keys);
  if (error) throw new Error(`Revisar plan inicial: ${error.message}`);
  const found = new Set(
    ((data ?? []) as Array<{ source_key: string | null }>)
      .map((row) => row.source_key)
      .filter((key): key is string => Boolean(key)),
  );
  return { imported: keys.every((key) => found.has(key)), routinesFound: found.size };
}

export async function importInitialTrainingPlan(
  context?: AuthenticatedRequestContext,
): Promise<{
  routines: number;
  exercises: number;
}> {
  const { supabase } = await getAuthedContext(context);
  const { data, error } = await supabase.rpc("import_training_plan", {
    p_plan: INITIAL_TRAINING_PLAN,
  });
  if (error) throwRpcError("Importar rutinas", error);
  if (typeof data !== "object" || data === null) {
    throw new Error("Importar rutinas: respuesta inválida de la base.");
  }
  const result = data as Record<string, unknown>;
  return {
    routines: Number(result.routines ?? 0),
    exercises: Number(result.exercises ?? 0),
  };
}

type RawRoutineExercise = Omit<RoutineExerciseTemplate, "exercise" | "sets"> & {
  exercise:
    | RoutineExerciseTemplate["exercise"]
    | RoutineExerciseTemplate["exercise"][]
    | null;
  sets: RoutineExerciseSet[] | null;
};

export async function getRoutineTemplate(
  routineId: string,
  context?: AuthenticatedRequestContext,
): Promise<{
  routine: Routine;
  exercises: RoutineExerciseTemplate[];
}> {
  const { supabase, userId } = await getAuthedContext(context);
  const [{ data: routine, error: routineError }, { data: items, error: itemsError }] =
    await Promise.all([
      supabase
        .from("routines")
        .select("*")
        .eq("id", routineId)
        .eq("user_id", userId)
        .single(),
      supabase
        .from("routine_exercises")
        .select(
          `
            *,
            exercise:exercises(
              id,
              nombre,
              grupo_muscular,
              muscle_group_label,
              implement,
              weight_mode,
              is_active
            ),
            sets:routine_exercise_sets(*)
          `,
        )
        .eq("routine_id", routineId)
        .order("exercise_order", { ascending: true }),
    ]);

  if (routineError) throw new Error(`Leer rutina: ${routineError.message}`);
  if (itemsError) throw new Error(`Leer objetivos: ${itemsError.message}`);

  const exercises = ((items ?? []) as RawRoutineExercise[]).map((row) => {
    const exercise = firstRelation(row.exercise);
    if (!exercise) throw new Error("La rutina contiene un ejercicio inexistente.");
    return {
      ...row,
      exercise,
      sets: [...(row.sets ?? [])].sort((a, b) => a.set_number - b.set_number),
    };
  });

  return { routine: routine as Routine, exercises };
}

export async function saveRoutineExerciseTarget(input: {
  routineExerciseId: string;
  payload: RoutineExercisePayload;
}): Promise<string> {
  validateRoutineExercisePayload(input.payload);
  const { supabase } = await getAuthedContext();
  const { data, error } = await supabase.rpc("save_routine_exercise", {
    p_routine_exercise_id: input.routineExerciseId,
    p_payload: input.payload,
  });
  if (error) throwRpcError("Guardar objetivo", error);
  if (typeof data !== "string") {
    throw new Error("Guardar objetivo: respuesta inválida de la base.");
  }
  return data;
}

export async function moveRoutineExerciseTarget(input: {
  routineExerciseId: string;
  direction: -1 | 1;
}) {
  const { supabase } = await getAuthedContext();
  const { error } = await supabase.rpc("move_routine_exercise", {
    p_routine_exercise_id: input.routineExerciseId,
    p_direction: input.direction,
  });
  if (error) throwRpcError("Mover ejercicio", error);
}

export async function startWorkoutSession(input: {
  date: string;
  routineId: string | null;
}, context?: AuthenticatedRequestContext): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error("La fecha no es válida.");
  }
  const auth = await getAuthedContext(context);
  const dayLog = await getOrCreateDayLog(input.date, auth);
  const { supabase } = auth;
  const { data, error } = await supabase.rpc("start_workout_session", {
    p_day_log_id: dayLog.id,
    p_routine_id: input.routineId,
  });
  if (error) {
    const { message } = errorLike(error);
    if (message?.includes("ACTIVE_SESSION_EXISTS")) {
      throw new Error(
        "Ya tenés una sesión de entrenamiento en curso. Continuá esa sesión o finalizala antes de iniciar otra.",
        { cause: error },
      );
    }
    throwRpcError("Iniciar sesión", error);
  }
  return requireUuid(data, "Iniciar sesión");
}

export async function appendWorkoutExercise(input: {
  sessionId: string;
  exerciseId: string;
}): Promise<string> {
  const { supabase } = await getAuthedContext();
  const { data, error } = await supabase.rpc("append_workout_exercise", {
    p_session_id: input.sessionId,
    p_exercise_id: input.exerciseId,
    p_source_type: "extra",
  });
  if (error) throwRpcError("Agregar ejercicio", error);
  return requireUuid(data, "Agregar ejercicio");
}

type RawSessionExercise = WorkoutSessionExercise & {
  sets: WorkoutSet[] | null;
};

type RawWorkoutSession = WorkoutSession & {
  routine: { color: RoutineColorKey | null } | Array<{ color: RoutineColorKey | null }> | null;
};

export async function getWorkoutSessionDetail(
  sessionId: string,
  context?: AuthenticatedRequestContext,
): Promise<WorkoutSessionDetail | null> {
  const { supabase, userId } = context ?? await getAuthedContext();
  const { data: session, error: sessionError } = await supabase
    .from("workout_sessions")
    .select("*, routine:routines(color)")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  const rawSession = (session ?? null) as RawWorkoutSession | null;
  const typedSession = resolveWorkoutSessionLookup(
    rawSession,
    sessionError,
  );
  if (!typedSession) return null;

  const [{ data: dayLog, error: dayError }, { data: rows, error: rowsError }] =
    await Promise.all([
      supabase
        .from("day_logs")
        .select("log_date")
        .eq("id", typedSession.day_log_id)
        .eq("user_id", userId)
        .single(),
      supabase
        .from("workout_session_exercises")
        .select("*, sets:workout_sets(*)")
        .eq("workout_session_id", sessionId)
        .eq("user_id", userId)
        .order("exercise_order", { ascending: true }),
    ]);
  if (dayError) throw new Error(`Leer fecha de sesión: ${dayError.message}`);
  if (rowsError) throw new Error(`Leer ejercicios de sesión: ${rowsError.message}`);

  const exercises: WorkoutSessionExerciseDetail[] = (
    (rows ?? []) as RawSessionExercise[]
  ).map((row) => ({
    ...row,
    sets: [...(row.sets ?? [])].sort((a, b) => a.set_number - b.set_number),
  }));

  return {
    session: typedSession,
    routineColor: firstRelation(rawSession?.routine)?.color ?? null,
    logDate: String((dayLog as { log_date: string }).log_date),
    exercises,
  };
}

export type WorkoutExerciseSyncState =
  | { status: "active"; payload: WorkoutExercisePayload; updatedAt: string }
  | { status: "session_closed" }
  | { status: "removed" };

function syncPayloadFromExercise(
  exercise: WorkoutSessionExerciseDetail,
): WorkoutExercisePayload {
  const sets = [...exercise.sets]
    .sort((left, right) => left.set_number - right.set_number)
    .map((set) => ({
      set_number: set.set_number,
      target_reps: set.target_reps,
      target_weight_kg: set.target_weight_kg,
      target_rir: set.target_rir,
      actual_reps: set.actual_reps,
      actual_weight_kg: set.actual_weight_kg,
      is_completed: set.is_completed,
      notes: set.notes,
    }));
  return {
    is_completed: sets.some((set) => set.is_completed),
    decision: exercise.decision,
    decision_note: exercise.decision_note ?? "",
    apply_to_routine: exercise.routine_exercise_id
      ? exercise.apply_to_routine
      : false,
    notes: exercise.notes ?? "",
    sets,
  };
}

export async function getWorkoutExerciseSyncState(input: {
  sessionId: string;
  sessionExerciseId: string;
}): Promise<WorkoutExerciseSyncState> {
  const { supabase, userId, requestPerformance } = await getAuthedContext();
  return measurePerformance({
    route: "/train/session/[id]",
    operation: "workout.save-exercise-readback",
    layer: "database",
    ...requestPerformance,
  }, async () => {
    const { data: session, error: sessionError } = await supabase
      .from("workout_sessions")
      .select("status")
      .eq("id", input.sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (sessionError) {
      throw new Error(`Comprobar sesión: ${sessionError.message}`, { cause: sessionError });
    }
    if (!session) return { status: "removed" };
    if ((session as { status: string }).status !== "in_progress") {
      return { status: "session_closed" };
    }

    const { data, error } = await supabase
      .from("workout_session_exercises")
      .select("*, sets:workout_sets(*)")
      .eq("id", input.sessionExerciseId)
      .eq("workout_session_id", input.sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(`Comprobar ejercicio: ${error.message}`, { cause: error });
    if (!data) return { status: "removed" };

    const exercise = data as RawSessionExercise;
    return {
      status: "active",
      payload: syncPayloadFromExercise({
        ...exercise,
        sets: exercise.sets ?? [],
      }),
      updatedAt: exercise.updated_at,
    };
  });
}

export async function saveWorkoutExercise(input: {
  sessionExerciseId: string;
  expectedUpdatedAt: string;
  payload: WorkoutExercisePayload;
}): Promise<string> {
  try {
    validateWorkoutExercisePayload(input.payload);
  } catch (error) {
    throw new WorkoutSaveError(
      "validation",
      error instanceof Error ? error.message : "Los datos del ejercicio no son válidos.",
    );
  }
  const { supabase, requestPerformance } = await getAuthedContext();
  return measurePerformance({
    route: "/train/session/[id]",
    operation: "workout-save.rpc",
    layer: "database",
    ...requestPerformance,
  }, async () => {
    const { data, error } = await supabase
      .rpc("save_workout_exercise", {
        p_session_exercise_id: input.sessionExerciseId,
        p_expected_updated_at: input.expectedUpdatedAt,
        p_payload: input.payload,
      })
      .abortSignal(AbortSignal.timeout(12_000));
    if (error) throwWorkoutSaveRpcError(error);
    if (typeof data !== "string") {
      throw new Error("Guardar ejercicio: respuesta inválida de la base.");
    }
    return data;
  });
}

export type WorkoutSessionCompletionState =
  | "completed"
  | "in_progress"
  | "not_confirmed";

export async function getWorkoutSessionCompletionState(
  sessionId: string,
): Promise<WorkoutSessionCompletionState> {
  const { supabase, userId, requestPerformance } = await getAuthedContext();
  return measurePerformance({
    route: "/train/session/[id]",
    operation: "workout.finish-readback",
    layer: "database",
    ...requestPerformance,
  }, async () => {
    const { data, error } = await supabase
      .from("workout_sessions")
      .select("status")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(`Comprobar finalización: ${error.message}`, { cause: error });
    const status = (data as { status?: string } | null)?.status;
    if (status === "completed" || status === "in_progress") return status;
    return "not_confirmed";
  });
}

export async function finishWorkoutSession(input: {
  sessionId: string;
  metadata: SessionMetadataInput;
}): Promise<string> {
  validateSessionMetadata(input.metadata);
  const { supabase, requestPerformance } = await getAuthedContext();
  return measurePerformance({
    route: "/train/session/[id]",
    operation: "workout.finish",
    layer: "database",
    ...requestPerformance,
  }, async () => {
    const { data, error } = await supabase.rpc("finish_workout_session", {
      p_session_id: input.sessionId,
      p_metadata: input.metadata,
    });
    if (error) throwRpcError("Finalizar sesión", error);
    return requireUuid(data, "Finalizar sesión");
  });
}

export async function cancelWorkoutSession(sessionId: string) {
  const { supabase } = await getAuthedContext();
  const { error } = await supabase.rpc("cancel_workout_session", { p_session_id: sessionId });
  if (error) throwRpcError("Cancelar sesión", error);
}

export function sessionDisplayName(
  session: Pick<WorkoutSession, "routine_name_snapshot" | "session_name">,
) {
  return session.routine_name_snapshot ?? session.session_name ?? "Sesión libre";
}

function sessionDurationMilliseconds(
  session: Pick<WorkoutSession, "started_at" | "ended_at">,
) {
  if (!session.started_at || !session.ended_at) return null;
  const milliseconds = new Date(session.ended_at).getTime() - new Date(session.started_at).getTime();
  return Number.isFinite(milliseconds) && milliseconds >= 0 ? milliseconds : null;
}

/**
 * Completed sessions of these days, owner-scoped: id, routine, date and start only. Two queries (the days, then
 * their sessions), with the same filters as `listCompletedSessionHistory({ logDate })`; no exercises or sets.
 */
export async function listCompletedSessionsOnDays(logDates: readonly string[], context?: AuthenticatedRequestContext) {
  const { supabase, userId } = context ?? await getAuthedContext();
  if (logDates.length === 0) return [] as Array<{ id: string; routineId: string | null; logDate: string; startedAt: string }>;
  const days = await readAllTrainingRows<{ id: string; log_date: string }>("Leer días de sesiones", (from, to) => supabase
    .from("day_logs")
    .select("id, log_date", firstPageCount(from))
    .eq("user_id", userId)
    .in("log_date", [...logDates])
    .order("id", { ascending: true })
    .range(from, to));
  const dateByDayLog = new Map(days.map((day) => [day.id, day.log_date]));
  if (dateByDayLog.size === 0) return [];
  const sessions = await readAllTrainingRows<{ id: string; routine_id: string | null; day_log_id: string; started_at: string }>(
    "Leer sesiones de los días", (from, to) => supabase
      .from("workout_sessions")
      .select("id, routine_id, day_log_id, started_at", firstPageCount(from))
      .eq("user_id", userId)
      .eq("status", "completed")
      .not("ended_at", "is", null)
      .in("day_log_id", [...dateByDayLog.keys()])
      .order("ended_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to));
  return sessions.flatMap((session) => {
    const logDate = dateByDayLog.get(session.day_log_id);
    return logDate ? [{ id: session.id, routineId: session.routine_id, logDate, startedAt: session.started_at }] : [];
  });
}

export async function listCompletedSessionHistory(input?: {
  limit?: number;
  logDate?: string;
  /** Keyset cursor: sessions strictly older than this (ended_at, id). */
  before?: { endedAt: string; id: string };
}, context?: AuthenticatedRequestContext) {
  const { supabase, userId } = context ?? await getAuthedContext();
  const limit = Math.min(Math.max(input?.limit ?? 20, 1), 100);
  const logDate = input?.logDate?.trim();
  const { data: matchingDays, error: matchingDaysError } = logDate
    ? await supabase
        .from("day_logs")
        .select("id")
        .eq("user_id", userId)
        .eq("log_date", logDate)
    : { data: null, error: null };
  if (matchingDaysError) throw new Error(`Leer día de sesiones: ${matchingDaysError.message}`);
  const matchingDayIds = (matchingDays ?? []) as Array<{ id: string }>;
  if (logDate && matchingDayIds.length === 0) return [] as CompletedSessionSummary[];

  let sessionsQuery = supabase
    .from("workout_sessions")
    .select("*, routine:routines(color)")
    .eq("user_id", userId)
    .eq("status", "completed")
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .order("id", { ascending: false });
  if (input?.before) {
    // Pass the PostgreSQL timestamp through verbatim: microseconds are the key.
    const { endedAt, id } = input.before;
    sessionsQuery = sessionsQuery.or(`ended_at.lt."${endedAt}",and(ended_at.eq."${endedAt}",id.lt.${id})`);
  }
  if (matchingDayIds.length > 0) {
    sessionsQuery = sessionsQuery.in("day_log_id", matchingDayIds.map((day) => day.id));
  }
  const { data: rawSessions, error: sessionError } = await sessionsQuery.limit(limit);
  if (sessionError) throw new Error(`Leer sesiones recientes: ${sessionError.message}`);
  const sessions = (rawSessions ?? []) as RawWorkoutSession[];
  if (sessions.length === 0) return [] as CompletedSessionSummary[];

  const sessionIds = sessions.map((session) => session.id);
  const dayLogIds = [...new Set(sessions.map((session) => session.day_log_id))];
  const [{ data: rawDays, error: daysError }, { data: rawExercises, error: exercisesError }] = await Promise.all([
    supabase.from("day_logs").select("id, log_date").eq("user_id", userId).in("id", dayLogIds),
    supabase
      .from("workout_session_exercises")
      .select("id, workout_session_id, is_completed, muscle_group_label_snapshot, grupo_muscular_snapshot")
      .eq("user_id", userId)
      .in("workout_session_id", sessionIds),
  ]);
  if (daysError) throw new Error(`Leer fechas de sesiones: ${daysError.message}`);
  if (exercisesError) throw new Error(`Leer ejercicios de sesiones: ${exercisesError.message}`);
  const exercises = (rawExercises ?? []) as Array<Pick<WorkoutSessionExercise, "id" | "workout_session_id" | "is_completed" | "muscle_group_label_snapshot" | "grupo_muscular_snapshot">>;
  const exerciseIds = exercises.map((exercise) => exercise.id);
  const { data: rawSets, error: setsError } = exerciseIds.length
    ? await supabase
        .from("workout_sets")
        .select("workout_session_exercise_id, actual_reps, actual_weight_kg")
        .eq("user_id", userId)
        .eq("is_completed", true)
        .in("workout_session_exercise_id", exerciseIds)
    : { data: [], error: null };
  if (setsError) throw new Error(`Leer series de sesiones: ${setsError.message}`);

  const dateByDayLog = new Map(
    ((rawDays ?? []) as Array<{ id: string; log_date: string }>).map((day) => [day.id, day.log_date]),
  );
  const exercisesBySession = new Map<string, typeof exercises>();
  const sessionIdByExercise = new Map(exercises.map((exercise) => [exercise.id, exercise.workout_session_id]));
  for (const exercise of exercises) {
    const items = exercisesBySession.get(exercise.workout_session_id) ?? [];
    items.push(exercise);
    exercisesBySession.set(exercise.workout_session_id, items);
  }
  const completedSetsBySession = new Map<string, number>();
  const completedSetRowsBySession = new Map<
    string,
    Array<Pick<WorkoutSet, "actual_reps" | "actual_weight_kg">>
  >();
  for (const set of (rawSets ?? []) as Array<
    Pick<WorkoutSet, "workout_session_exercise_id" | "actual_reps" | "actual_weight_kg">
  >) {
    const sessionId = sessionIdByExercise.get(set.workout_session_exercise_id);
    if (!sessionId) continue;
    completedSetsBySession.set(sessionId, (completedSetsBySession.get(sessionId) ?? 0) + 1);
    const setRows = completedSetRowsBySession.get(sessionId) ?? [];
    setRows.push(set);
    completedSetRowsBySession.set(sessionId, setRows);
  }

  return sessions.flatMap((session): CompletedSessionSummary[] => {
    const logDate = dateByDayLog.get(session.day_log_id);
    if (!logDate || !session.ended_at) return [];
    const sessionExercises = exercisesBySession.get(session.id) ?? [];
    const muscleGroups = [...new Set(sessionExercises
      .filter((exercise) => exercise.is_completed)
      .map((exercise) => exercise.muscle_group_label_snapshot ?? exercise.grupo_muscular_snapshot)
      .filter((group): group is string => Boolean(group)))];
    return [{
      id: session.id,
      routineId: session.routine_id,
      routineName: sessionDisplayName(session),
      logDate,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      durationMilliseconds: sessionDurationMilliseconds(session),
      exercisesCompleted: sessionExercises.filter((exercise) => exercise.is_completed).length,
      completedSets: completedSetsBySession.get(session.id) ?? 0,
      volumeKg: summarizeTrainingSessionVolume(completedSetRowsBySession.get(session.id) ?? []),
      routineColor: firstRelation(session.routine)?.color ?? null,
      muscleGroups,
    }];
  });
}

export async function getSessionContinuity(today = todayInCordoba()) {
  const { supabase, userId } = await getAuthedContext();
  const { data: rawRoutines, error: routinesError } = await supabase
    .from("routines")
    .select("id, nombre, color")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("routine_order", { ascending: true });
  if (routinesError) throw new Error(`Leer rutinas activas: ${routinesError.message}`);
  const routines = (rawRoutines ?? []) as Array<{ id: string; nombre: string; color: RoutineColorKey | null }>;
  if (routines.length === 0) return [] as RoutineContinuity[];
  const { data: rawSessions, error: sessionsError } = await supabase
    .from("workout_sessions")
    .select("routine_id, day_log_id, ended_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .in("routine_id", routines.map((routine) => routine.id))
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .limit(500);
  if (sessionsError) throw new Error(`Leer continuidad de rutinas: ${sessionsError.message}`);
  const sessions = (rawSessions ?? []) as Array<{ routine_id: string; day_log_id: string; ended_at: string }>;
  const dayLogIds = [...new Set(sessions.map((session) => session.day_log_id))];
  const { data: rawDays, error: daysError } = dayLogIds.length
    ? await supabase.from("day_logs").select("id, log_date").eq("user_id", userId).in("id", dayLogIds)
    : { data: [], error: null };
  if (daysError) throw new Error(`Leer fechas de continuidad: ${daysError.message}`);
  const dateByDayLog = new Map(
    ((rawDays ?? []) as Array<{ id: string; log_date: string }>).map((day) => [day.id, day.log_date]),
  );
  const lastDateByRoutine = new Map<string, string>();
  for (const session of sessions) {
    const logDate = dateByDayLog.get(session.day_log_id);
    if (logDate && !lastDateByRoutine.has(session.routine_id)) lastDateByRoutine.set(session.routine_id, logDate);
  }
  return routines.map((routine) => {
    const lastLogDate = lastDateByRoutine.get(routine.id) ?? null;
    return {
      routineId: routine.id,
      routineName: routine.nombre,
      routineColor: routine.color,
      lastLogDate,
      daysSince: lastLogDate ? daysBetweenIsoDates(lastLogDate, today) : null,
    };
  });
}

export async function correctCompletedWorkoutSession(input: CompletedSessionCorrectionInput) {
  validateCompletedSessionCorrection(input);
  const { supabase } = await getAuthedContext();
  const { data, error } = await supabase.rpc("correct_completed_workout_session", {
    p_session_id: input.sessionId,
    p_expected_session_updated_at: input.expectedSessionUpdatedAt,
    p_payload: {
      metadata: input.metadata,
      exercises: input.exercises.map((exercise) => ({
        id: exercise.id,
        expected_updated_at: exercise.expectedUpdatedAt,
        notes: exercise.notes,
        sets: exercise.sets,
      })),
    },
  });
  if (error) throwRpcError("Guardar correcciones", error);
  return requireUuid(data, "Guardar correcciones");
}

export async function discardCompletedWorkoutSession(sessionId: string) {
  const { supabase } = await getAuthedContext();
  const { data, error } = await supabase.rpc("discard_completed_workout_session", {
    p_session_id: sessionId,
  });
  if (error) throwRpcError("Eliminar sesión", error);
  return requireUuid(data, "Eliminar sesión");
}

export type RobustExerciseHistoryItem = {
  session: WorkoutSession;
  logDate: string;
  exercise: WorkoutSessionExerciseDetail;
};

type RobustExerciseHistoryQuery = {
  exerciseIds: readonly string[];
  fromDate?: string;
  toDate?: string;
  routineId?: string;
};

async function queryRobustExerciseHistory(
  input: RobustExerciseHistoryQuery,
  context?: AuthenticatedRequestContext,
): Promise<RobustExerciseHistoryItem[]> {
  const exerciseIds = [...new Set(input.exerciseIds)];
  if (exerciseIds.length === 0) return [];
  const { supabase, userId } = context ?? await getAuthedContext();
  let daysQuery = supabase
    .from("day_logs")
    .select("id, log_date")
    .eq("user_id", userId)
    .order("log_date", { ascending: false })
    .limit(500);
  if (input.fromDate) daysQuery = daysQuery.gte("log_date", input.fromDate);
  if (input.toDate) daysQuery = daysQuery.lte("log_date", input.toDate);
  const { data: rawDays, error: daysError } = await daysQuery;
  if (daysError) throw new Error(`Leer fechas históricas: ${daysError.message}`);
  const days = (rawDays ?? []) as Array<{ id: string; log_date: string }>;
  if (days.length === 0) return [];

  let sessionsQuery = supabase
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "completed")
    .in("day_log_id", days.map((day) => day.id))
    .order("ended_at", { ascending: false })
    .limit(500);
  if (input.routineId) sessionsQuery = sessionsQuery.eq("routine_id", input.routineId);
  const { data: rawSessions, error: sessionError } = await sessionsQuery;
  if (sessionError) throw new Error(`Leer sesiones históricas: ${sessionError.message}`);
  const sessions = (rawSessions ?? []) as WorkoutSession[];
  if (sessions.length === 0) return [];

  const { data: rawExercises, error: exerciseError } = await supabase
    .from("workout_session_exercises")
    .select("*, sets:workout_sets(*)")
    .eq("user_id", userId)
    .in("exercise_id", exerciseIds)
    .eq("is_completed", true)
    .in("workout_session_id", sessions.map((session) => session.id));
  if (exerciseError) throw new Error(`Leer historial del ejercicio: ${exerciseError.message}`);

  const exercises = ((rawExercises ?? []) as RawSessionExercise[]).map((row) => ({
    ...row,
    sets: [...(row.sets ?? [])].sort((a, b) => a.set_number - b.set_number),
  }));
  if (exercises.length === 0) return [];

  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const dateByDayLog = new Map(days.map((day) => [day.id, day.log_date]));

  return exercises
    .flatMap((exercise): RobustExerciseHistoryItem[] => {
      const session = sessionById.get(exercise.workout_session_id);
      if (!session) return [];
      const logDate = dateByDayLog.get(session.day_log_id);
      if (!logDate) return [];
      return [{ session, logDate, exercise }];
    })
    .sort(
      (left, right) =>
        (right.session.ended_at ?? right.logDate).localeCompare(left.session.ended_at ?? left.logDate) ||
        right.session.id.localeCompare(left.session.id),
    );
}

/**
 * Completed sets per stored training day in [from, to] (inclusive log dates).
 * Only days with at least one completed session are returned; a session with no
 * completed sets still counts as a trained day (0 sets), never as missing.
 */
export async function listCompletedSetsByDay(input: { from: string; to: string }, context: AuthenticatedRequestContext): Promise<Array<{ date: string; sessions: number; completedSets: number }>> {
  const { supabase, userId } = context;
  type SessionRow = { id: string; day_log: { log_date: string } };
  const sessions = await readAllTrainingRows<SessionRow>("Leer días entrenados", (from, to) => supabase
    .from("workout_sessions").select("id, day_log:day_logs!inner(log_date)")
    .eq("user_id", userId).eq("status", "completed").not("ended_at", "is", null)
    .gte("day_log.log_date", input.from).lte("day_log.log_date", input.to)
    .order("id", { ascending: true }).range(from, to).returns<SessionRow[]>());
  const days = new Map<string, { date: string; sessions: number; completedSets: number }>();
  const dateBySession = new Map<string, string>();
  for (const session of sessions) {
    const date = session.day_log.log_date;
    dateBySession.set(session.id, date);
    const day = days.get(date) ?? { date, sessions: 0, completedSets: 0 };
    day.sessions += 1; days.set(date, day);
  }
  if (!sessions.length) return [];
  type SetRow = { exercise: { workout_session_id: string } };
  const ids = [...dateBySession.keys()];
  for (let index = 0; index < ids.length; index += 150) {
    const chunk = ids.slice(index, index + 150);
    const sets = await readAllTrainingRows<SetRow>("Leer series por día", (from, to) => supabase
      .from("workout_sets").select("exercise:workout_session_exercises!inner(workout_session_id)")
      .eq("user_id", userId).eq("is_completed", true).in("exercise.workout_session_id", chunk)
      .order("id", { ascending: true }).range(from, to).returns<SetRow[]>());
    for (const set of sets) {
      const date = dateBySession.get(set.exercise.workout_session_id);
      if (date) days.get(date)!.completedSets += 1;
    }
  }
  return [...days.values()].sort((left, right) => left.date.localeCompare(right.date));
}

/** Complete owner-scoped exercise history: no 500-day/session truncation for records. */
export async function listCompleteRobustExerciseHistory(exerciseId: string, context: AuthenticatedRequestContext): Promise<RobustExerciseHistoryItem[]> {
  type Row = RawSessionExercise & { session: WorkoutSession & { day_log: { log_date: string } } };
  const { supabase, userId } = context;
  const rows = await readAllTrainingRows<Row>("Leer historial completo del ejercicio", (from, to) => supabase
    .from("workout_session_exercises")
    .select("*, sets:workout_sets(*), session:workout_sessions!inner(*, day_log:day_logs!inner(log_date))")
    .eq("user_id", userId).eq("exercise_id", exerciseId).eq("is_completed", true)
    .eq("session.user_id", userId).eq("session.status", "completed")
    .order("id", { ascending: true }).range(from, to).returns<Row[]>());
  return rows.map(row => ({ session: row.session, logDate: row.session.day_log.log_date,
    exercise: { ...row, sets: [...(row.sets ?? [])].sort((a,b) => a.set_number-b.set_number) } }))
    .sort((a,b) => (b.session.ended_at ?? b.logDate).localeCompare(a.session.ended_at ?? a.logDate) || b.session.id.localeCompare(a.session.id));
}

export async function listRobustExerciseHistory(input: {
  exerciseId: string;
  fromDate?: string;
  toDate?: string;
  routineId?: string;
  limit?: number;
}, context?: AuthenticatedRequestContext): Promise<RobustExerciseHistoryItem[]> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 500);
  const items = await queryRobustExerciseHistory({
    exerciseIds: [input.exerciseId],
    fromDate: input.fromDate,
    toDate: input.toDate,
    routineId: input.routineId,
  }, context);
  return items.slice(0, limit);
}

/**
 * Read the recent completed snapshot sessions for every exercise in an active
 * workout with three database reads, rather than one history query per card.
 */
export async function listRecentRobustExerciseHistoryByExercise(input: {
  exerciseIds: readonly string[];
  limitPerExercise?: number;
}, context?: AuthenticatedRequestContext): Promise<Record<string, RobustExerciseHistoryItem[]>> {
  const exerciseIds = [...new Set(input.exerciseIds)];
  const result = Object.fromEntries(exerciseIds.map((exerciseId) => [exerciseId, [] as RobustExerciseHistoryItem[]]));
  if (exerciseIds.length === 0) return result;

  const limit = Math.min(Math.max(input.limitPerExercise ?? 5, 1), 6);
  const items = await queryRobustExerciseHistory({ exerciseIds }, context);
  for (const item of items) {
    const bucket = result[item.exercise.exercise_id];
    if (bucket && bucket.length < limit) bucket.push(item);
  }
  return result;
}

export async function listRobustExerciseHistoryRoutineOptions(exerciseId: string) {
  const items = await listRobustExerciseHistory({ exerciseId, limit: 100 });
  const routines = new Map<string, { id: string; nombre: string }>();
  for (const item of items) {
    if (!item.session.routine_id) continue;
    routines.set(item.session.routine_id, {
      id: item.session.routine_id,
      nombre: item.session.routine_name_snapshot ?? item.session.session_name ?? "Rutina",
    });
  }
  return [...routines.values()].sort((left, right) => left.nombre.localeCompare(right.nombre, "es-AR"));
}

export type CompletedTrainingData = {
  sessions: WorkoutSession[];
  sessionExercises: WorkoutSessionExercise[];
  sets: WorkoutSet[];
  dateByDayLog: Map<string, string>;
};

export type HomeTrainingSnapshot = {
  weeks: WeeklyTrainingSummary[];
  currentWeek: WeeklyTrainingSummary;
  todaySessions: CompletedSessionSummary[];
};

type HomeActiveSessionQueryRow = Pick<
  WorkoutSession,
  "id" | "routine_name_snapshot" | "session_name" | "started_at"
> & {
  day_log: { log_date: string } | Array<{ log_date: string }> | null;
  exercises: Array<{
    sets: Array<{ is_completed: boolean }> | null;
  }> | null;
};

type HomeTrainingSession = Pick<
  WorkoutSession,
  | "id"
  | "day_log_id"
  | "routine_id"
  | "routine_name_snapshot"
  | "session_name"
  | "status"
  | "started_at"
  | "ended_at"
>;
type HomeTrainingExercise = Pick<
  WorkoutSessionExercise,
  "id" | "workout_session_id" | "is_completed" | "muscle_group_label_snapshot" | "grupo_muscular_snapshot"
>;
type HomeTrainingSet = Pick<
  WorkoutSet,
  "workout_session_exercise_id" | "actual_reps" | "actual_weight_kg" | "is_completed"
>;
type HomeTrainingData = {
  sessions: HomeTrainingSession[];
  sessionExercises: HomeTrainingExercise[];
  sets: HomeTrainingSet[];
  dateByDayLog: Map<string, string>;
};
type HomeTrainingSessionRow = HomeTrainingSession & {
  day_log?: { log_date: string } | Array<{ log_date: string }> | null;
  exercises?: Array<HomeTrainingExercise & { sets: HomeTrainingSet[] }>;
};

function summarizeCompletedSessions(
  data: HomeTrainingData,
  logDate: string,
): CompletedSessionSummary[] {
  const exercisesBySession = new Map<string, HomeTrainingExercise[]>();
  const sessionIdByExercise = new Map<string, string>();
  for (const exercise of data.sessionExercises) {
    const items = exercisesBySession.get(exercise.workout_session_id) ?? [];
    items.push(exercise);
    exercisesBySession.set(exercise.workout_session_id, items);
    sessionIdByExercise.set(exercise.id, exercise.workout_session_id);
  }

  const completedSetsBySession = new Map<string, number>();
  for (const set of data.sets) {
    if (!set.is_completed) continue;
    const sessionId = sessionIdByExercise.get(set.workout_session_exercise_id);
    if (sessionId) {
      completedSetsBySession.set(
        sessionId,
        (completedSetsBySession.get(sessionId) ?? 0) + 1,
      );
    }
  }

  return data.sessions.flatMap((session): CompletedSessionSummary[] => {
    if (data.dateByDayLog.get(session.day_log_id) !== logDate || !session.ended_at) {
      return [];
    }
    const exercises = exercisesBySession.get(session.id) ?? [];
    const completedExercises = exercises.filter((exercise) => exercise.is_completed);
    return [{
      id: session.id,
      routineId: session.routine_id,
      routineName: sessionDisplayName(session),
      logDate,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      durationMilliseconds: sessionDurationMilliseconds(session),
      exercisesCompleted: completedExercises.length,
      completedSets: completedSetsBySession.get(session.id) ?? 0,
      muscleGroups: [...new Set(completedExercises
        .map((exercise) => exercise.muscle_group_label_snapshot ?? exercise.grupo_muscular_snapshot)
        .filter((group): group is string => Boolean(group)))],
    }];
  }).slice(0, 20);
}

export function buildHomeTrainingSnapshot(
  source: HomeTrainingData,
  today: string,
): HomeTrainingSnapshot {
  const weeks = buildWeeklyTrainingSummaries(source, today).slice(0, 8);
  return {
    weeks,
    currentWeek: weeks[0],
    todaySessions: summarizeCompletedSessions(source, today),
  };
}

/** Una única proyección acotada aporta el CTA y el progreso de la sesión activa. */
export async function getHomeActiveTrainingSnapshot(
  context: AuthenticatedRequestContext,
): Promise<HomeActiveSessionSummary | null> {
  const { data, error } = await context.supabase
    .from("workout_sessions")
    .select(
      "id, routine_name_snapshot, session_name, started_at, day_log:day_logs(log_date), exercises:workout_session_exercises(sets:workout_sets(is_completed))",
    )
    .eq("user_id", context.userId)
    .eq("status", "in_progress")
    .maybeSingle();
  if (error) throw new Error(`Leer sesión activa de Home: ${error.message}`);
  if (!data) return null;

  const row = data as HomeActiveSessionQueryRow;
  const day = firstRelation(row.day_log);
  if (!day) throw new Error("Leer día de la sesión activa de Home: relación ausente.");

  return buildHomeActiveSessionSummary({
    session: row,
    logDate: day.log_date,
    exercises: (row.exercises ?? []).map((exercise) => ({
      sets: (exercise.sets ?? []).map((set) => ({
        isCompleted: set.is_completed,
      })),
    })),
  });
}

/**
 * Read model acotado para Home: una sola consulta trae exclusivamente las
 * sesiones completed de las ocho semanas visibles con sus ejercicios y sets.
 * No sustituye el historial completo usado por /train/progress.
 */
export async function getHomeTrainingSnapshot(
  today: string,
  context: AuthenticatedRequestContext,
): Promise<HomeTrainingSnapshot> {
  const weekStart = mondayOfIsoDate(today);
  const weekEnd = addUtcDays(weekStart, 6);
  const historyStart = addUtcDays(weekStart, -49);
  const { data: rawRows, error } = await context.supabase
    .from("workout_sessions")
    .select(
      "id, day_log_id, routine_id, routine_name_snapshot, session_name, status, started_at, ended_at, day_log:day_logs!inner(log_date), exercises:workout_session_exercises(id, workout_session_id, is_completed, muscle_group_label_snapshot, grupo_muscular_snapshot, sets:workout_sets(workout_session_exercise_id, actual_reps, actual_weight_kg, is_completed))",
    )
    .eq("user_id", context.userId)
    .eq("status", "completed")
    .not("ended_at", "is", null)
    .gte("day_logs.log_date", historyStart)
    .lte("day_logs.log_date", weekEnd)
    .order("ended_at", { ascending: false });
  if (error) throw new Error(`Leer resumen semanal de Home: ${error.message}`);

  const sessions: HomeTrainingSession[] = [];
  const sessionExercises: HomeTrainingExercise[] = [];
  const sets: HomeTrainingSet[] = [];
  const dateByDayLog = new Map<string, string>();

  for (const row of (rawRows ?? []) as HomeTrainingSessionRow[]) {
    const day = firstRelation(row.day_log);
    if (!day) continue;
    const session = { ...row };
    const exercises = session.exercises;
    delete session.day_log;
    delete session.exercises;
    sessions.push(session as HomeTrainingSession);
    dateByDayLog.set(session.day_log_id, day.log_date);
    for (const exerciseRow of exercises ?? []) {
      const { sets: exerciseSets, ...exercise } = exerciseRow;
      sessionExercises.push(exercise as HomeTrainingExercise);
      sets.push(...(exerciseSets ?? []));
    }
  }

  const source = { sessions, sessionExercises, sets, dateByDayLog };
  return buildHomeTrainingSnapshot(source, today);
}

type PageResult<T> = { data: T[] | null; error: { message: string } | null; count?: number | null };

/**
 * Reads EVERY row of an owner-scoped query. PostgREST caps each response (max
 * rows, 1000 by default) and silently truncates; long `.in()` lists also blow up
 * the URL. Each caller filters by user_id with a total order, and pages advance
 * by the rows actually received, so any server cap is safe. A page that asks for
 * the exact count (the first one) ends the read once that many rows arrived;
 * without a count, an empty page ends it. A short page alone never does: the
 * server cap is not known here.
 */
export async function readAllTrainingRows<T>(
  label: string,
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  let total: number | null = null;
  for (let index = 0; index < 1000; index += 1) {
    const { data, error, count } = await page(rows.length, rows.length + pageSize - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    if (typeof count === "number") total = count;
    if (!data?.length) return rows;
    rows.push(...data);
    if (total !== null && rows.length >= total) return rows;
  }
  throw new Error(`${label}: demasiadas páginas.`);
}

/** Exact count on the first page only: it lets the read stop without an empty page. */
const firstPageCount = (from: number) => (from === 0 ? { count: "exact" as const } : undefined);

export type CompletedTrainingScope = {
  /** Only sessions and their dates: no exercises or sets. */
  sessionsOnly?: boolean;
  /**
   * Same rows, only the columns the exercise stats and the performance comparison read (Home's records). The rows keep
   * their full types: a reader of this scope must not read any other column.
   */
  recordColumns?: boolean;
};

export const RECORD_COLUMNS = {
  sessions: "id, day_log_id, status, started_at, ended_at, routine_id, routine_name_snapshot, session_name",
  exercises: "id, workout_session_id, exercise_id, is_completed, nombre_snapshot, grupo_muscular_snapshot, muscle_group_label_snapshot, weight_mode_snapshot",
  sets: "id, workout_session_exercise_id, is_completed, actual_reps, actual_weight_kg",
} as const;

type EmbeddedDay = { day: { log_date: string } | null };
/** The session row exactly as `select("*")` returns it: the embedded day only carries the date. */
function withoutDay<T extends EmbeddedDay>(row: T): Omit<T, "day"> {
  const copy: Partial<T> = { ...row };
  delete copy.day;
  return copy as Omit<T, "day">;
}

/**
 * Every completed session of the user with its exercises, completed sets and
 * dates, in a fixed number of paged queries (no per-session or per-exercise
 * fan-out, no `.in()` id lists). The date comes embedded in the session row.
 * Memberships are resolved in memory. Date-range reads were measured against
 * this one: their joins read ~40x more buffers, so every reader stays on it.
 */
export async function loadCompletedTrainingData(
  context?: AuthenticatedRequestContext,
  scope: CompletedTrainingScope = {},
): Promise<CompletedTrainingData> {
  const { supabase, userId } = context ?? await getAuthedContext();
  const rows = await readAllTrainingRows("Leer progreso", (from, to) => supabase
    .from("workout_sessions")
    .select(`${scope.recordColumns ? RECORD_COLUMNS.sessions : "*"}, day:day_logs(log_date)`, firstPageCount(from))
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("ended_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to)
    .returns<(WorkoutSession & EmbeddedDay)[]>());
  if (rows.length === 0) return { sessions: [], sessionExercises: [], sets: [], dateByDayLog: new Map() };
  const sessions: WorkoutSession[] = rows.map(withoutDay);
  const dateByDayLog = new Map(rows.flatMap((row) => row.day ? [[row.day_log_id, row.day.log_date] as const] : []));
  if (scope.sessionsOnly) return { sessions, sessionExercises: [], sets: [], dateByDayLog };

  const sessionIds = new Set(sessions.map((session) => session.id));
  const [allExercises, allSets] = await Promise.all([
    readAllTrainingRows<WorkoutSessionExercise>("Leer ejercicios de progreso", (from, to) => supabase
      .from("workout_session_exercises")
      .select(scope.recordColumns ? RECORD_COLUMNS.exercises : "*", firstPageCount(from))
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(from, to)
      .returns<WorkoutSessionExercise[]>()),
    readAllTrainingRows<WorkoutSet>("Leer series de progreso", (from, to) => supabase
      .from("workout_sets")
      .select(scope.recordColumns ? RECORD_COLUMNS.sets : "*", firstPageCount(from))
      .eq("user_id", userId)
      .eq("is_completed", true)
      .order("id", { ascending: true })
      .range(from, to)
      .returns<WorkoutSet[]>()),
  ]);
  const sessionExercises = allExercises.filter((exercise) => sessionIds.has(exercise.workout_session_id));
  const exerciseIds = new Set(sessionExercises.map((exercise) => exercise.id));
  const sets = allSets.filter((set) => exerciseIds.has(set.workout_session_exercise_id));

  return { sessions, sessionExercises, sets, dateByDayLog };
}

/**
 * One batched historical read model for the exercise tab. Memberships come
 * from completed session snapshots, never from the current routine template.
 */
export async function getTrainingHistoryDirectory(requestContext?: AuthenticatedRequestContext): Promise<TrainingHistoryDirectory> {
  const context = requestContext ?? await getAuthedContext();
  const [data, catalog, activeRoutines] = await Promise.all([
    loadCompletedTrainingData(context),
    listExercises({ includeArchived: true }, context),
    listRoutines({ includeArchived: false }, context),
  ]);
  const directory = buildTrainingHistoryDirectory({ catalog, ...data });
  return {
    ...directory,
    routines: activeRoutines.map((routine) => ({ id: routine.id, name: routine.nombre, color: routine.color })),
  };
}

export { mondayOfIsoDate } from "./training-progress-summary";

function workoutSetVolume(set: WorkoutSet): number {
  return (set.actual_reps ?? 0) * (set.actual_weight_kg ?? 0);
}

export async function getTrainingProgress(): Promise<{
  weeks: WeeklyTrainingSummary[];
  exercises: ExerciseProgressSummary[];
}> {
  const data = await loadCompletedTrainingData();
  const sessionById = new Map(data.sessions.map((session) => [session.id, session]));
  const setsByExercise = new Map<string, WorkoutSet[]>();
  for (const set of data.sets) {
    const current = setsByExercise.get(set.workout_session_exercise_id) ?? [];
    current.push(set);
    setsByExercise.set(set.workout_session_exercise_id, current);
  }
  for (const sets of setsByExercise.values()) {
    sets.sort((left, right) => left.set_number - right.set_number);
  }

  const weeks = buildWeeklyTrainingSummaries(data, todayInCordoba());

  const groupedByCatalogExercise = new Map<string, WorkoutSessionExercise[]>();
  for (const exercise of data.sessionExercises) {
    if (!exercise.is_completed) continue;
    const current = groupedByCatalogExercise.get(exercise.exercise_id) ?? [];
    current.push(exercise);
    groupedByCatalogExercise.set(exercise.exercise_id, current);
  }

  const exerciseProgress: ExerciseProgressSummary[] = [];
  for (const [exerciseId, history] of groupedByCatalogExercise) {
    const dated = history
      .flatMap((exercise) => {
        const session = sessionById.get(exercise.workout_session_id);
        if (!session) return [];
        const date = data.dateByDayLog.get(session.day_log_id);
        return date ? [{ exercise, date }] : [];
      })
      .sort((left, right) => right.date.localeCompare(left.date));
    const latest = dated[0];
    if (!latest) continue;

    const allSets = dated.flatMap(
      ({ exercise }) => (setsByExercise.get(exercise.id) ?? []).filter((set) => set.is_completed),
    );
    let bestWeightKg: number | null = null;
    for (const set of allSets) {
      const weight = asNumber(set.actual_weight_kg);
      if (weight !== null && (bestWeightKg === null || weight > bestWeightKg)) {
        bestWeightKg = weight;
      }
    }

    const lastSets: EditableWorkoutSet[] = (
      setsByExercise.get(latest.exercise.id) ?? []
    ).map((set) => ({
      set_number: set.set_number,
      target_reps: set.target_reps,
      target_weight_kg: asNumber(set.target_weight_kg),
      target_rir: set.target_rir,
      actual_reps: set.actual_reps,
      actual_weight_kg: asNumber(set.actual_weight_kg),
      is_completed: set.is_completed,
      notes: set.notes,
    }));

    exerciseProgress.push({
      exerciseId,
      name: latest.exercise.nombre_snapshot,
      muscleGroup:
        latest.exercise.muscle_group_label_snapshot ??
        latest.exercise.grupo_muscular_snapshot,
      sessions: new Set(history.map((item) => item.workout_session_id)).size,
      lastDate: latest.date,
      bestWeightKg,
      totalVolumeKg: allSets.reduce(
        (total, set) => total + workoutSetVolume(set),
        0,
      ),
      lastDecision: latest.exercise.decision,
      lastSets,
    });
  }

  return {
    weeks,
    exercises: exerciseProgress.sort((left, right) =>
      left.name.localeCompare(right.name, "es"),
    ),
  };
}

/**
 * Read model for the Progress workspace. It intentionally aggregates completed
 * session snapshots, never the current routine definition.
 */
export async function getTrainingAnalysis(
  period: TrainingAnalysisPeriod,
  range?: { start: string; end: string },
): Promise<TrainingAnalysis> {
  const [data, routines] = await Promise.all([
    loadCompletedTrainingData(),
    listRoutines({ includeArchived: true }),
  ]);
  return buildTrainingAnalysis(data, { today: todayInCordoba(), period, routines, range });
}

/**
 * Two equal historical intervals for the General comparison. Both reads use the
 * same completed-session snapshots; only the aggregation end date changes.
 */
export async function getTrainingAnalysisWithPreviousPeriod(
  period: TrainingAnalysisPeriod,
  range?: { start: string; end: string },
): Promise<{ current: TrainingAnalysis; previous: TrainingAnalysis }> {
  const [data, routines] = await Promise.all([
    loadCompletedTrainingData(),
    listRoutines({ includeArchived: true }),
  ]);
  const current = buildTrainingAnalysis(data, { today: todayInCordoba(), period, routines, range });
  const previousRange = getPreviousProgressPeriod(current.range);
  const previous = buildTrainingAnalysis(data, {
    today: previousRange.end,
    period,
    routines,
    range: previousRange,
  });
  return { current, previous };
}

/**
 * Read model for General V2. Current, reference and per-exercise performance
 * share one historical fetch, so changing the visible metric never creates an
 * exercise-level query fan-out.
 */
export async function getTrainingGeneralAnalysis(
  period: TrainingAnalysisPeriod,
  referenceDefinition: ProgressTemporalComparisonReference,
  options: { selectedMetricKeys?: readonly string[]; activeMetricKey?: string | null } = {},
  primaryRange?: { start: string; end: string },
  context?: AuthenticatedRequestContext,
): Promise<{ current: TrainingAnalysis; reference: TrainingAnalysis; general: TrainingGeneralAnalytics }> {
  const [data, routines] = await Promise.all([
    loadCompletedTrainingData(context),
    listRoutines({ includeArchived: true }, context),
  ]);
  const current = buildTrainingAnalysis(data, { today: todayInCordoba(), period, routines, range: primaryRange });
  const reference = buildTrainingAnalysis(data, {
    today: referenceDefinition.period.end,
    period,
    routines,
    range: referenceDefinition.period,
  });
  return {
    current,
    reference,
    general: buildTrainingGeneralAnalytics({
      source: data,
      primary: current,
      reference,
      referenceDefinition,
      selectedMetricKeys: options.selectedMetricKeys,
      activeMetricKey: options.activeMetricKey,
    }),
  };
}

/**
 * Read model for Routines V2. The list, selected routine, A/B load and every
 * exercise comparison share the same completed-session snapshot fetch.
 */
export async function getTrainingRoutinesAnalysis(
  period: TrainingAnalysisPeriod,
  referenceDefinition: ProgressTemporalComparisonReference,
  options: {
    selectedRoutineId?: string | null;
    selectedMetricKeys?: readonly string[];
    activeMetricKey?: string | null;
  } = {},
  primaryRange?: { start: string; end: string },
): Promise<{ current: TrainingAnalysis; reference: TrainingAnalysis; routines: TrainingRoutinesAnalytics }> {
  const [data, catalogRoutines] = await Promise.all([
    loadCompletedTrainingData(),
    listRoutines({ includeArchived: true }),
  ]);
  const current = buildTrainingAnalysis(data, { today: todayInCordoba(), period, routines: catalogRoutines, range: primaryRange });
  const reference = buildTrainingAnalysis(data, {
    today: referenceDefinition.period.end,
    period,
    routines: catalogRoutines,
    range: referenceDefinition.period,
  });
  return {
    current,
    reference,
    routines: buildTrainingRoutinesAnalytics({
      source: data,
      primary: current,
      reference,
      referenceDefinition,
      selectedRoutineId: options.selectedRoutineId,
      selectedMetricKeys: options.selectedMetricKeys,
      activeMetricKey: options.activeMetricKey,
    }),
  };
}

/**
 * Read model for Muscles V2. Broad groups, real detail labels, A/B load and
 * exercise performance all share the same completed-session snapshot fetch.
 */
export async function getTrainingMusclesAnalysis(
  period: TrainingAnalysisPeriod,
  referenceDefinition: ProgressTemporalComparisonReference,
  options: {
    selectedMuscleKey?: string | null;
    selectedSubzoneKey?: string | null;
    selectedMetricKeys?: readonly string[];
    activeMetricKey?: string | null;
  } = {},
  primaryRange?: { start: string; end: string },
): Promise<{ current: TrainingAnalysis; reference: TrainingAnalysis; muscles: TrainingMusclesAnalytics }> {
  const [data, catalogRoutines] = await Promise.all([
    loadCompletedTrainingData(),
    listRoutines({ includeArchived: true }),
  ]);
  const current = buildTrainingAnalysis(data, { today: todayInCordoba(), period, routines: catalogRoutines, range: primaryRange });
  const reference = buildTrainingAnalysis(data, {
    today: referenceDefinition.period.end,
    period,
    routines: catalogRoutines,
    range: referenceDefinition.period,
  });
  return {
    current,
    reference,
    muscles: buildTrainingMusclesAnalytics({
      source: data,
      primary: current,
      reference,
      referenceDefinition,
      selectedMuscleKey: options.selectedMuscleKey,
      selectedSubzoneKey: options.selectedSubzoneKey,
      selectedMetricKeys: options.selectedMetricKeys,
      activeMetricKey: options.activeMetricKey,
    }),
  };
}

/**
 * Read model for Exercises V2. Exploration, individual performance, marks,
 * load and session history are derived from one grouped historical fetch.
 */
export async function getTrainingExercisesAnalysis(
  period: TrainingAnalysisPeriod,
  referenceDefinition: ProgressTemporalComparisonReference,
  options: {
    selectedExerciseId?: string | null;
    routineId?: string | null;
    selectedMetricKeys?: readonly string[];
    activeMetricKey?: string | null;
  } = {},
  primaryRange?: { start: string; end: string },
): Promise<{ current: TrainingAnalysis; reference: TrainingAnalysis; exercises: TrainingExercisesAnalytics }> {
  const [data, catalogRoutines] = await Promise.all([
    loadCompletedTrainingData(),
    listRoutines({ includeArchived: true }),
  ]);
  const current = buildTrainingAnalysis(data, { today: todayInCordoba(), period, routines: catalogRoutines, range: primaryRange });
  const reference = buildTrainingAnalysis(data, {
    today: referenceDefinition.period.end,
    period,
    routines: catalogRoutines,
    range: referenceDefinition.period,
  });
  return {
    current,
    reference,
    exercises: buildTrainingExercisesAnalytics({
      source: data,
      primary: current,
      reference,
      referenceDefinition,
      selectedExerciseId: options.selectedExerciseId,
      routineId: options.routineId,
      selectedMetricKeys: options.selectedMetricKeys,
      activeMetricKey: options.activeMetricKey,
    }),
  };
}
