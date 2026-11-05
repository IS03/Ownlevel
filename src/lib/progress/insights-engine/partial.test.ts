import { describe, expect, it } from "vitest";
import { parseCompleteInsights } from "../../mobile-api/performance-insights-contract";
import { buildPerformanceInsightsPartialV1, buildPerformanceInsightsV1 } from "../performance-insights";
import { buildInsightsReadModel } from "./read-model";
import { toPerformanceSessions } from "./source-adapter";
import type { InsightsSource } from "./types";

const EX_A = "93670000-0000-4000-8000-00000000000a", EX_B = "93670000-0000-4000-8000-00000000000b", METRIC = "93670000-0000-4000-8000-0000000000aa";
const dateAt = (day: number) => new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
type Over = Partial<InsightsSource["exercises"][number]>;

/** Exercise A trained daily with the given reps. `over` sets the historical snapshot per day; the default is what the loader reads today. */
function history(reps: readonly number[], over: (day: number) => Over = () => ({})): InsightsSource {
  const sessions: InsightsSource["sessions"][number][] = [], exercises: InsightsSource["exercises"][number][] = [], sets: InsightsSource["sets"][number][] = [];
  reps.forEach((value, day) => {
    const date = dateAt(day), id = `s${day}`;
    sessions.push({ id, date, routineId: "r1", routineName: "Rutina", name: null, status: "completed", startedAt: `${date}T18:00:00.000Z`, endedAt: `${date}T19:00:00.000Z`, performanceLevel: null, painLevel: null, legacyEnergyLevel: null });
    exercises.push({ id: `e${day}`, sessionId: id, exerciseId: EX_A, name: "Press", implement: "barra", weightMode: "Peso total", isCompleted: true, configuration: null, ...over(day) });
    sets.push({ id: `set${day}`, sessionExerciseId: `e${day}`, actualReps: value, actualLoad: 100, isCompleted: true, completedAt: `${date}T18:10:00.000Z` });
  });
  return { sessions, exercises, sets, feelings: [], metricDefinitions: [], metricValues: [], meals: [] };
}
const model = (source: InsightsSource, extra: { association?: string } = {}) => buildInsightsReadModel(source, { today: "2027-01-01", permutations: 19, ...extra });
const readings = (source: InsightsSource) => model(source).partial.days.flatMap(day => day.sessions.flatMap(session => session.exercises.map(row => [day.date, row.reading])));

describe("método parcial", () => {
  it("compares unknown configuration on both sides and leaves the strict method exactly as it was", () => {
    const source = history([8, 10, 9]);
    const read = model(source);
    expect(read.facts.totals).toMatchObject({ comparable: 0, insufficient: 3, total: 3 });
    expect(read.exclusions.performance.missing_context).toBe(3);
    expect(read.performanceMethodVersion).toBe("insights-performance/1");
    expect(read.partial).toMatchObject({ methodVersion: "insights-performance-partial/1", engineMethodVersion: "insights-engine-partial/1", contextCompleteness: "configuration_unknown", outcomeDays: 2 });
    expect(read.partial.totals).toEqual({ higher: 1, same: 0, lower: 1, ambiguous: 0, insufficient: 1, total: 3, comparable: 2, coverage: 2 / 3 });
    expect(read.partial.days[0]).toMatchObject({ lowerProportion: 1 });
    expect(read.partial.days[0]!.sessions[0]!.exercises[0]).toMatchObject({ reading: "lower_record", referenceSessionId: "s1" });
    expect(parseCompleteInsights(JSON.parse(JSON.stringify(read)))).toBeTruthy();
  });

  it("speaks only of records: no strict status, decline or improvement crosses into the lane", () => {
    const text = JSON.stringify(model(history([8, 10, 9])).partial);
    expect(text).not.toMatch(/"(improved|declined|observed_stable)"/);
    expect(text).not.toMatch(/candidateDeclineProportion|declineProportion/);
    expect(text).toContain('"higher_record"'); expect(text).toContain('"lower_record"');
  });

  it("does not modify a single strict result, whatever configuration the history has", () => {
    const sessions = toPerformanceSessions(history([8, 10, 9, 11], day => ({ configuration: day % 2 ? "none" : null }))).sessions;
    const before = JSON.stringify(buildPerformanceInsightsV1({ sessions, historyCoverage: "complete" }));
    buildPerformanceInsightsPartialV1({ sessions, historyCoverage: "complete" });
    expect(JSON.stringify(buildPerformanceInsightsV1({ sessions, historyCoverage: "complete" }))).toBe(before);
  });

  it.each([
    ["implement", (day: number) => ({ implement: day === 0 ? "barra" : "mancuerna" })],
    ["mode", (day: number) => ({ weightMode: day === 0 ? "Peso total" : "lingotes (no kg)" })],
  ])("never compares across a different historical %s", (_, over) => {
    const read = model(history([8, 10], over)).partial;
    expect(read.totals).toMatchObject({ comparable: 0, insufficient: 2 });
    expect(read.exclusions.performance.no_compatible_reference).toBe(2);
  });

  it("does not fill a missing implement or mode from anywhere", () => {
    for (const over of [{ implement: null }, { weightMode: null }, { implement: "  " }]) {
      const read = model(history([8, 10], () => over)).partial;
      expect(read.totals).toMatchObject({ comparable: 0, insufficient: 2 });
      expect(read.exclusions.performance.missing_context).toBe(2);
    }
  });

  it("skips an incompatible session in between and refers to the last compatible one", () => {
    const read = model(history([8, 20, 10], day => ({ implement: day === 1 ? "mancuerna" : "barra" }))).partial;
    expect(read.days[0]!.sessions[0]!.exercises[0]).toMatchObject({ reading: "higher_record", referenceSessionId: "s0" });
  });

  it("treats blank and null as the same unknown, and never compares known with unknown", () => {
    expect(readings(history([8, 10], day => ({ configuration: day ? "   " : null })))).toEqual([[dateAt(1), "higher_record"], [dateAt(0), "insufficient_comparison"]]);
    const mixed = model(history([8, 10, 12], day => ({ configuration: day === 1 ? "agarre cerrado" : null })));
    // The known exposure leaves the partial lane; the unknown ones compare with each other, skipping it.
    expect(mixed.partial.partition).toEqual({ total: 3, configurationKnown: 1, configurationUnknown: 2 });
    expect(mixed.partial.totals).toMatchObject({ total: 2, comparable: 1, higher: 1 });
    expect(mixed.partial.days[0]!.sessions[0]!.exercises[0]!.referenceSessionId).toBe("s0");
    expect(mixed.facts.totals.comparable).toBe(0);
  });

  it("never counts one exposure as comparable in both methods", () => {
    const read = model(history([8, 9, 10, 11, 12, 13], day => ({ configuration: day < 3 ? null : "none" })));
    expect(read.partial.partition).toEqual({ total: 6, configurationKnown: 3, configurationUnknown: 3 });
    expect(read.partial.totals).toMatchObject({ total: 3, comparable: 2 });
    expect(read.facts.totals).toMatchObject({ total: 6, comparable: 2 });
    const strict = read.facts.days.flatMap(day => day.sessions.flatMap(session => session.exercises.filter(row => row.status !== "insufficient_comparison").map(row => `${session.sessionId}:${row.exerciseId}`)));
    const partial = read.partial.days.flatMap(day => day.sessions.flatMap(session => session.exercises.filter(row => row.reading !== "insufficient_comparison").map(row => `${session.sessionId}:${row.exerciseId}`)));
    expect(strict).toHaveLength(2); expect(partial).toHaveLength(2);
    expect(strict.filter(id => partial.includes(id))).toEqual([]);
    expect(read.history.outcomeDays).toBe(2); expect(read.partial.outcomeDays).toBe(2);
  });

  it("moves an exposure with one known block out of the partial lane, where the strict method already rejects it", () => {
    const source = history([8, 10]);
    const second: InsightsSource = { ...source, exercises: [...source.exercises, { ...source.exercises[1]!, id: "extra", configuration: "none" }] };
    const read = model(second);
    expect(read.partial.partition).toEqual({ total: 2, configurationKnown: 1, configurationUnknown: 1 });
    expect(read.partial.totals.comparable).toBe(0);
    expect(read.facts.totals.comparable).toBe(0);
  });

  it("keeps a session whose exposures all left the lane, without a false comparable or an empty day", () => {
    const read = model(history([8, 10], () => ({ configuration: "none" })));
    expect(read.partial.totals).toMatchObject({ total: 0, comparable: 0, coverage: null });
    expect(read.partial.days.map(day => day.date)).toEqual(read.facts.days.map(day => day.date));
    expect(read.partial.days[0]!.lowerProportion).toBeNull();
    expect(read.facts.totals.comparable).toBe(1);
  });

  it("reports the highest value only inside the partial history, separate from strict records", () => {
    const read = model(history([8, 10, 9, 12, 13], day => ({ configuration: day >= 3 ? "none" : null })));
    const row = (date: string) => read.partial.days.find(day => day.date === date)!.sessions[0]!.exercises[0];
    expect(row(dateAt(1))).toMatchObject({ highestInPartialContext: true });
    expect(row(dateAt(2))).toMatchObject({ highestInPartialContext: false });
    expect(read.facts.days[0]!.sessions[0]!.exercises[0]).toMatchObject({ newHigh: true, referenceSessionId: "s3" });
  });

  it("pages over the same dates as the facts", () => {
    const reps = Array.from({ length: 10 }, (_, day) => 8 + day % 3);
    const read = buildInsightsReadModel(history(reps), { today: "2027-01-01", limit: 4, permutations: 19 });
    expect(read.partial.days.map(day => day.date)).toEqual(read.facts.days.map(day => day.date));
    expect(read.partial.days).toHaveLength(4);
  });

  it("leaves a contradictory history unavailable in both methods", () => {
    const source = history([8, 9]);
    const read = model({ ...source, sessions: [...source.sessions, { ...source.sessions[0]!, endedAt: `${dateAt(0)}T20:00:00.000Z` }] });
    expect(read.partial).toMatchObject({ integrity: "conflicting_duplicates", days: [] });
    expect(parseCompleteInsights(JSON.parse(JSON.stringify(read)))).toBeTruthy();
  });

  it("excludes today's open day from the partial outcome and says so", () => {
    const read = buildInsightsReadModel(history([8, 9, 10]), { today: dateAt(2), permutations: 19 }).partial;
    expect(read.outcomeDays).toBe(1);
    expect(read.exclusions.days).toEqual({ day_still_open: 1, no_comparable_outcome: 1 });
  });
});

describe("asociaciones parciales", () => {
  const oscillating = Array.from({ length: 60 }, (_, day) => 8 + (day % 2 ? 1 : -1) * (day % 5 + 1));
  const withMetric = (source: InsightsSource): InsightsSource => ({ ...source, metricDefinitions: [{ id: METRIC, name: "Sueño", unit: null, valueType: "decimal", archived: false }],
    metricValues: source.sessions.map((session, day) => ({ metricId: METRIC, date: session.date!, value: (day * 7) % 11 })) });

  it("runs as its own family with its own ids, without touching the strict items", () => {
    const read = buildInsightsReadModel(withMetric(history(oscillating)), { today: "2027-01-01", permutations: 49 });
    expect(read.associations.testableCandidates).toBe(0);
    expect(read.associations.items.find(row => row.id.includes(METRIC))).toMatchObject({ id: `metric:${METRIC}:same_day`, state: "insufficient_data", pairs: 0 });
    const item = read.partial.associations.items.find(row => row.definition.subject === METRIC && row.definition.window === "same_day")!;
    expect(item).toMatchObject({ id: `partial:metric:${METRIC}:same_day`, contextCompleteness: "configuration_unknown" });
    expect(item.pairs).toBeGreaterThanOrEqual(50);
    expect(read.partial.associations.outcome).toBe("daily_lower_record_proportion");
    expect(read.partial.associations.promotion).toEqual({ status: "not_enabled", reason: "partial_context" });
    expect(read.partial.associations.testableCandidates).toBeGreaterThan(0);
    expect(parseCompleteInsights(JSON.parse(JSON.stringify(read)))).toBeTruthy();
  });

  it("never publishes a consistent state or the internal strict gate", () => {
    const read = buildInsightsReadModel(withMetric(history(oscillating)), { today: "2027-01-01", permutations: 49 });
    for (const item of read.partial.associations.items) {
      expect(["insufficient_data", "no_clear_signal", "coincidence_context_unknown"]).toContain(item.state);
      expect(item).not.toHaveProperty("strictGate");
    }
  });

  it("gives the pairs of a partial relation only by its partial id", () => {
    const source = withMetric(history(oscillating));
    const id = `metric:${METRIC}:same_day`;
    const partial = buildInsightsReadModel(source, { today: "2027-01-01", permutations: 19, association: `partial:${id}` });
    expect(partial.associations.detail).toBeNull();
    expect(partial.partial.associations.detail!.id).toBe(`partial:${id}`);
    expect(partial.partial.associations.detail!.pairs.length).toBeGreaterThanOrEqual(50);
    const strict = buildInsightsReadModel(source, { today: "2027-01-01", permutations: 19, association: id });
    expect(strict.partial.associations.detail).toBeNull();
    expect(strict.associations.detail).toEqual({ id, pairs: [] });
  });

  it("rejects a partial lane without its labels, or an item that hides what it is", () => {
    const read = JSON.parse(JSON.stringify(buildInsightsReadModel(withMetric(history(oscillating)), { today: "2027-01-01", permutations: 19 })));
    expect(parseCompleteInsights(read)).toBeTruthy();
    expect(parseCompleteInsights({ ...read, partial: undefined })).toBeUndefined();
    expect(parseCompleteInsights({ ...read, partial: { ...read.partial, contextCompleteness: "complete" } })).toBeUndefined();
    expect(parseCompleteInsights({ ...read, partial: { ...read.partial, methodVersion: "insights-performance/1" } })).toBeUndefined();
    const items = read.partial.associations.items.map((item: { id: string }) => ({ ...item, id: item.id.replace("partial:", "") }));
    expect(parseCompleteInsights({ ...read, partial: { ...read.partial, associations: { ...read.partial.associations, items } } })).toBeUndefined();
    expect(parseCompleteInsights({ ...read, partial: { ...read.partial, associations: { ...read.partial.associations, promotion: { status: "enabled" } } } })).toBeUndefined();
    expect(parseCompleteInsights({ ...read, partial: { ...read.partial, partition: { total: 9, configurationKnown: 1, configurationUnknown: 1 } } })).toBeUndefined();
  });

  it("does not use an exercise of another context to fill the denominators", () => {
    const source = history([8, 10]);
    const other: InsightsSource = { ...source, exercises: [...source.exercises, { ...source.exercises[1]!, id: "b1", exerciseId: EX_B, name: "Remo", implement: null }], sets: [...source.sets, { ...source.sets[1]!, id: "bs", sessionExerciseId: "b1" }] };
    const read = model(other).partial;
    expect(read.totals).toMatchObject({ total: 3, comparable: 1, insufficient: 2 });
    expect(read.exclusions.performance.missing_context).toBe(1);
  });
});
