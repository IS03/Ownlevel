import "server-only";

import { listBodyMeasurements } from "@/lib/body-measurements";
import { getNutritionReport } from "@/lib/nutrition/reports";
import { listAllWeightHistory } from "@/lib/phase1/day-log";
import { loadCompletedTrainingData } from "@/lib/phase2/training-robust";
import {
  bodyMeasurementSamples,
  buildProgressMetricCatalog,
  dailyMetricSamples,
  nutritionMetricSamples,
  resolveProgressPeriod,
  weightMetricSamples,
  type DynamicMetricDefinitionInput,
  type ProgressMetricSample,
} from "@/lib/progress/analytics";
import { trainingLoadSamples } from "@/lib/progress/training-performance";
import {
  requireAuthenticatedRequestContext,
  type AuthenticatedRequestContext,
} from "@/lib/supabase/server";
import type { BodyMeasurementField } from "@/lib/body-measurement-types";
import type { MetricReportValueFact } from "@/lib/daily-metrics/reports-core";
import { buildRelationshipPairs, buildRelationshipVariableCatalog, TRAINING_PERFORMANCE_RELATIONSHIP_KEY } from "./catalog";
import { analyzeRelationshipPair, getHighlightedRelationships } from "./engine";
import { trainingPerformanceRelationshipSamples } from "./training";
import type { RelationshipsWorkspace } from "./types";

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getRelationshipsWorkspace(
  input: {
    period?: string;
    from?: string;
    to?: string;
    aKey?: string;
    bKey?: string;
    analyze?: boolean;
  },
  today: string,
  context?: AuthenticatedRequestContext,
): Promise<RelationshipsWorkspace> {
  const auth = context ?? await requireAuthenticatedRequestContext();
  const period = resolveProgressPeriod({ preset: input.period ?? "8w", from: input.from, to: input.to }, today);

  const ensured = await auth.supabase.rpc("ensure_user_metrics");
  if (ensured.error) throw new Error(`Inicializar métricas para Relaciones: ${ensured.error.message}`);
  const { data: rawDefinitions, error: definitionsError } = await auth.supabase
    .from("user_metrics")
    .select("id,system_key,name,unit,value_type,target_value,sort_order,is_active,archived_at")
    .eq("user_id", auth.userId)
    .order("is_active", { ascending: false })
    .order("sort_order");
  if (definitionsError) throw new Error(`Leer métricas para Relaciones: ${definitionsError.message}`);

  const dynamicDefinitions = (rawDefinitions ?? []).map((definition) => ({
    ...definition,
    target_value: numberOrNull(definition.target_value),
  })) as DynamicMetricDefinitionInput[];
  const metrics = buildProgressMetricCatalog(dynamicDefinitions);

  const [valuesResult, nutrition, weightHistory, measurements, trainingSource] = await Promise.all([
    auth.supabase
      .from("daily_metric_values")
      .select("metric_id,metric_date,value")
      .eq("user_id", auth.userId)
      .gte("metric_date", period.current.start)
      .lte("metric_date", period.current.end),
    getNutritionReport({ period: "custom", from: period.current.start, to: period.current.end }, today, auth),
    listAllWeightHistory(auth),
    listBodyMeasurements(1000, auth),
    loadCompletedTrainingData(auth),
  ]);
  if (valuesResult.error) throw new Error(`Leer valores para Relaciones: ${valuesResult.error.message}`);

  const dailyValues = (valuesResult.data ?? []).map((row) => ({
    metric_id: String(row.metric_id),
    metric_date: String(row.metric_date),
    value: Number(row.value),
  })).filter((row) => Number.isFinite(row.value)) as MetricReportValueFact[];

  const samplesByVariable = new Map<string, readonly ProgressMetricSample[]>();
  for (const metric of metrics) {
    if (metric.source.adapter === "nutrition_day") {
      samplesByVariable.set(metric.key, nutritionMetricSamples(metric.key as Parameters<typeof nutritionMetricSamples>[0], nutrition.days));
    } else if (metric.source.adapter === "daily_metric") {
      samplesByVariable.set(metric.key, dailyMetricSamples(String(metric.source.field), dailyValues));
    } else if (metric.source.adapter === "weight_history") {
      samplesByVariable.set(metric.key, weightMetricSamples(weightHistory).filter((sample) => sample.date >= period.current.start && sample.date <= period.current.end));
    } else if (metric.source.adapter === "body_measurement") {
      samplesByVariable.set(metric.key, bodyMeasurementSamples(metric.source.field as BodyMeasurementField, measurements).filter((sample) => sample.date >= period.current.start && sample.date <= period.current.end));
    }
  }

  for (const [key, samples] of trainingLoadSamples(trainingSource)) {
    samplesByVariable.set(key, samples.filter((sample) => sample.date >= period.current.start && sample.date <= period.current.end));
  }
  const performanceSamples = trainingPerformanceRelationshipSamples(trainingSource, period.current);
  samplesByVariable.set(TRAINING_PERFORMANCE_RELATIONSHIP_KEY, performanceSamples);

  const variables = buildRelationshipVariableCatalog({ metrics, samplesByMetric: samplesByVariable, performanceSampleSize: performanceSamples.length });
  const compatiblePairs = buildRelationshipPairs(variables);
  const byKey = new Map(variables.map((variable) => [variable.key, variable]));
  const viablePairs = compatiblePairs.filter((pair) => (byKey.get(pair.aKey)?.sampleSize ?? 0) > 0 && (byKey.get(pair.bKey)?.sampleSize ?? 0) > 0);
  const requestedPair = compatiblePairs.find((pair) => pair.aKey === input.aKey && pair.bKey === input.bKey) ?? null;
  const selectedPair = requestedPair ?? viablePairs[0] ?? compatiblePairs[0] ?? null;
  const inProgressDate = period.includesInProgressDay ? today : null;
  const result = input.analyze && selectedPair
    ? analyzeRelationshipPair({ pair: selectedPair, variables, samplesByVariable, period: period.current, inProgressDate })
    : null;
  const highlights = getHighlightedRelationships({ variables, pairs: compatiblePairs, samplesByVariable, period: period.current, inProgressDate });

  return {
    period: { ...period.current, preset: period.preset, label: period.label, error: period.error },
    variables,
    compatiblePairs,
    selectedAKey: selectedPair?.aKey ?? null,
    selectedBKey: selectedPair?.bKey ?? null,
    result,
    highlights,
  };
}

/** Request-level entrypoint for the compact Home consumer planned in PR12. */
export async function getHighlightedRelationshipsForUser(
  input: { period?: string; from?: string; to?: string },
  today: string,
  context?: AuthenticatedRequestContext,
) {
  const workspace = await getRelationshipsWorkspace(input, today, context);
  return workspace.highlights;
}
