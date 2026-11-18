import { describe, expect, it } from "vitest";
import { parseInfluenceMeasure, validInfluenceDefinition } from "./progress-influence-contract";
import { calculateInfluence, strengthByDate, weightChangeByDate } from "./progress-influence-model";

/** Qué influye con fuerza y peso: two outcomes of their own, never splits. Synthetic values only. */
describe("resultados de fuerza y peso", () => {
  it("accepts «fuerza frente a lo tuyo» and «cambio de peso» only as outcomes", () => {
    expect(parseInfluenceMeasure("strength.own", "outcome")).toEqual({ kind: "strength", key: "strength.own" });
    expect(parseInfluenceMeasure("body.weight_change", "outcome")).toEqual({ kind: "weight", key: "body.weight_change" });
    expect(parseInfluenceMeasure("strength.own", "split")).toBeUndefined();
    expect(parseInfluenceMeasure("body.weight_change", "split")).toBeUndefined();
    expect(validInfluenceDefinition({ split: "nutrition.protein", cut: "median", lag: 1, outcome: "strength.own" })).toBe(true);
    expect(validInfluenceDefinition({ split: "strength.own", cut: "median", lag: 0, outcome: "nutrition.kcal" })).toBe(false);
  });
  it("gives a training day the mean of its measured sessions, and a day without one nothing", () => {
    const values = strengthByDate([{ date: "2026-10-01", pct: 2 }, { date: "2026-10-01", pct: 4 }, { date: "2026-10-02", pct: null }, { date: "2026-09-30", pct: 9 }], { start: "2026-10-01", end: "2026-10-31" });
    expect([...values]).toEqual([["2026-10-01", 3]]);
  });
  it("measures the weight change of the next seven days with two weigh-ins each side, and only once that week has closed", () => {
    const weights = [["2026-10-01", 80], ["2026-10-03", 80.4], ["2026-10-05", 79.8], ["2026-10-08", 79.6], ["2026-10-10", 79.4]].map(([date, weight]) => ({ date: date as string, weight: weight as number }));
    const values = weightChangeByDate(weights, { start: "2026-10-03", end: "2026-10-06" }, "2026-11-17");
    expect(values.get("2026-10-03")).toBe(-0.6); // after: 79.8, 79.6 → 79.7; before: 80, 80.4 → 80.2
    expect(values.get("2026-10-06")).toBe(-0.5); // after: 79.6, 79.4 → 79.5; before: 80, 80.4, 79.8 → 80
    expect(weightChangeByDate(weights.slice(0, 3), { start: "2026-10-05", end: "2026-10-05" }, "2026-11-17").size).toBe(0); // nothing after
    expect(weightChangeByDate(weights, { start: "2026-10-03", end: "2026-10-03" }, "2026-10-10").size).toBe(0); // the week after is still open
  });
  it("pairs a day's protein with the next day's strength through the same calculation as the other outcomes", () => {
    const protein = new Map<string, number>(), strength = new Map<string, number>();
    for (let day = 1; day <= 28; day++) {
      const date = `2026-10-${String(day).padStart(2, "0")}`, next = `2026-10-${String(day + 1).padStart(2, "0")}`;
      protein.set(date, day % 2 ? 180 : 120);
      strength.set(next, day % 2 ? 2 : 0);
    }
    const result = calculateInfluence({ start: "2026-10-01", end: "2026-10-28" }, "2026-11-17", { split: "nutrition.protein", cut: "median", lag: 1, outcome: "strength.own" }, protein, strength);
    expect(result).toMatchObject({ status: "ok", high: { average: 2 }, low: { average: 0 } });
  });
});
