import { TRAINING_PROGRESS_METRICS } from "./analytics/catalog";
import { weightModeStrategy } from "@/lib/mobile-api/weight-modes";
import type { ProgressMetricSample, ProgressPeriodRange } from "./analytics/types";
import { buildProgressComparison, type ProgressComparisonReport, type ProgressTemporalComparisonReference } from "./comparisons";
import type { TrainingAnalysis, TrainingAnalysisSource } from "../phase2/training-analysis";
import { muscleGroupLabel } from "../phase2/muscle-groups";

export type TrainingPerformanceStatus = "improved" | "stable" | "declined" | "insufficient_data";
export type TrainingPerformanceReason =
  | "comparable"
  | "new_exercise"
  | "not_trained_in_primary"
  | "different_weight_mode"
  | "missing_weight_mode"
  | "unsupported_weight_mode"
  | "incomplete_sets"
  | "ambiguous_evidence";

export type TrainingPerformanceSignalKind =
  | "new_best_weight"
  | "new_rep_record"
  | "more_reps_same_load"
  | "more_load_same_reps"
  | "fewer_reps_same_load"
  | "less_load_same_reps"
  | "more_reps_bodyweight"
  | "fewer_reps_bodyweight"
  | "more_time"
  | "less_time"
  | "stable";

export type TrainingExercisePerformance = {
  exerciseId: string;
  name: string;
  muscleKey: string;
  muscleLabel: string;
  weightMode: string | null;
  status: TrainingPerformanceStatus;
  reason: TrainingPerformanceReason;
  signal: {
    kind: TrainingPerformanceSignalKind;
    description: string;
    currentValue: number | null;
    referenceValue: number | null;
    contextValue: number | null;
  } | null;
  primarySampleSize: number;
  referenceSampleSize: number;
  isPersonalRecord: boolean;
};

export type TrainingPerformanceSummary = {
  improved: number;
  stable: number;
  declined: number;
  comparable: number;
  insufficient: number;
  headline: string;
  context: string | null;
};

export type TrainingFeelingMetric = {
  key: "energy" | "performance" | "pain";
  label: string;
  average: number;
  scaleMaximum: 5 | 10;
  registeredCount: number;
  eligibleCount: number;
  coverageRatio: number;
};

export type TrainingGeneralAnalytics = {
  performance: {
    summary: TrainingPerformanceSummary;
    exercises: TrainingExercisePerformance[];
    findings: TrainingExercisePerformance[];
  };
  loadComparison: ProgressComparisonReport;
  feelings: TrainingFeelingMetric[];
};

export type TrainingPerformanceScope = {
  /** Stable catalog exercise identity. Used by the individual report. */
  exerciseId?: string;
  /** Historical routine identity, including the synthetic free-session id. */
  routineId?: string;
  /** Stable broad group from `grupo_muscular_snapshot`. */
  muscleKey?: string;
  /** Normalized real free-text detail from `muscle_group_label_snapshot`. */
  muscleDetailKey?: string;
};

export type PerformanceStrategy = "load_reps" | "bodyweight_reps" | "unit_reps" | "time" | "unsupported";
type ComparableSet = { reps: number; load: number | null; date: string };
type ExerciseSnapshot = {
  exerciseId: string;
  name: string;
  muscleKey: string;
  muscleLabel: string;
  mode: string | null;
  normalizedMode: string | null;
  sets: ComparableSet[];
};

const statusOrder: Record<TrainingPerformanceStatus, number> = {
  improved: 0,
  declined: 1,
  stable: 2,
  insufficient_data: 3,
};

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalize(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-AR");
  return normalized || null;
}

/** The validated comparison strategy for a (normalized, lower-case) weight mode. */
export function trainingPerformanceStrategy(mode: string | null | undefined): PerformanceStrategy {
  return strategyFor(normalize(mode));
}

const strategyFor = (mode: string | null): PerformanceStrategy => weightModeStrategy(mode);

function number(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits }).format(value);
}

function signed(value: number, unit: string) {
  const prefix = value > 0 ? "+" : "−";
  return `${prefix}${number(Math.abs(value))} ${unit}`;
}

function sessionMatchesRoutine(routineId: string | null, requestedRoutineId?: string) {
  if (requestedRoutineId === undefined) return true;
  return requestedRoutineId === "__free__" ? routineId === null : routineId === requestedRoutineId;
}

export function trainingMuscleDetailKey(value: string | null | undefined): string | null {
  return normalize(value);
}

function exerciseMatchesScope(exercise: TrainingAnalysisSource["sessionExercises"][number], scope: TrainingPerformanceScope) {
  if (scope.exerciseId && exercise.exercise_id !== scope.exerciseId) return false;
  if (scope.muscleKey && exercise.grupo_muscular_snapshot !== scope.muscleKey) return false;
  if (scope.muscleDetailKey && trainingMuscleDetailKey(exercise.muscle_group_label_snapshot) !== scope.muscleDetailKey) return false;
  return true;
}

function snapshotMap(source: TrainingAnalysisSource, range: ProgressPeriodRange, scope: TrainingPerformanceScope = {}) {
  const sessions = new Map(source.sessions
    .filter((session) => session.status === "completed" && session.ended_at && sessionMatchesRoutine(session.routine_id, scope.routineId))
    .flatMap((session) => {
      const date = source.dateByDayLog.get(session.day_log_id);
      return date && date >= range.start && date <= range.end ? [[session.id, date] as const] : [];
    }));
  const setsByExercise = new Map<string, ComparableSet[]>();
  for (const set of source.sets) {
    if (!set.is_completed) continue;
    const reps = finite(set.actual_reps);
    if (reps === null || reps <= 0) continue;
    const current = setsByExercise.get(set.workout_session_exercise_id) ?? [];
    current.push({ reps, load: finite(set.actual_weight_kg), date: "" });
    setsByExercise.set(set.workout_session_exercise_id, current);
  }

  const byExercise = new Map<string, ExerciseSnapshot[]>();
  for (const exercise of source.sessionExercises) {
    const date = sessions.get(exercise.workout_session_id);
    if (!date || !exercise.is_completed || !exerciseMatchesScope(exercise, scope)) continue;
    const sets = (setsByExercise.get(exercise.id) ?? []).map((set) => ({ ...set, date }));
    const mode = exercise.weight_mode_snapshot?.trim() || null;
    const item: ExerciseSnapshot = {
      exerciseId: exercise.exercise_id,
      name: exercise.nombre_snapshot,
      muscleKey: exercise.grupo_muscular_snapshot ?? "unassigned",
      muscleLabel: muscleGroupLabel(exercise.grupo_muscular_snapshot) ?? (exercise.muscle_group_label_snapshot?.trim() || "Sin grupo"),
      mode,
      normalizedMode: normalize(mode),
      sets,
    };
    const current = byExercise.get(item.exerciseId) ?? [];
    current.push(item);
    byExercise.set(item.exerciseId, current);
  }
  return byExercise;
}

function mergeSnapshots(items: ExerciseSnapshot[]): ExerciseSnapshot | null {
  if (!items.length) return null;
  const latest = [...items].sort((left, right) => right.sets[0]?.date.localeCompare(left.sets[0]?.date ?? "") ?? 0)[0]!;
  const modes = new Set(items.map((item) => item.normalizedMode));
  return { ...latest, normalizedMode: modes.size === 1 ? latest.normalizedMode : "__multiple__", sets: items.flatMap((item) => item.sets) };
}

function maxBy<T>(items: readonly T[], value: (item: T) => number): T | null {
  return items.reduce<T | null>((best, item) => best === null || value(item) > value(best) ? item : best, null);
}

function directLoadSignal(
  primary: ComparableSet[],
  reference: ComparableSet[],
  unit: "kg" | "lingotes",
): TrainingExercisePerformance["signal"] {
  const primaryRepsAtLoad = new Map<number, number>();
  const referenceRepsAtLoad = new Map<number, number>();
  for (const set of primary) if (set.load !== null && set.load > 0) primaryRepsAtLoad.set(set.load, Math.max(primaryRepsAtLoad.get(set.load) ?? 0, set.reps));
  for (const set of reference) if (set.load !== null && set.load > 0) referenceRepsAtLoad.set(set.load, Math.max(referenceRepsAtLoad.get(set.load) ?? 0, set.reps));
  const sharedLoads = [...primaryRepsAtLoad.keys()].filter((load) => referenceRepsAtLoad.has(load)).sort((a, b) => b - a);
  if (sharedLoads.length) {
    const load = sharedLoads[0]!;
    const current = primaryRepsAtLoad.get(load)!;
    const previous = referenceRepsAtLoad.get(load)!;
    if (current !== previous) return {
      kind: current > previous ? "more_reps_same_load" : "fewer_reps_same_load",
      description: `${signed(current - previous, "reps")} con ${number(load)} ${unit}`,
      currentValue: current,
      referenceValue: previous,
      contextValue: load,
    };
  }

  const primaryLoadAtReps = new Map<number, number>();
  const referenceLoadAtReps = new Map<number, number>();
  for (const set of primary) if (set.load !== null && set.load > 0) primaryLoadAtReps.set(set.reps, Math.max(primaryLoadAtReps.get(set.reps) ?? 0, set.load));
  for (const set of reference) if (set.load !== null && set.load > 0) referenceLoadAtReps.set(set.reps, Math.max(referenceLoadAtReps.get(set.reps) ?? 0, set.load));
  const sharedReps = [...primaryLoadAtReps.keys()].filter((reps) => referenceLoadAtReps.has(reps)).sort((a, b) => b - a);
  if (sharedReps.length) {
    const reps = sharedReps[0]!;
    const current = primaryLoadAtReps.get(reps)!;
    const previous = referenceLoadAtReps.get(reps)!;
    if (current !== previous) return {
      kind: current > previous ? "more_load_same_reps" : "less_load_same_reps",
      description: `${signed(current - previous, unit)} manteniendo ${number(reps, 0)} reps`,
      currentValue: current,
      referenceValue: previous,
      contextValue: reps,
    };
  }

  const bestPrimary = maxBy(primary.filter((set) => set.load !== null), (set) => (set.load ?? 0) * 10_000 + set.reps);
  const bestReference = maxBy(reference.filter((set) => set.load !== null), (set) => (set.load ?? 0) * 10_000 + set.reps);
  if (bestPrimary && bestReference && bestPrimary.load === bestReference.load && bestPrimary.reps === bestReference.reps) {
    return { kind: "stable", description: "Sin cambio claro", currentValue: bestPrimary.load, referenceValue: bestReference.load, contextValue: bestPrimary.reps };
  }
  return null;
}

function recordSignal(
  primary: ComparableSet[],
  historyBeforePrimary: ComparableSet[],
  unit: "kg" | "lingotes",
): TrainingExercisePerformance["signal"] {
  if (!historyBeforePrimary.length) return null;
  const primaryBest = maxBy(primary.filter((set) => set.load !== null && set.load > 0), (set) => set.load ?? 0);
  const historicBest = maxBy(historyBeforePrimary.filter((set) => set.load !== null && set.load > 0), (set) => set.load ?? 0);
  if (primaryBest && historicBest && primaryBest.load! > historicBest.load!) {
    return {
      kind: "new_best_weight",
      description: `Nuevo mejor ${unit === "kg" ? "peso" : "registro"}: ${number(primaryBest.load!)} ${unit} × ${number(primaryBest.reps, 0)}`,
      currentValue: primaryBest.load,
      referenceValue: historicBest.load,
      contextValue: primaryBest.reps,
    };
  }

  const historicByLoad = new Map<number, number>();
  for (const set of historyBeforePrimary) if (set.load !== null) historicByLoad.set(set.load, Math.max(historicByLoad.get(set.load) ?? 0, set.reps));
  const records = primary.filter((set) => set.load !== null && historicByLoad.has(set.load) && set.reps > historicByLoad.get(set.load!)!);
  const record = maxBy(records, (set) => set.load ?? 0);
  if (!record) return null;
  return {
    kind: "new_rep_record",
    description: `Nuevo récord de reps: ${number(record.reps, 0)} con ${number(record.load!)} ${unit}`,
    currentValue: record.reps,
    referenceValue: historicByLoad.get(record.load!)!,
    contextValue: record.load,
  };
}

function simpleSignal(
  primary: ComparableSet[],
  reference: ComparableSet[],
  strategy: "bodyweight_reps" | "time",
): TrainingExercisePerformance["signal"] {
  const current = Math.max(...primary.map((set) => set.reps));
  const previous = Math.max(...reference.map((set) => set.reps));
  if (current === previous) return { kind: "stable", description: "Sin cambio claro", currentValue: current, referenceValue: previous, contextValue: null };
  if (strategy === "time") return {
    kind: current > previous ? "more_time" : "less_time",
    description: `${signed(current - previous, "s")} en el mejor registro`,
    currentValue: current,
    referenceValue: previous,
    contextValue: null,
  };
  return {
    kind: current > previous ? "more_reps_bodyweight" : "fewer_reps_bodyweight",
    description: `${signed(current - previous, "reps")} con peso corporal`,
    currentValue: current,
    referenceValue: previous,
    contextValue: null,
  };
}

function statusFor(signal: TrainingExercisePerformance["signal"]): TrainingPerformanceStatus {
  if (!signal) return "stable";
  if (["new_best_weight", "new_rep_record", "more_reps_same_load", "more_load_same_reps", "more_reps_bodyweight", "more_time"].includes(signal.kind)) return "improved";
  if (["fewer_reps_same_load", "less_load_same_reps", "fewer_reps_bodyweight", "less_time"].includes(signal.kind)) return "declined";
  return "stable";
}

function insufficient(snapshot: ExerciseSnapshot, reason: TrainingPerformanceReason, referenceSampleSize = 0): TrainingExercisePerformance {
  return {
    exerciseId: snapshot.exerciseId,
    name: snapshot.name,
    muscleKey: snapshot.muscleKey,
    muscleLabel: snapshot.muscleLabel,
    weightMode: snapshot.mode,
    status: "insufficient_data",
    reason,
    signal: null,
    primarySampleSize: snapshot.sets.length,
    referenceSampleSize,
    isPersonalRecord: false,
  };
}

export function compareTrainingExercisePerformance(input: {
  primary: ExerciseSnapshot | null;
  reference: ExerciseSnapshot | null;
  historyBeforePrimary?: ExerciseSnapshot | null;
}): TrainingExercisePerformance | null {
  const { primary, reference } = input;
  if (!primary && !reference) return null;
  if (!primary) return insufficient(reference!, "not_trained_in_primary", reference!.sets.length);
  if (!reference) return insufficient(primary, "new_exercise");
  if (!primary.normalizedMode || !reference.normalizedMode) return insufficient(primary, "missing_weight_mode", reference.sets.length);
  if (primary.normalizedMode === "__multiple__" || reference.normalizedMode === "__multiple__" || primary.normalizedMode !== reference.normalizedMode) {
    return insufficient(primary, "different_weight_mode", reference.sets.length);
  }
  const strategy = strategyFor(primary.normalizedMode);
  if (strategy === "unsupported") return insufficient(primary, "unsupported_weight_mode", reference.sets.length);
  const validLoad = (set: ComparableSet) => set.load !== null && set.load > 0;
  const bodyweightSet = (set: ComparableSet) => set.load === null || set.load === 0;
  const primarySets = strategy === "load_reps" || strategy === "unit_reps"
    ? primary.sets.filter(validLoad)
    : strategy === "bodyweight_reps"
      ? primary.sets.filter(bodyweightSet)
      : primary.sets;
  const referenceSets = strategy === "load_reps" || strategy === "unit_reps"
    ? reference.sets.filter(validLoad)
    : strategy === "bodyweight_reps"
      ? reference.sets.filter(bodyweightSet)
      : reference.sets;
  if (!primarySets.length || !referenceSets.length) return insufficient(primary, "incomplete_sets", referenceSets.length);

  const unit = strategy === "unit_reps" ? "lingotes" : "kg";
  const record = strategy === "load_reps" || strategy === "unit_reps"
    ? recordSignal(primarySets, input.historyBeforePrimary?.sets.filter(validLoad) ?? [], unit)
    : null;
  const direct = strategy === "load_reps" || strategy === "unit_reps"
    ? directLoadSignal(primarySets, referenceSets, unit)
    : simpleSignal(primarySets, referenceSets, strategy);
  const signal = record ?? direct;
  const status = statusFor(signal);
  return {
    exerciseId: primary.exerciseId,
    name: primary.name,
    muscleKey: primary.muscleKey,
    muscleLabel: primary.muscleLabel,
    weightMode: primary.mode,
    status,
    reason: signal ? "comparable" : "ambiguous_evidence",
    signal: signal ?? { kind: "stable", description: "Sin cambio claro", currentValue: null, referenceValue: null, contextValue: null },
    primarySampleSize: primarySets.length,
    referenceSampleSize: referenceSets.length,
    isPersonalRecord: record !== null,
  };
}

function performanceSummary(exercises: TrainingExercisePerformance[]): TrainingPerformanceSummary {
  const improved = exercises.filter((item) => item.status === "improved").length;
  const stable = exercises.filter((item) => item.status === "stable").length;
  const declined = exercises.filter((item) => item.status === "declined").length;
  const comparable = improved + stable + declined;
  const insufficient = exercises.filter((item) => item.status === "insufficient_data").length;
  const improvedByMuscle = new Map<string, { label: string; count: number }>();
  for (const item of exercises.filter((exercise) => exercise.status === "improved" && exercise.muscleKey !== "unassigned")) {
    const current = improvedByMuscle.get(item.muscleKey) ?? { label: item.muscleLabel, count: 0 };
    current.count += 1;
    improvedByMuscle.set(item.muscleKey, current);
  }
  const groups = [...improvedByMuscle.values()].sort((a, b) => b.count - a.count);
  const context = groups[0] && groups[0].count >= 2 && groups[0].count > (groups[1]?.count ?? 0)
    ? `Las mejoras se concentraron principalmente en ${groups[0].label.toLocaleLowerCase("es-AR")}.`
    : groups.length === 2 && groups[0]!.count >= 2 && groups[1]!.count >= 2
      ? `Las mejoras se concentraron en ${groups[0]!.label.toLocaleLowerCase("es-AR")} y ${groups[1]!.label.toLocaleLowerCase("es-AR")}.`
      : null;
  return {
    improved,
    stable,
    declined,
    comparable,
    insufficient,
    headline: comparable ? `${improved} de ${comparable} ejercicios mejoraron` : "No hay suficiente historial comparable",
    context,
  };
}

export function buildTrainingPerformanceComparison(input: {
  source: TrainingAnalysisSource;
  primaryPeriod: ProgressPeriodRange;
  referencePeriod: ProgressPeriodRange;
  /** Optional historical routine identity. The comparison rules remain shared with General. */
  routineId?: string;
  /** Optional reusable context. Routine compatibility remains supported above. */
  scope?: TrainingPerformanceScope;
}): TrainingGeneralAnalytics["performance"] {
  const scope = input.scope ?? { routineId: input.routineId };
  const primary = snapshotMap(input.source, input.primaryPeriod, scope);
  const reference = snapshotMap(input.source, input.referencePeriod, scope);
  // PR evidence stays global to the exercise. A load already reached in another
  // routine is not incorrectly announced as a new personal record.
  const history = snapshotMap(input.source, { start: "0001-01-01", end: input.primaryPeriod.start });
  const exerciseIds = new Set([...primary.keys(), ...reference.keys()]);
  const exercises = [...exerciseIds].flatMap((exerciseId) => {
    const primarySnapshot = mergeSnapshots(primary.get(exerciseId) ?? []);
    const comparableHistory = (history.get(exerciseId) ?? []).filter((item) => (
      item.sets.some((set) => set.date < input.primaryPeriod.start) &&
      item.normalizedMode === primarySnapshot?.normalizedMode
    ));
    const result = compareTrainingExercisePerformance({
      primary: primarySnapshot,
      reference: mergeSnapshots(reference.get(exerciseId) ?? []),
      historyBeforePrimary: mergeSnapshots(comparableHistory),
    });
    return result ? [result] : [];
  }).sort((left, right) => statusOrder[left.status] - statusOrder[right.status] || Number(right.isPersonalRecord) - Number(left.isPersonalRecord) || left.name.localeCompare(right.name, "es-AR"));
  return {
    summary: performanceSummary(exercises),
    exercises,
    findings: exercises
      .filter((item) => (item.status === "improved" || item.status === "declined") && item.signal)
      .sort((a, b) => Number(b.isPersonalRecord) - Number(a.isPersonalRecord) || statusOrder[a.status] - statusOrder[b.status])
      .slice(0, 3),
  };
}

export function buildTrainingLoadComparison(input: {
  source: TrainingAnalysisSource;
  primary: TrainingAnalysis;
  reference: TrainingAnalysis;
  referenceDefinition: ProgressTemporalComparisonReference;
  selectedMetricKeys?: readonly string[];
  activeMetricKey?: string | null;
  routineId?: string;
  scope?: TrainingPerformanceScope;
  metricKeys?: readonly string[];
}): ProgressComparisonReport {
  const allowedKeys = input.metricKeys ? new Set(input.metricKeys) : null;
  const metrics = TRAINING_PROGRESS_METRICS.filter((metric) => allowedKeys ? allowedKeys.has(metric.key) : metric.category === "load");
  const keys = new Set(input.selectedMetricKeys?.length ? input.selectedMetricKeys : metrics.map((metric) => metric.key));
  const requested = metrics.filter((metric) => keys.has(metric.key));
  const selected = requested.length ? requested : metrics;
  const samples = trainingLoadSamples(input.source, input.scope ?? { routineId: input.routineId });
  const primarySamples = new Map(selected.map((metric) => [metric.key, samples.get(metric.key) ?? []]));
  const referenceSamples = new Map(selected.map((metric) => [metric.key, samples.get(metric.key) ?? []]));
  return buildProgressComparison({
    metrics: selected,
    samplesByMetric: primarySamples,
    referenceSamplesByMetric: referenceSamples,
    primaryPeriod: input.primary.range,
    primaryLabel: input.primary.range.label,
    reference: input.referenceDefinition,
    activeMetricKey: input.activeMetricKey,
    initialView: "evolution",
  });
}

export function trainingLoadSamples(source: TrainingAnalysisSource, scope: TrainingPerformanceScope = {}): Map<string, ProgressMetricSample[]> {
  const exerciseSession = new Map(source.sessionExercises
    .filter((exercise) => exercise.is_completed && exerciseMatchesScope(exercise, scope))
    .map((exercise) => [exercise.id, exercise.workout_session_id]));
  const setsBySession = new Map<string, { count: number; volume: number }>();
  for (const set of source.sets) {
    if (!set.is_completed) continue;
    const sessionId = exerciseSession.get(set.workout_session_exercise_id);
    if (!sessionId) continue;
    const current = setsBySession.get(sessionId) ?? { count: 0, volume: 0 };
    current.count += 1;
    current.volume += Math.max(0, finite(set.actual_reps) ?? 0) * Math.max(0, finite(set.actual_weight_kg) ?? 0);
    setsBySession.set(sessionId, current);
  }
  const result = new Map<string, ProgressMetricSample[]>([
    ["training.load.sessions", []],
    ["training.load.sets", []],
    ["training.load.duration", []],
    ["training.load.volume", []],
    ["training.load.sets_per_session", []],
  ]);
  for (const session of source.sessions) {
    const date = source.dateByDayLog.get(session.day_log_id);
    if (session.status !== "completed" || !session.ended_at || !date || !sessionMatchesRoutine(session.routine_id, scope.routineId)) continue;
    const sets = setsBySession.get(session.id) ?? { count: 0, volume: 0 };
    if ((scope.exerciseId || scope.muscleKey || scope.muscleDetailKey) && sets.count === 0) continue;
    const elapsed = new Date(session.ended_at).getTime() - new Date(session.started_at).getTime();
    const minutes = Number.isFinite(elapsed) && elapsed > 0 ? Math.round(elapsed / 60_000) : 0;
    const context = { sessionId: session.id };
    result.get("training.load.sessions")!.push({ date, value: 1, entityId: session.id, context });
    result.get("training.load.sets")!.push({ date, value: sets.count, entityId: session.id, context });
    result.get("training.load.duration")!.push({ date, value: minutes, entityId: session.id, context });
    result.get("training.load.volume")!.push({ date, value: sets.volume, entityId: session.id, context });
    result.get("training.load.sets_per_session")!.push({ date, value: sets.count, entityId: session.id, context });
  }
  return result;
}

export function buildTrainingFeelings(source: TrainingAnalysisSource, range: ProgressPeriodRange): TrainingFeelingMetric[] {
  const sessions = source.sessions.filter((session) => {
    const date = source.dateByDayLog.get(session.day_log_id);
    return session.status === "completed" && Boolean(date && date >= range.start && date <= range.end);
  });
  const definitions = [
    { key: "energy" as const, label: "Energía", scaleMaximum: 5 as const, values: sessions.map((session) => finite(session.energy_level)).filter((value): value is number => value !== null) },
    { key: "performance" as const, label: "Rendimiento percibido", scaleMaximum: 5 as const, values: sessions.map((session) => finite(session.performance_level)).filter((value): value is number => value !== null) },
    { key: "pain" as const, label: "Dolor o molestias", scaleMaximum: 10 as const, values: sessions.map((session) => finite(session.pain_level)).filter((value): value is number => value !== null) },
  ];
  return definitions.filter((definition) => definition.values.length >= 2).map((definition) => ({
    key: definition.key,
    label: definition.label,
    average: definition.values.reduce((total, value) => total + value, 0) / definition.values.length,
    scaleMaximum: definition.scaleMaximum,
    registeredCount: definition.values.length,
    eligibleCount: sessions.length,
    coverageRatio: sessions.length ? definition.values.length / sessions.length : 0,
  }));
}

export function buildTrainingGeneralAnalytics(input: {
  source: TrainingAnalysisSource;
  primary: TrainingAnalysis;
  reference: TrainingAnalysis;
  referenceDefinition: ProgressTemporalComparisonReference;
  selectedMetricKeys?: readonly string[];
  activeMetricKey?: string | null;
}): TrainingGeneralAnalytics {
  return {
    performance: buildTrainingPerformanceComparison({ source: input.source, primaryPeriod: input.primary.range, referencePeriod: input.reference.range }),
    loadComparison: buildTrainingLoadComparison(input),
    feelings: buildTrainingFeelings(input.source, input.primary.range),
  };
}
