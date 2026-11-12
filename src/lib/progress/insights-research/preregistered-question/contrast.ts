import { seededRandom } from "../../insights-engine/stats";

/** Offline research prototype (#367). Not imported by any route. Synthetic data only. */

export const BLOCK_DAYS = 28;
export const PERMUTATIONS = 999;
export const HORIZON_DAYS = 730;
export const DESIGNS = [120, 160] as const;
export type Design = (typeof DESIGNS)[number];
export type Variant = "stratum_shift" | "era_shift";
export const VARIANTS: readonly Variant[] = ["stratum_shift", "era_shift"];
export const ALPHAS = { look1: 0.008, look2: 0.032 } as const;
export const MIN_COVERAGE = 0.5;
export const SELECTIVE_GAP = 0.15;
export const SELECTIVE_MIN_DAYS = 5;
export const MIN_INFORMATIVE_STRATA = 2;
const TOLERANCE = 1e-12;

export interface PairedRow { day: number; routineKey: string; a: 0 | 1; y: number }
/** A post-creation session day with a comparable outcome; exposure may be missing. */
export interface SessionDay { day: number; routineKey: string; y: number; a: 0 | 1 | null }

export interface Prepared {
  n: number;
  y: Float64Array;
  a: Uint8Array;
  /** stratum id per row (routineKey x 28-day block), ids in first-occurrence order. */
  stratum: Int32Array;
  strataRows: number[][];
  strataN: Int32Array;
  strataSumY: Float64Array;
  /** row indices per routineKey in date order (rows are expected sorted by day). */
  routineRows: number[][];
}

export function prepareRows(rows: readonly PairedRow[]): Prepared {
  const n = rows.length;
  const y = new Float64Array(n), a = new Uint8Array(n), stratum = new Int32Array(n);
  const strataIds = new Map<string, number>(), routineIds = new Map<string, number>();
  const strataRows: number[][] = [], routineRows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    y[i] = r.y; a[i] = r.a;
    const key = `${r.routineKey}|${Math.floor(r.day / BLOCK_DAYS)}`;
    let s = strataIds.get(key);
    if (s === undefined) { s = strataRows.length; strataIds.set(key, s); strataRows.push([]); }
    stratum[i] = s; strataRows[s].push(i);
    let g = routineIds.get(r.routineKey);
    if (g === undefined) { g = routineRows.length; routineIds.set(r.routineKey, g); routineRows.push([]); }
    routineRows[g].push(i);
  }
  const strataN = new Int32Array(strataRows.length), strataSumY = new Float64Array(strataRows.length);
  for (let s = 0; s < strataRows.length; s++) {
    strataN[s] = strataRows[s].length;
    let sum = 0;
    for (const i of strataRows[s]) sum += y[i];
    strataSumY[s] = sum;
  }
  return { n, y, a, stratum, strataRows, strataN, strataSumY, routineRows };
}

/** T = sum_s sum_t (a_t - abar_s) y_t. Strata with all a equal contribute exactly 0. */
export function statisticT(p: Prepared, a: Uint8Array = p.a): number {
  const S = p.strataN.length, hi = new Int32Array(S), ay = new Float64Array(S);
  for (let i = 0; i < p.n; i++) if (a[i]) { const s = p.stratum[i]; hi[s]++; ay[s] += p.y[i]; }
  let t = 0;
  for (let s = 0; s < S; s++) if (hi[s] > 0 && hi[s] < p.strataN[s]) t += ay[s] - (hi[s] * p.strataSumY[s]) / p.strataN[s];
  return t;
}

/**
 * Fills `out` with the a-sequence after one random cyclic shift per unit. Days, routine keys and y stay fixed.
 * Units whose a-sequence is constant are skipped without consuming randomness, so adding an uninformative
 * stratum never changes the draws used by the informative ones.
 */
export function permuteExposure(p: Prepared, variant: Variant, random: () => number, out: Uint8Array): void {
  out.set(p.a);
  const units = variant === "stratum_shift" ? p.strataRows : p.routineRows;
  for (const idx of units) {
    const n = idx.length;
    let hi = 0;
    for (const i of idx) hi += p.a[i];
    if (hi === 0 || hi === n) continue;
    const k = Math.floor(random() * n);
    for (let j = 0; j < n; j++) out[idx[j]] = p.a[idx[(j + k) % n]];
  }
}

export interface ContrastSummary {
  n: number;
  informativeStrata: number;
  informativeFraction: number;
  /** Pooled effect in probability points (y is a proportion in [0,1]); null if no informative stratum. */
  effect: number | null;
  /** Pooled effect / pooled within-stratum SD of y; null if undefined. */
  d: number | null;
}

export function summarizeRows(p: Prepared): ContrastSummary {
  const S = p.strataN.length;
  const hi = new Int32Array(S), sumHi = new Float64Array(S);
  for (let i = 0; i < p.n; i++) if (p.a[i]) { const s = p.stratum[i]; hi[s]++; sumHi[s] += p.y[i]; }
  let informative = 0, rowsInf = 0, sumW = 0, sumWD = 0, ss = 0;
  for (let s = 0; s < S; s++) {
    const n = p.strataN[s];
    if (hi[s] === 0 || hi[s] === n) continue;
    informative++; rowsInf += n;
    const lo = n - hi[s], w = (hi[s] * lo) / n;
    sumW += w; sumWD += w * (sumHi[s] / hi[s] - (p.strataSumY[s] - sumHi[s]) / lo);
    const mean = p.strataSumY[s] / n;
    for (const i of p.strataRows[s]) ss += (p.y[i] - mean) ** 2;
  }
  const effect = sumW > 0 ? sumWD / sumW : null;
  const df = rowsInf - informative;
  const sd = df > 0 ? Math.sqrt(ss / df) : null;
  const d = effect !== null && sd !== null && sd > 0 ? effect / sd : null;
  return { n: p.n, informativeStrata: informative, informativeFraction: p.n > 0 ? rowsInf / p.n : 0, effect, d };
}

export interface ContrastResult extends ContrastSummary { T: number; p: number }

/** Two-sided Monte Carlo p = (1 + #{|T_b| >= |T_obs| - 1e-12}) / (B + 1). Deterministic for a given seed. */
export function contrastTest(rows: readonly PairedRow[], variant: Variant, seed: number, permutations = PERMUTATIONS): ContrastResult {
  const prep = prepareRows(rows), summary = summarizeRows(prep), T = statisticT(prep);
  const random = seededRandom(seed), buf = new Uint8Array(prep.n), abs = Math.abs(T) - TOLERANCE;
  let ge = 0;
  for (let b = 0; b < permutations; b++) {
    permuteExposure(prep, variant, random, buf);
    if (Math.abs(statisticT(prep, buf)) >= abs) ge++;
  }
  return { ...summary, T, p: (1 + ge) / (permutations + 1) };
}

export function mixSeed(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export type Closure = "supported" | "no_clear_difference" | "selective_record" | "insufficient_data";

export interface LookRecord {
  look: 1 | 2;
  m: number;
  /** Day (since creation) of the last paired row at this look. */
  day: number;
  alpha: number;
  gates: { coverage: boolean; selective: boolean; strata: boolean };
  coverage: number;
  unpaired: number;
  selectiveGap: number | null;
  informativeStrata: number;
  informativeFraction: number;
  effect: number | null;
  d: number | null;
  /** null when a gate failed (no test run). */
  p: number | null;
  alert: boolean;
}

export interface QuestionEvaluation {
  design: Design;
  variant: Variant;
  closure: Closure;
  /** 1 or 2 when supported. */
  alertLook: 1 | 2 | null;
  looks: LookRecord[];
  pairedTotal: number;
}

export interface EvaluateOptions {
  design: Design;
  variant: Variant;
  seed: number;
  /** Defaults to ALPHAS (0.008 / 0.032). */
  alphas?: { look1: number; look2: number };
  horizonDays?: number;
  permutations?: number;
  /** Research diagnostic: still evaluate look 2 after an alert at look 1 (closure is not affected). */
  diagnosticLook2?: boolean;
}

function evaluateLook(days: readonly SessionDay[], paired: readonly SessionDay[], m: number, look: 1 | 2, options: EvaluateOptions): LookRecord {
  const rows = paired.slice(0, m) as PairedRow[];
  const lastDay = rows[m - 1].day;
  let outcomeDays = 0, unpaired = 0, sumUnpaired = 0;
  for (const s of days) {
    if (s.day > lastDay) break;
    outcomeDays++;
    if (s.a === null) { unpaired++; sumUnpaired += s.y; }
  }
  let sumPaired = 0;
  for (const r of rows) sumPaired += r.y;
  const coverage = outcomeDays > 0 ? m / outcomeDays : 0;
  const gap = unpaired >= SELECTIVE_MIN_DAYS ? Math.abs(sumUnpaired / unpaired - sumPaired / m) : null;
  const prep = prepareRows(rows), summary = summarizeRows(prep);
  const alphas = options.alphas ?? ALPHAS, alpha = look === 1 ? alphas.look1 : alphas.look2;
  const gates = {
    coverage: coverage >= MIN_COVERAGE,
    selective: gap === null || gap < SELECTIVE_GAP,
    strata: summary.informativeStrata >= MIN_INFORMATIVE_STRATA,
  };
  let p: number | null = null;
  if (gates.coverage && gates.selective && gates.strata) p = contrastTest(rows, options.variant, mixSeed(options.seed, look), options.permutations ?? PERMUTATIONS).p;
  return { look, m, day: lastDay, alpha, gates, coverage, unpaired, selectiveGap: gap, informativeStrata: summary.informativeStrata,
    informativeFraction: summary.informativeFraction, effect: summary.effect, d: summary.d, p, alert: p !== null && p <= alpha };
}

/**
 * `days` = ALL post-creation session days with a comparable outcome (day 0 = creation day), sorted by day, exposure
 * possibly missing. The paired rows are derived here. The first alert closes the question as supported.
 */
export function evaluateQuestion(days: readonly SessionDay[], options: EvaluateOptions): QuestionEvaluation {
  const horizon = options.horizonDays ?? HORIZON_DAYS;
  const inHorizon = days.filter(s => s.day >= 0 && s.day < horizon);
  const paired = inHorizon.filter(s => s.a !== null);
  const N = options.design, m1 = N / 2;
  const looks: LookRecord[] = [];
  let alertLook: 1 | 2 | null = null;
  if (paired.length >= m1) {
    const first = evaluateLook(inHorizon, paired, m1, 1, options);
    looks.push(first);
    if (first.alert) alertLook = 1;
    if (paired.length >= N && (alertLook === null || options.diagnosticLook2)) {
      const second = evaluateLook(inHorizon, paired, N, 2, options);
      looks.push(second);
      if (alertLook === null && second.alert) alertLook = 2;
    }
  }
  const final = looks.find(l => l.look === 2);
  let closure: Closure;
  if (alertLook !== null) closure = "supported";
  else if (!final) closure = "insufficient_data";
  else if (final.gates.coverage && final.gates.selective && final.gates.strata) closure = "no_clear_difference";
  else if (!final.gates.coverage || !final.gates.strata) closure = "insufficient_data";
  else closure = "selective_record";
  return { design: options.design, variant: options.variant, closure, alertLook, looks, pairedTotal: paired.length };
}
