import type { ExposureContext } from "./exposures";
import { prepareFeelingAssociations } from "./feeling-outcomes";
import { centered, halfRho, prepare, statistic, strataOf, type Prepared } from "./feeling-stratified";
import { seededRandom } from "./stats";
import type { Candidate, FeelingOutcomeKind, InsightsEngineMethod, InsightsSource, ObservationRow, TemporalBasis } from "./types";

/**
 * PROTOTYPE (`insights-feeling-sequential/1`), designed in 367-sensaciones-secuencial-metodo.md. Not validated, not published, and no
 * view calls it. It changes two things of #417 and keeps the rest:
 * - only candidates whose exposure is shown to be before the session start enter the family;
 * - the false positive control covers the candidates, both outcomes (α split between them) and every scheduled look, with α spent
 *   look by look so the sum over an endless history stays at α.
 */
export const FEELING_SEQUENTIAL_METHOD = "insights-feeling-sequential/1" as const;
export const SEQUENTIAL_POLICY = {
  alphaTotal: 0.01, outcomes: 2, lookMonths: 3, minPairs: 20, strictPairs: 40, strictRho: 0.3, strictHalfRho: 0.15, minNonModal: 5,
  /** Besag–Clifford: a candidate stops counting at this many exceedances, once they already keep it above α over the whole run. */
  stopExceedances: 10,
  /** Permutations at look k: this many times 1/α_k, so α_k is reachable with room at its edge. */
  resolutionFactor: 10,
  seed: 0x5180,
} as const;

/** Bases whose exposure is shown to be before the start: the day before, and a meal with an explicit time before it. */
export const ELIGIBLE_BASES: ReadonlySet<TemporalBasis> = new Set<TemporalBasis>(["previous_logical_day", "explicit_meal_time_before_start"]);
/**
 * A night declared as ending on D says nothing about the hour it ended. A session at 01:00 of D may come before that night is over,
 * so it is not shown to be earlier (#419). Out of this method until a wake time is recorded; the published sleep context is untouched.
 */
export const NIGHT_NOT_SHOWN_BEFORE = "declared_night_end_not_shown_before_start" as const;
export function eligibleCandidates(candidates: readonly Candidate[]) {
  const eligible: Candidate[] = [], excluded: { id: string; reason: TemporalBasis | "feeling_frame" | typeof NIGHT_NOT_SHOWN_BEFORE }[] = [];
  for (const candidate of candidates) {
    if (candidate.definition.family === "feeling") excluded.push({ id: candidate.definition.id, reason: "feeling_frame" });
    else if (candidate.definition.temporalBasis === "declared_night_ending_on_day") excluded.push({ id: candidate.definition.id, reason: NIGHT_NOT_SHOWN_BEFORE });
    else if (ELIGIBLE_BASES.has(candidate.definition.temporalBasis)) eligible.push(candidate);
    else excluded.push({ id: candidate.definition.id, reason: candidate.definition.temporalBasis });
  }
  return { eligible, excluded };
}

/** α of look k for one outcome: α / 2 / (k (k + 1)). Over k = 1, 2, … it adds up to α / 2, whatever the length of the history. */
export const alphaAtLook = (k: number) => SEQUENTIAL_POLICY.alphaTotal / SEQUENTIAL_POLICY.outcomes / (k * (k + 1));
export const permutationsAtLook = (k: number) => Math.ceil(SEQUENTIAL_POLICY.resolutionFactor / alphaAtLook(k));

const addMonths = (date: string, months: number) => { const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1)), last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10); };
/** The fixed calendar: a look every three months from the first eligible day. A look at date L uses the days before L. */
export function scheduledDates(firstDate: string, today: string) {
  const dates: string[] = [];
  for (let n = 1; ; n++) { const date = addMonths(firstDate, SEQUENTIAL_POLICY.lookMonths * n); if (date > today) break; dates.push(date); }
  return dates;
}

/**
 * `familyAdjustedP` is a Monte Carlo p over every permutation of the run, and only a candidate counted until the end has one. A
 * candidate stopped early (Besag–Clifford) keeps where it stopped and a bound instead: had every allowed permutation run, its p
 * would be at least `pLowerBound`, which is above α by construction. Never a ratio over permutations it was not counted in (#419).
 */
export type SequentialItem = { id: string; pairs: number; keptPairs: number; rho: number | null; firstHalfRho: number | null; secondHalfRho: number | null;
  reason: "insufficient_data" | "gate_failed_before_permutation" | "stopped_early" | "permutation_tested";
  /** Permutations this candidate was counted over: its stopping point, or the whole run. */
  permutations: number;
  familyAdjustedP: number | null;
  stopped: { at: number; exceedances: number; pLowerBound: number } | null;
  passes: boolean };
export type SequentialEvaluation = { look: number; alpha: number; permutationsAllowed: number; permutationsUsed: number; items: SequentialItem[] };

/**
 * One look k over one outcome. The descriptive gates go first: a candidate that cannot pass them needs no p, and when none can,
 * no permutation runs. The others share the same within-stratum permutations; every candidate still counts in the family maximum.
 * Each one stops counting once it cannot pass (Besag–Clifford) and keeps where it stopped; the run stops when all are decided or B_k is reached.
 */
export function evaluateSequential(rowsInput: readonly ObservationRow[], candidates: readonly Candidate[], look: number, options: { maxPermutations?: number; seed?: number } = {}): SequentialEvaluation {
  const alpha = alphaAtLook(look), allowed = options.maxPermutations ?? permutationsAtLook(look);
  const rows = [...rowsInput].sort((a, b) => a.date.localeCompare(b.date));
  const stratum = strataOf(rows), members = new Map<string, number[]>();
  stratum.forEach((key, index) => { const list = members.get(key); if (list) list.push(index); else members.set(key, [index]); });
  const y = new Float64Array(rows.length);
  for (const list of members.values()) { const order = centered(list.map(index => rows[index]!.y)); list.forEach((index, position) => { y[index] = order[position]!; }); }
  const prepared = candidates.map(candidate => prepare(candidate, rows, stratum));
  const testable = prepared.filter(item => item.keptPairs >= SEQUENTIAL_POLICY.minPairs && item.cxSquares > 0);
  const half = rows.length >> 1;
  const facts = new Map<Prepared, { rho: number; first: number | null; second: number | null; gates: boolean }>();
  for (const item of testable) {
    const rho = statistic(item, row => y[row]!), first = halfRho(item, rows, stratum, y, 0, half), second = halfRho(item, rows, stratum, y, half, rows.length);
    const same = (value: number | null) => value !== null && Math.sign(value) === Math.sign(rho) && Math.abs(value) >= SEQUENTIAL_POLICY.strictHalfRho;
    facts.set(item, { rho, first, second, gates: item.keptPairs >= SEQUENTIAL_POLICY.strictPairs && Math.abs(rho) >= SEQUENTIAL_POLICY.strictRho
      && item.nonModal >= SEQUENTIAL_POLICY.minNonModal && same(first) && same(second) });
  }
  const contenders = testable.filter(item => facts.get(item)!.gates);
  const exceed = new Map(contenders.map(item => [item, 0])), open = new Set(contenders), stoppedAt = new Map<Prepared, number>();
  let used = 0;
  if (contenders.length) {
    const random = seededRandom(options.seed ?? SEQUENTIAL_POLICY.seed), permuted = new Float64Array(rows.length), lists = [...members.values()];
    while (used < allowed && open.size) {
      for (const list of lists) {
        const values = list.map(index => y[index]!);
        for (let i = values.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [values[i], values[j]] = [values[j]!, values[i]!]; }
        list.forEach((index, position) => { permuted[index] = values[position]!; });
      }
      used++;
      let maximum = 0;
      for (const item of testable) { const value = Math.abs(statistic(item, row => permuted[row]!)); if (value > maximum) maximum = value; }
      for (const item of open) if (maximum >= Math.abs(facts.get(item)!.rho)) { const count = exceed.get(item)! + 1; exceed.set(item, count); // It stops only once it can no longer pass: even with no further exceedance, its p over the whole run would stay above α.
        if (count >= SEQUENTIAL_POLICY.stopExceedances && (count + 1) / (allowed + 1) > alpha) { open.delete(item); stoppedAt.set(item, used); } }
    }
  }
  const items: SequentialItem[] = prepared.map(item => {
    const fact = facts.get(item);
    const base = { id: item.candidate.definition.id, pairs: item.pairs, keptPairs: item.keptPairs, rho: fact?.rho ?? null, firstHalfRho: fact?.first ?? null, secondHalfRho: fact?.second ?? null };
    const none = { permutations: 0, familyAdjustedP: null, stopped: null, passes: false };
    if (!fact) return { ...base, ...none, reason: "insufficient_data" };
    if (!fact.gates) return { ...base, ...none, reason: "gate_failed_before_permutation" };
    const at = stoppedAt.get(item);
    if (at !== undefined) {
      // At least this many exceedances out of all allowed permutations, whatever the ones it was not counted in would have said.
      const pLowerBound = (exceed.get(item)! + 1) / (allowed + 1);
      return { ...base, reason: "stopped_early", permutations: at, familyAdjustedP: null, stopped: { at, exceedances: exceed.get(item)!, pLowerBound }, passes: false };
    }
    const p = (exceed.get(item)! + 1) / (used + 1);
    return { ...base, reason: "permutation_tested", permutations: used, familyAdjustedP: p, stopped: null, passes: p <= alpha };
  });
  return { look, alpha, permutationsAllowed: allowed, permutationsUsed: used, items };
}

/**
 * The analysis of one outcome as it stands today: the last scheduled look and only the days before it. Between looks the answer
 * does not change. The look index counts only scheduled dates where some eligible candidate had enough pairs.
 */
export function sequentialAnalysis(source: InsightsSource, kind: FeelingOutcomeKind, options: { today: string; method: InsightsEngineMethod; context: ExposureContext; seed?: number; maxPermutations?: number; everyLook?: boolean }) {
  const all = prepareFeelingAssociations(source, kind, { today: options.today, method: options.method, context: options.context });
  const filtered = eligibleCandidates(all.candidates);
  if (!all.rows.length) return { kind, looks: [] as string[], current: null, history: [] as (SequentialEvaluation & { date: string })[], excluded: filtered.excluded, eligible: filtered.eligible.length };
  let look = 0, current: (SequentialEvaluation & { date: string }) | null = null;
  // Only for studying the design (`everyLook`): what each scheduled look said when it was the current one.
  const history: (SequentialEvaluation & { date: string })[] = [];
  const dates = scheduledDates(all.rows[0]!.date, options.today);
  for (const date of dates) {
    const at = date === options.today ? all : prepareFeelingAssociations(source, kind, { today: date, method: options.method, context: options.context });
    const eligible = eligibleCandidates(at.candidates).eligible;
    const days = new Set(at.rows.map(row => row.date));
    if (!eligible.some(candidate => [...candidate.values.keys()].filter(day => days.has(day)).length >= SEQUENTIAL_POLICY.minPairs)) continue;
    look++;
    if (date === dates.at(-1) || options.everyLook) {
      const evaluation = { ...evaluateSequential(at.rows, eligible, look, { seed: options.seed, maxPermutations: options.maxPermutations }), date };
      history.push(evaluation);
      if (date === dates.at(-1)) current = evaluation;
    }
  }
  return { kind, looks: dates, current, history, excluded: filtered.excluded, eligible: filtered.eligible.length };
}
