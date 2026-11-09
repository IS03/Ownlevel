import { expect, it } from "vitest";
import { executeReservedHistory, type HistoryCheckpoint } from "./reserved-history";

// These namespaces are DEVELOPMENT ONLY. Neither test invokes the registered reserve namespace or tests acceptance rates.
it("integrates fits, pre-response receipts and reveals, resuming at the last committed cut", () => {
  const job = { id: "development-pipeline-only", scenario: "A1_iid" as const, index: 0 };
  let checkpoint: HistoryCheckpoint | null = null;
  expect(() => executeReservedHistory(job, "development-pipeline-correctness-only", null, state => {
    checkpoint = structuredClone(state); if (state.nextMonth === 15) throw new Error("test interruption after cut 12");
  }, () => {})).toThrow("test interruption after cut 12");
  expect(checkpoint).not.toBeNull();
  const processed: number[] = [];
  const result = executeReservedHistory(job, "development-pipeline-correctness-only", checkpoint, state => {
    processed.push(state.nextMonth - 3); checkpoint = state;
  }, () => {});
  expect(processed[0]).toBe(15); expect(result.technicalFailure).toBeNull();
  expect(result.cuts).toHaveLength(12); expect(checkpoint!.ledger.budget.allocations).toBe(1);
  expect(checkpoint!.ledger.entries.length).toBeGreaterThan(100);
  expect(checkpoint!.ledger.entries.every(entry => entry.resolution !== null && Date.parse(entry.forecast.committedAt) < Date.parse(entry.resolution!.capturedAt!))).toBe(true);
});

it("invalidates a historical edit in the actual pipeline without another emission opportunity", () => {
  const result = executeReservedHistory({ id: "development-revision-only", scenario: "C6_revision", index: 0 }, "development-revision-correctness-only", null, () => {}, () => {});
  expect(result.technicalFailure).toBeNull(); expect(result.abstainAll).toBe(true); expect(result.any24).toBe(false); expect(result.any36).toBe(false);
});
