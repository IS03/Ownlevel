const epoch = (date: string) => Date.parse(`${date}T12:00:00Z`);
export const weightDaysBetween = (a: string, b: string) => Math.round((epoch(b) - epoch(a)) / 86_400_000);
const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;

/** Stages' least-squares slope, kg/week: 3 weigh-ins spanning 10+ days.
 * Input is chronological, with at most one observation per date.
 */
export function weightPerWeek(points: { date: string; value: number }[]): number | null {
  if (points.length < 3 || weightDaysBetween(points[0].date, points[points.length - 1].date) < 10) return null;
  const xs = points.map(p => weightDaysBetween(points[0].date, p.date)), ys = points.map(p => p.value);
  const mx = mean(xs), my = mean(ys);
  const den = xs.reduce((total, x) => total + (x - mx) ** 2, 0);
  return den === 0 ? null : xs.reduce((total, x, i) => total + (x - mx) * (ys[i] - my), 0) / den * 7;
}

/** Evaluate the same fitted line rather than substituting the last raw weigh-in. */
export function weightTrendAt(points: { date: string; value: number }[], date: string): number | null {
  const slope = weightPerWeek(points);
  if (slope === null) return null;
  const mx = mean(points.map(p => weightDaysBetween(points[0].date, p.date)));
  return mean(points.map(p => p.value)) + slope / 7 * (weightDaysBetween(points[0].date, date) - mx);
}
