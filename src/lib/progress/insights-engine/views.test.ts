import { describe, expect, it } from "vitest";
import { InsightsSnapshotCache } from "../../mobile-api/performance-insights-cache";
import { parseCompleteInsights, parsePerformanceInsights } from "../../mobile-api/performance-insights-contract";
import { buildInsightsReadModel, createInsightsSnapshot, insightsDaysPage, insightsRelation, INSIGHTS_RECENT_PAIRS, insightsRelations, insightsSummary } from "./read-model";
import { syntheticHistory } from "./scale-fixture";
import type { InsightsSource, PartialAssociationResult } from "./types";

const PROFILE = { years: 1, sessionsPerWeek: 4, exercises: 6, setsPerExercise: 4, catalog: 30, metrics: 8, mealsPerDay: 4 };
const TODAY = "2040-01-01";
const roundTrip = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const options = { today: TODAY, permutations: 49 };

describe("vistas contra el modelo completo", () => {
  for (const captured of [false, true]) describe(captured ? "con configuración conocida" : "con configuración desconocida", () => {
    const source = syntheticHistory(PROFILE, 7, captured);
    const complete = buildInsightsReadModel(source, options);
    const snapshot = createInsightsSnapshot(source, { ...options, revision: "r" });

    it("publishes the same facts in the summary, without running or sending a relation", () => {
      const summary = insightsSummary(createInsightsSnapshot(source, { ...options, revision: "r" }));
      expect(parsePerformanceInsights(roundTrip(summary))).toBeTruthy();
      expect(summary.facts).toEqual(complete.facts); expect(summary.history).toEqual(complete.history); expect(summary.exclusions).toEqual(complete.exclusions); expect(summary.limits).toEqual(complete.limits);
      expect(summary.partial.days).toEqual(complete.partial.days); expect(summary.partial.totals).toEqual(complete.partial.totals); expect(summary.partial.partition).toEqual(complete.partial.partition);
      expect(summary.relations).toEqual({ strict: { candidatesEvaluated: complete.associations.candidatesEvaluated, outcomeDays: complete.history.outcomeDays }, partial: { candidatesEvaluated: complete.partial.associations.candidatesEvaluated, outcomeDays: complete.partial.outcomeDays } });
      expect(JSON.stringify(summary)).not.toContain("permutationP");
    });
    it("pages days to the same content as asking for them in the complete model", () => {
      const page = complete.facts.page.nextBefore!;
      const next = insightsDaysPage(snapshot, { before: page, limit: 30 });
      const expected = buildInsightsReadModel(source, { ...options, before: page, limit: 30 });
      expect(parsePerformanceInsights(roundTrip(next))).toBeTruthy();
      expect(next.facts.days).toEqual(expected.facts.days); expect(next.facts.page).toEqual(expected.facts.page); expect(next.partial.days).toEqual(expected.partial.days);
      expect(next).not.toHaveProperty("facts.exercises");
    });
    it("lists every relation of a method with outcome days, with the same state, and keeps nothing hidden", () => {
      const relations = insightsRelations(snapshot);
      expect(parsePerformanceInsights(roundTrip(relations))).toBeTruthy();
      expect(relations.strict.items.map(row => [row.id, row.state, row.pairs])).toEqual(complete.history.outcomeDays ? complete.associations.items.map(row => [row.id, row.state, row.pairs]) : []);
      expect(relations.partial.items.map(row => [row.id, row.state, row.pairs])).toEqual(complete.partial.outcomeDays ? complete.partial.associations.items.map(row => [row.id, row.state, row.pairs]) : []);
      expect(relations.strict.candidatesEvaluated).toBe(complete.associations.candidatesEvaluated);
      expect(relations.strict.testableCandidates).toBe(complete.associations.testableCandidates);
      expect(JSON.stringify(relations)).not.toContain("stability");
    });
    it("gives one relation the same result and pairs as the complete model", () => {
      const lane = captured ? complete.associations : complete.partial.associations;
      const chosen = lane.items.find(row => row.pairs >= 20)!;
      const detail = insightsRelation(snapshot, chosen.id);
      expect(parsePerformanceInsights(roundTrip(detail))).toBeTruthy();
      expect(detail.item).toEqual(chosen);
      const expected = buildInsightsReadModel(source, { ...options, association: chosen.id });
      expect(detail.pairs).toEqual((captured ? expected.associations.detail : expected.partial.associations.detail)!.pairs);
    });
  });
  it("answers with the newest pairs unless all are asked for, and its numbers still come from all of them", () => {
    const snapshot = createInsightsSnapshot(syntheticHistory({ ...PROFILE, years: 2 }, 7, false), options);
    const candidate = snapshot.partial.lane.candidates.find(row => row.values.size > INSIGHTS_RECENT_PAIRS)!;
    const every = insightsRelation(snapshot, candidate.definition.id), recent = insightsRelation(snapshot, candidate.definition.id, { pairs: "recent" });
    expect(every.pairsTotal).toBe(every.pairs!.length);
    expect(every.pairsTotal).toBeGreaterThan(INSIGHTS_RECENT_PAIRS);
    expect(recent.pairs).toEqual(every.pairs!.slice(-INSIGHTS_RECENT_PAIRS));
    expect(recent.pairsTotal).toBe(every.pairsTotal);
    expect(recent.item).toEqual(every.item);
    expect(recent.sourceRevision).toBe(every.sourceRevision);
    expect(parsePerformanceInsights(roundTrip(recent))).toBeTruthy();
    // A total smaller than what came, or no total, is not a page of anything.
    expect(parsePerformanceInsights({ ...roundTrip(recent), pairsTotal: 1 })).toBeUndefined();
    expect(parsePerformanceInsights({ ...roundTrip(recent), pairsTotal: undefined })).toBeUndefined();
  });
  it("evaluates only the family it was asked for, and only once", () => {
    const snapshot = createInsightsSnapshot(syntheticHistory(PROFILE, 7, false), options);
    const evaluate = snapshot.strict.evaluate;
    let strictRuns = 0;
    snapshot.strict.evaluate = () => { strictRuns++; return evaluate(); };
    const id = snapshot.partial.lane.candidates[0]!.definition.id;
    expect(insightsRelation(snapshot, id).lane).toBe("partial");
    expect(strictRuns).toBe(0);
    expect(snapshot.partial.lane.evaluate()).toBe(snapshot.partial.lane.evaluate());
  });
  it("says an unknown relation is null, and never takes a partial id for a strict one", () => {
    const snapshot = createInsightsSnapshot(syntheticHistory(PROFILE, 7, false), options);
    for (const id of ["metric:none:same_day", "partial:metric:none:same_day"]) {
      const detail = insightsRelation(snapshot, id);
      expect(detail).toMatchObject({ item: null, pairs: null, id });
      expect(parsePerformanceInsights(roundTrip(detail))).toBeTruthy();
    }
    const summary = roundTrip(insightsSummary(snapshot));
    expect(parsePerformanceInsights({ ...summary, sourceRevision: undefined })).toBeUndefined();
    expect(parsePerformanceInsights({ ...summary, view: "complete" })).toBeUndefined();
    expect(parsePerformanceInsights({ ...summary, partial: { ...summary.partial, days: [] } })).toBeUndefined();
    const relations = roundTrip(insightsRelations(snapshot));
    // A method with outcome days cannot arrive with fewer relations than it evaluated.
    expect(parsePerformanceInsights({ ...relations, partial: { ...relations.partial, items: [] } })).toBeUndefined();
    expect(parsePerformanceInsights({ ...relations, partial: { ...relations.partial, promotion: { status: "enabled" } } })).toBeUndefined();
  });
});

describe("partición", () => {
  it("counts repeated identical rows once, the same denominators the methods use", () => {
    const source = syntheticHistory({ ...PROFILE, years: 1 }, 7, false);
    const repeated: InsightsSource = { ...source, sessions: [...source.sessions, source.sessions[0]!] };
    const model = buildInsightsReadModel(repeated, options);
    expect(model.partial.partition.total).toBe(model.facts.totals.total);
    expect(model.partial.partition.configurationUnknown).toBe(model.partial.totals.total);
  });
  it("has no denominators in a contradictory history", () => {
    const source = syntheticHistory(PROFILE, 7, false);
    const model = buildInsightsReadModel({ ...source, sessions: [...source.sessions, { ...source.sessions[0]!, endedAt: "2021-01-01T23:00:00.000Z" }] }, options);
    expect(model.integrity).toBe("conflicting_duplicates");
    expect(model.partial.partition).toEqual({ total: 0, configurationKnown: 0, configurationUnknown: 0 });
    expect(parseCompleteInsights(roundTrip(model))).toBeTruthy();
  });
});

describe("publicación de asociaciones parciales", () => {
  // The same pairs, under both methods. Reps react to the exposure, which is what an unrecorded change of variant would also do.
  function reactive(configuration: string | null): InsightsSource {
    const source = syntheticHistory({ ...PROFILE, exercises: 3, catalog: 3, metrics: 0 }, 3, false);
    const metric = "93670000-0000-4000-8000-0000000000ee";
    const dates = source.sessions.map(row => row.date!);
    const level = (date: string) => (Number(date.slice(8)) * 7) % 10;
    const dayOf = new Map(source.exercises.map(row => [row.id, source.sessions.find(session => session.id === row.sessionId)!.date!]));
    return { ...source, exercises: source.exercises.map(row => ({ ...row, configuration })),
      metricDefinitions: [{ id: metric, name: "Energía", unit: null, valueType: "decimal", archived: false }], metricValues: dates.map(date => ({ metricId: metric, date, value: level(date) })),
      sets: source.sets.map(row => ({ ...row, actualReps: 12 - level(dayOf.get(row.sessionExerciseId)!) })) };
  }
  const passing = <T extends { state: string }>(items: readonly T[], state: string) => items.filter(row => row.state === state);

  it("names a pass a coincidence, never a result of the strict method, with the same evidence", () => {
    const partial = buildInsightsReadModel(reactive(null), { ...options, permutations: 99 });
    const strict = buildInsightsReadModel(reactive("none"), { ...options, permutations: 99 });
    const strictPass = passing(strict.associations.items, "exploratory");
    const partialPass = passing(partial.partial.associations.items, "coincidence_context_unknown") as PartialAssociationResult[];
    expect(strictPass.length).toBeGreaterThan(0);
    expect(partialPass.map(row => row.id)).toEqual(strictPass.map(row => `partial:${row.id}`));
    expect(partial.partial.associations.items.some(row => (row.state as string) === "exploratory")).toBe(false);
    expect(partialPass[0]).toMatchObject({ reason: "coincides_context_unknown", contextCompleteness: "configuration_unknown" });
    expect(partialPass[0]!.pairs).toBe(strictPass[0]!.pairs);
    expect(partial.partial.associations.promotion).toEqual({ status: "not_enabled", reason: "partial_context" });
  });
  it("rejects a partial lane that uses the strict word, and a strict lane that uses the partial one", () => {
    const partial = roundTrip(buildInsightsReadModel(reactive(null), { ...options, permutations: 99 }));
    expect(parseCompleteInsights(partial)).toBeTruthy();
    const items = partial.partial.associations.items.map(row => ({ ...row, state: "exploratory" }));
    expect(parseCompleteInsights({ ...partial, partial: { ...partial.partial, associations: { ...partial.partial.associations, items } } })).toBeUndefined();
    const relations = roundTrip(insightsRelations(createInsightsSnapshot(reactive(null), { ...options, permutations: 99, revision: "r" })));
    expect(parsePerformanceInsights(relations)).toBeTruthy();
    const forged = relations.partial.items.map(row => ({ ...row, state: "exploratory" }));
    expect(parsePerformanceInsights({ ...relations, partial: { ...relations.partial, items: forged } })).toBeUndefined();
    const crossed = roundTrip(insightsRelations(createInsightsSnapshot(reactive("none"), { ...options, permutations: 99, revision: "r" })));
    const strictForged = crossed.strict.items.map(row => ({ ...row, state: "coincidence_context_unknown" }));
    expect(parsePerformanceInsights({ ...crossed, strict: { ...crossed.strict, items: strictForged } })).toBeUndefined();
  });
});

describe("caché de instantáneas", () => {
  const make = (now: { value: number }) => new InsightsSnapshotCache<string>({ maxEntries: 2, ttlMs: 1000, now: () => now.value });
  it("serves only the same account, revision and day, while it lasts", () => {
    const now = { value: 0 }, cache = make(now);
    cache.set("a", "r1", "d1", "x");
    expect(cache.get("a", "r1", "d1")).toBe("x");
    expect(cache.get("b", "r1", "d1")).toBeNull();
    expect(cache.get("a", "r1", "d2")).toBeNull();
    cache.set("a", "r1", "d1", "x");
    expect(cache.get("a", "r2", "d1")).toBeNull();
    // A stale entry is gone, not merely skipped.
    expect(cache.get("a", "r1", "d1")).toBeNull();
    cache.set("a", "r1", "d1", "x");
    now.value = 1000;
    expect(cache.get("a", "r1", "d1")).toBeNull();
  });
  it("keeps one entry per account and evicts the least recently used", () => {
    const cache = make({ value: 0 });
    cache.set("a", "r1", "d", "1"); cache.set("a", "r2", "d", "2");
    expect(cache.get("a", "r1", "d")).toBeNull();
    cache.set("a", "r2", "d", "2"); cache.set("b", "r", "d", "b");
    cache.get("a", "r2", "d");
    cache.set("c", "r", "d", "c");
    expect(cache.get("b", "r", "d")).toBeNull();
    expect(cache.get("a", "r2", "d")).toBe("2");
  });
});
