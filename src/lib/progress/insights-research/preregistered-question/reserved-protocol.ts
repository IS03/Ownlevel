import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BLOCK_DAYS, CONTRAST_VERSION, HORIZON_DAYS, MIN_COVERAGE, MIN_INFORMATIVE_STRATA, PERMUTATIONS, SELECTIVE_GAP, SELECTIVE_MIN_DAYS } from "./contrast";
import { GENERATOR_VERSION, NULL_SCENARIOS, SCENARIOS } from "./scenarios";

/**
 * Offline research prototype (#367). Frozen protocol of the reserved calibration campaign plus a rehearsal twin.
 * Pure data and pure functions: nothing here generates a history.
 */

export type Group = "null" | "power" | "report" | "stress_out_of_domain";
export type Kind = "reserved" | "rehearsal";
export interface ScenarioPlan { id: string; group: Group; n: number; criterion: string | null }
export interface Budgets { maxCpuSeconds: number; maxRssMiB: number; chunkSize: number; maxWorkers: number }
export interface Protocol {
  kind: Kind;
  version: string;
  generatorVersion: string;
  contrastVersion: string;
  method: {
    design: number; looks: number[]; variant: string; permutations: number;
    alphas: { look1: number; look2: number }; blockDays: number; horizonDays: number;
    gates: { minCoverage: number; selectiveGap: number; selectiveMinDays: number; minInformativeStrata: number };
  };
  namespace: string;
  seedDerivation: { history: string; permutation: string };
  scenarios: ScenarioPlan[];
  budgets: Budgets;
  outputDir?: string;
  decisionRule: string;
  sourceFiles: string[];
}

export const RESERVED_VERSION = "preregistered-question-reserved/1";
export const REHEARSAL_VERSION = "preregistered-question-rehearsal/1";
export const RESERVED_NAMESPACE = "OWNLEVEL-367-preregistered-RESERVE-20261111-v1";
export const REHEARSAL_NAMESPACE = "OWNLEVEL-367-preregistered-DEV-rehearsal-1";
export const RESERVED_OUTPUT_DIR = "docs/progress/qa/367-preguntas-reserva";
export const NULL_CRITERION = "wilson_upper95_supported <= 0.05";
export const POWER_CRITERION = "wilson_lower95_supported >= 0.70 over ALL histories";
export const NULL_UPPER_MAX = 0.05;
export const POWER_LOWER_MIN = 0.7;
export const DECISION_RULE = "approved only if the campaign is complete (every scenario has exactly n verified results, no technical error, budgets respected) AND every null criterion holds AND the power criterion holds; anything else is rejected or incomplete; incomplete never approves";
export const POWER_SCENARIO = "P25";
export const SOURCE_FILES = [
  "src/lib/progress/insights-research/preregistered-question/contrast.ts",
  "src/lib/progress/insights-research/preregistered-question/generator.ts",
  "src/lib/progress/insights-research/preregistered-question/scenarios.ts",
  "src/lib/progress/insights-research/preregistered-question/reserved-protocol.ts",
  "src/lib/progress/insights-research/preregistered-question/reserved-authorization.ts",
  "src/lib/progress/insights-research/preregistered-question/reserved-runner.ts",
  "src/lib/progress/insights-engine/stats.ts",
  "scripts/insights-research/preregistered-reserved.mjs",
];
export const REQUIRED_NULLS = NULL_SCENARIOS.filter(id => id !== "N7_collider_missing");
const GROUP_OF: Record<string, Group> = {
  ...Object.fromEntries(REQUIRED_NULLS.map(id => [id, "null" as Group])),
  P25: "power", P10: "report", P15: "report", P20: "report", P15_sparse: "report",
  N7_collider_missing: "stress_out_of_domain", S1_short_trends: "stress_out_of_domain", S2_anticipatory_missing: "stress_out_of_domain",
};
const CRITERION_OF: Record<Group, string | null> = { null: NULL_CRITERION, power: POWER_CRITERION, report: null, stress_out_of_domain: null };
const RESERVED_N: Record<Group, number> = { null: 4000, power: 1000, report: 1000, stress_out_of_domain: 1000 };
const ORDER = [...REQUIRED_NULLS, "P25", "P10", "P15", "P20", "P15_sparse", "N7_collider_missing", "S1_short_trends", "S2_anticipatory_missing"];

function plan(n: (group: Group) => number): ScenarioPlan[] {
  return ORDER.map(id => { const group = GROUP_OF[id]; return { id, group, n: n(group), criterion: CRITERION_OF[group] }; });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as object)) deepFreeze(v);
  }
  return value;
}

const METHOD = {
  design: 120, looks: [60, 120], variant: "era_shift", permutations: PERMUTATIONS,
  alphas: { look1: 0.007, look2: 0.028 }, blockDays: BLOCK_DAYS, horizonDays: HORIZON_DAYS,
  gates: { minCoverage: MIN_COVERAGE, selectiveGap: SELECTIVE_GAP, selectiveMinDays: SELECTIVE_MIN_DAYS, minInformativeStrata: MIN_INFORMATIVE_STRATA },
};
const SEED_DERIVATION = {
  history: "hash32(`${namespace}:${scenario}:${index}`) seeds the history generator",
  permutation: "hash32(`${namespace}:${scenario}:${index}:120:era_shift`), mixed per look with mixSeed(seed, look) as in contrast.ts",
};

export const RESERVED_PROTOCOL: Protocol = deepFreeze({
  kind: "reserved",
  version: RESERVED_VERSION,
  generatorVersion: GENERATOR_VERSION,
  contrastVersion: CONTRAST_VERSION,
  method: structuredClone(METHOD),
  namespace: RESERVED_NAMESPACE,
  seedDerivation: { ...SEED_DERIVATION },
  scenarios: plan(g => RESERVED_N[g]),
  budgets: { maxCpuSeconds: 600, maxRssMiB: 512, chunkSize: 250, maxWorkers: 1 },
  outputDir: RESERVED_OUTPUT_DIR,
  decisionRule: DECISION_RULE,
  sourceFiles: [...SOURCE_FILES],
});

/** Same method and scenario ids as the reserved protocol, tiny n, dev namespace, no fixed output dir (callers pass a temp dir). */
export const REHEARSAL_PROTOCOL: Protocol = deepFreeze({
  kind: "rehearsal",
  version: REHEARSAL_VERSION,
  generatorVersion: GENERATOR_VERSION,
  contrastVersion: CONTRAST_VERSION,
  method: structuredClone(METHOD),
  namespace: REHEARSAL_NAMESPACE,
  seedDerivation: { ...SEED_DERIVATION },
  scenarios: plan(() => 40),
  budgets: { maxCpuSeconds: 60, maxRssMiB: 512, chunkSize: 20, maxWorkers: 1 },
  decisionRule: DECISION_RULE,
  sourceFiles: [...SOURCE_FILES],
});

/** Stable JSON: object keys sorted, no whitespace, `undefined` properties dropped, non-finite numbers rejected. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("canonicalJson: non-finite number"); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(v => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).filter(k => obj[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
  }
  throw new Error(`canonicalJson: unsupported ${typeof value}`);
}

export const sha256Hex = (text: string) => createHash("sha256").update(text).digest("hex");
export const protocolHash = (protocol: Protocol) => sha256Hex(canonicalJson(protocol));

/** sha256 over `${path}\n${sha256(content, CRLF normalized)}\n` for each source file in order. */
export function sourceHash(root: string, files: readonly string[] = SOURCE_FILES): string {
  const h = createHash("sha256");
  for (const path of files) h.update(`${path}\n${sha256Hex(readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n"))}\n`);
  return h.digest("hex");
}

function fail(message: string): never { throw new Error(`Invalid protocol: ${message}`); }

/** Throws on ANY inconsistency. A reserved protocol must additionally equal RESERVED_PROTOCOL exactly. */
export function validateProtocol(protocol: Protocol): void {
  if (!protocol || typeof protocol !== "object") fail("not an object");
  const { kind, method, budgets } = protocol;
  if (kind !== "reserved" && kind !== "rehearsal") fail(`unknown kind ${String(kind)}`);
  if (protocol.version !== (kind === "reserved" ? RESERVED_VERSION : REHEARSAL_VERSION)) fail("version does not match kind");
  if (protocol.generatorVersion !== GENERATOR_VERSION) fail("generatorVersion mismatch");
  if (protocol.contrastVersion !== CONTRAST_VERSION) fail("contrastVersion mismatch");
  if (!method) fail("method missing");
  if (method.design !== 120) fail("design must be 120");
  if (method.variant !== "era_shift") fail("variant must be era_shift");
  if (method.permutations !== 999) fail("permutations must be 999");
  if (!method.alphas || method.alphas.look1 !== 0.007 || method.alphas.look2 !== 0.028) fail("alphas must be exactly 0.007 / 0.028");
  if (Math.abs(method.alphas.look1 + method.alphas.look2 - 0.035) > 1e-12) fail("alphas must sum to 0.035");
  if (canonicalJson(method) !== canonicalJson(METHOD)) fail("method differs from the frozen method");
  if (!budgets || ![budgets.maxCpuSeconds, budgets.maxRssMiB, budgets.chunkSize, budgets.maxWorkers].every(v => typeof v === "number" && Number.isFinite(v) && v > 0)) fail("budgets missing or not positive");
  if (budgets.maxWorkers !== 1 || !Number.isInteger(budgets.chunkSize)) fail("maxWorkers must be 1 and chunkSize an integer");
  if (typeof protocol.namespace !== "string" || !protocol.namespace) fail("namespace missing");
  if (kind === "reserved") {
    if (!protocol.namespace.includes("RESERVE")) fail("a reserved protocol needs a RESERVE namespace");
    if (protocol.outputDir !== RESERVED_OUTPUT_DIR) fail("a reserved protocol has a fixed outputDir");
  } else {
    if (!protocol.namespace.includes("DEV") || /reserve/i.test(protocol.namespace)) fail("a rehearsal protocol needs a DEV namespace without 'reserve'");
    if (protocol.outputDir !== undefined) fail("a rehearsal protocol must not fix an outputDir");
  }
  if (protocol.decisionRule !== DECISION_RULE) fail("decisionRule differs");
  if (canonicalJson(protocol.sourceFiles) !== canonicalJson(SOURCE_FILES)) fail("sourceFiles differ");
  if (!Array.isArray(protocol.scenarios) || protocol.scenarios.length === 0) fail("scenarios missing");
  const seen = new Set<string>();
  for (const s of protocol.scenarios) {
    if (!(SCENARIOS as readonly string[]).includes(s.id)) fail(`unknown scenario id ${s.id}`);
    if (seen.has(s.id)) fail(`duplicate scenario id ${s.id}`);
    seen.add(s.id);
    if (GROUP_OF[s.id] !== s.group) fail(`${s.id} has the wrong group`);
    if (s.criterion !== CRITERION_OF[s.group]) fail(`${s.id} has the wrong criterion`);
    if (!Number.isInteger(s.n) || s.n <= 0 || s.n % budgets.chunkSize !== 0) fail(`${s.id}: n must be a positive multiple of chunkSize`);
    if (kind === "reserved" && s.n !== RESERVED_N[s.group]) fail(`${s.id}: n differs from the frozen n`);
  }
  // A reserved protocol needs every null and the power scenario. A rehearsal may be smaller (for fast tests) but still
  // needs at least one null and the power scenario so the decision rule is exercised.
  const nulls = protocol.scenarios.filter(s => s.group === "null");
  if (!seen.has(POWER_SCENARIO)) fail("power scenario P25 missing");
  if (kind === "reserved" ? REQUIRED_NULLS.some(id => !seen.has(id)) : nulls.length === 0) fail("required null scenario missing");
  if (kind === "reserved" && canonicalJson(protocol) !== canonicalJson(RESERVED_PROTOCOL)) fail("differs from the frozen reserved protocol");
}

export interface Job { scenario: string; chunk: number; from: number; to: number }
/** Metadata only: no seed is drawn and no history generated. */
export function planJobs(protocol: Protocol): Job[] {
  const jobs: Job[] = [];
  for (const s of protocol.scenarios) for (let c = 0; c * protocol.budgets.chunkSize < s.n; c++) {
    jobs.push({ scenario: s.id, chunk: c, from: c * protocol.budgets.chunkSize, to: Math.min(s.n, (c + 1) * protocol.budgets.chunkSize) });
  }
  return jobs;
}
