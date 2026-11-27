import { completedWorkSet } from "../phase2/training-set-kind";
import { MUSCLE_GROUP_OPTIONS, muscleGroupLabel } from "../phase2/muscle-groups";
import type {
  TrainingAnalysis,
  TrainingAnalysisMuscle,
  TrainingAnalysisSource,
} from "../phase2/training-analysis";
import type { MuscleGroup } from "../phase2/types";
import type { ProgressComparisonReport, ProgressTemporalComparisonReference } from "./comparisons";
import {
  buildTrainingLoadComparison,
  buildTrainingPerformanceComparison,
  trainingMuscleDetailKey,
  type TrainingGeneralAnalytics,
} from "./training-performance";

const MUSCLE_LOAD_METRIC_KEYS = [
  "training.load.sessions",
  "training.load.sets",
  "training.load.sets_per_session",
] as const;

const BROAD_MUSCLE_GROUPS = MUSCLE_GROUP_OPTIONS.filter((group) => group.value !== "cardio");

export type TrainingMusclePerformance = TrainingGeneralAnalytics["performance"];

export type TrainingMuscleListItem = {
  key: MuscleGroup;
  label: string;
  sessions: number;
  exerciseCount: number;
  sets: number;
  performance: TrainingMusclePerformance;
};

export type TrainingMuscleSubzone = {
  key: string;
  label: string;
  sessions: number;
  sets: number;
  ratio: number;
  exerciseIds: string[];
};

export type TrainingMuscleSubzoneDetail = TrainingMuscleSubzone & {
  performance: TrainingMusclePerformance;
  loadComparison: ProgressComparisonReport;
};

export type TrainingMuscleDetailAnalytics = {
  muscle: TrainingAnalysisMuscle;
  referenceMuscle: TrainingAnalysisMuscle | null;
  performance: TrainingMusclePerformance;
  loadComparison: ProgressComparisonReport;
  subzones: TrainingMuscleSubzone[];
  selectedSubzone: TrainingMuscleSubzoneDetail | null;
  confidenceNote: string | null;
};

export type TrainingMusclesAnalytics = {
  muscles: TrainingMuscleListItem[];
  selected: TrainingMuscleDetailAnalytics | null;
};

/** Cross-muscle comparison describes load/distribution, never a progress score. */
export const TRAINING_CROSS_MUSCLE_METRICS = ["sets", "sessions", "averageSets", "exerciseCount"] as const;

function completedSetCountBySessionExercise(source: TrainingAnalysisSource) {
  const counts = new Map<string, number>();
  for (const set of source.sets) {
    if (!completedWorkSet(set)) continue;
    counts.set(set.workout_session_exercise_id, (counts.get(set.workout_session_exercise_id) ?? 0) + 1);
  }
  return counts;
}

function muscleSubzones(
  source: TrainingAnalysisSource,
  muscle: TrainingAnalysisMuscle,
  range: { start: string; end: string },
): TrainingMuscleSubzone[] {
  const sessions = new Map(source.sessions.flatMap((session) => {
    const date = source.dateByDayLog.get(session.day_log_id);
    return session.status === "completed" && date && date >= range.start && date <= range.end
      ? [[session.id, date] as const]
      : [];
  }));
  const setCounts = completedSetCountBySessionExercise(source);
  const broadLabelKey = trainingMuscleDetailKey(muscleGroupLabel(muscle.key as MuscleGroup));
  const grouped = new Map<string, {
    label: string;
    sessions: Set<string>;
    sets: number;
    exerciseIds: Set<string>;
  }>();

  for (const exercise of source.sessionExercises) {
    if (!exercise.is_completed || !sessions.has(exercise.workout_session_id) || exercise.grupo_muscular_snapshot !== muscle.key) continue;
    const key = trainingMuscleDetailKey(exercise.muscle_group_label_snapshot);
    const label = exercise.muscle_group_label_snapshot?.trim();
    const sets = setCounts.get(exercise.id) ?? 0;
    // The detail field is user-authored canonical metadata. Equal-to-group labels
    // carry no second-level information and are intentionally not fabricated into
    // a subzone. Every real set can belong to at most one detail below its group.
    if (!key || !label || key === broadLabelKey || sets === 0) continue;
    const current = grouped.get(key) ?? { label, sessions: new Set<string>(), sets: 0, exerciseIds: new Set<string>() };
    current.sessions.add(exercise.workout_session_id);
    current.sets += sets;
    current.exerciseIds.add(exercise.exercise_id);
    grouped.set(key, current);
  }

  return [...grouped.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      sessions: value.sessions.size,
      sets: value.sets,
      ratio: muscle.summary.sets > 0 ? value.sets / muscle.summary.sets : 0,
      exerciseIds: [...value.exerciseIds],
    }))
    .sort((left, right) => right.sets - left.sets || left.label.localeCompare(right.label, "es-AR"));
}

function confidenceNote(primarySessions: number, referenceSessions: number): string | null {
  if (referenceSessions === 0) return "No hay suficiente historial de este grupo para comparar este período.";
  if (primarySessions < 2 || referenceSessions < 2) {
    return "La comparación se apoya en pocas sesiones; tomala como evidencia puntual, no como una tendencia consolidada.";
  }
  return null;
}

function muscleLoadComparison(input: {
  source: TrainingAnalysisSource;
  primary: TrainingAnalysis;
  reference: TrainingAnalysis;
  referenceDefinition: ProgressTemporalComparisonReference;
  muscleKey: string;
  muscleDetailKey?: string;
  selectedMetricKeys?: readonly string[];
  activeMetricKey?: string | null;
}) {
  return buildTrainingLoadComparison({
    ...input,
    scope: { muscleKey: input.muscleKey, muscleDetailKey: input.muscleDetailKey },
    metricKeys: MUSCLE_LOAD_METRIC_KEYS,
  });
}

export function buildTrainingMusclesAnalytics(input: {
  source: TrainingAnalysisSource;
  primary: TrainingAnalysis;
  reference: TrainingAnalysis;
  referenceDefinition: ProgressTemporalComparisonReference;
  selectedMuscleKey?: string | null;
  selectedSubzoneKey?: string | null;
  selectedMetricKeys?: readonly string[];
  activeMetricKey?: string | null;
}): TrainingMusclesAnalytics {
  const broadKeys = new Set(BROAD_MUSCLE_GROUPS.map((group) => group.value));
  const relevant = input.primary.muscles.filter((muscle): muscle is TrainingAnalysisMuscle & { key: MuscleGroup } => (
    muscle.summary.hasData && broadKeys.has(muscle.key as MuscleGroup)
  ));
  const performanceByMuscle = new Map(relevant.map((muscle) => [
    muscle.key,
    buildTrainingPerformanceComparison({
      source: input.source,
      primaryPeriod: input.primary.range,
      referencePeriod: input.reference.range,
      scope: { muscleKey: muscle.key },
    }),
  ]));
  const muscles = relevant.map((muscle) => ({
    key: muscle.key,
    label: muscleGroupLabel(muscle.key) ?? muscle.label,
    sessions: muscle.summary.sessions,
    exerciseCount: muscle.summary.exerciseCount,
    sets: muscle.summary.sets,
    performance: performanceByMuscle.get(muscle.key)!,
  }));

  const selectedMuscle = input.selectedMuscleKey
    ? relevant.find((muscle) => muscle.key === input.selectedMuscleKey) ?? null
    : null;
  if (!selectedMuscle) return { muscles, selected: null };

  const referenceMuscle = input.reference.muscles.find((muscle) => muscle.key === selectedMuscle.key && muscle.summary.hasData) ?? null;
  const subzones = muscleSubzones(input.source, selectedMuscle, input.primary.range);
  const selectedSubzone = input.selectedSubzoneKey
    ? subzones.find((subzone) => subzone.key === input.selectedSubzoneKey) ?? null
    : null;
  const selectedSubzoneDetail = selectedSubzone ? {
    ...selectedSubzone,
    performance: buildTrainingPerformanceComparison({
      source: input.source,
      primaryPeriod: input.primary.range,
      referencePeriod: input.reference.range,
      scope: { muscleKey: selectedMuscle.key, muscleDetailKey: selectedSubzone.key },
    }),
    loadComparison: muscleLoadComparison({
      ...input,
      muscleKey: selectedMuscle.key,
      muscleDetailKey: selectedSubzone.key,
    }),
  } : null;

  return {
    muscles,
    selected: {
      muscle: { ...selectedMuscle, label: muscleGroupLabel(selectedMuscle.key) ?? selectedMuscle.label },
      referenceMuscle,
      performance: performanceByMuscle.get(selectedMuscle.key)!,
      loadComparison: muscleLoadComparison({ ...input, muscleKey: selectedMuscle.key }),
      subzones,
      selectedSubzone: selectedSubzoneDetail,
      confidenceNote: confidenceNote(selectedMuscle.summary.sessions, referenceMuscle?.summary.sessions ?? 0),
    },
  };
}
