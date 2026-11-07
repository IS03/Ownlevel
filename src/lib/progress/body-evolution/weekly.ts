import { isNewBodyWeight } from "../../mobile-api/body-contract";

/**
 * #367 phase 3 (367-evolucion-corporal-metodo.md): the body weight week by week, described. Monday to Sunday in Córdoba logical
 * dates, whole weeks inside the period only, the week in progress left out. A week's median needs three valid weigh-ins, a product
 * rule and not a scientific guarantee. A change is only between two consecutive weeks that both have one. Nothing is interpolated.
 * Pure: the same code describes the screen and feeds the experimental analysis.
 */
export const BODY_WEEKLY_METHOD = "body-weekly/1" as const;
export const MIN_WEEKLY_WEIGH_INS = 3;
export type WeighIn = { date: string; value: number };
export type BodyWeek = { start: string; end: string; weighIns: WeighIn[]; median: number | null };
export type BodyWeekChange = { weekStart: string; previousStart: string; change: number | null; reason: "computed" | "week_insufficient" | "previous_week_insufficient" };
export type BodyWeekly = {
  methodVersion: typeof BODY_WEEKLY_METHOD; weeks: BodyWeek[]; changes: BodyWeekChange[];
  /** Weigh-ins of the period that are not in a listed week: the partial weeks at its edges and the week in progress, and invalid ones. */
  outside: { partialWeeks: number; currentWeek: number; invalid: number };
};

const DAY = 86_400_000;
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
/** Monday of the week of a logical date. */
export const mondayOf = (date: string) => shift(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
export function median(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
/** Two decimals, as weights are stored: a median of two can fall on a half hundredth. */
const kg = (value: number) => Math.round(value * 100) / 100;

export function weeklyWeights(observations: readonly WeighIn[], period: { start: string; end: string }, today: string): BodyWeekly {
  const outside = { partialWeeks: 0, currentWeek: 0, invalid: 0 };
  const current = mondayOf(today);
  // Whole weeks only: the first Monday on or after the start, through the last Sunday on or before the end and before this week.
  let first = mondayOf(period.start);
  if (first < period.start) first = shift(first, 7);
  const weeks: BodyWeek[] = [];
  for (let start = first; shift(start, 6) <= period.end && start < current; start = shift(start, 7)) weeks.push({ start, end: shift(start, 6), weighIns: [], median: null });
  const byStart = new Map(weeks.map(week => [week.start, week]));
  for (const row of [...observations].sort((a, b) => a.date.localeCompare(b.date))) {
    if (row.date < period.start || row.date > period.end) continue;
    if (!isNewBodyWeight(row.value)) { outside.invalid++; continue; }
    const week = byStart.get(mondayOf(row.date));
    if (week) week.weighIns.push({ date: row.date, value: row.value });
    else if (mondayOf(row.date) >= current) outside.currentWeek++;
    else outside.partialWeeks++;
  }
  for (const week of weeks) week.median = week.weighIns.length >= MIN_WEEKLY_WEIGH_INS ? kg(median(week.weighIns.map(row => row.value))) : null;
  const changes: BodyWeekChange[] = weeks.slice(1).map((week, index) => {
    const previous = weeks[index]!;
    const reason = week.median === null ? "week_insufficient" : previous.median === null ? "previous_week_insufficient" : "computed";
    return { weekStart: week.start, previousStart: previous.start, change: reason === "computed" ? kg(week.median! - previous.median!) : null, reason };
  });
  return { methodVersion: BODY_WEEKLY_METHOD, weeks, changes, outside };
}
