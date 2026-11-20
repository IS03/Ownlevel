import type { ProgressBodyMetric } from '@/api/progress';
import type { NutritionStages } from '@/api/nutrition-stages';
import { mondayOf, weeklyWeights } from '../../../../src/lib/progress/body-evolution/weekly';
import { addDays, daysBetween, type DateRange } from './progress-range';

export const SHORT_BODY_INTERVAL_DAYS = 21;
export const bodyValid = (value: number) => Number.isFinite(value) && value > 0;
export const observationDates = (metrics: readonly ProgressBodyMetric[]) =>
  [...new Set(metrics.flatMap(m => m.observations.filter(o => bodyValid(o.value)).map(o => o.date)))].sort();

/** Prefer the latest pair that shares an actual circumference, then actual weight dates. */
export function defaultBodyPair(metrics: readonly ProgressBodyMetric[]) {
  const candidates = metrics.filter(m => m.key !== 'body.weight').flatMap(m => {
    const dates = observationDates([m]);
    return dates.length > 1 ? [{ a: dates.at(-2)!, b: dates.at(-1)! }] : [];
  }).sort((x, y) => y.b.localeCompare(x.b) || y.a.localeCompare(x.a));
  if (candidates[0]) return candidates[0];
  const weights = observationDates(metrics.filter(m => m.key === 'body.weight'));
  return weights.length > 1 ? { a: weights.at(-2)!, b: weights.at(-1)! } : null;
}
export function bodyInterval(a: string, b: string) {
  if (!a || !b || a >= b) return null;
  const elapsed = daysBetween(a, b) - 1;
  const context = elapsed > 1 ? { start: addDays(a, 1), end: addDays(b, -1) } : null;
  return { elapsed, short: elapsed < SHORT_BODY_INTERVAL_DAYS, context };
}
export function equivalentPerWeek(change: number, elapsed: number) {
  return elapsed < SHORT_BODY_INTERVAL_DAYS ? null : change * 7 / elapsed;
}
export function bodyWeekRange(date: string): DateRange {
  const start = mondayOf(date);
  return { start, end: addDays(start, 6) };
}
export function bodyWeekReference(metric: ProgressBodyMetric | undefined, date: string, today: string) {
  const range = bodyWeekRange(date);
  return weeklyWeights(metric?.observations ?? [], range, today).weeks[0] ?? null;
}
/** Stage end dates are exclusive; never label an interval with only the currently active plan. */
export function intervalStages(list: NutritionStages, range: DateRange) {
  return [...list.past, ...(list.current ? [list.current] : [])]
    .filter(s => s.startsOn <= range.end && (!s.endsOn || s.endsOn > range.start))
    .map(s => ({ id: s.id, name: s.name, start: s.startsOn > range.start ? s.startsOn : range.start,
      end: s.endsOn && s.endsOn <= range.end ? addDays(s.endsOn, -1) : range.end }))
    .sort((a, b) => a.start.localeCompare(b.start));
}
