import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { it } from "vitest";
import { initialEvidence, updateEvidence, INFERENCE } from "./inference";
import type { Receipt } from "./procedure";

it.skipIf(process.env.OWNLEVEL_INFERENCE_COST !== "1")("measures only added arithmetic on existing DEVELOPMENT audits, never reserved data", () => {
  const directory = process.env.OWNLEVEL_INFERENCE_DEVELOPMENT_AUDITS, output = process.env.OWNLEVEL_INFERENCE_COST_OUTPUT;
  if (!directory?.startsWith("/") || !output?.startsWith("/")) throw new Error("Absolute existing development-audit directory and output required");
  const start = performance.now(), records = [];
  for (const scenario of ["null", "effect", "confounded"]) for (const seed of [17011, 17029]) {
    const audit: Receipt[] = JSON.parse(readFileSync(join(directory, `development-report.json.${scenario}.${seed}.audit.json`), "utf8"));
    const losses = audit.flatMap(row => row.result.predictions.map(p => p.baselineLoss === null || p.extendedLoss === null ? null : p.baselineLoss - p.extendedLoss));
    const begin = performance.now();
    for (let r = 0; r < INFERENCE.costBudget.repetitions; r++) {
      let state = initialEvidence(); for (const loss of losses) state = updateEvidence(state, loss);
      if (!Number.isFinite(state.logE)) throw new Error("Nonfinite cost fixture");
    }
    records.push({ scenario, seed, observations: losses.length, repetitions: INFERENCE.costBudget.repetitions, seconds: (performance.now() - begin) / 1000 });
    if ((performance.now() - start) / 1000 > INFERENCE.costBudget.seconds || process.resourceUsage().maxRSS / 1024 > INFERENCE.costBudget.rssMiB) throw new Error("Added-cost budget exceeded");
  }
  writeFileSync(output, JSON.stringify({ kind: "development_arithmetic_cost_only_not_inferential_results", seconds: (performance.now() - start) / 1000,
    peakWorkerRssMiB: process.resourceUsage().maxRSS / 1024, records, limitation: "Old audit predictions lack prospective commitments; no significance or reserved-validation result is reported. Fits, checkpoint I/O and receipt creation are excluded." }, null, 2));
}, INFERENCE.costBudget.seconds * 1000);
