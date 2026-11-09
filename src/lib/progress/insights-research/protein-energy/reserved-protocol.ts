import { INFERENCE } from "./inference";
import { POLICY } from "./policy";
import { digest } from "./prospective";
export type ScenarioId = "A1_iid" | "A2_serial" | "A3_observed_changes" | "A4_mar" | "A5_variance" | "A6_nonlinear_proxy" | "A7_timing" | "A8_sparse"
  | "B1_plus15" | "B2_plus30" | "B3_minus15" | "B4_minus30"
  | "C1_hidden" | "C2_selection" | "C3_clock" | "C4_no_overlap" | "C5_new_routines" | "C6_revision";
export const SCENARIOS: readonly { id: ScenarioId; group: "information_null" | "positive" | "stress"; n: number; expected: string }[] = [
  ...(["A1_iid", "A2_serial", "A3_observed_changes", "A4_mar", "A5_variance", "A6_nonlinear_proxy", "A7_timing", "A8_sparse"] as const).map(id => ({ id, group: "information_null" as const, n: 4000, expected: "upper95_any_alert<=0.01_at_24_and_36" })),
  ...(["B1_plus15", "B2_plus30", "B3_minus15", "B4_minus30"] as const).map(id => ({ id, group: "positive" as const, n: 1000, expected: "lower95_detection>=0.80_at_24_and_36" })),
  ...(["C1_hidden", "C2_selection", "C3_clock", "C4_no_overlap", "C5_new_routines", "C6_revision"] as const).map(id => ({ id, group: "stress" as const, n: 400,
    expected: ["C4_no_overlap", "C5_new_routines", "C6_revision"].includes(id) ? "all_abstain_no_alert" : "report_only_no_causal_or_independence_claim" })),
];
export const RESERVED_PROTOCOL = Object.freeze({
  version: "protein-energy-reserved/protocol-1-review",
  generatorVersion: "protein-energy-scenarios/1",
  runtime: { node: "v22.19.0", vitest: "3.2.7" },
  predictorVersion: POLICY.version,
  inferenceVersion: INFERENCE.version,
  reserveNamespace: "OWNLEVEL-367-protein-energy-reserve-20261109-v1",
  seedDerivation: "SHA256(namespace + ':' + scenarioId + ':' + zeroBasedHistoryIndex); counter-mode SHA256 draws, first 13 hex digits / 2^52",
  months: [24, 36], anchor: "2022-01-01", scenarios: SCENARIOS,
  alpha: INFERENCE.alpha, approvedRiskGoal: 0.01, confidence: 0.95,
  maxCpuSeconds: 36 * 3600, maxWallSeconds: 48 * 3600, maxInvocationSeconds: 3600, maxRssMiB: 512, maxDiskMiB: 1024,
  maxWorkers: 1, authorization: "external manifest bound to protocol hash AND candidate commit; absent now",
  decision: "all information-null scenarios pass upper95 at both horizons AND all positives pass lower95 AND mandatory-abstention stresses pass; incomplete never passes",
});
export const protocolHash = () => digest({ protocol: RESERVED_PROTOCOL, predictorPolicy: POLICY, inference: INFERENCE });
/** Planning is metadata only: no seed draws, histories or reserved outcomes are generated. */
export function planJobs() { return SCENARIOS.flatMap(scenario => Array.from({ length: scenario.n }, (_, index) => ({ id: `${scenario.id}:${index}`, scenario: scenario.id, index }))); }
