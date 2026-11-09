/** Opt-in CLI bridge via the already-installed TS test runtime. Importing this file never generates a reserved history. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { it } from "vitest";
import { inspectCompleted, runCheckpointed } from "../../../../../scripts/insights-research/checkpoint-runner";
import { planJobs, protocolHash, RESERVED_PROTOCOL } from "./reserved-protocol";
import { executeReservedHistory, type HistoryCheckpoint, type HistoryResult } from "./reserved-history";
import { reservedReport } from "./reserved-report";

it.skipIf(!process.env.OWNLEVEL_RESEARCH_RUN_MODE)("runs an explicitly selected research CLI mode", () => {
  const mode = process.env.OWNLEVEL_RESEARCH_RUN_MODE, output = process.env.OWNLEVEL_RESEARCH_OUTPUT;
  if (!output?.startsWith("/")) throw new Error("Absolute output path required");
  if (mode === "plan") { writeFileSync(output, JSON.stringify({ protocolHash: protocolHash(), protocol: RESERVED_PROTOCOL, histories: planJobs().length, generatedHistories: 0 }, null, 2)); return; }
  const directory = process.env.OWNLEVEL_RESEARCH_CHECKPOINTS;
  if (!directory?.startsWith("/")) throw new Error("Absolute checkpoint directory required");
  if (mode === "status") { writeFileSync(output, JSON.stringify(reservedReport(inspectCompleted<HistoryResult>(directory)), null, 2)); return; }
  if (mode !== "execute") throw new Error("Unknown research mode");
  const approvalPath = process.env.OWNLEVEL_RESEARCH_APPROVAL;
  if (!approvalPath?.startsWith("/")) throw new Error("External reviewed authorization required; no reserve generated");
  const approval = JSON.parse(readFileSync(approvalPath, "utf8")), candidate = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (approval.reservedValidationAuthorized !== true || approval.protocolHash !== protocolHash() || approval.candidateCommit !== candidate || approval.inferenceClaim !== "forecast-risk-only") throw new Error("Authorization does not match reviewed protocol, claim and candidate; no reserve generated");
  if (process.version !== RESERVED_PROTOCOL.runtime.node || JSON.parse(readFileSync("node_modules/vitest/package.json", "utf8")).version !== RESERVED_PROTOCOL.runtime.vitest) throw new Error("Runtime differs from the frozen protocol");
  if (execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()) throw new Error("Candidate must be clean");
  const jobs = planJobs(), byId = new Map(jobs.map(job => [job.id, job]));
  try {
    runCheckpointed<HistoryCheckpoint, HistoryResult>({ directory, protocolHash: protocolHash(), candidate, jobs, limits: RESERVED_PROTOCOL,
      execute: (job, checkpoint, save, guard) => executeReservedHistory(byId.get(job.id)!, RESERVED_PROTOCOL.reserveNamespace, checkpoint, save, guard) });
  } finally { writeFileSync(output, JSON.stringify(reservedReport(inspectCompleted<HistoryResult>(directory)), null, 2)); }
}, RESERVED_PROTOCOL.maxInvocationSeconds * 1000 + 10_000);
