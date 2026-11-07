import { describe, expect, it } from "vitest";
import { parsePerformanceInsights } from "../../mobile-api/performance-insights-contract";
import { periodOf } from "./period";
import { createInsightsSnapshot, insightsPeriodSummary } from "./read-model";
import type { InsightsSource } from "./types";

const id = (group: number, n: number) => `93670000-0000-4000-8${String(group).padStart(3, "0")}-${String(n).padStart(12, "0")}`;
const EX = id(1, 1);
type Session = { date: string; routine?: string; routineName?: string; reps?: number; configuration?: string | null; post?: number };
function history(sessions: Session[], meals: { date: string; calories: number | null }[] = []): InsightsSource {
  const source: InsightsSource = { sessions: [], exercises: [], sets: [], feelings: [], metricDefinitions: [], metricValues: [], meals: [] };
  sessions.forEach((row, n) => {
    const session = id(2, n), block = id(3, n);
    (source.sessions as InsightsSource["sessions"][number][]).push({ id: session, date: row.date, routineId: row.routine ?? null, routineName: row.routineName ?? row.routine ?? null, name: null, status: "completed",
      startedAt: `${row.date}T18:00:00-03:00`, endedAt: `${row.date}T19:00:00-03:00`, performanceLevel: null, painLevel: null, legacyEnergyLevel: null });
    (source.exercises as InsightsSource["exercises"][number][]).push({ id: block, sessionId: session, exerciseId: EX, name: "Press", implement: "barra", weightMode: "Peso total", isCompleted: true,
      configuration: row.configuration === undefined ? null : row.configuration });
    (source.sets as InsightsSource["sets"][number][]).push({ id: id(4, n), sessionExerciseId: block, actualReps: row.reps ?? 8, actualLoad: 60, isCompleted: true, completedAt: `${row.date}T18:10:00-03:00` });
    if (row.post) (source.feelings as InsightsSource["feelings"][number][]).push({ sessionId: session, revision: 1, facts: {
      energyPost: { value: row.post, instrumentVersion: "energy-fatigue/1", declaredMoment: "post", declaredAt: null, capturedAt: `${row.date}T19:05:00-03:00`, source: "mobile" } } });
  });
  meals.forEach((meal, n) => (source.meals as InsightsSource["meals"][number][]).push({ id: id(5, n), date: meal.date, consumedAt: null, consumedAtSource: null, rawInput: null, entryKind: "meal", sourceType: "manual", importRunId: null,
    calories: meal.calories, proteinG: 30, carbsG: 50, fatG: 10 }));
  return source;
}
const summary = (source: InsightsSource, today: string, weights: { date: string; value: number }[] = []) => insightsPeriodSummary(createInsightsSnapshot(source, { today, method: 2, revision: "r1" }), weights);

describe("#367 fase 4: los últimos tres meses completos", () => {
  it("takes the three whole calendar months before the current one, across years and leap days", () => {
    expect(periodOf("2026-11-06")).toEqual({ start: "2026-08-01", end: "2026-10-31", months: ["2026-08", "2026-09", "2026-10"], days: 92 });
    expect(periodOf("2027-01-15")).toEqual({ start: "2026-10-01", end: "2026-12-31", months: ["2026-10", "2026-11", "2026-12"], days: 92 });
    expect(periodOf("2028-03-01")).toEqual({ start: "2027-12-01", end: "2028-02-29", months: ["2027-12", "2028-01", "2028-02"], days: 91 });
    // The 1st of a month never counts the month that just began.
    expect(periodOf("2026-12-01").end).toBe("2026-11-30");
  });

  it("counts only the period's sessions, keeps the two methods apart, and lists several sessions of a day", () => {
    const source = history([
      { date: "2026-07-31", reps: 6, configuration: "recorded:a" }, { date: "2026-08-03", reps: 8, configuration: "recorded:a" }, { date: "2026-08-10", reps: 9, configuration: "recorded:a" },
      { date: "2026-08-12", reps: 8 }, { date: "2026-08-12", reps: 9 }, { date: "2026-11-02", reps: 12, configuration: "recorded:a" }]);
    const body = summary(source, "2026-11-06");
    expect(body.training).toMatchObject({ sessions: 4, trainingDays: 3, multipleSessionDays: 1 });
    // Strict: the two with a known variant are compared; the two without one are there as not compared, as in Insights.
    expect(body.training.strict).toMatchObject({ total: 4, comparable: 2, improved: 2, insufficient: 2 });
    // Partial: only the two without a variant. A comparable exposure is never counted by both methods.
    expect(body.training.partial).toMatchObject({ total: 2 });
    expect(body.training.strict.comparable + body.training.partial.comparable).toBeLessThanOrEqual(4);
    expect(parsePerformanceInsights(JSON.parse(JSON.stringify(body)))?.view).toBe("period");
  });

  it("shows routines in sequence only when one ended before the next began, and alternating ones as such", () => {
    const sequence = summary(history([{ date: "2026-08-03", routine: "A" }, { date: "2026-08-20", routine: "A" }, { date: "2026-09-02", routine: "B" }, { date: "2026-10-01", routine: "B" }]), "2026-11-06");
    expect(sequence.routines).toEqual({ order: "sequence", items: [
      { routineId: "A", name: "A", sessions: 2, first: "2026-08-03", last: "2026-08-20" }, { routineId: "B", name: "B", sessions: 2, first: "2026-09-02", last: "2026-10-01" }] });
    const alternating = summary(history([{ date: "2026-08-03", routine: "A" }, { date: "2026-08-05", routine: "B" }, { date: "2026-08-07", routine: "A" }]), "2026-11-06");
    expect(alternating.routines.order).toBe("alternating");
  });

  it("says what was recorded on how many days, never a complete intake, and a day with a missing value is not a zero", () => {
    const body = summary(history([], [{ date: "2026-08-01", calories: 2000 }, { date: "2026-08-01", calories: 500 }, { date: "2026-08-02", calories: null }, { date: "2026-09-10", calories: 1800 }, { date: "2026-11-01", calories: 9999 }]), "2026-11-06");
    expect(body.nutrition.daysWithMeals).toBe(3);
    expect(body.nutrition.nutrients.calories).toEqual({ knownDays: 2, partialDays: 1, recorded: 4300, dailyMedian: 2150 });
    expect(body.nutrition.nutrients.proteinG).toMatchObject({ knownDays: 3, partialDays: 0 });
  });

  it("uses every weigh-in of the period, trained or not, in whole weeks, without interpolating", () => {
    // 1 August 2026 is a Saturday: its week is cut by the period and stays out, as does every weigh-in after the 31st of October.
    const weights = [{ date: "2026-08-01", value: 80 }, { date: "2026-08-03", value: 80 }, { date: "2026-08-05", value: 80.4 }, { date: "2026-08-07", value: 80.2 },
      { date: "2026-08-10", value: 79.8 }, { date: "2026-08-12", value: 79.6 }, { date: "2026-08-14", value: 79.7 }, { date: "2026-11-02", value: 79 }];
    const body = summary(history([{ date: "2026-08-04" }]), "2026-11-06", weights);
    expect(body.weight.weeks[0]).toMatchObject({ start: "2026-08-03", median: 80.2 });
    expect(body.weight.changes[0]).toEqual({ weekStart: "2026-08-10", previousStart: "2026-08-03", change: -0.5, reason: "computed" });
    expect(body.weight.outside.partialWeeks).toBe(1);
    expect(body.weight.weighIns).toBe(7);
    expect(body.weight.weeks.at(-1)!.end).toBe("2026-10-25");
    expect(body.weight.weeks.filter(week => week.median === null).length).toBe(body.weight.weeks.length - 2);
  });

  it("describes the period's end answers only, with the same rule as Cómo terminaste, and never an association", () => {
    const body = summary(history([{ date: "2026-07-20", post: 5 }, { date: "2026-08-20", post: 2 }, { date: "2026-09-20", post: 4 }]), "2026-11-06");
    expect(body.feelings[0]!.sessions).toMatchObject({ completed: 2, answered: 2 });
    expect(body.feelings[0]!.priorNotComparable.posts).toEqual([0, 1, 0, 1, 0]);
    expect(body.associations).toEqual({ status: "not_computed_for_period" });
    expect(JSON.stringify(body)).not.toMatch(/"rho"|"permutationP"|feeling_outcome:|meal_timing:|body_week:/);
  });

  it("is refused by the contract when its dates or counts do not hold", () => {
    const body = JSON.parse(JSON.stringify(summary(history([{ date: "2026-08-03" }], [{ date: "2026-08-03", calories: 2000 }]), "2026-11-06")));
    expect(parsePerformanceInsights(body)).toBeDefined();
    for (const tamper of [
      (b: typeof body) => { b.period.start = "2026-08-02"; },
      (b: typeof body) => { b.period.months = ["2026-08", "2026-09"]; },
      (b: typeof body) => { b.training.multipleSessionDays = 5; },
      (b: typeof body) => { b.nutrition.nutrients.calories.partialDays = 3; },
      (b: typeof body) => { b.associations = { status: "computed" }; },
      (b: typeof body) => { b.weight.changes.push({ weekStart: "2026-10-26", previousStart: "2026-10-19", change: null, reason: "computed" }); },
    ]) { const copy = structuredClone(body); tamper(copy); expect(parsePerformanceInsights(copy)).toBeUndefined(); }
  });
});
