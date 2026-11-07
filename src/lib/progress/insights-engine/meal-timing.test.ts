import { describe, expect, it } from "vitest";
import { parsePerformanceInsights } from "../../mobile-api/performance-insights-contract";
import { buildExposureContext, buildExposureTable, strictOutcomeDays } from "./exposures";
import { createInsightsSnapshot, insightsRelations, insightsSummary } from "./read-model";
import { buildPerformanceInsightsV1 } from "../performance-insights";
import { toPerformanceSessions } from "./source-adapter";
import type { InsightsSource } from "./types";

const id = (group: number, n: number) => `93670000-0000-4000-8${String(group).padStart(3, "0")}-${String(n).padStart(12, "0")}`;
type Meal = { at: string | null; date?: string; time?: "explicit" | "registration" | "unverified" | "unknown"; calories?: number | null; protein?: number | null; carbs?: number | null };
/** One session per entry, on its logical date, starting at `start` (UTC) and lasting an hour. Meals carry their own provenance. */
function history(sessions: { date: string; start: string | null; meals?: Meal[] }[], sameDay = false): InsightsSource {
  const source: InsightsSource = { sessions: [], exercises: [], sets: [], feelings: [], metricDefinitions: [], metricValues: [], meals: [] };
  sessions.forEach((row, index) => {
    (source.sessions as InsightsSource["sessions"][number][]).push({ id: id(2, index), date: row.date, routineId: null, routineName: null, name: null, status: "completed",
      startedAt: row.start, endedAt: row.start ? new Date(Date.parse(row.start) + 3_600_000).toISOString() : null, performanceLevel: null, painLevel: null, legacyEnergyLevel: null });
    row.meals?.forEach((meal, n) => (source.meals as InsightsSource["meals"][number][]).push({ id: id(3, index * 10 + n), date: meal.date ?? row.date, consumedAt: meal.at,
      consumedAtSource: { explicit: "user_declared", registration: "registration_now", unverified: null, unknown: "default_clock" }[meal.time ?? "explicit"], rawInput: null, entryKind: "meal", sourceType: "manual", importRunId: null,
      calories: meal.calories === undefined ? 500 : meal.calories, proteinG: meal.protein === undefined ? 30 : meal.protein, carbsG: meal.carbs === undefined ? 60 : meal.carbs, fatG: 10 }));
  });
  if (sameDay) for (const session of source.sessions as InsightsSource["sessions"][number][]) (session as { date: string }).date = sessions[0]!.date;
  return source;
}
const context = (source: InsightsSource) => {
  const performance = buildPerformanceInsightsV1({ sessions: toPerformanceSessions(source).sessions, historyCoverage: "complete" });
  const byDate = new Map<string, { sessionId: string; routineId: null }[]>();
  for (const session of source.sessions) byDate.set(session.date!, [...(byDate.get(session.date!) ?? []), { sessionId: session.id, routineId: null }]);
  const days = [...byDate].map(([date, sessions]) => ({ date, sessions, outcome: 0.5, outcomeSensitivity: 0.5 }));
  return { table: buildExposureTable(source, days.length ? days : strictOutcomeDays(performance.days), "2030-01-01", buildExposureContext(source), true, 2, true) };
};
const pre = (source: InsightsSource, index = 0) => context(source).table.preStartBySession.get(id(2, index))!;

describe("#367 fase 2: alimentación antes del inicio", () => {
  it("sums protein and recorded calories across midnight in Córdoba when every meal has an explicit time, keeping a recorded zero (#413)", () => {
    // 01:00 in Córdoba; meals at 23:00 the day before, 00:30, one after the start and one 4 h before. All with explicit times.
    const source = history([{ date: "2029-03-02", start: "2029-03-02T01:00:00-03:00", meals: [
      { at: "2029-03-01T23:00:00-03:00", date: "2029-03-01", protein: 0, calories: 300 }, { at: "2029-03-02T00:30:00-03:00", protein: 25, calories: 200 },
      { at: "2029-03-02T01:30:00-03:00", protein: 40 }, { at: "2029-03-01T21:00:00-03:00", date: "2029-03-01", protein: 99 } ] }]);
    const facts = pre(source);
    expect(facts.proteinG).toEqual({ value: 25, state: "recorded" });
    expect(facts.calories).toEqual({ value: 500, state: "recorded" });
    expect(facts.lastExplicitMeal).toEqual({ hours: 0.5, state: "recorded", untimedInScope: false, unverifiedInScope: false });
    const zero = pre(history([{ date: "2029-03-02", start: "2029-03-02T10:00:00.000Z", meals: [{ at: "2029-03-02T09:00:00.000Z", protein: 0, calories: 0 }] }]));
    expect(zero.proteinG).toEqual({ value: 0, state: "recorded" });
    expect(zero.calories).toEqual({ value: 0, state: "recorded" });
  });

  it("does not publish a total at 01:00 when a meal without time from the day before could belong to the window (#413)", () => {
    const source = history([{ date: "2029-03-02", start: "2029-03-02T01:00:00-03:00", meals: [
      { at: "2029-03-02T00:15:00-03:00", protein: 20, calories: 250 }, { at: null, date: "2029-03-01", time: "unknown" }] }]);
    const facts = pre(source);
    expect(facts.proteinG).toEqual({ value: null, state: "untimed_meal_in_scope" });
    expect(facts.calories).toEqual({ value: null, state: "untimed_meal_in_scope" });
    expect(facts.lastExplicitMeal).toEqual({ hours: 0.75, state: "recorded", untimedInScope: true, unverifiedInScope: false });
    // An approximate registration time the day before is not an explicit one either.
    expect(pre(history([{ date: "2029-03-02", start: "2029-03-02T01:00:00-03:00", meals: [{ at: "2029-03-02T00:15:00-03:00" }, { at: "2029-03-01T20:00:00-03:00", date: "2029-03-01", time: "registration" }] }])).proteinG.state).toBe("untimed_meal_in_scope");
    // The carbohydrates keep their published rule, for compatibility.
    expect(context(source).table.carbsPre3hBySession.get(id(2, 0))).toEqual({ value: 60, state: "recorded" });
    // The experimental candidates use the same eligibility: that day is out of them.
    const candidates = context(source).table.candidates;
    for (const key of ["meal_window:proteinG:pre_3h", "meal_window:calories:pre_3h"]) {
      const candidate = candidates.find(row => row.definition.id === key)!;
      expect(candidate.values.size).toBe(0);
      expect(candidate.exclusions.untimed_meal_in_scope).toBe(1);
    }
    expect(candidates.find(row => row.definition.id === "meal_timing:hours_since_last_explicit:pre_start")!.exclusions.untimed_meal_in_scope).toBe(1);
  });

  it("leaves an afternoon window alone when the meal without time is from the day before (#413)", () => {
    const source = history([{ date: "2029-03-02", start: "2029-03-02T18:00:00-03:00", meals: [
      { at: "2029-03-02T16:00:00-03:00", protein: 35, calories: 450 }, { at: null, date: "2029-03-01", time: "unknown" }, { at: "2029-03-01T21:00:00-03:00", date: "2029-03-01", time: "registration" }] }]);
    const facts = pre(source);
    expect(facts.proteinG).toEqual({ value: 35, state: "recorded" });
    expect(facts.calories).toEqual({ value: 450, state: "recorded" });
    // The 12 h window starts at 06:00 the same day: it does not reach the day before either.
    expect(facts.lastExplicitMeal).toEqual({ hours: 2, state: "recorded", untimedInScope: false, unverifiedInScope: false });
    const candidates = context(source).table.candidates;
    expect(candidates.find(row => row.definition.id === "meal_window:proteinG:pre_3h")!.values.get("2029-03-02")).toBe(35);
    expect(candidates.find(row => row.definition.id === "meal_timing:hours_since_last_explicit:pre_start")!.values.get("2029-03-02")).toBe(2);
    // A meal without time on the session's own day still makes the window unknown.
    expect(pre(history([{ date: "2029-03-02", start: "2029-03-02T18:00:00-03:00", meals: [{ at: "2029-03-02T16:00:00-03:00" }, { at: null, time: "unknown" }] }])).proteinG.state).toBe("untimed_meal_in_scope");
  });

  it("never rebuilds calories from macros, and an unknown macro blocks its total only", () => {
    const facts = pre(history([{ date: "2029-03-02", start: "2029-03-02T10:00:00.000Z", meals: [{ at: "2029-03-02T08:00:00.000Z", calories: null, protein: 20, carbs: 50 }, { at: "2029-03-02T09:00:00.000Z", calories: 300, protein: 10 }] }]));
    expect(facts.calories).toEqual({ value: null, state: "partial_macro" });
    expect(facts.proteinG).toEqual({ value: 30, state: "recorded" });
  });

  it("does not take a registration time for an explicit one, nor place a meal it cannot", () => {
    const approximate = pre(history([{ date: "2029-03-02", start: "2029-03-02T10:00:00.000Z", meals: [{ at: "2029-03-02T09:00:00.000Z", time: "registration" }] }]));
    expect(approximate.proteinG.state).toBe("untimed_meal_in_scope");
    expect(approximate.lastExplicitMeal).toMatchObject({ hours: null, state: "no_explicit_meal_in_12h", untimedInScope: true });
    const unverified = pre(history([{ date: "2029-03-02", start: "2029-03-02T10:00:00.000Z", meals: [{ at: "2029-03-02T06:00:00.000Z" }, { at: "2029-03-02T09:00:00.000Z", time: "unverified" }] }]));
    expect(unverified.calories.state).toBe("unverified_meal_time_in_scope");
    // The explicit meal is still the last one recorded with an explicit time; the one it cannot place is said, not ignored.
    expect(unverified.lastExplicitMeal).toEqual({ hours: 4, state: "recorded", untimedInScope: false, unverifiedInScope: true });
  });

  it("looks back 12 h for the last explicit meal, also flags a meal without time the day before when the 12 h reach it, and keeps the carbohydrates' rule", () => {
    // 04:00 in Córdoba: the 12 h start at 16:00 the day before.
    const source = history([{ date: "2029-03-02", start: "2029-03-02T04:00:00-03:00", meals: [{ at: "2029-03-01T23:00:00-03:00", date: "2029-03-01" }, { at: null, date: "2029-03-01", time: "unknown" }] }]);
    const facts = pre(source);
    expect(facts.lastExplicitMeal).toEqual({ hours: 5, state: "recorded", untimedInScope: true, unverifiedInScope: false });
    // The 3 h windows keep the published rule: a meal with no instant the day before does not reach them.
    expect(facts.proteinG).toEqual({ value: null, state: "no_registered_meal" });
    expect(context(source).table.carbsPre3hBySession.get(id(2, 0))).toEqual({ value: null, state: "no_registered_meal" });
  });

  it("censors when no explicit meal is in the 12 h: never 12 h, never fasting", () => {
    const facts = pre(history([{ date: "2029-03-02", start: "2029-03-02T20:00:00.000Z", meals: [{ at: "2029-03-02T07:00:00.000Z" }] }]));
    expect(facts.lastExplicitMeal).toEqual({ hours: null, state: "no_explicit_meal_in_12h", untimedInScope: false, unverifiedInScope: false });
    expect(facts.proteinG).toEqual({ value: null, state: "no_registered_meal" });
    expect(pre(history([{ date: "2029-03-02", start: null }])).lastExplicitMeal.state).toBe("no_start_time");
  });

  it("builds its candidates only on request, and leaves days with several sessions out of them", () => {
    const meals = (date: string): Meal[] => [{ at: `${date}T08:00:00.000Z`, protein: 20 }];
    const source = history([{ date: "2029-03-02", start: "2029-03-02T10:00:00.000Z", meals: meals("2029-03-02") }, { date: "2029-03-02", start: "2029-03-02T18:00:00.000Z" }], true);
    const { table } = context(source);
    for (const index of [0, 1]) expect(table.preStartBySession.get(id(2, index))).toBeDefined();
    const ids = ["meal_window:proteinG:pre_3h", "meal_window:calories:pre_3h", "meal_timing:hours_since_last_explicit:pre_start"];
    for (const candidate of table.candidates.filter(row => ids.includes(row.definition.id))) expect(candidate.exclusions.multiple_sessions_day).toBeGreaterThan(0);
    expect(table.candidates.filter(row => ids.includes(row.definition.id))).toHaveLength(3);
    // The views never ask for them: the public families and their preparation are unchanged.
    const snapshot = createInsightsSnapshot(source, { today: "2030-01-01", method: 2 });
    for (const lane of [snapshot.strict, snapshot.partial.lane]) expect(lane.candidates.some(row => ids.some(value => row.definition.id.endsWith(value)))).toBe(false);
    expect(JSON.stringify(insightsRelations(snapshot))).not.toMatch(/proteinG:pre_3h|calories:pre_3h|hours_since_last_explicit/);
  });

  it("publishes the session context in the summary, and the contract checks it", () => {
    const source = history([{ date: "2029-03-02", start: "2029-03-02T10:00:00.000Z", meals: [{ at: "2029-03-02T08:00:00.000Z", protein: 20, calories: 0 }] }]);
    const body = JSON.parse(JSON.stringify(insightsSummary(createInsightsSnapshot(source, { today: "2030-01-01", method: 2 }))));
    const session = body.facts.days[0].sessions[0];
    expect(session.context.preStart).toEqual({ proteinG: { value: 20, state: "recorded" }, calories: { value: 0, state: "recorded" }, lastExplicitMeal: { hours: 2, state: "recorded", untimedInScope: false, unverifiedInScope: false } });
    expect(parsePerformanceInsights(body)).toBeDefined();
    // An older server does not send it.
    const older = structuredClone(body); delete older.facts.days[0].sessions[0].context.preStart;
    expect(parsePerformanceInsights(older)).toBeDefined();
    for (const tamper of [
      (b: typeof body) => { b.facts.days[0].sessions[0].context.preStart.proteinG.value = null; },
      (b: typeof body) => { b.facts.days[0].sessions[0].context.preStart.calories = { value: 5, state: "no_registered_meal" }; },
      (b: typeof body) => { b.facts.days[0].sessions[0].context.preStart.lastExplicitMeal.hours = 12.5; },
      (b: typeof body) => { b.facts.days[0].sessions[0].context.preStart.lastExplicitMeal = { hours: 12, state: "no_explicit_meal_in_12h", untimedInScope: false, unverifiedInScope: false }; },
    ]) { const copy = structuredClone(body); tamper(copy); expect(parsePerformanceInsights(copy)).toBeUndefined(); }
  });
});
