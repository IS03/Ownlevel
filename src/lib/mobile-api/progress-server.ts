import "server-only";
import { NextResponse } from "next/server";
import { listBodyMeasurements } from "@/lib/body-measurements";
import { getDailyMetricsReport } from "@/lib/daily-metrics/reports";
import { listWeightHistory } from "@/lib/phase1/day-log";
import { getMyProfile } from "@/lib/phase1/profile";
import { todayInCordoba } from "@/lib/phase2/cordoba-date";
import { NUTRITION_PROGRESS_METRICS, bucketProgressRange, getPreviousProgressPeriod, progressBucketForDays, progressRangeDays } from "@/lib/progress/analytics";
import { bodyAvailableMetricDefinitions, buildBodyProgressReport, type BodyObservation, type BodyProgressReport } from "@/lib/progress/body";
import { buildProgressComparison, type ProgressComparisonMetricResult, type ProgressComparisonReport } from "@/lib/progress/comparisons";
import { buildProgressHomeModel, type ProgressHomeRow, type ProgressHomeInsight } from "@/lib/progress/home";
import { DEFAULT_NUTRITION_COMPARISON_METRICS, nutritionSamplesByMetric } from "@/lib/nutrition/reports";
import { aggregateNutritionReport, buildNutritionReportDays, resolveNutritionReportRange, type NutritionReportDay, type NutritionReportRange } from "@/lib/nutrition/reports-core";
import type { AuthenticatedRequestContext } from "@/lib/supabase/server";
import type { RequestPerformanceContext } from "@/lib/request-performance";
import { MobileApiNotFoundError, MobileApiUnauthorizedError, MobileApiValidationError, mobileBearerToken } from "./auth";
import { mobileApiResponseHeaders } from "./http";
import { NutritionReportDayChangedError, readMobileNutritionFacts } from "./nutrition-report-server";
import {
  parseProgressNutritionTiming, PROGRESS_CUSTOM_MAX_DAYS, PROGRESS_DEFAULT_PRESET, habitWeekRange, parseProgressHabitWeek, parseProgressBody, parseProgressMetrics, parseProgressOverview, parseProgressQuery, parseProgressTraining, parseProgressTrainingExercise,
  type ProgressHabitWeek, type BodyObservationDto, type ProgressBody, type ProgressBodyMetric, type ProgressComparison, type ProgressDestination,
  type ProgressMetricDefinition, type ProgressMetrics, type ProgressOverview, type ProgressOverviewSparks, type ProgressPeriod, type ProgressQuery, type ProgressSection,
  type ProgressNutritionTiming, type ProgressSparkPoint,
} from "./progress-contract";
import { isNutritionDate } from "./nutrition-day-contract";
import { authenticateMobileAccessToken, type MobileSupabaseAuthenticatedContext } from "./supabase";
import { loadTrainingContext, trainingInPeriodDto, trainingDto, trainingExerciseDto, trainingSummaryDto } from "./progress-training";

import { readNutritionTiming } from "./progress-nutrition-timing";

type Context = MobileSupabaseAuthenticatedContext;
const webAuth = (context: Context, requestPerformance?: RequestPerformanceContext): AuthenticatedRequestContext =>
  ({ supabase: context.supabase as AuthenticatedRequestContext["supabase"], userId: context.userId, requestPerformance });

/** An explicit comparison range (EXPAND). Absent = the previous equivalent period, exactly as before. */
export type MobileProgressQuery = ProgressQuery & { compare?: { start: string; end: string } };

/** Query params → canonical query (default 30 días). Unknown or repeated params are invalid. */
export function progressQueryFromParams(params: URLSearchParams, extra: readonly string[] = []): MobileProgressQuery {
  const input: Record<string, string> = {};
  const compare: Record<string, string> = {};
  for (const [key, value] of params) {
    if (key in input || key in compare || params.getAll(key).length > 1) throw new MobileApiValidationError("Parámetro repetido.");
    if (!["period", "from", "to", "compareFrom", "compareTo", ...extra].includes(key)) throw new MobileApiValidationError("Parámetro no válido.");
    if (extra.includes(key)) continue;
    if (key === "compareFrom" || key === "compareTo") compare[key] = value; else input[key] = value;
  }
  const query = parseProgressQuery({ period: PROGRESS_DEFAULT_PRESET, ...input });
  if (!query) throw new MobileApiValidationError("Período no válido.");
  if (!("compareFrom" in compare) && !("compareTo" in compare)) return query;
  const { compareFrom: start, compareTo: end } = compare;
  if (!isNutritionDate(start) || !isNutritionDate(end) || start > end) throw new MobileApiValidationError("Período de comparación no válido.");
  return { ...query, compare: { start, end } };
}

/** The canonical period resolver (resolveProgressPeriod via the Reports presets); never beyond today Córdoba. */
export function resolveMobileProgressPeriod(query: MobileProgressQuery, today: string): { range: NutritionReportRange; period: ProgressPeriod } {
  const { compare, ...reportQuery } = query;
  const range = resolveNutritionReportRange(reportQuery, today);
  if (range.error) throw new MobileApiValidationError(range.error);
  if (compare && (compare.end > today || progressRangeDays(compare) > PROGRESS_CUSTOM_MAX_DAYS))
    throw new MobileApiValidationError(`El período de comparación termina hoy como máximo y admite hasta ${PROGRESS_CUSTOM_MAX_DAYS} días.`);
  // Every section (body, nutrition, metrics, training) reads its reference from previousStart/previousEnd.
  const previous = compare ?? getPreviousProgressPeriod(range);
  const days = progressRangeDays(range);
  return { range, period: {
    preset: range.preset, start: range.start, end: range.end, days,
    previousStart: previous.start, previousEnd: previous.end, bucket: progressBucketForDays(days), includesToday: range.end === today,
  } };
}

export function comparisonDto(result: ProgressComparisonMetricResult | undefined): ProgressComparison {
  if (!result) return { status: "insufficient_data", reason: "current_period_empty", current: null, previous: null, deltaAbsolute: null, deltaPercent: null, change: "insufficient_data" };
  const comparable = result.eligibility.status === "comparable";
  return {
    status: result.eligibility.status, reason: result.eligibility.reason, current: result.valueA, previous: result.valueB,
    deltaAbsolute: comparable ? result.deltaAbsolute : null,
    deltaPercent: comparable && result.valueB !== null && result.valueB !== 0 ? result.deltaPercent : null,
    change: result.change,
  };
}

/** Web hrefs → Mobile destinations (Progress Home is shared with Web; only the routes differ). */
function destination(href: string): ProgressDestination | null {
  const url = new URL(href, "https://ownlevel.invalid");
  if (url.pathname === "/train/body") return { kind: "body" };
  if (url.pathname === "/today/reports") return { kind: "nutrition" };
  if (url.pathname === "/progress/metrics") return { kind: "metrics", metricId: url.searchParams.get("metric") };
  if (url.pathname === "/train/progress") return { kind: "training" };
  return null;
}
const domainOf = (d: ProgressHomeInsight["domain"]) => d === "activity" ? "metrics" as const : d;
/** Training findings point to their exercise analytics (Web id `training:<exerciseId>`). */
function findingDestination(insight: ProgressHomeInsight): ProgressDestination | null {
  if (insight.domain === "training" && insight.id.startsWith("training:")) return { kind: "training_exercise", exerciseId: insight.id.slice("training:".length) };
  return destination(insight.href);
}

async function isolated<T>(task: () => Promise<T>, label: string): Promise<ProgressSection<T>> {
  try { return { status: "ok", data: await task() }; }
  catch (e) {
    if (e instanceof NutritionReportDayChangedError) throw e;
    console.warn(`[mobile.progress] ${label} unavailable`);
    return { status: "unavailable" };
  }
}

async function bodyReport(context: Context, range: NutritionReportRange, period: ProgressPeriod) {
  const auth = webAuth(context);
  const [profile, weightHistory, measurements] = await Promise.all([getMyProfile(auth), listWeightHistory(1000, auth), listBodyMeasurements(1000, auth)]);
  const currentWeightKg = profile?.current_weight_kg ?? null;
  return {
    report: buildBodyProgressReport({ weightHistory, currentWeightKg, measurements, period: range,
      referencePeriod: { start: period.previousStart, end: period.previousEnd } }),
    available: new Set(bodyAvailableMetricDefinitions({ weightHistory, currentWeightKg, measurements }).map(metric => metric.key)),
  };
}

async function nutritionReport(context: Context, range: NutritionReportRange, period: ProgressPeriod, today: string) {
  const previousRange = { start: period.previousStart, end: period.previousEnd };
  // The SAME M4.3-2 snapshot, once per period; no SQL reimplementation.
  const [currentFacts, previousFacts] = await Promise.all([
    readMobileNutritionFacts(context, range, today), readMobileNutritionFacts(context, previousRange, today),
  ]);
  const days = buildNutritionReportDays({ range, today, ...currentFacts });
  const previousDays = buildNutritionReportDays({ range: previousRange, today, ...previousFacts });
  const comparison = buildProgressComparison({
    metrics: NUTRITION_PROGRESS_METRICS.filter(metric => metric.key !== "nutrition.calorie_target"),
    selectedMetricKeys: [...DEFAULT_NUTRITION_COMPARISON_METRICS],
    samplesByMetric: nutritionSamplesByMetric(days),
    referenceSamplesByMetric: nutritionSamplesByMetric(previousDays),
    primaryPeriod: range, primaryLabel: range.preset,
    reference: { type: "previous_period", period: previousRange, label: "Período anterior" },
    inProgressDate: range.end === today ? today : null,
  });
  return { summary: aggregateNutritionReport(days), comparison, days, previousDays };
}

async function metricsReport(context: Context, query: MobileProgressQuery, today: string, metricId?: string) {
  return getDailyMetricsReport({ period: query.period, from: query.from, to: query.to, metricId, ...(query.compare ? { previousRange: query.compare } : {}) }, today, webAuth(context));
}

const byKey = (report: ProgressComparisonReport | null | undefined, key: string) => report?.results.find(result => result.metric.key === key);

/** Buckets of a range at its natural granularity (same rule as the training timeline). */
const rangeBuckets = (range: { start: string; end: string }) => bucketProgressRange(range, progressBucketForDays(progressRangeDays(range)));
const sparkPoints = <T extends { date: string }>(range: { start: string; end: string }, items: readonly T[], value: (inBucket: T[]) => number | null): ProgressSparkPoint[] =>
  rangeBuckets(range).map(({ start, end }) => ({ start, end, value: value(items.filter(item => item.date >= start && item.date <= end)) }));
const mean = (values: number[]) => values.length ? values.reduce((t, v) => t + v, 0) / values.length : null;
/** Same days as the overview's average kcal: complete registered days with known calories. */
const kcalDays = (days: NutritionReportDay[]) => days.filter(day => day.hasNutrition && day.isComplete && day.calories !== null);

function overviewSparks(period: ProgressPeriod, comparing: boolean, sections: {
  body: Awaited<ReturnType<typeof bodyReport>> | null; nutrition: Awaited<ReturnType<typeof nutritionReport>> | null;
  training: Awaited<ReturnType<typeof loadTrainingContext>> | null;
}): ProgressOverviewSparks {
  const current = { start: period.start, end: period.end }, reference = { start: period.previousStart, end: period.previousEnd };
  const weightMetric = sections.body?.report.metrics.find(m => m.field === "weight_kg" && sections.body!.available.has(m.key));
  const lastWeight = (items: { value: number }[]) => items.length ? items[items.length - 1].value : null;
  const kcal = (days: NutritionReportDay[]) => mean(days.map(day => day.calories!));
  const timeline = (points: { start: string; end: string; sets: number }[]) => points.map(p => ({ start: p.start, end: p.end, value: p.sets }));
  return {
    weight: weightMetric ? {
      current: sparkPoints(current, weightMetric.current, lastWeight),
      reference: comparing ? sparkPoints(reference, weightMetric.reference, lastWeight) : null,
      first: weightMetric.current[0]?.value ?? null, last: lastWeight(weightMetric.current),
      referenceLast: comparing ? lastWeight(weightMetric.reference) : null,
    } : null,
    training: sections.training ? {
      current: timeline(sections.training.current.timeline), reference: comparing ? timeline(sections.training.reference.timeline) : null,
    } : null,
    nutrition: sections.nutrition ? {
      current: sparkPoints(current, kcalDays(sections.nutrition.days), kcal),
      reference: comparing ? sparkPoints(reference, kcalDays(sections.nutrition.previousDays), kcal) : null,
    } : null,
  };
}

export async function buildMobileProgressOverview(context: Context, query: MobileProgressQuery, today: string, withSparks = false, withInPeriod = false): Promise<ProgressOverview> {
  const { range, period } = resolveMobileProgressPeriod(query, today);
  const [body, nutrition, metrics, training] = await Promise.all([
    isolated(() => bodyReport(context, range, period), "body"),
    isolated(() => nutritionReport(context, range, period, today), "nutrition"),
    isolated(() => metricsReport(context, query, today), "metrics"),
    isolated(() => loadTrainingContext(webAuth(context), period, today), "training"),
  ]);
  const activity = metrics.status === "ok" && metrics.data.defaultComparison
    ? { definitions: metrics.data.definitions, comparison: metrics.data.defaultComparison } : null;
  const model = buildProgressHomeModel({
    period: { preset: range.preset, label: range.preset, current: range, previous: { start: period.previousStart, end: period.previousEnd },
      durationDays: period.days, bucket: period.bucket, includesInProgressDay: period.includesToday, error: null },
    training: training.status === "ok" ? training.data.general : null,
    nutrition: nutrition.status === "ok" ? nutrition.data : null,
    body: body.status === "ok" ? body.data.report : null,
    activity,
    relationships: [], // out of M7
  });
  const rows = (items: ProgressHomeRow[]) => items.flatMap(row => {
    const target = destination(row.href);
    return target ? [{ id: row.id, label: row.label, value: row.value, detail: row.detail, destination: target }] : [];
  });
  const habitKeys = model.habits.filter(row => row.id.startsWith("activity.daily.")).map(row => row.id);
  const definitions = new Map((activity?.definitions ?? []).map(definition => [definition.id, definition]));
  const overview: ProgressOverview = {
    today, period,
    evolution: rows(model.evolution),
    changes: model.changes.flatMap(insight => {
      const domain = domainOf(insight.domain), target = findingDestination(insight);
      return domain && target ? [{ id: insight.id, domain, label: insight.label, description: insight.description, destination: target }] : [];
    }),
    nutrition: nutrition.status === "ok" ? { status: "ok", data: {
      averageKcal: nutrition.data.summary.calories.averageConsumed, averageProteinG: nutrition.data.summary.protein.averageConsumed,
      averageTargetKcal: nutrition.data.summary.calories.averageTarget, averageTargetProteinG: nutrition.data.summary.protein.averageTarget,
      accumulatedBalanceKcal: nutrition.data.summary.energy.accumulatedBalance,
      registeredDays: nutrition.data.summary.registeredDays, completedDays: nutrition.data.summary.completedRegisteredDays, days: period.days,
      calories: comparisonDto(byKey(nutrition.data.comparison, "nutrition.calories")),
      protein: comparisonDto(byKey(nutrition.data.comparison, "nutrition.protein")),
      balance: comparisonDto(byKey(nutrition.data.comparison, "nutrition.energy_balance")),
    } } : { status: "unavailable" },
    // Same selection as Web "Tus hábitos" (active, with data, first 3), with structured values.
    metrics: activity ? { status: "ok", data: { items: habitKeys.flatMap(key => {
      const result = byKey(activity.comparison, key), id = key.slice("activity.daily.".length), definition = definitions.get(id);
      if (!result || !definition) return [];
      const coverage = result.primary.coverage;
      return [{ id, name: definition.name, unit: definition.unit, valueType: definition.value_type, average: result.valueA,
        coverage: { registered: coverage.registeredCount, eligible: coverage.eligibleCount, ratio: coverage.coverageRatio },
        comparison: comparisonDto(result) }];
    }) } } : { status: "unavailable" },
    body: body.status === "ok" ? { status: "ok", data: {
      excludedSuspect: body.data.report.excludedSuspectCount,
      trackedMetrics: body.data.report.metrics.filter(metric => body.data.available.has(metric.key) && metric.current.length > 0).length,
    } } : { status: "unavailable" },
    training: training.status === "ok" ? { status: "ok", data: trainingSummaryDto(training.data, period, comparisonDto) } : { status: "unavailable" },
  };
  if (withInPeriod) {
    const p = training.status === "ok" ? trainingInPeriodDto(training.data, period) : null;
    overview.inPeriod = p ? { improved: p.improved, comparable: p.improved + p.stable + p.declined } : null;
  }
  if (withSparks) overview.sparks = overviewSparks(period, !!query.compare, {
    body: body.status === "ok" ? body.data : null, nutrition: nutrition.status === "ok" ? nutrition.data : null,
    training: training.status === "ok" ? training.data : null,
  });
  return overview;
}

const observation = (o: BodyObservation | null): BodyObservationDto | null =>
  o && o.date ? { date: o.date, value: o.value, imported: o.provenance === "imported", provenanceLabel: o.provenanceLabel } : null;

export function bodyDto(report: BodyProgressReport, available: ReadonlySet<string>, today: string, period: ProgressPeriod): ProgressBody {
  const metrics = report.metrics.flatMap((metric): ProgressBodyMetric[] => {
    // Profile weight without a date is never a historical observation.
    const latest = observation(metric.latest);
    if (!available.has(metric.key) || !latest) return [];
    return [{
      key: metric.key, label: metric.label, unit: metric.unit, latest,
      first: observation(metric.first), last: observation(metric.last), change: metric.change, referenceChange: metric.referenceChange,
      trend: metric.trend, confidence: metric.confidence,
      observations: metric.current.flatMap(o => { const dto = observation(o); return dto ? [dto] : []; }),
      referenceCount: metric.reference.length,
      comparison: { status: metric.comparisonEligibility.status, reason: metric.comparisonEligibility.reason },
    }];
  });
  return { today, period, excludedSuspect: report.excludedSuspectCount, metrics };
}

export async function buildMobileProgressBody(context: Context, query: MobileProgressQuery, today: string): Promise<ProgressBody> {
  const { range, period } = resolveMobileProgressPeriod(query, today);
  const { report, available } = await bodyReport(context, range, period);
  return bodyDto(report, available, today, period);
}

export async function buildMobileProgressMetrics(context: Context, query: MobileProgressQuery, today: string, metricId: string | undefined): Promise<ProgressMetrics> {
  const { period } = resolveMobileProgressPeriod(query, today);
  const report = await metricsReport(context, query, today, metricId);
  const definitions: ProgressMetricDefinition[] = report.definitions.map(definition => ({
    id: definition.id, systemKey: definition.system_key, name: definition.name, unit: definition.unit, valueType: definition.value_type,
    isActive: definition.is_active, currentTarget: definition.target_value,
  }));
  const metric = report.metric ? definitions.find(definition => definition.id === report.metric!.id) ?? null : null;
  if (!metric || !report.summary || !report.comparison) {
    return { today, period, definitions, metric: null, summary: null, previous: null, comparison: null, series: [] };
  }
  const result = byKey(report.defaultComparison, `activity.daily.${metric.id}`);
  const s = report.summary, previous = report.comparison.previous;
  return {
    today, period, definitions, metric,
    summary: { average: s.average, median: s.median, minimum: s.minimum, maximum: s.maximum, registeredDays: s.registeredDays,
      eligibleDays: s.eligibleDays, coverageRatio: s.coverageRatio, trendDelta: s.trendDelta, trendPercentDelta: s.trendPercentDelta },
    previous: { average: previous.average, registeredDays: previous.registeredDays, eligibleDays: previous.eligibleDays },
    comparison: comparisonDto(result),
    series: (result?.primary.series ?? []).map(point => ({ start: point.start, end: point.end, value: point.value, samples: point.sampleSize })),
  };
}

export async function buildMobileProgressTraining(context: Context, query: MobileProgressQuery, today: string, withInPeriod = false) {
  const { period } = resolveMobileProgressPeriod(query, today);
  const ctx = await loadTrainingContext(webAuth(context), period, today);
  return { ...trainingDto(ctx, today, period, comparisonDto), ...(withInPeriod ? { inPeriod: trainingInPeriodDto(ctx, period) } : {}) };
}
export async function buildMobileProgressTrainingExercise(context: Context, query: MobileProgressQuery, today: string, exerciseId: string, withCharts = false) {
  const { period } = resolveMobileProgressPeriod(query, today);
  const dto = trainingExerciseDto(await loadTrainingContext(webAuth(context), period, today), exerciseId, today, period, comparisonDto, withCharts, !!query.compare);
  if (!dto) throw new MobileApiNotFoundError();
  return dto;
}

/** Shared GET handler: Bearer identity, canonical period, one bounded retry at Córdoba midnight. */
export async function progressReadResponse<T>(request: Request, label: string, build: (context: Context, params: URLSearchParams, today: string) => Promise<T>,
  parse: (v: unknown) => T | undefined) {
  let status = 503, body: unknown = { error: "DATA_UNAVAILABLE" };
  try {
    const context = await authenticateMobileAccessToken(mobileBearerToken(request.headers.get("authorization")));
    const params = new URL(request.url).searchParams;
    let today = todayInCordoba();
    let dto: T | undefined;
    for (let attempt = 0; attempt < 2 && dto === undefined; attempt++) {
      try { dto = await build(context, params, today); }
      catch (e) { if (e instanceof NutritionReportDayChangedError && attempt === 0) { today = e.today; continue; } throw e; }
    }
    // The DTO is validated against the shared contract before it leaves the server.
    if (dto === undefined || !parse(JSON.parse(JSON.stringify(dto)))) throw new Error("Invalid progress DTO");
    status = 200; body = dto;
  } catch (e) {
    if (e instanceof MobileApiUnauthorizedError) { status = 401; body = { error: "UNAUTHORIZED" }; }
    else if (e instanceof MobileApiValidationError) { status = 400; body = { error: "VALIDATION_ERROR", message: e.message }; }
    else if (e instanceof MobileApiNotFoundError) { status = 404; body = { error: "NOT_FOUND", message: "No hay registros de este ejercicio." }; }
    else console.warn(`[mobile.progress] ${label} unavailable`);
  }
  return NextResponse.json(body, { status, headers: mobileApiResponseHeaders(request) });
}

/** Additive Home read. Existing period presets and overview filtering remain unchanged. */
export async function buildMobileProgressHabitWeek(context: Context, today: string): Promise<ProgressHabitWeek> {
  const range = habitWeekRange(today);
  const report = await getDailyMetricsReport({ period: "custom", from: range.weekStart, to: today,
    previousRange: { start: range.previousWeekStart, end: range.previousWeekEnd } }, today, webAuth(context));
  // A read straddling Córdoba midnight is retried by the shared GET handler.
  const after = todayInCordoba();
  if (after !== today) throw new NutritionReportDayChangedError(after);
  const active = report.definitions.filter(definition => definition.is_active && definition.archived_at === null);
  const results = new Map(report.defaultComparison?.results.map(result => [result.metric.key, result]));
  return { today, ...range, items: active.map(definition => {
    const result = results.get(`activity.daily.${definition.id}`);
    if (!result) throw new Error("Incomplete habit week");
    const coverage = result.primary.coverage;
    return { id: definition.id, systemKey: definition.system_key, name: definition.name, unit: definition.unit,
      valueType: definition.value_type, average: result.valueA,
      coverage: { registered: coverage.registeredCount, eligible: coverage.eligibleCount, ratio: coverage.coverageRatio },
      comparison: comparisonDto(result) };
  }) };
}

export const progressHabitWeekResponse = (request: Request) => progressReadResponse(request, "habits.week", (context, params, today) => {
  if ([...params].length) throw new MobileApiValidationError("Parámetro no válido.");
  return buildMobileProgressHabitWeek(context, today);
}, parseProgressHabitWeek);

export const progressOverviewResponse = (request: Request) => progressReadResponse(request, "overview", (context, params, today) => {
  const spark = params.get("spark");
  if (spark !== null && spark !== "1") throw new MobileApiValidationError("Parámetro no válido.");
  const query = progressQueryFromParams(params, ["spark", "inPeriod"]);
  const inPeriod = params.get("inPeriod");
  if (inPeriod !== null && inPeriod !== "1") throw new MobileApiValidationError("Parámetro no válido.");
  return buildMobileProgressOverview(context, query, today, spark === "1", inPeriod === "1");
}, parseProgressOverview);
export const progressBodyResponse = (request: Request) => progressReadResponse(request, "body",
  (context, params, today) => buildMobileProgressBody(context, progressQueryFromParams(params), today), parseProgressBody);
export const progressMetricsResponse = (request: Request) => progressReadResponse(request, "metrics", (context, params, today) => {
  const metric = params.get("metric");
  if (metric !== null && !/^[0-9a-f-]{36}$/i.test(metric)) throw new MobileApiValidationError("Métrica no válida.");
  return buildMobileProgressMetrics(context, progressQueryFromParams(params, ["metric"]), today, metric ?? undefined);
}, parseProgressMetrics);
export const progressTrainingResponse = (request: Request) => progressReadResponse(request, "training",
  (context, params, today) => {
    const query = progressQueryFromParams(params, ["inPeriod"]), inPeriod = params.get("inPeriod");
    if (inPeriod !== null && inPeriod !== "1") throw new MobileApiValidationError("Parámetro no válido.");
    return buildMobileProgressTraining(context, query, today, inPeriod === "1");
  }, parseProgressTraining);
export const progressTrainingExerciseResponse = (request: Request, exerciseId: string) => progressReadResponse(request, "training.exercise", (context, params, today) => {
  if (!/^[0-9a-f-]{36}$/i.test(exerciseId)) throw new MobileApiValidationError("Ejercicio no válido.");
  const query = progressQueryFromParams(params, ["charts"]), charts = params.get("charts");
  if (charts !== null && charts !== "1") throw new MobileApiValidationError("Parámetro no válido.");
  return buildMobileProgressTrainingExercise(context, query, today, exerciseId.toLowerCase(), charts === "1");
}, parseProgressTrainingExercise);

export const progressNutritionTimingResponse = (request: Request) => progressReadResponse(request, "nutrition.timing", async (context, params, today): Promise<ProgressNutritionTiming> => {
  const query = progressQueryFromParams(params), { period } = resolveMobileProgressPeriod(query, today);
  const [current, reference] = await Promise.all([
    readNutritionTiming(context, { start: period.start, end: period.end }),
    query.compare ? readNutritionTiming(context, query.compare) : Promise.resolve(null),
  ]);
  const after = todayInCordoba();
  if (after !== today) throw new NutritionReportDayChangedError(after);
  return { today, period, current, reference };
}, parseProgressNutritionTiming);
