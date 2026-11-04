import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { buildInsightsReadModel } from "./read-model";
import { seededRandom } from "./stats";
import type { InsightsSource } from "./types";

const uuid = (kind: number, index: number) => `${kind.toString(16).padStart(8, "0")}-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;

/** Synthetic profile: years of history at a realistic rhythm, without any personal data. */
/** `captured` models the data after the proposed EXPAND; the default holds what the loader reads today: no configuration and no marker on meal times. */
export function syntheticHistory(profile: { years: number; sessionsPerWeek: number; exercises: number; setsPerExercise: number; catalog: number; metrics: number; mealsPerDay: number }, seed = 1, captured = false): InsightsSource {
  const random = seededRandom(seed);
  const sessions: InsightsSource["sessions"][number][] = [], exercises: InsightsSource["exercises"][number][] = [], sets: InsightsSource["sets"][number][] = [];
  const metricValues: InsightsSource["metricValues"][number][] = [], meals: InsightsSource["meals"][number][] = [], feelings: InsightsSource["feelings"][number][] = [];
  const days = profile.years * 365;
  const start = Date.UTC(2021, 0, 1);
  for (let day = 0; day < days; day++) {
    const date = new Date(start + day * 86_400_000).toISOString().slice(0, 10);
    for (let metric = 0; metric < profile.metrics; metric++) if (random() < 0.8) metricValues.push({ metricId: uuid(2, metric), date, value: String(Math.round(random() * 100)) });
    for (let meal = 0; meal < profile.mealsPerDay; meal++) meals.push({ id: uuid(3, meals.length), date, consumedAt: `${date}T${String(8 + meal * 3).padStart(2, "0")}:15:00.000Z`,
      rawInput: captured ? '{"originalTimeKnown":true}' : null, entryKind: "meal", sourceType: "manual", calories: 400 + Math.round(random() * 400), proteinG: 20 + Math.round(random() * 30), carbsG: random() < 0.02 ? null : 30 + Math.round(random() * 70), fatG: 10 });
    if (random() >= profile.sessionsPerWeek / 7) continue;
    const id = uuid(1, sessions.length);
    sessions.push({ id, date, routineId: uuid(4, sessions.length % 4), routineName: "Rutina", name: null, status: "completed", startedAt: `${date}T18:00:00.000Z`, endedAt: `${date}T19:15:00.000Z`, performanceLevel: 3, painLevel: 0, legacyEnergyLevel: null });
    if (random() < 0.5) feelings.push({ sessionId: id, revision: 1, facts: { energyPre: { value: 1 + Math.floor(random() * 5), instrumentVersion: "energy-fatigue/1", declaredMoment: "pre", declaredAt: `${date}T17:55:00.000Z`, capturedAt: `${date}T17:55:00.000Z`, source: "mobile", receivedAt: `${date}T17:55:01.000Z`, temporalQuality: "unverified_client_clock" } } });
    for (let index = 0; index < profile.exercises; index++) {
      const rowId = uuid(5, exercises.length), exerciseIndex = (sessions.length * 3 + index) % profile.catalog;
      exercises.push({ id: rowId, sessionId: id, exerciseId: uuid(6, exerciseIndex), name: `Ejercicio ${exerciseIndex}`, implement: "barra", weightMode: "Peso total", isCompleted: true, configuration: captured ? "none" : null });
      // One load per exercise, so most exposures compare directly, as a stable program would.
      for (let set = 0; set < profile.setsPerExercise; set++) sets.push({ id: uuid(7, sets.length), sessionExerciseId: rowId, actualReps: 8 + Math.floor(random() * 3), actualLoad: 40 + exerciseIndex, isCompleted: true, completedAt: `${date}T18:${String(10 + set).padStart(2, "0")}:00.000Z` });
    }
  }
  return { sessions, exercises, sets, feelings, metricDefinitions: Array.from({ length: profile.metrics }, (_, metric) => ({ id: uuid(2, metric), name: `M${metric}`, unit: null, valueType: "decimal", archived: metric % 5 === 0 })), metricValues, meals };
}

const PROFILES = {
  year: { years: 1, sessionsPerWeek: 4, exercises: 6, setsPerExercise: 4, catalog: 30, metrics: 8, mealsPerDay: 4 },
  fiveYears: { years: 5, sessionsPerWeek: 5, exercises: 6, setsPerExercise: 4, catalog: 40, metrics: 20, mealsPerDay: 4 },
  tenYears: { years: 10, sessionsPerWeek: 6, exercises: 8, setsPerExercise: 5, catalog: 60, metrics: 30, mealsPerDay: 5 },
};

describe("escala con perfiles sintéticos", () => {
  it("computes a year quickly and keeps the default response small", () => {
    const started = performance.now();
    const model = buildInsightsReadModel(syntheticHistory(PROFILES.year), { today: "2030-01-01" });
    expect(performance.now() - started).toBeLessThan(10_000);
    expect(model.integrity).toBe("valid"); expect(model.history.sessions).toBeGreaterThan(150);
    expect(Buffer.byteLength(JSON.stringify(model))).toBeLessThan(128 * 1024);
  }, 30_000);
  const out = process.env.INSIGHTS_SCALE_OUT;
  it.runIf(!!out)("measured profiles", () => {
    const results = [false, true].flatMap(captured => Object.entries(PROFILES).map(([name, profile]) => {
      const source = syntheticHistory(profile, 1, captured);
      const rows = { sessions: source.sessions.length, exercises: source.exercises.length, sets: source.sets.length, metricValues: source.metricValues.length, meals: source.meals.length, feelings: source.feelings.length };
      // One page per 1000 rows, at least one per stream; the extra one is the metric definitions.
      const pages = Object.values(rows).reduce((sum, count) => sum + Math.max(1, Math.ceil(count / 1000)), 1);
      globalThis.gc?.();
      const heapBefore = process.memoryUsage().heapUsed;
      const times: number[] = [];
      let bytes = 0, candidates = 0, comparable = 0, outcomeDays = 0, partialComparable = 0, partialOutcomeDays = 0, partialCandidates = 0, heapPeak = 0;
      for (let run = 0; run < 5; run++) {
        const started = performance.now();
        const model = buildInsightsReadModel(source, { today: "2040-01-01" });
        times.push(performance.now() - started);
        heapPeak = Math.max(heapPeak, process.memoryUsage().heapUsed);
        bytes = Buffer.byteLength(JSON.stringify(model)); candidates = model.associations.candidatesEvaluated; comparable = model.facts.totals.comparable; outcomeDays = model.history.outcomeDays; partialComparable = model.partial.totals.comparable; partialOutcomeDays = model.partial.outcomeDays; partialCandidates = model.partial.associations.candidatesEvaluated;
      }
      return { name, captured, rows, comparable, outcomeDays, partialComparable, partialOutcomeDays, partialCandidates, sourcePages: pages, queries: { steady: pages + 14, sourceChangedRetry: 2 * (pages + 14), bothRetriesWorstCase: 4 * (pages + 14) }, candidates, msRuns: times.map(Math.round), msMax: Math.round(Math.max(...times)), responseKiB: Math.round(bytes / 1024), heapDeltaMiB: Math.round((heapPeak - heapBefore) / 1048576) };
    }));
    writeFileSync(out!, JSON.stringify(results, null, 2));
  }, 1_800_000);
});
