import { muscleGroupLabel } from "../phase2/muscle-groups";
import type { ExerciseReportSession } from "../phase2/exercise-insights";
import type { TrainingAnalysis, TrainingAnalysisSource } from "../phase2/training-analysis";
import type { TrainingAdjustment, WorkoutSessionExercise } from "../phase2/types";
import type { ProgressComparisonReport, ProgressTemporalComparisonReference } from "./comparisons";
import {
  buildTrainingLoadComparison,
  buildTrainingPerformanceComparison,
  sessionExerciseContext,
  type TrainingExercisePerformance,
} from "./training-performance";

export type TrainingExerciseListItem = {
  id: string;
  name: string;
  muscleKey: string;
  muscleLabel: string;
  weightMode: string | null;
  lastDate: string;
  sessions: number;
  sets: number;
  routineIds: string[];
  routineNames: string[];
  performance: TrainingExercisePerformance;
  hasPrimaryData: boolean;
};

export type TrainingExerciseMark = {
  kind: "best_load" | "best_reps" | "best_time" | "best_volume";
  label: string;
  value: number;
  unit: "kg" | "lingotes" | "reps" | "s";
  context: string | null;
  logDate: string;
};

export type TrainingExerciseDetailAnalytics = {
  performance: TrainingExercisePerformance;
  loadComparison: ProgressComparisonReport;
  marks: TrainingExerciseMark[];
  currentSessions: ExerciseReportSession[];
  referenceSessions: ExerciseReportSession[];
  allSessions: ExerciseReportSession[];
  weightMode: string | null;
  implement: string | null;
  latestDecision: TrainingAdjustment | null;
  latestDecisionNote: string | null;
};

export type TrainingExercisesAnalytics = {
  exercises: TrainingExerciseListItem[];
  selected: TrainingExerciseDetailAnalytics | null;
};

const EXERCISE_LOAD_KEYS = [
  "training.load.sessions",
  "training.load.sets",
  "training.load.volume",
] as const;

function clean(value: string | null | undefined): string | null {
  const result = value?.trim().replace(/\s+/g, " ");
  return result || null;
}

function normalizedMode(value: string | null | undefined): string | null {
  return clean(value)?.toLocaleLowerCase("es-AR") ?? null;
}

function sessionDate(source: TrainingAnalysisSource, sessionId: string): string | null {
  const session = source.sessions.find((item) => item.id === sessionId);
  return session ? source.dateByDayLog.get(session.day_log_id) ?? null : null;
}

function serializeExerciseSessions(
  source: TrainingAnalysisSource,
  exerciseId: string,
  range?: { start: string; end: string },
  routineId?: string | null,
  include?: (exercise: WorkoutSessionExercise) => boolean,
): ExerciseReportSession[] {
  const sessionById = new Map(source.sessions.map((session) => [session.id, session]));
  const setsBySessionExercise = new Map<string, TrainingAnalysisSource["sets"]>();
  for (const set of source.sets) {
    if (!set.is_completed) continue;
    const bucket = setsBySessionExercise.get(set.workout_session_exercise_id) ?? [];
    bucket.push(set);
    setsBySessionExercise.set(set.workout_session_exercise_id, bucket);
  }
  return source.sessionExercises.flatMap((exercise): ExerciseReportSession[] => {
    if (!exercise.is_completed || exercise.exercise_id !== exerciseId) return [];
    if (include && !include(exercise)) return [];
    const session = sessionById.get(exercise.workout_session_id);
    if (!session || session.status !== "completed") return [];
    if (routineId && session.routine_id !== routineId) return [];
    const logDate = source.dateByDayLog.get(session.day_log_id);
    if (!logDate || (range && (logDate < range.start || logDate > range.end))) return [];
    return [{
      sessionId: session.id,
      logDate,
      completedAt: session.ended_at,
      routineId: session.routine_id,
      routineName: session.routine_name_snapshot ?? session.session_name ?? "Sesión libre",
      decision: exercise.decision,
      weightMode: exercise.weight_mode_snapshot,
      sets: [...(setsBySessionExercise.get(exercise.id) ?? [])]
        .sort((a, b) => a.set_number - b.set_number)
        .map((set) => ({
          id: set.id,
          set_number: set.set_number,
          target_reps: set.target_reps,
          target_weight_kg: set.target_weight_kg,
          target_rir: set.target_rir,
          actual_reps: set.actual_reps,
          actual_weight_kg: set.actual_weight_kg,
          is_completed: set.is_completed,
        })),
    }];
  }).sort((a, b) => (b.completedAt ?? b.logDate).localeCompare(a.completedAt ?? a.logDate));
}

type MarkCandidate = { load: number | null; reps: number | null; logDate: string };

export function buildTrainingExerciseMarks(
  sessions: readonly ExerciseReportSession[],
  weightMode: string | null,
): TrainingExerciseMark[] {
  const mode = normalizedMode(weightMode);
  const candidates: MarkCandidate[] = sessions.filter((session) => !session.weightMode || normalizedMode(session.weightMode) === mode).flatMap((session) => session.sets
    .filter((set) => set.is_completed)
    .map((set) => ({ load: set.actual_weight_kg, reps: set.actual_reps, logDate: session.logDate })));
  if (!candidates.length) return [];

  if (mode === "tiempo (segundos)") {
    const best = [...candidates].filter((item) => (item.reps ?? 0) > 0).sort((a, b) => (b.reps ?? 0) - (a.reps ?? 0) || b.logDate.localeCompare(a.logDate))[0];
    return best ? [{ kind: "best_time", label: "Mejor tiempo", value: best.reps!, unit: "s", context: null, logDate: best.logDate }] : [];
  }
  if (mode === "peso corporal") {
    const best = [...candidates].filter((item) => (item.reps ?? 0) > 0).sort((a, b) => (b.reps ?? 0) - (a.reps ?? 0) || b.logDate.localeCompare(a.logDate))[0];
    return best ? [{ kind: "best_reps", label: "Más repeticiones", value: best.reps!, unit: "reps", context: "Peso corporal", logDate: best.logDate }] : [];
  }
  const unit = mode === "lingotes (no kg)" ? "lingotes" as const : "kg" as const;
  const loaded = candidates.filter((item) => (item.load ?? 0) > 0 && (item.reps ?? 0) > 0);
  if (!loaded.length || !["peso total", "por mancuerna", "por brazo", "total con barra", "lingotes (no kg)"].includes(mode ?? "")) return [];
  const bestLoad = [...loaded].sort((a, b) => b.load! - a.load! || b.reps! - a.reps! || b.logDate.localeCompare(a.logDate))[0]!;
  const bestReps = [...loaded].sort((a, b) => b.reps! - a.reps! || b.load! - a.load! || b.logDate.localeCompare(a.logDate))[0]!;
  const marks: TrainingExerciseMark[] = [{
    kind: "best_load",
    label: unit === "kg" ? "Mejor peso" : "Mayor cantidad de lingotes",
    value: bestLoad.load!,
    unit,
    context: `${bestLoad.reps} reps`,
    logDate: bestLoad.logDate,
  }];
  if (bestReps.load !== bestLoad.load || bestReps.reps !== bestLoad.reps || bestReps.logDate !== bestLoad.logDate) {
    marks.push({ kind: "best_reps", label: `Más reps con ${bestReps.load} ${unit}`, value: bestReps.reps!, unit: "reps", context: null, logDate: bestReps.logDate });
  }
  if (unit === "kg") {
    const volumes = sessions.filter((session) => !session.weightMode || normalizedMode(session.weightMode) === mode).flatMap((session) => {
      const value = session.sets.filter((set) => set.is_completed).reduce((total, set) => total + Math.max(0, set.actual_weight_kg ?? 0) * Math.max(0, set.actual_reps ?? 0), 0);
      return value > 0 ? [{ value, logDate: session.logDate }] : [];
    }).sort((a, b) => b.value - a.value || b.logDate.localeCompare(a.logDate));
    if (volumes[0]) marks.push({ kind: "best_volume", label: "Mejor volumen de sesión", value: volumes[0].value, unit: "kg", context: null, logDate: volumes[0].logDate });
  }
  return marks;
}

function sameExecutionSessions(source: TrainingAnalysisSource, exerciseId: string, latest: WorkoutSessionExercise): ExerciseReportSession[] {
  const mode = normalizedMode(latest.weight_mode_snapshot);
  const { implement, configuration } = sessionExerciseContext(source, latest);
  if (!mode || !implement || !configuration) return [];
  return serializeExerciseSessions(source, exerciseId, undefined, undefined, (exercise) => {
    const context = sessionExerciseContext(source, exercise);
    return normalizedMode(exercise.weight_mode_snapshot) === mode && context.implement === implement && context.configuration === configuration;
  });
}

function latestSnapshot(source: TrainingAnalysisSource, exerciseId: string): WorkoutSessionExercise | null {
  return source.sessionExercises
    .filter((exercise) => exercise.exercise_id === exerciseId && exercise.is_completed)
    .sort((a, b) => (sessionDate(source, b.workout_session_id) ?? "").localeCompare(sessionDate(source, a.workout_session_id) ?? ""))[0] ?? null;
}

export function buildTrainingExercisesAnalytics(input: {
  source: TrainingAnalysisSource;
  primary: TrainingAnalysis;
  reference: TrainingAnalysis;
  referenceDefinition: ProgressTemporalComparisonReference;
  selectedExerciseId?: string | null;
  routineId?: string | null;
  selectedMetricKeys?: readonly string[];
  activeMetricKey?: string | null;
}): TrainingExercisesAnalytics {
  const performance = buildTrainingPerformanceComparison({
    source: input.source,
    primaryPeriod: input.primary.range,
    referencePeriod: input.reference.range,
  });
  const performanceById = new Map(performance.exercises.map((item) => [item.exerciseId, item]));
  const primaryById = new Map(input.primary.exercises.map((item) => [item.id, item]));
  const sessionById = new Map(input.source.sessions.map((session) => [session.id, session]));
  const allExerciseIds = new Set(input.source.sessionExercises.filter((item) => item.is_completed).map((item) => item.exercise_id));
  const exercises = [...allExerciseIds].flatMap((exerciseId): TrainingExerciseListItem[] => {
    const snapshot = latestSnapshot(input.source, exerciseId);
    if (!snapshot) return [];
    const current = primaryById.get(exerciseId) ?? null;
    const historicalSessions = new Set<string>();
    const routineIds = new Set<string>();
    const routineNames = new Set<string>();
    let lastDate = "";
    for (const exercise of input.source.sessionExercises) {
      if (!exercise.is_completed || exercise.exercise_id !== exerciseId) continue;
      const session = sessionById.get(exercise.workout_session_id);
      const date = session ? input.source.dateByDayLog.get(session.day_log_id) : null;
      if (!session || !date) continue;
      historicalSessions.add(session.id);
      lastDate = date > lastDate ? date : lastDate;
      if (session.routine_id) routineIds.add(session.routine_id);
      const name = session.routine_name_snapshot ?? session.session_name;
      if (name) routineNames.add(name);
    }
    const fallbackPerformance: TrainingExercisePerformance = {
      exerciseId,
      name: snapshot.nombre_snapshot,
      muscleKey: snapshot.grupo_muscular_snapshot ?? "unassigned",
      muscleLabel: muscleGroupLabel(snapshot.grupo_muscular_snapshot) ?? clean(snapshot.muscle_group_label_snapshot) ?? "Sin grupo",
      weightMode: snapshot.weight_mode_snapshot,
      status: "insufficient_data",
      reason: "not_trained_in_primary",
      signal: null,
      primarySampleSize: 0,
      referenceSampleSize: 0,
      isPersonalRecord: false,
    };
    const itemPerformance = performanceById.get(exerciseId) ?? fallbackPerformance;
    return [{
      id: exerciseId,
      name: current?.name ?? snapshot.nombre_snapshot,
      muscleKey: current?.muscleKey ?? itemPerformance.muscleKey,
      muscleLabel: current?.muscleLabel ?? itemPerformance.muscleLabel,
      weightMode: itemPerformance.weightMode ?? snapshot.weight_mode_snapshot,
      lastDate: current?.lastDate ?? lastDate,
      sessions: current?.sessions ?? 0,
      sets: current?.sets ?? 0,
      routineIds: [...routineIds],
      routineNames: [...routineNames].slice(0, 2),
      performance: itemPerformance,
      hasPrimaryData: Boolean(current),
    }];
  }).sort((a, b) => Number(b.hasPrimaryData) - Number(a.hasPrimaryData) || b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name, "es-AR"));

  const selectedId = input.selectedExerciseId ?? null;
  if (!selectedId) return { exercises, selected: null };
  const selectedItem = exercises.find((item) => item.id === selectedId) ?? null;
  if (!selectedItem) return { exercises, selected: null };
  const currentSessions = serializeExerciseSessions(input.source, selectedId, input.primary.range, input.routineId);
  const referenceSessions = serializeExerciseSessions(input.source, selectedId, input.reference.range, input.routineId);
  const allSessions = serializeExerciseSessions(input.source, selectedId);
  const latestExercise = latestSnapshot(input.source, selectedId);
  const latestScopedExercise = currentSessions[0]
    ? input.source.sessionExercises.find((exercise) => exercise.exercise_id === selectedId && exercise.workout_session_id === currentSessions[0]!.sessionId)
    : null;
  const scopedPerformance = buildTrainingPerformanceComparison({
    source: input.source,
    primaryPeriod: input.primary.range,
    referencePeriod: input.reference.range,
    scope: { exerciseId: selectedId, ...(input.routineId ? { routineId: input.routineId } : {}) },
  }).exercises.find((item) => item.exerciseId === selectedId) ?? selectedItem.performance;
  return {
    exercises,
    selected: {
      performance: scopedPerformance,
      loadComparison: buildTrainingLoadComparison({
        source: input.source,
        primary: input.primary,
        reference: input.reference,
        referenceDefinition: input.referenceDefinition,
        selectedMetricKeys: input.selectedMetricKeys,
        activeMetricKey: input.activeMetricKey,
        scope: { exerciseId: selectedId, ...(input.routineId ? { routineId: input.routineId } : {}) },
        metricKeys: EXERCISE_LOAD_KEYS,
      }),
      // A best mark is a record: only over sessions done the way the latest one was (mode, implement and variant known
      // and equal, #402 §9.3). With the latest implement or variant unknown there is no such set, so no marks.
      marks: latestExercise ? buildTrainingExerciseMarks(sameExecutionSessions(input.source, selectedId, latestExercise), latestExercise.weight_mode_snapshot) : [],
      currentSessions,
      referenceSessions,
      allSessions,
      weightMode: latestExercise?.weight_mode_snapshot ?? selectedItem.weightMode,
      implement: latestExercise?.implement_snapshot ?? null,
      latestDecision: currentSessions[0]?.decision ?? allSessions[0]?.decision ?? null,
      latestDecisionNote: latestScopedExercise?.decision_note ?? null,
    },
  };
}
