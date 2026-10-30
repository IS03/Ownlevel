import { completedSetVolume } from "../history/daily-history-core";
import type { CompletedSessionSummary, WorkoutSet } from "./types";

export type TrainingDaySummary = {
  sessionCount: number;
  exercisesCompleted: number;
  completedSets: number;
  durationMilliseconds: number | null;
  volumeKg: number | null;
};

function validDuration(value: number | null) {
  return value !== null && Number.isFinite(value) && value >= 0;
}

function validVolume(value: number | null | undefined): value is number {
  return (
    value !== null &&
    value !== undefined &&
    Number.isFinite(value) &&
    value >= 0
  );
}

/** Preserves the canonical completed-set volume semantics used by history. */
export function summarizeTrainingSessionVolume(
  sets: ReadonlyArray<Pick<WorkoutSet, "actual_reps" | "actual_weight_kg">>,
) {
  if (sets.length === 0) return 0;
  const hasRecordedLoad = sets.some(
    (set) => set.actual_reps !== null && set.actual_weight_kg !== null,
  );
  if (!hasRecordedLoad) return null;
  return sets.reduce((total, set) => total + completedSetVolume(set), 0);
}

const volumeFormatter = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 0,
});

export function formatTrainingDayVolume(volumeKg: number | null | undefined) {
  if (!validVolume(volumeKg)) return null;
  return `${volumeFormatter.format(volumeKg)} kg`;
}

/**
 * Aggregates only the durations actually recorded by each completed session.
 * A missing duration keeps the day total unknown instead of implying that the
 * gap between two sessions was training time.
 */
export function summarizeTrainingDay(
  sessions: ReadonlyArray<CompletedSessionSummary>,
): TrainingDaySummary {
  const durationKnown = sessions.every((session) =>
    validDuration(session.durationMilliseconds),
  );
  const volumeKnown = sessions.every((session) =>
    validVolume(session.volumeKg),
  );

  return {
    sessionCount: sessions.length,
    exercisesCompleted: sessions.reduce(
      (total, session) => total + session.exercisesCompleted,
      0,
    ),
    completedSets: sessions.reduce(
      (total, session) => total + session.completedSets,
      0,
    ),
    durationMilliseconds: durationKnown
      ? sessions.reduce(
          (total, session) => total + (session.durationMilliseconds ?? 0),
          0,
        )
      : null,
    volumeKg: volumeKnown
      ? sessions.reduce((total, session) => total + (session.volumeKg ?? 0), 0)
      : null,
  };
}

export function orderTrainingDaySessions<T extends Pick<CompletedSessionSummary, "id" | "startedAt">>(
  sessions: ReadonlyArray<T>,
) {
  return [...sessions].sort((left, right) => {
    const leftStart = new Date(left.startedAt).getTime();
    const rightStart = new Date(right.startedAt).getTime();
    const leftValue = Number.isFinite(leftStart) ? leftStart : 0;
    const rightValue = Number.isFinite(rightStart) ? rightStart : 0;
    return leftValue - rightValue || left.id.localeCompare(right.id);
  });
}
