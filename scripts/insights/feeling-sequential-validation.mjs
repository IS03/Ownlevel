import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { setImmediate as yieldThread } from "node:timers/promises";
import { build, version as esbuildVersion } from "esbuild";
import { acquireRunLock, atomicJson, digest, loadHistory, saveHistory, summarize, taskKey, tasksFor } from "./sequential-validation-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../.."), args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("node scripts/insights/feeling-sequential-validation.mjs [--resume]\nOne sealed local campaign. No size, seed, budget or scenario overrides. No data services/authentication.");
  process.exit(0);
}
if (args.some(a => a !== "--resume")) throw new Error("Only --resume is supported; no validation overrides");
const protocolPath = "docs/progress/367-sensaciones-secuencial-protocolo.json";
const protocolText = readFileSync(join(root, protocolPath), "utf8").replaceAll("\r\n", "\n"), protocol = JSON.parse(protocolText), out = join(root, protocol.output);
const git = (...argv) => execFileSync("git", argv, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const resume = args.includes("--resume"), release = acquireRunLock(out, resume), workers = new Set();
let manifest, timer, stopping = false, currentInvocation;
const cpuStart = process.cpuUsage(), wallStart = performance.now();
function checkpointInvocation() {
  if (!manifest || !currentInvocation) return;
  const cpu = process.cpuUsage(cpuStart);
  Object.assign(currentInvocation, { wallMs: performance.now() - wallStart, cpuMicros: cpu.user + cpu.system,
    sampledRss: Math.max(currentInvocation.sampledRss ?? 0, process.memoryUsage().rss), lastCheckpoint: new Date().toISOString() });
  atomicJson(join(out, "campaign.json"), manifest);
}
try {
  const protectedFiles = [...protocol.sealedFiles, protocolPath];
  const previews = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
  if (previews.git?.deploymentEnabled?.[git("branch", "--show-current")] !== false) throw new Error("Branch previews must be explicitly disabled");
  if (git("status", "--porcelain", "--", ...protectedFiles)) throw new Error("Seal implementation and protocol in a clean Git commit before the reserved run");
  // Verifies that untracked paths were not accidentally omitted by the preceding status check.
  for (const file of protectedFiles) git("cat-file", "-e", `HEAD:${file}`);
  mkdirSync(out, { recursive: true });
  const engineFile = join(out, "engine.mjs");
  const bundle = await build({ absWorkingDir: root, entryPoints: ["src/lib/progress/insights-engine/feeling-sequential-simulation.ts"],
    bundle: true, platform: "node", format: "esm", target: "node22", outfile: engineFile, metafile: true, logLevel: "silent" });
  const dependencies = Object.keys(bundle.metafile.inputs).map(p => relative(root, resolve(root, p)).replaceAll("\\", "/"));
  if (git("status", "--porcelain", "--", ...dependencies)) throw new Error("Uncommitted engine dependency");
  const files = [...new Set([...protectedFiles, ...dependencies])].sort();
  const sourceHashes = Object.fromEntries(files.map(file => [file, digest(readFileSync(join(root, file), "utf8").replaceAll("\r\n", "\n"))]));
  const identity = digest({ protocolHash: digest(protocolText), sourceHashes, node: process.version, esbuildVersion, platform: process.platform, arch: process.arch });
  const manifestFile = join(out, "campaign.json");
  if (existsSync(manifestFile)) {
    if (!resume) throw new Error("Reserved campaign already exists. Use --resume for identical unfinished histories; never start a second campaign");
    manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
    if (manifest.identity !== identity) throw new Error("Protocol, source, runtime or bundler changed; do not resume or rerun the reserved campaign");
    if (["completed", "stopped_null_criterion_not_met"].includes(manifest.status)) { console.log("Campaign already terminal: " + manifest.status); process.exitCode = manifest.status === "completed" ? 0 : 2; }
  } else {
    if (resume) throw new Error("No campaign to resume");
    manifest = { identity, protocolHash: digest(protocolText), protocolCommit: git("rev-parse", "HEAD"),
      startedAt: new Date().toISOString(), node: process.version, esbuildVersion, platform: process.platform,
      logicalCpus: availableParallelism(), workers: Math.min(protocol.workers, Math.max(1, availableParallelism() - 2)), sourceHashes,
      status: "running_nulls", invocations: [] };
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  }
  if (manifest.status !== "completed" && manifest.status !== "stopped_null_criterion_not_met") {
    if (manifest.invocations.reduce((v, p) => v + p.wallMs, 0) >= protocol.maxWallHours * 3_600_000) throw new Error("Cumulative resource limit exhausted; campaign incomplete");
    currentInvocation = { startedAt: new Date().toISOString(), wallMs: 0, cpuMicros: 0, sampledRss: 0 }; manifest.invocations.push(currentInvocation);
    const completedDir = join(out, "histories"); mkdirSync(completedDir, { recursive: true });
    const seen = new Set();
    const collect = task => { const v = loadHistory(completedDir, task, identity); if (v) seen.add(taskKey(task)); return v; };
    // Keep only one scenario's histories in memory, not the entire campaign. Each checkpoint is read once per summary.
    const summarizeCampaign = async () => {
      const cells = [];
      for (const scenario of protocol.scenarios) {
        const values = [];
        for (const task of tasksFor(protocol, [scenario])) {
          const value = loadHistory(completedDir, task, identity); if (value) values.push(value);
          if (task.history % 25 === 0) await yieldThread();
        }
        if (values.length) cells.push(...summarize({ ...protocol, scenarios: [scenario] }, values));
        await yieldThread();
      }
      return cells;
    };
    timer = setInterval(() => {
      checkpointInvocation(); console.log(JSON.stringify({ status: manifest.status, completed: seen.size, active: workers.size, wallMinutes: Math.round(currentInvocation.wallMs / 6000) / 10 }));
      if (manifest.invocations.reduce((v, p) => v + p.wallMs, 0) > protocol.maxWallHours * 3_600_000) { stopping = true; for (const w of workers) w.terminate(); }
    }, 10_000);
    const stage = async scenarios => {
      const pending = tasksFor(protocol, scenarios).filter(t => !collect(t));
      if (!pending.length) return;
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(manifest.workers, pending.length) }, () => new Promise((resolveStage, rejectStage) => {
        const worker = new Worker(new URL("./feeling-sequential-worker.mjs", import.meta.url), { workerData: { engineUrl: pathToFileURL(engineFile).href } });
        workers.add(worker);
        let ending = false;
        const next = async () => {
          await yieldThread();
          if (stopping) { rejectStage(new Error("Campaign resource limit reached; incomplete, not a pass")); return; }
          const task = pending[cursor++];
          if (!task) { ending = true; workers.delete(worker); await worker.terminate(); resolveStage(); }
          else worker.postMessage(task);
        };
        worker.on("message", message => {
          try {
            if (message.error) throw new Error(message.error);
            saveHistory(completedDir, message.task, message.value, identity); collect(message.task); next().catch(rejectStage);
          } catch (e) { rejectStage(e); }
        });
        worker.on("error", rejectStage);
        worker.on("exit", code => { workers.delete(worker); if (!ending) rejectStage(new Error(`Worker exited ${code}; incomplete histories may be resumed identically`)); });
        next().catch(rejectStage);
      })));
    };
    await stage(protocol.nullScenarios);
    const nullCells = (await summarizeCampaign()).filter(c => c.kind === "null");
    atomicJson(join(out, "null-stage.json"), nullCells);
    if (nullCells.some(c => !c.meetsProposedNullCriterion)) {
      manifest.status = "stopped_null_criterion_not_met";
      manifest.power = "not_run_by_preregistered_futility_rule";
    } else {
      manifest.status = "running_power"; checkpointInvocation();
      await stage(protocol.scenarios.filter(s => !protocol.nullScenarios.includes(s)));
      manifest.status = "completed";
    }
    const terminalStatus = manifest.status; manifest.status = "finalizing";
    const cells = await summarizeCampaign(); checkpointInvocation();
    const report = { protocolId: protocol.id, protocolHash: manifest.protocolHash, identity,
      protocolCommit: manifest.protocolCommit, status: terminalStatus, power: manifest.power ?? "measured",
      historiesCompleted: seen.size, cells, invocations: manifest.invocations,
      totalWallMs: manifest.invocations.reduce((v, p) => v + p.wallMs, 0), totalCpuMicros: manifest.invocations.reduce((v, p) => v + p.cpuMicros, 0),
      sampledPeakRss: Math.max(...manifest.invocations.map(p => p.sampledRss)),
      publicAssociations: "disabled", proposedTargetIsApprovedTolerance: false };
    atomicJson(join(out, "report.json"), report);
    manifest.status = terminalStatus; checkpointInvocation();
    console.log(JSON.stringify({ status: report.status, histories: report.historiesCompleted, report: relative(root, join(out, "report.json")) }));
    process.exitCode = manifest.status === "completed" ? 0 : 2;
  }
} catch (error) {
  stopping = true; for (const worker of workers) await worker.terminate();
  if (manifest && currentInvocation) { manifest.status = "interrupted"; manifest.error = String(error); checkpointInvocation(); }
  console.error(String(error)); process.exitCode = 1;
} finally { clearInterval(timer); release(); }
