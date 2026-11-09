import { spawnSync } from "node:child_process";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
const [mode, ...args] = process.argv.slice(2);
if (!["plan", "status", "execute"].includes(mode) || args.length !== (mode === "plan" ? 1 : mode === "status" ? 2 : 3) || args.some(path => !isAbsolute(path)))
  throw new Error("Usage: plan /output.json | status /checkpoints /output.json | execute /checkpoints /approval.json /output.json");
const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "src/lib/progress/insights-research/protein-energy/reserved-run.test.ts", "--maxWorkers=1"], {
  cwd: fileURLToPath(new URL("../../", import.meta.url)), stdio: "inherit", timeout: 3_610_000,
  env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=384`, OWNLEVEL_RESEARCH_RUN_MODE: mode,
    OWNLEVEL_RESEARCH_OUTPUT: args.at(-1), OWNLEVEL_RESEARCH_CHECKPOINTS: mode === "plan" ? "" : args[0], OWNLEVEL_RESEARCH_APPROVAL: mode === "execute" ? args[1] : "" },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
