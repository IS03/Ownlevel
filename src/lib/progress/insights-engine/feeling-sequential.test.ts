import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildExposureContext } from "./exposures";
import { prepareFeelingAssociations } from "./feeling-outcomes";
import { evaluateSequential, eligibleCandidates, alphaAtLook, permutationsAtLook, scheduledDates, sequentialAnalysis, NIGHT_NOT_SHOWN_BEFORE, SEQUENTIAL_POLICY, type SequentialItem } from "./feeling-sequential";
import { STRATIFIED_SCENARIOS, PLANTED_METRIC, simulateSource } from "./feeling-stratified-calibration";
import { evaluateStratified } from "./feeling-stratified";
import { seededRandom } from "./stats";
import type { Candidate, InsightsSource, ObservationRow } from "./types";

const date = (day: number) => new Date(Date.UTC(2029, 0, 1) + day * 86_400_000).toISOString().slice(0, 10);
const candidate = (values: Map<string, number>, id: string): Candidate => ({ values, exclusions: {}, definition: { id, family: "metric", window: "previous_day", subject: id, temporalBasis: "previous_logical_day" } });
const previous = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
/** The day before's metric 0 moves how energy ends: a planted effect of an eligible candidate, applied to simulated source rows. */
function withPreviousDayEffect(source: InsightsSource, shift: number): InsightsSource {
  const metric = new Map(source.metricValues.filter(row => row.metricId === PLANTED_METRIC).map(row => [row.date, row.value as number]));
  const dates = new Map(source.sessions.map(session => [session.id, session.date!]));
  return { ...source, feelings: source.feelings.map(row => {
    const value = metric.get(previous(dates.get(row.sessionId)!)), facts = row.facts as Record<string, { value: number }>;
    if (value === undefined || !facts.energyPost) return row;
    return { ...row, facts: { ...facts, energyPost: { ...facts.energyPost, value: Math.min(5, Math.max(1, facts.energyPost.value + Math.round(shift * value))) } } };
  }) };
}

describe("#367 diseño secuencial: candidatos anteriores y miradas controladas", () => {
  it("keeps only candidates shown to be before the start, and says why the others are out", () => {
    const source = simulateSource(STRATIFIED_SCENARIOS.independent, 3, 24);
    const { candidates } = prepareFeelingAssociations(source, "energy", { today: "2021-12-01", method: 2, context: buildExposureContext(source) });
    const { eligible, excluded } = eligibleCandidates(candidates);
    expect(eligible.every(row => ["previous_logical_day", "explicit_meal_time_before_start"].includes(row.definition.temporalBasis))).toBe(true);
    expect(eligible.some(row => row.definition.id.endsWith(":same_day"))).toBe(false);
    // Six same-day metrics, four same-day nutrients and the day's body weight (method 2).
    expect(excluded.filter(row => row.reason === "same_day_unordered").map(row => row.id).sort()).toEqual(expect.arrayContaining([expect.stringContaining("body:weight_kg:same_day")]));
    expect(excluded.filter(row => row.reason === "same_day_unordered").length).toBe(6 + 4 + 1);
    expect(eligible.length + excluded.length).toBe(candidates.length);
  });

  it("spends α look by look so that an endless history stays within it, and needs more permutations as it goes", () => {
    let sum = 0;
    for (let k = 1; k <= 100_000; k++) sum += alphaAtLook(k);
    expect(sum).toBeLessThan(SEQUENTIAL_POLICY.alphaTotal / SEQUENTIAL_POLICY.outcomes);
    expect([alphaAtLook(1), alphaAtLook(4), alphaAtLook(8)].map(value => +value.toPrecision(3))).toEqual([0.0025, 0.00025, 0.0000694]);
    expect([permutationsAtLook(1), permutationsAtLook(4), permutationsAtLook(8)]).toEqual([4000, 40000, 144000]);
  });

  it("looks on a fixed calendar every three months, month ends included, and not between looks", () => {
    expect(scheduledDates("2029-01-31", "2030-01-31")).toEqual(["2029-04-30", "2029-07-31", "2029-10-31", "2030-01-31"]);
    const source = simulateSource(STRATIFIED_SCENARIOS.independent, 4, 24), context = buildExposureContext(source);
    const a = sequentialAnalysis(source, "energy", { today: "2021-08-20", method: 2, context, maxPermutations: 199 });
    const b = sequentialAnalysis(source, "energy", { today: "2021-09-25", method: 2, context, maxPermutations: 199 });
    expect(a.current?.date).toBe(b.current?.date);
    expect(b.current).toEqual(a.current);
  });

  it("does not let a same-day metric moved by how the session ended into the family", () => {
    const source = simulateSource(STRATIFIED_SCENARIOS.reverse_same_day, 5, 24), context = buildExposureContext(source);
    const prepared = prepareFeelingAssociations(source, "fatigue", { today: "2021-12-01", method: 2, context });
    // The stratified method of #417 sees it, on the same rows.
    const stratified = evaluateStratified(prepared.rows, prepared.candidates, { permutations: 99 });
    expect(stratified.items.find(row => row.id.endsWith(`${PLANTED_METRIC}:same_day`))!.state).toBe("exploratory");
    const analysis = sequentialAnalysis(source, "fatigue", { today: "2021-12-01", method: 2, context, maxPermutations: 999 });
    expect(analysis.current!.items.some(row => row.id.endsWith(":same_day"))).toBe(false);
    expect(analysis.excluded.some(row => row.id.endsWith(`${PLANTED_METRIC}:same_day`) && row.reason === "same_day_unordered")).toBe(true);
  });

  it("decides without permuting when no candidate can pass the descriptive gates", () => {
    const source = simulateSource(STRATIFIED_SCENARIOS.independent, 6, 24), context = buildExposureContext(source);
    const analysis = sequentialAnalysis(source, "energy", { today: "2021-12-01", method: 2, context });
    expect(analysis.current!.items.every(row => !row.passes)).toBe(true);
    expect(analysis.current!.permutationsUsed).toBe(0);
  });

  it("runs to the bound for a candidate permutations never reach, and stops early for one they keep reaching", () => {
    const random = seededRandom(9), rows: ObservationRow[] = [], strong = new Map<string, number>();
    for (let day = 0; day < 336; day += 2) { const x = random(); rows.push({ date: date(day), y: 0.8 * x + 0.2 * random(), ySensitivity: 0, routineKey: "A" }); strong.set(date(day), x); }
    const one = evaluateSequential(rows, [candidate(strong, "strong")], 1, { maxPermutations: 2000 });
    expect(one.items[0]).toMatchObject({ reason: "permutation_tested", passes: true });
    expect(one.permutationsUsed).toBe(2000);
    // 40 days: a ρ just over 0.30 passes the descriptive gates, yet permutations reach it often. The fixture is the first seed that
    // builds such a candidate; the method is not tuned to it.
    let fixture: { rows: ObservationRow[]; values: Map<string, number> } | null = null;
    for (let seed = 1; seed < 500 && !fixture; seed++) {
      const r = seededRandom(seed), small: ObservationRow[] = [], values = new Map<string, number>();
      for (let day = 0; day < 40; day++) { const x = r(); small.push({ date: date(day), y: 0.3 * x + r(), ySensitivity: 0, routineKey: "A" }); values.set(date(day), x); }
      const probe = evaluateSequential(small, [candidate(values, "weak")], 1, { maxPermutations: 1 });
      if (probe.items[0]!.reason === "permutation_tested") fixture = { rows: small, values };
    }
    expect(fixture).not.toBeNull();
    const late = evaluateSequential(fixture!.rows, [candidate(fixture!.values, "weak")], 8, { maxPermutations: 144_000 });
    expect(late.items[0]).toMatchObject({ reason: "stopped_early", familyAdjustedP: null, passes: false });
    expect(late.permutationsUsed).toBeLessThan(5_000);
    expect(late.items[0]!.stopped!.pLowerBound).toBeGreaterThan(alphaAtLook(8));
  });

  it("keeps each candidate's stopping point, and never gives a stopped one a p over permutations it was not counted in (#419)", () => {
    // 40 days: one candidate that permutations never reach, and one just over the descriptive gates that they keep reaching.
    // The fixture is the first seed that builds both; nothing in the method is tuned to it.
    let fixture: { rows: ObservationRow[]; strong: Map<string, number>; weak: Map<string, number> } | null = null;
    for (let seed = 1; seed < 2000 && !fixture; seed++) {
      const r = seededRandom(seed), rows: ObservationRow[] = [], strong = new Map<string, number>(), weak = new Map<string, number>();
      for (let day = 0; day < 40; day++) { const x = r(), y = x + 0.05 * r(); rows.push({ date: date(day), y, ySensitivity: 0, routineKey: "A" }); strong.set(date(day), x); weak.set(date(day), 0.3 * y + r()); }
      const probe = evaluateSequential(rows, [candidate(strong, "strong"), candidate(weak, "weak")], 1, { maxPermutations: 1 });
      if (probe.items.every(item => item.reason === "permutation_tested")) fixture = { rows, strong, weak };
    }
    expect(fixture).not.toBeNull();
    const result = evaluateSequential(fixture!.rows, [candidate(fixture!.strong, "strong"), candidate(fixture!.weak, "weak")], 1);
    const [strong, weak] = result.items as [SequentialItem, SequentialItem];
    const allowed = permutationsAtLook(1);
    // The strong one is counted over the whole run, which goes to the bound because of it.
    expect(result.permutationsUsed).toBe(allowed);
    expect(strong).toMatchObject({ reason: "permutation_tested", permutations: allowed, stopped: null, passes: true });
    expect(strong.familyAdjustedP).toBeCloseTo(1 / (allowed + 1), 10);
    // The weak one stopped long before, keeps where it stopped, and gives a bound, not a p over the strong one's permutations.
    expect(weak).toMatchObject({ reason: "stopped_early", familyAdjustedP: null, passes: false });
    expect(weak.permutations).toBe(weak.stopped!.at);
    expect(weak.stopped!.at).toBeLessThan(allowed / 4);
    expect(weak.stopped!.exceedances).toBe(SEQUENTIAL_POLICY.stopExceedances);
    expect(weak.stopped!.pLowerBound).toBeCloseTo((SEQUENTIAL_POLICY.stopExceedances + 1) / (allowed + 1), 12);
    expect(weak.stopped!.pLowerBound).toBeGreaterThan(alphaAtLook(1));
  });

  it("does not take a declared night for one that ended before a session at dawn, and leaves the published sleep candidate alone (#419)", () => {
    const night: Candidate = { values: new Map([["2029-03-02", 7]]), exclusions: {}, definition: { id: "sleep:m:night_before", family: "sleep", window: "night_before", subject: "m", temporalBasis: "declared_night_ending_on_day" } };
    const day = candidate(new Map([["2029-03-02", 1]]), "metric:m:previous_day");
    const { eligible, excluded } = eligibleCandidates([night, day]);
    expect(eligible.map(row => row.definition.id)).toEqual(["metric:m:previous_day"]);
    expect(excluded).toEqual([{ id: "sleep:m:night_before", reason: NIGHT_NOT_SHOWN_BEFORE }]);
    // The candidate itself, and so the published sleep context and families, are not changed by being left out here.
    expect(night.definition.temporalBasis).toBe("declared_night_ending_on_day");
  });

  it("finds a planted effect of the day before, at a look the design reaches", () => {
    const source = withPreviousDayEffect(simulateSource(STRATIFIED_SCENARIOS.independent, 7, 24), 1.2), context = buildExposureContext(source);
    const analysis = sequentialAnalysis(source, "energy", { today: "2021-12-01", method: 2, context });
    const planted = analysis.current!.items.find(row => row.id.endsWith(`${PLANTED_METRIC}:previous_day`))!;
    expect(planted.reason).toBe("permutation_tested");
    expect(planted.passes).toBe(true);
    expect(analysis.current!.permutationsUsed).toBe(permutationsAtLook(analysis.current!.look));
  });

  /**
   * Feasibility only, not a validation: a few histories to see what the design costs and whether it can find what it should.
   * `INSIGHTS_SEQUENTIAL_FEASIBILITY_OUT=<file> INSIGHTS_SEQUENTIAL_FEASIBILITY_HISTORIES=<n>`.
   */
  const out = process.env.INSIGHTS_SEQUENTIAL_FEASIBILITY_OUT, histories = Number(process.env.INSIGHTS_SEQUENTIAL_FEASIBILITY_HISTORIES ?? 0);
  it.runIf(!!out && histories > 0)("feasibility", () => {
    const report: Record<string, unknown>[] = [];
    for (const [name, build] of [
      ["independent", (seed: number) => simulateSource(STRATIFIED_SCENARIOS.independent, seed, 24)],
      ["routine_change", (seed: number) => simulateSource(STRATIFIED_SCENARIOS.routine_change, seed, 24)],
      ["reverse_same_day", (seed: number) => simulateSource(STRATIFIED_SCENARIOS.reverse_same_day, seed, 24)],
      ["planted_previous_day_moderate", (seed: number) => withPreviousDayEffect(simulateSource(STRATIFIED_SCENARIOS.independent, seed, 24), 0.6)],
      ["planted_previous_day_strong", (seed: number) => withPreviousDayEffect(simulateSource(STRATIFIED_SCENARIOS.independent, seed, 24), 1.2)],
    ] as const) {
      const started = performance.now();
      let anyPass = 0, plantedPass = 0, looks = 0, permutations = 0, contenders = 0, eligible = 0, excluded = 0, rows = 0, slowest = 0;
      for (let history = 0; history < histories; history++) {
        const seed = (0x5181 + Math.imul(history + 1, 0x9e3779b1)) >>> 0, source = build(seed), context = buildExposureContext(source);
        let passed = false, planted = false;
        for (const kind of ["energy", "fatigue"] as const) {
          const t = performance.now();
          const analysis = sequentialAnalysis(source, kind, { today: "2021-12-31", method: 2, context, seed, everyLook: true });
          slowest = Math.max(slowest, performance.now() - t);
          eligible += analysis.eligible; excluded += analysis.excluded.length; looks += analysis.history.length;
          for (const look of analysis.history) {
            permutations += look.permutationsUsed; contenders += look.items.filter(item => item.reason === "permutation_tested").length;
            if (look.items.some(item => item.passes)) passed = true;
            if (kind === "energy" && look.items.some(item => item.passes && item.id.endsWith(`${PLANTED_METRIC}:previous_day`))) planted = true;
          }
          rows += analysis.history.at(-1) ? prepareFeelingAssociations(source, kind, { today: "2021-12-31", method: 2, context }).rows.length : 0;
        }
        if (passed) anyPass++; if (planted) plantedPass++;
      }
      report.push({ scenario: name, histories, seconds: Math.round((performance.now() - started) / 100) / 10, slowestAnalysisMs: Math.round(slowest),
        meanLooksPerOutcome: looks / histories / 2, meanPermutationsPerLook: Math.round(permutations / Math.max(1, looks)), contendersPerLook: contenders / Math.max(1, looks),
        meanRows: rows / histories / 2, meanEligibleCandidates: eligible / histories / 2, meanExcludedCandidates: excluded / histories / 2,
        anyPass: `${anyPass}/${histories}`, plantedPass: `${plantedPass}/${histories}` });
      writeFileSync(out!, JSON.stringify(report, null, 2));
    }
  }, 3_600_000);
});
