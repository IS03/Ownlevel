import { describe, expect, it } from "vitest";
import { createInsightsSnapshot, insightsPeriodSummary } from "./read-model";
import { periodFeelingDetail, periodNutritionDetail } from "./period-details";
import { periodDetailsFixture } from "./period-details-fixture";
import { parsePerformanceInsights } from "../../mobile-api/performance-insights-contract";

export const feelingFixtureDetail = (today = "2026-11-07", asOf = "2026-11-07") => {
  const source = periodDetailsFixture(), exercise = new Map(source.exercises.map(e => [e.id, e.sessionId]));
  const firstSetBySession = new Map(source.sets.map(s => [exercise.get(s.sessionExerciseId)!, Date.parse(s.completedAt!)]));
  return periodFeelingDetail({ ...source, firstSetBySession }, today, asOf, "revision", 2);
};
describe("period feelings: existing description in the exact pinned scope", () => {
  it("equals the summary including pre answered before the first set, and keeps every capture state separate", () => {
    const detail = feelingFixtureDetail(), source = periodDetailsFixture();
    const summary = insightsPeriodSummary(createInsightsSnapshot(source, { today: "2026-11-07", method: 2 }), []);
    expect(detail.outcomes).toEqual(summary.feelings);
    expect(detail.outcomes[0].sessions).toMatchObject({ completed: 8, answered: 5, unreadable: 1, otherInstrument: 1, notRecorded: 1 });
    expect(detail.outcomes[0].capture).toEqual({ atFinish: 2, late: 1, captureUnknown: 1, beforeStart: 1 });
    expect(detail.outcomes[0].byPrior[2]!.posts[3]).toBe(1);
    expect(detail.outcomes[1].capture.atFinish).toBe(1);
    expect(parsePerformanceInsights(detail)).toEqual(detail);
  });
  it("stays pinned across year/month changes and rejects a mismatched period or future anchor", () => {
    const detail = feelingFixtureDetail("2027-01-02", "2026-11-07");
    expect(detail.period.start).toBe("2026-08-01"); expect(detail.period.end).toBe("2026-10-31");
    expect(parsePerformanceInsights(detail)).toEqual(detail);
    expect(parsePerformanceInsights({ ...detail, period: { ...detail.period, end: "2026-11-30" } })).toBeUndefined();
    expect(parsePerformanceInsights({ ...detail, asOf: "2027-02-01" })).toBeUndefined();
  });
});

describe("period nutrition: source totals without training selection", () => {
  it("includes untrained days, legacy entries and independent nutrient coverage; zero, missing and partial remain different", () => {
    const source = periodDetailsFixture(), detail = periodNutritionDetail(source.meals, "2027-01-02", "2026-11-07", "r1", 2);
    expect(detail.days.map(d => d.date)).toEqual(["2026-09-01", "2026-08-13", "2026-08-12", "2026-08-11"]);
    expect(detail.daysWithoutMeals).toBe(88);
    expect(detail.days.at(-1)).toMatchObject({ activeMeals: 2, calories: { recorded: 100, missing: 0 }, proteinG: { recorded: 0, missing: 1 }, carbsG: { recorded: 20, missing: 0 } });
    expect(detail.days[1]!.calories).toEqual({ recorded: 0, missing: 0 });
    expect(detail.days[2]!.calories).toEqual({ recorded: 0, missing: 1 });
    expect(parsePerformanceInsights(detail)).toEqual(detail);
    for (const mutate of [
      { daysWithoutMeals: 0 }, { ingestionCompleteKnown: true }, { days: [...detail.days, detail.days[0]] },
      { days: [{ ...detail.days[0], date: '2026-11-01' }, ...detail.days.slice(1)] },
      { days: [{ ...detail.days[0], calories: { recorded: 2, missing: 1 } }, ...detail.days.slice(1)] },
    ]) expect(parsePerformanceInsights({ ...detail, ...mutate })).toBeUndefined();
    const empty = periodNutritionDetail([], '2027-01-02', '2026-11-07', 'r1', 2);
    expect(empty.days).toEqual([]); expect(empty.daysWithoutMeals).toBe(92); expect(parsePerformanceInsights(empty)).toBeTruthy();
  });
});
