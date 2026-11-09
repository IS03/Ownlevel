import { mkdtempSync, rmSync, readdirSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCheckpointed, inspectCompleted } from "../../../../../scripts/insights-research/checkpoint-runner";
import { reservedReport } from "./reserved-report";
import { exact95 } from "./binomial-interval";
import type { HistoryResult } from "./reserved-history";

const limits = { maxCpuSeconds: 20, maxWallSeconds: 20, maxInvocationSeconds: 5, maxRssMiB: 512, maxDiskMiB: 2 };
describe("local research checkpoints, never the reserved generator", () => {
  it("resumes atomic cuts without duplicate completed histories, preserves interrupted work and rejects a changed candidate", () => {
    const directory = mkdtempSync(join(tmpdir(), "ownlevel-inference-test-"));
    const base = { directory, protocolHash: "development-only", candidate: "test-candidate", jobs: [{ id: "test0" }, { id: "test1" }], limits };
    try {
      expect(() => runCheckpointed<number, number>({ ...base, execute: (job, _checkpoint, save) => {
        if (job.id === "test1") { save(7); throw new Error("intentional interruption"); } return 10;
      } })).toThrow("intentional interruption");
      expect(inspectCompleted(directory)).toEqual([{ id: "test0", value: 10 }]);
      const called: string[] = [];
      const resumed = runCheckpointed<number, number>({ ...base, execute: (job, checkpoint) => { called.push(job.id); expect(checkpoint).toBe(7); return 20; } });
      expect(called).toEqual(["test1"]); expect(resumed.complete).toBe(true); expect(resumed.results.map(row => row.value)).toEqual([10, 20]);
      expect(() => runCheckpointed({ ...base, candidate: "another", execute: () => 0 })).toThrow("different protocol/candidate/job list");
      const file = readdirSync(directory).find(name => name.startsWith("job-"))!; appendFileSync(join(directory, file), "corrupt");
      expect(() => inspectCompleted(directory)).toThrow();
    } finally { rmSync(directory, { recursive: true }); }
  });
  it("rejects duplicate plans and numerical/resource limits before executing jobs", () => {
    const directory = mkdtempSync(join(tmpdir(), "ownlevel-inference-test-")); let called = false;
    try {
      const base = { directory, protocolHash: "development", candidate: "test", limits, execute: () => { called = true; return 1; } };
      expect(() => runCheckpointed({ ...base, jobs: [{ id: "a" }, { id: "a" }] })).toThrow("Duplicate planned history");
      expect(() => runCheckpointed({ ...base, jobs: [{ id: "a" }], limits: { ...limits, maxRssMiB: 0 } })).toThrow("RSS budget");
      expect(called).toBe(false);
    } finally { rmSync(directory, { recursive: true }); }
  });
  it("never approves a selected successful subset and never drops technical failures from denominators", () => {
    const result: HistoryResult = { any24: true, any36: true, abstainAll: false, technicalFailure: null, auditHash: "test", cuts: [], exclusions: {} };
    const partial = reservedReport([{ id: "B1_plus15:0", value: result }, { id: "A1_iid:0", value: { ...result, any24: false, any36: false, technicalFailure: "test-failure" } }]);
    expect(partial.complete).toBe(false); expect(partial.approved).toBe(false);
    const nullScenario = partial.scenarios.find(row => row.id === "A1_iid")!;
    expect(nullScenario.technicalFailures).toBe(1); expect(nullScenario.horizons[0].conservativeK).toBe(1); expect(nullScenario.missing).toBe(3999);
    expect(() => reservedReport([{ id: "A1_iid:0", value: result }, { id: "A1_iid:0", value: result }])).toThrow("Duplicate");
  });
  it("matches sample-size acceptance counts calculated independently with Python lgamma/binomial tails", () => {
    expect(exact95(27, 4000).upper).toBeLessThanOrEqual(0.01); expect(exact95(28, 4000).upper).toBeGreaterThan(0.01);
    expect(exact95(825, 1000).lower).toBeGreaterThanOrEqual(0.80); expect(exact95(824, 1000).lower).toBeLessThan(0.80);
  });
});
