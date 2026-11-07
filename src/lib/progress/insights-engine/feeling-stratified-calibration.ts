import { buildExposureContext } from "./exposures";
import { prepareFeelingAssociations } from "./feeling-outcomes";
import { evaluateStratified } from "./feeling-stratified";
import { seededRandom } from "./stats";
import type { InsightsSource } from "./types";

/**
 * Simulation of `insights-feeling-stratified/1` FROM SOURCE ROWS, preregistered in 367-sensaciones-estratificado-metodo.md: sessions
 * with their routine, feelings with instrument and capture time, and daily metrics, through `buildExposureContext` →
 * `prepareFeelingAssociations` → the method. The #412 evaluation runs on the same rows for comparison. Synthetic only; the routes
 * never import it. Every number is an ASSUMPTION:
 * - 24 months, a session on 4 days of 7, 18:00 to 19:00 in Córdoba; prior answers missing on 15 % of the days;
 * - answers on the 1–5 scale bunched around the middle; the end answer carries over from the prior one (0.6) and from a day state
 *   shared by energy and fatigue with opposite signs;
 * - 6 daily metrics, present on 80 % of the days, each an AR(0.3) series unless the scenario says otherwise.
 */
export const STRATIFIED_SCENARIOS = {
  independent: { kind: "null" },
  autocorrelated: { kind: "null", phi: 0.7 },
  trend: { kind: "null", trend: true },
  routine_change: { kind: "null", eras: "recorded" },
  unrecorded_change: { kind: "null", eras: "unrecorded" },
  alternating_routines: { kind: "null", alternating: true },
  selective_absence: { kind: "null", selective: true },
  uncertain_timing: { kind: "null", late: true },
  reverse_same_day: { kind: "limitation", reverse: true },
  planted_moderate: { kind: "power", effect: 0.35 },
  planted_strong: { kind: "power", effect: 0.7 },
} as const satisfies Record<string, { kind: "null" | "limitation" | "power"; phi?: number; trend?: boolean; eras?: "recorded" | "unrecorded"; alternating?: boolean; selective?: boolean; late?: boolean; reverse?: boolean; effect?: number }>;
export type StratifiedScenario = keyof typeof STRATIFIED_SCENARIOS;
type Settings = { kind?: string; phi?: number; trend?: boolean; eras?: "recorded" | "unrecorded"; alternating?: boolean; selective?: boolean; late?: boolean; reverse?: boolean; effect?: number };
export type StratifiedConfig = { histories: number; seed: number; months?: number; looks?: number; permutations?: number };
type Tally = { anyExploratory: number; anyStrictGate: number; strictGateWilsonUpper95: number; plantedExploratory: number; plantedStrictGate: number };
export type StratifiedResult = {
  scenario: StratifiedScenario; kind: "null" | "limitation" | "power"; histories: number; looks: number; permutations: number;
  meanEligibleRows: number; meanKeptShare: number; meanTestable: number;
  stratified: Tally; previous: Tally;
};

function normal(random: () => number) {
  const u = Math.max(random(), 1e-12), v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const scale = (value: number) => Math.min(5, Math.max(1, Math.round(value * 0.9) + 3));
const step = (state: number, phi: number, random: () => number) => phi * state + Math.sqrt(1 - phi * phi) * normal(random);
const id = (group: number, n: number) => `00000000-0000-4000-8${String(group).padStart(3, "0")}-${n.toString(16).padStart(12, "0")}`;
export const METRICS = 6, PLANTED_METRIC = id(6, 0);
const START = Date.UTC(2020, 0, 6);

export function simulateSource(settings: Settings, seed: number, months: number): InsightsSource {
  const random = seededRandom(seed);
  const days = Math.round(months * 30.44), phi = settings.phi ?? 0.3, eraDays = 182;
  const sessions: InsightsSource["sessions"][number][] = [], feelings: InsightsSource["feelings"][number][] = [], values: InsightsSource["metricValues"][number][] = [];
  const state = Array.from({ length: METRICS }, () => normal(random));
  let energyPre = normal(random), dayState = normal(random), era = 0, eraY = 0, eraX = Array.from({ length: METRICS }, () => 0), alternate = 0;
  for (let day = 0; day < days; day++) {
    const date = new Date(START + day * 86_400_000).toISOString().slice(0, 10), progress = day / days;
    if (settings.eras && Math.floor(day / eraDays) !== era) { era = Math.floor(day / eraDays); eraY = normal(random) * 0.9; eraX = eraX.map(() => normal(random)); }
    const trains = random() < 4 / 7;
    const routine = settings.alternating && trains ? (alternate++ % 2 ? "B" : "A") : settings.eras === "recorded" ? `era-${era}` : "r";
    const routineShift = settings.alternating ? (routine === "A" ? 0.8 : -0.8) : 0;
    const exposures = state.map((value, k) => {
      state[k] = step(value, phi, random);
      let x = state[k]!;
      if (settings.eras) x += eraX[k]!;
      if (settings.trend) x += (k % 2 ? -1 : 1) * 3 * progress;
      if (settings.alternating && trains) x += routineShift;
      return x;
    });
    energyPre = step(energyPre, phi, random); dayState = step(dayState, phi, random);
    const fatiguePre = -0.5 * energyPre + Math.sqrt(0.75) * normal(random);
    let energyLatent = 0.6 * energyPre + 0.5 * dayState + 0.6 * normal(random), fatigueLatent = 0.6 * fatiguePre - 0.4 * dayState + 0.6 * normal(random);
    if (settings.eras) { energyLatent += eraY; fatigueLatent -= eraY; }
    if (settings.trend) { energyLatent += 2 * progress - 1; fatigueLatent -= 2 * progress - 1; }
    if (settings.alternating) { energyLatent += routineShift; fatigueLatent -= routineShift; }
    if (settings.effect) { energyLatent += settings.effect * exposures[0]!; fatigueLatent -= settings.effect * exposures[0]!; }
    const fatiguePost = scale(fatigueLatent), energyPost = scale(energyLatent);
    // Reverse: the same day's metric is recorded after the session and moved by how it ended. The method cannot see the order.
    if (settings.reverse && trains) exposures[0] = exposures[0]! + 0.8 * (fatigueLatent - energyLatent) / 2;
    for (let k = 0; k < METRICS; k++) if (random() >= (settings.selective && trains && fatiguePost >= 4 ? 0.6 : 0.2)) values.push({ metricId: id(6, k), date, value: Math.round(exposures[k]! * 100) / 100 });
    if (!trains) continue;
    const session = id(2, sessions.length);
    sessions.push({ id: session, date, routineId: routine, routineName: routine, name: null, status: "completed", startedAt: `${date}T18:00:00-03:00`, endedAt: `${date}T19:00:00-03:00`,
      performanceLevel: null, painLevel: null, legacyEnergyLevel: null });
    const fact = (value: number, moment: "pre" | "post", at: string) => ({ value, instrumentVersion: "energy-fatigue/1", declaredMoment: moment, declaredAt: null, capturedAt: at, source: "mobile" });
    // Uncertain timing: a share of end answers given hours later, more after a tiring session. They are excluded as late.
    const late = settings.late && random() < (fatiguePost >= 4 ? 0.5 : 0.15);
    const post = late ? `${date}T23:30:00-03:00` : `${date}T19:05:00-03:00`, pre = `${date}T17:55:00-03:00`, priorMissing = random() < 0.15;
    feelings.push({ sessionId: session, revision: 1, facts: { ...(priorMissing ? {} : { energyPre: fact(scale(energyPre), "pre", pre), fatiguePre: fact(scale(fatiguePre), "pre", pre) }),
      energyPost: fact(energyPost, "post", post), fatiguePost: fact(fatiguePost, "post", post) } });
  }
  return { sessions, exercises: [], sets: [], feelings, meals: [], metricValues: values,
    metricDefinitions: Array.from({ length: METRICS }, (_, k) => ({ id: id(6, k), name: `M${k}`, unit: null, valueType: "decimal", archived: false, systemKey: null })) };
}

function wilsonUpper(successes: number, total: number) {
  if (!total) return 1;
  const z = 1.96, p = successes / total, denominator = 1 + z * z / total;
  return Math.min(1, (p + z * z / (2 * total) + z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total))) / denominator);
}

export function* stratifiedSteps(scenario: StratifiedScenario, config: StratifiedConfig): Generator<number, StratifiedResult, void> {
  const months = config.months ?? 24, looks = config.looks ?? 12, permutations = config.permutations ?? 199;
  const settings: Settings = STRATIFIED_SCENARIOS[scenario];
  const counts = { s: { e: 0, s: 0, pe: 0, ps: 0 }, p: { e: 0, s: 0, pe: 0, ps: 0 } };
  let eligible = 0, keptShare = 0, testable = 0;
  for (let history = 0; history < config.histories; history++) {
    const seed = (config.seed + Math.imul(history + 1, 0x9e3779b1)) >>> 0;
    const source = simulateSource(settings, seed, months), context = buildExposureContext(source);
    const seen = { s: { e: false, s: false, pe: false, ps: false }, p: { e: false, s: false, pe: false, ps: false } };
    const days = Math.round(months * 30.44);
    for (let look = 0; look < looks; look++) {
      const today = new Date(START + Math.floor(days * (months - looks + look + 1) / months) * 86_400_000).toISOString().slice(0, 10);
      for (const kind of ["energy", "fatigue"] as const) {
        const prepared = prepareFeelingAssociations(source, kind, { today, method: 2, context });
        const planted = `feeling_outcome:${kind}Post:metric:${PLANTED_METRIC}:same_day`;
        const mine = evaluateStratified(prepared.rows, prepared.candidates, { permutations, seed: (seed ^ look ^ (kind === "energy" ? 0 : 0x55)) >>> 0 });
        const previous = prepared.evaluate(permutations);
        for (const item of mine.items) { if (item.state === "exploratory") { seen.s.e = true; if (item.id === planted) seen.s.pe = true; } if (item.strictGate) { seen.s.s = true; if (item.id === planted) seen.s.ps = true; } }
        for (const item of previous.items) { if (item.state === "exploratory") { seen.p.e = true; if (item.id === planted) seen.p.pe = true; } if (item.strictGate) { seen.p.s = true; if (item.id === planted) seen.p.ps = true; } }
        if (look === looks - 1 && kind === "energy") {
          eligible += mine.rows; testable += mine.testable;
          const tested = mine.items.filter(item => item.pairs >= 20);
          keptShare += tested.length ? tested.reduce((sum, item) => sum + item.keptPairs / item.pairs, 0) / tested.length : 0;
        }
      }
    }
    for (const key of ["s", "p"] as const) for (const flag of ["e", "s", "pe", "ps"] as const) if (seen[key][flag]) counts[key][flag]++;
    yield history;
  }
  const total = config.histories, share = (value: number) => total ? value / total : 0;
  const tally = (row: typeof counts.s): Tally => ({ anyExploratory: share(row.e), anyStrictGate: share(row.s), strictGateWilsonUpper95: wilsonUpper(row.s, total), plantedExploratory: share(row.pe), plantedStrictGate: share(row.ps) });
  return { scenario, kind: STRATIFIED_SCENARIOS[scenario].kind, histories: total, looks, permutations, meanEligibleRows: share(eligible), meanKeptShare: share(keptShare), meanTestable: share(testable),
    stratified: tally(counts.s), previous: tally(counts.p) };
}

export function runStratified(scenario: StratifiedScenario, config: StratifiedConfig): StratifiedResult {
  const steps = stratifiedSteps(scenario, config);
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}
