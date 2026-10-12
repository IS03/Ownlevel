import { parseRoutineColor } from './routine-color';
import type { MobileApiClient } from './client';
import type { MobileApiMutationResult, MobileApiRequestResult } from './results';
import type { MobileTrainingExerciseMutation, MobileTrainingMuscleGroup } from './exercises';
import type { MobileRoutineColorKey } from './home';
import { MOBILE_TRAINING_SESSIONS_API_PATH } from './training-sessions';

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
  decision: 'maintain' | 'increase_weight' | 'increase_reps' | 'custom';
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
  nextAdjustmentSnapshot: SessionExercisePayloadDto['decision'];
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
  decision: SessionExercisePayloadDto['decision'];
  sets: SessionSetDto[];
};
export type SessionDetailDto = {
  session: {
    id: string;
    routineId: string | null;
    routineNameSnapshot: string | null;
    name: string;
    status: 'in_progress' | 'completed' | 'discarded';
    logDate: string;
    startedAt: string;
    endedAt: string | null;
    updatedAt: string;
    routineColor: MobileRoutineColorKey | null;
    metadata: SessionMetadataDto;
  };
  exercises: SessionExerciseDto[];
  quickHistory: { status: 'unavailable' } | { status: 'ok'; data: Record<string, QuickSessionHistoryDto[]> };
};
export type SessionExerciseSyncDto =
  | { status: 'active'; updatedAt: string; payload: SessionExercisePayloadDto }
  | { status: 'session_closed'; sessionStatus: 'completed' | 'discarded' }
  | { status: 'removed' };
export type SessionStructuralDto =
  | { status: 'added'; sessionId: string; sessionExerciseId: string; exerciseId: string }
  | { status: 'removed'; sessionId: string; sessionExerciseId: string }
  | { status: 'cancelled'; sessionId: string };
export type SessionAddInput =
  | { operation: 'add_existing'; exerciseId: string; idempotencyKey: string }
  | { operation: 'create_and_add'; exercise: MobileTrainingExerciseMutation; idempotencyKey: string };
export type SessionExerciseOrderInput = {
  orderedSessionExerciseIds: string[];
  expectedSessionUpdatedAt: string;
  idempotencyKey: string;
};
export type SessionExerciseOrderDto = {
  status: 'reordered'; sessionId: string; sessionUpdatedAt: string; orderedSessionExerciseIds: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUPS = new Set(['pecho', 'espalda', 'piernas', 'hombros', 'bíceps', 'tríceps', 'abdomen', 'cardio']);
const COLORS = new Set(['violet', 'indigo', 'blue', 'cyan', 'green', 'yellow', 'orange', 'rose']);
const DECISIONS = new Set(['maintain', 'increase_weight', 'increase_reps', 'custom']);
function record(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => keys.includes(key));
}
function id(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
function text(value: unknown): value is string | null { return value === null || typeof value === 'string'; }
function date(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function timestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  return !!match && date(match[1]) && Number(match[2]) <= 23 && Number(match[3]) <= 59 && Number(match[4]) <= 59 &&
    (match[5] === undefined || (Number(match[5]) <= 23 && Number(match[6]) <= 59)) && Number.isFinite(Date.parse(value));
}
function number(value: unknown, maximum: number, integer = false, minimum = 0): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum &&
    (integer ? Number.isInteger(value) : Math.abs(value * 100 - Math.round(value * 100)) < 1e-8));
}
function parseSets(value: unknown): SessionSetDto[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return undefined;
  const result: SessionSetDto[] = [];
  for (const [index, set] of value.entries()) {
    if (!record(set, ['setNumber', 'targetReps', 'targetWeightKg', 'targetRir', 'actualReps', 'actualWeightKg', 'isCompleted', 'notes']) ||
      set.setNumber !== index + 1 || !number(set.targetReps, 1000, true) || !number(set.targetWeightKg, 9999.99) ||
      !number(set.targetRir, 10, true) || !number(set.actualReps, 1000, true) || !number(set.actualWeightKg, 9999.99) ||
      typeof set.isCompleted !== 'boolean' || !text(set.notes)) return undefined;
    result.push(set as SessionSetDto);
  }
  return result;
}
export function parseSessionExercisePayload(value: unknown): SessionExercisePayloadDto | undefined {
  if (!record(value, ['isCompleted', 'decision', 'decisionNote', 'applyToRoutine', 'notes', 'sets']) ||
    typeof value.isCompleted !== 'boolean' || !DECISIONS.has(value.decision as string) ||
    typeof value.decisionNote !== 'string' || typeof value.notes !== 'string' || typeof value.applyToRoutine !== 'boolean') return undefined;
  const sets = parseSets(value.sets);
  if (!sets || value.isCompleted !== sets.some((set) => set.isCompleted)) return undefined;
  return canonicalSessionExercisePayload({
    isCompleted: value.isCompleted, decision: value.decision as SessionExercisePayloadDto['decision'],
    decisionNote: value.decisionNote, applyToRoutine: value.applyToRoutine, notes: value.notes, sets,
  });
}
/** Use this representation for drafts and attempted-write/read-back comparison. */
export function canonicalSessionExercisePayload(payload: SessionExercisePayloadDto): SessionExercisePayloadDto {
  return { ...payload, decisionNote: payload.decision === 'custom' ? payload.decisionNote.trim() : '',
    sets: payload.sets.map((set) => ({ ...set, notes: set.notes === '' ? null : set.notes })) };
}
function parseExercise(value: unknown): SessionExerciseDto | undefined {
  if (!record(value, ['id', 'exerciseId', 'routineExerciseId', 'order', 'nameSnapshot', 'muscleGroupSnapshot',
    'muscleGroupLabelSnapshot', 'implementSnapshot', 'weightModeSnapshot', 'restMinSecondsSnapshot', 'restMaxSecondsSnapshot',
    'nextAdjustmentSnapshot', 'nextAdjustmentNoteSnapshot', 'updatedAt', 'payload']) ||
    !id(value.id) || !id(value.exerciseId) || (value.routineExerciseId !== null && !id(value.routineExerciseId)) ||
    !Number.isSafeInteger(value.order) || (value.order as number) < 1 || typeof value.nameSnapshot !== 'string' || !value.nameSnapshot.trim() ||
    (value.muscleGroupSnapshot !== null && !GROUPS.has(value.muscleGroupSnapshot as string)) ||
    !text(value.muscleGroupLabelSnapshot) || !text(value.implementSnapshot) || !text(value.weightModeSnapshot) ||
    !number(value.restMinSecondsSnapshot, 3600, true) || !number(value.restMaxSecondsSnapshot, 3600, true) ||
    !DECISIONS.has(value.nextAdjustmentSnapshot as string) || !text(value.nextAdjustmentNoteSnapshot) || !timestamp(value.updatedAt)) return undefined;
  const payload = parseSessionExercisePayload(value.payload);
  if (!payload || (value.routineExerciseId === null && payload.applyToRoutine)) return undefined;
  return { ...value, payload } as SessionExerciseDto;
}
function metadata(value: unknown): value is SessionMetadataDto {
  return record(value, ['energyLevel', 'performanceLevel', 'painLevel', 'painNote', 'treadmillMinutes', 'treadmillDistanceKm',
    'treadmillSpeedKmh', 'treadmillInclinePercent', 'notes']) && number(value.energyLevel, 5, true, 1) &&
    number(value.performanceLevel, 5, true, 1) && number(value.painLevel, 10, true) && text(value.painNote) && text(value.notes) &&
    number(value.treadmillMinutes, 1440) && number(value.treadmillDistanceKm, 1000) && number(value.treadmillSpeedKmh, 100) && number(value.treadmillInclinePercent, 100);
}
function history(value: unknown): SessionDetailDto['quickHistory'] | undefined {
  if (!record(value, ['status', 'data'])) return undefined;
  if (value.status === 'unavailable') return record(value, ['status']) ? { status: 'unavailable' } : undefined;
  if (value.status !== 'ok' || !value.data || typeof value.data !== 'object' || Array.isArray(value.data)) return undefined;
  const result: Record<string, QuickSessionHistoryDto[]> = {};
  for (const [exerciseId, rows] of Object.entries(value.data)) {
    if (!id(exerciseId) || !Array.isArray(rows) || rows.length > 6) return undefined;
    const sessions: QuickSessionHistoryDto[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (!record(row, ['sessionId', 'logDate', 'completedAt', 'routineId', 'routineName', 'decision', 'sets']) ||
        !id(row.sessionId) || seen.has(row.sessionId) || !date(row.logDate) || (row.completedAt !== null && !timestamp(row.completedAt)) ||
        (row.routineId !== null && !id(row.routineId)) || typeof row.routineName !== 'string' || !DECISIONS.has(row.decision as string)) return undefined;
      const sets = parseSets(row.sets);
      if (!sets) return undefined;
      seen.add(row.sessionId);
      sessions.push({ ...row, sets } as QuickSessionHistoryDto);
    }
    result[exerciseId] = sessions;
  }
  return { status: 'ok', data: result };
}
export function parseSessionDetail(value: unknown): SessionDetailDto | undefined {
  if (!record(value, ['session', 'exercises', 'quickHistory']) || !record(value.session, ['id', 'routineId', 'routineNameSnapshot', 'name',
    'status', 'logDate', 'startedAt', 'endedAt', 'updatedAt', 'routineColor', 'metadata']) || !Array.isArray(value.exercises)) return undefined;
  const s = value.session;
  if (!id(s.id) || (s.routineId !== null && !id(s.routineId)) || !text(s.routineNameSnapshot) || typeof s.name !== 'string' || !s.name.trim() ||
    !['in_progress', 'completed', 'discarded'].includes(s.status as string) || !date(s.logDate) || !timestamp(s.startedAt) ||
    (s.endedAt !== null && !timestamp(s.endedAt)) || !timestamp(s.updatedAt) ||
    parseRoutineColor(s.routineColor) === undefined || !metadata(s.metadata)) return undefined;
  const exercises: SessionExerciseDto[] = [];
  const seen = new Set<string>();
  const catalog = new Set<string>();
  let order = 0;
  for (const raw of value.exercises) {
    const exercise = parseExercise(raw);
    if (!exercise || seen.has(exercise.id) || catalog.has(exercise.exerciseId) || exercise.order <= order) return undefined;
    seen.add(exercise.id); catalog.add(exercise.exerciseId); order = exercise.order;
    exercises.push(exercise);
  }
  // This auxiliary resource must not invalidate the operational detail.
  const quickHistory = history(value.quickHistory) ?? { status: 'unavailable' as const };
  return { session: { ...s, routineColor: parseRoutineColor(s.routineColor)! } as SessionDetailDto['session'], exercises, quickHistory };
}
export function parseSessionExerciseSync(value: unknown): SessionExerciseSyncDto | undefined {
  if (!record(value, ['status', 'updatedAt', 'payload', 'sessionStatus'])) return undefined;
  if (value.status === 'removed' && record(value, ['status'])) return { status: 'removed' };
  if (value.status === 'session_closed' && record(value, ['status', 'sessionStatus']) &&
    (value.sessionStatus === 'completed' || value.sessionStatus === 'discarded')) return { status: 'session_closed', sessionStatus: value.sessionStatus };
  if (value.status !== 'active' || !record(value, ['status', 'updatedAt', 'payload']) || !timestamp(value.updatedAt)) return undefined;
  const payload = parseSessionExercisePayload(value.payload);
  return payload ? { status: 'active', updatedAt: value.updatedAt, payload } : undefined;
}
function structural(value: unknown): SessionStructuralDto | undefined {
  if (!record(value, ['status', 'sessionId', 'sessionExerciseId', 'exerciseId']) || !id(value.sessionId)) return undefined;
  if (value.status === 'cancelled' && record(value, ['status', 'sessionId'])) return value as SessionStructuralDto;
  if (value.status === 'removed' && record(value, ['status', 'sessionId', 'sessionExerciseId']) && id(value.sessionExerciseId)) return value as SessionStructuralDto;
  if (value.status === 'added' && id(value.sessionExerciseId) && id(value.exerciseId)) return value as SessionStructuralDto;
  return undefined;
}
function path(sessionId: string, exerciseId?: string): `/${string}` {
  const base = `${MOBILE_TRAINING_SESSIONS_API_PATH}/${encodeURIComponent(sessionId)}` as const;
  return exerciseId === undefined ? base : `${base}/exercises/${encodeURIComponent(exerciseId)}`;
}
export function fetchSessionDetail(client: MobileApiClient, sessionId: string, signal?: AbortSignal): Promise<MobileApiRequestResult<SessionDetailDto>> {
  // request(GET) preserves a true 404, unlike the generic read() surface.
  return client.request({ method: 'GET', path: path(sessionId), signal, parse: (value) => {
    const result = parseSessionDetail(value);
    return result?.session.id === sessionId ? result : undefined;
  } });
}
export function fetchSessionExerciseSync(client: MobileApiClient, sessionId: string, sessionExerciseId: string, signal?: AbortSignal): Promise<MobileApiRequestResult<SessionExerciseSyncDto>> {
  return client.request({ method: 'GET', path: path(sessionId, sessionExerciseId), signal, parse: parseSessionExerciseSync });
}
export function saveSessionExercise(client: MobileApiClient, sessionId: string, sessionExerciseId: string,
  body: { expectedUpdatedAt: string; payload: SessionExercisePayloadDto }): Promise<MobileApiMutationResult<{ sessionExerciseId: string; updatedAt: string }>> {
  return client.request({ method: 'PUT', path: path(sessionId, sessionExerciseId),
    body: { ...body, payload: canonicalSessionExercisePayload(body.payload) }, parse: (value) =>
    record(value, ['sessionExerciseId', 'updatedAt']) && value.sessionExerciseId === sessionExerciseId && timestamp(value.updatedAt)
      ? { sessionExerciseId, updatedAt: value.updatedAt } : undefined });
}
export function addSessionExercise(client: MobileApiClient, sessionId: string, body: SessionAddInput): Promise<MobileApiMutationResult<SessionStructuralDto>> {
  return client.request({ method: 'POST', path: `${path(sessionId)}/exercises`, body, parse: (value) => {
    const parsed = structural(value);
    return parsed?.status === 'added' && parsed.sessionId === sessionId &&
      (body.operation !== 'add_existing' || parsed.exerciseId === body.exerciseId) ? parsed : undefined;
  } });
}
export function removeSessionExercise(client: MobileApiClient, sessionId: string, sessionExerciseId: string,
  body: { expectedUpdatedAt: string; idempotencyKey: string }): Promise<MobileApiMutationResult<SessionStructuralDto>> {
  return client.request({ method: 'DELETE', path: path(sessionId, sessionExerciseId), body, parse: (value) => {
    const parsed = structural(value);
    return parsed?.status === 'removed' && parsed.sessionId === sessionId && parsed.sessionExerciseId === sessionExerciseId ? parsed : undefined;
  } });
}
export function cancelSession(client: MobileApiClient, sessionId: string, idempotencyKey: string): Promise<MobileApiMutationResult<SessionStructuralDto>> {
  return client.request({ method: 'DELETE', path: path(sessionId), body: { idempotencyKey }, parse: (value) => {
    const parsed = structural(value);
    return parsed?.status === 'cancelled' && parsed.sessionId === sessionId ? parsed : undefined;
  } });
}
export function parseSessionExerciseOrder(value: unknown): SessionExerciseOrderDto | undefined {
  if (!record(value, ['status', 'sessionId', 'sessionUpdatedAt', 'orderedSessionExerciseIds']) || value.status !== 'reordered' ||
    !id(value.sessionId) || !timestamp(value.sessionUpdatedAt) || !Array.isArray(value.orderedSessionExerciseIds) ||
    value.orderedSessionExerciseIds.length > 10000 || !value.orderedSessionExerciseIds.every(id) ||
    new Set(value.orderedSessionExerciseIds.map(id => id.toLowerCase())).size !== value.orderedSessionExerciseIds.length) return undefined;
  return { status: 'reordered', sessionId: value.sessionId.toLowerCase(), sessionUpdatedAt: value.sessionUpdatedAt, orderedSessionExerciseIds: value.orderedSessionExerciseIds.map(id => id.toLowerCase()) };
}
export function reorderSessionExercises(client: MobileApiClient, sessionId: string, body: SessionExerciseOrderInput): Promise<MobileApiMutationResult<SessionExerciseOrderDto>> {
  return client.request({ method: 'PUT', path: `${path(sessionId)}/exercise-order`, body, parse: value => {
    const parsed = parseSessionExerciseOrder(value);
    return parsed?.sessionId === sessionId.toLowerCase() && parsed.orderedSessionExerciseIds.length === body.orderedSessionExerciseIds.length &&
      parsed.orderedSessionExerciseIds.every((id, index) => id === body.orderedSessionExerciseIds[index].toLowerCase()) ? parsed : undefined;
  } });
}

// M3.4-2 — finish. Metadata mirrors the active Web finish exactly (no pain
// note, treadmill or name). Missing values are null, never 0.
export type SessionFinishMetadata = {
  energyLevel: number | null;
  performanceLevel: number | null;
  painLevel: number | null;
  notes: string | null;
};
export type SessionFinishInput = { metadata: SessionFinishMetadata; idempotencyKey: string };
export type SessionFinishedDto = {
  status: 'finished';
  sessionId: string;
  sessionStatus: 'completed';
  name: string;
  routineId: string | null;
  logDate: string;
  startedAt: string;
  endedAt: string;
  sessionUpdatedAt: string;
  metadata: SessionFinishMetadata;
  exerciseCount: number;
  completedExerciseCount: number;
  completedSetCount: number;
};
export function parseSessionFinishMetadata(value: unknown): SessionFinishMetadata | undefined {
  if (!record(value, ['energyLevel', 'performanceLevel', 'painLevel', 'notes']) || Object.keys(value).length !== 4 ||
    !number(value.energyLevel, 5, true, 1) || !number(value.performanceLevel, 5, true, 1) || !number(value.painLevel, 10, true) ||
    !text(value.notes)) return undefined;
  return value as SessionFinishMetadata;
}
function counter(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0; }
export function parseSessionFinished(value: unknown): SessionFinishedDto | undefined {
  if (!record(value, ['status', 'sessionId', 'sessionStatus', 'name', 'routineId', 'logDate', 'startedAt', 'endedAt', 'sessionUpdatedAt',
    'metadata', 'exerciseCount', 'completedExerciseCount', 'completedSetCount']) || Object.keys(value).length !== 13 ||
    value.status !== 'finished' || value.sessionStatus !== 'completed' || !id(value.sessionId) || typeof value.name !== 'string' ||
    !value.name.trim() || (value.routineId !== null && !id(value.routineId)) || !date(value.logDate) || !timestamp(value.startedAt) ||
    !timestamp(value.endedAt) || !timestamp(value.sessionUpdatedAt) || !counter(value.exerciseCount) ||
    !counter(value.completedExerciseCount) || !counter(value.completedSetCount)) return undefined;
  const metadata = parseSessionFinishMetadata(value.metadata);
  return metadata ? { ...(value as SessionFinishedDto), sessionId: value.sessionId.toLowerCase(), metadata } : undefined;
}
export function finishSession(client: MobileApiClient, sessionId: string, body: SessionFinishInput): Promise<MobileApiMutationResult<SessionFinishedDto>> {
  return client.request({ method: 'POST', path: `${path(sessionId)}/finish`, body, parse: value => {
    const parsed = parseSessionFinished(value);
    return parsed?.sessionId === sessionId.toLowerCase() ? parsed : undefined;
  } });
}
// Shared strict guards for the other Training session contracts.
export const sessionGuards = { record, id, text, date, timestamp, number, counter, COLORS };
