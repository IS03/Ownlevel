import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FEELING_SCENARIOS, feelingCalibrationSteps, runFeelingCalibration, type FeelingCalibrationResult, type FeelingScenario } from "./feeling-calibration";

/** Small and reproducible for CI. `INSIGHTS_FEELING_CALIBRATION_OUT=<file> INSIGHTS_FEELING_CALIBRATION_HISTORIES=<n>` runs the measured campaign. */
describe("#367 calibración de energía y fatiga al terminar", () => {
  const small = { histories: 6, seed: 11, permutations: 49, looks: 3 };
  it("is reproducible with the same seed and changes with another", () => {
    const a = runFeelingCalibration("feeling_autocorrelated", small);
    expect(runFeelingCalibration("feeling_autocorrelated", small)).toEqual(a);
    expect(runFeelingCalibration("feeling_autocorrelated", { ...small, seed: 12 })).not.toEqual(a);
    expect(a).toMatchObject({ histories: 6, looks: 3, candidates: 12, permutations: 49, unstratifiedCandidateZeroStrictGate: null });
    expect(a.meanRowsAtLastLook).toBeGreaterThan(200);
  });
  it("finds a planted effect more often than the null it is compared with", () => {
    const effect = runFeelingCalibration("feeling_true_effect", { ...small, histories: 10, permutations: 99 });
    const none = runFeelingCalibration("feeling_independent", { ...small, histories: 10, permutations: 99 });
    expect(effect.candidateZeroStrictGate).toBeGreaterThan(0.5);
    expect(effect.candidateZeroStrictGate).toBeGreaterThan(none.candidateZeroStrictGate);
  });
  it("does not turn an exposure that only follows the prior answer into a result, which ignoring the prior would", () => {
    const confounded = runFeelingCalibration("feeling_prior_confounded", { ...small, histories: 10, permutations: 99 });
    expect(confounded.candidateZeroStrictGate).toBeLessThan(0.2);
    expect(confounded.unstratifiedCandidateZeroStrictGate!).toBeGreaterThan(0.5);
  });

  const only = process.env.INSIGHTS_FEELING_CALIBRATION_SCENARIOS?.split(",");
  const out = process.env.INSIGHTS_FEELING_CALIBRATION_OUT, histories = Number(process.env.INSIGHTS_FEELING_CALIBRATION_HISTORIES ?? 0);
  it.runIf(!!out && histories > 0)("measured campaign", async () => {
    const results: (FeelingCalibrationResult & { seconds: number })[] = [];
    for (const scenario of (Object.keys(FEELING_SCENARIOS) as FeelingScenario[]).filter(name => !only || only.includes(name))) {
      const started = Date.now();
      const steps = feelingCalibrationSteps(scenario, { histories, seed: 0x367f, permutations: 199 });
      let step = steps.next();
      while (!step.done) { await new Promise(resolve => setImmediate(resolve)); step = steps.next(); }
      results.push({ ...step.value, seconds: (Date.now() - started) / 1000 });
      writeFileSync(out!, JSON.stringify(results, null, 2));
    }
  }, 7_200_000);
});
