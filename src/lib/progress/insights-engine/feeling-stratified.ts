import { dayNumber, ranks, seededRandom } from "./stats";
import type { Candidate, ObservationRow } from "./types";

/**
 * EXPERIMENTAL (`insights-feeling-stratified/1`), preregistered in 367-sensaciones-estratificado-metodo.md. Not published, and no view
 * calls it. The rows and candidates are the ones of `prepareFeelingAssociations` (#412); only the evaluation changes. Days are
 * exchangeable only inside a stratum, the recorded routine by a 42-day calendar block, so the null keeps whatever an era or a trend
 * shares between exposure and outcome. The statistic is Spearman's correlation taken inside those strata.
 */
export const FEELING_STRATIFIED_METHOD = "insights-feeling-stratified/1" as const;
export const STRATIFIED_POLICY = {
  blockDays: 42, minStratumRows: 4, minPairs: 20, strictPairs: 40, minNonModal: 5,
  exploratoryP: 0.05, exploratoryRho: 0.25,
  /** 0.01 split between the two outcomes, energy and fatigue. */
  strictAdjustedP: 0.005, strictRho: 0.3, strictHalfRho: 0.15,
  permutations: 499, seed: 0x5172,
} as const;

export type StratifiedItem = {
  id: string; pairs: number; keptPairs: number; strata: number;
  rho: number | null; permutationP: number | null; familyAdjustedP: number | null; firstHalfRho: number | null; secondHalfRho: number | null;
  state: "insufficient_data" | "no_clear_signal" | "exploratory"; strictGate: boolean;
};
export type Prepared = { candidate: Candidate; strata: { rows: Int32Array; cx: Float64Array }[]; cxSquares: number; keptPairs: number; pairs: number; nonModal: number;
  observed: number; exceed: number; adjustedExceed: number };

export const centered = (values: number[]) => { const order = ranks(values); const mean = (values.length + 1) / 2; return Float64Array.from(order, value => value - mean); };
/** Strata of the outcome's rows: recorded routine by calendar block, counted from the first row. Never drawn from any result. */
export function strataOf(rows: readonly ObservationRow[]) {
  const first = rows.length ? dayNumber(rows[0]!.date) : 0;
  return rows.map(row => `${row.routineKey ?? "free"}|${Math.floor((dayNumber(row.date) - first) / STRATIFIED_POLICY.blockDays)}`);
}

/** Σ cx·v over the strata, over √(Σcx² · Σ(v − mean of the stratum)²): a correlation inside strata, for any assignment v of the outcome. */
export function statistic(item: Prepared, value: (row: number) => number) {
  let cross = 0, squares = 0;
  for (const stratum of item.strata) {
    let mean = 0;
    for (let i = 0; i < stratum.rows.length; i++) mean += value(stratum.rows[i]!);
    mean /= stratum.rows.length;
    for (let i = 0; i < stratum.rows.length; i++) { const v = value(stratum.rows[i]!) - mean; cross += stratum.cx[i]! * v; squares += v * v; }
  }
  return squares > 0 && item.cxSquares > 0 ? cross / Math.sqrt(item.cxSquares * squares) : 0;
}

export function prepare(candidate: Candidate, rows: readonly ObservationRow[], stratum: readonly string[]): Prepared {
  const groups = new Map<string, number[]>();
  let pairs = 0;
  rows.forEach((row, index) => { if (!candidate.values.has(row.date)) return; pairs++; const key = stratum[index]!; const list = groups.get(key); if (list) list.push(index); else groups.set(key, [index]); });
  const strata = [...groups.values()].filter(list => list.length >= STRATIFIED_POLICY.minStratumRows)
    .map(list => ({ rows: Int32Array.from(list), cx: centered(list.map(index => candidate.values.get(rows[index]!.date)!)) }));
  const kept = strata.flatMap(item => [...item.rows].map(index => candidate.values.get(rows[index]!.date)!));
  const counts = new Map<number, number>(); let modal = 0;
  for (const value of kept) { const count = (counts.get(value) ?? 0) + 1; counts.set(value, count); if (count > modal) modal = count; }
  return { candidate, strata, cxSquares: strata.reduce((sum, item) => sum + item.cx.reduce((s, v) => s + v * v, 0), 0), keptPairs: kept.length, pairs,
    nonModal: kept.length - modal, observed: 0, exceed: 0, adjustedExceed: 0 };
}

/** The same correlation over the rows of half the history, by date: the halves are reported and gate the strict state. */
export function halfRho(item: Prepared, rows: readonly ObservationRow[], stratum: readonly string[], y: Float64Array, from: number, to: number) {
  const dates = new Set(rows.slice(from, to).map(row => row.date));
  const half: Candidate = { ...item.candidate, values: new Map([...item.candidate.values].filter(([date]) => dates.has(date))) };
  const prepared = prepare(half, rows, stratum);
  return prepared.keptPairs >= STRATIFIED_POLICY.minStratumRows * 2 ? statistic(prepared, row => y[row]!) : null;
}

/**
 * Every candidate of one outcome, against the same within-stratum permutations of that outcome, so the maximum covers the family.
 * The outcome is ranked inside each stratum of all the outcome's rows; each candidate keeps its own paired rows of it.
 */
export function evaluateStratified(rowsInput: readonly ObservationRow[], candidates: readonly Candidate[], options: { permutations?: number; seed?: number } = {}) {
  const permutations = options.permutations ?? STRATIFIED_POLICY.permutations;
  const rows = [...rowsInput].sort((a, b) => a.date.localeCompare(b.date));
  const stratum = strataOf(rows);
  const members = new Map<string, number[]>();
  stratum.forEach((key, index) => { const list = members.get(key); if (list) list.push(index); else members.set(key, [index]); });
  // The outcome's rank inside each stratum of all its rows: what a permutation moves around inside that stratum.
  const y = new Float64Array(rows.length);
  for (const list of members.values()) { const order = centered(list.map(index => rows[index]!.y)); list.forEach((index, position) => { y[index] = order[position]!; }); }
  const prepared = candidates.map(candidate => prepare(candidate, rows, stratum));
  const testable = prepared.filter(item => item.keptPairs >= STRATIFIED_POLICY.minPairs && item.cxSquares > 0);
  for (const item of testable) item.observed = statistic(item, row => y[row]!);
  if (testable.length) {
    const random = seededRandom(options.seed ?? STRATIFIED_POLICY.seed);
    const permuted = new Float64Array(rows.length), lists = [...members.values()];
    for (let round = 0; round < permutations; round++) {
      for (const list of lists) {
        const values = list.map(index => y[index]!);
        for (let i = values.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [values[i], values[j]] = [values[j]!, values[i]!]; }
        list.forEach((index, position) => { permuted[index] = values[position]!; });
      }
      const stats = testable.map(item => Math.abs(statistic(item, row => permuted[row]!)));
      const maximum = Math.max(...stats);
      testable.forEach((item, index) => { const observed = Math.abs(item.observed); if (stats[index]! >= observed) item.exceed++; if (maximum >= observed) item.adjustedExceed++; });
    }
  }
  const half = rows.length >> 1;
  const items: StratifiedItem[] = prepared.map(item => {
    const base = { id: item.candidate.definition.id, pairs: item.pairs, keptPairs: item.keptPairs, strata: item.strata.length };
    if (!testable.includes(item)) return { ...base, rho: null, permutationP: null, familyAdjustedP: null, firstHalfRho: null, secondHalfRho: null, state: "insufficient_data", strictGate: false };
    const p = (item.exceed + 1) / (permutations + 1), adjusted = (item.adjustedExceed + 1) / (permutations + 1), rho = item.observed;
    const firstHalfRho = halfRho(item, rows, stratum, y, 0, half), secondHalfRho = halfRho(item, rows, stratum, y, half, rows.length);
    const exploratory = item.nonModal >= STRATIFIED_POLICY.minNonModal && p <= STRATIFIED_POLICY.exploratoryP && Math.abs(rho) >= STRATIFIED_POLICY.exploratoryRho;
    const sameSign = (value: number | null) => value !== null && Math.sign(value) === Math.sign(rho) && Math.abs(value) >= STRATIFIED_POLICY.strictHalfRho;
    const strictGate = exploratory && item.keptPairs >= STRATIFIED_POLICY.strictPairs && adjusted <= STRATIFIED_POLICY.strictAdjustedP && Math.abs(rho) >= STRATIFIED_POLICY.strictRho
      && sameSign(firstHalfRho) && sameSign(secondHalfRho);
    return { ...base, rho, permutationP: p, familyAdjustedP: adjusted, firstHalfRho, secondHalfRho, state: exploratory ? "exploratory" : "no_clear_signal", strictGate };
  });
  return { methodVersion: FEELING_STRATIFIED_METHOD, items, testable: testable.length, permutations, rows: rows.length };
}
