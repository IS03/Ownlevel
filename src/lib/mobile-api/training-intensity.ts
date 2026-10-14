/**
 * Person-relative training intensity for the history calendar (brand 5-step scale).
 * Level 0 = not trained (the day is simply absent). Levels 1–4 split the person's own
 * trained days of the recent window by completed sets (quartiles). With little history
 * a fixed scale avoids calling a normal day "low" just because there is nothing to compare.
 */
export const INTENSITY_WINDOW_DAYS = 84;
export const INTENSITY_MIN_DAYS = 8;
const FIXED_THRESHOLDS: [number, number, number] = [8, 16, 24];

function quantile(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))]!;
}
export function intensityThresholds(window: ReadonlyArray<{ completedSets: number }>): [number, number, number] | "flat" {
  if (window.length < INTENSITY_MIN_DAYS) return FIXED_THRESHOLDS;
  const sorted = window.map(day => day.completedSets).sort((left, right) => left - right);
  const thresholds: [number, number, number] = [quantile(sorted, 0.25), quantile(sorted, 0.5), quantile(sorted, 0.75)];
  // Every trained day alike: no day is "low" or "high", they all sit mid-scale.
  return thresholds[0] === thresholds[2] && sorted[0] === sorted.at(-1) ? "flat" : thresholds;
}
export function intensityLevel(completedSets: number, thresholds: [number, number, number] | "flat"): 1 | 2 | 3 | 4 {
  if (thresholds === "flat") return 2;
  return completedSets <= thresholds[0] ? 1 : completedSets <= thresholds[1] ? 2 : completedSets <= thresholds[2] ? 3 : 4;
}
export function isoDayShift(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}
export function monthRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  return { from: `${month}-01`, to: new Date(Date.UTC(year!, monthNumber!, 0)).toISOString().slice(0, 10) };
}
