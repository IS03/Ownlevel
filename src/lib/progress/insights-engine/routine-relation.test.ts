import { describe, expect, it } from "vitest";
import { parsePerformanceInsights } from "../../mobile-api/performance-insights-contract";
import { createInsightsSnapshot, insightsRoutineRelation, insightsSummary } from "./read-model";
import { recentChanges, sessionChange } from "./performance-change";
import type { InsightsSource } from "./types";

/** #533 · synthetic history only: one routine, two exercises, meals around some sessions, one metric and sleep. */
const id = (n: number) => `53300000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ROUTINE = id(900), OTHER_ROUTINE = id(901), PRESS = id(800), ROW = id(801), STEPS = id(700), SLEEP = id(701);
type Plan = { date: string; press?: Array<[number, number]>; row?: Array<[number, number]>; carbs?: number; routine?: string };
// [load, reps]. The comment is the group the rules give each session.
const PLAN: Plan[] = [
  { date: "2026-10-01", press: [[20, 10]] },                                // not_compared: no reference yet
  { date: "2026-10-05", press: [[20, 11]], carbs: 60 },                    // up
  { date: "2026-10-09", press: [[20, 12]], carbs: 80 },                    // up
  { date: "2026-10-13", press: [[20, 12]] },                               // same
  { date: "2026-10-17", press: [[20, 11]], row: [[30, 10]], carbs: 20 },   // down
  { date: "2026-10-21", press: [[20, 12]], row: [[25, 10]] },              // mixed: reps up, load down
  { date: "2026-10-25", press: [[25, 12]] },                               // load_only
  { date: "2026-10-29", press: [[25, 11]], carbs: 30 },                    // down
  { date: "2026-11-01", press: [[25, 13]], carbs: 70 },                    // up, the day before is in another month
  { date: "2026-11-06", press: [[25, 14]] },                               // up
  { date: "2026-11-08", press: [[20, 9]], routine: OTHER_ROUTINE },        // another routine
];

function source(): InsightsSource {
  const sessions: InsightsSource["sessions"][number][] = [], exercises: InsightsSource["exercises"][number][] = [], sets: InsightsSource["sets"][number][] = [];
  const meals: InsightsSource["meals"][number][] = [], feelings: InsightsSource["feelings"][number][] = [];
  PLAN.forEach((plan, index) => {
    const sessionId = id(index + 1), start = `${plan.date}T18:00:00-03:00`;
    sessions.push({ id: sessionId, date: plan.date, routineId: plan.routine ?? ROUTINE, routineName: plan.routine ? "LEGS" : "PULL", name: null, status: "completed",
      startedAt: start, endedAt: `${plan.date}T19:00:00-03:00`, performanceLevel: null, painLevel: null, legacyEnergyLevel: null, dayWeightKg: null });
    for (const [key, exerciseId, rows] of [["p", PRESS, plan.press], ["r", ROW, plan.row]] as const) {
      if (!rows) continue;
      const blockId = `${sessionId}-${key}`;
      exercises.push({ id: blockId, sessionId, exerciseId, name: key === "p" ? "Remo" : "Jalón", implement: "maquina", weightMode: "Peso total", isCompleted: true, configuration: "recorded:prueba" });
      rows.forEach(([load, reps], set) => sets.push({ id: `${blockId}-${set}`, sessionExerciseId: blockId, actualReps: reps, actualLoad: load, isCompleted: true, completedAt: `${plan.date}T18:${10 + set}:00-03:00` }));
    }
    if (plan.carbs !== undefined) meals.push({ id: `m${index}`, date: plan.date, consumedAt: `${plan.date}T17:00:00-03:00`, rawInput: null, entryKind: "meal", sourceType: "manual",
      consumedAtSource: "user_declared", importRunId: null, calories: 400, proteinG: 30, carbsG: plan.carbs, fatG: 10 });
    feelings.push({ sessionId, revision: 1, facts: { energyPre: { value: 3 + (index % 2), declaredMoment: "pre", capturedAt: `${plan.date}T17:55:00-03:00`, instrumentVersion: "energy-fatigue/1", source: "mobile" } } });
  });
  // The day before 2026-11-01 is in October: two meals, complete. 2026-10-12 has a meal without protein: a partial sum.
  // 2026-10-20 has a meal recorded with zeros: a real zero.
  meals.push({ id: "prev-1", date: "2026-10-31", consumedAt: "2026-10-31T13:00:00-03:00", rawInput: null, entryKind: "meal", sourceType: "manual", consumedAtSource: "user_declared", importRunId: null, calories: 900, proteinG: 70, carbsG: 90, fatG: 30 },
    { id: "prev-2", date: "2026-10-31", consumedAt: "2026-10-31T21:00:00-03:00", rawInput: null, entryKind: "meal", sourceType: "manual", consumedAtSource: "user_declared", importRunId: null, calories: 800, proteinG: 80, carbsG: 70, fatG: 25 },
    { id: "partial", date: "2026-10-12", consumedAt: "2026-10-12T13:00:00-03:00", rawInput: null, entryKind: "meal", sourceType: "manual", consumedAtSource: "user_declared", importRunId: null, calories: 500, proteinG: null, carbsG: 50, fatG: 10 },
    { id: "zero", date: "2026-10-20", consumedAt: "2026-10-20T13:00:00-03:00", rawInput: null, entryKind: "meal", sourceType: "manual", consumedAtSource: "user_declared", importRunId: null, calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  return { sessions, exercises, sets, feelings, meals,
    metricDefinitions: [{ id: SLEEP, name: "Sueño", unit: "min", valueType: "decimal", archived: false, systemKey: "sleep", order: 2 }, { id: STEPS, name: "Pasos", unit: "pasos", valueType: "integer", archived: false, systemKey: null, order: 1 }],
    metricValues: [{ metricId: STEPS, date: "2026-10-04", value: 9000 }, { metricId: SLEEP, date: "2026-10-05", value: 420, sleepNight: "declared" }, { metricId: SLEEP, date: "2026-10-09", value: 400, sleepNight: "undeclared" }] };
}
const snapshot = () => createInsightsSnapshot(source(), { today: "2026-11-17", method: 2, revision: "r1" });
const sessionsById = (s: ReturnType<typeof snapshot>) => new Map(s.days.flatMap(day => day.sessions.map(row => [row.sessionId, row] as const)));

describe("cambio de la sesión y recientes (#533)", () => {
  it("the session change is the mean of its repetition changes, with how many exercises entered", () => {
    const s = sessionsById(snapshot());
    expect(s.get(id(2))!.change).toMatchObject({ state: "measured", pct: 10, eligible: 1, total: 1, directions: { up: 1, same: 0, down: 0 } });
    expect(s.get(id(1))!.change).toMatchObject({ state: "no_eligible", pct: null, eligible: 0, total: 1 });
    // Load signals stay apart: the session of 2026-10-21 measured +9.0909 % on one exercise and a load drop on the other.
    expect(s.get(id(6))!.change).toMatchObject({ pct: 9.0909, eligible: 1, total: 2, load: { up: 0, same: 0, down: 1 } });
    expect(sessionChange([{ change: { state: "measured", pct: 10, basis: "time", signals: 1, load: null } }])).toMatchObject({ state: "no_eligible", eligible: 0 });
  });
  it("recent results are the measured ones of the latest basis, oldest first, at most ten", () => {
    const summary = insightsSummary(snapshot());
    const press = summary.facts.exercises.find(row => row.exerciseId === PRESS)!;
    expect(press.recent!.basis).toBe("reps_at_load");
    // #533: the routines it was trained in, once, in the strict list only.
    expect(press.routineIds).toEqual([ROUTINE, OTHER_ROUTINE].sort());
    expect(summary.partial.exercises.every(row => !("routineIds" in row))).toBe(true);
    expect(press.recent!.items.map(row => row.date)).toEqual(["2026-10-05", "2026-10-09", "2026-10-13", "2026-10-17", "2026-10-21", "2026-10-29", "2026-11-01", "2026-11-06"]);
    // 2026-11-08 went back to 20 kg after 25 kg: nothing anchors it, so it is ambiguous and not a result.
    const rows = Array.from({ length: 14 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, sessionId: `s${i}`, change: { state: "measured" as const, pct: i, basis: "reps_at_load" as const, signals: 1, load: null } }));
    expect(recentChanges(rows).items.map(row => row.pct)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(recentChanges([...rows, { date: "2026-10-20", sessionId: "t", change: { state: "measured", pct: 5, basis: "time", signals: 1, load: null } }])).toEqual({ basis: "time", items: [{ date: "2026-10-20", pct: 5 }] });
  });
  it("the previous logical day crosses months and keeps none, zero and a partial sum apart", () => {
    const days = new Map(snapshot().days.map(day => [day.date, day]));
    expect(days.get("2026-11-01")!.context.previousDay).toEqual({ date: "2026-10-31", nutrition: { activeMeals: 2, calories: { recorded: 1700, missing: 0 }, proteinG: { recorded: 150, missing: 0 }, carbsG: { recorded: 160, missing: 0 }, fatG: { recorded: 55, missing: 0 } } });
    expect(days.get("2026-10-13")!.context.previousDay!.nutrition!.proteinG).toEqual({ recorded: 0, missing: 1 });
    expect(days.get("2026-10-21")!.context.previousDay!.nutrition!.proteinG).toEqual({ recorded: 0, missing: 0 });
    expect(days.get("2026-10-01")!.context.previousDay!.nutrition).toBeNull();
    expect(snapshot().relationContext.previousDayMetrics.get("2026-10-05")).toEqual([{ metricId: STEPS, value: 9000 }]);
  });
  it("the summary with the new fields still passes the contract", () => {
    expect(parsePerformanceInsights(insightsSummary(snapshot()))).toBeTruthy();
  });
});

describe("Relación de una rutina (#533)", () => {
  const relation = () => insightsRoutineRelation(snapshot(), ROUTINE);
  it("groups each session by the documented rule and keeps mixed, load-only and uncompared sessions apart", () => {
    const model = relation();
    expect(model.sessions.map(row => [row.date, row.group])).toEqual([
      ["2026-10-01", "not_compared"], ["2026-10-05", "up"], ["2026-10-09", "up"], ["2026-10-13", "same"], ["2026-10-17", "down"],
      ["2026-10-21", "mixed"], ["2026-10-25", "load_only"], ["2026-10-29", "down"], ["2026-11-01", "up"], ["2026-11-06", "up"]]);
    expect(model.counts).toEqual({ up: 4, same: 1, down: 2, mixed: 1, load_only: 1, not_compared: 1 });
    expect(model.routine).toEqual({ id: ROUTINE, name: "PULL" });
    expect(model.routines).toEqual([{ id: OTHER_ROUTINE, name: "LEGS", sessions: 1 }, { id: ROUTINE, name: "PULL", sessions: 10 }]);
    expect(model.sessions.find(row => row.date === "2026-10-05")).toMatchObject({ pct: 10, eligible: 1, total: 1, lanes: { strict: 1, partial: 0 } });
  });
  it("orders the factors the same way every time, the user's metrics last and in their order", () => {
    expect(relation().factors.map(row => row.key)).toEqual(["carbs_pre_3h", "last_meal_hours", "calories_day", "protein_previous_day", "calories_previous_day", "sleep_night_before", "energy_pre", `metric_previous_day:${STEPS}`]);
  });
  it("gives a median from three valid values in a group, none with two, and counts what is missing", () => {
    const carbs = relation().factors.find(row => row.key === "carbs_pre_3h")!;
    expect(carbs.unit).toBe("g");
    expect(carbs.groups.up).toEqual({ valid: 3, median: 70 });
    expect(carbs.groups.down).toEqual({ valid: 2, median: null });
    expect(carbs.valid).toBe(5);
    expect(carbs.valid + Object.values(carbs.missing).reduce((a, b) => a + b, 0)).toBe(10);
    const sleep = relation().factors.find(row => row.key === "sleep_night_before")!;
    expect(sleep.missing).toMatchObject({ night_undeclared: 1 });
    expect(sleep.valid).toBe(1);
  });
  it("a sleep metric of the person's own (system one archived) is the night before, by the loading convention", () => {
    const own = "53300000-0000-4000-8000-0000000000ee";
    const base = source();
    const custom = { ...base,
      metricDefinitions: [{ ...base.metricDefinitions[0]!, archived: true }, base.metricDefinitions[1]!, { id: own, name: "Sueño", unit: null, valueType: "duration", archived: false, systemKey: null, order: 3 }],
      metricValues: [...base.metricValues, // As the server reads them: every value without a declaration comes marked "undeclared".
      { metricId: own, date: "2026-10-05", value: 490, sleepNight: "undeclared" as const }, { metricId: own, date: "2026-10-09", value: 455, sleepNight: "undeclared" as const }] };
    const snap = createInsightsSnapshot(custom, { today: "2026-11-17", method: 2, revision: "r2" });
    const day = snap.days.find(row => row.date === "2026-10-05")!;
    expect(day.context.metrics.find(row => row.metricId === own)).toMatchObject({ value: 490, sleepNight: "declared" });
    const model = insightsRoutineRelation(snap, ROUTINE);
    const sleep = model.factors.find(row => row.key === "sleep_night_before")!;
    expect(sleep.metricId).toBe(own); expect(sleep.valid).toBe(2);
    // Read once, as sleep: it is not repeated among the previous-day metrics.
    expect(model.factors.filter(row => row.metricId === own)).toHaveLength(1);
  });
  it("answers an unknown routine with no sessions, never with another routine's", () => {
    const model = insightsRoutineRelation(snapshot(), id(999));
    expect(model.sessions).toEqual([]);
    expect(model.routine.name).toBeNull();
    expect(Object.values(model.counts).every(value => value === 0)).toBe(true);
  });
  it("passes the contract, which rejects a median on fewer than three values", () => {
    const model = relation();
    expect(parsePerformanceInsights(model)).toBeTruthy();
    const broken = structuredClone(model);
    broken.factors[0]!.groups.down = { valid: 2, median: 25 };
    expect(parsePerformanceInsights(broken)).toBeUndefined();
  });
});

describe("objetivo de cada día (18/11)", () => {
  it("publishes each day's own target and the day before's, and nothing when the reader sends none", () => {
    const base = source();
    const days = createInsightsSnapshot(base, { today: "2026-11-17", method: 2, revision: "t0" }).days;
    expect(days.every(day => day.context.target === undefined && day.context.previousDay?.target === undefined)).toBe(true);
    const withTargets = { ...base, dayTargets: [{ date: "2026-10-04", calories: 2300, proteinG: 150 }, { date: "2026-10-05", calories: 2600, proteinG: null }] };
    const day = createInsightsSnapshot(withTargets, { today: "2026-11-17", method: 2, revision: "t1" }).days.find(row => row.date === "2026-10-05")!;
    expect(day.context.target).toEqual({ calories: 2600, proteinG: null });
    expect(day.context.previousDay).toMatchObject({ date: "2026-10-04", target: { calories: 2300, proteinG: 150 } });
    // A day without a row has no recorded target: null, never today's or a zero.
    const other = createInsightsSnapshot(withTargets, { today: "2026-11-17", method: 2, revision: "t1" }).days.find(row => row.date === "2026-10-09")!;
    expect(other.context.target).toEqual({ calories: null, proteinG: null });
    expect(parsePerformanceInsights(JSON.parse(JSON.stringify(insightsSummary(createInsightsSnapshot(withTargets, { today: "2026-11-17", method: 2, revision: "t1" }), { limit: 30 }))))).toBeTruthy();
  });
});
