import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildAuthorization, type Environment } from "./reserved-authorization";
import { REHEARSAL_PROTOCOL, protocolHash, type Protocol } from "./reserved-protocol";
import { SimulatedKill, finalizeCampaign, runCampaign, type Campaign, type Hooks } from "./reserved-runner";

const env: Environment = { commit: "a".repeat(40), sourceHash: "b".repeat(64), treeClean: true };
const base = mkdtempSync(join(tmpdir(), "ownlevel-367-test-"));
afterAll(() => rmSync(base, { recursive: true, force: true }));
let counter = 0;
const fresh = () => join(base, `c${counter++}`);

/** Small rehearsal-kind protocol: one null + the power scenario, 40 histories each in chunks of 20 (4 chunks). */
function small(over: Partial<Protocol["budgets"]> = {}): Protocol {
  const p = structuredClone(REHEARSAL_PROTOCOL);
  p.scenarios = p.scenarios.filter(s => s.id === "N1_iid" || s.id === "P25");
  p.budgets = { ...p.budgets, ...over };
  return p;
}
const run = (p: Protocol, dir: string, resume = false, extra: { hooks?: Hooks; cpuMicros?: () => number; environment?: Environment } = {}) =>
  runCampaign({ protocol: p, authorization: buildAuthorization(p, extra.environment ?? env, "t", "now"), environment: extra.environment ?? env, dir, resume, hooks: extra.hooks, cpuMicros: extra.cpuMicros });
const killAfterHistories = (n: number): Hooks => { let c = 0; return { afterHistory: () => { if (++c === n) throw new SimulatedKill(); } }; };
const clearLock = (dir: string) => rmSync(join(dir, "runner.lock"), { force: true });
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const chunkFiles = (dir: string) => readdirSync(join(dir, "chunks")).sort();

let completeDir: string;
function complete(): string {
  if (!completeDir) { completeDir = fresh(); expect(run(small(), completeDir).state).toBe("complete"); }
  return completeDir;
}
const copyOfComplete = () => { const d = fresh(); cpSync(complete(), d, { recursive: true }); return d; };

describe("reserved runner", () => {
  it("1. no authorization: throws before generating anything or creating files", () => {
    const dir = fresh();
    let generated = 0;
    expect(() => runCampaign({ protocol: small(), authorization: undefined, environment: env, dir, resume: false, hooks: { afterHistory: () => { generated++; } } })).toThrow(/Authorization refused/);
    expect(generated).toBe(0);
    expect(existsSync(dir)).toBe(false);
    const wrong = { ...buildAuthorization(small(), env, "t", "now"), protocolHash: "0".repeat(64) };
    expect(() => runCampaign({ protocol: small(), authorization: wrong, environment: env, dir, resume: false })).toThrow(/protocolHash/);
    expect(existsSync(dir)).toBe(false);
  });

  it("4. kill (after a chunk and mid-chunk) then resume gives the same result and byte-identical chunks", () => {
    const A = complete(), B = fresh(), p = small();
    expect(() => run(p, B, false, { hooks: { afterChunk: () => { throw new SimulatedKill(); } } })).toThrow(SimulatedKill);
    expect(readJson(join(B, "campaign.json")).state).toBe("running");
    clearLock(B);
    expect(() => run(p, B, true, { hooks: killAfterHistories(30) })).toThrow(SimulatedKill); // chunk 1 is mid-way
    clearLock(B);
    const done = run(p, B, true);
    expect(done.state).toBe("complete");
    expect(done.invocations.map(i => i.endedAs)).toEqual(["killed", "killed", "completed"]);
    expect(chunkFiles(B)).toEqual(chunkFiles(A));
    for (const f of chunkFiles(A)) expect(readFileSync(join(B, "chunks", f), "utf8")).toBe(readFileSync(join(A, "chunks", f), "utf8"));
    const ra = finalizeCampaign({ protocol: p, dir: copyOf(A) }), rb = finalizeCampaign({ protocol: p, dir: B });
    const strip = (r: typeof ra.result) => { const copy = { ...r! } as Record<string, unknown>; delete copy.run; return copy; };
    expect(strip(rb.result)).toEqual(strip(ra.result));
    const indices = new Set<string>();
    for (const f of chunkFiles(B)) for (const r of readJson(join(B, "chunks", f)).records) { const key = `${f.split("-")[0]}:${r.index}`; expect(indices.has(key)).toBe(false); indices.add(key); }
    expect(indices.size).toBe(80);
  });

  it("5b. resume with a protocol whose hash differs is refused", () => {
    const dir = fresh(), p = small();
    expect(() => run(p, dir, false, { hooks: killAfterHistories(5) })).toThrow(SimulatedKill);
    clearLock(dir);
    const changed = small(); changed.scenarios[0].n = 60;
    expect(protocolHash(changed)).not.toBe(protocolHash(p));
    expect(() => run(changed, dir, true)).toThrow(/different protocol/);
    expect(() => run(p, dir, true, { environment: { ...env, commit: "e".repeat(40) } })).toThrow(/different protocol/);
    expect(() => run(p, dir, true, { environment: { ...env, sourceHash: "f".repeat(64) } })).toThrow(/different protocol/);
  });

  it("6. a partial result never approves (running, missing chunk, corrupted chunk)", () => {
    const p = small();
    const running = fresh();
    expect(() => run(p, running, false, { hooks: killAfterHistories(25) })).toThrow(SimulatedKill);
    const r = finalizeCampaign({ protocol: p, dir: running });
    expect(r.decision).toBe("incomplete");
    expect(r.written).toBe(false);
    expect(existsSync(join(running, "result.json"))).toBe(false);

    const missing = copyOfComplete();
    rmSync(join(missing, "chunks", chunkFiles(missing)[1]));
    const m = finalizeCampaign({ protocol: p, dir: missing });
    expect(m.decision).toBe("incomplete");
    expect(m.reasons.join(" ")).toMatch(/missing chunk/);

    const corrupt = copyOfComplete(), file = join(corrupt, "chunks", chunkFiles(corrupt)[0]), c = readJson(file);
    c.records[0].closure = c.records[0].closure === "supported" ? "no_clear_difference" : "supported";
    writeFileSync(file, JSON.stringify(c));
    const k = finalizeCampaign({ protocol: p, dir: corrupt });
    expect(k.decision).toBe("incomplete");
    expect(k.reasons.join(" ")).toMatch(/corrupt chunk/);

    const ok = copyOfComplete();
    expect(["approved", "rejected"]).toContain(finalizeCampaign({ protocol: p, dir: ok }).decision);
    expect(() => finalizeCampaign({ protocol: p, dir: ok })).toThrow(/already exists/); // never overwritten
  });

  it("8. concurrency and terminal states", () => {
    const p = small();
    const live = fresh();
    expect(() => run(p, live, false, { hooks: killAfterHistories(3) })).toThrow(SimulatedKill); // leaves the lock (own pid, alive)
    expect(() => run(p, live, true)).toThrow(/locked/);
    expect(existsSync(join(live, "runner.lock"))).toBe(true);
    // a stale lock (dead pid) needs resume
    writeFileSync(join(live, "runner.lock"), JSON.stringify({ pid: 2 ** 22 + 12345 }));
    expect(() => run(p, live, false)).toThrow(/already started/);
    const staleFresh = fresh(); mkdirSync(staleFresh); writeFileSync(join(staleFresh, "runner.lock"), JSON.stringify({ pid: 2 ** 22 + 12345 }));
    expect(() => run(p, staleFresh, false)).toThrow(/Stale/);
    expect(run(p, live, true).state).toBe("complete");

    expect(() => run(p, live, false)).toThrow(/already started/);
    expect(() => run(p, live, true)).toThrow(/terminal/);
    expect(() => run(p, fresh(), true)).toThrow(/No campaign/);

    const failed = fresh();
    expect(run(p, failed, false, { hooks: { afterHistory: () => { throw new Error("x"); } } }).state).toBe("failed");
    expect(() => run(p, failed, true)).toThrow(/terminal/);
    expect(existsSync(join(failed, "runner.lock"))).toBe(false); // released on normal exit
  });

  it("9. CPU budget is cumulative, terminal and not resettable by retrying", () => {
    let t = 0;
    const clock = () => (t += 1000);
    const tiny = small({ maxCpuSeconds: 0.05 }); // 50,000 us = ~50 clock calls
    const dir = fresh();
    const out = run(tiny, dir, false, { cpuMicros: clock });
    expect(out.state).toBe("budget_exceeded");
    expect(readJson(join(dir, "campaign.json")).state).toBe("budget_exceeded");
    expect(() => run(tiny, dir, true, { cpuMicros: clock })).toThrow(/terminal/);
    expect(finalizeCampaign({ protocol: tiny, dir }).decision).toBe("incomplete");

    // kill + resume accumulates both invocations
    const p = small({ maxCpuSeconds: 100 }), d2 = fresh();
    let t2 = 0; const clock2 = () => (t2 += 10);
    expect(() => run(p, d2, false, { cpuMicros: clock2, hooks: { afterChunk: () => { throw new SimulatedKill(); } } })).toThrow(SimulatedKill);
    const afterKill = readJson(join(d2, "campaign.json")).cumulativeCpuMicros;
    expect(afterKill).toBeGreaterThan(0);
    clearLock(d2);
    const done = run(p, d2, true, { cpuMicros: clock2 });
    expect(done.cumulativeCpuMicros).toBeGreaterThanOrEqual(afterKill);
    expect(done.cumulativeCpuMicros).toBeGreaterThanOrEqual(done.invocations.reduce((s, i) => s + i.cpuMicros, 0));
  });

  it("10. an error inside a history is persisted, ends the campaign as failed and finalizes as incomplete", () => {
    const dir = fresh(), p = small();
    let c = 0;
    const out: Campaign = run(p, dir, false, { hooks: { afterHistory: () => { if (++c === 5) throw new Error("boom"); } } });
    expect(out.state).toBe("failed");
    const line = JSON.parse(readFileSync(join(dir, "errors.jsonl"), "utf8").trim().split("\n")[0]);
    expect(line).toMatchObject({ scenario: "N1_iid", index: 4, message: "boom" });
    const f = finalizeCampaign({ protocol: p, dir });
    expect(f.decision).toBe("incomplete");
    expect(f.written).toBe(true); // terminal: the incomplete outcome is frozen
  });
});

function copyOf(dir: string): string { const d = fresh(); cpSync(dir, d, { recursive: true }); return d; }
