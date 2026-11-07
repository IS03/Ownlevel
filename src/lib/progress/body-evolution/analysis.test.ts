import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createInsightsSnapshot, insightsRelations, insightsSummary } from "../insights-engine/read-model";
import type { InsightsSource } from "../insights-engine/types";
import { prepareBodyWeeklyAssociations } from "./analysis";
import { BODY_SCENARIOS, bodyCalibrationSteps, runBodyCalibration, type BodyCalibrationResult, type BodyScenario } from "./calibration";

const id = (group: number, n: number) => `93670000-0000-4000-8${String(group).padStart(3, "0")}-${String(n).padStart(12, "0")}`;
const day = (monday: string, offset: number) => new Date(Date.parse(`${monday}T12:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
function source(meals: { date: string; calories: number | null; protein?: number }[], sessions: { date: string; sets: number }[]): InsightsSource {
  const out: InsightsSource = { sessions: [], exercises: [], sets: [], feelings: [], metricDefinitions: [], metricValues: [], meals: [] };
  meals.forEach((meal, n) => (out.meals as InsightsSource["meals"][number][]).push({ id: id(3, n), date: meal.date, consumedAt: null, consumedAtSource: null, rawInput: null, entryKind: "meal", sourceType: "manual", importRunId: null,
    calories: meal.calories, proteinG: meal.protein ?? 100, carbsG: 200, fatG: 60 }));
  sessions.forEach((session, n) => {
    (out.sessions as InsightsSource["sessions"][number][]).push({ id: id(2, n), date: session.date, routineId: "r", routineName: null, name: null, status: "completed", startedAt: null, endedAt: null, performanceLevel: null, painLevel: null, legacyEnergyLevel: null });
    (out.exercises as InsightsSource["exercises"][number][]).push({ id: id(4, n), sessionId: id(2, n), exerciseId: id(1, 1), name: "E", implement: "barra", weightMode: "Peso total", isCompleted: true, configuration: null });
    for (let set = 0; set < session.sets; set++) (out.sets as InsightsSource["sets"][number][]).push({ id: id(5, n * 100 + set), sessionExerciseId: id(4, n), actualReps: 8, actualLoad: 60, isCompleted: set > 0, completedAt: null });
  });
  return out;
}
// Mondays: 5, 12 and 19 March 2029.
const weights = ["2029-03-05", "2029-03-12", "2029-03-19"].flatMap((monday, week) => [0, 2, 4].map(offset => ({ date: day(monday, offset), value: 80 - week * 0.5 + offset / 10 })));

describe("#367 fase 3: análisis experimental del cambio semanal", () => {
  it("takes every exposure from the week before the change, and says how many days had meals", () => {
    const meals = [0, 1, 2, 3].map(offset => ({ date: day("2029-03-05", offset), calories: 2000 + offset * 100 })).concat([0, 1].map(offset => ({ date: day("2029-03-12", offset), calories: 3000 })));
    const prepared = prepareBodyWeeklyAssociations(source(meals, [{ date: "2029-03-06", sets: 5 }, { date: "2029-03-08", sets: 3 }]), weights, { start: "2029-03-05", end: "2029-03-25" }, "2029-04-01");
    expect(prepared.rows.map(row => [row.date, row.y])).toEqual([["2029-03-12", -0.5], ["2029-03-19", -0.5]]);
    const value = (subject: string) => prepared.candidates.find(row => row.definition.id === `body_week:${subject}:previous_week`)!;
    // The change 5 → 12 March takes the week of the 5th: four days with meals, their mean; two sessions with 4 + 2 completed sets.
    expect(value("calories").values.get("2029-03-12")).toBe(2150);
    expect(value("sessions").values.get("2029-03-12")).toBe(2);
    expect(value("sets").values.get("2029-03-12")).toBe(6);
    // The change 12 → 19 takes the week of the 12th: two days with meals are not enough, and no training is a real zero.
    expect(value("calories").values.has("2029-03-19")).toBe(false);
    expect(value("calories").exclusions).toEqual({ fewer_than_4_days_with_meals: 1 });
    expect(value("sessions").values.get("2029-03-19")).toBe(0);
    expect([...prepared.coverage]).toEqual([["2029-03-12", 4], ["2029-03-19", 2]]);
  });

  it("never reads a day without meals or an unknown value as zero", () => {
    const meals = [0, 1, 2, 3, 4].map(offset => ({ date: day("2029-03-05", offset), calories: offset === 4 ? null : 2400 }));
    const prepared = prepareBodyWeeklyAssociations(source(meals, []), weights, { start: "2029-03-05", end: "2029-03-25" }, "2029-04-01");
    expect(prepared.candidates.find(row => row.definition.id === "body_week:calories:previous_week")!.values.get("2029-03-12")).toBe(2400);
  });

  it("is not prepared by any view, and leaves the published ones as they were", () => {
    const snapshot = createInsightsSnapshot(source([], [{ date: "2029-03-06", sets: 3 }]), { today: "2029-04-01", method: 2 });
    for (const view of [insightsSummary(snapshot), insightsRelations(snapshot)]) expect(JSON.stringify(view)).not.toContain("body_week:");
  });
});

describe("#367 fase 3: calibración desde filas fuente", () => {
  const small = { histories: 4, seed: 9, permutations: 49, looks: 3 };
  it("is reproducible, and changes with the seed", () => {
    const a = runBodyCalibration("body_independent", small);
    expect(runBodyCalibration("body_independent", small)).toEqual(a);
    expect(runBodyCalibration("body_independent", { ...small, seed: 10 })).not.toEqual(a);
    expect(a.meanRowsAtLastLook).toBeGreaterThan(40);
    expect(a.meanMealDaysPerWeek).toBeGreaterThan(4);
  });
  it("finds the planted effect more often than the null", () => {
    const effect = runBodyCalibration("body_planted_effect", { ...small, histories: 8, permutations: 99 });
    const none = runBodyCalibration("body_independent", { ...small, histories: 8, permutations: 99 });
    expect(effect.caloriesExploratory).toBeGreaterThan(none.caloriesExploratory);
  });

  const out = process.env.INSIGHTS_BODY_CALIBRATION_OUT, histories = Number(process.env.INSIGHTS_BODY_CALIBRATION_HISTORIES ?? 0);
  const only = process.env.INSIGHTS_BODY_CALIBRATION_SCENARIOS?.split(",");
  it.runIf(!!out && histories > 0)("measured campaign", async () => {
    const results: (BodyCalibrationResult & { seconds: number })[] = [];
    for (const scenario of (Object.keys(BODY_SCENARIOS) as BodyScenario[]).filter(name => !only || only.includes(name))) {
      const started = Date.now();
      const steps = bodyCalibrationSteps(scenario, { histories, seed: 0x367e, permutations: 199 });
      let step = steps.next();
      while (!step.done) { await new Promise(resolve => setImmediate(resolve)); step = steps.next(); }
      results.push({ ...step.value, seconds: (Date.now() - started) / 1000 });
      writeFileSync(out!, JSON.stringify(results, null, 2));
    }
  }, 7_200_000);
});
