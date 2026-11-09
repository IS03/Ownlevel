import { spawnSync } from "node:child_process";
import { resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const output = process.argv[2];
if (!output || !isAbsolute(output) || process.argv.length !== 3) throw new Error("Usage: node scripts/insights-research/protein-energy-development.mjs /absolute/development-report.json");
const root = fileURLToPath(new URL("../../", import.meta.url));
// Fixed development workload only, with a hard outer deadline in addition to per-cut guards. No reserved generator exists here.
const result = spawnSync(process.execPath, [resolve(root, "node_modules/vitest/vitest.mjs"), "run", "src/lib/progress/insights-research/protein-energy/development.test.ts", "--maxWorkers=1"], {
  cwd: root, stdio: "inherit", timeout: 120_000, env: { ...process.env, OWNLEVEL_PROTEIN_ENERGY_DEVELOPMENT: "1", OWNLEVEL_PROTEIN_ENERGY_REPORT: output,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=384` },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
