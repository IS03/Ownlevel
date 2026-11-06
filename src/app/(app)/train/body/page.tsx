import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";

import { BodyProgressPeriodSelector } from "@/components/body/body-progress-period-selector";
import { BodyProgressWorkspace } from "@/components/body/body-progress-workspace";
import { ComparisonConfigurator } from "@/components/progress/comparison-configurator";
import { listAllBodyMeasurements } from "@/lib/body-measurements";
import { getMyProfile } from "@/lib/phase1/profile";
import { listAllWeightHistory } from "@/lib/phase1/day-log";
import { todayInCordoba } from "@/lib/phase2/cordoba-date";
import { bodyAvailableMetricDefinitions } from "@/lib/progress/body";
import { getPreviousProgressPeriod, resolveProgressPeriod } from "@/lib/progress/analytics";
import { progressHomeHref } from "@/lib/progress/home";
import {
  parseProgressComparisonQuery,
  resolveProgressComparisonReference,
} from "@/lib/progress/comparisons";
import { getVerifiedRequestContext } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchValue = string | string[] | undefined;

export default async function BodyPage({ searchParams }: { searchParams: Promise<Record<string, SearchValue>> }) {
  const search = await searchParams;
  const today = todayInCordoba();
  const auth = await getVerifiedRequestContext();
  if (!auth) redirect("/login");
  const period = resolveProgressPeriod({
    preset: typeof search.period === "string" ? search.period : "4w",
    from: typeof search.from === "string" ? search.from : undefined,
    to: typeof search.to === "string" ? search.to : undefined,
  }, today);
  const [profile, weightHistory, measurements] = await Promise.all([
    getMyProfile(auth),
    listAllWeightHistory(auth),
    listAllBodyMeasurements(auth),
  ]);
  const availableMetrics = bodyAvailableMetricDefinitions({
    weightHistory,
    currentWeightKg: profile?.current_weight_kg ?? null,
    measurements,
  });
  const parsedComparison = parseProgressComparisonQuery(search);
  const comparisonQuery = {
    ...parsedComparison,
    referenceType: parsedComparison.referenceType === "goal"
      ? "previous_period" as const
      : parsedComparison.referenceType ?? "previous_period" as const,
  };
  const resolvedReference = resolveProgressComparisonReference({
    query: comparisonQuery,
    primaryPeriod: period.current,
    today,
  });
  const referencePeriod = resolvedReference?.reference.type === "goal"
    ? getPreviousProgressPeriod(period.current)
    : resolvedReference?.reference.period ?? getPreviousProgressPeriod(period.current);
  const referenceLabel = resolvedReference?.reference.type === "other_period" ? "vs. otro período" : "vs.";
  const validSelected = comparisonQuery.selectedMetricKeys.filter((key) => availableMetrics.some((metric) => metric.key === key));
  const selectedMetricKeys = validSelected.length ? validSelected : ["body.weight", "body.waist"].filter((key) => availableMetrics.some((metric) => metric.key === key));
  const activeMetricKey = availableMetrics.some((metric) => metric.key === comparisonQuery.activeMetricKey)
    ? comparisonQuery.activeMetricKey
    : selectedMetricKeys[0] ?? null;
  const homeHref = progressHomeHref({ preset: period.preset, start: period.current.start, end: period.current.end });

  return <div className="space-y-7 pb-16 lg:pb-0">
    <header className="space-y-4">
      <Link href={homeHref} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline"><ArrowLeft className="size-4" aria-hidden /> Progreso</Link>
      <div><h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">Progreso corporal</h1><p className="mt-1 text-sm text-muted-foreground">Estado, cambios y tendencia a partir de mediciones reales.</p></div>
      <BodyProgressPeriodSelector period={period} reference={referencePeriod} referenceLabel={referenceLabel} today={today} />
      {period.error ? <p className="text-sm text-destructive" role="alert">{period.error}</p> : null}
      {resolvedReference?.error ? <p className="text-sm text-destructive" role="alert">{resolvedReference.error}</p> : null}
      {availableMetrics.length ? <ComparisonConfigurator
        metrics={availableMetrics.map((metric) => ({ key: metric.key, label: metric.label, supportsGoal: false }))}
        primaryPeriod={period.current}
        today={today}
        selectedMetricKeys={selectedMetricKeys}
        referenceType={comparisonQuery.referenceType}
        referencePreset={comparisonQuery.referencePreset}
        referencePeriod={referencePeriod}
        initialView="insights"
        activeMetricKey={activeMetricKey}
        showViewSelection={false}
        triggerLabel="Comparar"
        triggerClassName="mt-0"
      /> : null}
    </header>
    <BodyProgressWorkspace
      key={`${period.current.start}:${period.current.end}:${referencePeriod.start}:${referencePeriod.end}:${activeMetricKey ?? "none"}`}
      initialWeightHistory={weightHistory}
      initialCurrentWeightKg={profile?.current_weight_kg ?? null}
      initialMeasurements={measurements}
      period={period.current}
      referencePeriod={referencePeriod}
      referenceLabel={referenceLabel}
      initialMetricKey={activeMetricKey}
      selectedMetricKeys={selectedMetricKeys}
      today={today}
    />
  </div>;
}
