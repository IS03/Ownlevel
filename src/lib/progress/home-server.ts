import "server-only";

import { listAllBodyMeasurements } from "@/lib/body-measurements";
import { getDailyMetricsReport } from "@/lib/daily-metrics/reports";
import { getNutritionReportWithProgressComparison } from "@/lib/nutrition/reports";
import { listAllWeightHistory } from "@/lib/phase1/day-log";
import { getMyProfile } from "@/lib/phase1/profile";
import { isTrainingAnalysisPeriod, type TrainingAnalysisPeriod } from "@/lib/phase2/training-analysis";
import { getTrainingGeneralAnalysis } from "@/lib/phase2/training-robust";
import { resolveProgressPeriod, type ProgressResolvedPeriod } from "@/lib/progress/analytics";
import { buildBodyProgressReport } from "@/lib/progress/body";
import type { ProgressComparisonQuery, ProgressTemporalComparisonReference } from "@/lib/progress/comparisons";
import { buildProgressHomeModel, progressHomePeriodQuery } from "@/lib/progress/home";
import { getHighlightedRelationshipsForUser } from "@/lib/progress/relationships/server";
import type { RequestPerformanceContext } from "@/lib/request-performance";
import { resilientRead, type ReadResult } from "@/lib/resilient-read";
import type { AuthenticatedRequestContext } from "@/lib/supabase/server";

export type ProgressHomeDomain =
  | "training"
  | "nutrition"
  | "activity"
  | "body"
  | "relationships";

const previousComparison: ProgressComparisonQuery = {
  referenceType: "previous_period",
  referencePreset: null,
  referenceFrom: null,
  referenceTo: null,
  selectedMetricKeys: [],
  activeMetricKey: null,
  initialView: "insights",
};

async function isolated<T>(
  operation: string,
  task: () => Promise<T>,
  requestPerformance?: RequestPerformanceContext,
): Promise<ReadResult<T>> {
  return resilientRead(
    {
      route: "/progress",
      operation,
      layer: "database",
      ...requestPerformance,
    },
    task,
  );
}

function trainingPeriod(period: ProgressResolvedPeriod): { preset: TrainingAnalysisPeriod; range?: { start: string; end: string } } {
  if (isTrainingAnalysisPeriod(period.preset)) return { preset: period.preset };
  return { preset: "custom", range: period.current };
}

export async function getProgressHomeData(
  input: { period?: string; from?: string; to?: string },
  today: string,
  auth: AuthenticatedRequestContext,
) {
  const period = resolveProgressPeriod({ preset: input.period ?? "4w", from: input.from, to: input.to }, today);
  const trainingInput = trainingPeriod(period);
  const trainingReference: ProgressTemporalComparisonReference = {
    type: "previous_period",
    period: period.previous,
    label: "Período anterior",
  };
  const nutritionPeriod = progressHomePeriodQuery("nutrition", period);
  const activityPeriod = progressHomePeriodQuery("activity", period);
  const relationshipPeriod = progressHomePeriodQuery("relationships", period);

  const [training, nutrition, activity, body, relationships] = await Promise.all([
    isolated("progress.training", () => getTrainingGeneralAnalysis(
      trainingInput.preset,
      trainingReference,
      {},
      trainingInput.range,
      auth,
    ), auth.requestPerformance),
    isolated("progress.nutrition", () => getNutritionReportWithProgressComparison({
      ...nutritionPeriod,
      comparison: previousComparison,
    }, today, auth), auth.requestPerformance),
    isolated("progress.activity-values", () => getDailyMetricsReport({
      ...activityPeriod,
      progressComparison: previousComparison,
    }, today, auth), auth.requestPerformance),
    isolated("progress.body", () => Promise.all([
      getMyProfile(auth),
      listAllWeightHistory(auth),
      listAllBodyMeasurements(auth),
    ]).then(([profile, weightHistory, measurements]) => buildBodyProgressReport({
      weightHistory,
      currentWeightKg: profile?.current_weight_kg ?? null,
      measurements,
      period: period.current,
      referencePeriod: period.previous,
    })), auth.requestPerformance),
    isolated(
      "progress.relationships",
      () => getHighlightedRelationshipsForUser(relationshipPeriod, today, auth),
      auth.requestPerformance,
    ),
  ]);
  const domainReads = { training, nutrition, activity, body, relationships };
  const unavailableDomains = (Object.keys(domainReads) as ProgressHomeDomain[])
    .filter((domain) => domainReads[domain].status === "unavailable");

  return {
    period,
    unavailableDomains,
    model: buildProgressHomeModel({
      period,
      training: training.status === "ok" ? training.data.general : null,
      nutrition: nutrition.status === "ok" && nutrition.data.progressComparison
        ? { summary: nutrition.data.summary, comparison: nutrition.data.progressComparison }
        : null,
      body: body.status === "ok" ? body.data : null,
      activity: activity.status === "ok" && activity.data.defaultComparison
        ? { definitions: activity.data.definitions, comparison: activity.data.defaultComparison }
        : null,
      relationships: relationships.status === "ok" ? relationships.data : [],
    }),
  };
}
