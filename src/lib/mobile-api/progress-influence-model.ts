import { addProgressIsoDays } from "../progress/analytics/periods";
import { influenceCutValue, type InfluenceDefinition, type InfluenceEvidence, type InfluenceResult } from "./progress-influence-contract";

export type InfluenceValues = ReadonlyMap<string, number | boolean>;
export function influenceDates(range: { start: string; end: string }): string[] {
  const dates: string[] = [];
  for (let d = range.start; d <= range.end; d = addProgressIsoDays(d, 1)) dates.push(d);
  return dates;
}
const average = (values: number[]) => values.reduce((mean, v, i) => mean + (v - mean) / (i + 1), 0);
function evidence(low: number[], high: number[]): InfluenceEvidence {
  const a = average(low), b = average(high);
  const variance = (xs: number[], mean: number) => xs.reduce((sum, x) => sum + (x - mean) ** 2 / (xs.length - 1), 0);
  const error = Math.sqrt(variance(low, a) / low.length + variance(high, b) / high.length);
  const t = error === 0 ? (a === b ? 0 : Infinity) : Math.abs(b - a) / error;
  // Welch's t with sample variances: clear ≥2.5 AND ≥30 pairs; moderate ≥1.5; otherwise low.
  // Constant equal groups are low; constant unequal groups have an infinite statistic. Never expose t or p.
  return t >= 2.5 && low.length + high.length >= 30 ? "clear" : t >= 1.5 ? "moderate" : "low";
}

/** Pure pairing and aggregation. Missing values are absent from the maps; a recorded zero remains a value. */
export function calculateInfluence(range: { start: string; end: string }, today: string, definition: InfluenceDefinition,
  split: InfluenceValues, outcome: InfluenceValues): InfluenceResult {
  const days = influenceDates(range);
  const pairs = days.flatMap(date => {
    const outcomeDate = addProgressIsoDays(date, definition.lag);
    const x = split.get(date), y = outcome.get(outcomeDate);
    return outcomeDate < today && x !== undefined && typeof y === "number" && Number.isFinite(y)
      && (typeof x === "boolean" || Number.isFinite(x)) ? [{ date, x: Number(x), y }] : [];
  });
  const ordered = pairs.map(p => p.x).sort((a, b) => a - b), mid = Math.floor(ordered.length / 2);
  const median = !ordered.length ? null : ordered.length % 2 ? ordered[mid] : ordered[mid - 1] / 2 + ordered[mid] / 2;
  const cut = definition.cut === "yes" ? null : definition.cut === "median" ? median : influenceCutValue(definition.cut)!;
  const high = pairs.filter(p => p.x >= (cut ?? 1)), low = pairs.filter(p => p.x < (cut ?? 1));
  const base = { pairs: pairs.length, cut, low: { days: low.map(p => p.date) }, high: { days: high.map(p => p.date) } };
  if (pairs.length < 14 || low.length < 5 || high.length < 5) {
    // Coverage is measured inside the chosen (unshifted) period. Ties report the outcome.
    const splitDays = days.filter(d => split.has(d)).length;
    const outcomeDays = days.filter(d => d < today && outcome.has(d)).length;
    return { ...base, status: "insufficient", needed: 14, perGroupNeeded: 5, missing: splitDays < outcomeDays ? "split" : "outcome" };
  }
  const lowValues = low.map(p => p.y), highValues = high.map(p => p.y);
  const a = average(lowValues), b = average(highValues), difference = b - a;
  return { ...base, status: "ok", low: { ...base.low, average: a }, high: { ...base.high, average: b },
    difference, differencePercent: a === 0 ? null : difference / a * 100, evidence: evidence(lowValues, highValues) };
}
