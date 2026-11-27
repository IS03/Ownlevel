import { completedWorkSet } from "./training-set-kind";
import {
  buildExerciseReportPoints,
  completedExerciseSets,
  summarizeExerciseReport,
  type ExerciseReportSession,
} from "./exercise-insights";
import {
  trainingAnalysisMetricValue,
  type TrainingAnalysis,
  type TrainingAnalysisExercise,
  type TrainingAnalysisExerciseTimelinePoint,
  type TrainingAnalysisMetric,
  type TrainingAnalysisSummary,
  type TrainingAnalysisTimelinePoint,
} from "./training-analysis";

export const TRAINING_COMPARISON_KINDS = ["previous", "routines", "muscles", "exercises"] as const;
export type TrainingComparisonKind = (typeof TRAINING_COMPARISON_KINDS)[number];
export type TrainingComparisonMode = "self" | "cross";
export type TrainingComparisonSubjectType = "general" | "routine" | "muscle" | "exercise";
export type TrainingComparisonMetric = TrainingAnalysisMetric | "averageSets" | "exerciseCount" | "bestWeight" | "bestReps";
export type TrainingComparisonChartKind = "bars" | "line";

/**
 * Aggregated training activity is discrete per day/tramo, while the best
 * weight and reps of one exercise describe successive real sessions.
 */
export function trainingComparisonChartKind(metric: TrainingComparisonMetric): TrainingComparisonChartKind {
  return metric === "bestWeight" || metric === "bestReps" ? "line" : "bars";
}

export type TrainingComparisonDelta = {
  absolute: number | null;
  percentage: number | null;
  hasComparableBaseline: boolean;
};

export type TrainingComparisonSubject = {
  id: string;
  label: string;
  summary: TrainingAnalysisSummary;
  timeline: Array<TrainingAnalysisTimelinePoint | TrainingAnalysisExerciseTimelinePoint>;
  bestWeightKg?: number | null;
  bestReps?: number | null;
};

export type TrainingComparisonTimelinePoint = {
  id: string;
  label: string;
  rangeA: { start: string; end: string };
  rangeB: { start: string; end: string };
  a: Record<TrainingComparisonMetric, number | null>;
  b: Record<TrainingComparisonMetric, number | null>;
};

export type TrainingComparison = {
  kind: TrainingComparisonKind;
  mode: TrainingComparisonMode;
  title: string;
  subjectLabel: string | null;
  subjectType: TrainingComparisonSubjectType | null;
  subjectId: string | null;
  metrics: TrainingComparisonMetric[];
  chartMetrics: TrainingComparisonMetric[];
  a: TrainingComparisonSubject | null;
  b: TrainingComparisonSubject | null;
  options: TrainingComparisonSubject[];
  timeline: TrainingComparisonTimelinePoint[];
  rangeA: { start: string; end: string };
  rangeB: { start: string; end: string } | null;
};

export function isTrainingComparisonKind(value: string | null | undefined): value is TrainingComparisonKind {
  return TRAINING_COMPARISON_KINDS.some((kind) => kind === value);
}

export function isTrainingComparisonSubjectType(value: string | null | undefined): value is TrainingComparisonSubjectType {
  return value === "general" || value === "routine" || value === "muscle" || value === "exercise";
}

export function comparisonDelta(a: number | null | undefined, b: number | null | undefined): TrainingComparisonDelta {
  if (typeof a !== "number" || !Number.isFinite(a) || typeof b !== "number" || !Number.isFinite(b)) {
    return { absolute: null, percentage: null, hasComparableBaseline: false };
  }
  const absolute = a - b;
  if (b === 0) return { absolute, percentage: null, hasComparableBaseline: false };
  return { absolute, percentage: (absolute / Math.abs(b)) * 100, hasComparableBaseline: true };
}

export function trainingComparisonMetricValue(
  subject: Pick<TrainingComparisonSubject, "summary" | "bestWeightKg" | "bestReps">,
  metric: TrainingComparisonMetric,
): number | null {
  if (metric === "averageSets") return subject.summary.sessions > 0 ? subject.summary.sets / subject.summary.sessions : null;
  if (metric === "exerciseCount") return subject.summary.hasData ? subject.summary.exerciseCount : null;
  if (metric === "bestWeight") return subject.bestWeightKg ?? null;
  if (metric === "bestReps") return subject.bestReps ?? null;
  return trainingAnalysisMetricValue(subject.summary, metric);
}

function timelineMetricValue(
  point: TrainingAnalysisTimelinePoint | TrainingAnalysisExerciseTimelinePoint | undefined,
  metric: TrainingComparisonMetric,
): number | null {
  if (!point) return metric === "bestWeight" || metric === "bestReps" || metric === "averageSets" || metric === "exerciseCount" ? null : 0;
  if (metric === "averageSets") return point.sessions > 0 ? point.sets / point.sessions : null;
  if (metric === "exerciseCount") return point.hasData ? point.exerciseCount : null;
  if (metric === "bestWeight") return "bestWeightKg" in point ? point.bestWeightKg : null;
  if (metric === "bestReps") return "bestReps" in point ? point.bestReps : null;
  return trainingAnalysisMetricValue(point, metric);
}

function subjectForGeneral(analysis: TrainingAnalysis): TrainingComparisonSubject {
  return { id: "general", label: "Entrenamiento", summary: analysis.summary, timeline: analysis.timeline };
}

function subjectForRoutine(analysis: TrainingAnalysis, routineId: string): TrainingComparisonSubject | null {
  const routine = analysis.routines.find((item) => item.id === routineId);
  return routine ? { id: routine.id, label: routine.name, summary: routine.summary, timeline: routine.timeline } : null;
}

function subjectForMuscle(analysis: TrainingAnalysis, muscleKey: string): TrainingComparisonSubject | null {
  const muscle = analysis.muscles.find((item) => item.key === muscleKey);
  return muscle ? { id: muscle.key, label: muscle.label, summary: muscle.summary, timeline: muscle.timeline } : null;
}

function exerciseSummary(exercise: TrainingAnalysisExercise): TrainingAnalysisSummary {
  return {
    sessions: exercise.sessions,
    sets: exercise.sets,
    minutes: 0,
    volumeKg: exercise.volumeKg,
    exerciseCount: exercise.sessions > 0 ? 1 : 0,
    hasData: exercise.sessions > 0,
  };
}

function subjectForExercise(analysis: TrainingAnalysis, exerciseId: string): TrainingComparisonSubject | null {
  const exercise = analysis.exercises.find((item) => item.id === exerciseId);
  return exercise
    ? { id: exercise.id, label: exercise.name, summary: exerciseSummary(exercise), timeline: exercise.timeline, bestWeightKg: exercise.bestWeightKg, bestReps: exercise.bestReps }
    : null;
}

function emptySummary(): TrainingAnalysisSummary {
  return { sessions: 0, sets: 0, minutes: 0, volumeKg: 0, exerciseCount: 0, hasData: false };
}

function emptyExerciseTimeline(analysis: TrainingAnalysis): TrainingAnalysisExerciseTimelinePoint[] {
  return analysis.timeline.map((point) => ({ ...point, ...emptySummary(), bestWeightKg: null, bestReps: null }));
}

function emptySubject(
  analysis: TrainingAnalysis,
  subjectType: TrainingComparisonSubjectType,
  subjectId: string,
  label: string,
): TrainingComparisonSubject {
  return {
    id: subjectId,
    label,
    summary: emptySummary(),
    timeline: subjectType === "exercise"
      ? emptyExerciseTimeline(analysis)
      : analysis.timeline.map((point) => ({ ...point, ...emptySummary() })),
    bestWeightKg: subjectType === "exercise" ? null : undefined,
    bestReps: subjectType === "exercise" ? null : undefined,
  };
}

function subjectForType(
  analysis: TrainingAnalysis,
  subjectType: TrainingComparisonSubjectType,
  subjectId?: string | null,
): TrainingComparisonSubject | null {
  if (subjectType === "general") return subjectForGeneral(analysis);
  if (!subjectId) return null;
  if (subjectType === "routine") return subjectForRoutine(analysis, subjectId);
  if (subjectType === "muscle") return subjectForMuscle(analysis, subjectId);
  return subjectForExercise(analysis, subjectId);
}

function metricsForSubject(subjectType: TrainingComparisonSubjectType): {
  metrics: TrainingComparisonMetric[];
  chartMetrics: TrainingComparisonMetric[];
} {
  if (subjectType === "general") return { metrics: ["sessions", "sets", "minutes", "volume"], chartMetrics: ["volume", "sets", "sessions", "minutes"] };
  if (subjectType === "routine") return { metrics: ["sessions", "sets", "minutes", "volume"], chartMetrics: ["volume", "sets", "minutes"] };
  if (subjectType === "muscle") return { metrics: ["sets", "sessions", "averageSets", "exerciseCount"], chartMetrics: ["sets"] };
  return { metrics: ["sessions", "bestWeight", "bestReps", "volume"], chartMetrics: ["bestWeight", "bestReps", "volume"] };
}

function uniqueSubjects(subjects: Array<TrainingComparisonSubject | null>): TrainingComparisonSubject[] {
  const seen = new Set<string>();
  const unique: TrainingComparisonSubject[] = [];
  for (const subject of subjects) {
    if (!subject || seen.has(subject.id)) continue;
    seen.add(subject.id);
    unique.push(subject);
  }
  return unique;
}

function selectPair(
  options: TrainingComparisonSubject[],
  requestedA?: string | null,
  requestedB?: string | null,
): { a: TrainingComparisonSubject | null; b: TrainingComparisonSubject | null } {
  const a = options.find((option) => option.id === requestedA) ?? options[0] ?? null;
  const b = options.find((option) => option.id === requestedB && option.id !== a?.id)
    ?? options.find((option) => option.id !== a?.id)
    ?? null;
  return { a, b };
}

function timelineLabel(
  point: TrainingAnalysisTimelinePoint | TrainingAnalysisExerciseTimelinePoint | undefined,
  index: number,
  prefix?: string,
): string {
  if (prefix) return `${prefix} ${index + 1}`;
  if (!point) return `Tramo ${index + 1}`;
  const start = new Date(`${point.start}T12:00:00Z`).getTime();
  const end = new Date(`${point.end}T12:00:00Z`).getTime();
  const days = Math.round((end - start) / 86_400_000) + 1;
  if (days === 1) return `Día ${index + 1}`;
  if (days === 7) return `Semana ${index + 1}`;
  return `Tramo ${index + 1}`;
}

function comparisonTimeline(
  a: TrainingComparisonSubject | null,
  b: TrainingComparisonSubject | null,
  metrics: TrainingComparisonMetric[],
  labelPrefix?: string,
): TrainingComparisonTimelinePoint[] {
  if (!a || !b) return [];
  const count = Math.max(a.timeline.length, b.timeline.length);
  return Array.from({ length: count }, (_, index) => {
    const aPoint = a.timeline[index];
    const bPoint = b.timeline[index];
    return {
      id: `${aPoint?.id ?? "a"}-${bPoint?.id ?? "b"}-${index}`,
      label: timelineLabel(aPoint ?? bPoint, index, labelPrefix),
      rangeA: { start: aPoint?.start ?? "", end: aPoint?.end ?? "" },
      rangeB: { start: bPoint?.start ?? "", end: bPoint?.end ?? "" },
      a: Object.fromEntries(metrics.map((metric) => [metric, !aPoint && labelPrefix ? null : timelineMetricValue(aPoint, metric)])) as Record<TrainingComparisonMetric, number | null>,
      b: Object.fromEntries(metrics.map((metric) => [metric, !bPoint && labelPrefix ? null : timelineMetricValue(bPoint, metric)])) as Record<TrainingComparisonMetric, number | null>,
    };
  });
}

function comparisonFromSubjects(input: {
  kind: Exclude<TrainingComparisonKind, "previous">;
  title: string;
  subjectType: Exclude<TrainingComparisonSubjectType, "general">;
  metrics: TrainingComparisonMetric[];
  chartMetrics: TrainingComparisonMetric[];
  subjects: TrainingComparisonSubject[];
  requestedA?: string | null;
  requestedB?: string | null;
  range: { start: string; end: string };
}): TrainingComparison {
  const { a, b } = selectPair(input.subjects, input.requestedA, input.requestedB);
  return {
    kind: input.kind,
    mode: "cross",
    title: input.title,
    subjectLabel: null,
    subjectType: input.subjectType,
    subjectId: null,
    metrics: input.metrics,
    chartMetrics: input.chartMetrics,
    a,
    b,
    options: input.subjects,
    timeline: comparisonTimeline(a, b, input.metrics),
    rangeA: input.range,
    rangeB: b ? input.range : null,
  };
}

export function buildTrainingSelfComparison(input: {
  analysis: TrainingAnalysis;
  previousAnalysis: TrainingAnalysis;
  subjectType: TrainingComparisonSubjectType;
  subjectId?: string | null;
  subjectLabel?: string | null;
}): TrainingComparison {
  const fallbackId = input.subjectId ?? input.subjectType;
  const currentSource = subjectForType(input.analysis, input.subjectType, input.subjectId);
  const previousSource = subjectForType(input.previousAnalysis, input.subjectType, input.subjectId);
  const subjectLabel = input.subjectLabel ?? currentSource?.label ?? previousSource?.label ?? "Sin datos";
  const current = currentSource ?? emptySubject(input.analysis, input.subjectType, fallbackId, subjectLabel);
  const previous = previousSource ?? emptySubject(input.previousAnalysis, input.subjectType, fallbackId, subjectLabel);
  const { metrics, chartMetrics } = metricsForSubject(input.subjectType);
  const a = { ...current, id: `${fallbackId}:current`, label: "Actual" };
  const b = { ...previous, id: `${fallbackId}:previous`, label: "Anterior" };
  return {
    kind: "previous",
    mode: "self",
    title: "Evolución",
    subjectLabel,
    subjectType: input.subjectType,
    subjectId: fallbackId,
    metrics,
    chartMetrics,
    a,
    b,
    options: [],
    timeline: comparisonTimeline(a, b, metrics),
    rangeA: input.analysis.range,
    rangeB: input.previousAnalysis.range,
  };
}

function exerciseSessionSubject(id: string, label: string, sessions: readonly ExerciseReportSession[]): TrainingComparisonSubject {
  const report = summarizeExerciseReport(sessions);
  const points = buildExerciseReportPoints(sessions);
  const bestReps = points.reduce<number | null>((best, point) => point.bestReps !== null && (best === null || point.bestReps > best) ? point.bestReps : best, null);
  return {
    id,
    label,
    summary: {
      sessions: sessions.length,
      sets: sessions.reduce((total, session) => total + completedExerciseSets(session.sets).length, 0),
      minutes: 0,
      volumeKg: report.totalVolumeKg,
      exerciseCount: sessions.length > 0 ? 1 : 0,
      hasData: sessions.length > 0,
    },
    timeline: points.map((point) => ({
      id: point.sessionId,
      start: point.logDate,
      end: point.logDate,
      sessions: 1,
      sets: sessions.find((session) => session.sessionId === point.sessionId)?.sets.filter(completedWorkSet).length ?? 0,
      minutes: 0,
      volumeKg: point.volumeKg,
      exerciseCount: 1,
      hasData: true,
      bestWeightKg: point.bestWeightKg,
      bestReps: point.bestReps,
    })),
    bestWeightKg: report.bestWeightKg,
    bestReps,
  };
}

export function buildExerciseSessionSelfComparison(input: {
  exerciseId: string;
  exerciseName: string;
  currentSessions: readonly ExerciseReportSession[];
  previousSessions: readonly ExerciseReportSession[];
  rangeA: { start: string; end: string };
  rangeB: { start: string; end: string };
}): TrainingComparison {
  const { metrics, chartMetrics } = metricsForSubject("exercise");
  const a = exerciseSessionSubject(`${input.exerciseId}:current`, "Actual", input.currentSessions);
  const b = exerciseSessionSubject(`${input.exerciseId}:previous`, "Anterior", input.previousSessions);
  return {
    kind: "previous",
    mode: "self",
    title: "Evolución",
    subjectLabel: input.exerciseName,
    subjectType: "exercise",
    subjectId: input.exerciseId,
    metrics,
    chartMetrics,
    a,
    b,
    options: [],
    timeline: comparisonTimeline(a, b, metrics, "Sesión"),
    rangeA: input.rangeA,
    rangeB: input.rangeB,
  };
}

export function buildTrainingComparison(input: {
  kind: Exclude<TrainingComparisonKind, "previous">;
  analysis: TrainingAnalysis;
  requestedA?: string | null;
  requestedB?: string | null;
  exerciseIds?: string[];
}): TrainingComparison {
  if (input.kind === "routines") {
    const routinesWithData = new Set(input.analysis.routines.filter((routine) => routine.summary.hasData).map((routine) => routine.id));
    const routineIds = [
      ...input.analysis.activeRoutineIds.filter((id) => routinesWithData.has(id)),
      ...input.analysis.routines.filter((routine) => routine.summary.hasData && !input.analysis.activeRoutineIds.includes(routine.id)).map((routine) => routine.id),
    ];
    const subjects = uniqueSubjects(routineIds.map((id) => subjectForRoutine(input.analysis, id)));
    return comparisonFromSubjects({ kind: "routines", title: "Comparar rutinas", subjectType: "routine", metrics: ["sessions", "sets", "minutes", "volume"], chartMetrics: ["volume", "sets", "minutes"], subjects, requestedA: input.requestedA, requestedB: input.requestedB, range: input.analysis.range });
  }

  if (input.kind === "muscles") {
    const subjects = uniqueSubjects(input.analysis.muscles.map((muscle) => subjectForMuscle(input.analysis, muscle.key)));
    return comparisonFromSubjects({ kind: "muscles", title: "Comparar músculos", subjectType: "muscle", metrics: ["sets", "sessions", "averageSets", "exerciseCount"], chartMetrics: ["sets"], subjects, requestedA: input.requestedA, requestedB: input.requestedB, range: input.analysis.range });
  }

  const exerciseIds = input.exerciseIds ?? input.analysis.exercises.map((exercise) => exercise.id);
  const subjects = uniqueSubjects(exerciseIds.map((id) => subjectForExercise(input.analysis, id)));
  return comparisonFromSubjects({ kind: "exercises", title: "Comparar ejercicios", subjectType: "exercise", metrics: ["sessions", "bestWeight", "bestReps", "volume"], chartMetrics: ["bestWeight", "bestReps", "volume"], subjects, requestedA: input.requestedA, requestedB: input.requestedB, range: input.analysis.range });
}
