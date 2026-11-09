import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { expect, it } from "vitest";
import { DEVELOPMENT_ANCHOR, developmentHistory, type Scenario } from "./development-fixtures";
import { POLICY } from "./policy";
import { runPrototype, type Receipt } from "./procedure";

/** Opt-in, bounded DEVELOPMENT smoke measurement. Never a validation campaign or an estimate of false alerts/power. */
it.skipIf(process.env.OWNLEVEL_PROTEIN_ENERGY_DEVELOPMENT !== "1")("measures the frozen six development histories", () => {
  const output = process.env.OWNLEVEL_PROTEIN_ENERGY_REPORT;
  if (!output?.startsWith("/")) throw new Error("An absolute report path is required");
  const start = performance.now(), records: Record<string, unknown>[] = [], failures: string[] = [];
  const guard = () => {
    if ((performance.now() - start) / 1000 > POLICY.development.maxSeconds) throw new Error("Development wall budget exceeded");
    if (process.memoryUsage().rss / 1024 ** 2 > POLICY.development.maxRssMiB) throw new Error("Development RSS budget exceeded");
  };
  try {
    for (const scenario of POLICY.development.scenarios) for (const seed of POLICY.development.seeds) {
      guard(); const historyStart = performance.now(), snapshots = developmentHistory(seed, scenario as Scenario);
      let ledger: Receipt[] = [];
      const cuts = [];
      for (const month of POLICY.months) {
        guard(); const cutStart = performance.now();
        const run = runPrototype({ anchor: DEVELOPMENT_ANCHOR, throughMonth: month, snapshots: snapshots.slice(0, month / 3 + 1), previous: ledger });
        ledger = run.ledger;
        const result = run.deliveries.at(-1)!.receipt.result, memory = process.memoryUsage();
        cuts.push({ month, seconds: (performance.now() - cutStart) / 1000, rssMiBAtEnd: memory.rss / 1024 ** 2, heapMiBAtEnd: memory.heapUsed / 1024 ** 2,
          cumulativeProcessPeakRssMiB: process.resourceUsage().maxRSS / 1024, state: result.state, reasons: result.reasons, scored: result.scored,
          coverage: result.coverage, loss: result.loss, train: result.trainingIds.length, supportExclusions: result.supportExclusions,
          fits: result.fits, targetCounts: result.evaluation?.targetCounts });
        guard();
      }
      records.push({ seed, scenario, seconds: (performance.now() - historyStart) / 1000, cuts });
      // The complete synthetic audit is retained separately; the compact report remains readable.
      writeFileSync(`${output}.${scenario}.${seed}.audit.json`, JSON.stringify(ledger));
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    writeFileSync(output, JSON.stringify({ kind: "development_only_not_risk_or_power_validation", policy: POLICY, node: process.version,
      platform: process.platform, architecture: process.arch, seconds: (performance.now() - start) / 1000, failures, records }, null, 2) + "\n");
  }
  expect(records).toHaveLength(6);
}, POLICY.development.maxSeconds * 1000);
