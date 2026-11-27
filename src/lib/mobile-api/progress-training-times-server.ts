import 'server-only';
import { createHash } from 'node:crypto';
import { loadCompletedTrainingData, readAllTrainingRows } from '../phase2/training-robust';
import { buildTrainingTimes } from '../progress/training-times';
import type { InsightsSource } from '../progress/insights-engine/types';
import { MobileApiValidationError } from './auth';
import { readInsightsRevision } from './performance-insights-server';
import { progressQueryFromParams, progressReadResponse, resolveMobileProgressPeriod } from './progress-server';
import { webAuth } from './progress-sources';
import { parseProgressTrainingTimes, type TrainingTimeSelection } from './progress-training-times-contract';
import type { MobileSupabaseAuthenticatedContext } from './supabase';
import { InsightsSnapshotCache } from './performance-insights-cache';
import { todayInCordoba } from '../phase2/cordoba-date';
import { NutritionReportDayChangedError } from './nutrition-report-server';
import type { ProgressPeriod } from './progress-contract';

const sources = new InsightsSnapshotCache<InsightsSource>({ maxEntries: 3, ttlMs: 5 * 60_000 });
export const clearTrainingTimesSources = () => sources.clear();

function selectionFromParams(params: URLSearchParams): TrainingTimeSelection {
  const routine = params.get('routine'), execution = params.get('execution'), bin = params.get('bin'), offset = params.get('offset');
  if (routine !== null && routine !== 'free' && !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(routine)
    || execution !== null && (execution.length === 0 || execution.length > 2048)
    || bin !== null && !/^(?:[0-9]|1[01])$/.test(bin)
    || offset !== null && (!/^(?:0|[1-9][0-9]{0,6})$/.test(offset))) throw new MobileApiValidationError('Filtro de horarios no válido.');
  return { routine: routine?.toLowerCase() ?? null, execution, bin: bin === null ? null : Number(bin), offset: Number(offset ?? 0) };
}

/** Training only: the existing owner-scoped paged loader plus a paged feelings read, never meals/metrics or one query per session. */
export async function readTrainingTimesSource(context: MobileSupabaseAuthenticatedContext, range: { start: string; end: string }): Promise<InsightsSource> {
  type FeelingRow = { session_id: string; revision: number; facts: unknown };
  const [source, feelings] = await Promise.all([
    // All training history is required by the canonical previous-compatible-exercise comparator.
    loadCompletedTrainingData(webAuth(context), { includeWarmups: true }),
    readAllTrainingRows<FeelingRow>('Leer energía de horarios', (from, to) => context.supabase.from('workout_session_feelings')
      .select('session_id,revision,facts,session:workout_sessions!inner(user_id,status,day:day_logs!inner(log_date))')
      .eq('session.user_id', context.userId).eq('session.status', 'completed')
      .gte('session.day.log_date', range.start).lte('session.day.log_date', range.end).order('session_id').range(from, to)),
  ]);
  const number = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    const n = typeof value === 'string' && value.trim() ? Number(value) : value;
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error('Invalid training times numeric source');
    return n;
  };
  return {
    sessions: source.sessions.map(s => ({ id: s.id, date: source.dateByDayLog.get(s.day_log_id) ?? null, routineId: s.routine_id,
      routineName: s.routine_name_snapshot, name: s.session_name, status: s.status, startedAt: s.started_at, endedAt: s.ended_at,
      performanceLevel: null, painLevel: null, legacyEnergyLevel: null })),
    exercises: source.sessionExercises.map(e => ({ id: e.id, sessionId: e.workout_session_id, exerciseId: e.exercise_id,
      name: e.nombre_snapshot, implement: e.implement_snapshot, weightMode: e.weight_mode_snapshot, isCompleted: e.is_completed,
      configuration: source.configurations?.get(e.id) ?? null })),
    sets: source.sets.map(s => ({ id: s.id, sessionExerciseId: s.workout_session_exercise_id, actualReps: number(s.actual_reps),
      actualLoad: number(s.actual_weight_kg), isCompleted: s.is_completed, completedAt: s.completed_at, setKind: s.set_kind })),
    feelings: feelings.map(f => ({ sessionId: f.session_id, revision: f.revision, facts: f.facts })),
    metricDefinitions: [], metricValues: [], meals: [],
  };
}

export async function readConsistentTrainingTimesSource(context: MobileSupabaseAuthenticatedContext, period: ProgressPeriod, today: string) {
  // A concurrent finish, correction or discard invalidates the entire read. No partial snapshot is published.
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = await readInsightsRevision(context), key = `${context.userId}|${period.start}|${period.end}`;
    let source = sources.get(key, before, today);
    if (!source) {
      source = await readTrainingTimesSource(context, period);
      if (await readInsightsRevision(context) !== before) continue;
      sources.set(key, before, today, source);
    }
    const after = todayInCordoba();
    if (after !== today) throw new NutritionReportDayChangedError(after);
    const revision = createHash('sha256').update(`${context.userId}|${before}`).digest('hex').slice(0, 32);
    return { source, revision };
  }
  throw new Error('Training times sources kept changing');
}

export const progressTrainingTimesResponse = (request: Request) => progressReadResponse(request, 'training.times', async (context, params, today) => {
  const query = progressQueryFromParams(params, ['routine', 'execution', 'bin', 'offset']);
  if (query.compare) throw new MobileApiValidationError('Horarios usa un solo período.');
  const { period } = resolveMobileProgressPeriod(query, today), selection = selectionFromParams(params);
  const { source, revision } = await readConsistentTrainingTimesSource(context, period, today);
  try { return buildTrainingTimes(source, { today, period, revision, selection }); }
  catch (error) {
    if (error instanceof Error && ['Unknown timing routine', 'Unknown timing execution'].includes(error.message)) throw new MobileApiValidationError('El filtro ya no tiene registros en este período. Elegí otro.');
    throw error;
  }
}, parseProgressTrainingTimes);
