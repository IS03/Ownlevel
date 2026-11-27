import { completedWorkSet } from "./training-set-kind";
import type {
  MuscleGroup,
  TrainingAdjustment,
  WorkoutSet,
} from "./types";
import { normalizeExerciseSearch } from "./exercise-library";
import type { RoutineColorKey } from "./routine-colors";

export type ExerciseRoutineMembership = {
  id: string;
  nombre: string;
  color: RoutineColorKey | null;
};

export type ExerciseDirectoryEntry = {
  id: string;
  name: string;
  muscleGroup: MuscleGroup | null;
  muscleLabel: string | null;
  lastDate: string | null;
  sessions: number;
  bestWeightKg: number | null;
  totalVolumeKg: number;
  lastDecision: TrainingAdjustment | null;
  lastSets: Array<Pick<WorkoutSet, "actual_reps" | "actual_weight_kg" | "is_completed" | "set_kind">>;
  routineIds: string[];
};

export type ExerciseDirectoryFilters = {
  query: string;
  muscleGroup: MuscleGroup | "all";
  routineId: string | "all";
};

export function filterExerciseDirectory(
  items: readonly ExerciseDirectoryEntry[],
  filters: ExerciseDirectoryFilters,
): ExerciseDirectoryEntry[] {
  const query = normalizeExerciseSearch(filters.query);
  return items.filter(
    (item) =>
      (filters.muscleGroup === "all" || item.muscleGroup === filters.muscleGroup) &&
      (filters.routineId === "all" || item.routineIds.includes(filters.routineId)) &&
      normalizeExerciseSearch([item.name, item.muscleGroup, item.muscleLabel].filter(Boolean).join(" ")).includes(query),
  );
}

export function sortExerciseDirectory(
  items: readonly ExerciseDirectoryEntry[],
  order: "recent" | "alpha",
): ExerciseDirectoryEntry[] {
  return [...items].sort((left, right) => {
    if (order === "recent") {
      const byDate = (right.lastDate ?? "").localeCompare(left.lastDate ?? "");
      if (byDate !== 0) return byDate;
    }
    return left.name.localeCompare(right.name, "es-AR");
  });
}

export type ExerciseReportSet = Pick<
  WorkoutSet,
  | "id"
  | "set_number"
  | "target_reps"
  | "target_weight_kg"
  | "target_rir"
  | "actual_reps"
  | "actual_weight_kg"
  | "is_completed"
  | "set_kind"
>;

export type ExerciseReportSession = {
  sessionId: string;
  logDate: string;
  /** Stable chronological tie-breaker when two sessions share the same logical day. */
  completedAt?: string | null;
  routineId: string | null;
  routineName: string;
  decision: TrainingAdjustment;
  /** Historical snapshot; optional for older callers and fixtures. */
  weightMode?: string | null;
  sets: ExerciseReportSet[];
};

export type ExerciseReportPoint = {
  sessionId: string;
  logDate: string;
  bestWeightKg: number | null;
  bestReps: number | null;
  volumeKg: number;
};

export type ExercisePerformanceMarkKind = "weight" | "volume" | "reps";

/**
 * A mark is always derived from a completed historical session. Repetitions
 * intentionally retain their associated load so a high-rep, low-load set is
 * never presented without context.
 */
export type ExercisePerformanceMark = {
  kind: ExercisePerformanceMarkKind;
  sessionId: string;
  logDate: string;
  completedAt: string | null;
  value: number;
  weightKg: number | null;
  reps: number | null;
  completedSets: number | null;
};

export type ExercisePerformance = {
  bestWeight: ExercisePerformanceMark | null;
  bestVolume: ExercisePerformanceMark | null;
  bestReps: ExercisePerformanceMark | null;
  /** Strict improvements only; tied marks do not create duplicate events. */
  recentMarks: ExercisePerformanceMark[];
};

function finiteNumber(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function completedExerciseSets(sets: readonly ExerciseReportSet[]): ExerciseReportSet[] {
  return sets.filter(completedWorkSet);
}

function chronologicalSessions(sessions: readonly ExerciseReportSession[]): ExerciseReportSession[] {
  return [...sessions].sort((left, right) => {
    const leftKey = left.completedAt ?? `${left.logDate}T12:00:00.000Z`;
    const rightKey = right.completedAt ?? `${right.logDate}T12:00:00.000Z`;
    return leftKey.localeCompare(rightKey) || left.sessionId.localeCompare(right.sessionId);
  });
}

type LoadedSet = { reps: number; weightKg: number };

function loadedCompletedSets(sets: readonly ExerciseReportSet[]): LoadedSet[] {
  return completedExerciseSets(sets).flatMap((set) => {
    const reps = finiteNumber(set.actual_reps);
    const weightKg = finiteNumber(set.actual_weight_kg);
    // PR39 deliberately avoids records from bodyweight/assisted or incomplete
    // data until the model can distinguish their semantics reliably.
    return reps !== null && reps > 0 && weightKg !== null && weightKg > 0
      ? [{ reps, weightKg }]
      : [];
  });
}

function markForSession(
  session: ExerciseReportSession,
  kind: ExercisePerformanceMarkKind,
): ExercisePerformanceMark | null {
  const loaded = loadedCompletedSets(session.sets);
  if (loaded.length === 0) return null;

  if (kind === "weight") {
    const best = [...loaded].sort((left, right) => right.weightKg - left.weightKg || right.reps - left.reps)[0]!;
    return { kind, sessionId: session.sessionId, logDate: session.logDate, completedAt: session.completedAt ?? null, value: best.weightKg, weightKg: best.weightKg, reps: best.reps, completedSets: loaded.length };
  }

  if (kind === "reps") {
    const best = [...loaded].sort((left, right) => right.reps - left.reps || right.weightKg - left.weightKg)[0]!;
    return { kind, sessionId: session.sessionId, logDate: session.logDate, completedAt: session.completedAt ?? null, value: best.reps, weightKg: best.weightKg, reps: best.reps, completedSets: loaded.length };
  }

  const value = loaded.reduce((total, set) => total + set.reps * set.weightKg, 0);
  return value > 0
    ? { kind, sessionId: session.sessionId, logDate: session.logDate, completedAt: session.completedAt ?? null, value, weightKg: null, reps: null, completedSets: loaded.length }
    : null;
}

function markSortKey(mark: ExercisePerformanceMark): string {
  return `${mark.completedAt ?? `${mark.logDate}T12:00:00.000Z`}:${mark.sessionId}`;
}

function newestBest(
  current: ExercisePerformanceMark | null,
  candidate: ExercisePerformanceMark,
): ExercisePerformanceMark {
  if (!current || candidate.value > current.value) return candidate;
  if (candidate.value < current.value) return current;
  return markSortKey(candidate) >= markSortKey(current) ? candidate : current;
}

/**
 * Deterministic performance read model for one exercise. It uses completed
 * snapshot sets only. Ties display the most recent occurrence; PR events are
 * emitted solely for strict all-time improvements.
 */
export function buildExercisePerformance(
  sessions: readonly ExerciseReportSession[],
): ExercisePerformance {
  const best: Record<ExercisePerformanceMarkKind, ExercisePerformanceMark | null> = {
    weight: null,
    volume: null,
    reps: null,
  };
  const eventMaximum: Record<ExercisePerformanceMarkKind, number | null> = {
    weight: null,
    volume: null,
    reps: null,
  };
  const events: ExercisePerformanceMark[] = [];

  for (const session of chronologicalSessions(sessions)) {
    for (const kind of ["weight", "volume", "reps"] as const) {
      const candidate = markForSession(session, kind);
      if (!candidate) continue;
      best[kind] = newestBest(best[kind], candidate);
      if (eventMaximum[kind] === null || candidate.value > eventMaximum[kind]) {
        eventMaximum[kind] = candidate.value;
        events.push(candidate);
      }
    }
  }

  return {
    bestWeight: best.weight,
    bestVolume: best.volume,
    bestReps: best.reps,
    recentMarks: events.sort((left, right) => markSortKey(right).localeCompare(markSortKey(left))).slice(0, 3),
  };
}

export function bestWeightForSession(sets: readonly ExerciseReportSet[]): number | null {
  const weights = completedExerciseSets(sets)
    .map((set) => finiteNumber(set.actual_weight_kg))
    .filter((weight): weight is number => weight !== null);
  return weights.length ? Math.max(...weights) : null;
}

export function bestRepsForSession(sets: readonly ExerciseReportSet[]): number | null {
  const reps = completedExerciseSets(sets)
    .map((set) => finiteNumber(set.actual_reps))
    .filter((value): value is number => value !== null);
  return reps.length ? Math.max(...reps) : null;
}

export function exerciseSessionVolume(sets: readonly ExerciseReportSet[]): number {
  return completedExerciseSets(sets).reduce(
    (total, set) => total + (finiteNumber(set.actual_reps) ?? 0) * (finiteNumber(set.actual_weight_kg) ?? 0),
    0,
  );
}

export function summarizeLatestExercisePerformance(
  sets: ReadonlyArray<Pick<WorkoutSet, "actual_reps" | "actual_weight_kg" | "is_completed" | "set_kind">>,
) {
  const completed = sets.filter(completedWorkSet);
  const maxWeightKg = completed
    .map((set) => finiteNumber(set.actual_weight_kg))
    .filter((weight): weight is number => weight !== null)
    .reduce<number | null>((best, weight) => best === null || weight > best ? weight : best, null);
  const onlySet = completed.length === 1 ? completed[0] : null;
  return {
    completedSets: completed.length,
    maxWeightKg,
    singleSet: onlySet ? {
      reps: finiteNumber(onlySet.actual_reps),
      weightKg: finiteNumber(onlySet.actual_weight_kg),
    } : null,
  };
}

export function buildExerciseReportPoints(
  sessions: readonly ExerciseReportSession[],
): ExerciseReportPoint[] {
  return chronologicalSessions(sessions)
    .map((session) => ({
      sessionId: session.sessionId,
      logDate: session.logDate,
      bestWeightKg: bestWeightForSession(session.sets),
      bestReps: bestRepsForSession(session.sets),
      volumeKg: exerciseSessionVolume(session.sets),
    }));
}

/** The report opens on the most recent available historical point, not the oldest. */
export function selectedExerciseReportPointIndex(
  points: readonly ExerciseReportPoint[],
  selectedSessionId: string | null,
): number {
  if (points.length === 0) return -1;
  if (selectedSessionId) {
    const selectedIndex = points.findIndex((point) => point.sessionId === selectedSessionId);
    if (selectedIndex >= 0) return selectedIndex;
  }
  return points.length - 1;
}

export function summarizeExerciseReport(sessions: readonly ExerciseReportSession[]) {
  const points = buildExerciseReportPoints(sessions);
  const allSets = sessions.flatMap((session) => session.sets);
  const latest = [...sessions].sort((left, right) => right.logDate.localeCompare(left.logDate))[0];
  return {
    sessions: sessions.length,
    bestWeightKg: bestWeightForSession(allSets),
    latestBestWeightKg: latest ? bestWeightForSession(latest.sets) : null,
    totalVolumeKg: exerciseSessionVolume(allSets),
    latestDecision: latest?.decision ?? null,
    points,
  };
}
