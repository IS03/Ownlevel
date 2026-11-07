import { setImmediate as yieldThread } from "node:timers/promises";
import { buildExposureContext, previousDate } from "./exposures";
import { describeFeelingOutcome, prepareFeelingAssociations } from "./feeling-outcomes";
import { eligibleCandidates, evaluateSequential, scheduledDates, SEQUENTIAL_POLICY } from "./feeling-sequential";
import { PLANTED_METRIC, simulateSource, STRATIFIED_SCENARIOS } from "./feeling-stratified-calibration";
import { seededRandom } from "./stats";
import type { FeelingOutcomeKind, InsightsSource } from "./types";

/** Source-row simulation ONLY. No route/read model imports this module. All distributions are synthetic assumptions. */
export const SEQUENTIAL_SCENARIOS = [
  "independent", "autocorrelated", "trend", "routine_change", "unrecorded_change", "alternating_routines",
  "selective_absence", "uncertain_timing", "reverse_same_day",
  "previous_moderate", "previous_strong", "meal_moderate", "meal_strong",
] as const;
export type SequentialScenario = typeof SEQUENTIAL_SCENARIOS[number];
export const NULL_SCENARIOS = SEQUENTIAL_SCENARIOS.slice(0, 9);
export const SLEEP_METRIC = "00000000-0000-4000-8006-000000000099";
export const SIMULATION_START = "2020-01-06";
const DAY = 86_400_000, MINUTE = 60_000;
const isoDay = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
export const midnight = (date: string) => Date.parse(`${date}T00:00:00-03:00`);
export function addCalendarMonths(date: string, months: number) {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, last))).toISOString().slice(0, 10);
}
type Meal = InsightsSource["meals"][number];
export type SequentialSimulation = {
  source: InsightsSource;
  /** Synthetic reception/availability, separate from declared consumption/capture. Raw contracts do not acquire these fields. */
  availableAt: { metrics: Map<string, number>; meals: Map<string, number>; feelings: Map<string, number> };
};
const clip = (n: number) => Math.max(1, Math.min(5, n));
function gaussian(random: () => number) { return Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) * Math.cos(2 * Math.PI * random()); }

export function simulateSequential(scenario: SequentialScenario, seed: number): SequentialSimulation {
  const nullName = NULL_SCENARIOS.includes(scenario) ? scenario as keyof typeof STRATIFIED_SCENARIOS : "independent";
  // 37 months supply a buffer beyond the first eligible day's 36-month anniversary. No resampling on outcomes.
  const original = simulateSource(STRATIFIED_SCENARIOS[nullName], seed, 37);
  const random = seededRandom((seed ^ 0x74c93a21) >>> 0), meals: Meal[] = [], metricValues = [...original.metricValues];
  const sessions = original.sessions.map(session => {
    const dawn = random() < 0.2;
    return { ...session, startedAt: `${session.date}T${dawn ? "00:45" : "18:00"}:00-03:00`, endedAt: `${session.date}T${dawn ? "01:45" : "19:00"}:00-03:00` };
  });
  const sessionDates = new Map(sessions.map(s => [s.date!, s]));
  const availableAt: SequentialSimulation["availableAt"] = { metrics: new Map(), meals: new Map(), feelings: new Map() };
  const actualPreCarbs = new Map<string, number>();
  let carbsState = gaussian(random), mealNumber = 0;
  const originalFacts = new Map(original.feelings.map(f => [f.sessionId, f]));
  const postByDate = new Map(original.sessions.map(s => [s.date!, originalFacts.get(s.id)!]));
  for (let day = 0; day < Math.round(37 * 30.44); day++) {
    const date = new Date(Date.parse(SIMULATION_START + "T12:00:00Z") + day * DAY).toISOString().slice(0, 10), session = sessionDates.get(date);
    const phi = scenario === "autocorrelated" ? 0.7 : 0.3;
    carbsState = phi * carbsState + Math.sqrt(1 - phi * phi) * gaussian(random);
    const trend = scenario === "trend" ? 2 * day / Math.round(37 * 30.44) : 0;
    const era = scenario === "routine_change" || scenario === "unrecorded_change" ? Math.sin(Math.floor(day / 182) * 2.1) * 0.8 : 0;
    const alternating = scenario === "alternating_routines" && session ? session.routineId === "A" ? 0.8 : -0.8 : 0;
    const amount = Math.max(5, Math.min(140, Math.round(55 + 15 * (carbsState + trend + era + alternating))));
    actualPreCarbs.set(date, amount);
    const raw = postByDate.get(date)?.facts as Record<string, { value: number }> | undefined;
    const selective = scenario === "selective_absence" && (raw?.fatiguePost?.value ?? 0) >= 4;
    const times = [midnight(date) + 8 * 60 * MINUTE, session ? Date.parse(session.startedAt!) - 90 * MINUTE : midnight(date) + 15 * 60 * MINUTE,
      session ? Date.parse(session.endedAt!) + 30 * MINUTE : midnight(date) + 20 * 60 * MINUTE];
    for (let slot = 0; slot < times.length; slot++) {
      const instant = times[slot]!, mealDate = isoDay(instant), unsure = random() < (scenario === "uncertain_timing" ? 0.4 : 0.1);
      const uncertainSources = ["registration_now", "default_clock", null] as const;
      const source = unsure ? uncertainSources[Math.floor(random() * uncertainSources.length)]! : "user_declared";
      const missingTime = unsure && random() < 0.2;
      const carbMissing = random() < (selective ? 0.5 : 0.05), proteinMissing = random() < 0.08, fatMissing = random() < 0.08, caloriesMissing = random() < 0.04;
      const carbs = slot === 1 ? amount : Math.max(0, Math.round(45 + 10 * gaussian(random)));
      const protein = Math.max(0, Math.round(30 + 5 * gaussian(random))), fat = Math.max(0, Math.round(15 + 4 * gaussian(random)));
      const id = `simulation-meal-${mealNumber++}`;
      meals.push({ id, date: mealDate, consumedAt: missingTime ? null : new Date(instant).toISOString(), consumedAtSource: source,
        rawInput: null, entryKind: "meal", sourceType: "manual", importRunId: null,
        calories: caloriesMissing ? null : 4 * carbs + 4 * protein + 9 * fat, proteinG: proteinMissing ? null : protein,
        carbsG: carbMissing ? null : carbs, fatG: fatMissing ? null : fat });
      availableAt.meals.set(id, instant + 2 * MINUTE);
    }
    // Declared sleep is deliberately present, including before dawn sessions, and must remain OUT of the family.
    metricValues.push({ metricId: SLEEP_METRIC, date, value: Math.max(3, 7 + gaussian(random)), sleepNight: "declared" });
  }
  for (const metric of metricValues) availableAt.metrics.set(`${metric.metricId}|${metric.date}`, midnight(metric.date) + 23 * 60 * MINUTE + 50 * MINUTE);
  const previousMetric = new Map(original.metricValues.filter(v => v.metricId === PLANTED_METRIC).map(v => [v.date, Number(v.value)]));
  const byId = new Map(sessions.map(s => [s.id, s])), originalById = new Map(original.sessions.map(s => [s.id, s]));
  const strength = scenario.endsWith("moderate") ? 0.6 : scenario.endsWith("strong") ? 1.2 : 0;
  const feelings = original.feelings.map(row => {
    const session = byId.get(row.sessionId)!, originalSession = originalById.get(row.sessionId)!;
    const facts = Object.fromEntries(Object.entries(row.facts as Record<string, Record<string, unknown>>).map(([key, fact]) => {
      const offset = Date.parse(fact.capturedAt as string) - Date.parse(key.endsWith("Pre") ? originalSession.startedAt! : originalSession.endedAt!);
      const at = Date.parse(key.endsWith("Pre") ? session.startedAt! : session.endedAt!) + offset;
      return [key, { ...fact, capturedAt: new Date(at).toISOString() }];
    })) as Record<string, { value: number; capturedAt: string }>;
    const x = scenario.startsWith("previous_") ? previousMetric.get(previousDate(session.date!))
      : scenario.startsWith("meal_") ? ((actualPreCarbs.get(session.date!)! - 55) / 15) : undefined;
    if (x !== undefined && strength) {
      facts.energyPost = { ...facts.energyPost!, value: clip(facts.energyPost!.value + Math.round(strength * x)) };
      facts.fatiguePost = { ...facts.fatiguePost!, value: clip(facts.fatiguePost!.value - Math.round(strength * x)) };
    }
    availableAt.feelings.set(row.sessionId, Math.max(...Object.values(facts).map(f => Date.parse(f.capturedAt))) + MINUTE);
    return { ...row, facts };
  });
  return { source: { ...original, sessions, feelings, meals, metricValues,
    metricDefinitions: [...original.metricDefinitions, { id: SLEEP_METRIC, name: "Sueño", unit: "h", valueType: "decimal", archived: false, systemKey: "sleep" }] }, availableAt };
}

/** Prefix by synthetic reception, not just the date claimed by a value. Rebuild context from this prefix for every look. */
export function sourceAvailableBefore(simulation: SequentialSimulation, today: string): InsightsSource {
  const cut = midnight(today), { source, availableAt } = simulation;
  const sessions = source.sessions.filter(s => s.date! < today && s.endedAt !== null && Date.parse(s.endedAt) < cut), ids = new Set(sessions.map(s => s.id));
  const exercises = source.exercises.filter(e => ids.has(e.sessionId)), blocks = new Set(exercises.map(e => e.id));
  return { ...source, sessions, exercises, sets: source.sets.filter(s => blocks.has(s.sessionExerciseId) && s.completedAt !== null && Date.parse(s.completedAt) < cut),
    feelings: source.feelings.filter(f => ids.has(f.sessionId) && (availableAt.feelings.get(f.sessionId) ?? Infinity) < cut),
    metricValues: source.metricValues.filter(v => v.date < today && (availableAt.metrics.get(`${v.metricId}|${v.date}`) ?? Infinity) < cut),
    meals: source.meals.filter(m => m.date < today && (availableAt.meals.get(m.id) ?? Infinity) < cut) };
}

export type SimulatedLook = {
  kind: FeelingOutcomeKind; date: string; slot: number; look: number; permutations: number; passes: string[];
  passDetails: { id: string; rho: number | null; p: number | null; firstHalf: number | null; secondHalf: number | null; pairs: number; kept: number }[];
  rows: number; sessions: number; dayExclusions: Record<string, number>; excludedCandidates: Record<string, number>;
  candidates: { id: string; pairs: number; kept: number; exclusions: Record<string, number>; reason: string }[];
};
export type SimulatedHistory = { scenario: SequentialScenario; history: number; seed: number; anchors: Record<FeelingOutcomeKind, string>; looks: SimulatedLook[]; wallMs: number };

/** Same calendar and pair rule as sequentialAnalysis; evaluates ONLY prefixes. Hook used for deterministic low-cost harness tests. */
export async function runSimulatedHistory(scenario: SequentialScenario, history: number, seed: number, options: {
  months?: number; maxPermutations?: number; onYield?: () => void;
} = {}): Promise<SimulatedHistory> {
  const start = performance.now(), simulation = simulateSequential(scenario, seed), looks: SimulatedLook[] = [];
  const initialDate = addCalendarMonths(SIMULATION_START, 1), initial = sourceAvailableBefore(simulation, initialDate), initialContext = buildExposureContext(initial);
  const anchors = {} as Record<FeelingOutcomeKind, string>;
  for (const kind of ["energy", "fatigue"] as const) {
    const first = prepareFeelingAssociations(initial, kind, { today: initialDate, method: 2, context: initialContext }).rows[0]?.date;
    if (!first) throw new Error("No initial eligible day in the fixed buffer; do not resample");
    anchors[kind] = first;
    const last = addCalendarMonths(first, options.months ?? 36);
    if (midnight(last) > midnight(addCalendarMonths(SIMULATION_START, 37))) throw new Error("Source buffer exhausted");
    let look = 0, slot = 0;
    for (const today of scheduledDates(first, last)) {
      slot++;
      const source = sourceAvailableBefore(simulation, today), context = buildExposureContext(source);
      const prepared = prepareFeelingAssociations(source, kind, { today, method: 2, context }), filtered = eligibleCandidates(prepared.candidates);
      const days = new Set(prepared.rows.map(r => r.date));
      if (!filtered.eligible.some(c => [...c.values.keys()].filter(d => days.has(d)).length >= SEQUENTIAL_POLICY.minPairs)) { await yieldThread(); options.onYield?.(); continue; }
      look++;
      // Statistical implementation and policy remain byte-identical to #419. Reserved runs do not override the permutation budget.
      const result = evaluateSequential(prepared.rows, filtered.eligible, look, { seed, ...(options.maxPermutations !== undefined ? { maxPermutations: options.maxPermutations } : {}) });
      const excludedCandidates: Record<string, number> = {};
      for (const c of filtered.excluded) excludedCandidates[c.reason] = (excludedCandidates[c.reason] ?? 0) + 1;
      const sessions = source.sessions.length, summary = describeFeelingOutcome(source, kind, context, today);
      const dayExclusions = { ...summary.days.exclusions, post_late: summary.capture.late, post_capture_unknown: summary.capture.captureUnknown,
        post_unreadable: summary.sessions.unreadable, post_other_instrument: summary.sessions.otherInstrument, post_not_recorded: summary.sessions.notRecorded };
      looks.push({ kind, date: today, slot, look, permutations: result.permutationsUsed, passes: result.items.filter(i => i.passes).map(i => i.id),
        passDetails: result.items.filter(i => i.passes).map(i => ({ id: i.id, rho: i.rho, p: i.familyAdjustedP, firstHalf: i.firstHalfRho, secondHalf: i.secondHalfRho, pairs: i.pairs, kept: i.keptPairs })),
        rows: prepared.rows.length, sessions, dayExclusions, excludedCandidates,
        candidates: result.items.map(i => ({ id: i.id, pairs: i.pairs, kept: i.keptPairs,
          exclusions: filtered.eligible.find(c => c.definition.id === i.id)!.exclusions, reason: i.reason })) });
      await yieldThread(); options.onYield?.();
    }
  }
  return { scenario, history, seed, anchors, looks, wallMs: performance.now() - start };
}
