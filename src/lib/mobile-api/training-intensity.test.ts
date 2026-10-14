import { describe, expect, it } from "vitest";
import { intensityLevel, intensityThresholds, isoDayShift, monthRange } from "./training-intensity";

const days = (sets: number[]) => sets.map(completedSets => ({ completedSets }));
describe("person-relative training intensity", () => {
  it("uses a fixed scale with little history, so a normal day is not low", () => {
    const thresholds = intensityThresholds(days([20, 22]));
    expect(thresholds).toEqual([8, 16, 24]);
    expect(intensityLevel(20, thresholds)).toBe(3);
  });
  it("splits trained days by the person's own quartiles", () => {
    const thresholds = intensityThresholds(days([4, 6, 8, 10, 20, 22, 24, 30]));
    expect([4, 8, 22, 30].map(sets => intensityLevel(sets, thresholds))).toEqual([1, 2, 3, 4]);
  });
  it("keeps identical days mid-scale and a 0-set trained day at level 1, never absent", () => {
    expect(intensityLevel(12, intensityThresholds(days(Array(10).fill(12))))).toBe(2);
    expect(intensityLevel(0, intensityThresholds(days([0, 5, 9, 12, 15, 18, 20, 25])))).toBe(1);
  });
  it("computes month and window ranges", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(isoDayShift("2026-10-13", -83)).toBe("2026-07-22");
  });
});
