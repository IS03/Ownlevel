import { describe, expect, it } from "vitest";
import { buildPerformanceInsightsPartialV1, buildPerformanceInsightsV1, type HistoricalContext, type PerformanceExerciseBlock, type PerformanceSession } from "./index";

/** #533 · the measured change beside the classification. Synthetic sessions only. */
const exerciseId = "53300000-0000-4000-8000-000000000001";
const kg: HistoricalContext = { weightMode: "Peso total", unit: "kg", implement: "maquina", configuration: "none" };
const bodyweight: HistoricalContext = { weightMode: "Peso corporal", unit: "reps", implement: "ninguno", configuration: "none" };
const seconds: HistoricalContext = { weightMode: "Tiempo (segundos)", unit: "seconds", implement: "ninguno", configuration: "none" };
const plates: HistoricalContext = { weightMode: "Lingotes (no kg)", unit: "lingotes", implement: "maquina", configuration: "none" };

const block = (id: string, sets: Array<[number | null, number | null]>, context: HistoricalContext): PerformanceExerciseBlock => ({ id, exerciseId, completed: true, context,
  sets: sets.map(([load, amount], i) => ({ id: `${id}-${i}`, completed: true, load, amount })) });
const session = (id: string, day: string, sets: Array<[number | null, number | null]>, context = kg): PerformanceSession => ({ id, date: day, routineId: "r", status: "completed",
  startedAt: `${day}T10:00:00Z`, endedAt: `${day}T11:00:00Z`, chronology: "verified", exercises: [block(`${id}-b`, sets, context)] });
/** [load, reps] per set, before and now. */
function change(before: Array<[number | null, number | null]>, now: Array<[number | null, number | null]>, context = kg, output: "full" | "compact" = "compact") {
  const result = buildPerformanceInsightsV1({ sessions: [session("a", "2026-10-10", before, context), session("b", "2026-11-14", now, context)], historyCoverage: "complete", output });
  return result.sessions.find(row => row.sessionId === "b")!.exercises[0]!;
}

describe("cambio medido por ejercicio (#533)", () => {
  it("12 → 13 reps at the same load is +8.3333 %, from the best set at that load and not from the sum of reps", () => {
    const row = change([[20, 12], [20, 12], [20, 11]], [[20, 12], [20, 13], [20, 12]]);
    expect(row.status).toBe("improved");
    expect(row.change).toEqual({ state: "measured", pct: 8.3333, basis: "reps_at_load", signals: 1, load: { unit: "kg", up: 0, same: 1, down: 0 }, shown: { anchor: 20, from: 12, to: 13 } });
    // An extra set at the same reps changes nothing: the base is the best set per load.
    expect(change([[20, 12], [20, 12]], [[20, 12], [20, 13], [20, 13], [20, 13]]).change!.pct).toBe(8.3333);
  });
  it("the compact and the full output carry the same change", () => {
    expect(change([[20, 12]], [[20, 13]], kg, "full").change).toEqual(change([[20, 12]], [[20, 13]]).change);
  });
  it("more load at the same reps is a load signal, with no percentage", () => {
    const row = change([[50, 10]], [[55, 10]]);
    expect(row.status).toBe("improved");
    expect(row.change).toEqual({ state: "no_amount_signal", pct: null, basis: null, signals: 0, load: { unit: "kg", up: 1, same: 0, down: 0 }, shown: { anchor: 10, from: 50, to: 55 } });
  });
  it("opposite signals stay ambiguous, without a percentage", () => {
    const row = change([[20, 10], [25, 8]], [[20, 12], [25, 6]]);
    expect(row.status).toBe("ambiguous_evidence");
    expect(row.change).toMatchObject({ state: "ambiguous", pct: null });
  });
  it("an observed zero change is measured as 0, not as missing", () => {
    const row = change([[20, 12]], [[20, 12]]);
    expect(row.status).toBe("observed_stable");
    expect(row.change).toMatchObject({ state: "measured", pct: 0 });
  });
  it("without a reference there is no change, and the reason stays the exercise's", () => {
    const result = buildPerformanceInsightsV1({ sessions: [session("b", "2026-11-14", [[20, 12]])], historyCoverage: "complete", output: "compact" });
    const row = result.sessions[0]!.exercises[0]!;
    expect(row.reason).toBe("no_compatible_reference");
    expect(row.change).toEqual({ state: "not_comparable", pct: null, basis: null, signals: 0, load: null });
  });
  it("a reference of zero reps is not a base", () => {
    const row = change([[20, 0]], [[20, 5]]);
    expect(row.change).toMatchObject({ state: "no_positive_reference", pct: null, basis: "reps_at_load" });
  });
  it("a real drop to zero is an observed change of −100 %", () => {
    expect(change([[20, 10]], [[20, 0]]).change).toMatchObject({ state: "measured", pct: -100 });
  });
  it("bodyweight reps and time have no load signals; plates are a load but never kilograms", () => {
    expect(change([[null, 10]], [[null, 11]], bodyweight).change).toEqual({ state: "measured", pct: 10, basis: "bodyweight_reps", signals: 1, load: null, shown: { anchor: null, from: 10, to: 11 } });
    expect(change([[null, 60]], [[null, 45]], seconds).change).toEqual({ state: "measured", pct: -25, basis: "time", signals: 1, load: null, shown: { anchor: null, from: 60, to: 45 } });
    expect(change([[3, 10]], [[4, 10]], plates).change!.load).toEqual({ unit: "lingote", up: 1, same: 0, down: 0 });
  });
  it("shows the heaviest load behind the percentage, while the percentage comes from every load", () => {
    const row = change([[20, 12], [25, 8]], [[20, 13], [25, 10]]);
    expect(row.change).toMatchObject({ state: "measured", pct: 16.6667, signals: 2, shown: { anchor: 25, from: 8, to: 10 } });
  });
  it("the partial lane measures the same way, under its own reading", () => {
    const unknown = { ...kg, configuration: null };
    const result = buildPerformanceInsightsPartialV1({ sessions: [session("a", "2026-10-10", [[20, 12]], unknown), session("b", "2026-11-14", [[20, 13]], unknown)], historyCoverage: "complete", output: "compact" });
    const row = result.sessions.find(item => item.sessionId === "b")!.exercises[0]!;
    expect(row.reading).toBe("higher_record");
    expect(row.change).toMatchObject({ state: "measured", pct: 8.3333 });
  });
});
