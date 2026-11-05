import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { buildInsightsReadModel, createInsightsSnapshot, insightsDaysPage, insightsRelation, insightsRelations, insightsSummary } from "./read-model";
import { syntheticHistory } from "./scale-fixture";

const PROFILES = {
  year: { years: 1, sessionsPerWeek: 4, exercises: 6, setsPerExercise: 4, catalog: 30, metrics: 8, mealsPerDay: 4 },
  fiveYears: { years: 5, sessionsPerWeek: 5, exercises: 6, setsPerExercise: 4, catalog: 40, metrics: 20, mealsPerDay: 4 },
  tenYears: { years: 10, sessionsPerWeek: 6, exercises: 8, setsPerExercise: 5, catalog: 60, metrics: 30, mealsPerDay: 5 },
};
const kib = (value: unknown) => Math.round(Buffer.byteLength(JSON.stringify(value)) / 102.4) / 10;
const mib = (bytes: number) => Math.round(bytes / 104857.6) / 10;
const stats = (values: number[]) => ({ median: Math.round([...values].sort((a, b) => a - b)[values.length >> 1]!), max: Math.round(Math.max(...values)) });

describe("escala con perfiles sintéticos", () => {
  it("computes a year quickly and keeps every view under the response budget", () => {
    const started = performance.now();
    const source = syntheticHistory(PROFILES.year);
    const model = buildInsightsReadModel(source, { today: "2030-01-01" });
    expect(performance.now() - started).toBeLessThan(10_000);
    expect(model.integrity).toBe("valid"); expect(model.history.sessions).toBeGreaterThan(150);
    const snapshot = createInsightsSnapshot(source, { today: "2030-01-01", permutations: 19 });
    for (const view of [insightsSummary(snapshot), insightsDaysPage(snapshot, {}), insightsRelations(snapshot)]) expect(kib(view), view.view).toBeLessThan(128);
  }, 30_000);
  /**
   * One profile per process: `INSIGHTS_SCALE_OUT=<file> INSIGHTS_SCALE_PROFILE=<name> INSIGHTS_SCALE_CAPTURED=0|1 NODE_OPTIONS=--expose-gc`, with --pool=forks.
   * Five runs, median and maximum. Retained is the live heap a snapshot adds after a forced collection, with its relations evaluated: what a reuse keeps
   * in memory. Peak is the process's resident maximum minus the resident size with the source already built, so it does not include reading from the database.
   */
  const out = process.env.INSIGHTS_SCALE_OUT, name = process.env.INSIGHTS_SCALE_PROFILE as keyof typeof PROFILES | undefined;
  it.runIf(!!out && !!name)("measured profile", () => {
    const captured = process.env.INSIGHTS_SCALE_CAPTURED === "1";
    const source = syntheticHistory(PROFILES[name!], 1, captured);
    const rows = { sessions: source.sessions.length, exercises: source.exercises.length, sets: source.sets.length, metricValues: source.metricValues.length, meals: source.meals.length, feelings: source.feelings.length };
    // One page per 1000 rows, at least one per stream; the extra one is the metric definitions.
    const pages = Object.values(rows).reduce((sum, count) => sum + Math.max(1, Math.ceil(count / 1000)), 1);
    globalThis.gc?.();
    const rssBase = process.memoryUsage().rss, heapBase = process.memoryUsage().heapUsed;
    const times = { snapshot: [] as number[], summary: [] as number[], daysPage: [] as number[], relationsFirst: [] as number[], relationsAgain: [] as number[], relationDetail: [] as number[] };
    let bytes = {}, retained = 0, comparable = {}, candidates = 0;
    for (let run = 0; run < 5; run++) {
      const clock = (key: keyof typeof times, work: () => unknown) => { const started = performance.now(); const value = work(); times[key].push(performance.now() - started); return value; };
      const snapshot = clock("snapshot", () => createInsightsSnapshot(source, { today: "2040-01-01", revision: "r" })) as ReturnType<typeof createInsightsSnapshot>;
      const summary = clock("summary", () => JSON.stringify(insightsSummary(snapshot)));
      const next = insightsSummary(snapshot).facts.page.nextBefore!;
      const days = clock("daysPage", () => JSON.stringify(insightsDaysPage(snapshot, { before: next })));
      const relations = clock("relationsFirst", () => JSON.stringify(insightsRelations(snapshot)));
      clock("relationsAgain", () => JSON.stringify(insightsRelations(snapshot)));
      const pick = (captured ? snapshot.strict.candidates : snapshot.partial.lane.candidates).find(row => row.values.size > 0)!.definition.id;
      const detail = clock("relationDetail", () => JSON.stringify(insightsRelation(snapshot, pick)));
      bytes = { summary: kib(JSON.parse(summary as string)), daysPage: kib(JSON.parse(days as string)), relations: kib(JSON.parse(relations as string)), relationDetail: kib(JSON.parse(detail as string)), relationDetailRecent: kib(insightsRelation(snapshot, pick, { pairs: "recent" })) };
      comparable = { strict: snapshot.totals.comparable, partial: snapshot.partial.totals.comparable, strictDays: snapshot.history.outcomeDays, partialDays: snapshot.partial.outcomeDays };
      candidates = snapshot.strict.candidates.length;
      globalThis.gc?.();
      retained = process.memoryUsage().heapUsed - heapBase;
    }
    const usage = process.resourceUsage().maxRSS * 1024;
    writeFileSync(out!, JSON.stringify({ name, captured, rows, comparable, candidatesPerMethod: candidates, sourcePages: pages,
      queries: { reuse: 7, fullRead: pages + 14, fullReadOneRetry: 2 * (pages + 14), bothRetriesWorstCase: 4 * (pages + 14) },
      ms: Object.fromEntries(Object.entries(times).map(([key, values]) => [key, stats(values)])), responseKiB: bytes,
      retainedMiB: mib(retained), peakAboveSourceMiB: mib(usage - rssBase), gcAvailable: !!globalThis.gc }, null, 2));
  }, 1_800_000);
});
