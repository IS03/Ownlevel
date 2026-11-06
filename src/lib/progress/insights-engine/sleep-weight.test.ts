import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parsePerformanceInsights } from "../../mobile-api/performance-insights-contract";
import { sleepNightOf } from "../../mobile-api/performance-insights-server";
import { buildPerformanceInsightsV1 } from "../performance-insights";
import { evaluateAssociations } from "./associations";
import { buildExposureTable, strictOutcomeDays } from "./exposures";
import { createInsightsSnapshot, insightsRelation, insightsRelations, insightsSummary } from "./read-model";
import { toPerformanceSessions } from "./source-adapter";
import type { InsightsSource } from "./types";

const EX = "93670000-0000-4000-8000-00000000000a", SLEEP = "93670000-0000-4000-8000-0000000000aa", OTHER = "93670000-0000-4000-8000-0000000000ab";
const dateAt = (day: number) => new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
const TODAY = "2027-01-01";
const oscillating = (n: number) => Array.from({ length: n }, (_, day) => 8 + (day % 2 ? 1 : -1) * (day % 5 + 1));

/** One exercise a day with a known configuration, so every day after the first has a strict outcome. */
function history(n: number, extra: { weight?: (day: number) => number | null; sleep?: (day: number) => { value: number; night: "declared" | "undeclared" | "stale_declaration" } | null; twice?: (day: number) => boolean } = {}): InsightsSource {
  const reps = oscillating(n);
  const sessions: InsightsSource["sessions"][number][] = [], exercises: InsightsSource["exercises"][number][] = [], sets: InsightsSource["sets"][number][] = [];
  reps.forEach((value, day) => {
    const date = dateAt(day);
    for (const slot of extra.twice?.(day) ? [0, 1] : [0]) {
      const id = `s${day}-${slot}`;
      sessions.push({ id, date, routineId: "r1", routineName: "Rutina", name: null, status: "completed", startedAt: `${date}T${slot ? "20" : "08"}:00:00.000Z`, endedAt: `${date}T${slot ? "21" : "09"}:00:00.000Z`,
        performanceLevel: null, painLevel: null, legacyEnergyLevel: null, ...(extra.weight ? { dayWeightKg: extra.weight(day) } : {}) });
      exercises.push({ id: `e${day}-${slot}`, sessionId: id, exerciseId: EX, name: "Press", implement: "barra", weightMode: "Peso total", isCompleted: true, configuration: "recorded:agarre neutro" });
      sets.push({ id: `set${day}-${slot}`, sessionExerciseId: `e${day}-${slot}`, actualReps: value + slot, actualLoad: 100, isCompleted: true, completedAt: `${date}T${slot ? "20" : "08"}:10:00.000Z` });
    }
  });
  const metricValues: InsightsSource["metricValues"][number][] = [];
  if (extra.sleep) for (let day = 0; day < n; day++) { const sleep = extra.sleep(day); if (sleep) metricValues.push({ metricId: SLEEP, date: dateAt(day), value: String(sleep.value), sleepNight: sleep.night }); }
  return { sessions, exercises, sets, feelings: [], meals: [], metricValues,
    metricDefinitions: [{ id: SLEEP, name: "Sueño", unit: "min", valueType: "duration", archived: false, systemKey: "sleep" }, { id: OTHER, name: "Otra", unit: null, valueType: "decimal", archived: false, systemKey: null }] };
}
const candidates = (source: InsightsSource, method: 1 | 2) => {
  const performance = buildPerformanceInsightsV1({ sessions: toPerformanceSessions(source).sessions, historyCoverage: "complete" });
  return buildExposureTable(source, strictOutcomeDays(performance.days), TODAY, undefined, true, method).candidates;
};
const byId = (source: InsightsSource, id: string) => candidates(source, 2).find(row => row.definition.id === id)!;

describe("#367 sueño: la fecha dice qué noche", () => {
  it("method 1 is unchanged: no sleep or body family, sleep keeps its two windows", () => {
    const ids = candidates(history(30, { sleep: () => ({ value: 420, night: "declared" }), weight: () => 80 }), 1).map(row => row.definition.id);
    expect(ids.filter(id => id.startsWith("sleep") || id.startsWith("body"))).toEqual([]);
    expect(ids).toContain(`metric:${SLEEP}:same_day`); expect(ids).toContain(`metric:${SLEEP}:previous_day`);
  });
  it("a declared night pairs with its own training day only, never also with the next one", () => {
    const source = history(30, { sleep: day => ({ value: 400 + day, night: "declared" }) });
    const night = byId(source, `sleep:${SLEEP}:night_before`);
    expect(night.definition).toMatchObject({ family: "sleep", window: "night_before", temporalBasis: "declared_night_ending_on_day" });
    expect([...night.values.keys()]).toEqual(Array.from({ length: 29 }, (_, day) => dateAt(day + 1)));
    expect(night.values.get(dateAt(5))).toBe(405);
    // The undeclared windows never reuse a declared value: the same night is not a second observation.
    expect(byId(source, `sleep_undeclared:${SLEEP}:same_day`).values.size).toBe(0);
    expect(byId(source, `sleep_undeclared:${SLEEP}:previous_day`).values.size).toBe(0);
    expect(byId(source, `sleep_undeclared:${SLEEP}:previous_day`).exclusions.sleep_night_declared).toBe(29);
  });
  it("historical values with an ambiguous date stay apart, labeled, and an outdated declaration counts as undeclared", () => {
    const source = history(30, { sleep: day => day % 3 === 0 ? null : { value: 420, night: day < 20 ? "undeclared" : day < 25 ? "stale_declaration" : "declared" } });
    const night = byId(source, `sleep:${SLEEP}:night_before`);
    expect(night.values.size).toBe([25, 26, 28, 29].length);
    expect(night.exclusions).toMatchObject({ sleep_not_recorded: 9, sleep_declaration_outdated: 3, sleep_night_undeclared: 13 });
    const same = byId(source, `sleep_undeclared:${SLEEP}:same_day`);
    expect(same.definition.temporalBasis).toBe("undeclared_sleep_date");
    expect(same.values.size).toBe(16);
    // Missing sleep is never zero hours: it is not a pair.
    expect([...night.values.values(), ...same.values.values()].every(value => value > 0)).toBe(true);
  });
});

describe("#367 peso corporal: el valor del día", () => {
  it("pairs the weight of the training day, once per day however many sessions, and keeps zero, missing and invalid apart", () => {
    const source = history(30, { weight: day => day % 7 === 0 ? null : day % 11 === 0 ? 0 : 80 + day / 10, twice: day => day % 4 === 0 });
    const weight = byId(source, "body:weight_kg:same_day");
    expect(weight.definition).toMatchObject({ family: "body", window: "same_day", temporalBasis: "same_day_unordered", subject: "weight_kg" });
    // Day 0 is an outcome day too: its second session compares with the first.
    expect(weight.exclusions).toMatchObject({ weight_not_recorded: 5, weight_invalid: 2 });
    // One value per date: two sessions on a day do not add a second pair.
    expect(weight.values.size).toBe(30 - 5 - 2);
    expect(weight.values.get(dateAt(8))).toBe(80.8);
    expect(weight.values.has(dateAt(11))).toBe(false);
  });
  it("a constant weight has no variation, so it can never be published as a relation", () => {
    const source = history(60, { weight: () => 80 });
    const evaluation = evaluateAssociations(buildRows(source), [byId(source, "body:weight_kg:same_day")], { permutations: 49 });
    expect(evaluation.items[0]).toMatchObject({ state: "insufficient_data", reason: "no_variation" });
  });
  it("a weight that only trends with time is detrended locally and does not pass as an association", () => {
    const source = history(120, { weight: day => 90 - day / 10 });
    const item = evaluateAssociations(buildRows(source), [byId(source, "body:weight_kg:same_day")], { permutations: 99 }).items[0]!;
    expect(item.state).not.toBe("exploratory");
  });
});

describe("#367 método 2 publicado", () => {
  it("counts every candidate it examined, declares its version and keeps its own partial labels", () => {
    const source = history(40, { sleep: day => ({ value: 400 + (day % 9) * 10, night: day % 2 ? "declared" : "undeclared" }), weight: day => 80 + (day % 5) / 10 });
    const one = createInsightsSnapshot(source, { today: TODAY, permutations: 19 }), two = createInsightsSnapshot(source, { today: TODAY, permutations: 19, method: 2 });
    // Sleep: two windows become one declared night plus two undeclared windows; body adds one.
    expect(two.strict.candidates.length).toBe(one.strict.candidates.length + 2);
    const summary = insightsSummary(two), relations = insightsRelations(two);
    expect(summary.methodVersion).toBe("insights-engine/2"); expect(insightsSummary(one).methodVersion).toBe("insights-engine/1");
    expect(relations.partial.engineMethodVersion).toBe("insights-engine-partial/2");
    expect(relations.strict.candidatesEvaluated).toBe(two.strict.candidates.length);
    expect(relations.strict.promotion).toMatchObject({ status: "not_enabled", reason: "risk_budget_not_approved" });
    expect(summary.limits).toMatchObject({ sleepNights: { declared: 20, undeclared: 20, stale_declaration: 0 }, bodyWeightTrainingDays: { recorded: 40, not_recorded: 0, invalid: 0 } });
    const day = summary.facts.days.find(row => row.date === dateAt(39))!;
    expect(day.context.bodyWeight).toEqual({ value: 80.4, state: "recorded" });
    expect(day.context.metrics.find(row => row.metricId === SLEEP)).toMatchObject({ sleepNight: "declared" });
    for (const view of [summary, relations, insightsRelation(two, "body:weight_kg:same_day"), insightsRelation(two, `sleep:${SLEEP}:night_before`)])
      expect(parsePerformanceInsights(JSON.parse(JSON.stringify(view)))).toBeTruthy();
    // Method 1 answers carry none of it.
    expect(JSON.stringify(insightsSummary(one))).not.toMatch(/bodyWeight|sleepNight/);
  });
});

describe("#367 una declaración vale para su versión del valor", () => {
  const row = { metric_date: "2026-11-04", value: "420.0000", updated_at: "2026-11-04T10:00:00.123456+00:00" };
  const night = { convention: "sleep_night_ending_on_date/1", declared_updated_at: row.updated_at, declared_value: 420, declared_date: row.metric_date };
  it("is declared only while updated_at, value and date all match", () => {
    expect(sleepNightOf({ ...row, night })).toBe("declared");
    expect(sleepNightOf({ ...row, night: [night] })).toBe("declared");
    expect(sleepNightOf({ ...row, night: null })).toBe("undeclared");
    expect(sleepNightOf({ ...row, updated_at: "2026-11-04T11:00:00.000001+00:00", night })).toBe("stale_declaration");
    expect(sleepNightOf({ ...row, value: "430", night })).toBe("stale_declaration");
    expect(sleepNightOf({ ...row, metric_date: "2026-11-05", night })).toBe("stale_declaration");
    expect(sleepNightOf({ ...row, night: { ...night, convention: "other" } })).toBe("stale_declaration");
  });
});

function buildRows(source: InsightsSource) {
  const performance = buildPerformanceInsightsV1({ sessions: toPerformanceSessions(source).sessions, historyCoverage: "complete" });
  return buildExposureTable(source, strictOutcomeDays(performance.days), TODAY, undefined, true, 2).rows;
}
