import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { familyExtensionSteps, runCalibration, runFamilyExtension, type CalibrationScenario } from "./calibration";
import { partialCalibrationSteps, type PartialScenario } from "./partial-calibration";

/**
 * #367 phase 2, preregistered in 367-alimentacion-horaria-metodo.md: the performance families with and without the three meal timing
 * candidates. `INSIGHTS_EXTENSION_OUT=<file> INSIGHTS_EXTENSION_HISTORIES=<n> [INSIGHTS_EXTENSION_PART=strict|partial] [INSIGHTS_EXTENSION_SCENARIOS=a,b]`.
 */
describe("#367 fase 2: ampliación de las familias de rendimiento", () => {
  it("judges the base family exactly as the calibration does, and is reproducible", () => {
    const config = { histories: 4, seed: 21, permutations: 49, looks: 3, candidates: 13 };
    const extension = runFamilyExtension("autocorrelated", config);
    const plain = runCalibration("autocorrelated", config);
    expect(extension.base.anyExploratory).toBe(plain.anyExploratory);
    expect(extension.base.anyStrictGate).toBe(plain.anyStrictGate);
    expect(runFamilyExtension("autocorrelated", config)).toEqual(extension);
    expect(extension).toMatchObject({ baseCandidates: 13, extendedCandidates: 16 });
    expect(extension.extended.meanTestable).toBeGreaterThan(extension.base.meanTestable);
  });

  const out = process.env.INSIGHTS_EXTENSION_OUT, histories = Number(process.env.INSIGHTS_EXTENSION_HISTORIES ?? 0);
  const part = process.env.INSIGHTS_EXTENSION_PART ?? "strict", only = process.env.INSIGHTS_EXTENSION_SCENARIOS?.split(",");
  it.runIf(!!out && histories > 0)("measured campaign", async () => {
    const results: unknown[] = [];
    const drain = async <T,>(steps: Generator<number, T, void>) => { let step = steps.next(); while (!step.done) { await new Promise(resolve => setImmediate(resolve)); step = steps.next(); } return step.value; };
    if (part === "strict") {
      for (const scenario of (["independent", "autocorrelated", "spurious_trend", "routine_change", "selective_absence"] as CalibrationScenario[]).filter(name => !only || only.includes(name)))
        for (const candidates of [13, 23]) {
          const started = Date.now();
          results.push({ ...await drain(familyExtensionSteps(scenario, { histories, seed: 0x3672, permutations: 199, candidates })), seconds: (Date.now() - started) / 1000 });
          writeFileSync(out!, JSON.stringify(results, null, 2));
        }
    } else {
      // The partial lane draws its candidates in its main stream, so its two sizes are measured apart, not paired.
      for (const scenario of (["partial_no_changes", "partial_changes_15"] as PartialScenario[]).filter(name => !only || only.includes(name)))
        for (const candidates of [13, 16]) {
          const started = Date.now();
          results.push({ ...await drain(partialCalibrationSteps(scenario, { histories, seed: 0x3673, permutations: 199, candidates })), seconds: (Date.now() - started) / 1000 });
          writeFileSync(out!, JSON.stringify(results, null, 2));
        }
    }
    expect(results.length).toBeGreaterThan(0);
  }, 7_200_000);
});
