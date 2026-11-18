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

/**
 * «Fuerza frente a lo tuyo» per day: the mean of that day's sessions with their own value (view=own's rule: two exercises against
 * their previous five times). A day without such a session has no value, never a zero.
 */
export function strengthByDate(own: readonly { date: string; pct: number | null }[], range: { start: string; end: string }): Map<string, number> {
  const byDate = new Map<string, number[]>();
  for (const session of own) if (session.pct !== null && session.date >= range.start && session.date <= range.end) {
    const values = byDate.get(session.date); if (values) values.push(session.pct); else byDate.set(session.date, [session.pct]);
  }
  return new Map([...byDate].map(([date, values]) => [date, average(values)]));
}

const medianOf = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1; return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2; };
/**
 * «Cambio de peso en 7 días» for day D: the median weight of D+1…D+7 minus the median of D−6…D, with two weigh-ins on each side.
 * Only when the seven days after are closed (before today): an open week is not a change yet. Fewer weigh-ins: no value.
 */
export function weightChangeByDate(weights: readonly { date: string; weight: number }[], range: { start: string; end: string }, today: string): Map<string, number> {
  const byDate = new Map(weights.filter(row => Number.isFinite(row.weight) && row.weight > 0).map(row => [row.date, row.weight]));
  const values = new Map<string, number>();
  for (const date of influenceDates(range)) {
    if (addProgressIsoDays(date, 7) >= today) continue;
    const before = influenceDates({ start: addProgressIsoDays(date, -6), end: date }).flatMap(d => byDate.has(d) ? [byDate.get(d)!] : []);
    const after = influenceDates({ start: addProgressIsoDays(date, 1), end: addProgressIsoDays(date, 7) }).flatMap(d => byDate.has(d) ? [byDate.get(d)!] : []);
    if (before.length >= 2 && after.length >= 2) values.set(date, Math.round((medianOf(after) - medianOf(before)) * 100) / 100);
  }
  return values;
}
