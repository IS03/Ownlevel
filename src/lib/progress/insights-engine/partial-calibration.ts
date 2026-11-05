import { buildPerformanceInsightsPartialV1, type PartialDay } from "../performance-insights/partial";
import type { PerformanceSession } from "../performance-insights/types";
import { evaluateAssociations } from "./associations";
import { seededRandom } from "./stats";
import type { Candidate, ObservationRow } from "./types";

/**
 * Whole partial pipeline over synthetic training: comparator, daily outcome and associations. Its figures never mix with those of
 * `calibration.ts`, which draws the outcome directly and measures the strict policy. Reads no personal data; the route never imports it.
 *
 * Every number below is an ASSUMPTION, because the real rate of unrecorded changes does not exist as data:
 * - `changeRate`: chance per exposure that the person switches variant (grip, bench) without recording it. The new variant persists.
 * - `variantReps`: reps a variant adds or removes, with a fixed sign per exercise. Two reps over ten is a visible change.
 * - `programChangeMonths`: all at once, half of the exercises switch and the candidates shift, as in a new program.
 * - `linkedToExposure`: on days when candidate 0 is high, the harder variant is used for that session alone.
 * - `effectReps`: a real effect of candidate 0 on reps, the only way the planted scenarios move performance.
 */
export const PARTIAL_SCENARIOS = {
  partial_no_changes: { changeRate: 0 },
  partial_changes_5: { changeRate: 0.05 },
  partial_changes_15: { changeRate: 0.15 },
  partial_changes_30: { changeRate: 0.3 },
  partial_program_changes: { changeRate: 0.05, programChangeMonths: 6 },
  partial_linked_to_exposure: { changeRate: 0, linkedToExposure: true },
  partial_true_effect_no_changes: { changeRate: 0, effectReps: 1 },
  partial_true_effect_changes_15: { changeRate: 0.15, effectReps: 1 },
  partial_weak_effect_no_changes: { changeRate: 0, effectReps: 0.2 },
  partial_weak_effect_changes_15: { changeRate: 0.15, effectReps: 0.2 },
} as const satisfies Record<string, { changeRate: number; programChangeMonths?: number; linkedToExposure?: boolean; effectReps?: number }>;
export type PartialScenario = keyof typeof PARTIAL_SCENARIOS;
const VARIANT_REPS = 2, CATALOG = 12, PER_SESSION = 6, SETS = 3, BASE_REPS = 10;

export type PartialCalibrationConfig = { histories: number; seed: number; months?: number; looks?: number; candidates?: number; permutations?: number };
export type PartialCalibrationResult = {
  scenario: PartialScenario; assumptions: { changeRate: number; variantReps: number; programChangeMonths: number | null; linkedToExposure: boolean; effectReps: number };
  histories: number; looks: number; candidates: number; permutations: number; meanPairsAtLastLook: number;
  /** Comparator: share of comparable readings whose two sides used different hidden variants. */
  readingsAcrossHiddenChange: number;
  /** Comparator: share of comparable readings that differ from the same training without variants, and those turned from higher to lower or back. */
  readingsChanged: number; readingsFlipped: number;
  /** Associations, at any update of the last year, without choosing among candidates or looks. */
  anyExploratory: number; anyStrictGate: number; strictGateWilsonUpper95: number;
  /** Only where candidate 0 moves the outcome, truly or through a linked hidden change. */
  plantedStrictGate: number | null; plantedExploratory: number | null;
};

function normal(random: () => number) {
  const u = Math.max(random(), 1e-12), v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const exerciseId = (index: number) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;

function simulate(scenario: PartialScenario, seed: number, months: number, candidates: number) {
  const settings: { changeRate: number; programChangeMonths?: number; linkedToExposure?: boolean; effectReps?: number } = PARTIAL_SCENARIOS[scenario];
  const random = seededRandom(seed);
  const signs = Array.from({ length: CATALOG }, () => (random() < 0.5 ? -1 : 1));
  const variant = new Array<number>(CATALOG).fill(0);
  const eraDays = settings.programChangeMonths ? Math.round(settings.programChangeMonths * 30.44) : Infinity;
  const days = Math.round(months * 30.44), start = Date.UTC(2020, 0, 1);
  const state = Array.from({ length: candidates }, () => normal(random));
  const eraShift = Array.from({ length: candidates }, () => normal(random));
  const observed: PerformanceSession[] = [], plain: PerformanceSession[] = [];
  const hidden = new Map<string, number>();
  const exposures: number[][] = Array.from({ length: candidates }, () => []);
  const present: boolean[][] = Array.from({ length: candidates }, () => []);
  let latent = normal(random), era = 0;
  for (let day = 0; day < days; day++) {
    if (random() >= 4 / 7) continue;
    if (Math.floor(day / eraDays) !== era) {
      era = Math.floor(day / eraDays);
      for (let k = 0; k < candidates; k++) eraShift[k] = normal(random);
      for (let index = 0; index < CATALOG; index++) if (random() < 0.5) variant[index] = 1 - variant[index]!;
    }
    latent = 0.3 * latent + Math.sqrt(1 - 0.09) * normal(random);
    for (let k = 0; k < candidates; k++) {
      state[k] = 0.3 * state[k]! + Math.sqrt(1 - 0.09) * normal(random);
      exposures[k]!.push(state[k]! + (settings.programChangeMonths ? eraShift[k]! : 0));
      present[k]!.push(random() >= 0.2);
    }
    const x0 = exposures[0]!.at(-1)!;
    const date = new Date(start + day * 86_400_000).toISOString().slice(0, 10), id = `s${observed.length}`;
    const chosen = new Set<number>();
    while (chosen.size < PER_SESSION) chosen.add(Math.floor(random() * CATALOG));
    const blocks: PerformanceSession["exercises"][number][] = [], plainBlocks: PerformanceSession["exercises"][number][] = [];
    for (const index of chosen) {
      if (random() < settings.changeRate) variant[index] = 1 - variant[index]!;
      const today = settings.linkedToExposure ? (x0 > 1 ? 1 : 0) : variant[index]!;
      hidden.set(`${id}:${exerciseId(index)}`, today);
      const context = { weightMode: "Peso total", unit: "kg" as const, implement: "barra", configuration: null };
      const sets: PerformanceSession["exercises"][number]["sets"][number][] = [], plainSets: typeof sets[number][] = [];
      for (let set = 0; set < SETS; set++) {
        const base = BASE_REPS + 0.8 * latent + normal(random) - (settings.effectReps ?? 0) * x0;
        const shift = settings.linkedToExposure ? -Math.abs(VARIANT_REPS) * today : signs[index]! * VARIANT_REPS * today;
        sets.push({ id: `${id}:${index}:${set}`, completed: true, amount: Math.max(0, Math.round(base + shift)), load: 60 });
        plainSets.push({ id: `${id}:${index}:${set}`, completed: true, amount: Math.max(0, Math.round(base)), load: 60 });
      }
      blocks.push({ id: `${id}:${index}`, exerciseId: exerciseId(index), completed: true, context, sets });
      plainBlocks.push({ id: `${id}:${index}`, exerciseId: exerciseId(index), completed: true, context, sets: plainSets });
    }
    const session = { id, date, routineId: settings.programChangeMonths ? `era-${era}` : "routine-0", status: "completed" as const, startedAt: `${date}T18:00:00.000Z`, endedAt: `${date}T19:00:00.000Z`, chronology: "verified" as const };
    observed.push({ ...session, exercises: blocks });
    plain.push({ ...session, exercises: plainBlocks });
  }
  return { observed, plain, hidden, exposures, present };
}

const comparison = (sessions: readonly PerformanceSession[]) => buildPerformanceInsightsPartialV1({ sessions, historyCoverage: "complete", exclusionDetail: "summary" });
const row = (day: PartialDay): ObservationRow | null => day.candidateLowerProportion === null ? null : { date: day.date, y: day.candidateLowerProportion, ySensitivity: day.equalSessionWeightSensitivity ?? day.candidateLowerProportion, routineKey: day.sessions[0]!.routineId };

function wilsonUpper(successes: number, total: number) {
  if (!total) return 1;
  const z = 1.96, p = successes / total, denominator = 1 + z * z / total;
  return Math.min(1, (p + z * z / (2 * total) + z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total))) / denominator);
}

export function* partialCalibrationSteps(scenario: PartialScenario, config: PartialCalibrationConfig): Generator<number, PartialCalibrationResult, void> {
  const months = config.months ?? 24, looks = config.looks ?? 12, wanted = config.candidates ?? 12, permutations = config.permutations ?? 199;
  const settings: { changeRate: number; programChangeMonths?: number; linkedToExposure?: boolean; effectReps?: number } = PARTIAL_SCENARIOS[scenario];
  let exploratoryHistories = 0, strictHistories = 0, plantedStrict = 0, plantedExploratory = 0, pairs = 0, comparable = 0, across = 0, changed = 0, flipped = 0;
  for (let history = 0; history < config.histories; history++) {
    const data = simulate(scenario, (config.seed + Math.imul(history + 1, 0x9e3779b1)) >>> 0, months, wanted);
    const result = comparison(data.observed), counterfactual = comparison(data.plain);
    const plainReading = new Map<string, string>(counterfactual.sessions.flatMap(session => session.exercises.map(exercise => [`${session.sessionId}:${exercise.exerciseId}`, exercise.reading] as const)));
    for (const session of result.sessions) for (const exercise of session.exercises) {
      if (exercise.reading !== "higher_record" && exercise.reading !== "same_record" && exercise.reading !== "lower_record") continue;
      comparable++;
      const key = `${session.sessionId}:${exercise.exerciseId}`, other = plainReading.get(key);
      if (exercise.reference && data.hidden.get(key) !== data.hidden.get(`${exercise.reference.sessionId}:${exercise.exerciseId}`)) across++;
      if (other !== exercise.reading) changed++;
      if ((other === "higher_record" && exercise.reading === "lower_record") || (other === "lower_record" && exercise.reading === "higher_record")) flipped++;
    }
    const indexByDate = new Map(data.observed.map((session, index) => [session.date!, index]));
    const allRows = result.days.map(row).filter((value): value is ObservationRow => !!value);
    let anyExploratory = false, anyStrict = false, plantedS = false, plantedE = false;
    for (let look = 0; look < looks; look++) {
      const fraction = (months - looks + look + 1) / months;
      const rows = allRows.slice(0, Math.floor(allRows.length * fraction));
      const candidates: Candidate[] = data.exposures.map((series, k) => {
        const values = new Map<string, number>();
        for (const { date } of rows) { const index = indexByDate.get(date)!; if (data.present[k]![index]) values.set(date, series[index]!); }
        return { values, exclusions: {}, definition: { id: `partial:synthetic:${k}`, family: "metric", window: "same_day", subject: String(k), temporalBasis: "same_day_unordered" } };
      });
      const evaluated = evaluateAssociations(rows, candidates, { permutations, seed: (config.seed ^ history) >>> 0 });
      for (const item of evaluated.items) {
        if (item.state === "exploratory") { anyExploratory = true; if (item.id === "partial:synthetic:0") plantedE = true; }
        if (item.strictGate) { anyStrict = true; if (item.id === "partial:synthetic:0") plantedS = true; }
      }
      if (look === looks - 1) pairs += evaluated.items[0]?.pairs ?? 0;
    }
    if (anyExploratory) exploratoryHistories++;
    if (anyStrict) strictHistories++;
    if (plantedS) plantedStrict++;
    if (plantedE) plantedExploratory++;
    yield history;
  }
  const total = config.histories, planted = !!settings.effectReps || !!settings.linkedToExposure;
  return { scenario, assumptions: { changeRate: settings.changeRate, variantReps: VARIANT_REPS, programChangeMonths: settings.programChangeMonths ?? null, linkedToExposure: !!settings.linkedToExposure, effectReps: settings.effectReps ?? 0 },
    histories: total, looks, candidates: wanted, permutations, meanPairsAtLastLook: total ? pairs / total : 0,
    readingsAcrossHiddenChange: comparable ? across / comparable : 0, readingsChanged: comparable ? changed / comparable : 0, readingsFlipped: comparable ? flipped / comparable : 0,
    anyExploratory: total ? exploratoryHistories / total : 0, anyStrictGate: total ? strictHistories / total : 0, strictGateWilsonUpper95: wilsonUpper(strictHistories, total),
    plantedStrictGate: planted && total ? plantedStrict / total : null, plantedExploratory: planted && total ? plantedExploratory / total : null };
}

export function runPartialCalibration(scenario: PartialScenario, config: PartialCalibrationConfig): PartialCalibrationResult {
  const steps = partialCalibrationSteps(scenario, config);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
