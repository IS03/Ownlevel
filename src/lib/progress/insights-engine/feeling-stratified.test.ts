import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildExposureContext } from "./exposures";
import { prepareFeelingAssociations } from "./feeling-outcomes";
import { evaluateStratified, STRATIFIED_POLICY } from "./feeling-stratified";
import { STRATIFIED_SCENARIOS, runStratified, simulateSource, stratifiedSteps, type StratifiedResult, type StratifiedScenario } from "./feeling-stratified-calibration";
import { seededRandom } from "./stats";
import type { Candidate, ObservationRow } from "./types";

const date = (day: number) => new Date(Date.UTC(2029, 0, 1) + day * 86_400_000).toISOString().slice(0, 10);
const candidate = (values: Map<string, number>, id = "x"): Candidate => ({ values, exclusions: {}, definition: { id, family: "metric", window: "same_day", subject: id, temporalBasis: "same_day_unordered" } });

describe("#367 método estratificado para energía y fatiga al terminar", () => {
  it("does not take a shift shared by exposure and outcome between routines or blocks for an association", () => {
    // Two routines in alternate eras of 84 days; the exposure and the outcome both move with the era, and nothing else.
    const random = seededRandom(3), rows: ObservationRow[] = [], values = new Map<string, number>();
    for (let day = 0; day < 336; day += 2) {
      const era = Math.floor(day / 84) % 2, noise = () => random() - 0.5;
      rows.push({ date: date(day), y: era + 0.3 * noise(), ySensitivity: 0, routineKey: era ? "B" : "A" });
      values.set(date(day), 2 * era + noise());
    }
    const result = evaluateStratified(rows, [candidate(values)], { permutations: 99 });
    expect(Math.abs(result.items[0]!.rho!)).toBeLessThan(0.25);
    expect(result.items[0]!.state).not.toBe("exploratory");
  });

  it("finds an association that holds inside the strata, and keeps every stratum it can", () => {
    const random = seededRandom(5), rows: ObservationRow[] = [], values = new Map<string, number>();
    for (let day = 0; day < 336; day += 2) { const x = random(); rows.push({ date: date(day), y: x + 0.2 * random(), ySensitivity: 0, routineKey: "A" }); values.set(date(day), x); }
    const result = evaluateStratified(rows, [candidate(values)], { permutations: 99 });
    expect(result.items[0]).toMatchObject({ state: "exploratory", pairs: 168, keptPairs: 168 });
    expect(result.items[0]!.rho!).toBeGreaterThan(0.6);
  });

  it("drops strata too small to rank and counts what it lost, and is reproducible", () => {
    const rows: ObservationRow[] = [], values = new Map<string, number>();
    // 168 rows in one routine, plus three lone days of another one: a stratum of three rows stays out.
    for (let day = 0; day < 336; day += 2) { rows.push({ date: date(day), y: (day * 7) % 11, ySensitivity: 0, routineKey: "A" }); values.set(date(day), (day * 3) % 13); }
    for (const day of [1, 3, 5]) { rows.push({ date: date(day), y: 1, ySensitivity: 0, routineKey: "B" }); values.set(date(day), 1); }
    const a = evaluateStratified(rows, [candidate(values)], { permutations: 49, seed: 7 });
    expect(a.items[0]).toMatchObject({ pairs: 171, keptPairs: 168 });
    expect(evaluateStratified(rows, [candidate(values)], { permutations: 49, seed: 7 })).toEqual(a);
    expect(STRATIFIED_POLICY.blockDays).toBe(42);
  });

  it("runs on the real path from simulated source rows", () => {
    const source = simulateSource(STRATIFIED_SCENARIOS.independent, 11, 24);
    const prepared = prepareFeelingAssociations(source, "energy", { today: "2021-12-01", method: 2, context: buildExposureContext(source) });
    expect(prepared.rows.length).toBeGreaterThan(200);
    expect(prepared.candidates.filter(row => row.values.size > 100).length).toBe(12);
    const result = evaluateStratified(prepared.rows, prepared.candidates, { permutations: 49 });
    expect(result.testable).toBe(12);
  });

  it("is reproducible in a small run, and a planted effect is found more often than the null", () => {
    const small = { histories: 3, seed: 1, permutations: 49, looks: 2 };
    expect(runStratified("independent", small)).toEqual(runStratified("independent", small));
    expect(runStratified("planted_strong", small).stratified.plantedExploratory).toBeGreaterThan(runStratified("independent", small).stratified.plantedExploratory);
  });

  // Development and reserved validation, apart: their seeds and scenarios are fixed in the preregistration.
  const out = process.env.INSIGHTS_STRATIFIED_OUT, histories = Number(process.env.INSIGHTS_STRATIFIED_HISTORIES ?? 0), phase = process.env.INSIGHTS_STRATIFIED_PHASE;
  const only = process.env.INSIGHTS_STRATIFIED_SCENARIOS?.split(",");
  const PHASES = { dev: { seed: 0x5170, scenarios: ["independent", "routine_change", "trend", "planted_moderate"] }, validation: { seed: 0x5171, scenarios: Object.keys(STRATIFIED_SCENARIOS) } } as const;
  it.runIf(!!out && histories > 0 && (phase === "dev" || phase === "validation"))("measured run", async () => {
    const settings = PHASES[phase as keyof typeof PHASES], results: (StratifiedResult & { seconds: number; phase: string; seed: number })[] = [];
    for (const scenario of (settings.scenarios as readonly StratifiedScenario[]).filter(name => !only || only.includes(name))) {
      const started = Date.now();
      const steps = stratifiedSteps(scenario, { histories, seed: settings.seed, permutations: 199 });
      let step = steps.next();
      while (!step.done) { await new Promise(resolve => setImmediate(resolve)); step = steps.next(); }
      results.push({ ...step.value, seconds: (Date.now() - started) / 1000, phase: phase!, seed: settings.seed });
      writeFileSync(out!, JSON.stringify(results, null, 2));
    }
  }, 7_200_000);
});
