import { seededRandom } from "../insights-engine/stats";
import type { InsightsSource } from "../insights-engine/types";
import { prepareBodyWeeklyAssociations } from "./analysis";
import type { WeighIn } from "./weekly";

/**
 * Calibration of `insights-body-weekly/1`, preregistered in 367-evolucion-corporal-metodo.md. It simulates SOURCE rows (daily
 * weights, meals, sessions, exercises and sets) and runs the same code the method uses, from the weekly medians to the exposures.
 * Synthetic only: it never reads personal data and the routes never import it. Every number is an ASSUMPTION:
 * - weight is a weekly level, ~80 kg, moved by a weekly step of sd 0.3 kg; a weigh-in has an error of sd 0.4 kg, on half the days;
 * - meals are recorded on 70 % of the days, 1 to 3 a day, around 2200 kcal and 130 g of protein a day;
 * - 3 to 4 sessions a week, one exercise with 12 to 20 completed sets.
 */
export const BODY_SCENARIOS = {
  body_independent: {},
  body_autocorrelated: { phi: 0.6 },
  body_spurious_trend: { trend: true },
  body_routine_change: { eras: true },
  body_selective_absence: { selective: true },
  /** The calories of W−1 move the change W−1 → W: the only way an exposure moves the outcome. */
  body_planted_effect: { effect: 0.25 },
} as const satisfies Record<string, { phi?: number; trend?: boolean; eras?: boolean; selective?: boolean; effect?: number }>;
export type BodyScenario = keyof typeof BODY_SCENARIOS;
type Settings = { phi?: number; trend?: boolean; eras?: boolean; selective?: boolean; effect?: number };
export type BodyCalibrationConfig = { histories: number; seed: number; months?: number; looks?: number; permutations?: number };
export type BodyCalibrationResult = {
  scenario: BodyScenario; histories: number; looks: number; permutations: number; candidates: number;
  meanRowsAtLastLook: number; meanTestableAtLastLook: number; meanMealDaysPerWeek: number;
  anyExploratory: number; anyStrictGate: number; strictGateWilsonUpper95: number;
  /** The calories candidate, true in the planted scenario and false elsewhere. */
  caloriesExploratory: number; caloriesStrictGate: number;
};

function normal(random: () => number) {
  const u = Math.max(random(), 1e-12), v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const id = (group: number, n: number) => `00000000-0000-4000-8${String(group).padStart(3, "0")}-${n.toString(16).padStart(12, "0")}`;
const START = Date.UTC(2020, 0, 6); // a Monday

function simulate(settings: Settings, seed: number, months: number) {
  const random = seededRandom(seed);
  const weeks = Math.floor(months * 30.44 / 7), phi = settings.phi ?? 0;
  const sessions: InsightsSource["sessions"][number][] = [], exercises: InsightsSource["exercises"][number][] = [], sets: InsightsSource["sets"][number][] = [], meals: InsightsSource["meals"][number][] = [];
  const weights: WeighIn[] = [];
  let level = 80, step = 0, calorieState = 0, era = 0, eraCalories = 0, eraSessions = 0, eraDrift = 0, previousCalories: number | null = null;
  for (let week = 0; week < weeks; week++) {
    if (settings.eras && Math.floor(week / 26) !== era) { era = Math.floor(week / 26); eraCalories = normal(random) * 300; eraSessions = normal(random) * 0.8; eraDrift = normal(random) * 0.25; }
    const progress = week / weeks;
    calorieState = (settings.phi ? phi : 0) * calorieState + Math.sqrt(1 - (settings.phi ? phi * phi : 0)) * normal(random);
    const calorieMean = 2200 + 200 * calorieState + eraCalories + (settings.trend ? 600 * progress : 0);
    step = phi * step + Math.sqrt(1 - phi * phi) * normal(random);
    let delta = 0.3 * step + eraDrift + (settings.trend ? 0.08 : 0);
    // The planted effect: last week's recorded calories move this week's level.
    if (settings.effect && previousCalories !== null) delta += settings.effect * (previousCalories - 2200) / 300;
    level += delta;
    const rising = delta > 0;
    let recordedCalories = 0, recordedDays = 0;
    for (let day = 0; day < 7; day++) {
      const date = new Date(START + (week * 7 + day) * 86_400_000).toISOString().slice(0, 10);
      if (random() < (settings.selective && rising ? 0.25 : 0.5)) weights.push({ date, value: Math.round((level + 0.4 * normal(random)) * 100) / 100 });
      if (random() < (settings.selective && rising ? 0.4 : 0.7)) {
        const count = 1 + Math.floor(random() * 3), total = Math.max(800, calorieMean + 300 * normal(random));
        for (let meal = 0; meal < count; meal++) meals.push({ id: id(3, meals.length), date, consumedAt: null, consumedAtSource: null, rawInput: null, entryKind: "meal", sourceType: "manual", importRunId: null,
          calories: Math.round(total / count), proteinG: Math.round((130 + 25 * normal(random)) / count), carbsG: 200 / count, fatG: 70 / count });
        recordedCalories += total; recordedDays++;
      }
      if (random() < Math.min(0.95, Math.max(0.05, (3.5 + (settings.eras ? eraSessions : 0)) / 7))) {
        const session = id(2, sessions.length), row = id(4, sessions.length);
        sessions.push({ id: session, date, routineId: settings.eras ? `era-${era}` : "r", routineName: null, name: null, status: "completed", startedAt: `${date}T18:00:00.000Z`, endedAt: `${date}T19:00:00.000Z`, performanceLevel: null, painLevel: null, legacyEnergyLevel: null });
        exercises.push({ id: row, sessionId: session, exerciseId: id(1, 1), name: "E", implement: "barra", weightMode: "Peso total", isCompleted: true, configuration: null });
        for (let set = 0, n = 12 + Math.floor(random() * 9); set < n; set++) sets.push({ id: id(5, sets.length), sessionExerciseId: row, actualReps: 8, actualLoad: 60, isCompleted: true, completedAt: null });
      }
    }
    previousCalories = recordedDays ? recordedCalories / recordedDays : null;
  }
  const source: InsightsSource = { sessions, exercises, sets, feelings: [], metricDefinitions: [], metricValues: [], meals };
  return { source, weights, weeks };
}

function wilsonUpper(successes: number, total: number) {
  if (!total) return 1;
  const z = 1.96, p = successes / total, denominator = 1 + z * z / total;
  return Math.min(1, (p + z * z / (2 * total) + z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total))) / denominator);
}
const dateOf = (week: number) => new Date(START + week * 7 * 86_400_000).toISOString().slice(0, 10);

export function* bodyCalibrationSteps(scenario: BodyScenario, config: BodyCalibrationConfig): Generator<number, BodyCalibrationResult, void> {
  const months = config.months ?? 24, looks = config.looks ?? 12, permutations = config.permutations ?? 199;
  const settings: Settings = BODY_SCENARIOS[scenario];
  let exploratory = 0, strict = 0, caloriesE = 0, caloriesS = 0, rows = 0, testable = 0, mealDays = 0, weeksSeen = 0;
  for (let history = 0; history < config.histories; history++) {
    const data = simulate(settings, (config.seed + Math.imul(history + 1, 0x9e3779b1)) >>> 0, months);
    const seen = { e: false, s: false, ce: false, cs: false };
    for (let look = 0; look < looks; look++) {
      // Monthly updates over the last year: the period runs from the first Monday to the day before the look, which is "today".
      const lastWeek = Math.floor(data.weeks * (months - looks + look + 1) / months);
      const today = dateOf(lastWeek), end = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      const prepared = prepareBodyWeeklyAssociations(data.source, data.weights, { start: dateOf(0), end }, today);
      const result = prepared.evaluate(permutations, (config.seed ^ history) >>> 0);
      for (const item of result.items) {
        const calories = item.id === "body_week:calories:previous_week";
        if (item.state === "exploratory") { seen.e = true; if (calories) seen.ce = true; }
        if (item.strictGate) { seen.s = true; if (calories) seen.cs = true; }
      }
      if (look === looks - 1) {
        rows += prepared.rows.length; testable += result.testable;
        for (const value of prepared.coverage.values()) { mealDays += value; weeksSeen++; }
      }
    }
    if (seen.e) exploratory++; if (seen.s) strict++; if (seen.ce) caloriesE++; if (seen.cs) caloriesS++;
    yield history;
  }
  const total = config.histories, share = (value: number) => total ? value / total : 0;
  return { scenario, histories: total, looks, permutations, candidates: 4, meanRowsAtLastLook: share(rows), meanTestableAtLastLook: share(testable), meanMealDaysPerWeek: weeksSeen ? mealDays / weeksSeen : 0,
    anyExploratory: share(exploratory), anyStrictGate: share(strict), strictGateWilsonUpper95: wilsonUpper(strict, total), caloriesExploratory: share(caloriesE), caloriesStrictGate: share(caloriesS) };
}

export function runBodyCalibration(scenario: BodyScenario, config: BodyCalibrationConfig): BodyCalibrationResult {
  const steps = bodyCalibrationSteps(scenario, config);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
