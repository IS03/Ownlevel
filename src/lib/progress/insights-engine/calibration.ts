import { evaluateAssociations } from "./associations";
import { seededRandom } from "./stats";
import type { Candidate, ObservationRow } from "./types";

/** Synthetic histories only. Never reads personal data and is not imported by the route. */
export const CALIBRATION_SCENARIOS = ["independent", "autocorrelated", "spurious_trend", "routine_change", "outliers", "selective_absence", "many_candidates", "moderate_effect", "true_effect"] as const;
export type CalibrationScenario = (typeof CALIBRATION_SCENARIOS)[number];
export type CalibrationConfig = { histories: number; seed: number; months?: number; looks?: number; candidates?: number; permutations?: number };
export type CalibrationResult = {
  scenario: CalibrationScenario; histories: number; looks: number; candidates: number; permutations: number; meanPairsAtLastLook: number;
  /** Share of histories where at least one candidate passes at any update of the year. */
  anyExploratory: number; anyStrictGate: number; strictGateWilsonUpper95: number;
  /** Only for the planted scenarios: that candidate passes at some update. */
  plantedStrictGate: number | null; plantedExploratory: number | null;
};

const logistic = (value: number) => 1 / (1 + Math.exp(-value));

function normal(random: () => number) {
  const u = Math.max(random(), 1e-12), v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function simulate(scenario: CalibrationScenario, seed: number, months: number, candidatesWanted: number) {
  const random = seededRandom(seed);
  const days = Math.round(months * 30.44);
  const start = Date.UTC(2020, 0, 1);
  const dates: string[] = [];
  for (let day = 0; day < days; day++) if (random() < 4 / 7) dates.push(new Date(start + day * 86_400_000).toISOString().slice(0, 10));
  const n = dates.length;
  const phiY = scenario === "independent" ? 0 : scenario === "autocorrelated" ? 0.7 : 0.3;
  const phiX = scenario === "independent" ? 0 : scenario === "autocorrelated" ? 0.8 : 0.3;
  const eraLength = Math.max(20, Math.round(n / (months / 6)));
  const eraShiftY: number[] = [], eraShiftX: number[][] = [];
  const candidates = scenario === "many_candidates" ? Math.max(candidatesWanted, 40) : candidatesWanted;
  for (let era = 0; era <= n / eraLength + 1; era++) {
    eraShiftY.push(normal(random) * 0.8);
    eraShiftX.push(Array.from({ length: candidates }, () => normal(random)));
  }
  const exposures: number[][] = Array.from({ length: candidates }, () => new Array<number>(n));
  const common = new Array<number>(n);
  for (let k = 0; k < candidates; k++) {
    let state = normal(random);
    for (let i = 0; i < n; i++) {
      state = phiX * state + Math.sqrt(1 - phiX * phiX) * normal(random);
      exposures[k]![i] = state;
    }
  }
  let commonState = normal(random);
  for (let i = 0; i < n; i++) { commonState = 0.5 * commonState + Math.sqrt(0.75) * normal(random); common[i] = commonState; }
  const rows: ObservationRow[] = [];
  const present: boolean[][] = Array.from({ length: candidates }, () => new Array<boolean>(n));
  let latent = normal(random);
  for (let i = 0; i < n; i++) {
    latent = phiY * latent + Math.sqrt(1 - phiY * phiY) * normal(random);
    const era = Math.floor(i / eraLength), progress = n > 1 ? i / (n - 1) : 0;
    for (let k = 0; k < candidates; k++) {
      let value = exposures[k]![i]!;
      if (scenario === "spurious_trend") value += (k % 2 ? -1 : 1) * 3 * progress;
      if (scenario === "routine_change") value += eraShiftX[era]![k]!;
      if (scenario === "many_candidates") value = 0.6 * common[i]! + 0.8 * value;
      if (scenario === "outliers" && random() < 0.03) value += (random() < 0.5 ? -1 : 1) * 25;
      exposures[k]![i] = value;
    }
    let logit = -1 + 0.7 * latent;
    if (scenario === "spurious_trend") logit += 2 * progress - 1;
    if (scenario === "routine_change") logit += eraShiftY[era]!;
    if (scenario === "true_effect") logit += 0.9 * exposures[0]![i]!;
    if (scenario === "moderate_effect") logit += 0.45 * exposures[0]![i]!;
    const comparable = 1 + Math.floor(random() * 6);
    let declines = 0;
    for (let c = 0; c < comparable; c++) if (random() < logistic(logit)) declines++;
    if (scenario === "outliers" && random() < 0.02) declines = comparable;
    const y = declines / comparable;
    for (let k = 0; k < candidates; k++) {
      const missing = scenario === "selective_absence" ? (y >= 0.5 ? 0.6 : 0.1) : 0.2;
      present[k]![i] = random() >= missing;
    }
    rows.push({ date: dates[i]!, y, ySensitivity: y, routineKey: scenario === "routine_change" ? `routine-${era}` : "routine-0" });
  }
  return { rows, exposures, present, candidates };
}

function wilsonUpper(successes: number, total: number) {
  if (!total) return 1;
  const z = 1.96, p = successes / total, denominator = 1 + z * z / total;
  return Math.min(1, (p + z * z / (2 * total) + z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total))) / denominator);
}

/** Runs the same policy the read model uses, at each update of the last year, without choosing among candidates or looks. Yields after each history so a long campaign can release its event loop. */
export function* calibrationSteps(scenario: CalibrationScenario, config: CalibrationConfig): Generator<number, CalibrationResult, void> {
  const months = config.months ?? 24, looks = config.looks ?? 12, wanted = config.candidates ?? 12, permutations = config.permutations ?? 199;
  let exploratoryHistories = 0, strictHistories = 0, plantedStrict = 0, plantedExploratory = 0, pairs = 0, candidatesUsed = wanted;
  for (let history = 0; history < config.histories; history++) {
    const data = simulate(scenario, (config.seed + Math.imul(history + 1, 0x9e3779b1)) >>> 0, months, wanted);
    candidatesUsed = data.candidates;
    let anyExploratory = false, anyStrict = false, plantedS = false, plantedE = false;
    for (let look = 0; look < looks; look++) {
      const fraction = (months - looks + look + 1) / months;
      const rows = data.rows.slice(0, Math.floor(data.rows.length * fraction));
      const candidates: Candidate[] = data.exposures.map((series, k) => {
        const values = new Map<string, number>();
        rows.forEach((row, index) => { if (data.present[k]![index]) values.set(row.date, series[index]!); });
        return { values, exclusions: {}, definition: { id: `synthetic:${k}`, family: "metric", window: "same_day", subject: String(k), temporalBasis: "same_day_unordered" } };
      });
      const result = evaluateAssociations(rows, candidates, { permutations, seed: (config.seed ^ history) >>> 0 });
      for (const item of result.items) {
        if (item.state === "exploratory") { anyExploratory = true; if (item.id === "synthetic:0") plantedE = true; }
        if (item.strictGate) { anyStrict = true; if (item.id === "synthetic:0") plantedS = true; }
      }
      if (look === looks - 1) pairs += result.items[0]?.pairs ?? 0;
    }
    if (anyExploratory) exploratoryHistories++;
    if (anyStrict) strictHistories++;
    if (plantedS) plantedStrict++;
    if (plantedE) plantedExploratory++;
    yield history;
  }
  const total = config.histories, planted = scenario === "true_effect" || scenario === "moderate_effect";
  return { scenario, histories: total, looks, candidates: candidatesUsed, permutations, meanPairsAtLastLook: total ? pairs / total : 0,
    anyExploratory: total ? exploratoryHistories / total : 0, anyStrictGate: total ? strictHistories / total : 0, strictGateWilsonUpper95: wilsonUpper(strictHistories, total),
    plantedStrictGate: planted && total ? plantedStrict / total : null, plantedExploratory: planted && total ? plantedExploratory / total : null };
}

export function runCalibration(scenario: CalibrationScenario, config: CalibrationConfig): CalibrationResult {
  const steps = calibrationSteps(scenario, config);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
