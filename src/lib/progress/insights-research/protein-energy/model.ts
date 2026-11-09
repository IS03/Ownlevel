import { POLICY } from "./policy";
import type { Features } from "./preparation";

export type Labeled = Features & { y: number };
export type Encoder = { anchor: string; routines: string[]; proteinMean: number; proteinSd: number };
export type Model = { weights: number[][]; initialObjective: number; finalObjective: number; gradientNorm: number; iterations: number; step: number };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
export function encoderFor(rows: Labeled[], anchor: string): Encoder {
  const logs = rows.map(row => Math.log1p(row.protein)), proteinMean = mean(logs);
  return { anchor, routines: [...new Set(rows.map(row => row.routine))].sort(), proteinMean,
    proteinSd: Math.sqrt(mean(logs.map(x => (x - proteinMean) ** 2))) };
}
export function encode(row: Features, encoder: Encoder, extended: boolean): number[] {
  const hour = row.hour / 24 * 2 * Math.PI, weekday = row.weekday / 7 * 2 * Math.PI;
  const xs = [1, ...[2, 3, 4, 5].map(value => Number(row.pre === value)), ...encoder.routines.slice(1).map(routine => Number(row.routine === routine)),
    Math.sin(hour), Math.cos(hour), Math.sin(weekday), Math.cos(weekday), (Date.parse(row.date) - Date.parse(encoder.anchor)) / 86_400_000 / 1096];
  if (extended) xs.push(Math.max(-POLICY.proteinClip, Math.min(POLICY.proteinClip, (Math.log1p(row.protein) - encoder.proteinMean) / encoder.proteinSd)));
  return xs;
}
export function probabilities(weights: number[][], x: number[]): number[] {
  const logits = weights.map(w => w.reduce((sum, value, j) => sum + value * x[j], 0));
  const max = Math.max(...logits), values = logits.map(value => Math.exp(value - max)), sum = values.reduce((a, b) => a + b, 0);
  const p = values.map(value => value / sum);
  if (p.length !== 5 || p.some(value => !Number.isFinite(value) || value < 0 || value > 1) || Math.abs(p.reduce((a, b) => a + b, 0) - 1) > 1e-10) throw new Error("Invalid probability vector");
  return p;
}
/** Fixed full-batch softmax fit. No random optimizer, tuning, validation reuse or optional stopping. */
export function fit(xs: number[][], ys: number[]): Model {
  if (!xs.length || xs.length !== ys.length || xs.some(x => x.length !== xs[0].length || x.some(v => !Number.isFinite(v))) || ys.some(y => !Number.isInteger(y) || y < 1 || y > 5)) throw new Error("Invalid fit data");
  const intercepts = [1, 2, 3, 4, 5].map(y => Math.log((ys.filter(value => value === y).length + 0.5) / (ys.length + 2.5)));
  const center = mean(intercepts), weights = intercepts.map(b => [b - center, ...xs[0].slice(1).map(() => 0)]);
  const step = 1 / (0.5 * Math.max(...xs.map(x => x.reduce((sum, v) => sum + v * v, 0))) + POLICY.ridge);
  const objective = () => xs.reduce((sum, x, i) => sum - Math.log(Math.max(Number.MIN_VALUE, probabilities(weights, x)[ys[i] - 1])), 0) / xs.length
    + POLICY.ridge / 2 * weights.reduce((sum, w) => sum + w.slice(1).reduce((s, v) => s + v * v, 0), 0);
  const initialObjective = objective();
  let gradientNorm = 0;
  for (let iteration = 0; iteration < POLICY.iterations; iteration++) {
    const gradient = weights.map(w => w.map(() => 0));
    for (let i = 0; i < xs.length; i++) {
      const p = probabilities(weights, xs[i]);
      for (let k = 0; k < 5; k++) {
        const error = (p[k] - Number(ys[i] === k + 1)) / xs.length;
        for (let j = 0; j < xs[i].length; j++) gradient[k][j] += error * xs[i][j];
      }
    }
    for (let k = 0; k < 5; k++) for (let j = 1; j < xs[0].length; j++) gradient[k][j] += POLICY.ridge * weights[k][j];
    gradientNorm = Math.sqrt(gradient.flat().reduce((sum, v) => sum + v * v, 0));
    for (let k = 0; k < 5; k++) for (let j = 0; j < xs[0].length; j++) weights[k][j] -= step * gradient[k][j];
  }
  const finalObjective = objective();
  if (!Number.isFinite(finalObjective) || finalObjective > initialObjective + 1e-9) throw new Error("Fit objective failed numerical guard");
  return { weights, initialObjective, finalObjective, gradientNorm, iterations: POLICY.iterations, step };
}
/** Ordered proper loss. Outcome positions are categories, never averaged into an energy score. */
export function rankedProbabilityScore(p: number[], y: number): number {
  if (p.length !== 5 || p.some(v => !Number.isFinite(v) || v < 0 || v > 1) || Math.abs(p.reduce((a, b) => a + b, 0) - 1) > 1e-10 || !Number.isInteger(y) || y < 1 || y > 5) throw new Error("Invalid score data");
  let cumulative = 0, loss = 0;
  for (let k = 0; k < 4; k++) { cumulative += p[k]; loss += (cumulative - Number(y <= k + 1)) ** 2; }
  return loss;
}
export function contextKey(row: Features): string { return JSON.stringify([row.routine, row.pre, Math.floor(row.hour / 6)]); }
export type Support = Map<string, { n: number; distinct: number; logSd: number; min: number; max: number }>;
export function supportFor(rows: Labeled[]): Support {
  const cells = new Map<string, number[]>();
  for (const row of rows) { const key = contextKey(row); const values = cells.get(key) ?? []; values.push(row.protein); cells.set(key, values); }
  return new Map([...cells].map(([key, values]) => {
    const logs = values.map(v => Math.log1p(v)), center = mean(logs);
    return [key, { n: values.length, distinct: new Set(values).size, logSd: Math.sqrt(mean(logs.map(v => (v - center) ** 2))), min: Math.min(...values), max: Math.max(...values) }];
  }));
}
export function supportReason(row: Features, support: Support): string | null {
  const cell = support.get(contextKey(row));
  if (!cell) return "new_context";
  if (cell.n < POLICY.minContextRows) return "sparse_context";
  if (cell.distinct < POLICY.minDistinctProtein || cell.logSd < POLICY.minProteinLogSd) return "no_within_context_variation";
  if (row.protein < cell.min || row.protein > cell.max) return "outside_past_exposure_range";
  return null;
}
