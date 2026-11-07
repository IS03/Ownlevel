import type { PartialCounts } from "../performance-insights/partial";
import type { PerformanceCounts } from "../performance-insights/types";
import { weeklyWeights, type BodyWeekly, type WeighIn } from "../body-evolution/weekly";
import { median } from "../body-evolution/weekly";
import type { ExposureContext } from "./exposures";
import { describeFeelingOutcome, FEELING_OUTCOME_KINDS } from "./feeling-outcomes";
import type { DayFact, FeelingOutcomeSummary, InsightsSource, PartialDayFact } from "./types";

/**
 * #367 phase 4: the last three whole calendar months, by the Córdoba date. Fixed by the date alone, never by what the months hold;
 * the month in progress is never one of them.
 */
export const PERIOD_MONTHS = 3;
export const PERIOD_METHOD = "insights-period/1" as const;
export type InsightsPeriod = { start: string; end: string; months: string[]; days: number };
export function periodOf(today: string, months = PERIOD_MONTHS): InsightsPeriod {
  const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const first = new Date(Date.UTC(year, month - 1 - months, 1)), last = new Date(Date.UTC(year, month - 1, 0));
  const list = Array.from({ length: months }, (_, index) => new Date(Date.UTC(year, month - 1 - months + index, 1)).toISOString().slice(0, 7));
  const start = first.toISOString().slice(0, 10), end = last.toISOString().slice(0, 10);
  return { start, end, months: list, days: Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1 };
}
const within = (date: string | null | undefined, period: Pick<InsightsPeriod, "start" | "end">) => !!date && date >= period.start && date <= period.end;

type Nutrient = "calories" | "proteinG" | "carbsG" | "fatG";
/** Recorded, never intake: per nutrient, the total of the days where every meal has it, and how many days had a meal without it. */
export type PeriodNutrition = { daysWithMeals: number; nutrients: Record<Nutrient, { knownDays: number; partialDays: number; recorded: number; dailyMedian: number | null }> };
function periodNutrition(context: Pick<ExposureContext, "nutritionByDate">, period: InsightsPeriod): PeriodNutrition {
  const days = [...context.nutritionByDate].filter(([date]) => within(date, period)).map(([, day]) => day);
  const nutrients = Object.fromEntries((["calories", "proteinG", "carbsG", "fatG"] as const).map(key => {
    const known = days.filter(day => day[key].missing === 0).map(day => day[key].recorded);
    return [key, { knownDays: known.length, partialDays: days.length - known.length, recorded: Math.round(known.reduce((sum, value) => sum + value, 0) * 10) / 10,
      dailyMedian: known.length ? Math.round(median(known) * 10) / 10 : null }];
  })) as PeriodNutrition["nutrients"];
  return { daysWithMeals: days.length, nutrients };
}

/** What the snapshot keeps for the period: computed with the same functions as the rest, only for these dates. */
export type PeriodFacts = { period: InsightsPeriod; feelings: FeelingOutcomeSummary[]; nutrition: PeriodNutrition };
export function periodFacts(source: InsightsSource, context: ExposureContext, today: string): PeriodFacts {
  const period = periodOf(today);
  const sessions = source.sessions.filter(session => within(session.date, period));
  // The same description as `view=feelings`, over the sessions of the period. The prior answer's timing comes from the whole context.
  const feelings = FEELING_OUTCOME_KINDS.map(kind => describeFeelingOutcome({ ...source, sessions }, kind, context, today));
  return { period, feelings, nutrition: periodNutrition(context, period) };
}

const emptyCounts = (): PerformanceCounts => ({ improved: 0, observedStable: 0, declined: 0, ambiguous: 0, insufficient: 0, total: 0, comparable: 0, coverage: null });
const emptyPartial = (): PartialCounts => ({ higher: 0, same: 0, lower: 0, ambiguous: 0, insufficient: 0, total: 0, comparable: 0, coverage: null });
/** Sums the counts of the days, and recomputes the coverage from the sums: a mean of daily coverages would weigh days, not exposures. */
function sum<T extends { total: number; comparable: number; coverage: number | null }>(rows: readonly T[], empty: () => T): T {
  const total = empty();
  for (const row of rows) for (const key of Object.keys(total) as (keyof T)[]) if (key !== "coverage") (total[key] as number) += row[key] as number;
  total.coverage = total.total ? total.comparable / total.total : null;
  return total;
}

/**
 * Routines as recorded, in the order of their first session. A sequence only when one ended before the next began: alternating
 * routines are listed as such, never turned into a succession.
 */
export type PeriodRoutines = { items: { routineId: string | null; name: string | null; sessions: number; first: string; last: string }[]; order: "none" | "single" | "sequence" | "alternating" };
function periodRoutines(days: readonly DayFact[]): PeriodRoutines {
  const byId = new Map<string, PeriodRoutines["items"][number]>();
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) for (const session of day.sessions) {
    const key = session.routineId ?? "free";
    const row = byId.get(key) ?? { routineId: session.routineId, name: session.routineName, sessions: 0, first: day.date, last: day.date };
    row.sessions++; row.last = day.date; row.name = row.name ?? session.routineName;
    byId.set(key, row);
  }
  const items = [...byId.values()].sort((a, b) => a.first.localeCompare(b.first) || a.last.localeCompare(b.last));
  const order = !items.length ? "none" : items.length === 1 ? "single" : items.every((row, index) => index === 0 || items[index - 1]!.last < row.first) ? "sequence" : "alternating";
  return { items, order };
}

export type PeriodTraining = { sessions: number; trainingDays: number; multipleSessionDays: number; strict: PerformanceCounts; partial: PartialCounts };
export type PeriodSummaryBody = {
  view: "period"; periodMethodVersion: typeof PERIOD_METHOD; period: InsightsPeriod;
  training: PeriodTraining; routines: PeriodRoutines; feelings: FeelingOutcomeSummary[]; nutrition: PeriodNutrition;
  /** Every valid weigh-in of the period, trained or not, read for it: never the weights carried by sessions. */
  weight: BodyWeekly & { weighIns: number };
  /** No association is computed for the period: the published relations stay where they are, over the whole history. */
  associations: { status: "not_computed_for_period" };
};
/** The period's facts, from the snapshot and the period's weigh-ins. Facts only: no pattern is looked for inside the three months. */
export function periodSummary(snapshot: { days: readonly DayFact[]; partialDays: readonly PartialDayFact[]; periodFacts: PeriodFacts; today: string }, weights: readonly WeighIn[]): PeriodSummaryBody {
  const { period } = snapshot.periodFacts;
  const days = snapshot.days.filter(day => within(day.date, period)), partialDays = snapshot.partialDays.filter(day => within(day.date, period));
  const strict = sum(days.map(day => day.counts), emptyCounts), partial = sum(partialDays.map(day => day.counts), emptyPartial);
  const periodWeights = weights.filter(row => within(row.date, period));
  const weekly = weeklyWeights(periodWeights, period, snapshot.today);
  return { view: "period", periodMethodVersion: PERIOD_METHOD, period,
    training: { sessions: days.reduce((sum, day) => sum + day.sessions.length, 0), trainingDays: days.length, multipleSessionDays: days.filter(day => day.sessions.length > 1).length, strict, partial },
    routines: periodRoutines(days), feelings: snapshot.periodFacts.feelings, nutrition: snapshot.periodFacts.nutrition,
    weight: { ...weekly, weighIns: weekly.weeks.reduce((sum, week) => sum + week.weighIns.length, 0) + weekly.outside.partialWeeks },
    associations: { status: "not_computed_for_period" } };
}
