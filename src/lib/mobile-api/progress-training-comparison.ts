import { trainingExerciseStats, type TrainingAnalysisSource } from '../phase2/training-analysis';
import { buildPerformanceInsightsV1, buildPerformanceInsightsPartialV1 } from '../progress/performance-insights';
import { ownSessions } from '../progress/insights-engine/own-performance';
import { toPerformanceSessions } from '../progress/insights-engine/source-adapter';
import type { InsightsSource } from '../progress/insights-engine/types';
import { sessionExerciseContext } from '../progress/training-performance';
import type { ProgressPeriod, ProgressTrainingInPeriod, TrainingSignal } from './progress-contract';

/** Adapts the already loaded historical snapshots. No catalog substitution or additional database read. */
function comparisonSource(source: TrainingAnalysisSource, end: string): InsightsSource {
  return {
    sessions: source.sessions.filter(s => (source.dateByDayLog.get(s.day_log_id) ?? '') <= end).map(s => ({
      id: s.id, date: source.dateByDayLog.get(s.day_log_id) ?? null, routineId: s.routine_id, routineName: s.routine_name_snapshot,
      name: s.session_name, status: s.status, startedAt: s.started_at, endedAt: s.ended_at,
      performanceLevel: s.performance_level, painLevel: s.pain_level, legacyEnergyLevel: s.energy_level,
    })),
    exercises: source.sessionExercises.map(e => ({ id: e.id, sessionId: e.workout_session_id, exerciseId: e.exercise_id, name: e.nombre_snapshot,
      isCompleted: e.is_completed, weightMode: e.weight_mode_snapshot, ...sessionExerciseContext(source, e) })),
    sets: source.sets.map(s => ({ id: s.id, sessionExerciseId: s.workout_session_exercise_id, actualReps: s.actual_reps,
      actualLoad: s.actual_weight_kg, isCompleted: s.is_completed, completedAt: s.completed_at })),
    feelings: [], metricDefinitions: [], metricValues: [], meals: [],
  };
}
const fmt = (n: number) => new Intl.NumberFormat('es-AR', {maximumFractionDigits: 2}).format(n);

/**
 * Opt-in v2: the latest exposure of each exercise inside the window, using Comparaciones' strict/partial priority.
 * If neither lane has comparable exposures, reuse «lo tuyo» exactly (including its minimum historical baseline).
 * The methods never add their counts; the label identifies which question this reading answers.
 */
export function trainingComparisonDto(source: TrainingAnalysisSource, period: ProgressPeriod): ProgressTrainingInPeriod {
  const input = comparisonSource(source, period.end), { sessions } = toPerformanceSessions(input);
  const strict = buildPerformanceInsightsV1({ sessions, historyCoverage: 'complete', output: 'compact', exclusionDetail: 'summary' });
  const partial = buildPerformanceInsightsPartialV1({ sessions, historyCoverage: 'complete', output: 'compact', exclusionDetail: 'summary' });
  const inside = (date: string | null) => !!date && date >= period.start && date <= period.end;
  const strictSessions = strict.sessions.filter(s => inside(s.date)), partialSessions = partial.sessions.filter(s => inside(s.date));
  const strictCount = strictSessions.reduce((sum, s) => sum + s.counts.comparable, 0), partialCount = partialSessions.reduce((sum, s) => sum + s.counts.comparable, 0);
  let method: NonNullable<ProgressTrainingInPeriod['method']> = strictCount > 0 || partialCount === 0 ? 'strict' : 'partial';
  const dates = new Map(input.sessions.map(s => [s.id, s.date]));
  const latest = new Map<string, ProgressTrainingInPeriod['exercises'][number]>();
  const seen = new Map<string, number>();
  const rows = method === 'strict' ? strictSessions.map(s => ({ ...s, rows: s.exercises.map(e => ({ ...e, reading: e.status })) }))
    : partialSessions.map(s => ({ ...s, rows: s.exercises }));
  for (const session of [...rows].sort((a,b) => a.date!.localeCompare(b.date!) || a.sessionId.localeCompare(b.sessionId))) {
    for (const row of session.rows) {
      seen.set(row.exerciseId, (seen.get(row.exerciseId) ?? 0) + 1);
      const status = row.reading === 'improved' || row.reading === 'higher_record' ? 'improved'
        : row.reading === 'observed_stable' || row.reading === 'same_record' ? 'stable'
        : row.reading === 'declined' || row.reading === 'lower_record' ? 'declined' : 'insufficient_data';
      const c = row.change, shown = c?.shown;
      const unit = c?.load?.unit === 'lingote' ? 'lingotes' : 'kg';
      const suffix = c?.state === 'no_amount_signal' ? `${unit}${shown?.anchor !== null && shown?.anchor !== undefined ? ` · ${fmt(shown.anchor)} reps` : ''}`
        : `${c?.basis === 'time' ? 's' : 'reps'}${shown?.anchor !== null && shown?.anchor !== undefined ? ` · ${fmt(shown.anchor)} ${unit}` : ''}`;
      const signal: TrainingSignal | null = status === 'insufficient_data' ? null : {
        kind: 'session_comparison', description: shown ? `${fmt(shown.from)} → ${fmt(shown.to)} ${suffix}` : 'Frente a la última sesión compatible',
        currentValue: shown?.to ?? null, referenceValue: shown?.from ?? null, contextValue: shown?.anchor ?? null,
      };
      latest.set(row.exerciseId, { id: row.exerciseId, status, reason: status === 'insufficient_data' ? row.reason : 'session_comparison',
        sessions: seen.get(row.exerciseId)!, firstDate: dates.get(row.reference?.sessionId ?? '') ?? session.date!, lastDate: session.date!, signal });
    }
  }
  let comparedExposures = method === 'strict' ? strictCount : partialCount;
  if (strictCount === 0 && partialCount === 0) {
    const own = ownSessions(input).filter(s => inside(s.date));
    // Same last-exposure projection as the selected comparator; no cherry-picking an older successful result.
    const ownLatest = new Map<string, {session: typeof own[number]; exercise: typeof own[number]['exercises'][number]}>();
    for (const session of own) for (const exercise of session.exercises) ownLatest.set(exercise.exerciseId, { session, exercise });
    if ([...ownLatest.values()].some(row => row.exercise.pct !== null)) {
      method = 'own';
      comparedExposures = own.reduce((sum,s) => sum + s.exercises.filter(e => e.pct !== null).length, 0);
      for (const [id, {session, exercise: e}] of ownLatest) {
        const old = latest.get(id), pct = e.pct;
        latest.set(id, { id, status: pct === null ? 'insufficient_data' : pct > 0 ? 'improved' : pct < 0 ? 'declined' : 'stable',
          reason: pct === null ? old?.reason ?? 'insufficient_own_history' : 'own_baseline', sessions: old?.sessions ?? 1,
          firstDate: session.date, lastDate: session.date, signal: pct === null ? null : { kind: 'own_baseline',
            description: `${pct > 0 ? '+' : ''}${fmt(pct)} % frente a lo tuyo · ${e.bases} sesiones de referencia`, currentValue: pct, referenceValue: 0, contextValue: e.bases } });
      }
    }
  }
  // Match the canonical trained-exercise roster, including the routine-scoped projection.
  // An exercise block with no completed sets is not a trained exercise in this window.
  const trained = new Set(trainingExerciseStats(source, period).map(exercise => exercise.id));
  const exercises = [...latest.values()].filter(exercise => trained.has(exercise.id));
  const count = (status: string) => exercises.filter(e => e.status === status).length;
  return {method, comparedExposures, improved: count('improved'), stable: count('stable'), declined: count('declined'), insufficient: count('insufficient_data'), exercises};
}
