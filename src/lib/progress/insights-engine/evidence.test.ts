import { describe, expect, it } from "vitest";
import { parsePerformanceInsights } from "../../mobile-api/performance-insights-contract";
import { exerciseSubset, insightsExerciseEvidence } from "./evidence";
import { createInsightsSnapshot, insightsSummary } from "./read-model";
import { syntheticHistory } from "./scale-fixture";
import type { InsightsSource } from "./types";

const profile = { years: 1, sessionsPerWeek: 3, exercises: 4, setsPerExercise: 3, catalog: 8, metrics: 2, mealsPerDay: 1 };
const today = "2030-01-01";
const id = (group: number, n: number) => `93670000-0000-4000-8${String(group).padStart(3, "0")}-${String(n).padStart(12, "0")}`;
const EXERCISE = id(1, 1), OTHER = id(1, 2);

type Set_ = [reps: number | null, load: number | null, completed?: boolean];
type Block = { exercise?: string; mode?: string; configuration?: string | null; sets: Set_[] };
/** A tiny history by hand: one session per day, in order, each with the blocks given. */
function history(days: Block[][]): InsightsSource {
  const source: InsightsSource = { sessions: [], exercises: [], sets: [], feelings: [], metricDefinitions: [], metricValues: [], meals: [] };
  const sessions = source.sessions as InsightsSource["sessions"][number][], exercises = source.exercises as InsightsSource["exercises"][number][], sets = source.sets as InsightsSource["sets"][number][];
  days.forEach((blocks, day) => {
    const date = `2029-03-${String(day + 1).padStart(2, "0")}`, session = id(2, day);
    sessions.push({ id: session, date, routineId: null, routineName: null, name: null, status: "completed", startedAt: `${date}T18:00:00.000Z`, endedAt: `${date}T19:00:00.000Z`, performanceLevel: null, painLevel: null, legacyEnergyLevel: null });
    blocks.forEach((block, index) => {
      const row = id(3, day * 10 + index);
      exercises.push({ id: row, sessionId: session, exerciseId: block.exercise ?? EXERCISE, name: "Press banca", implement: "barra", weightMode: block.mode ?? "Peso total", isCompleted: true,
        configuration: block.configuration === undefined ? "recorded:agarre medio" : block.configuration });
      block.sets.forEach(([reps, load, completed = true], n) => sets.push({ id: id(4, day * 100 + index * 10 + n), sessionExerciseId: row, actualReps: reps, actualLoad: load, isCompleted: completed, completedAt: `${date}T18:${String(10 + n).padStart(2, "0")}:00.000Z` }));
    });
  });
  return source;
}
const last = (source: InsightsSource) => source.sessions.at(-1)!.id;
const evidence = (source: InsightsSource, lane: "strict" | "partial" = "strict", exerciseId = EXERCISE, sessionId = last(source)) => insightsExerciseEvidence(source, { sessionId, exerciseId, lane }, { today, revision: "r1", method: 2 });
const result = (item: NonNullable<ReturnType<typeof evidence>["item"]>) => "status" in item ? item.status : item.reading;

describe("#367 evidencia de un ejercicio: la misma comparación que publicó Insights", () => {
  for (const captured of [false, true]) it(`names the reference, result and reason of the published fact, from the exercise's history alone${captured ? ", with known configuration" : ""}`, () => {
    const source = syntheticHistory(profile, 11, captured);
    const summary = insightsSummary(createInsightsSnapshot(source, { today, method: 2 }), { limit: 30 });
    const lanes = [
      ...summary.facts.days.flatMap(day => day.sessions.flatMap(session => session.exercises.map(row => ({ lane: "strict" as const, sessionId: session.sessionId, row, result: row.status as string })))),
      ...summary.partial.days.flatMap(day => day.sessions.flatMap(session => session.exercises.map(row => ({ lane: "partial" as const, sessionId: session.sessionId, row, result: row.reading as string })))),
    ];
    expect(lanes.length).toBeGreaterThan(20);
    expect(lanes.some(entry => entry.row.referenceSessionId)).toBe(true);
    for (const { lane, sessionId, row, result: published } of lanes) {
      const whole = insightsExerciseEvidence(source, { sessionId, exerciseId: row.exerciseId, lane }, { today, method: 2 });
      // The bounded read the route makes: only the sessions holding this exercise.
      const bounded = insightsExerciseEvidence(exerciseSubset(source, row.exerciseId), { sessionId, exerciseId: row.exerciseId, lane }, { today, method: 2 });
      expect(bounded).toEqual(whole);
      const item = whole.item!;
      expect(result(item)).toBe(published);
      expect(item.reason).toBe(row.reason);
      expect(item.reference?.sessionId ?? null).toBe(row.referenceSessionId);
      expect(item.reference?.date ?? null).toBe(row.referenceDate ?? null);
      expect(item.reference?.ageDays ?? null).toBe(row.referenceAgeDays);
      expect(item.current.sessionId).toBe(sessionId);
      expect(parsePerformanceInsights(JSON.parse(JSON.stringify(whole)))).toBeDefined();
    }
  });

  it("uses the compatible reference the comparator chose, not the last session", () => {
    // The day before was done with another grip: the reference is the older session with the same configuration.
    const source = history([[{ sets: [[8, 80]] }], [{ configuration: "recorded:agarre cerrado", sets: [[12, 80]] }], [{ sets: [[10, 80]] }]]);
    const item = evidence(source).item!;
    expect(item.reference?.sessionId).toBe(source.sessions[0]!.id);
    expect(item.reference?.date).toBe("2029-03-01");
    expect(result(item)).toBe("improved");
    expect(item.evidence).toEqual([expect.objectContaining({ kind: "reps_at_load", anchor: 80, current: 10, reference: 8, delta: 2 })]);
  });

  it("does not call more load with fewer reps an improvement", () => {
    const item = evidence(history([[{ sets: [[8, 80]] }], [{ sets: [[6, 85]] }]])).item!;
    expect(result(item)).not.toBe("improved");
    expect(item.reason).toBe("unanchored_evidence");
    expect(item.evidence).toEqual([]);
    // What was recorded on each side stays, in its own field and unit.
    expect(item.current.sets).toEqual([expect.objectContaining({ amount: 6, load: 85 })]);
    expect(item.reference!.sets).toEqual([expect.objectContaining({ amount: 8, load: 80 })]);
  });

  it("shows both signals of a crossed comparison and calls it mixed, with each signal on its own sets", () => {
    const source = history([[{ sets: [[8, 80], [10, 70]] }], [{ sets: [[10, 80], [8, 70]] }]]);
    const item = evidence(source).item!;
    expect(result(item)).toBe("ambiguous_evidence");
    expect(item.reason).toBe("crossed_signals");
    const signs = item.evidence.map(signal => Math.sign(signal.delta)).sort();
    expect(signs).toContain(1); expect(signs).toContain(-1);
    const current = new Set(item.current.sets.map(set => set.id)), reference = new Set(item.reference!.sets.map(set => set.id));
    for (const signal of item.evidence) {
      expect(signal.currentSetIds.length).toBeGreaterThan(0);
      expect(signal.currentSetIds.every(set => current.has(set)) && signal.referenceSetIds.every(set => reference.has(set))).toBe(true);
    }
  });

  it("keeps each mode in its own unit: lingotes, bodyweight reps and seconds are never kilograms", () => {
    for (const [mode, unit, kind] of [["Lingotes (no kg)", "lingotes", "reps_at_load"], ["Peso corporal", "reps", "bodyweight_reps"], ["Tiempo (segundos)", "seconds", "time"]] as const) {
      const sets: Set_[] = mode === "Lingotes (no kg)" ? [[8, 3]] : [[30, null]];
      const later: Set_[] = mode === "Lingotes (no kg)" ? [[10, 3]] : [[40, null]];
      const item = evidence(history([[{ mode, sets }], [{ mode, sets: later }]])).item!;
      expect(item.context?.unit).toBe(unit);
      expect(item.evidence.map(signal => signal.kind)).toEqual([kind]);
      expect(result(item)).toBe("improved");
    }
    // Another mode is another context: never compared, never summed.
    const mixed = evidence(history([[{ mode: "Peso total", sets: [[8, 80]] }], [{ mode: "Lingotes (no kg)", sets: [[8, 3]] }]])).item!;
    expect(mixed.reference).toBeNull();
    expect(result(mixed)).toBe("insufficient_comparison");
  });

  it("keeps the record apart from the result", () => {
    // A higher load than ever, with nothing to compare at the same load or reps: a record, not an improvement.
    const item = evidence(history([[{ sets: [[8, 80]] }], [{ sets: [[3, 100]] }]])).item!;
    expect(result(item)).not.toBe("improved");
    expect(item.records).toContainEqual(expect.objectContaining({ kind: "load", current: 100, previousMaximum: 80, isNewHigh: true }));
  });

  it("answers each lane in its own words, and only for exposures of that lane", () => {
    const unknown = history([[{ configuration: null, sets: [[8, 80]] }], [{ configuration: null, sets: [[9, 80]] }]]);
    const partial = evidence(unknown, "partial");
    expect(partial.partial).toMatchObject({ contextCompleteness: "configuration_unknown" });
    expect(partial.item && "reading" in partial.item && partial.item.reading).toBe("higher_record");
    expect(partial.item && "status" in partial.item).toBe(false);
    // In the strict lane the same exposure is not compared: its configuration is unknown.
    const strict = evidence(unknown, "strict").item!;
    expect(result(strict)).toBe("insufficient_comparison");
    expect(strict.reason).toBe("missing_context");
    // A known configuration belongs to the strict lane alone: the partial lane has no such row.
    expect(evidence(history([[{ sets: [[8, 80]] }], [{ sets: [[9, 80]] }]]), "partial").item).toBeNull();
  });

  it("lists every recorded set with its block and set number, whatever the order of their ids (#411)", () => {
    // Two blocks of the same exercise in one session. Ids run against the numbers: the last set has the smallest id.
    const date = "2029-03-02", earlier = "2029-03-01";
    const at = (day: string) => ({ routineId: null, routineName: null, name: null, status: "completed" as const, startedAt: `${day}T18:00:00.000Z`, endedAt: `${day}T19:00:00.000Z`, performanceLevel: null, painLevel: null, legacyEnergyLevel: null });
    const block = (row: string, session: string, order: number) => ({ id: row, sessionId: session, exerciseId: EXERCISE, name: "Press banca", implement: "barra", weightMode: "Peso total", isCompleted: true, configuration: "recorded:agarre medio", order });
    const set = (n: number, row: string, number: number, reps: number, completed = true) => ({ id: id(5, n), sessionExerciseId: row, actualReps: reps, actualLoad: 80, isCompleted: completed, completedAt: null, setNumber: number });
    const [a, b, r] = [id(3, 900), id(3, 800), id(3, 700)];
    const source: InsightsSource = { sessions: [{ id: id(2, 0), date: earlier, ...at(earlier) }, { id: id(2, 1), date, ...at(date) }],
      exercises: [block(r, id(2, 0), 1), block(a, id(2, 1), 2), block(b, id(2, 1), 5)],
      sets: [set(9, r, 1, 8), set(1, a, 3, 9, false), set(2, a, 2, 10), set(3, a, 1, 10), set(4, b, 1, 9)], feelings: [], metricDefinitions: [], metricValues: [], meals: [] };
    const item = evidence(source).item!;
    expect(result(item)).toBe("improved");
    // Every set, the incomplete one included, with where it sits for the person. The list keeps the comparator's id order.
    expect(item.current.sets.map(row => [row.id, row.blockId, row.blockOrder, row.setNumber, row.completed])).toEqual([
      [id(5, 1), a, 2, 3, false], [id(5, 2), a, 2, 2, true], [id(5, 3), a, 2, 1, true], [id(5, 4), b, 5, 1, true]]);
    expect(item.current.excludedSetIds).toEqual([id(5, 1)]);
    // The comparison is the comparator's, with or without the numbers.
    const unnumbered = { ...source, exercises: source.exercises.map(row => ({ ...row, order: undefined })), sets: source.sets.map(row => ({ ...row, setNumber: undefined })) };
    const plain = evidence(unnumbered).item!;
    expect({ ...plain, current: undefined, reference: undefined }).toEqual({ ...item, current: undefined, reference: undefined });
    expect(plain.current.sets.every(row => row.setNumber === null && row.blockOrder === null)).toBe(true);
    expect(parsePerformanceInsights(JSON.parse(JSON.stringify(evidence(source))))).toBeDefined();
  });

  it("is absent, not empty, for an exercise or session the history does not hold", () => {
    const source = history([[{ sets: [[8, 80]] }], [{ sets: [[9, 80]] }]]);
    expect(evidence(source, "strict", OTHER).item).toBeNull();
    expect(evidence(source, "strict", EXERCISE, id(2, 99)).item).toBeNull();
    expect(parsePerformanceInsights(JSON.parse(JSON.stringify(evidence(source, "strict", OTHER))))).toBeDefined();
  });

  it("is refused by the contract when a signal points at sets of neither side, or a lane speaks the other's words", () => {
    const body = JSON.parse(JSON.stringify(evidence(history([[{ sets: [[8, 80]] }], [{ sets: [[9, 80]] }]]))));
    expect(parsePerformanceInsights(body)).toBeDefined();
    const foreign = structuredClone(body); foreign.item.evidence[0].currentSetIds = ["otra"];
    expect(parsePerformanceInsights(foreign)).toBeUndefined();
    const words = structuredClone(body); words.item.reading = "higher_record";
    expect(parsePerformanceInsights(words)).toBeUndefined();
    const unit = structuredClone(body); unit.item.context.unit = "lb";
    expect(parsePerformanceInsights(unit)).toBeUndefined();
    const moved = structuredClone(body); moved.item.current.sessionId = id(2, 99);
    expect(parsePerformanceInsights(moved)).toBeUndefined();
    const number = structuredClone(body); number.item.current.sets[0].setNumber = 1.5;
    expect(parsePerformanceInsights(number)).toBeUndefined();
    const owner = structuredClone(body); delete owner.item.current.sets[0].blockId;
    expect(parsePerformanceInsights(owner)).toBeUndefined();
  });
});
