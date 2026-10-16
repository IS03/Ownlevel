import "server-only";
import { listWeightHistory } from "@/lib/phase1/day-log";
import { loadCompletedTrainingData } from "@/lib/phase2/training-robust";
import { trainingLoadSamples } from "@/lib/progress/training-performance";
import { buildNutritionReportDays, type NutritionReportDay } from "@/lib/nutrition/reports-core";
import { parseNutritionStages, stageKinds, type NutritionStage, type NutritionStages, type StageKind } from "./nutrition-stages-contract";
import { NutritionReportDayChangedError, readMobileNutritionFacts } from "./nutrition-report-server";
import { webAuth } from "./progress-sources";
import { PROGRESS_STAGES_MAX, type ProgressStages, type ProgressStageSummary } from "./progress-stages-contract";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";

type Context = MobileSupabaseAuthenticatedContext;
const DAY = 86_400_000;
const epoch = (d: string) => Date.parse(`${d}T12:00:00Z`);
const addDays = (d: string, n: number) => new Date(epoch(d) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((epoch(b) - epoch(a)) / DAY);
const mean = (xs: number[]) => xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null;
const round = (v: number | null, digits: number) => v === null ? null : Math.round(v * 10 ** digits) / 10 ** digits;
const MAX_WINDOW_DAYS = 366;

/** Days actually measured for a stage: from its start to the day before the next one, never after today. */
export function stageWindow(stage: Pick<NutritionStage, "startsOn" | "endsOn">, today: string) {
  const last = stage.endsOn ? addDays(stage.endsOn, -1) : today;
  const end = last < today ? last : today;
  const start = daysBetween(stage.startsOn, end) + 1 > MAX_WINDOW_DAYS ? addDays(end, -(MAX_WINDOW_DAYS - 1)) : stage.startsOn;
  return { start, end };
}

/** Least-squares slope of the weigh-ins, kg per week. Needs 3 weigh-ins spanning at least 10 days. */
export function weightPerWeek(points: { date: string; value: number }[]): number | null {
  if (points.length < 3 || daysBetween(points[0].date, points[points.length - 1].date) < 10) return null;
  const xs = points.map(p => daysBetween(points[0].date, p.date)), ys = points.map(p => p.value);
  const mx = mean(xs)!, my = mean(ys)!;
  const den = xs.reduce((t, x) => t + (x - mx) ** 2, 0);
  return den === 0 ? null : xs.reduce((t, x, i) => t + (x - mx) * (ys[i] - my), 0) / den * 7;
}

/** Same days as Progreso's average kcal: complete registered days with known calories. */
const completeDays = (days: NutritionReportDay[]) => days.filter(d => d.hasNutrition && d.isComplete && d.calories !== null);

/** What a summary needs from a stage; plans from before the stages model carry no weekdays. */
export type StageLike = Pick<NutritionStage, "id" | "name" | "kind" | "startsOn" | "endsOn" | "status" | "weekdays">;

export function summarizeStage(stage: StageLike, today: string, input: {
  days: NutritionReportDay[] | null; weights: { date: string; value: number }[] | null; trainedDates: string[] | null;
}): ProgressStageSummary {
  const window = stageWindow(stage, today), elapsedDays = daysBetween(window.start, window.end) + 1;
  const inWindow = (d: string) => d >= window.start && d <= window.end;
  const targets = stage.weekdays.map(w => w.calorieTargetKcal).filter(Number.isFinite);
  const proteinTargets = stage.weekdays.map(w => w.proteinTargetG).filter(Number.isFinite);
  const complete = input.days ? completeDays(input.days) : [];
  const weights = (input.weights ?? []).filter(p => inWindow(p.date));
  const trained = new Set((input.trainedDates ?? []).filter(inWindow));
  return {
    id: stage.id, name: stage.name, kind: stage.kind, status: stage.status === "current" ? "current" : "past",
    startsOn: stage.startsOn, endsOn: stage.endsOn, window, elapsedDays,
    plannedDays: stage.endsOn ? daysBetween(stage.startsOn, stage.endsOn) : null,
    // The stage's own plan; for an earlier plan without weekdays, the targets its days actually applied.
    targetKcal: round(targets.length ? mean(targets) : mean((input.days ?? []).flatMap(d => d.targetCalories === null ? [] : [d.targetCalories])), 0),
    targetProteinG: round(proteinTargets.length ? mean(proteinTargets) : mean((input.days ?? []).flatMap(d => d.targetProteinG === null ? [] : [d.targetProteinG])), 0),
    eatenKcal: round(mean(complete.map(d => d.calories!)), 0),
    eatenProteinG: round(mean(complete.filter(d => d.proteinG !== null).map(d => d.proteinG!)), 0),
    daysWithMeals: input.days ? input.days.filter(d => d.hasNutrition).length : 0,
    weightPerWeekKg: input.weights ? round(weightPerWeek(weights), 2) : null, weighIns: weights.length,
    trainingDaysPerWeek: input.trainedDates && elapsedDays >= 7 ? round(trained.size / elapsedDays * 7, 1) : null,
    trainingDays: trained.size,
  };
}

async function settle<T>(task: () => Promise<T>, label: string): Promise<T | null> {
  try { return await task(); } catch (e) {
    if (e instanceof NutritionReportDayChangedError) throw e; // the shared handler retries once at midnight
    console.warn(`[mobile.progress.stages] ${label} unavailable`);
    return null;
  }
}

type LegacyPlan = { id: string; name: string | null; effective_from: string; goal_type: string | null };
/**
 * Plans saved before the stages model (nutrition_goal_periods), read-only and only for the dates before the first
 * stage, so history before the first stage is not lost. Each lasts until the next plan or the first stage.
 */
export function legacyStages(plans: LegacyPlan[], list: NutritionStages, today: string): StageLike[] {
  const all = [...list.past, ...(list.current ? [list.current] : []), ...list.upcoming];
  const firstStage = all.reduce<string | null>((min, s) => (min === null || s.startsOn < min ? s.startsOn : min), null);
  const before = plans.filter(p => p.effective_from <= today && (firstStage === null || p.effective_from < firstStage))
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  return before.map((p, i): StageLike => {
    const endsOn = before[i + 1]?.effective_from ?? firstStage;
    return {
      id: p.id, name: p.name?.trim() || "Plan anterior", kind: stageKinds.includes(p.goal_type as StageKind) ? p.goal_type as StageKind : null,
      startsOn: p.effective_from, endsOn, weekdays: [], status: endsOn === null || endsOn > today ? "current" : "past",
    };
  }).reverse();
}

/** GET /progress/stages: the current stage and up to 12 past ones, each measured with Progreso's own sources. */
export async function buildMobileProgressStages(context: Context, today: string): Promise<ProgressStages> {
  const { data, error } = await context.supabase.rpc("mobile_read_nutrition_stages", {}, { get: true });
  const list = error ? undefined : parseNutritionStages(data);
  if (!list) throw new Error("Stages unavailable");
  const legacy = await context.supabase.from("nutrition_goal_periods").select("id,name,effective_from,goal_type").order("effective_from");
  if (legacy.error) throw new Error("Earlier plans unavailable");
  const stages: StageLike[] = [...(list.current ? [list.current] : []), ...list.past, ...legacyStages(legacy.data as LegacyPlan[], list, today)]
    .filter(s => s.startsOn <= today).slice(0, PROGRESS_STAGES_MAX);
  const auth = webAuth(context);
  const [nutrition, weights, trainedDates] = await Promise.all([
    settle(() => Promise.all(stages.map(async stage => {
      const range = stageWindow(stage, today);
      return buildNutritionReportDays({ range, today, ...await readMobileNutritionFacts(context, range, today) });
    })), "nutrition"),
    settle(async () => (await listWeightHistory(1000, auth)).filter(p => Number.isFinite(p.weight_kg))
      .map(p => ({ date: p.log_date, value: p.weight_kg })).sort((a, b) => a.date.localeCompare(b.date)), "body"),
    settle(async () => [...new Set((trainingLoadSamples(await loadCompletedTrainingData(auth)).get("training.load.sessions") ?? [])
      .map(s => s.date))], "training"),
  ]);
  return {
    today,
    stages: stages.map((stage, i) => summarizeStage(stage, today, { days: nutrition?.[i] ?? null, weights, trainedDates })),
    hasUpcoming: list.upcoming.length > 0,
    sources: { nutrition: nutrition ? "ok" : "unavailable", body: weights ? "ok" : "unavailable", training: trainedDates ? "ok" : "unavailable" },
  };
}
