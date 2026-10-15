import "server-only";
import { listBodyMeasurements } from "@/lib/body-measurements";
import { listWeightHistory } from "@/lib/phase1/day-log";
import { getMyProfile } from "@/lib/phase1/profile";
import { bodyAvailableMetricDefinitions, buildBodyProgressReport } from "@/lib/progress/body";
import type { ProgressComparisonMetricResult } from "@/lib/progress/comparisons";
import type { NutritionReportRange } from "@/lib/nutrition/reports-core";
import type { AuthenticatedRequestContext } from "@/lib/supabase/server";
import type { RequestPerformanceContext } from "@/lib/request-performance";
import type { ProgressComparison, ProgressPeriod } from "./progress-contract";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";

/** Shared Progress sources (overview, sections and explore): token-derived identity, engine DTOs and the body read. */
type Context = MobileSupabaseAuthenticatedContext;
export const webAuth = (context: Context, requestPerformance?: RequestPerformanceContext): AuthenticatedRequestContext =>
  ({ supabase: context.supabase as AuthenticatedRequestContext["supabase"], userId: context.userId, requestPerformance });

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

export async function bodyReport(context: Context, range: NutritionReportRange, period: ProgressPeriod) {
  const auth = webAuth(context);
  const [profile, weightHistory, measurements] = await Promise.all([getMyProfile(auth), listWeightHistory(1000, auth), listBodyMeasurements(1000, auth)]);
  const currentWeightKg = profile?.current_weight_kg ?? null;
  return {
    report: buildBodyProgressReport({ weightHistory, currentWeightKg, measurements, period: range,
      referencePeriod: { start: period.previousStart, end: period.previousEnd } }),
    available: new Set(bodyAvailableMetricDefinitions({ weightHistory, currentWeightKg, measurements }).map(metric => metric.key)),
  };
}

