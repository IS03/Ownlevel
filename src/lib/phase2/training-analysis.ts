import { MUSCLE_GROUP_OPTIONS, muscleGroupLabel } from "./muscle-groups";
import { buildWeeklyTrainingSummaries, formatTrainingMinutes } from "./training-progress-summary";
import { normalizeExerciseSearch } from "./exercise-library";
import { normalizeDisplayZero } from "../chart-core";
import {
  bucketProgressRange,
  getPreviousProgressPeriod,
  PROGRESS_PERIOD_PRESETS,
  resolveProgressPeriod,
} from "../progress/analytics/periods";
import type { ProgressBucketGranularity } from "../progress/analytics/types";
import type { Routine, WorkoutSession, WorkoutSessionExercise, WorkoutSet } from "./types";

const TRAINING_ANALYSIS_PERIOD_VALUES = ["1w", "2w", "3w", "4w", "8w", "3m", "6m", "1y"] as const;

export const TRAINING_ANALYSIS_PERIODS = TRAINING_ANALYSIS_PERIOD_VALUES.map((value) => {
  const definition = PROGRESS_PERIOD_PRESETS.find((period) => period.value === value)!;
  return { value, label: definition.label };
});

export type TrainingAnalysisPeriod = (typeof TRAINING_ANALYSIS_PERIOD_VALUES)[number] | "custom";
export type TrainingAnalysisMetric = "volume" | "sets" | "sessions" | "minutes";

export type TrainingAnalysisSummary = {
  sessions: number;
  sets: number;
  minutes: number;
  volumeKg: number;
  exerciseCount: number;
  hasData: boolean;
};

export type TrainingAnalysisTimelinePoint = TrainingAnalysisSummary & {
  id: string;
  start: string;
  end: string;
};

export type TrainingAnalysisExerciseTimelinePoint = TrainingAnalysisTimelinePoint & {
  bestWeightKg: number | null;
  bestReps: number | null;
};

export type TrainingAnalysisRoutine = {
  id: string;
  name: string;
  summary: TrainingAnalysisSummary;
  timeline: TrainingAnalysisTimelinePoint[];
  muscles: Array<{ key: string; label: string; sets: number }>;
  exerciseIds: string[];
};

export type TrainingAnalysisMuscle = {
  key: string;
  label: string;
  summary: TrainingAnalysisSummary;
  timeline: TrainingAnalysisTimelinePoint[];
  exerciseIds: string[];
};

export type TrainingAnalysisExercise = {
  id: string;
  name: string;
  muscleKey: string;
  muscleLabel: string;
  sessions: number;
  sets: number;
  volumeKg: number;
  bestWeightKg: number | null;
  bestReps: number | null;
  lastDate: string;
  routineIds: string[];
  timeline: TrainingAnalysisExerciseTimelinePoint[];
};

export type TrainingAnalysisExerciseFilters = {
  query: string;
  routineId: string | "all";
  muscleKey: string | "all";
};

export type TrainingAnalysis = {
  period: TrainingAnalysisPeriod;
  range: { start: string; end: string; label: string };
  summary: TrainingAnalysisSummary;
  weekComparison: {
    current: TrainingAnalysisSummary & { start: string; end: string };
    previous: TrainingAnalysisSummary & { start: string; end: string };
    isCurrentWeekComplete: boolean;
  } | null;
  timeline: TrainingAnalysisTimelinePoint[];
  routines: TrainingAnalysisRoutine[];
  /** Current catalog routines only. Historical routine analysis remains in `routines`. */
  activeRoutineIds: string[];
  muscles: TrainingAnalysisMuscle[];
  exercises: TrainingAnalysisExercise[];
};

export type TrainingAnalysisSource = {
  sessions: WorkoutSession[];
  sessionExercises: WorkoutSessionExercise[];
  sets: WorkoutSet[];
  dateByDayLog: Map<string, string>;
};

type CompletedSet = { weightKg: number | null; reps: number | null };
export type ExerciseRecord = {
  id: string;
  name: string;
  muscleKey: string;
  muscleLabel: string;
  sets: CompletedSet[];
};
export type SessionRecord = {
  id: string;
  logDate: string;
  routineId: string | null;
  routineName: string;
  minutes: number;
  exercises: ExerciseRecord[];
};

const FREE_ROUTINE_ID = "__free__";

export const TRAINING_ANALYSIS_RECENT_EXERCISE_LIMIT = 6;

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized ? normalized : null;
}

function sessionMinutes(session: WorkoutSession): number {
  if (!session.started_at || !session.ended_at) return 0;
  const milliseconds = new Date(session.ended_at).getTime() - new Date(session.started_at).getTime();
  return Number.isFinite(milliseconds) && milliseconds > 0 ? Math.round(milliseconds / 60_000) : 0;
}

function routineName(session: WorkoutSession): string {
  return clean(session.routine_name_snapshot) ?? clean(session.session_name) ?? "Sesión libre";
}

function muscleIdentity(exercise: WorkoutSessionExercise): Pick<ExerciseRecord, "muscleKey" | "muscleLabel"> {
  const group = exercise.grupo_muscular_snapshot;
  // `grupo_muscular_snapshot` is the stable broad group. The free-text label is
  // a specific detail (for example, "Abductores") and must never rename the
  // aggregate group ("Piernas"). Progress V2 exposes that detail separately.
  if (group) return { muscleKey: group, muscleLabel: muscleGroupLabel(group) ?? "Sin grupo" };
  const label = clean(exercise.muscle_group_label_snapshot);
  if (!label) return { muscleKey: "unassigned", muscleLabel: "Sin grupo" };
  return { muscleKey: `legacy:${label.toLocaleLowerCase("es-AR")}`, muscleLabel: label };
}

function emptySummary(): TrainingAnalysisSummary {
  return { sessions: 0, sets: 0, minutes: 0, volumeKg: 0, exerciseCount: 0, hasData: false };
}

function weeklySummary(week: ReturnType<typeof buildWeeklyTrainingSummaries>[number]): TrainingAnalysisSummary & { start: string; end: string } {
  return {
    sessions: week.sessions,
    sets: week.sets,
    minutes: week.minutes,
    volumeKg: week.volumeKg,
    exerciseCount: week.exercises,
    hasData: week.sessions > 0,
    start: week.weekStart,
    end: week.weekEnd,
  };
}

function addSummary(
  target: TrainingAnalysisSummary,
  session: SessionRecord,
  exercises: ExerciseRecord[],
  countSession: boolean,
  exerciseIds: Set<string>,
) {
  if (countSession) {
    target.sessions += 1;
    target.minutes += session.minutes;
    target.hasData = true;
  }
  for (const exercise of exercises) {
    if (exercise.sets.length === 0) continue;
    if (!exerciseIds.has(exercise.id)) {
      target.exerciseCount += 1;
      exerciseIds.add(exercise.id);
    }
    target.sets += exercise.sets.length;
    target.volumeKg += exercise.sets.reduce((total, set) => total + (set.reps ?? 0) * (set.weightKg ?? 0), 0);
  }
}

function summarize(records: readonly SessionRecord[], selector?: (record: SessionRecord) => ExerciseRecord[]): TrainingAnalysisSummary {
  const summary = emptySummary();
  const exerciseIds = new Set<string>();
  for (const record of records) {
    const exercises = selector ? selector(record) : record.exercises;
    const countSession = selector ? exercises.some((exercise) => exercise.sets.length > 0) : true;
    addSummary(summary, record, exercises, countSession, exerciseIds);
  }
  return summary;
}

export function trainingAnalysisPeriodRange(period: TrainingAnalysisPeriod, end: string): { start: string; end: string } {
  return resolveProgressPeriod({ preset: period }, end).current;
}

export function previousTrainingAnalysisPeriodRange(period: TrainingAnalysisPeriod, end: string): { start: string; end: string } {
  return getPreviousProgressPeriod(trainingAnalysisPeriodRange(period, end));
}

export function isTrainingAnalysisPeriod(value: string | null | undefined): value is TrainingAnalysisPeriod {
  return value === "custom" || TRAINING_ANALYSIS_PERIODS.some((period) => period.value === value);
}

export function trainingAnalysisPeriodLabel(period: TrainingAnalysisPeriod): string {
  return period === "custom" ? "Personalizado" : TRAINING_ANALYSIS_PERIODS.find((item) => item.value === period)!.label;
}

export function trainingAnalysisMetricValue(summary: TrainingAnalysisSummary, metric: TrainingAnalysisMetric): number {
  if (metric === "volume") return summary.volumeKg;
  if (metric === "sets") return summary.sets;
  if (metric === "sessions") return summary.sessions;
  return summary.minutes;
}

export function formatTrainingVolumeKg(value: number, options?: { compactAxis?: boolean }): string {
  const finite = Number.isFinite(value) ? value : 0;
  const absolute = Math.abs(finite);
  if (absolute >= 1_000) {
    const digits = options?.compactAxis ? 0 : 1;
    const normalized = normalizeDisplayZero(finite / 1_000, digits);
    const sign = normalized < 0 ? "−" : "";
    const formatted = new Intl.NumberFormat("es-AR", { maximumFractionDigits: digits }).format(Math.abs(normalized));
    return `${sign}${formatted} mil kg`;
  }
  const normalized = normalizeDisplayZero(finite);
  const sign = normalized < 0 ? "−" : "";
  return `${sign}${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.abs(normalized))} kg`;
}

export function formatTrainingSessions(value: number): string {
  const normalized = normalizeDisplayZero(value);
  const sign = normalized < 0 ? "−" : "";
  const absolute = Math.abs(normalized);
  return `${sign}${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(absolute)} ${absolute === 1 ? "sesión" : "sesiones"}`;
}

export function formatTrainingAnalysisMetric(value: number, metric: TrainingAnalysisMetric): string {
  if (metric === "minutes") return formatTrainingMinutes(value);
  if (metric === "volume") return formatTrainingVolumeKg(value);
  if (metric === "sessions") return formatTrainingSessions(value);
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.max(0, value))} series`;
}

export function filterTrainingAnalysisExercises(
  exercises: readonly TrainingAnalysisExercise[],
  filters: TrainingAnalysisExerciseFilters,
): TrainingAnalysisExercise[] {
  const query = normalizeExerciseSearch(filters.query);
  return exercises.filter((exercise) =>
    (filters.routineId === "all" || exercise.routineIds.includes(filters.routineId)) &&
    (filters.muscleKey === "all" || exercise.muscleKey === filters.muscleKey) &&
    normalizeExerciseSearch(`${exercise.name} ${exercise.muscleLabel}`).includes(query),
  );
}

function buildTimeline(
  records: readonly SessionRecord[],
  range: { start: string; end: string },
  bucket: ProgressBucketGranularity,
  selector?: (record: SessionRecord) => ExerciseRecord[],
): TrainingAnalysisTimelinePoint[] {
  const buckets: TrainingAnalysisTimelinePoint[] = [];
  for (const { start, end } of bucketProgressRange(range, bucket)) {
    const scoped = records.filter((record) => record.logDate >= start && record.logDate <= end);
    buckets.push({ id: start, start, end, ...summarize(scoped, selector) });
  }
  return buckets;
}

function historicalRoutineNames(source: TrainingAnalysisSource): Map<string, string> {
  const sessionById = new Map(source.sessions.map((session) => [session.id, session]));
  const dated = source.sessions
    .filter((session) => session.status === "completed")
    .flatMap((session) => {
      const date = source.dateByDayLog.get(session.day_log_id);
      return date ? [{ session, date }] : [];
    })
    .sort((left, right) => right.date.localeCompare(left.date));
  const names = new Map<string, string>();
  for (const item of dated) {
    const key = item.session.routine_id ?? FREE_ROUTINE_ID;
    if (!names.has(key)) names.set(key, routineName(sessionById.get(item.session.id)!));
  }
  return names;
}

/** Completed sessions in the range with their exercises and completed sets (the summary's own counting rules). */
export function buildSessionRecords(source: TrainingAnalysisSource, range: { start: string; end: string }): SessionRecord[] {
  const completedSessions = source.sessions.filter((session) => {
    const date = source.dateByDayLog.get(session.day_log_id);
    return session.status === "completed" && Boolean(date && date >= range.start && date <= range.end);
  });
  const completedIds = new Set(completedSessions.map((session) => session.id));
  const setsByExercise = new Map<string, CompletedSet[]>();
  for (const set of source.sets) {
    if (!set.is_completed) continue;
    const current = setsByExercise.get(set.workout_session_exercise_id) ?? [];
    current.push({ weightKg: finite(set.actual_weight_kg), reps: finite(set.actual_reps) });
    setsByExercise.set(set.workout_session_exercise_id, current);
  }
  const exercisesBySession = new Map<string, ExerciseRecord[]>();
  for (const exercise of source.sessionExercises) {
    if (!completedIds.has(exercise.workout_session_id)) continue;
    const identity = muscleIdentity(exercise);
    const current = exercisesBySession.get(exercise.workout_session_id) ?? [];
    current.push({ id: exercise.exercise_id, name: exercise.nombre_snapshot, ...identity, sets: setsByExercise.get(exercise.id) ?? [] });
    exercisesBySession.set(exercise.workout_session_id, current);
  }
  return completedSessions
    .flatMap((session): SessionRecord[] => {
      const logDate = source.dateByDayLog.get(session.day_log_id);
      if (!logDate) return [];
      return [{ id: session.id, logDate, routineId: session.routine_id, routineName: routineName(session), minutes: sessionMinutes(session), exercises: exercisesBySession.get(session.id) ?? [] }];
    })
    .sort((left, right) => left.logDate.localeCompare(right.logDate));
}

function exerciseSummaries(
  records: readonly SessionRecord[],
  selector?: (record: SessionRecord) => ExerciseRecord[],
): TrainingAnalysisExercise[] {
  const exercises = new Map<string, TrainingAnalysisExercise>();
  const sessionIdsByExercise = new Map<string, Set<string>>();
  for (const record of records) {
    for (const exercise of selector ? selector(record) : record.exercises) {
      if (exercise.sets.length === 0) continue;
      const existing = exercises.get(exercise.id);
      const volumeKg = exercise.sets.reduce((total, set) => total + (set.reps ?? 0) * (set.weightKg ?? 0), 0);
      const bestWeightKg = exercise.sets.reduce<number | null>((best, set) => set.weightKg !== null && (best === null || set.weightKg > best) ? set.weightKg : best, null);
      const bestReps = exercise.sets.reduce<number | null>((best, set) => set.reps !== null && (best === null || set.reps > best) ? set.reps : best, null);
      if (!existing) {
        exercises.set(exercise.id, { id: exercise.id, name: exercise.name, muscleKey: exercise.muscleKey, muscleLabel: exercise.muscleLabel, sessions: 1, sets: exercise.sets.length, volumeKg, bestWeightKg, bestReps, lastDate: record.logDate, routineIds: record.routineId ? [record.routineId] : [FREE_ROUTINE_ID], timeline: [] });
        sessionIdsByExercise.set(exercise.id, new Set([record.id]));
        continue;
      }
      const sessionIds = sessionIdsByExercise.get(exercise.id)!;
      sessionIds.add(record.id);
      existing.sessions = sessionIds.size;
      existing.sets += exercise.sets.length;
      existing.volumeKg += volumeKg;
      if (bestWeightKg !== null && (existing.bestWeightKg === null || bestWeightKg > existing.bestWeightKg)) existing.bestWeightKg = bestWeightKg;
      if (bestReps !== null && (existing.bestReps === null || bestReps > existing.bestReps)) existing.bestReps = bestReps;
      if (record.logDate >= existing.lastDate) {
        existing.lastDate = record.logDate;
        existing.name = exercise.name;
        existing.muscleKey = exercise.muscleKey;
        existing.muscleLabel = exercise.muscleLabel;
      }
      const routineId = record.routineId ?? FREE_ROUTINE_ID;
      if (!existing.routineIds.includes(routineId)) existing.routineIds.push(routineId);
    }
  }
  return [...exercises.values()].sort((left, right) => right.lastDate.localeCompare(left.lastDate) || left.name.localeCompare(right.name, "es-AR"));
}

function buildExerciseTimeline(
  records: readonly SessionRecord[],
  range: { start: string; end: string },
  bucket: ProgressBucketGranularity,
  exerciseId: string,
): TrainingAnalysisExerciseTimelinePoint[] {
  return buildTimeline(records, range, bucket, (record) => record.exercises.filter((exercise) => exercise.id === exerciseId)).map((point) => {
    const completedSets = records
      .filter((record) => record.logDate >= point.start && record.logDate <= point.end)
      .flatMap((record) => record.exercises.filter((exercise) => exercise.id === exerciseId))
      .flatMap((exercise) => exercise.sets);
    const bestWeightKg = completedSets.reduce<number | null>((best, set) => set.weightKg !== null && (best === null || set.weightKg > best) ? set.weightKg : best, null);
    const bestReps = completedSets.reduce<number | null>((best, set) => set.reps !== null && (best === null || set.reps > best) ? set.reps : best, null);
    return { ...point, bestWeightKg, bestReps };
  });
}

export function buildTrainingAnalysis(
  source: TrainingAnalysisSource,
  input: {
    today: string;
    period: TrainingAnalysisPeriod;
    routines?: Array<Pick<Routine, "id" | "nombre"> & { is_active?: boolean }>;
    range?: { start: string; end: string };
  },
): TrainingAnalysis {
  const resolvedPeriod = resolveProgressPeriod({ preset: input.period }, input.today);
  const periodRange = input.range ?? resolvedPeriod.current;
  const bucket = input.range
    ? resolveProgressPeriod({ preset: "custom", from: input.range.start, to: input.range.end }, input.range.end).bucket
    : resolvedPeriod.bucket;
  const range = { ...periodRange, label: trainingAnalysisPeriodLabel(input.period) };
  const records = buildSessionRecords(source, range);
  const allRoutineNames = historicalRoutineNames(source);
  for (const routine of input.routines ?? []) {
    if (!allRoutineNames.has(routine.id)) allRoutineNames.set(routine.id, routine.nombre);
  }

  const summary = summarize(records);
  const timeline = buildTimeline(records, range, bucket);
  const weekly = buildWeeklyTrainingSummaries(source, input.today);
  const currentWeek = weekly[0];
  const previousWeek = weekly[1];
  const weekComparison = currentWeek && previousWeek && previousWeek.sessions > 0
    ? { current: weeklySummary(currentWeek), previous: weeklySummary(previousWeek), isCurrentWeekComplete: currentWeek.weekEnd === input.today }
    : null;
  const routines = [...allRoutineNames.entries()]
    .map(([id, name]) => {
      const routineRecords = records.filter((record) => (record.routineId ?? FREE_ROUTINE_ID) === id);
      const routineSummary = summarize(routineRecords);
      const exercises = exerciseSummaries(routineRecords);
      return {
        id,
        name,
        summary: routineSummary,
        timeline: buildTimeline(routineRecords, range, bucket),
        muscles: [...new Set(routineRecords.flatMap((record) => record.exercises.filter((exercise) => exercise.sets.length > 0).map((exercise) => exercise.muscleKey)))].map((key) => {
          const scoped = summarize(routineRecords, (record) => record.exercises.filter((exercise) => exercise.muscleKey === key));
          const first = routineRecords.flatMap((record) => record.exercises).find((exercise) => exercise.muscleKey === key);
          return { key, label: first?.muscleLabel ?? "Sin grupo", sets: scoped.sets };
        }),
        exerciseIds: exercises.map((exercise) => exercise.id),
      };
    })
    .sort((left, right) => Number(right.summary.hasData) - Number(left.summary.hasData) || right.summary.sessions - left.summary.sessions || left.name.localeCompare(right.name, "es-AR"));

  const muscleNames = new Map<string, string>(MUSCLE_GROUP_OPTIONS.map((item) => [item.value, item.label]));
  for (const record of records) for (const exercise of record.exercises) {
    if (!muscleNames.has(exercise.muscleKey)) muscleNames.set(exercise.muscleKey, exercise.muscleLabel);
  }
  const muscles = [...muscleNames.entries()]
    .map(([key, label]) => {
      const selector = (record: SessionRecord) => record.exercises.filter((exercise) => exercise.muscleKey === key);
      const muscleRecords = records.filter((record) => selector(record).some((exercise) => exercise.sets.length > 0));
      return {
        key,
        label,
        summary: summarize(records, selector),
        timeline: buildTimeline(muscleRecords, range, bucket, selector),
        exerciseIds: exerciseSummaries(muscleRecords, selector).map((exercise) => exercise.id),
      };
    })
    .sort((left, right) => Number(right.summary.hasData) - Number(left.summary.hasData) || right.summary.sets - left.summary.sets || left.label.localeCompare(right.label, "es-AR"));

  const activeRoutineIds = (input.routines ?? []).filter((routine) => routine.is_active !== false).map((routine) => routine.id);
  const exercises = exerciseSummaries(records).map((exercise) => ({
    ...exercise,
    timeline: buildExerciseTimeline(records, range, bucket, exercise.id),
  }));
  return { period: input.period, range, summary, weekComparison, timeline, routines, activeRoutineIds, muscles, exercises };
}
