/** Research-only forecast comparison, NOT a test of conditional independence or causality. */
export const INFERENCE = Object.freeze({
  version: "protein-energy-inference/research-1",
  alpha: 0.005, // One lifetime allocation through 36 months; no per-cut renewal.
  familyCap: 0.01,
  lambdas: [0.0625, 0.125, 0.25, 0.5, 0.75] as readonly number[],
  lossBound: 4,
  costBudget: { repetitions: 20, seconds: 30, rssMiB: 384 },
});
export type Evidence = { n: number; sum: number; squares: number; logE: number };
export const initialEvidence = (): Evidence => ({ n: 0, sum: 0, squares: 0, logE: 0 });
export function logEvidence(sum: number, squares: number): number {
  if (!Number.isFinite(sum) || !Number.isFinite(squares) || squares < 0) throw new Error("Invalid evidence accumulators");
  const terms = INFERENCE.lambdas.map(lambda => lambda * sum - (-Math.log1p(-lambda) - lambda) * squares);
  const max = Math.max(...terms), logE = max + Math.log(terms.reduce((s, term) => s + Math.exp(term - max), 0) / terms.length);
  if (!Number.isFinite(logE)) throw new Error("Nonfinite evidence");
  return logE;
}
/** z=A*(RPS_baseline−RPS_extended)/4. Unobserved/ineligible responses contribute zero, never selected-away trials. */
export function updateEvidence(previous: Evidence, lossDifference: number | null): Evidence {
  if (!Number.isSafeInteger(previous.n) || previous.n < 0 || !Number.isFinite(previous.logE)) throw new Error("Invalid evidence state");
  const tolerance = 1e-9 * Math.max(1, previous.n);
  if (Math.abs(previous.sum) > previous.n + tolerance || previous.squares > previous.n + tolerance || previous.sum ** 2 > previous.n * previous.squares + tolerance
    || Math.abs(logEvidence(previous.sum, previous.squares) - previous.logE) > 1e-10) throw new Error("Inconsistent evidence state");
  const z = lossDifference === null ? 0 : lossDifference / INFERENCE.lossBound;
  if (!Number.isFinite(z) || z < -1 || z > 1) throw new Error("Loss difference outside [-4,4]");
  const n = previous.n + 1, sum = previous.sum + z, squares = previous.squares + z * z;
  return { n, sum, squares, logE: logEvidence(sum, squares) };
}
export function crossesThreshold(evidence: Evidence): boolean { return evidence.logE >= Math.log(1 / INFERENCE.alpha); }
