import { describe, expect, it } from "vitest";
import { parsePerformanceInsights } from "../../mobile-api/performance-insights-contract";
import { createInsightsSnapshot, insightsSummary } from "./read-model";
import { syntheticHistory } from "./scale-fixture";

const profile = { years: 1, sessionsPerWeek: 4, exercises: 6, setsPerExercise: 4, catalog: 30, metrics: 8, mealsPerDay: 4 };

describe("#367 fecha de la referencia compatible", () => {
  for (const captured of [false, true]) it(`is the logical date of the reference session, in both methods${captured ? ", with known configuration" : ""}`, () => {
    const source = syntheticHistory(profile, 6, captured);
    const dates = new Map(source.sessions.map(session => [session.id, session.date]));
    const summary = insightsSummary(createInsightsSnapshot(source, { today: "2030-01-01", method: 2 }), { limit: 120 });
    const strict = summary.facts.days.flatMap(day => day.sessions.flatMap(session => session.exercises));
    const partial = summary.partial.days.flatMap(day => day.sessions.flatMap(session => session.exercises));
    const withReference = [...strict, ...partial].filter(row => row.referenceSessionId);
    expect(withReference.length).toBeGreaterThan(0);
    for (const row of withReference) expect(row.referenceDate).toBe(dates.get(row.referenceSessionId!));
    for (const row of [...strict, ...partial].filter(row => !row.referenceSessionId)) expect(row.referenceDate).toBeNull();
  });
  it("is optional in the contract: an answer without it still reads, and a malformed one does not", () => {
    const body = JSON.parse(JSON.stringify(insightsSummary(createInsightsSnapshot(syntheticHistory(profile, 6, true), { today: "2030-01-01", method: 2 }))));
    expect(parsePerformanceInsights(body)).toBeDefined();
    const exercise = body.facts.days.flatMap((day: { sessions: { exercises: Record<string, unknown>[] }[] }) => day.sessions.flatMap(session => session.exercises)).find((row: Record<string, unknown>) => row.referenceDate);
    delete exercise.referenceDate;
    expect(parsePerformanceInsights(body)).toBeDefined();
    exercise.referenceDate = "ayer";
    expect(parsePerformanceInsights(body)).toBeUndefined();
  });
});
