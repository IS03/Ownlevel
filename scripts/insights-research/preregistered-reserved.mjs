import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

// Offline #367 reserved calibration runner. No size, seed, scenario or output overrides: the protocol is frozen in code.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const USAGE = `Usage:
  node scripts/insights-research/preregistered-reserved.mjs plan
  node scripts/insights-research/preregistered-reserved.mjs verify <absoluteAuthorizationPath>
  node scripts/insights-research/preregistered-reserved.mjs run <absoluteAuthorizationPath> [--resume]
  node scripts/insights-research/preregistered-reserved.mjs finalize
  node scripts/insights-research/preregistered-reserved.mjs rehearsal <absoluteTempDir>`;
const usage = () => { console.error(USAGE); process.exit(1); };
const [command, ...rest] = process.argv.slice(2);
const resume = rest.includes("--resume");
const positional = rest.filter(a => a !== "--resume");
const needsAbsolute = ["verify", "run", "rehearsal"].includes(command);
if (!["plan", "verify", "run", "finalize", "rehearsal"].includes(command)) usage();
if (needsAbsolute ? positional.length !== 1 || !isAbsolute(positional[0]) : positional.length !== 0) usage();
if (resume && command !== "run") usage();

const tmp = mkdtempSync(join(tmpdir(), "ownlevel-367-reserved-"));
try {
  const outfile = join(tmp, "runner.mjs");
  await build({ absWorkingDir: root, entryPoints: ["src/lib/progress/insights-research/preregistered-question/reserved-runner.ts"],
    bundle: true, platform: "node", format: "esm", target: "node22", outfile, logLevel: "silent" });
  const runner = await import(pathToFileURL(outfile).href);
  const proto = runner, auth = runner;
  const env = runner.liveEnvironment(root);
  const outputDir = proto.RESERVED_PROTOCOL.outputDir && resolve(root, proto.RESERVED_PROTOCOL.outputDir);

  if (command === "plan") {
    const p = proto.RESERVED_PROTOCOL, summary = runner.planSummary(p);
    console.log(`protocol ${summary.version}\nprotocolHash ${summary.protocolHash}\nsourceHash ${env.sourceHash}\ncommit ${env.commit}\ntreeClean ${env.treeClean}`);
    console.log(`namespace ${p.namespace}\noutputDir ${p.outputDir}\n`);
    console.log("scenario                    group                 n      chunks  criterion");
    for (const s of summary.scenarios) console.log(`${s.id.padEnd(27)} ${s.group.padEnd(21)} ${String(s.n).padStart(5)}  ${String(s.chunks).padStart(6)}  ${s.criterion ?? "-"}`);
    console.log(`\ntotal histories ${summary.totalHistories}, chunks ${summary.totalChunks}`);
    console.log(`budgets ${JSON.stringify(summary.budgets)}\ndecision rule: ${p.decisionRule}\n`);
    console.log("authorization template (to be signed by Direccion; nothing is written):");
    console.log(JSON.stringify(auth.buildAuthorization(p, env, "<name>", "<ISO-8601 timestamp>"), null, 2));
  } else if (command === "verify" || command === "run") {
    const authorization = JSON.parse(readFileSync(positional[0], "utf8"));
    if (command === "verify") {
      try { runner.verifyAuthorization(authorization, env); console.log("OK: authorization matches the reserved protocol, live source and commit"); }
      catch (error) { console.log(error.message); process.exit(2); }
    } else {
      const campaign = runner.runReserved({ authorization, environment: env, dir: outputDir, resume });
      console.log(`state ${campaign.state}, chunks ${campaign.chunksCompleted}/${campaign.plannedChunks}, cpu ${(campaign.cumulativeCpuMicros / 1e6).toFixed(1)} s, peak rss ${(campaign.peakRssBytes / 1048576).toFixed(0)} MiB`);
      if (campaign.state !== "complete") process.exit(3);
    }
  } else if (command === "finalize") {
    const out = runner.finalizeCampaign({ protocol: proto.RESERVED_PROTOCOL, dir: outputDir });
    console.log(`decision ${out.decision}${out.written ? " (result.json written)" : " (nothing written)"}`);
    for (const r of out.reasons) console.log(` - ${r}`);
  } else {
    const dir = positional[0];
    mkdirSync(dir, { recursive: true });
    const p = proto.REHEARSAL_PROTOCOL;
    const campaign = runner.runRehearsal({ dir, environment: env });
    const out = runner.finalizeCampaign({ protocol: p, dir });
    const histories = p.scenarios.reduce((t, s) => t + s.n, 0);
    console.log(`rehearsal ${out.decision}, histories ${histories}, chunks ${campaign.chunksCompleted}/${campaign.plannedChunks}, cpu ${(campaign.cumulativeCpuMicros / 1e6).toFixed(1)} s, peak rss ${(campaign.peakRssBytes / 1048576).toFixed(0)} MiB`);
    for (const r of out.reasons) console.log(` - ${r}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
