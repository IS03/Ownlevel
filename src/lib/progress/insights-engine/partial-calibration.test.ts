import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { PARTIAL_SCENARIOS, partialCalibrationSteps, runPartialCalibration, type PartialCalibrationResult, type PartialScenario } from "./partial-calibration";

/** Small and reproducible for CI. `INSIGHTS_PARTIAL_CALIBRATION_OUT=<file> INSIGHTS_PARTIAL_CALIBRATION_HISTORIES=<n>` runs the measured campaign. */
describe("calibración del método parcial", () => {
  const small = { histories: 4, seed: 11, permutations: 49, looks: 2 };
  it("is reproducible with the same seed", () => {
    const a = runPartialCalibration("partial_changes_15", small);
    expect(runPartialCalibration("partial_changes_15", small)).toEqual(a);
    expect(a.meanPairsAtLastLook).toBeGreaterThan(150);
    expect(a.assumptions).toMatchObject({ changeRate: 0.15, variantReps: 2 });
    expect(a.plantedStrictGate).toBeNull();
  });
  it("without hidden changes reads every comparison the same as the plain training", () => {
    const a = runPartialCalibration("partial_no_changes", small);
    expect(a).toMatchObject({ readingsAcrossHiddenChange: 0, readingsChanged: 0, readingsFlipped: 0 });
  });
  it("contaminates more readings the more unrecorded changes it assumes", () => {
    const low = runPartialCalibration("partial_changes_5", small), high = runPartialCalibration("partial_changes_30", small);
    expect(low.readingsAcrossHiddenChange).toBeGreaterThan(0);
    expect(high.readingsAcrossHiddenChange).toBeGreaterThan(low.readingsAcrossHiddenChange);
    expect(high.readingsChanged).toBeGreaterThan(low.readingsChanged);
  });
  it("reports a hidden change linked to the exposure as what it is: the method cannot tell it from an effect", () => {
    const linked = runPartialCalibration("partial_linked_to_exposure", { ...small, histories: 6, permutations: 99 });
    expect(linked.plantedExploratory!).toBeGreaterThan(0.5);
  });
  const only = process.env.INSIGHTS_PARTIAL_CALIBRATION_SCENARIOS?.split(",");
  const out = process.env.INSIGHTS_PARTIAL_CALIBRATION_OUT, histories = Number(process.env.INSIGHTS_PARTIAL_CALIBRATION_HISTORIES ?? 0);
  it.runIf(!!out && histories > 0)("measured campaign", async () => {
    const results: (PartialCalibrationResult & { seconds: number })[] = [];
    for (const scenario of (Object.keys(PARTIAL_SCENARIOS) as PartialScenario[]).filter(name => !only || only.includes(name))) {
      const started = Date.now();
      const steps = partialCalibrationSteps(scenario, { histories, seed: 0x367b, permutations: 199 });
      let step = steps.next();
      while (!step.done) { await new Promise(resolve => setImmediate(resolve)); step = steps.next(); }
      results.push({ ...step.value, seconds: (Date.now() - started) / 1000 });
      writeFileSync(out!, JSON.stringify(results, null, 2));
    }
  }, 3_600_000);
});
