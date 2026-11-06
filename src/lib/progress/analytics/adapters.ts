import type { BodyMeasurement, BodyMeasurementField } from "../../body-measurement-types";
import { isValidBodyWeightKg } from "../../weight-history";
import type { MetricReportValueFact } from "../../daily-metrics/reports-core";
import type { NutritionReportDay } from "../../nutrition/reports-core";
import {
  bestRepsForSession,
  bestWeightForSession,
  exerciseSessionVolume,
  type ExerciseReportSession,
} from "../../phase2/exercise-insights";
import type { TrainingAnalysisTimelinePoint } from "../../phase2/training-analysis";
import type { WeightHistoryPoint } from "../../weight-history";
import type { ProgressMetricDefinition, ProgressMetricSample } from "./types";

const nutritionFields = {
  "nutrition.calories": "calories",
  "nutrition.calorie_target": "targetCalories",
  "nutrition.protein": "proteinG",
  "nutrition.carbs": "carbsG",
  "nutrition.fat": "fatG",
  "nutrition.expenditure": "expenditureKcal",
  "nutrition.energy_balance": "energyBalanceKcal",
} as const satisfies Record<string, keyof NutritionReportDay>;

export function nutritionMetricSamples(
  metricKey: keyof typeof nutritionFields,
  days: readonly NutritionReportDay[],
): ProgressMetricSample[] {
  const field = nutritionFields[metricKey];
  return days.map((day) => ({
    date: day.date,
    value: typeof day[field] === "number" ? day[field] : null,
    context: { isComplete: day.isComplete, hasNutrition: day.hasNutrition },
  }));
}

const nutritionGoalFields = {
  "nutrition.calories": "targetCalories",
  "nutrition.protein": "targetProteinG",
} as const satisfies Record<string, keyof NutritionReportDay>;

export function nutritionGoalMetricSamples(
  metricKey: keyof typeof nutritionGoalFields,
  days: readonly NutritionReportDay[],
): ProgressMetricSample[] {
  const field = nutritionGoalFields[metricKey];
  return days.map((day) => ({
    date: day.date,
    value: typeof day[field] === "number" ? day[field] : null,
    context: { source: "historical_snapshot" },
  }));
}

export function dailyMetricSamples(
  definitionId: string,
  values: readonly MetricReportValueFact[],
): ProgressMetricSample[] {
  return values
    .filter((value) => value.metric_id === definitionId)
    .map((value) => ({ date: value.metric_date, value: value.value }));
}

/** Only real weights: a stored 0 kg is not a sample, it is an excluded record (see buildBodyProgressReport). */
export function weightMetricSamples(entries: readonly WeightHistoryPoint[]): ProgressMetricSample[] {
  return entries.filter((entry) => isValidBodyWeightKg(entry.weight_kg)).map((entry) => ({ date: entry.log_date, value: entry.weight_kg }));
}

export function bodyMeasurementSamples(
  field: BodyMeasurementField,
  entries: readonly BodyMeasurement[],
  options: { includeSuspect?: boolean } = {},
): ProgressMetricSample[] {
  return entries
    .filter((entry) => options.includeSuspect || entry.quality_status !== "suspect")
    .map((entry) => ({
      date: entry.measured_on,
      value: entry[field],
      context: { qualityStatus: entry.quality_status, qualityNote: entry.quality_note },
    }));
}

const trainingLoadFields = {
  "training.load.sessions": "sessions",
  "training.load.sets": "sets",
  "training.load.duration": "minutes",
  "training.load.volume": "volumeKg",
} as const satisfies Record<string, keyof TrainingAnalysisTimelinePoint>;

export function trainingLoadMetricSamples(
  metricKey: keyof typeof trainingLoadFields,
  timeline: readonly TrainingAnalysisTimelinePoint[],
): ProgressMetricSample[] {
  const field = trainingLoadFields[metricKey];
  return timeline.filter((point) => point.hasData).map((point) => ({
    date: point.end,
    value: typeof point[field] === "number" ? point[field] : null,
    context: { sourceRangeStart: point.start, sourceRangeEnd: point.end },
  }));
}

/**
 * Only metrics with a sound session-level meaning are adapted here. Metrics
 * such as reps-at-equal-load and best-set require the dedicated comparator to
 * preserve load and weight-mode context; returning a scalar would be unsafe.
 */
export function exercisePerformanceMetricSamples(
  metricKey: string,
  sessions: readonly ExerciseReportSession[],
): ProgressMetricSample[] {
  if (![
    "training.performance.best_weight",
    "training.performance.best_reps",
    "training.performance.session_volume",
  ].includes(metricKey)) return [];

  return sessions.map((session) => ({
    date: session.logDate,
    entityId: session.sessionId,
    value: metricKey === "training.performance.best_weight"
      ? bestWeightForSession(session.sets)
      : metricKey === "training.performance.best_reps"
        ? bestRepsForSession(session.sets)
        : exerciseSessionVolume(session.sets),
    context: { completedAt: session.completedAt ?? null, routineId: session.routineId },
  }));
}

export function samplesForProgressMetric(
  metric: ProgressMetricDefinition,
  source: {
    nutritionDays?: readonly NutritionReportDay[];
    dailyMetricValues?: readonly MetricReportValueFact[];
    weightHistory?: readonly WeightHistoryPoint[];
    bodyMeasurements?: readonly BodyMeasurement[];
    trainingTimeline?: readonly TrainingAnalysisTimelinePoint[];
    exerciseSessions?: readonly ExerciseReportSession[];
  },
): ProgressMetricSample[] {
  if (metric.source.adapter === "nutrition_day") {
    return nutritionMetricSamples(metric.key as keyof typeof nutritionFields, source.nutritionDays ?? []);
  }
  if (metric.source.adapter === "daily_metric") {
    return dailyMetricSamples(String(metric.source.field), source.dailyMetricValues ?? []);
  }
  if (metric.source.adapter === "weight_history") return weightMetricSamples(source.weightHistory ?? []);
  if (metric.source.adapter === "body_measurement") {
    return bodyMeasurementSamples(metric.source.field as BodyMeasurementField, source.bodyMeasurements ?? []);
  }
  if (metric.source.adapter === "training_load") {
    return trainingLoadMetricSamples(metric.key as keyof typeof trainingLoadFields, source.trainingTimeline ?? []);
  }
  return exercisePerformanceMetricSamples(metric.key, source.exerciseSessions ?? []);
}
