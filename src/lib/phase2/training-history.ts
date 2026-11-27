import { completedWorkSet } from "./training-set-kind";
import { buildExercisePerformance, type ExerciseReportSession } from "./exercise-insights";
import { normalizeExerciseSearch } from "./exercise-library";
import { MUSCLE_GROUP_OPTIONS } from "./muscle-groups";
import type { RoutineColorKey } from "./routine-colors";
import type {
  CompletedSessionSummary,
  Exercise,
  MuscleGroup,
  WorkoutSession,
  WorkoutSessionExercise,
  WorkoutSet,
} from "./types";

export type TrainingHistoryActivity = "recorded" | "all";
export type TrainingHistoryOrder = "recent" | "used" | "alpha" | "stale";

export type TrainingHistoryMark = {
  weightKg: number | null;
  reps: number | null;
};

export type TrainingHistoryExercise = {
  id: string;
  name: string;
  muscleGroup: MuscleGroup | null;
  muscleLabel: string | null;
  implement: string | null;
  weightMode: string | null;
  lastDate: string | null;
  sessions: number;
  appearances: number;
  lastMark: TrainingHistoryMark | null;
  bestMark: TrainingHistoryMark | null;
  routineIds: string[];
};

export type TrainingHistoryRoutine = { id: string; name: string; color?: RoutineColorKey | null };

export type TrainingHistoryDirectory = {
  exercises: TrainingHistoryExercise[];
  routines: TrainingHistoryRoutine[];
};

export type TrainingHistoryExerciseSession = {
  sessionId: string;
  logDate: string;
  routineName: string;
  mark: TrainingHistoryMark | null;
  completedSets: number;
  rirValues: number[];
};

export type TrainingHistoryExerciseDetail = {
  latest: TrainingHistoryExerciseSession | null;
  best: TrainingHistoryExerciseSession | null;
  sessions: TrainingHistoryExerciseSession[];
};

export type TrainingHistoryFilters = {
  query: string;
  routineIds: string[];
  muscleGroups: MuscleGroup[];
  activity: TrainingHistoryActivity;
  order: TrainingHistoryOrder;
};

export const DEFAULT_TRAINING_HISTORY_FILTERS: TrainingHistoryFilters = {
  query: "",
  routineIds: [],
  muscleGroups: [],
  activity: "recorded",
  order: "recent",
};

type TrainingHistorySource = {
  catalog: Exercise[];
  sessions: WorkoutSession[];
  sessionExercises: WorkoutSessionExercise[];
  sets: WorkoutSet[];
  dateByDayLog: Map<string, string>;
};

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function latestSetMark(sets: ReadonlyArray<Pick<WorkoutSet, "is_completed" | "actual_weight_kg" | "actual_reps">>): TrainingHistoryMark | null {
  const completed = sets
    .filter(completedWorkSet)
    .map((set) => ({ weightKg: finite(set.actual_weight_kg), reps: finite(set.actual_reps) }));
  if (completed.length === 0) return null;
  return [...completed].sort((left, right) =>
    (right.weightKg ?? -1) - (left.weightKg ?? -1) ||
    (right.reps ?? -1) - (left.reps ?? -1),
  )[0] ?? null;
}

function reportSession(
  session: WorkoutSession,
  exercise: WorkoutSessionExercise,
  logDate: string,
  sets: WorkoutSet[],
): ExerciseReportSession {
  return {
    sessionId: session.id,
    logDate,
    completedAt: session.ended_at,
    routineId: session.routine_id,
    routineName: session.routine_name_snapshot ?? session.session_name ?? "Sesión libre",
    decision: exercise.decision,
    sets,
  };
}

export function buildTrainingHistoryDirectory(source: TrainingHistorySource): TrainingHistoryDirectory {
  const sessionById = new Map(source.sessions.map((session) => [session.id, session]));
  const setsBySessionExercise = new Map<string, WorkoutSet[]>();
  for (const set of source.sets) {
    if (!completedWorkSet(set)) continue;
    const bucket = setsBySessionExercise.get(set.workout_session_exercise_id) ?? [];
    bucket.push(set);
    setsBySessionExercise.set(set.workout_session_exercise_id, bucket);
  }
  for (const sets of setsBySessionExercise.values()) {
    sets.sort((left, right) => left.set_number - right.set_number);
  }

  const historyByExercise = new Map<string, Array<{
    exercise: WorkoutSessionExercise;
    session: WorkoutSession;
    logDate: string;
    sets: WorkoutSet[];
  }>>();
  const routines = new Map<string, TrainingHistoryRoutine>();
  for (const exercise of source.sessionExercises) {
    if (!exercise.is_completed) continue;
    const session = sessionById.get(exercise.workout_session_id);
    if (!session || session.status !== "completed") continue;
    const logDate = source.dateByDayLog.get(session.day_log_id);
    if (!logDate) continue;
    const bucket = historyByExercise.get(exercise.exercise_id) ?? [];
    bucket.push({ exercise, session, logDate, sets: setsBySessionExercise.get(exercise.id) ?? [] });
    historyByExercise.set(exercise.exercise_id, bucket);
    if (session.routine_id) {
      routines.set(session.routine_id, {
        id: session.routine_id,
        name: session.routine_name_snapshot ?? session.session_name ?? "Rutina",
      });
    }
  }

  const catalogById = new Map(source.catalog.map((exercise) => [exercise.id, exercise]));
  const ids = new Set([...catalogById.keys(), ...historyByExercise.keys()]);
  const exercises = [...ids].map((id): TrainingHistoryExercise => {
    const catalog = catalogById.get(id) ?? null;
    const history = [...(historyByExercise.get(id) ?? [])].sort((left, right) =>
      (right.session.ended_at ?? right.logDate).localeCompare(left.session.ended_at ?? left.logDate) ||
      right.session.id.localeCompare(left.session.id),
    );
    const latest = history[0] ?? null;
    const performance = buildExercisePerformance(history.map((item) =>
      reportSession(item.session, item.exercise, item.logDate, item.sets),
    ));
    return {
      id,
      name: latest?.exercise.nombre_snapshot ?? catalog?.nombre ?? "Ejercicio",
      muscleGroup: latest?.exercise.grupo_muscular_snapshot ?? catalog?.grupo_muscular ?? null,
      muscleLabel: latest?.exercise.muscle_group_label_snapshot ?? catalog?.muscle_group_label ?? null,
      implement: latest?.exercise.implement_snapshot ?? catalog?.implement ?? null,
      weightMode: latest?.exercise.weight_mode_snapshot ?? catalog?.weight_mode ?? null,
      lastDate: latest?.logDate ?? null,
      sessions: new Set(history.map((item) => item.session.id)).size,
      appearances: history.length,
      lastMark: latest ? latestSetMark(latest.sets) : null,
      bestMark: performance.bestWeight
        ? { weightKg: performance.bestWeight.weightKg, reps: performance.bestWeight.reps }
        : null,
      routineIds: [...new Set(history.flatMap((item) => item.session.routine_id ? [item.session.routine_id] : []))],
    };
  });

  return {
    exercises,
    routines: [...routines.values()].sort((left, right) => left.name.localeCompare(right.name, "es-AR")),
  };
}

export function filterTrainingHistoryExercises(
  exercises: readonly TrainingHistoryExercise[],
  filters: Pick<TrainingHistoryFilters, "query" | "routineIds" | "muscleGroups" | "activity">,
): TrainingHistoryExercise[] {
  const query = normalizeExerciseSearch(filters.query);
  return exercises.filter((exercise) => {
    if (filters.activity === "recorded" && exercise.sessions === 0) return false;
    if (filters.routineIds.length > 0 && !filters.routineIds.some((id) => exercise.routineIds.includes(id))) return false;
    if (filters.muscleGroups.length > 0 && (!exercise.muscleGroup || !filters.muscleGroups.includes(exercise.muscleGroup))) return false;
    const searchText = normalizeExerciseSearch([
      exercise.name,
      exercise.muscleGroup,
      exercise.muscleLabel,
      exercise.implement,
      exercise.weightMode,
    ].filter(Boolean).join(" "));
    return searchText.includes(query);
  });
}

export function sortTrainingHistoryExercises(
  exercises: readonly TrainingHistoryExercise[],
  order: TrainingHistoryOrder,
): TrainingHistoryExercise[] {
  return [...exercises].sort((left, right) => {
    if (order === "recent") {
      const byDate = (right.lastDate ?? "").localeCompare(left.lastDate ?? "");
      if (byDate !== 0) return byDate;
    } else if (order === "used") {
      const byUse = right.appearances - left.appearances;
      if (byUse !== 0) return byUse;
      const byDate = (right.lastDate ?? "").localeCompare(left.lastDate ?? "");
      if (byDate !== 0) return byDate;
    } else if (order === "stale") {
      if (left.lastDate && right.lastDate) {
        const byDate = left.lastDate.localeCompare(right.lastDate);
        if (byDate !== 0) return byDate;
      } else if (left.lastDate !== right.lastDate) {
        return left.lastDate ? -1 : 1;
      }
    }
    return left.name.localeCompare(right.name, "es-AR");
  });
}

export function selectTrainingHistoryExercises(
  exercises: readonly TrainingHistoryExercise[],
  filters: TrainingHistoryFilters,
): TrainingHistoryExercise[] {
  return sortTrainingHistoryExercises(filterTrainingHistoryExercises(exercises, filters), filters.order);
}

export function toggleTrainingHistoryFilter<T extends string>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function trainingHistoryFilterCount(filters: TrainingHistoryFilters): number {
  return filters.routineIds.length + filters.muscleGroups.length +
    (filters.activity === "all" ? 1 : 0);
}

export function groupCompletedSessionsByDate(sessions: readonly CompletedSessionSummary[]) {
  const groups = new Map<string, CompletedSessionSummary[]>();
  for (const session of sessions) {
    const bucket = groups.get(session.logDate) ?? [];
    bucket.push(session);
    groups.set(session.logDate, bucket);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, items]) => ({
      date,
      sessions: [...items].sort((left, right) => right.startedAt.localeCompare(left.startedAt)),
    }));
}

function searchParamValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export function trainingHistoryFiltersFromSearchParams(
  params: Record<string, string | string[] | undefined>,
  availableRoutineIds: readonly string[],
): TrainingHistoryFilters {
  const routineIds = new Set(availableRoutineIds);
  const muscleGroups = new Set(MUSCLE_GROUP_OPTIONS.map((option) => option.value));
  const order = searchParamValue(params.order);
  return {
    query: searchParamValue(params.query),
    routineIds: searchParamValue(params.routines).split(",").filter((id) => routineIds.has(id)),
    muscleGroups: searchParamValue(params.muscles).split(",").filter((group): group is MuscleGroup => muscleGroups.has(group as MuscleGroup)),
    activity: searchParamValue(params.activity) === "all" ? "all" : "recorded",
    order: (["recent", "used", "alpha", "stale"] as const).includes(order as TrainingHistoryOrder)
      ? order as TrainingHistoryOrder
      : "recent",
  };
}

export function trainingHistoryListPath(filters: TrainingHistoryFilters): string {
  const params = new URLSearchParams({ view: "exercises" });
  if (filters.query.trim()) params.set("query", filters.query.trim());
  if (filters.routineIds.length > 0) params.set("routines", filters.routineIds.join(","));
  if (filters.muscleGroups.length > 0) params.set("muscles", filters.muscleGroups.join(","));
  if (filters.activity !== "recorded") params.set("activity", filters.activity);
  if (filters.order !== "recent") params.set("order", filters.order);
  return `/train/history?${params.toString()}`;
}

export function formatTrainingHistoryMark(mark: TrainingHistoryMark | null): string {
  if (!mark) return "—";
  const number = (value: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value);
  if (mark.weightKg !== null && mark.reps !== null) return `${number(mark.weightKg)} kg × ${number(mark.reps)}`;
  if (mark.weightKg !== null) return `${number(mark.weightKg)} kg`;
  if (mark.reps !== null) return `${number(mark.reps)} reps`;
  return "—";
}

export function buildTrainingHistoryExerciseDetail(
  sessions: readonly ExerciseReportSession[],
): TrainingHistoryExerciseDetail {
  const ordered = [...sessions].sort((left, right) => {
    const leftKey = left.completedAt ?? `${left.logDate}T12:00:00.000Z`;
    const rightKey = right.completedAt ?? `${right.logDate}T12:00:00.000Z`;
    return rightKey.localeCompare(leftKey) || right.sessionId.localeCompare(left.sessionId);
  });
  const summaries = ordered.map((session): TrainingHistoryExerciseSession => {
    const completed = session.sets.filter(completedWorkSet);
    return {
      sessionId: session.sessionId,
      logDate: session.logDate,
      routineName: session.routineName,
      mark: latestSetMark(completed),
      completedSets: completed.length,
      rirValues: completed.flatMap((set) => typeof set.target_rir === "number" && Number.isFinite(set.target_rir) ? [set.target_rir] : []),
    };
  });
  const performance = buildExercisePerformance(sessions);
  const bestMark = performance.bestWeight ?? performance.bestReps;
  const bestSession = bestMark ? summaries.find((session) => session.sessionId === bestMark.sessionId) ?? null : null;
  return {
    latest: summaries[0] ?? null,
    best: bestSession ? { ...bestSession, mark: { weightKg: bestMark?.weightKg ?? null, reps: bestMark?.reps ?? null } } : null,
    sessions: summaries,
  };
}
