import { ALPHAS, DESIGNS, HORIZON_DAYS, PERMUTATIONS, VARIANTS, evaluateQuestion, type Closure, type Design, type QuestionEvaluation, type Variant } from "./contrast";
import { DEV_NAMESPACE, NULL_SCENARIOS, POSITIVE_SCENARIOS, STRESS_SCENARIOS, generateHistory, hash32, type Scenario } from "./generator";

/** Offline research prototype (#367). Development seeds only. Pure loop: no I/O, no clock beyond process.cpuUsage. */

export type Phase = "phase1" | "phase2" | "phase3";
/** Phase 1 keeps its original settings (its report now also has N7b and P25 rows). Phase 2 is fixed: design 120, era_shift. */
export function pilotConfig(smoke: boolean, phase: Phase = "phase1") {
  /** Phase 3 is fixed: the two out-of-domain stress scenarios only, reported as "null" (no true effect). */
  if (phase === "phase3") return {
    phase, namespace: "OWNLEVEL-367-preregistered-DEV-pilot-3",
    nullScenarios: [...STRESS_SCENARIOS], positiveScenarios: [] as (typeof POSITIVE_SCENARIOS[number])[],
    historiesPerNull: smoke ? 20 : 1000, historiesPerPositive: 0,
    designs: [120] as Design[], variants: ["era_shift"] as Variant[], alphas: { look1: 0.007, look2: 0.028 },
    permutations: PERMUTATIONS, horizonDays: HORIZON_DAYS, smoke,
  };
  if (phase === "phase2") return {
    phase, namespace: "OWNLEVEL-367-preregistered-DEV-pilot-2",
    nullScenarios: [...NULL_SCENARIOS], positiveScenarios: [...POSITIVE_SCENARIOS],
    historiesPerNull: smoke ? 20 : 1000, historiesPerPositive: smoke ? 10 : 400,
    designs: [120] as Design[], variants: ["era_shift"] as Variant[], alphas: { look1: 0.007, look2: 0.028 },
    permutations: PERMUTATIONS, horizonDays: HORIZON_DAYS, smoke,
  };
  return {
    phase,
    namespace: DEV_NAMESPACE,
    nullScenarios: [...NULL_SCENARIOS], positiveScenarios: [...POSITIVE_SCENARIOS],
    historiesPerNull: smoke ? 20 : 500, historiesPerPositive: smoke ? 10 : 300,
    designs: [...DESIGNS], variants: [...VARIANTS], alphas: ALPHAS, permutations: PERMUTATIONS, horizonDays: HORIZON_DAYS,
    smoke,
  };
}
export type PilotConfig = ReturnType<typeof pilotConfig>;

export interface Aggregate {
  scenario: string; design: Design; variant: Variant; histories: number;
  supported: number; supportedRate: number; wilsonLower95: number; wilsonUpper95: number;
  supportedLook1: number; supportedLook2: number;
  closure: Record<Closure, number>;
  reachedFinalLook: number; finalLookDayMedian: number | null; finalLookDayP90: number | null;
  meanInformativeFractionFinal: number | null; meanEffectPpFinal: number | null; meanDFinal: number | null;
  /** Positives: mean pooled effect (pp) at the final look among ALL histories reaching it (supported or not). */
  meanAchievedEffectPpAmongReaching: number | null;
  /** Final-look p-values among histories evaluated at look 2 with all gates passing (calibration apart from gating). */
  finalLookP: { n: number; le001: number | null; le0032: number | null; le005: number | null; le010: number | null };
}
export interface ScenarioReport { scenario: string; kind: "null" | "positive"; histories: number; cpuMicros: number; n8?: { meanPreAbsT: number; meanPreEffectPp: number | null } }
export interface PilotReport { config: PilotConfig; scenarios: ScenarioReport[]; aggregates: Aggregate[]; aborted?: "cpu_cap" }

export function wilson(successes: number, n: number): { lower: number; upper: number } {
  if (n === 0) return { lower: 0, upper: 1 };
  const z = 1.959963984540054, p = successes / n, z2 = z * z, denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom, half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lower: Math.max(0, center - half), upper: Math.min(1, center + half) };
}

const quantile = (sorted: number[], q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] : null);
const avg = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);

function aggregate(scenario: string, design: Design, variant: Variant, evals: QuestionEvaluation[]): Aggregate {
  const closure: Record<Closure, number> = { supported: 0, no_clear_difference: 0, selective_record: 0, insufficient_data: 0 };
  let look1 = 0, look2 = 0;
  const days: number[] = [], fractions: number[] = [], effects: number[] = [], ds: number[] = [], ps: number[] = [];
  for (const e of evals) {
    closure[e.closure]++;
    if (e.alertLook === 1) look1++;
    if (e.alertLook === 2) look2++;
    const final = e.looks.find(l => l.look === 2);
    if (!final) continue;
    days.push(final.day); fractions.push(final.informativeFraction);
    if (final.effect !== null) effects.push(final.effect * 100);
    if (final.d !== null) ds.push(final.d);
    if (final.p !== null) ps.push(final.p);
  }
  const supported = closure.supported, w = wilson(supported, evals.length), sorted = [...days].sort((x, y) => x - y);
  const frac = (t: number) => (ps.length ? ps.filter(p => p <= t).length / ps.length : null);
  return {
    scenario, design, variant, histories: evals.length, supported, supportedRate: evals.length ? supported / evals.length : 0,
    wilsonLower95: w.lower, wilsonUpper95: w.upper, supportedLook1: look1, supportedLook2: look2, closure,
    reachedFinalLook: days.length, finalLookDayMedian: quantile(sorted, 0.5), finalLookDayP90: quantile(sorted, 0.9),
    meanInformativeFractionFinal: avg(fractions), meanEffectPpFinal: avg(effects), meanDFinal: avg(ds),
    meanAchievedEffectPpAmongReaching: avg(effects),
    finalLookP: { n: ps.length, le001: frac(0.01), le0032: frac(0.032), le005: frac(0.05), le010: frac(0.1) },
  };
}

export interface RunOptions {
  smoke: boolean;
  phase?: Phase;
  /** Called after each history; return false to stop immediately (partial results are still aggregated). */
  afterHistory?: () => boolean;
}

export function runPilot(options: RunOptions): PilotReport {
  const config = pilotConfig(options.smoke, options.phase);
  const scenarios: ScenarioReport[] = [], aggregates: Aggregate[] = [];
  let aborted: "cpu_cap" | undefined;
  const plan: { scenario: Scenario; kind: "null" | "positive"; count: number }[] = [
    ...config.nullScenarios.map(scenario => ({ scenario, kind: "null" as const, count: config.historiesPerNull })),
    ...config.positiveScenarios.map(scenario => ({ scenario, kind: "positive" as const, count: config.historiesPerPositive })),
  ];
  outer: for (const { scenario, kind, count } of plan) {
    const cpu0 = process.cpuUsage();
    const evals = new Map<string, QuestionEvaluation[]>();
    for (const design of config.designs) for (const variant of config.variants) evals.set(`${design}|${variant}`, []);
    let done = 0;
    const preAbs: number[] = [], preEff: number[] = [];
    for (let index = 0; index < count; index++) {
      const history = generateHistory(scenario, index, config.namespace);
      if (history.meta.picked) { preAbs.push(history.meta.picked.preAbsT); if (history.meta.picked.preEffect !== null) preEff.push(history.meta.picked.preEffect * 100); }
      for (const design of config.designs) for (const variant of config.variants) {
        const seed = hash32(`${config.namespace}:${scenario}:${index}:${design}:${variant}`);
        evals.get(`${design}|${variant}`)!.push(evaluateQuestion(history.sessions, { design, variant, seed, alphas: config.alphas, diagnosticLook2: true }));
      }
      done++;
      if (options.afterHistory && !options.afterHistory()) { aborted = "cpu_cap"; break; }
    }
    const cpu = process.cpuUsage(cpu0);
    scenarios.push({ scenario, kind, histories: done, cpuMicros: cpu.user + cpu.system,
      ...(preAbs.length ? { n8: { meanPreAbsT: avg(preAbs)!, meanPreEffectPp: avg(preEff) } } : {}) });
    for (const design of config.designs) for (const variant of config.variants) aggregates.push(aggregate(scenario, design, variant, evals.get(`${design}|${variant}`)!));
    if (aborted) break outer;
  }
  return { config, scenarios, aggregates, ...(aborted ? { aborted } : {}) };
}
