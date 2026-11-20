import type { ProgressBodyMetric } from '@/api/progress';
import type { NutritionStages } from '@/api/nutrition-stages';
import { mondayOf, weeklyWeights } from '../../../../src/lib/progress/body-evolution/weekly';
import { addDays, daysBetween, type DateRange } from './progress-range';

export const SHORT_BODY_INTERVAL_DAYS = 21;
export const bodyValid = (value: number) => Number.isFinite(value) && value > 0;
export const observationDates = (metrics: readonly ProgressBodyMetric[]) =>
  [...new Set(metrics.flatMap(m => m.observations.filter(o => bodyValid(o.value)).map(o => o.date)))].sort();

/**
 * The whole chosen period: the first and last dates of the circumference recorded over the widest span (ties: the most recent),
 * else the first and last valid weighings. Consecutive weighings only show day-to-day noise; the person can still pick any pair.
 */
export function defaultBodyPair(metrics: readonly ProgressBodyMetric[]) {
  const span = (dates: string[]) => dates.length > 1 ? { a: dates[0], b: dates.at(-1)!, days: daysBetween(dates[0], dates.at(-1)!) } : null;
  const best = metrics.filter(m => m.key !== 'body.weight').map(m => span(observationDates([m]))).filter(p => p !== null)
    .sort((x, y) => y.days - x.days || y.b.localeCompare(x.b))[0] ?? span(observationDates(metrics.filter(m => m.key === 'body.weight')));
  return best ? { a: best.a, b: best.b } : null;
}
/** Whether any circumference has two dates in the period: without it the comparison can only show weight. */
export const measuresComparable = (metrics: readonly ProgressBodyMetric[]) =>
  metrics.some(m => m.key !== 'body.weight' && observationDates([m]).length > 1);
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
