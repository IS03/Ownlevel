import { it } from "vitest";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { buildInsightsReadModel, createInsightsSnapshot, insightsDaysPage, insightsRelation, insightsRelations, insightsSummary } from "./read-model";
import { syntheticHistory } from "./scale-fixture";

/**
 * Equivalence tool for changes that must not move any result: every view, every page and every relation's full evidence,
 * hashed, for both methods. Run it before and after a change and compare the files; identical hashes mean identical JSON.
 * `INSIGHTS_FINGERPRINT_OUT=<file> npx vitest run src/lib/progress/insights-engine/equivalence-fingerprint.test.ts`
 */
const out = process.env.INSIGHTS_FINGERPRINT_OUT;
// INSIGHTS_FINGERPRINT_OMIT=a,b hashes without those fields, to compare a change that only adds them.
const omitted = new Set((process.env.INSIGHTS_FINGERPRINT_OMIT ?? "").split(",").filter(Boolean));
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value, (key, field) => omitted.has(key) ? undefined : field)).digest("hex");
it.runIf(!!out)("fingerprint of every view", () => {
  const year = { years: 1, sessionsPerWeek: 4, exercises: 6, setsPerExercise: 4, catalog: 30, metrics: 8, mealsPerDay: 4 };
  const five = { years: 5, sessionsPerWeek: 5, exercises: 6, setsPerExercise: 4, catalog: 40, metrics: 20, mealsPerDay: 4 };
  const fixtures = [
    ["year-s1", syntheticHistory(year, 1, false)], ["year-s2-captured", syntheticHistory(year, 2, true)], ["year-s3", syntheticHistory(year, 3, false)],
    ["five-s1", syntheticHistory(five, 1, false)], ["five-s1-captured", syntheticHistory(five, 1, true)],
  ] as const;
  const result: Record<string, string> = {};
  for (const [name, source] of fixtures) for (const method of [1, 2] as const) {
    const snapshot = createInsightsSnapshot(source, { today: "2030-01-01", revision: "r", method, permutations: 99 });
    const pages: unknown[] = [insightsSummary(snapshot, { limit: 120 })];
    for (let before = (pages[0] as ReturnType<typeof insightsSummary>).facts.page.nextBefore; before; ) {
      const page = insightsDaysPage(snapshot, { before, limit: 120 }); pages.push(page); before = page.facts.page.nextBefore;
    }
    result[`${name}/m${method}/pages`] = hash(pages);
    result[`${name}/m${method}/summary`] = hash(insightsSummary(snapshot));
    result[`${name}/m${method}/relations`] = hash(insightsRelations(snapshot));
    result[`${name}/m${method}/details`] = hash([...snapshot.strict.candidates, ...snapshot.partial.lane.candidates].map(candidate => insightsRelation(snapshot, candidate.definition.id, { pairs: "all" })));
    result[`${name}/m${method}/unknown`] = hash(insightsRelation(snapshot, "nope"));
  }
  const model = buildInsightsReadModel(fixtures[0][1], { today: "2030-01-01", permutations: 99 });
  result["model/plain"] = hash(model);
  result["model/strict-detail"] = hash(buildInsightsReadModel(fixtures[0][1], { today: "2030-01-01", permutations: 99, association: model.associations.items[0]?.id }));
  result["model/partial-detail"] = hash(buildInsightsReadModel(fixtures[1][1], { today: "2030-01-01", permutations: 99, association: model.partial.associations.items[0]?.id }));
  writeFileSync(out!, JSON.stringify(result, null, 2));
}, 900_000);

/**
 * Memory floor: one 10-year snapshot with both methods' relations, in its own process. Run it under decreasing
 * `NODE_OPTIONS=--max-old-space-size=<MiB>` with `INSIGHTS_MEMORY_FLOOR=1 --pool=forks`: the smallest size that completes is
 * the live heap the computation needs, which a resident maximum does not show (V8 does not give memory back between phases).
 */
it.runIf(process.env.INSIGHTS_MEMORY_FLOOR === "1")("one 10-year snapshot and its relations", () => {
  const source = syntheticHistory({ years: 10, sessionsPerWeek: 6, exercises: 8, setsPerExercise: 5, catalog: 60, metrics: 30, mealsPerDay: 5 });
  const snapshot = createInsightsSnapshot(source, { today: "2040-01-01", revision: "r", method: 2 });
  snapshot.strict.evaluate(); snapshot.partial.lane.evaluate();
}, 600_000);
