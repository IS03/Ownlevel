import { createHash } from "node:crypto";
import { encode, encoderFor, fit, probabilities, rankedProbabilityScore, supportFor, supportReason, type Labeled, type Model } from "./model";
import { POLICY } from "./policy";
import { monthAfter, prepare, type Preparation, type Snapshot } from "./preparation";

export type Prediction = { id: string; date: string; protein: number; targetState: string; y: number | null; baseline: number[]; extended: number[]; baselineLoss: number | null; extendedLoss: number | null };
export type CutResult = {
  month: number; trainingUntil: string; evaluationUntil: string; state: "abstain" | "no_development_gain" | "development_predictive_signal";
  reasons: string[]; train: Preparation | null; evaluation: Preparation | null; trainingIds: string[]; predictions: Prediction[];
  supportExclusions: Record<string, number>; scored: number; coverage: number | null;
  loss: { baseline: number; extended: number; gain: number; halfGains: number[] } | null;
  fits: { baseline: Omit<Model, "weights">; extended: Omit<Model, "weights">; columns: number } | null;
  responseCoverageByProtein: { split: number; low: { features: number; answered: number }; high: { features: number; answered: number } } | null;
};
export type Receipt = { key: string; version: string; anchor: string; snapshotHashes: Record<string, string>; result: CutResult };
export type Delivery = { receipt: Receipt; newOpportunity: boolean; replayed: boolean };
export type Run = { publicable: false; riskValidated: false; associationDirection: "not_inferred"; deliveries: Delivery[]; ledger: Receipt[] };

/** Stable identity, independent of source array/object order. Preserves duplicates rather than silently deduplicating. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function snapshotHash(snapshot: Snapshot): string { return createHash("sha256").update(canonical(snapshot)).digest("hex"); }
const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const withoutWeights = ({ initialObjective, finalObjective, gradientNorm, iterations, step }: Model) => ({ initialObjective, finalObjective, gradientNorm, iterations, step });
function empty(month: number, anchor: string): CutResult {
  return { month, trainingUntil: monthAfter(anchor, month - 3), evaluationUntil: monthAfter(anchor, month), state: "abstain", reasons: [], train: null, evaluation: null,
    trainingIds: [], predictions: [], supportExclusions: {}, scored: 0, coverage: null, loss: null, fits: null, responseCoverageByProtein: null };
}

/** Fit on one snapshot, predict only the NEXT block's features, then score its eligible labels. */
export function evaluateCut(anchor: string, month: number, training: Snapshot, evaluation: Snapshot): CutResult {
  if (!POLICY.months.includes(month) || training.asOf !== monthAfter(anchor, month - 3) || evaluation.asOf !== monthAfter(anchor, month)) throw new Error("Snapshots must match scheduled temporal boundaries");
  const result = empty(month, anchor);
  result.train = prepare(training, anchor);
  result.evaluation = prepare(evaluation, training.asOf);
  const rows: Labeled[] = result.train.rows.filter(row => row.target.state === "in_window").map(row => ({ ...row, y: row.target.value! }));
  result.trainingIds = rows.map(row => row.id);
  if (rows.length < POLICY.minTrain) result.reasons.push("too_few_training_rows");
  if (new Set(rows.map(row => row.routine)).size > POLICY.maxRoutines) result.reasons.push("too_many_routines");
  if (new Set(rows.map(row => row.y)).size < POLICY.minOutcomeCategories) result.reasons.push("too_few_outcome_categories");
  if (result.evaluation.rows.some(row => result.trainingIds.includes(row.id))) result.reasons.push("identity_crosses_temporal_split");
  if (result.reasons.length) return result;
  const encoder = encoderFor(rows, anchor), support = supportFor(rows);
  if (!Number.isFinite(encoder.proteinSd) || encoder.proteinSd < POLICY.minProteinLogSd) { result.reasons.push("constant_or_sparse_exposure"); return result; }
  const supported = result.evaluation.rows.filter(row => {
    const reason = supportReason(row, support);
    if (reason) result.supportExclusions[reason] = (result.supportExclusions[reason] ?? 0) + 1;
    return !reason;
  });
  if (!supported.length) { result.reasons.push("no_supported_evaluation_rows"); return result; }
  try {
    const baseline = fit(rows.map(row => encode(row, encoder, false)), rows.map(row => row.y));
    const extended = fit(rows.map(row => encode(row, encoder, true)), rows.map(row => row.y));
    result.fits = { baseline: withoutWeights(baseline), extended: withoutWeights(extended), columns: extended.weights[0].length };
    result.predictions = supported.map(row => {
      // No target enters encode, support, fit, or the decision to predict this row.
      const p = probabilities(baseline.weights, encode(row, encoder, false)), q = probabilities(extended.weights, encode(row, encoder, true));
      const y = row.target.state === "in_window" ? row.target.value : null;
      return { id: row.id, date: row.date, protein: row.protein, targetState: row.target.state, y, baseline: p, extended: q,
        baselineLoss: y === null ? null : rankedProbabilityScore(p, y), extendedLoss: y === null ? null : rankedProbabilityScore(q, y) };
    });
  } catch (error) {
    result.reasons.push("numerical_failure");
    // Keep the concrete failure, never convert a failed fit into no effect.
    result.reasons.push(error instanceof Error ? error.message : "unknown_fit_failure");
    return result;
  }
  const sortedProtein = rows.map(row => row.protein).sort((a, b) => a - b), split = sortedProtein[Math.floor(sortedProtein.length / 2)];
  const band = (low: boolean) => {
    const group = result.evaluation!.rows.filter(row => (row.protein <= split) === low);
    return { features: group.length, answered: group.filter(row => row.target.state === "in_window").length };
  };
  result.responseCoverageByProtein = { split, low: band(true), high: band(false) };
  const scored = result.predictions.filter(row => row.baselineLoss !== null && row.extendedLoss !== null);
  result.scored = scored.length;
  result.coverage = result.evaluation.completed ? scored.length / result.evaluation.completed : 0;
  if (scored.length < POLICY.minEvaluation) result.reasons.push("too_few_evaluation_labels");
  if (result.coverage < POLICY.minCoverage) result.reasons.push("insufficient_evaluation_coverage");
  if (scored.length) {
    const gains = scored.map(row => row.baselineLoss! - row.extendedLoss!), half = Math.floor(gains.length / 2);
    result.loss = { baseline: average(scored.map(row => row.baselineLoss!)), extended: average(scored.map(row => row.extendedLoss!)), gain: average(gains),
      halfGains: half ? [average(gains.slice(0, half)), average(gains.slice(half))] : [] };
    if (!result.reasons.length) result.state = result.loss.gain >= POLICY.diagnosticGain && result.loss.halfGains.length === 2 && result.loss.halfGains.every(gain => gain > 0)
      ? "development_predictive_signal" : "no_development_gain";
  }
  return result;
}

/** Caller retains the ledger. Replays never refit; consumed or revised cuts never create another emission opportunity. */
export function runPrototype(input: { anchor: string; throughMonth: number; snapshots: readonly Snapshot[]; previous?: readonly Receipt[] }): Run {
  monthAfter(input.anchor, 0);
  if (!POLICY.months.includes(input.throughMonth)) throw new Error("Unscheduled horizon");
  const snapshots = new Map<string, Snapshot>(), hashes: Record<string, string> = {};
  for (const snapshot of input.snapshots) {
    if (snapshots.has(snapshot.asOf)) throw new Error("Duplicate snapshot boundary");
    snapshots.set(snapshot.asOf, snapshot); hashes[snapshot.asOf] = snapshotHash(snapshot);
  }
  const ledger = [...(input.previous ?? [])], previous = new Map(ledger.map(receipt => [receipt.key, receipt]));
  if (previous.size !== ledger.length || ledger.some(receipt => receipt.version !== POLICY.version || receipt.anchor !== input.anchor)) throw new Error("Incompatible or duplicate ledger");
  const changedBoundaries = new Set<string>();
  for (const receipt of ledger) for (const [day, hash] of Object.entries(receipt.snapshotHashes)) if (hashes[day] !== hash) changedBoundaries.add(day);
  const deliveries: Delivery[] = [];
  for (const month of POLICY.months.filter(value => value <= input.throughMonth)) {
    const key = `${POLICY.version}:${input.anchor}:${month}`, result = empty(month, input.anchor);
    const training = snapshots.get(result.trainingUntil), evaluation = snapshots.get(result.evaluationUntil), prior = previous.get(key);
    const changed = [...changedBoundaries].some(day => day <= result.evaluationUntil);
    if (prior && !changed) { deliveries.push({ receipt: prior, newOpportunity: false, replayed: true }); continue; }
    if (changed) result.reasons.push("history_revision_changed");
    else if (!training || !evaluation) result.reasons.push("missing_as_of_snapshot");
    const computed = result.reasons.length ? result : evaluateCut(input.anchor, month, training!, evaluation!);
    const snapshotHashes = Object.fromEntries([...snapshots.keys()].filter(day => day <= result.evaluationUntil).sort().map(day => [day, hashes[day]]));
    const receipt: Receipt = { key, version: POLICY.version, anchor: input.anchor, snapshotHashes, result: computed };
    // A revised consumed cut is displayed as invalid, but its immutable original receipt stays in the ledger.
    if (!prior) ledger.push(receipt);
    deliveries.push({ receipt, newOpportunity: !prior, replayed: false });
  }
  return { publicable: false, riskValidated: false, associationDirection: "not_inferred", deliveries, ledger };
}
