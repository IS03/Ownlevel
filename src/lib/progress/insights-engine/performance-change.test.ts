import { describe, expect, it } from "vitest";
import type { PerformanceChange } from "../performance-insights/types";
import { lastShown, recentTimes, timeLetter } from "./performance-change";

/** Ejercicios más claros: one letter per time, the gaps kept; and what the last time showed. Fictitious values only. */
const measured = (pct: number): PerformanceChange => ({ state: "measured", pct, basis: "reps_at_load", signals: 1, load: { unit: "kg", up: 0, same: 1, down: 0 }, shown: { anchor: 20, from: 12, to: 13 } });
const load = (up: number, down: number, unit: "kg" | "lingote" = "kg"): PerformanceChange => ({ state: "no_amount_signal", pct: null, basis: null, signals: 0, load: { unit, up, same: 0, down }, shown: { anchor: 10, from: 55, to: 60 } });

describe("cada vez de un ejercicio", () => {
  it("marks a measured change by its sign, a load-only change apart, and anything else as not compared", () => {
    expect([measured(8.3), measured(0), measured(-5)].map(timeLetter)).toEqual(["u", "s", "d"]);
    expect([load(1, 0), load(0, 1), load(1, 1)].map(timeLetter)).toEqual(["U", "D", "n"]);
    expect(timeLetter(undefined)).toBe("n");
    expect(timeLetter({ state: "ambiguous", pct: null, basis: null, signals: 2, load: { unit: "kg", up: 0, same: 1, down: 0 } })).toBe("n");
  });
  it("keeps the last ten times, oldest first, with the gaps as «n»", () => {
    const rows = [undefined, ...Array.from({ length: 10 }, (_, index) => index % 3 ? measured(index) : undefined)].map(change => ({ change }));
    expect(recentTimes(rows)).toBe("nuunuunuun");
    expect(recentTimes([])).toBe("");
  });
  it("says what the last time showed, plates named, and nothing when it could not compare", () => {
    expect(lastShown(measured(8.3))).toEqual({ anchor: 20, from: 12, to: 13 });
    expect(lastShown(load(1, 0, "lingote"))).toEqual({ anchor: 10, from: 55, to: 60, plates: true });
    expect(lastShown(undefined)).toBeNull();
  });
});

describe("contrato de las veces", () => {
  it("a summary carries the letters and the last shown, and a malformed one is rejected, never read as empty", async () => {
    const { syntheticHistory } = await import("./scale-fixture");
    const { createInsightsSnapshot, insightsSummary } = await import("./read-model");
    const { parsePerformanceInsights } = await import("../../mobile-api/performance-insights-contract");
    const snapshot = createInsightsSnapshot(syntheticHistory({ years: 0.1, sessionsPerWeek: 3, exercises: 3, setsPerExercise: 3, catalog: 5, metrics: 1, mealsPerDay: 2 }), { today: "2030-01-01", permutations: 19 });
    const summary = insightsSummary(snapshot);
    const row = summary.facts.exercises[0]!;
    expect(row.times).toMatch(/^[usdUSDn]{1,10}$/);
    expect(parsePerformanceInsights(summary)).toBeDefined();
    const broken = structuredClone(summary); (broken.facts.exercises[0] as { times?: string }).times = "x";
    expect(parsePerformanceInsights(broken)).toBeUndefined();
    const plates = structuredClone(summary); (plates.facts.exercises[0] as { lastShown?: unknown }).lastShown = { anchor: null, from: 1, to: 2, plates: false };
    expect(parsePerformanceInsights(plates)).toBeUndefined();
  });
});
