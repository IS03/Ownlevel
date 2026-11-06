import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calibrationSteps, type CalibrationResult, type CalibrationScenario } from "./calibration";

/**
 * #367 method 2 widens the family by two candidates per account with a sleep metric (one declared night replaces nothing: the two
 * undeclared windows stay, and body weight is new). This campaign measures the same policy with 12 and 14 candidates on the
 * scenarios that matter for these exposures: none, autocorrelated days, a trend shared by exposure and outcome (weight drifting
 * over months), and absence that depends on the outcome (weighing yourself only on some days). It never replaces the full one.
 * INSIGHTS_FAMILY_OUT=<file> INSIGHTS_FAMILY_HISTORIES=<n> npx vitest run src/lib/progress/insights-engine/family-size.campaign.test.ts
 */
const out = process.env.INSIGHTS_FAMILY_OUT, histories = Number(process.env.INSIGHTS_FAMILY_HISTORIES ?? 0);
describe("#367 tamaño de familia", () => {
  it.runIf(!!out && histories > 0)("measured: 12 against 14 candidates", async () => {
    const results: (CalibrationResult & { seconds: number })[] = [];
    for (const scenario of ["independent", "autocorrelated", "spurious_trend", "selective_absence", "ordinal_ties"] as CalibrationScenario[]) for (const candidates of [12, 14]) {
      const started = Date.now();
      const steps = calibrationSteps(scenario, { histories, seed: 0x367b, permutations: 199, candidates });
      let step = steps.next();
      while (!step.done) { await new Promise(resolve => setImmediate(resolve)); step = steps.next(); }
      results.push({ ...step.value, seconds: (Date.now() - started) / 1000 });
      writeFileSync(out!, JSON.stringify(results, null, 2));
    }
    expect(results).toHaveLength(10);
  }, 3_600_000);
});
