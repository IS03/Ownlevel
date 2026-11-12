import { createHash } from "node:crypto";
import { seededRandom } from "../../insights-engine/stats";
import { prepareRows, statisticT, summarizeRows, type PairedRow } from "./contrast";

/** Offline research prototype (#367). Development seeds only; never reads personal data. */

export const PRE_DAYS = 182;
export const POST_DAYS = 730;
export const FIRST_DAY = -PRE_DAYS;
export const LAST_DAY = POST_DAYS - 1;
export const DEV_NAMESPACE = "OWNLEVEL-367-preregistered-DEV-pilot-1";
export const N8_CANDIDATES = 12;

export const NULL_SCENARIOS = ["N1_iid", "N2_persist", "N3_strong_persist", "N4_trends", "N5_recorded_changes", "N6_unrecorded_changes", "N7_collider_missing", "N7b_missing_by_exposure", "N8_retro_selection", "N9_sparse"] as const;
export const POSITIVE_SCENARIOS = ["P10", "P15", "P20", "P25", "P15_sparse"] as const;
export const SCENARIOS = [...NULL_SCENARIOS, ...POSITIVE_SCENARIOS] as const;
export type Scenario = (typeof SCENARIOS)[number];

const logit = (p: number) => Math.log(p / (1 - p));
const expit = (x: number) => 1 / (1 + Math.exp(-x));

interface Spec { phiX: number; phiY: number; trends?: boolean; commonEra?: boolean; unrecorded?: boolean; collider?: boolean; missingByExposure?: boolean; retro?: boolean; sparse?: boolean; beta?: number }
const EFFECT = (p: number) => logit(p) - logit(0.3);
const SPECS: Record<Scenario, Spec> = {
  N1_iid: { phiX: 0, phiY: 0 },
  N2_persist: { phiX: 0.5, phiY: 0.5 },
  N3_strong_persist: { phiX: 0.85, phiY: 0.75 },
  N4_trends: { phiX: 0.3, phiY: 0.3, trends: true },
  N5_recorded_changes: { phiX: 0.3, phiY: 0.3, commonEra: true },
  N6_unrecorded_changes: { phiX: 0.3, phiY: 0.3, commonEra: true, unrecorded: true },
  N7_collider_missing: { phiX: 0.3, phiY: 0.3, collider: true },
  N7b_missing_by_exposure: { phiX: 0.3, phiY: 0.3, missingByExposure: true },
  N8_retro_selection: { phiX: 0.7, phiY: 0.6, retro: true },
  N9_sparse: { phiX: 0.5, phiY: 0.5, sparse: true },
  P10: { phiX: 0.5, phiY: 0.5, commonEra: true, beta: EFFECT(0.4) },
  P15: { phiX: 0.5, phiY: 0.5, commonEra: true, beta: EFFECT(0.45) },
  P20: { phiX: 0.5, phiY: 0.5, commonEra: true, beta: EFFECT(0.5) },
  P25: { phiX: 0.5, phiY: 0.5, commonEra: true, beta: EFFECT(0.55) },
  P15_sparse: { phiX: 0.5, phiY: 0.5, commonEra: true, beta: EFFECT(0.45), sparse: true },
};

export interface GeneratedSession { day: number; routineKey: string; y: number; a: 0 | 1 | null }
export interface PreSession { day: number; routineKey: string; y: number; a: (0 | 1 | null)[] }
export interface GeneratedHistory {
  sessions: GeneratedSession[];
  preSessions: PreSession[];
  meta: {
    scenario: Scenario; index: number; sessionsPerWeek: number; coverage: number; pHigh: number; cut: number; beta: number;
    eraLengths: number[]; vacations: { start: number; length: number }[];
    postSessions: number; missingRateHigh: number | null; missingRateLow: number | null; observedExposureFraction: number; trueExposureHighFraction: number;
    picked?: { candidate: number; preAbsT: number; preEffect: number | null };
  };
}

export function hash32(text: string): number {
  return parseInt(createHash("sha256").update(text).digest("hex").slice(0, 8), 16) >>> 0;
}

/** Acklam's rational approximation of the standard normal quantile (relative error < 1.2e-9). */
export function inverseNormalCdf(p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError("p must be in (0,1)");
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - low) return -inverseNormalCdf(1 - p);
  const q = p - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function makeRng(seed: number) {
  const u = seededRandom(seed);
  let spare: number | null = null;
  const normal = () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    const u1 = Math.max(u(), 1e-12), u2 = u(), r = Math.sqrt(-2 * Math.log(u1));
    spare = r * Math.sin(2 * Math.PI * u2);
    return r * Math.cos(2 * Math.PI * u2);
  };
  const int = (lo: number, hi: number) => lo + Math.floor(u() * (hi - lo + 1));
  const range = (lo: number, hi: number) => lo + (hi - lo) * u();
  return { u, normal, int, range };
}
type Rng = ReturnType<typeof makeRng>;

function ar1(rng: Rng, phi: number, length: number): Float64Array {
  const out = new Float64Array(length), k = Math.sqrt(1 - phi * phi);
  out[0] = rng.normal();
  for (let i = 1; i < length; i++) out[i] = phi * out[i - 1] + k * rng.normal();
  return out;
}
function walk(rng: Rng, step: number, length: number): Float64Array {
  const out = new Float64Array(length);
  for (let i = 1; i < length; i++) out[i] = out[i - 1] + step * rng.normal();
  return out;
}
function sinus(rng: Rng, amp: number, length: number): Float64Array {
  const period = rng.range(60, 240), phase = rng.range(0, 2 * Math.PI), out = new Float64Array(length);
  for (let i = 0; i < length; i++) out[i] = amp * Math.sin((2 * Math.PI * (FIRST_DAY + i)) / period + phase);
  return out;
}

export function generateHistory(scenario: Scenario, index: number, namespace: string): GeneratedHistory {
  if (/reserve/i.test(namespace)) throw new Error("Reserved namespaces are not allowed in the development generator");
  const spec = SPECS[scenario];
  if (!spec) throw new Error(`Unknown scenario ${scenario}`);
  const rng = makeRng(hash32(`${namespace}:${scenario}:${index}`));
  const length = LAST_DAY - FIRST_DAY + 1, at = (day: number) => day - FIRST_DAY;

  const sessionsPerWeek = spec.sparse ? 2 : rng.int(2, 5);
  const vacations: { start: number; length: number }[] = [];
  const gaps = Math.round((2 * length) / 365);
  for (let i = 0; i < gaps; i++) { const len = rng.int(7, 21); vacations.push({ start: rng.int(FIRST_DAY, LAST_DAY - len + 1), length: len }); }
  const onVacation = new Uint8Array(length);
  for (const v of vacations) for (let d = v.start; d < v.start + v.length; d++) onVacation[at(d)] = 1;

  const eraLengths: number[] = [], eraOfDay = new Int32Array(length);
  for (let day = FIRST_DAY, era = 0; day <= LAST_DAY; era++) {
    const len = rng.int(56, 112);
    eraLengths.push(len);
    const visible = era === 0 ? len - rng.int(0, len - 1) : len; // random offset into the first era
    for (let d = day; d < day + visible && d <= LAST_DAY; d++) eraOfDay[at(d)] = era;
    day += visible;
  }
  const eras = eraLengths.length;
  const coverage = spec.sparse ? 0.5 : rng.range(0.5, 0.85);

  const sessionDays: number[] = [];
  for (let w = FIRST_DAY; w <= LAST_DAY; w += 7) {
    const pool: number[] = [];
    for (let d = w; d < w + 7 && d <= LAST_DAY; d++) if (!onVacation[at(d)]) pool.push(d);
    const take = Math.min(sessionsPerWeek, pool.length);
    for (let i = 0; i < take; i++) { const j = i + Math.floor(rng.u() * (pool.length - i)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    sessionDays.push(...pool.slice(0, take).sort((x, y) => x - y));
  }

  const eraU = Array.from({ length: eras }, () => (spec.commonEra ? rng.normal() : 0));
  const eraY = (d: number) => (spec.commonEra ? 0.6 * eraU[eraOfDay[at(d)]] : 0);
  const routineKey = (d: number) => (spec.unrecorded ? "r0" : `era-${eraOfDay[at(d)]}`);

  // Exposure latent series: one per candidate (a single one outside N8).
  const nCand = spec.retro ? N8_CANDIDATES : 1;
  const latents: Float64Array[] = [], cuts: number[] = [], pHighs: number[] = [];
  for (let c = 0; c < nCand; c++) {
    const x = ar1(rng, spec.phiX, length);
    if (spec.trends) { const s = sinus(rng, 1.0, length), w = walk(rng, 0.06, length); for (let i = 0; i < length; i++) x[i] += s[i] + w[i]; }
    if (spec.retro) { const w = walk(rng, 0.04, length); for (let i = 0; i < length; i++) x[i] += w[i]; }
    if (spec.commonEra) for (let d = FIRST_DAY; d <= LAST_DAY; d++) x[at(d)] += 0.8 * eraU[eraOfDay[at(d)]];
    const pHigh = rng.range(0.3, 0.6);
    latents.push(x); pHighs.push(pHigh); cuts.push(inverseNormalCdf(1 - pHigh));
  }
  const z = ar1(rng, spec.phiY, length);
  let trendY: Float64Array | null = null;
  if (spec.trends) { const s = sinus(rng, 0.8, length), w = walk(rng, 0.04, length); trendY = s.map((v, i) => v + w[i]); }
  if (spec.retro) trendY = walk(rng, 0.03, length);

  const beta = spec.beta ?? 0;
  const base = logit(0.3);
  const sessions: GeneratedSession[] = [], preSessions: PreSession[] = [];
  let observed = 0, high = 0;
  const tally = { hi: 0, hiMissing: 0, lo: 0, loMissing: 0 };
  for (const d of sessionDays) {
    const i = at(d), k = rng.int(3, 8);
    const trueA = latents[0][i] >= cuts[0] ? 1 : 0;
    const p = expit(base + 0.8 * z[i] + eraY(d) + (trendY ? trendY[i] : 0) + beta * trueA);
    let hits = 0;
    for (let e = 0; e < k; e++) if (rng.u() < p) hits++;
    const y = hits / k;
    if (spec.retro) {
      if (d < 0) {
        const a = latents.map((x, c) => (rng.u() < coverage ? (x[i] >= cuts[c] ? 1 : 0) : null) as 0 | 1 | null);
        preSessions.push({ day: d, routineKey: routineKey(d), y, a });
      } else sessions.push({ day: d, routineKey: routineKey(d), y, a: null }); // exposure filled after the candidate is picked
      continue;
    }
    if (d < 0) continue;
    const missingProb = spec.missingByExposure ? (trueA === 1 ? 0.6 : 0.15) : spec.collider ? (trueA === 1 && y > 0.35 ? 0.6 : 0.15) : 1 - coverage;
    const seen = rng.u() >= missingProb;
    if (seen) observed++;
    if (trueA) { high++; tally.hi++; if (!seen) tally.hiMissing++; } else { tally.lo++; if (!seen) tally.loMissing++; }
    sessions.push({ day: d, routineKey: routineKey(d), y, a: seen ? (trueA as 0 | 1) : null });
  }

  let picked: GeneratedHistory["meta"]["picked"];
  if (spec.retro) {
    // Only the picked candidate is evaluated post-creation; its exposure is observed with the history's coverage.
    const scores: { candidate: number; absT: number; effect: number | null }[] = [];
    for (let c = 0; c < nCand; c++) {
      const rows: PairedRow[] = preSessions.filter(s => s.a[c] !== null).map(s => ({ day: s.day, routineKey: s.routineKey, y: s.y, a: s.a[c] as 0 | 1 }));
      const prep = prepareRows(rows);
      scores.push({ candidate: c, absT: Math.abs(statisticT(prep)), effect: summarizeRows(prep).effect });
    }
    let best = scores[0];
    for (const s of scores) if (s.absT > best.absT) best = s;
    picked = { candidate: best.candidate, preAbsT: best.absT, preEffect: best.effect };
    for (const s of sessions) {
      const i = at(s.day);
      const seen = rng.u() < coverage;
      const a = latents[best.candidate][i] >= cuts[best.candidate] ? 1 : 0;
      s.a = seen ? (a as 0 | 1) : null;
      if (seen) observed++;
      if (a) high++;
    }
  }
  const chosen = picked?.candidate ?? 0;
  return {
    sessions, preSessions,
    meta: { scenario, index, sessionsPerWeek, coverage, pHigh: pHighs[chosen], cut: cuts[chosen], beta, eraLengths, vacations,
      postSessions: sessions.length, missingRateHigh: tally.hi ? tally.hiMissing / tally.hi : null, missingRateLow: tally.lo ? tally.loMissing / tally.lo : null, observedExposureFraction: sessions.length ? observed / sessions.length : 0,
      trueExposureHighFraction: sessions.length ? high / sessions.length : 0, ...(picked ? { picked } : {}) },
  };
}
