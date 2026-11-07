import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { test } from "node:test";
import { acquireRunLock, historySeed, loadHistory, saveHistory, summarize, tasksFor, wilson } from "./sequential-validation-core.mjs";

test("Wilson resolves the document's 3-versus-4 ambiguity at n=1000", () => {
  assert.ok(wilson(3, 1000).upper95 < 0.01); assert.ok(wilson(4, 1000).upper95 > 0.01);
  assert.ok(wilson(0, 1000).upper95 > 0); assert.throws(() => wilson(0, 0));
});
test("history streams do not collide and resume task identities do not depend on scheduling", () => {
  const p = { seed: 73, histories: 1000, scenarios: ["a", "b"] };
  const tasks = tasksFor(p, p.scenarios); assert.equal(new Set(tasks.map(t => t.seed)).size, 2000);
  assert.equal(tasks[1031].seed, historySeed(73, 1, 31, 1000)); assert.deepEqual(tasksFor(p, ["b"]), tasks.slice(1000));
});
test("exclusive checksummed checkpoints resume without duplicating completed histories; corruption and a second runner fail", () => {
  const dir = mkdtempSync(join(tmpdir(), "ownlevel-sequential-test-"));
  try {
    const release = acquireRunLock(dir, false); assert.throws(() => acquireRunLock(dir, true));
    const task = { scenario: "a", history: 0, seed: 77 }, value = { ...task, looks: [] };
    saveHistory(dir, task, value, "sealed"); assert.deepEqual(loadHistory(dir, task, "sealed"), value);
    const protocol = { seed: 73, histories: 2, scenarios: ["a"] }, pendingTask = tasksFor(protocol, ["a"])[1];
    writeFileSync(join(dir, "a-0001.json.pending"), "incomplete publication");
    assert.equal(loadHistory(dir, pendingTask, "sealed"), null);
    assert.throws(() => saveHistory(dir, task, value, "sealed")); assert.throws(() => loadHistory(dir, task, "changed"));
    release(); const resumed = acquireRunLock(dir, true); assert.deepEqual(loadHistory(dir, task, "sealed"), value); resumed();
    const f = join(dir, "a-0000.json"), bad = JSON.parse(readFileSync(f, "utf8")); bad.value.seed = 4; writeFileSync(f, JSON.stringify(bad));
    assert.throws(() => loadHistory(dir, task, "sealed"));
  } finally { assert.ok(isAbsolute(dir) && dir.startsWith(join(tmpdir(), "ownlevel-sequential-test-"))); rmSync(dir, { recursive: true, force: true }); }
});
test("one history counts once across outcomes/looks, and the 24/36-month horizons remain paired, not pooled", () => {
  const p = { scenarios: ["a"], nullScenarios: ["a"], histories: 1, horizons: [24, 36], target: 0.01 };
  const look = { kind: "energy", slot: 8, passes: ["one"], permutations: 5, rows: 40, sessions: 50, excludedCandidates: {}, dayExclusions: {}, candidates: [] };
  const cells = summarize(p, [{ scenario: "a", looks: [look, { ...look, kind: "fatigue" }, { ...look, slot: 12 }] }]);
  assert.equal(cells.length, 2); assert.deepEqual(cells.map(c => c.anyPass.count), [1, 1]); assert.deepEqual(cells.map(c => c.anyPass.total), [1, 1]);
  assert.equal(cells[0].permutations, 10); assert.equal(cells[1].permutations, 15);
  assert.equal(cells[0].targetAny, null); assert.equal(cells[0].bySlot["energy:1"].denominatorHistories, 1);
});
