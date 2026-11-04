import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { CALIBRATION_SCENARIOS, calibrationSteps, runCalibration, type CalibrationResult } from "./calibration";

/** Small and reproducible for CI. `INSIGHTS_CALIBRATION_OUT=<file> INSIGHTS_CALIBRATION_HISTORIES=<n>` runs the measured campaign. */
describe("calibración sintética", () => {
  it("is reproducible with the same seed and changes with another", () => {
    const a = runCalibration("autocorrelated", { histories: 6, seed: 11, permutations: 49, looks: 3 });
    expect(runCalibration("autocorrelated", { histories: 6, seed: 11, permutations: 49, looks: 3 })).toEqual(a);
    expect(a).toMatchObject({ histories: 6, looks: 3, candidates: 12, permutations: 49 });
    expect(a.meanPairsAtLastLook).toBeGreaterThan(150);
    expect(a.plantedStrictGate).toBeNull();
  });
  it("detects a planted effect more often than the null it is compared with", () => {
    const effect = runCalibration("true_effect", { histories: 12, seed: 5, permutations: 99, looks: 3 });
    const none = runCalibration("independent", { histories: 12, seed: 5, permutations: 99, looks: 3 });
    expect(effect.plantedStrictGate!).toBeGreaterThan(0.5); expect(effect.anyStrictGate).toBeGreaterThan(none.anyStrictGate);
  });
  const out = process.env.INSIGHTS_CALIBRATION_OUT, histories = Number(process.env.INSIGHTS_CALIBRATION_HISTORIES ?? 0);
  it.runIf(!!out && histories > 0)("measured campaign", async () => {
    const results: (CalibrationResult & { seconds: number })[] = [];
    for (const scenario of CALIBRATION_SCENARIOS) {
      const started = Date.now();
      const steps = calibrationSteps(scenario, { histories, seed: 0x367a, permutations: 199 });
      let step = steps.next();
      // Blocking the worker for minutes makes vitest report an RPC timeout even though the test passed.
      while (!step.done) { await new Promise(resolve => setImmediate(resolve)); step = steps.next(); }
      results.push({ ...step.value, seconds: (Date.now() - started) / 1000 });
      writeFileSync(out!, JSON.stringify(results, null, 2));
    }
  }, 3_600_000);
});
