import { execFileSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateQuestion } from "./contrast";
import { generateHistory, hash32 } from "./generator";
import { authorize, buildAuthorization, type Environment } from "./reserved-authorization";
import {
  NULL_UPPER_MAX, POWER_LOWER_MIN, REHEARSAL_PROTOCOL, RESERVED_PROTOCOL, SOURCE_FILES, canonicalJson, planJobs, protocolHash, sha256Hex, sourceHash, validateProtocol,
  type Job, type Protocol,
} from "./reserved-protocol";
import type { Scenario } from "./scenarios";

/**
 * Offline research prototype (#367). Protected, resumable calibration runner. Pure Node (fs/crypto), no network.
 *
 * Tampering note: deleting the campaign directory to restart (and so reset the CPU budget or re-roll the single run)
 * cannot be prevented by code. The reserved outputDir is fixed and inside the repository, so a deletion or a restart
 * shows up in git. Budget accounting is conservative but not perfect: the CPU of an invocation that dies between two
 * chunk checkpoints is unknowable and is not counted; it is bounded by one chunk (250 histories), and the invocation is
 * recorded as `killed` through the `running` marker persisted at its start.
 */

/** Test-only: simulates a hard kill. It bypasses failure persistence and lock release. */
export class SimulatedKill extends Error { constructor() { super("simulated kill"); this.name = "SimulatedKill"; Object.setPrototypeOf(this, SimulatedKill.prototype); } }

export type State = "running" | "complete" | "failed" | "budget_exceeded";
export interface Invocation { startedAt: string; pid: number; cpuMicros: number; chunksCompleted: number; endedAs: "running" | "completed" | "failed" | "budget_exceeded" | "killed" }
export interface Campaign {
  protocolVersion: string; protocolHash: string; sourceHash: string; commit: string; namespace: string;
  state: State; cumulativeCpuMicros: number; peakRssBytes: number; invocations: Invocation[]; chunksCompleted: number; plannedChunks: number;
}
export interface HistoryRecord { index: number; closure: string; alertLook: number | null; looks: number; finalP: number | null; finalEffect: number | null }
export interface ChunkFile { protocolHash: string; scenario: string; chunk: number; from: number; to: number; records: HistoryRecord[]; recordsSha256: string }

export interface Hooks {
  afterHistory?: (info: { scenario: string; index: number }) => void;
  afterChunk?: (info: { scenario: string; chunk: number }) => void;
}
export interface RunOptions {
  protocol: Protocol; authorization: unknown; environment: Environment; dir: string; resume: boolean; hooks?: Hooks;
  /** Injectable clocks (tests). Defaults: process.cpuUsage() user+system in microseconds, process RSS, process.pid. */
  cpuMicros?: () => number; rssBytes?: () => number; pid?: number;
}

const MIB = 1048576;
const defaultCpu = () => { const c = process.cpuUsage(); return c.user + c.system; };
const campaignPath = (dir: string) => join(dir, "campaign.json");
const chunkPath = (dir: string, job: Job) => join(dir, "chunks", `${job.scenario}-${job.chunk}.json`);

function writeAtomic(file: string, text: string, exclusive: boolean): void {
  const temp = `${file}.${process.pid}.tmp`;
  const fd = openSync(temp, "w");
  try { writeFileSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
  if (exclusive) { try { linkSync(temp, file); } finally { unlinkSync(temp); } } // EEXIST: an existing file is never replaced
  else renameSync(temp, file);
}
const saveCampaign = (dir: string, c: Campaign) => writeAtomic(campaignPath(dir), JSON.stringify(c, null, 2) + "\n", false);
const readCampaign = (dir: string): Campaign | null => (existsSync(campaignPath(dir)) ? (JSON.parse(readFileSync(campaignPath(dir), "utf8")) as Campaign) : null);

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
}
/** Exclusive lock. A live holder always refuses; a dead holder is only removable with `resume`. */
function acquireLock(dir: string, resume: boolean, pid: number): () => void {
  const file = join(dir, "runner.lock");
  const create = () => writeFileSync(file, JSON.stringify({ pid }), { flag: "wx" });
  try { create(); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let holder = NaN;
    try { holder = Number(JSON.parse(readFileSync(file, "utf8")).pid); } catch { /* unreadable: treated as live */ }
    if (!Number.isInteger(holder) || isAlive(holder)) throw new Error(`Campaign locked by PID ${holder}; no second runner allowed`);
    if (!resume) throw new Error("Stale runner.lock: only --resume may remove it");
    unlinkSync(file);
    create();
  }
  return () => { try { unlinkSync(file); } catch { /* already gone */ } };
}

export function wilson(successes: number, n: number): { lower: number; upper: number } {
  if (n === 0) return { lower: 0, upper: 1 };
  const z = 1.959963984540054, p = successes / n, z2 = z * z, denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom, half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lower: Math.max(0, center - half), upper: Math.min(1, center + half) };
}

function buildChunk(hash: string, job: Job, records: HistoryRecord[]): ChunkFile {
  return { protocolHash: hash, scenario: job.scenario, chunk: job.chunk, from: job.from, to: job.to, records, recordsSha256: sha256Hex(canonicalJson(records)) };
}
/** Reads and verifies a chunk file; throws with the reason on any inconsistency. */
function readChunk(dir: string, job: Job, hash: string): ChunkFile {
  const file = chunkPath(dir, job);
  if (!existsSync(file)) throw new Error(`missing chunk ${job.scenario}-${job.chunk}`);
  let c: ChunkFile;
  try { c = JSON.parse(readFileSync(file, "utf8")) as ChunkFile; } catch { throw new Error(`unreadable chunk ${job.scenario}-${job.chunk}`); }
  const bad = (why: string): never => { throw new Error(`corrupt chunk ${job.scenario}-${job.chunk}: ${why}`); };
  if (c.protocolHash !== hash) bad("protocolHash");
  if (c.scenario !== job.scenario || c.chunk !== job.chunk || c.from !== job.from || c.to !== job.to) bad("identity or range");
  if (!Array.isArray(c.records) || c.records.length !== job.to - job.from) bad("record count");
  if (c.records.some((r, i) => r.index !== job.from + i)) bad("index range");
  if (c.recordsSha256 !== sha256Hex(canonicalJson(c.records))) bad("records sha256");
  return c;
}

function evaluateHistory(protocol: Protocol, permit: ReturnType<typeof authorize>, scenario: string, index: number): HistoryRecord {
  const history = generateHistory(scenario as Scenario, index, protocol.namespace, permit);
  const seed = hash32(`${protocol.namespace}:${scenario}:${index}:${protocol.method.design}:${protocol.method.variant}`);
  const e = evaluateQuestion(history.sessions, {
    design: protocol.method.design as 120, variant: protocol.method.variant as "era_shift", seed,
    alphas: protocol.method.alphas, horizonDays: protocol.method.horizonDays, permutations: protocol.method.permutations,
  });
  const last = e.looks[e.looks.length - 1];
  return { index, closure: e.closure, alertLook: e.alertLook, looks: e.looks.length, finalP: last?.p ?? null, finalEffect: last?.effect ?? null };
}

export function runCampaign(options: RunOptions): Campaign {
  const { protocol, authorization, environment, dir, resume, hooks } = options;
  // 1. Authorization is validated before anything is written and before any seed is derived.
  const permit = authorize(protocol, authorization, environment);
  const hash = protocolHash(protocol), jobs = planJobs(protocol);
  const exists = existsSync(campaignPath(dir));
  if (exists && !resume) throw new Error("Campaign already started; only --resume is allowed");
  if (!exists && resume) throw new Error("No campaign to resume");

  const cpu = options.cpuMicros ?? defaultCpu, rss = options.rssBytes ?? (() => process.memoryUsage().rss), pid = options.pid ?? process.pid;
  mkdirSync(join(dir, "chunks"), { recursive: true });
  const release = acquireLock(dir, resume, pid);
  let killed = false;
  try {
    let campaign = readCampaign(dir);
    if (campaign && !resume) throw new Error("Campaign already started; only --resume is allowed");
    if (!campaign && resume) throw new Error("No campaign to resume");
    if (campaign) {
      if (campaign.state !== "running") throw new Error(`Campaign is ${campaign.state}: terminal, it cannot be resumed or run again`);
      if (campaign.protocolHash !== hash || campaign.sourceHash !== environment.sourceHash || campaign.commit !== environment.commit || campaign.namespace !== protocol.namespace) {
        throw new Error("Campaign was started with a different protocol, source or commit; no silent change mid-run");
      }
      for (const name of readdirSync(join(dir, "chunks"))) if (name.endsWith(".tmp")) unlinkSync(join(dir, "chunks", name));
      for (const inv of campaign.invocations) if (inv.endedAs === "running") inv.endedAs = "killed"; // died without a final checkpoint
    } else {
      campaign = { protocolVersion: protocol.version, protocolHash: hash, sourceHash: environment.sourceHash, commit: environment.commit, namespace: protocol.namespace,
        state: "running", cumulativeCpuMicros: 0, peakRssBytes: 0, invocations: [], chunksCompleted: 0, plannedChunks: jobs.length };
    }
    const inv: Invocation = { startedAt: new Date().toISOString(), pid, cpuMicros: 0, chunksCompleted: 0, endedAs: "running" };
    campaign.invocations.push(inv);
    saveCampaign(dir, campaign); // persists the "running" marker before any history is generated

    const base = campaign.cumulativeCpuMicros, cpuStart = cpu();
    const used = () => base + (cpu() - cpuStart);
    const maxCpu = protocol.budgets.maxCpuSeconds * 1e6, maxRss = protocol.budgets.maxRssMiB * MIB;
    const checkpoint = (state: State, endedAs: Invocation["endedAs"]) => {
      campaign!.cumulativeCpuMicros = used();
      inv.cpuMicros = campaign!.cumulativeCpuMicros - base;
      campaign!.state = state; inv.endedAs = state === "running" ? "running" : endedAs;
      saveCampaign(dir, campaign!);
    };
    const failWith = (message: string, scenario: string | null, index: number | null) => {
      appendFileSync(join(dir, "errors.jsonl"), JSON.stringify({ scenario, index, message }) + "\n");
      checkpoint("failed", "failed");
    };

    let done = 0;
    for (const job of jobs) {
      if (existsSync(chunkPath(dir, job))) {
        try { readChunk(dir, job, hash); } catch (error) { failWith((error as Error).message, job.scenario, null); return campaign; }
        done++;
        continue; // never recomputed, never overwritten
      }
      if (used() > maxCpu) { checkpoint("budget_exceeded", "budget_exceeded"); return campaign; }
      const records: HistoryRecord[] = [];
      for (let index = job.from; index < job.to; index++) {
        try {
          records.push(evaluateHistory(protocol, permit, job.scenario, index));
          hooks?.afterHistory?.({ scenario: job.scenario, index });
        } catch (error) {
          if (error instanceof SimulatedKill) throw error;
          failWith((error as Error).message, job.scenario, index); return campaign; // no silent conversion to "no effect"
        }
        const sampled = rss();
        campaign.peakRssBytes = Math.max(campaign.peakRssBytes, sampled);
        if (sampled > maxRss) { failWith(`RSS ${(sampled / MIB).toFixed(0)} MiB exceeds the ${protocol.budgets.maxRssMiB} MiB budget`, job.scenario, index); return campaign; }
        if (used() > maxCpu) { checkpoint("budget_exceeded", "budget_exceeded"); return campaign; }
      }
      try { writeAtomic(chunkPath(dir, job), JSON.stringify(buildChunk(hash, job, records)) + "\n", true); } catch (error) {
        failWith(`cannot write chunk: ${(error as Error).message}`, job.scenario, null); return campaign;
      }
      done++; inv.chunksCompleted++; campaign.chunksCompleted = done;
      checkpoint("running", "running"); // persisted at EVERY chunk
      try { hooks?.afterChunk?.({ scenario: job.scenario, chunk: job.chunk }); } catch (error) {
        if (error instanceof SimulatedKill) throw error;
        failWith((error as Error).message, job.scenario, null); return campaign;
      }
    }
    campaign.chunksCompleted = done;
    checkpoint(done === jobs.length ? "complete" : "running", "completed");
    return campaign;
  } catch (error) {
    if (error instanceof SimulatedKill) killed = true; // a real kill releases nothing
    throw error;
  } finally {
    if (!killed) release();
  }
}

export interface ScenarioStats {
  n: number; supported: number; rate: number; wilsonLower95: number; wilsonUpper95: number;
  closure: Record<string, number>; alertLook1: number; alertLook2: number;
}
export type Decision = "approved" | "rejected" | "incomplete";
export interface Decided { decision: Decision; reasons: string[]; failing: string[] }

/** Pure decision. Incomplete (any scenario missing or with the wrong n) takes precedence and never approves. */
export function decide(protocol: Protocol, stats: Record<string, Pick<ScenarioStats, "n" | "wilsonLower95" | "wilsonUpper95"> | undefined>): Decided {
  const reasons: string[] = [], failing: string[] = [];
  for (const s of protocol.scenarios) {
    const st = stats[s.id];
    if (!st) reasons.push(`scenario ${s.id} has no results`);
    else if (st.n !== s.n) reasons.push(`scenario ${s.id} has ${st.n} results, expected ${s.n}`);
  }
  if (reasons.length) return { decision: "incomplete", reasons, failing };
  for (const s of protocol.scenarios) {
    const st = stats[s.id]!;
    if (s.group === "null" && !(st.wilsonUpper95 <= NULL_UPPER_MAX)) { failing.push(s.id); reasons.push(`${s.id}: wilson upper 95% ${st.wilsonUpper95.toFixed(4)} > ${NULL_UPPER_MAX}`); }
    if (s.group === "power" && !(st.wilsonLower95 >= POWER_LOWER_MIN)) { failing.push(s.id); reasons.push(`${s.id}: wilson lower 95% ${st.wilsonLower95.toFixed(4)} < ${POWER_LOWER_MIN}`); }
  }
  return failing.length ? { decision: "rejected", reasons, failing } : { decision: "approved", reasons: [], failing };
}

export interface Result extends Decided {
  protocolVersion: string; protocolHash: string; sourceHash: string; commit: string; namespace: string;
  scenarios: (ScenarioStats & { id: string; group: string; criterion: string | null })[];
  /** Timing, CPU and process data: the only part that may differ between an interrupted and an uninterrupted run. */
  run: { cumulativeCpuMicros: number; peakRssBytes: number; invocations: Invocation[] };
}
export interface Finalized { decision: Decision; reasons: string[]; result: Result | null; written: boolean }

/** Reads ONLY from disk. result.json is written once, when the campaign can no longer progress, and never overwritten. */
export function finalizeCampaign(options: { protocol: Protocol; dir: string }): Finalized {
  const { protocol, dir } = options;
  validateProtocol(protocol);
  const resultFile = join(dir, "result.json");
  if (existsSync(resultFile)) throw new Error("result.json already exists; it is never overwritten");
  const hash = protocolHash(protocol), reasons: string[] = [];
  const campaign = readCampaign(dir);
  if (!campaign) return { decision: "incomplete", reasons: ["no campaign.json"], result: null, written: false };
  if (campaign.protocolHash !== hash) reasons.push("campaign.json protocolHash differs from the protocol");
  if (campaign.state !== "complete") reasons.push(`campaign state is ${campaign.state}`);
  if (campaign.cumulativeCpuMicros > protocol.budgets.maxCpuSeconds * 1e6) reasons.push("CPU budget exceeded");
  if (campaign.peakRssBytes > protocol.budgets.maxRssMiB * MIB) reasons.push("RSS budget exceeded");
  const errors = join(dir, "errors.jsonl");
  if (existsSync(errors) && readFileSync(errors, "utf8").trim() !== "") reasons.push("errors.jsonl is not empty");

  const per = new Map<string, HistoryRecord[]>();
  for (const job of planJobs(protocol)) {
    try { const c = readChunk(dir, job, hash); per.set(job.scenario, [...(per.get(job.scenario) ?? []), ...c.records]); } catch (error) { reasons.push((error as Error).message); }
  }
  const stats: Record<string, ScenarioStats> = {};
  for (const s of protocol.scenarios) {
    const records = per.get(s.id);
    if (!records || records.length !== s.n) continue;
    const closure: Record<string, number> = { supported: 0, no_clear_difference: 0, selective_record: 0, insufficient_data: 0 };
    let l1 = 0, l2 = 0;
    for (const r of records) { closure[r.closure]++; if (r.alertLook === 1) l1++; if (r.alertLook === 2) l2++; }
    const w = wilson(closure.supported, records.length);
    stats[s.id] = { n: records.length, supported: closure.supported, rate: closure.supported / records.length, wilsonLower95: w.lower, wilsonUpper95: w.upper, closure, alertLook1: l1, alertLook2: l2 };
  }
  const decided = reasons.length ? ({ decision: "incomplete", reasons: [...reasons, ...decide(protocol, stats).reasons], failing: [] } as Decided) : decide(protocol, stats);
  const result: Result = {
    protocolVersion: campaign.protocolVersion, protocolHash: campaign.protocolHash, sourceHash: campaign.sourceHash, commit: campaign.commit, namespace: campaign.namespace,
    ...decided,
    scenarios: protocol.scenarios.filter(s => stats[s.id]).map(s => ({ id: s.id, group: s.group, criterion: s.criterion, ...stats[s.id] })),
    run: { cumulativeCpuMicros: campaign.cumulativeCpuMicros, peakRssBytes: campaign.peakRssBytes, invocations: campaign.invocations },
  };
  const final = campaign.state !== "running"; // a running campaign may still progress: nothing is frozen yet
  if (final) writeAtomic(resultFile, JSON.stringify(result, null, 2) + "\n", true);
  return { decision: decided.decision, reasons: decided.reasons, result, written: final };
}

export function planSummary(protocol: Protocol) {
  const size = protocol.budgets.chunkSize;
  return {
    kind: protocol.kind, version: protocol.version, protocolHash: protocolHash(protocol), namespace: protocol.namespace,
    scenarios: protocol.scenarios.map(s => ({ id: s.id, group: s.group, n: s.n, chunks: Math.ceil(s.n / size), criterion: s.criterion })),
    totalHistories: protocol.scenarios.reduce((t, s) => t + s.n, 0), totalChunks: planJobs(protocol).length, budgets: protocol.budgets, outputDir: protocol.outputDir ?? null,
  };
}

/** Live environment: HEAD, source hash, and whether `git status --porcelain` is empty for the source files. */
export function liveEnvironment(root: string): Environment {
  const git = (args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  return {
    commit: git(["rev-parse", "HEAD"]).trim(),
    sourceHash: sourceHash(root),
    treeClean: git(["status", "--porcelain", "--", ...SOURCE_FILES]).trim() === "",
  };
}

// ---- CLI helpers (the bundle that runs them is the only one that holds the permit registry) ----
export { buildAuthorization, REHEARSAL_PROTOCOL, RESERVED_PROTOCOL };
/** Authorization checks against the reserved protocol. Generates nothing, writes nothing. */
export function verifyAuthorization(authorization: unknown, environment: Environment): void { authorize(RESERVED_PROTOCOL, authorization, environment); }
export function runReserved(o: { authorization: unknown; environment: Environment; dir: string; resume: boolean }): Campaign {
  return runCampaign({ protocol: RESERVED_PROTOCOL, ...o });
}
/** Builds its own rehearsal authorization from the live environment (a dirty tree is allowed for a rehearsal). */
export function runRehearsal(o: { dir: string; environment: Environment }): Campaign {
  const { environment } = o;
  const authorization = buildAuthorization(REHEARSAL_PROTOCOL, environment, "rehearsal", new Date().toISOString());
  return runCampaign({ protocol: REHEARSAL_PROTOCOL, authorization, environment, dir: o.dir, resume: false });
}
