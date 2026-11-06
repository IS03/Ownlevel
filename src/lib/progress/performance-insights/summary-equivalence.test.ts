import { describe, expect, it } from "vitest";
import { buildPerformanceInsightsPartialV1 } from ".";
import { compareSessions } from "./kernel";
import { messyHistory as history } from "./messy-history.fixture";

describe("el resumen indexado equivale al recorrido completo", () => {
  const seeds = Array.from({ length: 60 }, (_, seed) => seed + 1);
  const rules = ["configuration_required", "configuration_unknown"] as const;
  describe.each(rules)("%s", rule => {
    it.each(seeds)("semilla %i: el mismo resultado, exclusiones incluidas, y las lecturas del detalle completo", seed => {
      const input = { sessions: history(seed), historyCoverage: "complete" as const, exclusionDetail: "summary" as const };
      const indexed = compareSessions(input, rule);
      expect(indexed).toEqual(compareSessions(input, rule, false));
      // The full detail only adds rows per other session: every reading, reference and record is the same.
      const reading = (result: typeof indexed) => result.sessions.map(session => session.exercises.map(({ status, reason, evidence, records, volume, reference }) => ({ status, reason, evidence, records, volume, reference: reference?.sessionId ?? null })));
      expect(reading(indexed)).toEqual(reading(compareSessions({ ...input, exclusionDetail: "full" }, rule)));
    });
    it("also without a history to compare with", () => {
      const input = { sessions: history(7), historyCoverage: "unavailable" as const, exclusionDetail: "summary" as const };
      expect(compareSessions(input, rule)).toEqual(compareSessions(input, rule, false));
    });
  });
  it("the fixtures reach what they claim to: comparisons, ties, records and exclusions", () => {
    const rows = Array.from({ length: 10 }, (_, seed) => buildPerformanceInsightsPartialV1({ sessions: history(seed + 1), historyCoverage: "complete", exclusionDetail: "summary" }).sessions.flatMap(session => session.exercises)).flat();
    expect(rows.some(row => row.reading === "higher_record")).toBe(true);
    expect(rows.some(row => row.reason === "reference_order_uncertain")).toBe(true);
    expect(rows.some(row => row.records.facts.length > 0)).toBe(true);
    expect(rows.some(row => row.exclusions.some(item => item.reason === "different_context"))).toBe(true);
    expect(rows.some(row => row.reference?.exposure.issue)).toBe(true);
  });
});
