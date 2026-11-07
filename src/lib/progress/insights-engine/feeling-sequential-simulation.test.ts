import { describe, expect, it } from "vitest";
import { buildExposureContext } from "./exposures";
import { prepareFeelingAssociations } from "./feeling-outcomes";
import { eligibleCandidates, evaluateSequential, NIGHT_NOT_SHOWN_BEFORE, scheduledDates, sequentialAnalysis } from "./feeling-sequential";
import { addCalendarMonths, midnight, runSimulatedHistory, simulateSequential, sourceAvailableBefore, SLEEP_METRIC, type SequentialSimulation } from "./feeling-sequential-simulation";
import type { InsightsSource } from "./types";

const input = (simulation: SequentialSimulation, today: string) => {
  const source = sourceAvailableBefore(simulation, today), context = buildExposureContext(source);
  return prepareFeelingAssociations(source, "energy", { today, context, method: 2 });
};
const compact = (p: ReturnType<typeof input>) => ({ rows: p.rows, candidates: p.candidates.map(c => ({ definition: c.definition, values: [...c.values], exclusions: c.exclusions })) });
const makeMeal = (date: string, at: string | null, carbs: number | null, source = "user_declared"): InsightsSource["meals"][number] => ({
  id: `m-${at}-${carbs}-${source}`, date, consumedAt: at, consumedAtSource: source, entryKind: "meal", sourceType: "manual", rawInput: null,
  importRunId: null, calories: 500, proteinG: 25, fatG: 10, carbsG: carbs,
});

describe("#367 sequential source simulator (development seeds only, no reserved results)", () => {
  it("generates midnight meals, uncertain provenance, missing independent nutrients and declared sleep from source rows", () => {
    const sim = simulateSequential("independent", 13);
    expect(sim.source.sessions.some(s => s.startedAt!.includes("T00:45"))).toBe(true);
    expect(sim.source.sessions.some(s => s.startedAt!.includes("T00:45") && sim.source.meals.some(m => m.date! < s.date!
      && m.consumedAt !== null && Date.parse(m.consumedAt) >= Date.parse(s.startedAt!) - 3 * 3_600_000 && Date.parse(m.consumedAt) < Date.parse(s.startedAt!)))).toBe(true);
    expect(sim.source.meals.some(m => m.consumedAtSource === "registration_now")).toBe(true);
    expect(sim.source.meals.some(m => m.consumedAtSource === "default_clock")).toBe(true);
    expect(sim.source.meals.some(m => m.consumedAtSource === null)).toBe(true);
    expect(sim.source.meals.some(m => m.consumedAt === null)).toBe(true);
    for (const field of ["calories", "proteinG", "carbsG", "fatG"] as const) expect(sim.source.meals.some(m => m[field] === null)).toBe(true);
    const p = input(sim, "2021-01-20"), filtered = eligibleCandidates(p.candidates);
    expect(filtered.eligible).toHaveLength(12);
    expect(filtered.excluded).toHaveLength(14);
    expect(filtered.excluded.some(c => c.reason === NIGHT_NOT_SHOWN_BEFORE)).toBe(true);
    expect(filtered.eligible.some(c => c.definition.subject === SLEEP_METRIC)).toBe(false);
    expect(filtered.eligible.filter(c => c.definition.family === "meal_window").every(c => c.values.size > 0)).toBe(true);
  });

  it("uses the exact [start-3h,start) boundary across Córdoba midnight, keeps zero and excludes partial carbs", () => {
    const sim = simulateSequential("independent", 17), source = structuredClone(sim.source);
    const session = source.sessions.find(s => s.startedAt!.includes("T00:45") && source.feelings.some(f => f.sessionId === s.id && (f.facts as Record<string, unknown>).energyPre))!;
    const day = session.date!, previous = new Date(midnight(day) - 12 * 3_600_000).toISOString().slice(0, 10);
    const start = Date.parse(session.startedAt!), at = (offset: number) => new Date(start + offset * 3_600_000).toISOString();
    const build = (meals: InsightsSource["meals"]) => {
      const replaced = { ...source, meals }, p = prepareFeelingAssociations(replaced, "energy", { today: "2023-03-01", method: 2, context: buildExposureContext(replaced) });
      return p.candidates.find(c => c.definition.id.endsWith("meal_window:carbsG:pre_3h"))!;
    };
    expect(build([makeMeal(previous, at(-3), 20), makeMeal(previous, at(-3.01), 999), makeMeal(day, at(0), 888)]).values.get(day)).toBe(20);
    expect(build([makeMeal(previous, at(-1), 0)]).values.get(day)).toBe(0);
    expect(build([makeMeal(previous, at(-1), null)]).values.has(day)).toBe(false);
    expect(build([makeMeal(previous, at(-1), 20, "registration_now")]).values.has(day)).toBe(false);
    // A missing unrelated nutrient does not make known carbohydrates missing.
    expect(build([{ ...makeMeal(previous, at(-1), 25), proteinG: null }]).values.get(day)).toBe(25);
    // Preserve, and do not silently fix, the published session-date scope for uncertain carbohydrate meals.
    expect(build([makeMeal(previous, at(-1), 25), makeMeal(previous, null, 999)]).values.get(day)).toBe(25);
  });

  it("every scheduled look uses exactly its prefix; appending/replacing future rows cannot change it", () => {
    const sim = simulateSequential("independent", 19), cut = "2020-10-08", prefix = sourceAvailableBefore(sim, cut), before = compact(input(sim, cut));
    const later = structuredClone(sim);
    later.source = { ...later.source,
      sessions: later.source.sessions.map(s => s.date! >= cut ? { ...s, routineId: "future-routine" } : s),
      feelings: later.source.feelings.map(f => later.source.sessions.find(s => s.id === f.sessionId)!.date! >= cut ? { ...f, facts: {} } : f),
      metricValues: later.source.metricValues.map(v => v.date >= cut ? { ...v, value: 999_999 } : v),
      meals: later.source.meals.map(m => m.date >= cut ? { ...m, carbsG: 999_999 } : m),
    };
    expect(compact(input(later, cut))).toEqual(before);
    expect(prefix.sessions.every(s => s.date! < cut && Date.parse(s.endedAt!) < midnight(cut))).toBe(true);
    expect(prefix.meals.every(m => sim.availableAt.meals.get(m.id)! < midnight(cut))).toBe(true);
    const p = input(sim, cut), filtered = eligibleCandidates(p.candidates);
    const a = evaluateSequential(p.rows, filtered.eligible, 3, { maxPermutations: 19, seed: 19 });
    const q = input(later, cut), b = evaluateSequential(q.rows, eligibleCandidates(q.candidates).eligible, 3, { maxPermutations: 19, seed: 19 });
    expect(a).toEqual(b);
  });

  it("does not accept a late-arriving old-date value before it was received", () => {
    const sim = simulateSequential("independent", 23), meal = sim.source.meals.find(m => m.date === "2020-02-01")!;
    sim.availableAt.meals.set(meal.id, midnight("2020-04-01"));
    expect(sourceAvailableBefore(sim, "2020-03-01").meals.some(m => m.id === meal.id)).toBe(false);
    expect(sourceAvailableBefore(sim, "2020-04-02").meals.some(m => m.id === meal.id)).toBe(true);
  });

  it("all twelve calendar looks exclude source rows unavailable at their cut, even when future values are extreme", () => {
    const sim = simulateSequential("independent", 37), anchor = input(sim, "2020-02-06").rows[0]!.date;
    const dates = scheduledDates(anchor, addCalendarMonths(anchor, 36));
    expect(dates).toHaveLength(12);
    for (const cut of dates) {
      const prefix = sourceAvailableBefore(sim, cut), poisoned = structuredClone(sim);
      poisoned.source = { ...poisoned.source, metricValues: poisoned.source.metricValues.map(v => v.date >= cut ? { ...v, value: 1e9 } : v),
        meals: poisoned.source.meals.map(m => m.date >= cut ? { ...m, consumedAtSource: "user_declared", carbsG: 1e9 } : m) };
      expect(compact(input(poisoned, cut))).toEqual(compact(input(sim, cut)));
      expect(prefix.metricValues.every(v => v.date < cut && sim.availableAt.metrics.get(`${v.metricId}|${v.date}`)! < midnight(cut))).toBe(true);
      expect(prefix.feelings.every(f => sim.availableAt.feelings.get(f.sessionId)! < midnight(cut))).toBe(true);
    }
  });

  it("source-prefix calendar and evaluations agree with #419, including the anniversary (8 rather than 7 looks)", async () => {
    const seed = 29, sim = simulateSequential("independent", seed), result = await runSimulatedHistory("independent", 0, seed, { months: 24, maxPermutations: 7 });
    const today = addCalendarMonths(result.anchors.energy, 24), source = sourceAvailableBefore(sim, today);
    const reference = sequentialAnalysis(source, "energy", { today, method: 2, context: buildExposureContext(source), seed, everyLook: true, maxPermutations: 7 });
    expect(reference.history).toHaveLength(8);
    expect(result.looks.filter(l => l.kind === "energy").map(l => ({ date: l.date, look: l.look, permutations: l.permutations, passes: l.passes })))
      .toEqual(reference.history.map(l => ({ date: l.date, look: l.look, permutations: l.permutationsUsed, passes: l.items.filter(i => i.passes).map(i => i.id) })));
  });

  it("yields to the event loop between looks and reproduces the same synthetic history", async () => {
    let yielded = 0, timerFired = false; const timer = setTimeout(() => { timerFired = true; }, 0);
    const a = await runSimulatedHistory("reverse_same_day", 0, 31, { months: 6, maxPermutations: 3, onYield: () => { yielded++; } });
    clearTimeout(timer);
    expect(timerFired).toBe(true); expect(yielded).toBe(4);
    const b = await runSimulatedHistory("reverse_same_day", 0, 31, { months: 6, maxPermutations: 3 });
    expect({ ...a, wallMs: 0 }).toEqual({ ...b, wallMs: 0 });
  });
});
