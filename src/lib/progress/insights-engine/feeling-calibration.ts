import { evaluateAssociations } from "./associations";
import { stratifiedRows } from "./feeling-outcomes";
import { ranks, seededRandom } from "./stats";
import type { Candidate, ObservationRow } from "./types";

/**
 * #367: the post feelings as outcomes, measured with the same association policy and the real outcome construction
 * (`stratifiedRows`), on synthetic histories only. Its figures never mix with `calibration.ts` (daily performance proportion) or
 * `partial-calibration.ts`. Reads no personal data; the route never imports it.
 *
 * Every number below is an ASSUMPTION about how these answers behave, not a fact about anyone:
 * - one training day in 4/7 over 24 months; the prior answer is missing on 15 % of the days, as an excluded day;
 * - answers are a 1–5 scale bunched around the middle (latent × 0.9, rounded, + 3);
 * - the end answer carries over from the prior one (0.6) and from a day state shared by energy and fatigue, with opposite signs;
 * - each candidate is present on 80 % of the days.
 * The two outcomes are one family for this measurement: a history counts if any candidate passes on either outcome at any update.
 */
export const FEELING_SCENARIOS = {
  feeling_independent: {},
  feeling_autocorrelated: { phi: 0.7 },
  feeling_routine_change: { eras: true },
  feeling_spurious_trend: { trend: true },
  feeling_selective_absence: { selective: true },
  /** Candidate 0 follows the prior answer only; the end answer depends on the prior one only. A pass of candidate 0 is a false one. */
  feeling_prior_confounded: { confounded: true },
  feeling_moderate_effect: { effect: 0.45 },
  feeling_true_effect: { effect: 0.9 },
} as const satisfies Record<string, { phi?: number; eras?: boolean; trend?: boolean; selective?: boolean; confounded?: boolean; effect?: number }>;
export type FeelingScenario = keyof typeof FEELING_SCENARIOS;
type Settings = { phi?: number; eras?: boolean; trend?: boolean; selective?: boolean; confounded?: boolean; effect?: number };
export type FeelingCalibrationConfig = { histories: number; seed: number; months?: number; looks?: number; candidates?: number; permutations?: number };
export type FeelingCalibrationResult = {
  scenario: FeelingScenario; histories: number; looks: number; candidates: number; permutations: number; meanRowsAtLastLook: number;
  /** Either outcome, any candidate, any update. */
  anyExploratory: number; anyStrictGate: number; strictGateWilsonUpper95: number;
  /** Each outcome alone. */
  energyStrictGate: number; fatigueStrictGate: number;
  /** Candidate 0 on either outcome: a true effect in the effect scenarios, a false one in the confounded one. */
  candidateZeroExploratory: number; candidateZeroStrictGate: number;
  /** The confounded scenario again, with the end answer ranked over all days instead of within its prior level. */
  unstratifiedCandidateZeroStrictGate: number | null;
};

function normal(random: () => number) {
  const u = Math.max(random(), 1e-12), v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const scale = (value: number) => Math.min(5, Math.max(1, Math.round(value * 0.9) + 3));
const step = (state: number, phi: number, random: () => number) => phi * state + Math.sqrt(1 - phi * phi) * normal(random);

function simulate(settings: Settings, seed: number, months: number, candidates: number) {
  const random = seededRandom(seed);
  const days = Math.round(months * 30.44), start = Date.UTC(2020, 0, 1), phi = settings.phi ?? 0.3;
  const eraLength = Math.round(6 * 30.44);
  const exposureState = Array.from({ length: candidates }, () => normal(random)), eraShiftX = Array.from({ length: candidates }, () => normal(random));
  let energyPre = normal(random), dayState = normal(random), eraShiftY = normal(random), era = 0;
  const rows: { date: string; energy: { pre: number | null; post: number }; fatigue: { pre: number | null; post: number }; routine: string; present: boolean[]; exposures: number[] }[] = [];
  for (let day = 0; day < days; day++) {
    if (random() >= 4 / 7) continue;
    if (settings.eras && Math.floor(day / eraLength) !== era) {
      era = Math.floor(day / eraLength); eraShiftY = normal(random);
      for (let k = 0; k < candidates; k++) eraShiftX[k] = normal(random);
    }
    const progress = day / days;
    energyPre = step(energyPre, phi, random); dayState = step(dayState, phi, random);
    const fatiguePre = -0.5 * energyPre + Math.sqrt(0.75) * normal(random);
    const exposures = exposureState.map((state, k) => {
      exposureState[k] = step(state, phi, random);
      let value = exposureState[k]!;
      if (settings.eras) value += eraShiftX[k]!;
      if (settings.trend) value += (k % 2 ? -1 : 1) * 3 * progress;
      if (settings.confounded && k === 0) value = 0.8 * energyPre + 0.6 * normal(random);
      return value;
    });
    let energyLatent = 0.6 * energyPre + 0.5 * dayState + 0.6 * normal(random);
    let fatigueLatent = 0.6 * fatiguePre - 0.4 * dayState + 0.6 * normal(random);
    if (settings.eras) { energyLatent += eraShiftY; fatigueLatent -= eraShiftY; }
    if (settings.trend) { energyLatent += 2 * progress - 1; fatigueLatent -= 2 * progress - 1; }
    if (settings.effect) { energyLatent += settings.effect * exposures[0]!; fatigueLatent -= settings.effect * exposures[0]!; }
    const energyPost = scale(energyLatent), fatiguePost = scale(fatigueLatent);
    const priorMissing = random() < 0.15;
    // Selective absence: the exposure is recorded far less on the days that end tired.
    const present = exposures.map(() => random() >= (settings.selective ? (fatiguePost >= 4 ? 0.6 : 0.1) : 0.2));
    rows.push({ date: new Date(start + day * 86_400_000).toISOString().slice(0, 10), routine: settings.eras ? `era-${era}` : "routine-0", present, exposures,
      energy: { pre: priorMissing ? null : scale(energyPre), post: energyPost }, fatigue: { pre: priorMissing ? null : scale(fatiguePre), post: fatiguePost } });
  }
  return rows;
}

function wilsonUpper(successes: number, total: number) {
  if (!total) return 1;
  const z = 1.96, p = successes / total, denominator = 1 + z * z / total;
  return Math.min(1, (p + z * z / (2 * total) + z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total))) / denominator);
}
/** The same days ranked over all of them: what ignoring the prior answer would test. Only to show what the strata prevent. */
function unstratified(rows: readonly { date: string; post: number; routineId: string | null }[]): ObservationRow[] {
  const order = ranks(rows.map(row => row.post));
  return rows.map((row, index) => ({ date: row.date, y: (order[index]! - 0.5) / rows.length, ySensitivity: (order[index]! - 0.5) / rows.length, routineKey: row.routineId }));
}

export function* feelingCalibrationSteps(scenario: FeelingScenario, config: FeelingCalibrationConfig): Generator<number, FeelingCalibrationResult, void> {
  const months = config.months ?? 24, looks = config.looks ?? 12, wanted = config.candidates ?? 12, permutations = config.permutations ?? 199;
  const settings: Settings = FEELING_SCENARIOS[scenario];
  let anyE = 0, anyS = 0, energyS = 0, fatigueS = 0, zeroE = 0, zeroS = 0, flatZeroS = 0, rowsAtLast = 0;
  for (let history = 0; history < config.histories; history++) {
    const data = simulate(settings, (config.seed + Math.imul(history + 1, 0x9e3779b1)) >>> 0, months, wanted);
    const seen = { any: false, strict: false, energy: false, fatigue: false, zero: false, zeroStrict: false, flat: false };
    for (let look = 0; look < looks; look++) {
      const fraction = (months - looks + look + 1) / months;
      const slice = data.slice(0, Math.floor(data.length * fraction));
      for (const kind of ["energy", "fatigue"] as const) {
        const eligible = slice.filter(row => row[kind].pre !== null);
        const observations = eligible.map(row => ({ date: row.date, pre: row[kind].pre!, post: row[kind].post, routineId: row.routine }));
        const byDate = new Map(eligible.map(row => [row.date, row]));
        const candidatesFor = (rows: readonly ObservationRow[]): Candidate[] => Array.from({ length: wanted }, (_, k) => {
          const values = new Map<string, number>();
          for (const { date } of rows) { const row = byDate.get(date)!; if (row.present[k]) values.set(date, row.exposures[k]!); }
          return { values, exclusions: {}, definition: { id: `feeling_outcome:${kind}Post:synthetic:${k}`, family: "metric", window: "same_day", subject: String(k), temporalBasis: "same_day_unordered" } };
        });
        const rows = stratifiedRows(observations);
        const evaluated = evaluateAssociations(rows, candidatesFor(rows), { permutations, seed: (config.seed ^ history ^ (kind === "energy" ? 0 : 0x5a5a)) >>> 0 });
        for (const item of evaluated.items) {
          const zero = item.id.endsWith(":synthetic:0");
          if (item.state === "exploratory") { seen.any = true; if (zero) seen.zero = true; }
          if (item.strictGate) { seen.strict = true; seen[kind] = true; if (zero) seen.zeroStrict = true; }
        }
        if (settings.confounded) {
          const flat = unstratified([...observations].sort((a, b) => a.date.localeCompare(b.date)));
          const flatResult = evaluateAssociations(flat, candidatesFor(flat), { permutations, seed: (config.seed ^ history ^ 0x77) >>> 0 });
          if (flatResult.items.some(item => item.strictGate && item.id.endsWith(":synthetic:0"))) seen.flat = true;
        }
        if (look === looks - 1 && kind === "energy") rowsAtLast += rows.length;
      }
    }
    if (seen.any) anyE++; if (seen.strict) anyS++; if (seen.energy) energyS++; if (seen.fatigue) fatigueS++;
    if (seen.zero) zeroE++; if (seen.zeroStrict) zeroS++; if (seen.flat) flatZeroS++;
    yield history;
  }
  const total = config.histories, share = (value: number) => total ? value / total : 0;
  return { scenario, histories: total, looks, candidates: wanted, permutations, meanRowsAtLastLook: share(rowsAtLast),
    anyExploratory: share(anyE), anyStrictGate: share(anyS), strictGateWilsonUpper95: wilsonUpper(anyS, total),
    energyStrictGate: share(energyS), fatigueStrictGate: share(fatigueS), candidateZeroExploratory: share(zeroE), candidateZeroStrictGate: share(zeroS),
    unstratifiedCandidateZeroStrictGate: settings.confounded ? share(flatZeroS) : null };
}

export function runFeelingCalibration(scenario: FeelingScenario, config: FeelingCalibrationConfig): FeelingCalibrationResult {
  const steps = feelingCalibrationSteps(scenario, config);
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}
