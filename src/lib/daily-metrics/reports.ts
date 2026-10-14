import "server-only";

import type { AuthenticatedRequestContext } from "@/lib/supabase/server";
import { requireAuthenticatedRequestContext } from "@/lib/supabase/server";
import {
  resolveNutritionReportRange,
} from "@/lib/nutrition/reports-core";
import {
  aggregateMetricReport,
  availableMetricDefinitions,
  buildMetricReportDays,
  compareMetricReports,
  selectMetricDefinition,
  type MetricReportDefinition,
  type MetricReportValueFact,
} from "./reports-core";
import {
  adaptDailyMetricDefinition,
  dailyMetricSamples,
  type ProgressMetricSample,
} from "@/lib/progress/analytics";
import {
  buildProgressComparison,
  resolveProgressComparisonReference,
  type ProgressComparisonQuery,
  type ProgressGoalReferenceInput,
} from "@/lib/progress/comparisons";
import { getPreviousProgressPeriod } from "@/lib/progress/analytics";

type ValueRow = { metric_id: unknown; metric_date: unknown; value: unknown };
type ReportSupabase = AuthenticatedRequestContext["supabase"];

/**
 * Reads EVERY value of the window. PostgREST caps each response (max rows,
 * 1000 by default), so a single select silently truncates long periods
 * (1 year + its previous year easily exceeds it). Pages follow a total order
 * (metric_date, metric_id is unique per user) and advance by the rows actually
 * received, so any server cap is safe; an empty page ends the read.
 */
export async function readAllDailyMetricValues(
  supabase: ReportSupabase,
  userId: string,
  start: string,
  end: string,
  pageSize = 1000,
): Promise<ValueRow[]> {
  const rows: ValueRow[] = [];
  for (let page = 0; page < 1000; page += 1) {
    const { data, error } = await supabase
      .from("daily_metric_values")
      .select("metric_id,metric_date,value")
      .eq("user_id", userId)
      .gte("metric_date", start)
      .lte("metric_date", end)
      .order("metric_date", { ascending: true })
      .order("metric_id", { ascending: true })
      .range(rows.length, rows.length + pageSize - 1);
    if (error) throw new Error(`Leer valores para Progreso: ${error.message}`, { cause: error });
    if (!data?.length) return rows;
    rows.push(...(data as ValueRow[]));
  }
  throw new Error("Leer valores para Progreso: demasiadas páginas.");
}

function numberOrNull(value: unknown) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getDailyMetricsReport(
  input: {
    period?: string;
    from?: string;
    to?: string;
    metricId?: string;
    compare?: boolean;
    /** Internal explicit calendar reference; omitted by existing Web/Mobile callers. */
    previousRange?: { start: string; end: string };
    progressComparison?: ProgressComparisonQuery | null;
  },
  today: string,
  auth?: AuthenticatedRequestContext,
) {
  const { supabase, userId } = auth ?? await requireAuthenticatedRequestContext();
  const range = resolveNutritionReportRange(input, today);
  const resolvedReference = input.progressComparison
    ? resolveProgressComparisonReference({ query: input.progressComparison, primaryPeriod: range, today })
    : null;
  const temporalReference = resolvedReference?.reference.type === "previous_period" || resolvedReference?.reference.type === "other_period"
    ? resolvedReference.reference.period
    : null;
  const defaultReference = input.previousRange ?? getPreviousProgressPeriod(range);
  const readStart = [range.start, defaultReference.start, temporalReference?.start ?? range.start].sort()[0]!;
  const readEnd = [range.end, temporalReference?.end ?? range.end].sort().at(-1)!;

  const ensured = await supabase.rpc("ensure_user_metrics");
  if (ensured.error) throw new Error(`Inicializar métricas: ${ensured.error.message}`);

  const [metricResult, valueRows] = await Promise.all([
    supabase
      .from("user_metrics")
      .select("id,system_key,name,unit,value_type,target_value,sort_order,is_active,archived_at")
      .eq("user_id", userId),
    readAllDailyMetricValues(supabase, userId, readStart, readEnd),
  ]);
  if (metricResult.error) throw new Error(`Leer métricas para Progreso: ${metricResult.error.message}`);

  const metrics = (metricResult.data ?? []).map((row) => ({
    ...row,
    target_value: numberOrNull(row.target_value),
  })) as MetricReportDefinition[];
  const values = valueRows.map((row) => ({
    metric_id: String(row.metric_id),
    metric_date: String(row.metric_date),
    value: Number(row.value),
  })).filter((row) => Number.isFinite(row.value)) as MetricReportValueFact[];
  const definitions = availableMetricDefinitions(metrics);
  const metric = selectMetricDefinition(definitions, input.metricId);

  if (!metric) return { range, definitions, metric: null, days: [], summary: null, comparison: null, defaultComparison: null, progressComparison: null, progressMetrics: [], comparisonError: null };

  const days = buildMetricReportDays({ range, today, metricId: metric.id, values });
  const excludeInProgressDay = range.end === today;
  const summary = aggregateMetricReport(days, metric.target_value, { excludeInProgressDay });
  const progressMetrics = definitions.map(adaptDailyMetricDefinition);
  const scopedProgressMetrics = progressMetrics.filter((definition) => (
    definition.metadata?.isActive !== false || definition.metadata?.definitionId === metric.id
  ));
  const samplesByMetric = new Map<string, readonly ProgressMetricSample[]>(progressMetrics.map((definition) => [
    definition.key,
    dailyMetricSamples(String(definition.source.field), values),
  ]));
  const goalsByMetric = new Map<string, ProgressGoalReferenceInput>(progressMetrics.flatMap((definition) => {
    const target = definition.metadata?.targetValue;
    if (!definition.goal || typeof target !== "number" || !Number.isFinite(target)) return [];
    return [[definition.key, {
      label: "Objetivo actual",
      source: definition.goal.source,
      rule: definition.goal.rule,
      value: target,
    }]];
  }));
  const defaultComparison = buildProgressComparison({
    metrics: scopedProgressMetrics,
    selectedMetricKeys: scopedProgressMetrics.map((definition) => definition.key),
    samplesByMetric,
    primaryPeriod: range,
    primaryLabel: range.preset,
    reference: { type: "previous_period", period: defaultReference, label: "Período anterior" },
    inProgressDate: excludeInProgressDay ? today : null,
    activeMetricKey: `activity.daily.${metric.id}`,
  });
  let progressComparison = null;
  if (resolvedReference) {
    const requested = input.progressComparison?.selectedMetricKeys.filter((key) => progressMetrics.some((definition) => definition.key === key)) ?? [];
    const selectedMetricKeys = requested.length ? requested : [`activity.daily.${metric.id}`];
    progressComparison = buildProgressComparison({
      metrics: resolvedReference.reference.type === "goal"
        ? scopedProgressMetrics.filter((definition) => definition.supportsGoal)
        : scopedProgressMetrics,
      selectedMetricKeys,
      samplesByMetric,
      primaryPeriod: range,
      primaryLabel: range.preset,
      reference: resolvedReference.reference,
      goalsByMetric,
      inProgressDate: range.end === today ? today : null,
      activeMetricKey: input.progressComparison?.activeMetricKey,
      initialView: input.progressComparison?.initialView,
    });
  }
  const previousDays = buildMetricReportDays({
    range: defaultReference,
    today,
    metricId: metric.id,
    values,
  });
  const previousSummary = aggregateMetricReport(previousDays, metric.target_value);
  return {
    range,
    definitions,
    metric,
    days,
    summary,
    comparison: compareMetricReports(summary, previousSummary, defaultReference, previousDays),
    defaultComparison,
    progressComparison,
    progressMetrics,
    comparisonError: resolvedReference?.error ?? null,
  };
}
