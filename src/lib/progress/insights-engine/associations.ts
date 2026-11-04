import { blockPermutation, dayNumber, localResidual, mean, median, ranks, seededRandom, spearman } from "./stats";
import type { AssociationResult, Candidate, ObservationRow } from "./types";

/** Fixed before looking at any result. Calibration measures them; they are never tuned per user or per window. */
export const ASSOCIATION_POLICY = {
  minPairs: 20, minPerGroup: 5, exploratoryP: 0.05, exploratoryRho: 0.25, exploratoryLocalRho: 0.15,
  strictPairs: 40, strictAdjustedP: 0.01, strictRho: 0.3, strictLocalRho: 0.2, strictHalfRho: 0.15, strictCoverage: 0.5,
  sensitivityDelta: 0.15, selectiveAbsenceGap: 0.15, routineMinPairs: 10,
  localWindowDays: 28, blockSize: 14, permutations: 499, seed: 0x367,
} as const;

type Prepared = {
  candidate: Candidate; indices: Int32Array; x: Float64Array; xCentered: Float64Array; xNorm: number;
  observed: number; exceed: number; adjustedExceed: number;
};
export type AssociationEvaluation = AssociationResult & { strictGate: boolean };

function prepare(candidate: Candidate, rows: readonly ObservationRow[], yResidualRanks: Float64Array, days: Float64Array): Prepared | null {
  const positions: number[] = [];
  rows.forEach((row, index) => { if (candidate.values.has(row.date)) positions.push(index); });
  if (positions.length < ASSOCIATION_POLICY.minPairs) return null;
  const x = Float64Array.from(positions, index => candidate.values.get(rows[index]!.date)!);
  if (x.every(value => value === x[0])) return null;
  const residual = localResidual(x, Float64Array.from(positions, index => days[index]!), ASSOCIATION_POLICY.localWindowDays);
  const xRanks = ranks(residual);
  const xMean = xRanks.reduce((sum, value) => sum + value, 0) / xRanks.length;
  const xCentered = xRanks.map(value => value - xMean);
  const xNorm = Math.sqrt(xCentered.reduce((sum, value) => sum + value * value, 0));
  if (xNorm === 0) return null;
  const indices = Int32Array.from(positions);
  const prepared: Prepared = { candidate, indices, x, xCentered, xNorm, observed: 0, exceed: 0, adjustedExceed: 0 };
  prepared.observed = statistic(prepared, yResidualRanks, null);
  return prepared;
}

function statistic(item: Prepared, y: Float64Array, permutation: Int32Array | null): number {
  let sum = 0, squares = 0, cross = 0;
  const n = item.indices.length;
  for (let i = 0; i < n; i++) {
    const position = item.indices[i]!, value = y[permutation ? permutation[position]! : position]!;
    sum += value; squares += value * value; cross += item.xCentered[i]! * value;
  }
  const variance = squares - sum * sum / n;
  return variance <= 0 ? 0 : cross / (item.xNorm * Math.sqrt(variance));
}

function describe(candidate: Candidate, rows: readonly ObservationRow[], prepared: Prepared | null, permutations: number): AssociationEvaluation {
  const paired = rows.filter(row => candidate.values.has(row.date));
  const x = paired.map(row => candidate.values.get(row.date)!), y = paired.map(row => row.y);
  const base = { id: candidate.definition.id, definition: candidate.definition, pairs: paired.length, outcomeDays: rows.length,
    coverage: rows.length ? paired.length / rows.length : null, exclusions: { ...candidate.exclusions } };
  const sensitivities = Object.fromEntries(Object.entries(candidate.sensitivities ?? {}).map(([key, values]) => {
    const pairs = rows.filter(row => values.has(row.date));
    return [key, { pairs: pairs.length, rho: pairs.length >= ASSOCIATION_POLICY.minPairs ? spearman(pairs.map(row => values.get(row.date)!), pairs.map(row => row.y)) : null }];
  }));
  const empty = { firstHalfRho: null, secondHalfRho: null, equalSessionRho: null, withoutExtremesRho: null, leaveOneRoutineOutAgrees: null, selectiveAbsenceGap: null };
  const none = { rho: null, localRho: null, permutationP: null, familyAdjustedP: null, groups: null, stability: empty, sensitivities, strictGate: false };
  if (paired.length < ASSOCIATION_POLICY.minPairs) return { ...base, ...none, state: "insufficient_data", reason: "too_few_pairs" };
  if (!prepared) return { ...base, ...none, state: "insufficient_data", reason: new Set(x).size < 2 ? "no_variation" : "no_local_variation" };
  const cut = median(x), low = paired.filter((_, i) => x[i]! < cut), high = paired.filter((_, i) => x[i]! >= cut);
  const groups = low.length && high.length ? { cut, low: { days: low.length, meanOutcome: mean(low.map(row => row.y)) }, high: { days: high.length, meanOutcome: mean(high.map(row => row.y)) } } : null;
  const rho = spearman(x, y);
  const half = paired.length >> 1;
  const absent = rows.filter(row => !candidate.values.has(row.date));
  const sortedX = [...x].sort((a, b) => a - b), trim = Math.max(1, Math.floor(x.length * 0.05));
  const inner = paired.filter((_, i) => x[i]! > sortedX[trim - 1]! && x[i]! < sortedX[x.length - trim]!);
  const routines = new Map<string, number>();
  for (const row of paired) if (row.routineKey) routines.set(row.routineKey, (routines.get(row.routineKey) ?? 0) + 1);
  const large = [...routines].filter(([, count]) => count >= ASSOCIATION_POLICY.routineMinPairs).map(([key]) => key);
  const leaveOut = large.length < 2 ? null : large.every(key => {
    const rest = paired.filter(row => row.routineKey !== key);
    const value = rest.length >= ASSOCIATION_POLICY.minPairs ? spearman(rest.map(row => candidate.values.get(row.date)!), rest.map(row => row.y)) : null;
    return value !== null && rho !== null && Math.sign(value) === Math.sign(rho);
  });
  const stability: AssociationResult["stability"] = {
    firstHalfRho: spearman(x.slice(0, half), y.slice(0, half)), secondHalfRho: spearman(x.slice(half), y.slice(half)),
    equalSessionRho: spearman(x, paired.map(row => row.ySensitivity)),
    withoutExtremesRho: inner.length >= ASSOCIATION_POLICY.minPairs ? spearman(inner.map(row => candidate.values.get(row.date)!), inner.map(row => row.y)) : null,
    leaveOneRoutineOutAgrees: leaveOut,
    selectiveAbsenceGap: absent.length >= ASSOCIATION_POLICY.minPerGroup ? mean(y) - mean(absent.map(row => row.y)) : null,
  };
  const p = (prepared.exceed + 1) / (permutations + 1), adjusted = (prepared.adjustedExceed + 1) / (permutations + 1);
  const result = { ...base, rho, localRho: prepared.observed, permutationP: p, familyAdjustedP: adjusted, groups, stability, sensitivities };
  if (low.length < ASSOCIATION_POLICY.minPerGroup || high.length < ASSOCIATION_POLICY.minPerGroup) {
    return { ...result, state: "insufficient_data", reason: "unbalanced_groups", strictGate: false };
  }
  const selective = stability.selectiveAbsenceGap !== null && Math.abs(stability.selectiveAbsenceGap) >= ASSOCIATION_POLICY.selectiveAbsenceGap;
  const direction = rho !== null && Math.sign(rho) === Math.sign(prepared.observed);
  const exploratory = direction && !selective && p <= ASSOCIATION_POLICY.exploratoryP && Math.abs(rho!) >= ASSOCIATION_POLICY.exploratoryRho
    && Math.abs(prepared.observed) >= ASSOCIATION_POLICY.exploratoryLocalRho;
  const sameSign = (value: number | null, minimum = 0) => value !== null && Math.sign(value) === Math.sign(rho ?? 0) && Math.abs(value) >= minimum;
  const strictGate = exploratory && paired.length >= ASSOCIATION_POLICY.strictPairs && adjusted <= ASSOCIATION_POLICY.strictAdjustedP
    && Math.abs(rho!) >= ASSOCIATION_POLICY.strictRho && Math.abs(prepared.observed) >= ASSOCIATION_POLICY.strictLocalRho && (base.coverage ?? 0) >= ASSOCIATION_POLICY.strictCoverage
    && sameSign(stability.firstHalfRho, ASSOCIATION_POLICY.strictHalfRho) && sameSign(stability.secondHalfRho, ASSOCIATION_POLICY.strictHalfRho)
    && stability.equalSessionRho !== null && Math.abs(stability.equalSessionRho - rho!) <= ASSOCIATION_POLICY.sensitivityDelta
    && sameSign(stability.withoutExtremesRho) && leaveOut !== false;
  return { ...result, state: exploratory ? "exploratory" : "no_clear_signal", reason: exploratory ? "passes_exploratory_gate" : "weak_or_unstable", strictGate };
}

/**
 * Every candidate is tested against the same permuted outcome blocks, so the maximum across candidates controls the whole
 * family. All candidates count, whatever gets shown. `strictGate` is what calibration measures; the read model drops it.
 */
export function evaluateAssociations(rowsInput: readonly ObservationRow[], candidates: readonly Candidate[],
  options: { permutations?: number; seed?: number } = {}): { items: AssociationEvaluation[]; testable: number; permutations: number } {
  const permutations = options.permutations ?? ASSOCIATION_POLICY.permutations;
  const rows = [...rowsInput].sort((a, b) => a.date.localeCompare(b.date));
  const days = Float64Array.from(rows, row => dayNumber(row.date));
  const yRanks = ranks(localResidual(Float64Array.from(rows, row => row.y), days, ASSOCIATION_POLICY.localWindowDays));
  const prepared = candidates.map(candidate => prepare(candidate, rows, yRanks, days));
  const testable = prepared.filter((item): item is Prepared => !!item);
  if (testable.length) {
    const random = seededRandom(options.seed ?? ASSOCIATION_POLICY.seed);
    const stats = new Float64Array(testable.length);
    for (let round = 0; round < permutations; round++) {
      const permutation = blockPermutation(rows.length, ASSOCIATION_POLICY.blockSize, random);
      let maximum = 0;
      for (let i = 0; i < testable.length; i++) {
        const value = Math.abs(statistic(testable[i]!, yRanks, permutation));
        stats[i] = value;
        if (value > maximum) maximum = value;
      }
      for (let i = 0; i < testable.length; i++) {
        const item = testable[i]!, observed = Math.abs(item.observed);
        if (stats[i]! >= observed) item.exceed++;
        if (maximum >= observed) item.adjustedExceed++;
      }
    }
  }
  return { items: candidates.map((candidate, index) => describe(candidate, rows, prepared[index]!, permutations)), testable: testable.length, permutations };
}
