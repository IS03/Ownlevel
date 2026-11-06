import { describe, expect, it } from "vitest";
import { buildPerformanceInsightsPartialV1, buildPerformanceInsightsV1 } from "../performance-insights";
import { createInsightsSnapshot } from "./read-model";
import { syntheticHistory } from "./scale-fixture";
import { toPerformanceSessions } from "./source-adapter";

const DAY_MS = 86_400_000;
const profile = { years: 1, sessionsPerWeek: 4, exercises: 6, setsPerExercise: 4, catalog: 30, metrics: 8, mealsPerDay: 4 };

/**
 * #367 memory: the snapshot reduces each comparator to its published facts before the next one runs, and keeps only what its
 * relations need. These rebuild the facts the way the read model did when it held the comparators' whole output, and compare.
 */
describe("hechos reducidos de los comparadores", () => {
  for (const captured of [false, true]) it(`publishes the same facts as the comparators' full output${captured ? ", with known configuration" : ""}`, () => {
    const source = syntheticHistory(profile, 4, captured);
    const snapshot = createInsightsSnapshot(source, { today: "2030-01-01", method: 2 });
    const names = new Map(source.exercises.map(row => [`${row.sessionId}:${row.exerciseId.toLowerCase()}`, row.name]));
    // The reference's logical date (#367): added to the published facts, read from the sessions it names.
    const dates = new Map(source.sessions.map(row => [row.id, row.date]));
    const adapted = toPerformanceSessions(source).sessions;
    const strict = buildPerformanceInsightsV1({ sessions: adapted, historyCoverage: "complete", exclusionDetail: "summary" });
    const partial = buildPerformanceInsightsPartialV1({ sessions: adapted, historyCoverage: "complete", exclusionDetail: "summary" });
    const strictByDate = new Map(strict.days.map(day => [day.date, day]));
    const partialByDate = new Map(partial.days.map(day => [day.date, day]));
    expect(snapshot.days.length).toBe(strict.days.length);
    for (const [index, day] of snapshot.days.entries()) {
      const full = strictByDate.get(day.date)!;
      expect(day.sessions.map(session => ({ sessionId: session.sessionId, counts: session.counts, exercises: session.exercises }))).toEqual(full.sessions.map(session => ({
        sessionId: session.sessionId, counts: session.counts,
        exercises: session.exercises.map(exercise => ({ exerciseId: exercise.exerciseId, name: names.get(`${session.sessionId}:${exercise.exerciseId}`) ?? "",
          status: exercise.status, reason: exercise.reason, referenceSessionId: exercise.reference?.sessionId ?? null,
          referenceAgeDays: exercise.reference ? Math.floor(exercise.reference.ageMs / DAY_MS) : null, referenceDate: exercise.reference ? dates.get(exercise.reference.sessionId) ?? null : null, newHigh: exercise.records.facts.some(fact => fact.isNewHigh) })) })));
      const fullPartial = partialByDate.get(day.date)!;
      expect(snapshot.partialDays[index]!.sessions).toEqual(fullPartial.sessions.map(session => ({ sessionId: session.sessionId, counts: session.counts,
        exercises: session.exercises.map(exercise => ({ exerciseId: exercise.exerciseId, name: names.get(`${session.sessionId}:${exercise.exerciseId}`) ?? "", reading: exercise.reading,
          reason: exercise.reason, referenceSessionId: exercise.reference?.sessionId ?? null, referenceAgeDays: exercise.reference ? Math.floor(exercise.reference.ageMs / DAY_MS) : null, referenceDate: exercise.reference ? dates.get(exercise.reference.sessionId) ?? null : null,
          highestInPartialContext: exercise.records.facts.some(fact => fact.isNewHigh) })) })));
    }
    expect(snapshot.history.sessions).toBe(strict.sessions.length);
    expect(snapshot.integrity).toBe(strict.integrity);
    expect(snapshot.partial.partition).toEqual(partial.partition);
  });
  it("keeps in each lane only what its relations need", () => {
    const snapshot = createInsightsSnapshot(syntheticHistory(profile, 4), { today: "2030-01-01", method: 2 });
    for (const lane of [snapshot.strict, snapshot.partial.lane]) expect(Object.keys(lane).sort()).toEqual(["candidates", "evaluate", "rows", "sessionIdsByDate"]);
  });
});
