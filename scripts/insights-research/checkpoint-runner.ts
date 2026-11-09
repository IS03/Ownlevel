import { openSync, closeSync, fsyncSync, writeFileSync, readFileSync, renameSync, existsSync, mkdirSync, unlinkSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { hostname } from "node:os";
import { performance } from "node:perf_hooks";
import { digest } from "../../src/lib/progress/insights-research/protein-energy/prospective";

type Job = { id: string };
type Limits = { maxCpuSeconds: number; maxWallSeconds: number; maxInvocationSeconds: number; maxRssMiB: number; maxDiskMiB: number };
function atomic(path: string, value: unknown) {
  const payload = JSON.stringify(value), text = JSON.stringify({ sha256: digest(payload), payload });
  const temp = `${path}.${process.pid}.tmp`, fd = openSync(temp, "wx");
  try { writeFileSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp, path);
}
function read<T>(path: string): T {
  const wrapped = JSON.parse(readFileSync(path, "utf8"));
  if (typeof wrapped.payload !== "string" || digest(wrapped.payload) !== wrapped.sha256) throw new Error("Checkpoint checksum mismatch");
  return JSON.parse(wrapped.payload) as T;
}
export function runCheckpointed<C, R>(input: { directory: string; protocolHash: string; candidate: string; jobs: readonly Job[]; limits: Limits;
  execute: (job: Job, checkpoint: C | null, save: (value: C) => void, guard: () => void) => R }): { complete: boolean; completed: number; results: { id: string; value: R }[] } {
  if (Object.values(input.limits).some(value => !Number.isFinite(value) || value < 0) || input.limits.maxInvocationSeconds <= 0) throw new Error("Invalid resource limits");
  if (new Set(input.jobs.map(job => job.id)).size !== input.jobs.length) throw new Error("Duplicate planned history");
  mkdirSync(input.directory, { recursive: true });
  const lock = join(input.directory, "runner.lock"), manifestPath = join(input.directory, "manifest.json");
  if (existsSync(lock)) {
    const owner = JSON.parse(readFileSync(lock, "utf8"));
    if (owner.host !== hostname() || owner.protocolHash !== input.protocolHash) throw new Error("Foreign checkpoint lock");
    let alive = true; try { process.kill(owner.pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false; }
    if (alive) throw new Error("Runner already active");
    unlinkSync(lock); // Only our stale, same-host/protocol lock. Its time lease remains fully charged.
  }
  const fd = openSync(lock, "wx"); writeFileSync(fd, JSON.stringify({ pid: process.pid, host: hostname(), protocolHash: input.protocolHash })); closeSync(fd);
  const start = performance.now(), usageStart = process.cpuUsage(), planHash = digest(input.jobs);
  type Manifest = { protocolHash: string; candidate: string; planHash: string; cpuCharged: number; wallCharged: number };
  let manifest: Manifest | null = null, leaseCharged = false;
  try {
    manifest = existsSync(manifestPath) ? read<Manifest>(manifestPath) : { protocolHash: input.protocolHash, candidate: input.candidate, planHash, cpuCharged: 0, wallCharged: 0 };
    if (manifest.protocolHash !== input.protocolHash || manifest.candidate !== input.candidate || manifest.planHash !== planHash) throw new Error("Cannot resume a different protocol/candidate/job list");
    const lease = input.limits.maxInvocationSeconds;
    if (manifest.cpuCharged + lease > input.limits.maxCpuSeconds || manifest.wallCharged + lease > input.limits.maxWallSeconds) throw new Error("Cumulative budget exhausted; incomplete cannot approve");
    manifest.cpuCharged += lease; manifest.wallCharged += lease; atomic(manifestPath, manifest); leaseCharged = true;
    const guard = () => {
      const cpu = process.cpuUsage(usageStart);
      if ((cpu.user + cpu.system) / 1e6 >= lease || (performance.now() - start) / 1000 >= lease) throw new Error("Invocation lease exhausted; resume same candidate");
      if (process.resourceUsage().maxRSS / 1024 > input.limits.maxRssMiB) throw new Error("RSS budget exceeded");
    };
    let bytes = readdirSync(input.directory).reduce((sum, name) => sum + statSync(join(input.directory, name)).size, 0);
    const saveFile = (path: string, value: unknown) => {
      const before = existsSync(path) ? statSync(path).size : 0;
      const estimated = JSON.stringify(value).length * 2 + 256;
      if (bytes + estimated > input.limits.maxDiskMiB * 1024 ** 2) throw new Error("Checkpoint disk budget exceeded");
      atomic(path, value); bytes += statSync(path).size - before;
    };
    const results: { id: string; value: R }[] = [];
    for (const job of input.jobs) {
      guard();
      const path = join(input.directory, `job-${digest(job.id)}.json`);
      type Record = { id: string; checkpoint: C | null; done: boolean; value?: R };
      const record: Record = existsSync(path) ? read<Record>(path) : { id: job.id, checkpoint: null, done: false };
      if (record.id !== job.id) throw new Error("Checkpoint job identity mismatch");
      if (record.done) { results.push({ id: job.id, value: record.value! }); continue; }
      const save = (checkpoint: C) => { guard(); saveFile(path, { id: job.id, checkpoint, done: false }); };
      const value = input.execute(job, record.checkpoint, save, guard);
      guard();
      saveFile(path, { id: job.id, checkpoint: null, done: true, value }); results.push({ id: job.id, value });
    }
    return { complete: results.length === input.jobs.length, completed: results.length, results };
  } finally {
    if (manifest && leaseCharged) {
      const cpu = process.cpuUsage(usageStart);
      manifest.cpuCharged += (cpu.user + cpu.system) / 1e6 - input.limits.maxInvocationSeconds;
      manifest.wallCharged += (performance.now() - start) / 1000 - input.limits.maxInvocationSeconds;
      atomic(manifestPath, manifest);
    }
    unlinkSync(lock);
  }
}

export function inspectCompleted<R>(directory: string): { id: string; value: R }[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter(name => /^job-[a-f0-9]{64}\.json$/.test(name)).flatMap(name => {
    const record = read<{ id: string; done: boolean; value: R }>(join(directory, name));
    return record.done ? [{ id: record.id, value: record.value }] : [];
  });
}
