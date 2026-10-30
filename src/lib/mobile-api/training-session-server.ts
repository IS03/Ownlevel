import "server-only";
import {
  getTrainingHistoryDirectory, getWorkoutSessionDetail, listCompletedSessionHistory, listRecentRobustExerciseHistoryByExercise,
  listRobustExerciseHistory, listCompleteRobustExerciseHistory, listCompletedSetsByDay, listCompletedSessionsOnDays,
  type RobustExerciseHistoryItem,
} from "../phase2/training-robust";
import { listExercises } from "../phase2/training";
import { buildTrainingHistoryExerciseDetail, sortTrainingHistoryExercises, type TrainingHistoryExerciseSession } from "../phase2/training-history";
import type { ExerciseReportSession } from "../phase2/exercise-insights";
import { orderTrainingDaySessions, summarizeTrainingDay } from "../phase2/training-day-summary";
import type { CompletedSessionSummary } from "../phase2/types";
import type { AuthenticatedRequestContext } from "../supabase/server";
import { resilientRead } from "../resilient-read";
import type { RequestPerformanceContext } from "../request-performance";
import { MobileApiConflictError, MobileApiNotFoundError, MobileApiUnauthorizedError, MobileApiValidationError } from "./auth";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";
import { parseMobileTrainingId } from "./training";
import {
  parseSessionAdd, parseSessionCancel, parseSessionRemove, parseSessionSave, parseSessionVersion,
  parseSessionExerciseOrder, parseSessionExerciseOrderResponse,
  sessionDetailDto, sessionPayloadDto, sessionExerciseDto,
  parseSessionFinish, parseSessionFinishedResponse, sessionFinishDomainMetadata,
  parseSessionCorrection, parseSessionCorrectedResponse, sessionCorrectionDomainPayload,
  parseSessionDiscard, parseSessionDiscardedResponse,
  parseMobileTrainingDate, parseTrainingHistoryCursor, parseTrainingHistoryLimit, encodeTrainingHistoryCursor, parseExerciseHistoryLimit,
  type TrainingExerciseHistoryResponse, type TrainingExerciseHistorySessionDto, type TrainingHistoryExercisesResponse,
  type SessionExerciseSyncDto, type SessionStructuralDto, type TrainingDayResponse, type TrainingHistoryResponse,
  type TrainingHistorySessionDto, type TrainingHistoryMonthResponse, parseMobileTrainingMonth,
  type TrainingWeekdaySessionsResponse, parseMobileTrainingWeeks,
} from "./training-session";
import { INTENSITY_WINDOW_DAYS, intensityLevel, intensityThresholds, isoDayShift, monthRange } from "./training-intensity";

function auth(context: MobileSupabaseAuthenticatedContext, requestPerformance?: RequestPerformanceContext): AuthenticatedRequestContext {
  return { supabase: context.supabase, userId: context.userId, requestPerformance };
}
function mutationError(error: { code?: string; message?: string }): never {
  const message = error.message;
  if (message === "UNAUTHORIZED") throw new MobileApiUnauthorizedError();
  if (message === "TRAINING_SESSION_NOT_FOUND" || message === "TRAINING_EXERCISE_NOT_FOUND") throw new MobileApiNotFoundError();
  const conflicts = {
    SESSION_CHANGED: "La estructura de la sesión cambió. Comprobá el orden guardado antes de reintentar.",
    SESSION_EXERCISE_CHANGED: "El ejercicio cambió. Comprobá la versión guardada.",
    SESSION_CLOSED: "La sesión ya no está en curso.",
    SESSION_EXERCISE_REMOVED: "El ejercicio ya no está en esta sesión.",
    SESSION_EXERCISE_ALREADY_EXISTS: "El ejercicio ya está en esta sesión.",
    IDEMPOTENCY_KEY_REUSED: "La clave ya fue usada con otros datos.",
    NO_COMPLETED_SETS: "Marcá y guardá al menos una serie antes de finalizar.",
    SESSION_NOT_COMPLETED: "La sesión todavía no está finalizada.",
    SESSION_DISCARDED: "La sesión fue eliminada.",
  } as const;
  if (message && Object.hasOwn(conflicts, message)) {
    const code = message as keyof typeof conflicts;
    throw new MobileApiConflictError(conflicts[code], code);
  }
  if (["22023", "22P02", "22007", "22008", "23514", "23505"].includes(error.code ?? "")) {
    throw new MobileApiValidationError(error.code === "23505" ? "Ya existe un ejercicio con ese nombre." : "Los datos del ejercicio no son válidos.");
  }
  throw new Error("Active session database operation unavailable", { cause: error });
}
export async function readMobileSession(id: unknown, context: MobileSupabaseAuthenticatedContext, performance: RequestPerformanceContext, routineAdditions = false) {
  const sessionId = parseMobileTrainingId(id, "La sesión");
  const detail = await getWorkoutSessionDetail(sessionId, auth(context, performance));
  if (!detail) throw new MobileApiNotFoundError();
  const history = detail.session.status === "in_progress" ? await resilientRead({
    route: "/api/mobile/v1/training/sessions/[sessionId]", operation: "mobile.training.session.quick-history", layer: "database", ...performance,
  }, async () => {
    const rows = await listRecentRobustExerciseHistoryByExercise({
      exerciseIds: detail.exercises.map((exercise) => exercise.exercise_id), limitPerExercise: 6,
    }, auth(context, performance));
    // Serialization failures belong to this auxiliary resource too.
    return Object.fromEntries(Object.entries(rows).map(([id, items]) => [id, items.map((item) => ({
      sessionId: item.session.id, logDate: item.logDate, completedAt: item.session.ended_at,
      routineId: item.session.routine_id, routineName: item.session.routine_name_snapshot ?? item.session.session_name ?? "Sesión libre",
      decision: item.exercise.decision, sets: sessionExerciseDto(item.exercise).payload.sets,
    }))]));
  }) : { status: "ok" as const, data: {} };
  return sessionDetailDto(detail, history, routineAdditions);
}
export async function readMobileSessionExercise(id: unknown, exerciseId: unknown, context: MobileSupabaseAuthenticatedContext, routineAdditions = false): Promise<SessionExerciseSyncDto> {
  const sessionId = parseMobileTrainingId(id, "La sesión");
  const sessionExerciseId = parseMobileTrainingId(exerciseId, "El ejercicio de sesión");
  // A single nested resource read observes status + exercise payload + CAS token
  // together. It never interprets a failed query as removed or closed.
  const { data, error } = await context.supabase.from("workout_sessions")
    .select(`status, exercises:workout_session_exercises(id, routine_exercise_id, decision, decision_note, apply_to_routine, ${routineAdditions ? "add_to_routine_on_finish," : ""} notes, updated_at, sets:workout_sets(set_number, target_reps, target_weight_kg, target_rir, actual_reps, actual_weight_kg, is_completed, notes))`)
    .eq("id", sessionId).eq("user_id", context.userId)
    .eq("exercises.id", sessionExerciseId).maybeSingle();
  if (error) throw new Error("Session read-back unavailable", { cause: error });
  if (!data) throw new MobileApiNotFoundError();
  if (data.status === "completed" || data.status === "discarded") return { status: "session_closed", sessionStatus: data.status };
  if (data.status !== "in_progress") throw new Error("Invalid session status");
  const exercise = data.exercises.find((exercise) => exercise.id === sessionExerciseId);
  if (!exercise) return { status: "removed" };
  return {
    status: "active", updatedAt: exercise.updated_at,
    payload: sessionPayloadDto({
      is_completed: exercise.sets.some((set) => set.is_completed), decision: exercise.decision,
      decision_note: exercise.decision_note ?? "", apply_to_routine: exercise.routine_exercise_id ? exercise.apply_to_routine : routineAdditions && "add_to_routine_on_finish" in exercise && exercise.add_to_routine_on_finish === true,
      notes: exercise.notes ?? "", sets: [...exercise.sets].sort((a, b) => a.set_number - b.set_number),
    }),
  };
}
export async function saveMobileSessionExercise(id: unknown, exerciseId: unknown, value: unknown, context: MobileSupabaseAuthenticatedContext, routineAdditions = false) {
  const sessionId = parseMobileTrainingId(id, "La sesión");
  const sessionExerciseId = parseMobileTrainingId(exerciseId, "El ejercicio de sesión");
  const input = parseSessionSave(value);
  const { data, error } = await context.supabase.rpc(routineAdditions ? "mobile_save_workout_exercise_v2" : "mobile_save_workout_exercise", {
    p_session_id: sessionId, p_session_exercise_id: sessionExerciseId,
    p_expected_updated_at: input.expectedUpdatedAt, p_payload: input.payload,
  });
  if (error) mutationError(error);
  try { parseSessionVersion(data); }
  catch (error) { throw new Error("Invalid workout save response", { cause: error }); }
  return { sessionExerciseId, updatedAt: data };
}
async function structural(sessionId: string, operation: string, input: Record<string, unknown>, context: MobileSupabaseAuthenticatedContext): Promise<SessionStructuralDto> {
  const { data, error } = await context.supabase.rpc("mobile_mutate_workout_session", {
    p_session_id: sessionId, p_operation: operation, ...input,
  });
  if (error) mutationError(error);
  const row = Array.isArray(data) ? data[0] : data;
  const body = row?.response_body;
  const status = operation === "cancel" ? "cancelled" : operation === "remove" ? "removed" : "added";
  if (row?.response_status !== (status === "added" ? 201 : 200) || typeof row.replayed !== "boolean" ||
    !body || body.status !== status || body.sessionId !== sessionId) throw new Error("Invalid session structural response");
  // Validate IDs from persisted responses too; replay is not a fresh resource read.
  try {
    if (body.status !== "cancelled") parseMobileTrainingId(body.sessionExerciseId, "El ejercicio agregado");
    if (body.status === "added") parseMobileTrainingId(body.exerciseId, "El ejercicio");
  } catch (error) { throw new Error("Invalid session structural response", { cause: error }); }
  if (operation === "remove" && body.sessionExerciseId !== input.p_session_exercise_id) throw new Error("Mismatched removed exercise");
  if (operation === "add_existing" && body.exerciseId !== input.p_exercise_id) throw new Error("Mismatched added exercise");
  return body as SessionStructuralDto;
}
export function addMobileSessionExercise(id: unknown, value: unknown, context: MobileSupabaseAuthenticatedContext) {
  const sessionId = parseMobileTrainingId(id, "La sesión");
  const input = parseSessionAdd(value);
  return structural(sessionId, input.operation, {
    p_idempotency_key: input.idempotencyKey,
    ...(input.operation === "add_existing" ? { p_exercise_id: input.exerciseId } : { p_exercise: input.exercise }),
  }, context);
}
export function removeMobileSessionExercise(id: unknown, exerciseId: unknown, value: unknown, context: MobileSupabaseAuthenticatedContext) {
  const sessionId = parseMobileTrainingId(id, "La sesión");
  const sessionExerciseId = parseMobileTrainingId(exerciseId, "El ejercicio de sesión");
  const input = parseSessionRemove(value);
  return structural(sessionId, "remove", { p_session_exercise_id: sessionExerciseId,
    p_expected_updated_at: input.expectedUpdatedAt, p_idempotency_key: input.idempotencyKey }, context);
}
export function cancelMobileSession(id: unknown, value: unknown, context: MobileSupabaseAuthenticatedContext) {
  const sessionId = parseMobileTrainingId(id, "La sesión");
  return structural(sessionId, "cancel", { p_idempotency_key: parseSessionCancel(value).idempotencyKey }, context);
}
export async function reorderMobileSessionExercises(id: unknown, value: unknown, context: MobileSupabaseAuthenticatedContext) {
  const sessionId = parseMobileTrainingId(id, "La sesión").toLowerCase();
  const input = parseSessionExerciseOrder(value);
  const { data, error } = await context.supabase.rpc("mobile_reorder_workout_exercises", {
    p_session_id: sessionId, p_ordered_session_exercise_ids: input.orderedSessionExerciseIds,
    p_expected_session_updated_at: input.expectedSessionUpdatedAt, p_idempotency_key: input.idempotencyKey,
  });
  if (error) mutationError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (row?.response_status !== 200 || typeof row.replayed !== "boolean") throw new Error("Invalid exercise-order result");
  try {
    const result = parseSessionExerciseOrderResponse(row.response_body);
    if (result.sessionId !== sessionId || result.orderedSessionExerciseIds.length !== input.orderedSessionExerciseIds.length ||
      result.orderedSessionExerciseIds.some((id, index) => id !== input.orderedSessionExerciseIds[index])) throw new Error("Mismatched exercise-order result");
    return result;
  } catch (error) { throw new Error("Invalid exercise-order database response", { cause: error }); }
}

// M3.4-1 — idempotent finish / correction / discard over the existing domain RPCs.
function ledgerRow(data: unknown, label: string) {
  const row = (Array.isArray(data) ? data[0] : data) as { response_status?: unknown; response_body?: unknown; replayed?: unknown } | null;
  if (row?.response_status !== 200 || typeof row.replayed !== "boolean") throw new Error(`Invalid ${label} result`);
  return row.response_body;
}
export async function finishMobileSession(id: unknown, value: unknown, context: MobileSupabaseAuthenticatedContext, routineAdditions = false) {
  const sessionId = parseMobileTrainingId(id, "La sesión").toLowerCase();
  const input = parseSessionFinish(value);
  const { data, error } = await context.supabase.rpc(routineAdditions ? "mobile_finish_training_session_v2" : "mobile_finish_training_session", {
    p_session_id: sessionId, p_metadata: sessionFinishDomainMetadata(input.metadata), p_idempotency_key: input.idempotencyKey,
  });
  if (error) mutationError(error);
  const body = ledgerRow(data, "finish");
  try {
    const result = parseSessionFinishedResponse(body);
    if (result.sessionId !== sessionId) throw new Error("Mismatched finished session");
    return result;
  } catch (error) { throw new Error("Invalid finish database response", { cause: error }); }
}
export async function correctMobileSession(id: unknown, value: unknown, context: MobileSupabaseAuthenticatedContext) {
  const sessionId = parseMobileTrainingId(id, "La sesión").toLowerCase();
  const input = parseSessionCorrection(value);
  const { data, error } = await context.supabase.rpc("mobile_correct_completed_session", {
    p_session_id: sessionId, p_expected_session_updated_at: input.expectedSessionUpdatedAt,
    p_payload: sessionCorrectionDomainPayload(input), p_idempotency_key: input.idempotencyKey,
  });
  if (error) mutationError(error);
  const body = ledgerRow(data, "correction");
  try {
    const result = parseSessionCorrectedResponse(body);
    if (result.sessionId !== sessionId) throw new Error("Mismatched corrected session");
    return result;
  } catch (error) { throw new Error("Invalid correction database response", { cause: error }); }
}
export async function discardMobileSession(id: unknown, value: unknown, context: MobileSupabaseAuthenticatedContext) {
  const sessionId = parseMobileTrainingId(id, "La sesión").toLowerCase();
  const input = parseSessionDiscard(value);
  const { data, error } = await context.supabase.rpc("mobile_discard_completed_session", {
    p_session_id: sessionId, p_idempotency_key: input.idempotencyKey,
  });
  if (error) mutationError(error);
  const body = ledgerRow(data, "discard");
  try {
    const result = parseSessionDiscardedResponse(body);
    if (result.sessionId !== sessionId) throw new Error("Mismatched discarded session");
    return result;
  } catch (error) { throw new Error("Invalid discard database response", { cause: error }); }
}

function historySessionDto(session: CompletedSessionSummary): TrainingHistorySessionDto {
  return {
    id: session.id, routineId: session.routineId, routineName: session.routineName, routineColor: session.routineColor ?? null,
    logDate: session.logDate, startedAt: session.startedAt, endedAt: session.endedAt,
    durationMilliseconds: session.durationMilliseconds, exercisesCompleted: session.exercisesCompleted,
    completedSets: session.completedSets, volumeKg: session.volumeKg ?? null,
  };
}
/** Completed sessions, newest first, keyset-paginated on (endedAt, id). */
export async function listMobileTrainingHistory(searchParams: URLSearchParams, context: MobileSupabaseAuthenticatedContext,
  performance: RequestPerformanceContext): Promise<TrainingHistoryResponse> {
  const limit = parseTrainingHistoryLimit(searchParams.get("limit"));
  const before = parseTrainingHistoryCursor(searchParams.get("cursor"));
  const rows = await listCompletedSessionHistory({ limit: limit + 1, before }, auth(context, performance));
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return { sessions: page.map(historySessionDto),
    nextCursor: rows.length > limit && last ? encodeTrainingHistoryCursor({ endedAt: last.endedAt, id: last.id }) : null };
}
/** One stored training day (log_date assigned by the domain at session start). */
export async function readMobileTrainingDay(date: unknown, context: MobileSupabaseAuthenticatedContext,
  performance: RequestPerformanceContext): Promise<TrainingDayResponse> {
  const logDate = parseMobileTrainingDate(date);
  const sessions = orderTrainingDaySessions(await listCompletedSessionHistory({ logDate, limit: 100 }, auth(context, performance)));
  return { date: logDate, sessions: sessions.map(historySessionDto), summary: summarizeTrainingDay(sessions) };
}

/**
 * The day and the same weekday of the previous `weeks`, in that order, each day's sessions by start: the same list
 * the client assembled from one /training/days read per date, without exercises or sets.
 */
export async function readMobileTrainingWeekdaySessions(searchParams: URLSearchParams, context: MobileSupabaseAuthenticatedContext,
  performance: RequestPerformanceContext): Promise<TrainingWeekdaySessionsResponse> {
  const date = parseMobileTrainingDate(searchParams.get("date"));
  const weeks = parseMobileTrainingWeeks(searchParams.get("weeks"));
  const dates = Array.from({ length: weeks + 1 }, (_, index) => isoDayShift(date, -7 * index));
  const sessions = await listCompletedSessionsOnDays(dates, auth(context, performance));
  return {
    date, weeks,
    sessions: dates.flatMap((day) => orderTrainingDaySessions(sessions.filter((session) => session.logDate === day)))
      .map(({ id, routineId, logDate }) => ({ id, routineId, logDate })),
  };
}

/** Today's log date as the domain assigns it (America/Argentina/Cordoba, like session start). */
function trainingToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
/** One month of trained days with intensity relative to the person's last 12 weeks (server-computed: complete data). */
export async function readMobileTrainingHistoryMonth(searchParams: URLSearchParams, context: MobileSupabaseAuthenticatedContext,
  performance: RequestPerformanceContext): Promise<TrainingHistoryMonthResponse> {
  const month = parseMobileTrainingMonth(searchParams.get("month"));
  const request = auth(context, performance), today = trainingToday();
  const range = monthRange(month), window = { from: isoDayShift(today, -(INTENSITY_WINDOW_DAYS - 1)), to: today };
  const covered = range.from >= window.from && range.to <= window.to;
  const [windowDays, monthDays] = await Promise.all([
    listCompletedSetsByDay(window, request),
    covered ? Promise.resolve(null) : listCompletedSetsByDay(range, request),
  ]);
  const thresholds = intensityThresholds(windowDays);
  const days = (monthDays ?? windowDays.filter(day => day.date >= range.from && day.date <= range.to));
  return { month, days: days.map(day => ({ ...day, level: intensityLevel(day.completedSets, thresholds) })) };
}

/** Exercises with completed history (Web default: recorded, most recent first). */
export async function listMobileTrainingHistoryExercises(context: MobileSupabaseAuthenticatedContext,
  performance: RequestPerformanceContext): Promise<TrainingHistoryExercisesResponse> {
  const directory = await getTrainingHistoryDirectory(auth(context, performance));
  const recorded = sortTrainingHistoryExercises(directory.exercises.filter((exercise) => exercise.sessions > 0), "recent");
  return { exercises: recorded.map((exercise) => ({
    id: exercise.id, name: exercise.name, muscleGroup: exercise.muscleGroup, muscleLabel: exercise.muscleLabel,
    implement: exercise.implement, weightMode: exercise.weightMode, lastDate: exercise.lastDate, sessions: exercise.sessions,
    lastMark: exercise.lastMark, bestMark: exercise.bestMark,
  })) };
}
// Same projection as the Web exercise history page.
function exerciseReportSessions(items: RobustExerciseHistoryItem[]): ExerciseReportSession[] {
  return items.map((item) => ({
    sessionId: item.session.id, logDate: item.logDate, completedAt: item.session.ended_at, routineId: item.session.routine_id,
    routineName: item.session.routine_name_snapshot ?? item.session.session_name ?? "Sesión libre",
    decision: item.exercise.decision, weightMode: item.exercise.weight_mode_snapshot,
    sets: item.exercise.sets.map((set) => ({
      id: set.id, set_number: set.set_number, target_reps: set.target_reps, target_weight_kg: set.target_weight_kg,
      target_rir: set.target_rir, actual_reps: set.actual_reps, actual_weight_kg: set.actual_weight_kg, is_completed: set.is_completed,
    })),
  }));
}
function exerciseHistorySessionDto(session: TrainingHistoryExerciseSession, routineIds?: Map<string, string | null>): TrainingExerciseHistorySessionDto {
  return { ...(routineIds ? { routineId: routineIds.get(session.sessionId) ?? null } : {}), sessionId: session.sessionId, logDate: session.logDate, routineName: session.routineName, mark: session.mark,
    completedSets: session.completedSets, rirValues: session.rirValues };
}
/** One exercise's completed snapshot history with the Web latest/best marks. */
export async function readMobileTrainingExerciseHistory(id: unknown, searchParams: URLSearchParams,
  context: MobileSupabaseAuthenticatedContext, performance: RequestPerformanceContext): Promise<TrainingExerciseHistoryResponse> {
  const exerciseId = parseMobileTrainingId(id, "El ejercicio").toLowerCase();
  const limit = parseExerciseHistoryLimit(searchParams.get("limit"));
  const rawRoutineId = searchParams.get("routineId");
  const routineId = rawRoutineId === null ? null : parseMobileTrainingId(rawRoutineId, "La rutina").toLowerCase();
  // Opt-in response keeps older strict Mobile parsers operational until adoption.
  const expanded = searchParams.get("historyByRoutine") === "1" || routineId !== null;
  const request = auth(context, performance);
  const [catalog, items] = await Promise.all([
    listExercises({ includeArchived: true }, request),
    expanded ? listCompleteRobustExerciseHistory(exerciseId, request) : listRobustExerciseHistory({ exerciseId, limit: 500 }, request),
  ]);
  const exercise = catalog.find((item) => item.id === exerciseId) ?? null;
  const latestSnapshot = items[0]?.exercise ?? null;
  if (!exercise && !latestSnapshot) throw new MobileApiNotFoundError();
  const filtered = routineId === null ? items : items.filter(item => item.session.routine_id === routineId);
  const detail = buildTrainingHistoryExerciseDetail(exerciseReportSessions(filtered));
  const routineIds = expanded ? new Map(items.map(item => [item.session.id, item.session.routine_id])) : undefined;
  const routines = new Map<string, { id: string; name: string }>();
  for (const item of items) if (item.session.routine_id && !routines.has(item.session.routine_id)) routines.set(item.session.routine_id,
    { id: item.session.routine_id, name: item.session.routine_name_snapshot ?? item.session.session_name ?? "Rutina" });
  return {
    exercise: {
      id: exerciseId, name: latestSnapshot?.nombre_snapshot ?? exercise?.nombre ?? "Ejercicio",
      muscleGroup: latestSnapshot?.grupo_muscular_snapshot ?? exercise?.grupo_muscular ?? null,
      muscleLabel: latestSnapshot?.muscle_group_label_snapshot ?? exercise?.muscle_group_label ?? null,
      implement: latestSnapshot?.implement_snapshot ?? exercise?.implement ?? null,
      weightMode: latestSnapshot?.weight_mode_snapshot ?? exercise?.weight_mode ?? null,
    },
    ...(expanded ? { routines: [...routines.values()].sort((a,b) => a.name.localeCompare(b.name, "es-AR")) } : {}),
    latest: detail.latest ? exerciseHistorySessionDto(detail.latest, routineIds) : null,
    best: detail.best ? exerciseHistorySessionDto(detail.best, routineIds) : null,
    sessions: detail.sessions.slice(0, limit).map(session => exerciseHistorySessionDto(session, routineIds)),
    hasMore: detail.sessions.length > limit,
  };
}
