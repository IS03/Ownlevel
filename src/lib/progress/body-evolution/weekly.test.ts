import { describe, expect, it } from "vitest";
import { MIN_WEEKLY_WEIGH_INS, mondayOf, weeklyWeights } from "./weekly";

// 2029-03-05 is a Monday.
const w = (date: string, value: number) => ({ date, value });

describe("#367 fase 3: el peso semana a semana", () => {
  it("uses whole Monday–Sunday weeks inside the period, leaves out the week in progress, and says what stayed outside", () => {
    const weekly = weeklyWeights([w("2029-03-03", 80), w("2029-03-05", 80.2), w("2029-03-07", 80.4), w("2029-03-09", 80.6), w("2029-03-26", 79.9), w("2029-03-27", 79.8)],
      { start: "2029-03-03", end: "2029-03-27" }, "2029-03-27");
    // The Saturday 3rd belongs to a week cut by the period; the 26th and 27th to the week in progress.
    expect(weekly.weeks.map(week => [week.start, week.end])).toEqual([["2029-03-05", "2029-03-11"], ["2029-03-12", "2029-03-18"], ["2029-03-19", "2029-03-25"]]);
    expect(weekly.outside).toEqual({ partialWeeks: 1, currentWeek: 2, invalid: 0 });
    expect(mondayOf("2029-03-11")).toBe("2029-03-05");
  });

  it("gives a median from three valid weigh-ins, keeps their dates, and never takes 0 kg for a weight", () => {
    const weekly = weeklyWeights([w("2029-03-05", 80), w("2029-03-06", 0), w("2029-03-07", 81), w("2029-03-12", 79), w("2029-03-13", 79.5), w("2029-03-14", 80), w("2029-03-16", 81)],
      { start: "2029-03-05", end: "2029-03-18" }, "2029-04-01");
    expect(weekly.outside.invalid).toBe(1);
    expect(weekly.weeks[0]).toEqual({ start: "2029-03-05", end: "2029-03-11", weighIns: [w("2029-03-05", 80), w("2029-03-07", 81)], median: null });
    // Four weigh-ins: the median of an even count is the mean of the two middle ones.
    expect(weekly.weeks[1]!.median).toBe(79.75);
    expect(weekly.changes).toEqual([{ weekStart: "2029-03-12", previousStart: "2029-03-05", change: null, reason: "previous_week_insufficient" }]);
    expect(MIN_WEEKLY_WEIGH_INS).toBe(3);
  });

  it("compares only consecutive weeks: an empty week breaks the chain, it is never skipped or filled in", () => {
    const three = (monday: string, base: number) => [0, 2, 4].map(offset => w(new Date(Date.parse(`${monday}T12:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10), base + offset / 10));
    const weekly = weeklyWeights([...three("2029-03-05", 80), ...three("2029-03-12", 79.5), ...three("2029-03-26", 79)], { start: "2029-03-05", end: "2029-04-01" }, "2029-04-02");
    expect(weekly.weeks.map(week => week.median)).toEqual([80.2, 79.7, null, 79.2]);
    expect(weekly.changes.map(change => [change.weekStart, change.change, change.reason])).toEqual([
      ["2029-03-12", -0.5, "computed"], ["2029-03-19", null, "week_insufficient"], ["2029-03-26", null, "previous_week_insufficient"]]);
  });

  it("has nothing to describe in a period without a whole closed week", () => {
    expect(weeklyWeights([w("2029-03-26", 80)], { start: "2029-03-26", end: "2029-03-28" }, "2029-03-28")).toMatchObject({ weeks: [], changes: [], outside: { currentWeek: 1 } });
  });
});
