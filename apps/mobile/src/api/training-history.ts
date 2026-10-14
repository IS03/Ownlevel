import { parseRoutineColor } from './routine-color';
import type { MobileApiClient } from './client';
import type { MobileRoutineColorKey } from './home';
import type { MobileApiMutationResult, MobileApiReadResult } from './results';
import { sessionGuards as g, type SessionMetadataDto } from './active-session';

// M3.4-3 — history, day, exercise history, correction and discard contracts.
const BASE = '/api/mobile/v1/training' as const;
export type TrainingHistorySession = {
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
export type TrainingHistoryPage = { sessions: TrainingHistorySession[]; nextCursor: string | null };
export type TrainingDay = {
  date: string;
  sessions: TrainingHistorySession[];
  summary: { sessionCount: number; exercisesCompleted: number; completedSets: number; durationMilliseconds: number | null; volumeKg: number | null };
};
export type TrainingHistoryMark = { weightKg: number | null; reps: number | null };
export type TrainingHistoryExercise = {
  id: string; name: string; muscleGroup: string | null; muscleLabel: string | null; implement: string | null; weightMode: string | null;
  lastDate: string | null; sessions: number; lastMark: TrainingHistoryMark | null; bestMark: TrainingHistoryMark | null;
};
export type TrainingExerciseHistorySession = {
  routineId?: string | null;
  sessionId: string; logDate: string; routineName: string; mark: TrainingHistoryMark | null; completedSets: number; rirValues: number[];
};
export type TrainingExerciseHistory = {
  routines?: { id: string; name: string }[];
  exercise: { id: string; name: string; muscleGroup: string | null; muscleLabel: string | null; implement: string | null; weightMode: string | null };
  latest: TrainingExerciseHistorySession | null;
  best: TrainingExerciseHistorySession | null;
  sessions: TrainingExerciseHistorySession[];
  hasMore: boolean;
};
export type SessionCorrectionSet = { setNumber: number; actualReps: number | null; actualWeightKg: number | null; notes: string | null };
export type SessionCorrectionInput = {
  expectedSessionUpdatedAt: string;
  metadata: SessionMetadataDto;
  exercises: { sessionExerciseId: string; expectedUpdatedAt: string; notes: string | null; sets: SessionCorrectionSet[] }[];
  idempotencyKey: string;
};
export type SessionCorrectedDto = {
  status: 'corrected'; sessionId: string; sessionUpdatedAt: string; metadata: SessionMetadataDto;
  exercises: { id: string; updatedAt: string; notes: string | null; sets: SessionCorrectionSet[] }[];
};
export type SessionDiscardedDto = { status: 'discarded'; sessionId: string; sessionUpdatedAt: string };

const nullableCounter = (value: unknown) => value === null || g.counter(value);
const nullableVolume = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
function parseSession(value: unknown): TrainingHistorySession | undefined {
  if (!g.record(value, ['id', 'routineId', 'routineName', 'routineColor', 'logDate', 'startedAt', 'endedAt', 'durationMilliseconds',
    'exercisesCompleted', 'completedSets', 'volumeKg']) || Object.keys(value).length !== 11 || !g.id(value.id) ||
    (value.routineId !== null && !g.id(value.routineId)) || typeof value.routineName !== 'string' ||
    parseRoutineColor(value.routineColor) === undefined || !g.date(value.logDate) ||
    !g.timestamp(value.startedAt) || !g.timestamp(value.endedAt) || !nullableCounter(value.durationMilliseconds) ||
    !g.counter(value.exercisesCompleted) || !g.counter(value.completedSets) || !nullableVolume(value.volumeKg)) return undefined;
  return { ...value, routineColor: parseRoutineColor(value.routineColor)! } as TrainingHistorySession;
}
function parseSessions(value: unknown): TrainingHistorySession[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sessions = value.map(parseSession);
  return sessions.every((session): session is TrainingHistorySession => session !== undefined) ? sessions : undefined;
}
export function parseTrainingHistoryPage(value: unknown): TrainingHistoryPage | undefined {
  if (!g.record(value, ['sessions', 'nextCursor']) || Object.keys(value).length !== 2 ||
    (value.nextCursor !== null && (typeof value.nextCursor !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value.nextCursor)))) return undefined;
  const sessions = parseSessions(value.sessions);
  return sessions ? { sessions, nextCursor: value.nextCursor as string | null } : undefined;
}
export function parseTrainingDay(value: unknown, requested?: string): TrainingDay | undefined {
  if (!g.record(value, ['date', 'sessions', 'summary']) || Object.keys(value).length !== 3 || !g.date(value.date) ||
    (requested !== undefined && value.date !== requested)) return undefined;
  const summary = value.summary;
  if (!g.record(summary, ['sessionCount', 'exercisesCompleted', 'completedSets', 'durationMilliseconds', 'volumeKg']) ||
    Object.keys(summary).length !== 5 || !g.counter(summary.sessionCount) || !g.counter(summary.exercisesCompleted) ||
    !g.counter(summary.completedSets) || !nullableCounter(summary.durationMilliseconds) || !nullableVolume(summary.volumeKg)) return undefined;
  const sessions = parseSessions(value.sessions);
  // A day's sessions all belong to that stored log date.
  if (!sessions || sessions.some(session => session.logDate !== value.date)) return undefined;
  return { date: value.date, sessions, summary: summary as TrainingDay['summary'] };
}
function parseMark(value: unknown): TrainingHistoryMark | null | undefined {
  if (value === null) return null;
  if (!g.record(value, ['weightKg', 'reps']) || Object.keys(value).length !== 2 ||
    !(value.weightKg === null || (typeof value.weightKg === 'number' && Number.isFinite(value.weightKg) && value.weightKg >= 0)) ||
    !(value.reps === null || (typeof value.reps === 'number' && Number.isFinite(value.reps) && value.reps >= 0))) return undefined;
  return value as TrainingHistoryMark;
}
const IDENTITY = ['id', 'name', 'muscleGroup', 'muscleLabel', 'implement', 'weightMode'] as const;
function identityValid(value: Record<string, unknown>) {
  return g.id(value.id) && typeof value.name === 'string' && g.text(value.muscleGroup) && g.text(value.muscleLabel) &&
    g.text(value.implement) && g.text(value.weightMode);
}
export function parseTrainingHistoryExercises(value: unknown): TrainingHistoryExercise[] | undefined {
  if (!g.record(value, ['exercises']) || !Array.isArray(value.exercises)) return undefined;
  const result: TrainingHistoryExercise[] = [];
  for (const row of value.exercises) {
    if (!g.record(row, [...IDENTITY, 'lastDate', 'sessions', 'lastMark', 'bestMark']) || Object.keys(row).length !== 10 ||
      !identityValid(row) || (row.lastDate !== null && !g.date(row.lastDate)) || !g.counter(row.sessions)) return undefined;
    const lastMark = parseMark(row.lastMark), bestMark = parseMark(row.bestMark);
    if (lastMark === undefined || bestMark === undefined) return undefined;
    result.push({ ...(row as TrainingHistoryExercise), lastMark, bestMark });
  }
  return result;
}
function parseExerciseSession(value: unknown): TrainingExerciseHistorySession | undefined {
  if (!g.record(value, ['sessionId', 'logDate', 'routineName', 'mark', 'completedSets', 'rirValues', 'routineId']) || Object.keys(value).length !== (value.routineId === undefined ? 6 : 7) ||
    (value.routineId !== undefined && value.routineId !== null && !g.id(value.routineId)) ||
    !g.id(value.sessionId) || !g.date(value.logDate) || typeof value.routineName !== 'string' || !g.counter(value.completedSets) ||
    !Array.isArray(value.rirValues) || !value.rirValues.every(rir => typeof rir === 'number' && Number.isFinite(rir))) return undefined;
  const mark = parseMark(value.mark);
  return mark === undefined ? undefined : { ...(value as TrainingExerciseHistorySession), mark };
}
export function parseTrainingExerciseHistory(value: unknown, exerciseId?: string): TrainingExerciseHistory | undefined {
  if (!g.record(value, ['exercise', 'latest', 'best', 'sessions', 'hasMore', 'routines']) || Object.keys(value).length !== (value.routines === undefined ? 5 : 6) ||
    (value.routines !== undefined && (!Array.isArray(value.routines) || value.routines.some(row => !g.record(row, ['id', 'name']) || Object.keys(row).length !== 2 || !g.id(row.id) || typeof row.name !== 'string'))) ||
    typeof value.hasMore !== 'boolean' || !Array.isArray(value.sessions)) return undefined;
  const exercise = value.exercise;
  if (!g.record(exercise, IDENTITY) || Object.keys(exercise).length !== 6 || !identityValid(exercise) ||
    (exerciseId !== undefined && (exercise.id as string).toLowerCase() !== exerciseId.toLowerCase())) return undefined;
  const latest = value.latest === null ? null : parseExerciseSession(value.latest);
  const best = value.best === null ? null : parseExerciseSession(value.best);
  const sessions = value.sessions.map(parseExerciseSession);
  if (latest === undefined || best === undefined || !sessions.every(Boolean)) return undefined;
  return { ...(value.routines === undefined ? {} : { routines: value.routines as TrainingExerciseHistory["routines"] }), exercise: exercise as TrainingExerciseHistory['exercise'], latest, best, sessions: sessions as TrainingExerciseHistorySession[], hasMore: value.hasMore };
}
function parseMetadata(value: unknown): SessionMetadataDto | undefined {
  if (!g.record(value, ['energyLevel', 'performanceLevel', 'painLevel', 'painNote', 'treadmillMinutes', 'treadmillDistanceKm',
    'treadmillSpeedKmh', 'treadmillInclinePercent', 'notes']) || Object.keys(value).length !== 9 ||
    !g.number(value.energyLevel, 5, true, 1) || !g.number(value.performanceLevel, 5, true, 1) || !g.number(value.painLevel, 10, true) ||
    !g.text(value.painNote) || !g.text(value.notes) ||
    ![value.treadmillMinutes, value.treadmillDistanceKm, value.treadmillSpeedKmh, value.treadmillInclinePercent]
      .every(item => item === null || (typeof item === 'number' && Number.isFinite(item) && item >= 0))) return undefined;
  return value as SessionMetadataDto;
}
function parseCorrectionSet(value: unknown): value is SessionCorrectionSet {
  return g.record(value, ['setNumber', 'actualReps', 'actualWeightKg', 'notes']) && Object.keys(value).length === 4 &&
    typeof value.setNumber === 'number' && Number.isInteger(value.setNumber) && value.setNumber >= 1 && value.setNumber <= 50 &&
    g.number(value.actualReps, 1000, true) && g.number(value.actualWeightKg, 9999.99) && g.text(value.notes);
}
export function parseSessionCorrected(value: unknown): SessionCorrectedDto | undefined {
  if (!g.record(value, ['status', 'sessionId', 'sessionUpdatedAt', 'metadata', 'exercises']) || Object.keys(value).length !== 5 ||
    value.status !== 'corrected' || !g.id(value.sessionId) || !g.timestamp(value.sessionUpdatedAt) || !Array.isArray(value.exercises)) return undefined;
  const metadata = parseMetadata(value.metadata);
  const exercisesValid = value.exercises.every(exercise => g.record(exercise, ['id', 'updatedAt', 'notes', 'sets']) &&
    Object.keys(exercise).length === 4 && g.id(exercise.id) && g.timestamp(exercise.updatedAt) && g.text(exercise.notes) &&
    Array.isArray(exercise.sets) && exercise.sets.every(parseCorrectionSet));
  return metadata && exercisesValid ? { ...(value as SessionCorrectedDto), sessionId: value.sessionId.toLowerCase(), metadata } : undefined;
}
export function parseSessionDiscarded(value: unknown): SessionDiscardedDto | undefined {
  if (!g.record(value, ['status', 'sessionId', 'sessionUpdatedAt']) || Object.keys(value).length !== 3 || value.status !== 'discarded' ||
    !g.id(value.sessionId) || !g.timestamp(value.sessionUpdatedAt)) return undefined;
  return { status: 'discarded', sessionId: value.sessionId.toLowerCase(), sessionUpdatedAt: value.sessionUpdatedAt };
}

export function fetchTrainingHistory(client: MobileApiClient, cursor: string | null, signal?: AbortSignal): Promise<MobileApiReadResult<TrainingHistoryPage>> {
  return client.read({ path: `${BASE}/history?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, signal, parse: parseTrainingHistoryPage });
}
export function fetchTrainingDay(client: MobileApiClient, date: string, signal?: AbortSignal): Promise<MobileApiReadResult<TrainingDay>> {
  return client.read({ path: `${BASE}/days/${encodeURIComponent(date)}`, signal, parse: value => parseTrainingDay(value, date) });
}
/** Trained days of a month with the person-relative intensity (1–4). Absent day = not trained. */
export type TrainingHistoryMonth = { month: string; days: { date: string; sessions: number; completedSets: number; level: 1 | 2 | 3 | 4 }[] };
export function parseTrainingHistoryMonth(value: unknown, requested?: string): TrainingHistoryMonth | undefined {
  if (!g.record(value, ['month', 'days']) || Object.keys(value).length !== 2 || typeof value.month !== 'string' ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month) || (requested !== undefined && value.month !== requested) || !Array.isArray(value.days)) return undefined;
  const month = value.month;
  const valid = value.days.every(day => g.record(day, ['date', 'sessions', 'completedSets', 'level']) && Object.keys(day).length === 4 &&
    g.date(day.date) && (day.date as string).startsWith(month) && g.counter(day.sessions) && (day.sessions as number) > 0 && g.counter(day.completedSets) &&
    [1, 2, 3, 4].includes(day.level as number));
  return valid ? { month, days: value.days as TrainingHistoryMonth['days'] } : undefined;
}
export function fetchTrainingHistoryMonth(client: MobileApiClient, month: string, signal?: AbortSignal): Promise<MobileApiReadResult<TrainingHistoryMonth>> {
  return client.read({ path: `${BASE}/history/days?month=${encodeURIComponent(month)}`, signal, parse: value => parseTrainingHistoryMonth(value, month) });
}
export function fetchTrainingHistoryExercises(client: MobileApiClient, signal?: AbortSignal): Promise<MobileApiReadResult<TrainingHistoryExercise[]>> {
  return client.read({ path: `${BASE}/history/exercises`, signal, parse: parseTrainingHistoryExercises });
}
export function fetchTrainingExerciseHistory(client: MobileApiClient, exerciseId: string, limit: number,
  signal?: AbortSignal, routineId?: string | null): Promise<MobileApiReadResult<TrainingExerciseHistory>> {
  return client.read({ path: `${BASE}/history/exercises/${encodeURIComponent(exerciseId)}?limit=${limit}&historyByRoutine=1${routineId ? `&routineId=${encodeURIComponent(routineId)}` : ''}`, signal,
    parse: value => {
      const parsed = parseTrainingExerciseHistory(value, exerciseId);
      return routineId && parsed?.routines === undefined ? undefined : parsed;
    } });
}
export function correctSession(client: MobileApiClient, sessionId: string, body: SessionCorrectionInput): Promise<MobileApiMutationResult<SessionCorrectedDto>> {
  return client.request({ method: 'PUT', path: `${BASE}/sessions/${encodeURIComponent(sessionId)}/correction`, body, parse: value => {
    const parsed = parseSessionCorrected(value);
    return parsed?.sessionId === sessionId.toLowerCase() ? parsed : undefined;
  } });
}
export function discardSession(client: MobileApiClient, sessionId: string, idempotencyKey: string): Promise<MobileApiMutationResult<SessionDiscardedDto>> {
  return client.request({ method: 'POST', path: `${BASE}/sessions/${encodeURIComponent(sessionId)}/discard`, body: { idempotencyKey }, parse: value => {
    const parsed = parseSessionDiscarded(value);
    return parsed?.sessionId === sessionId.toLowerCase() ? parsed : undefined;
  } });
}
