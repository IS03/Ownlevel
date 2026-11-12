import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

// Offline #367 calibration pilot (development seeds only). No size/seed/scenario overrides.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const smoke = args.includes("--smoke"), phase = args.includes("--phase3") ? "phase3" : args.includes("--phase2") ? "phase2" : "phase1";
const [reportPath, ...rest] = args.filter(a => a !== "--smoke" && a !== "--phase2" && a !== "--phase3");
if (!reportPath || !isAbsolute(reportPath) || rest.length) {
  console.error("Usage: node scripts/insights-research/preregistered-pilot.mjs <absoluteReportPath> [--smoke] [--phase2|--phase3]");
  process.exit(1);
}
const CPU_CAP_SECONDS = 900;
const cpuSeconds = () => { const c = process.cpuUsage(); return (c.user + c.system) / 1e6; };

const tmp = mkdtempSync(join(tmpdir(), "ownlevel-367-pilot-"));
let report;
const wallStart = performance.now();
let peakRss = 0, histories = 0;
try {
  const outfile = join(tmp, "pilot.mjs");
  await build({ absWorkingDir: root, entryPoints: ["src/lib/progress/insights-research/preregistered-question/pilot.ts"],
    bundle: true, platform: "node", format: "esm", target: "node22", outfile, logLevel: "silent" });
  const pilot = await import(pathToFileURL(outfile).href);
  const config = pilot.pilotConfig(smoke, phase);
  const configSha256 = createHash("sha256").update(JSON.stringify(config)).digest("hex");
  const result = pilot.runPilot({ smoke, phase, afterHistory: () => {
    histories++;
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    return cpuSeconds() <= CPU_CAP_SECONDS;
  } });
  const cpu = process.cpuUsage();
  report = {
    phase, mode: smoke ? "smoke" : "full", ...(result.aborted ? { aborted: result.aborted } : {}),
    run: { cpuSeconds: (cpu.user + cpu.system) / 1e6, cpuUserSeconds: cpu.user / 1e6, cpuSystemSeconds: cpu.system / 1e6,
      wallSeconds: (performance.now() - wallStart) / 1000, peakRssBytesSampled: peakRss, historiesProcessed: histories,
      node: process.version, gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), configSha256 },
    ...result,
  };
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(`report: ${reportPath}\ncpu ${report.run.cpuSeconds.toFixed(1)} s, wall ${report.run.wallSeconds.toFixed(1)} s, peak rss ${(peakRss / 1048576).toFixed(0)} MiB${report.aborted ? ", ABORTED " + report.aborted : ""}`);
