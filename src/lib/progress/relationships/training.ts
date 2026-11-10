import { addProgressIsoDays, type ProgressMetricSample, type ProgressPeriodRange } from "../analytics";
import { buildTrainingPerformanceComparison } from "../training-performance";
import type { TrainingAnalysisSource } from "../../phase2/training-analysis";

function dateFor(source: TrainingAnalysisSource, session: TrainingAnalysisSource["sessions"][number]) {
  return source.dateByDayLog.get(session.day_log_id) ?? null;
}

function sourceThroughTarget(
  source: TrainingAnalysisSource,
  targetId: string,
  targetDate: string,
): TrainingAnalysisSource {
  const sessions = source.sessions.filter((session) => {
    const date = dateFor(source, session);
    return date !== null && (date < targetDate || session.id === targetId);
  });
  const sessionIds = new Set(sessions.map((session) => session.id));
  const sessionExercises = source.sessionExercises.filter((exercise) => sessionIds.has(exercise.workout_session_id));
  const exerciseIds = new Set(sessionExercises.map((exercise) => exercise.id));
  const sets = source.sets.filter((set) => exerciseIds.has(set.workout_session_exercise_id));
  // The variants travel with the rows: without them every comparison would read as unknown (P1-C2).
  return { sessions, sessionExercises, sets, dateByDayLog: source.dateByDayLog, configurations: source.configurations };
}

/**
 * One honest outcome per completed session. The canonical exercise comparator
 * remains the only source of improved/stable/declined status. Exercises and
 * weight modes are never reduced to a shared kg score.
 */
export function trainingPerformanceRelationshipSamples(
  source: TrainingAnalysisSource,
  period: ProgressPeriodRange,
): ProgressMetricSample[] {
  const sessions = source.sessions
    .filter((session) => session.status === "completed" && session.ended_at)
    .flatMap((session) => {
      const date = dateFor(source, session);
      return date && date >= period.start && date <= period.end ? [{ session, date }] : [];
    })
    .sort((left, right) => left.date.localeCompare(right.date) || left.session.started_at.localeCompare(right.session.started_at));

  return sessions.flatMap(({ session, date }) => {
    const scopedSource = sourceThroughTarget(source, session.id, date);
    const performance = buildTrainingPerformanceComparison({
      source: scopedSource,
      primaryPeriod: { start: date, end: date },
      referencePeriod: { start: addProgressIsoDays(date, -28), end: addProgressIsoDays(date, -1) },
    });
    if (!performance.summary.comparable) return [];
    return [{
      date,
      entityId: session.id,
      value: performance.summary.improved / performance.summary.comparable * 100,
      context: {
        sessionId: session.id,
        startedAt: session.started_at,
        improved: performance.summary.improved,
        stable: performance.summary.stable,
        declined: performance.summary.declined,
        comparable: performance.summary.comparable,
      },
    }];
  });
}
