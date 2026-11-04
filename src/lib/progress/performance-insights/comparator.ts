import { normalizeWeightMode, weightModeStrategy } from "../../mobile-api/weight-modes";
import { sameContext, volumeFact } from "./exposure";
import { INSIGHTS_PERFORMANCE_METHOD, type DirectEvidence, type ExerciseExposure, type ExercisePerformance, type HistoryCoverage, type PerformanceSet, type RecordFact } from "./types";

function maxima(sets: PerformanceSet[], anchor: "load" | "amount", value: "load" | "amount") {
  const result = new Map<number, { value: number; ids: string[] }>();
  for (const set of sets) {
    const key = set[anchor]!;
    const previous = result.get(key);
    if (!previous || set[value]! > previous.value) result.set(key, { value: set[value]!, ids: [set.id] });
    else if (set[value] === previous.value) previous.ids.push(set.id);
  }
  return result;
}

function directEvidence(current: ExerciseExposure, reference: ExerciseExposure): { evidence: DirectEvidence[]; unanchored: boolean } {
  const strategy = weightModeStrategy(normalizeWeightMode(current.context!.weightMode));
  if (strategy === "bodyweight_reps" || strategy === "time") {
    const best = (sets: PerformanceSet[]) => Math.max(...sets.map(set => set.amount!));
    const a = best(current.sets), b = best(reference.sets);
    return { evidence: [{ kind: strategy === "time" ? "time" : "bodyweight_reps", anchor: null,
      current: a, reference: b, delta: a - b,
      currentSetIds: current.sets.filter(set => set.amount === a).map(set => set.id),
      referenceSetIds: reference.sets.filter(set => set.amount === b).map(set => set.id) }], unanchored: false };
  }
  const evidence: DirectEvidence[] = [];
  for (const [anchor, value, kind] of [
    ["load", "amount", "reps_at_load"], ["amount", "load", "load_at_reps"],
  ] as const) {
    const a = maxima(current.sets, anchor, value), b = maxima(reference.sets, anchor, value);
    for (const key of [...a.keys()].sort((x, y) => x - y)) {
      // Zero realized reps remains a fact, but lifting more load for zero reps proves no improvement.
      if (kind === "load_at_reps" && key === 0) continue;
      const left = a.get(key)!, right = b.get(key);
      if (right) evidence.push({ kind, anchor: key, current: left.value, reference: right.value,
        delta: left.value - right.value, currentSetIds: left.ids, referenceSetIds: right.ids });
    }
  }
  const anchored = (set: PerformanceSet, other: PerformanceSet[]) => other.some(row => row.load === set.load || (set.amount !== 0 && row.amount === set.amount));
  return { evidence, unanchored: current.sets.some(set => !anchored(set, reference.sets)) || reference.sets.some(set => !anchored(set, current.sets)) };
}

function recordFacts(current: ExerciseExposure, history: readonly ExerciseExposure[]): RecordFact[] {
  if (current.issue || !current.context) return [];
  const sets = history.filter(item => !item.issue && item.context && sameContext(current.context!, item.context)).flatMap(item => item.sets);
  if (!sets.length) return [];
  const strategy = weightModeStrategy(normalizeWeightMode(current.context.weightMode));
  const max = (rows: PerformanceSet[], field: "load" | "amount") => Math.max(...rows.map(row => row[field]!));
  if (strategy === "bodyweight_reps" || strategy === "time") {
    const value = max(current.sets, "amount"), previous = max(sets, "amount");
    return [{ kind: strategy === "time" ? "time" : "bodyweight_reps", anchor: null, current: value, previousMaximum: previous, isNewHigh: value > previous }];
  }
  const realizedCurrent = current.sets.filter(set => set.amount! > 0), realizedPrevious = sets.filter(set => set.amount! > 0);
  const facts: RecordFact[] = [];
  if (realizedCurrent.length && realizedPrevious.length) {
    const value = max(realizedCurrent, "load"), previous = max(realizedPrevious, "load");
    facts.push({ kind: "load", anchor: null, current: value, previousMaximum: previous, isNewHigh: value > previous });
  }
  for (const [load, entry] of maxima(current.sets, "load", "amount")) {
    const previousAtLoad = sets.filter(set => set.load === load);
    if (previousAtLoad.length) {
      const previousMaximum = max(previousAtLoad, "amount");
      facts.push({ kind: "reps_at_load", anchor: load, current: entry.value, previousMaximum, isNewHigh: entry.value > previousMaximum });
    }
  }
  return facts;
}

/** Internal exposure comparator. Chronology and reference selection belong to the shared session kernel. */
export function compareExposure(input: {
  current: ExerciseExposure;
  reference: ExercisePerformance["reference"];
  history: readonly ExerciseExposure[];
  historyCoverage: HistoryCoverage;
  exclusions: ExercisePerformance["exclusions"];
  missingReason: ExercisePerformance["reason"];
}): ExercisePerformance {
  const { current, reference } = input;
  const result: ExercisePerformance = {
    methodVersion: INSIGHTS_PERFORMANCE_METHOD, exerciseId: current.exerciseId,
    status: "insufficient_comparison", reason: current.issue ?? input.missingReason,
    current, reference, evidence: [],
    records: { scope: "provided_compatible_history", historyCoverage: input.historyCoverage,
      facts: input.historyCoverage === "unavailable" ? [] : recordFacts(current, input.history) },
    volume: { current: volumeFact(current), reference: reference ? volumeFact(reference.exposure) : null },
    exclusions: input.exclusions,
  };
  if (current.issue || !reference) return result;
  if (reference.exposure.issue) return { ...result, reason: reference.exposure.issue };
  const { evidence, unanchored } = directEvidence(current, reference.exposure);
  const up = evidence.some(signal => signal.delta > 0), down = evidence.some(signal => signal.delta < 0);
  result.evidence = evidence;
  if (up && down) return { ...result, status: "ambiguous_evidence", reason: "crossed_signals" };
  // Neither an unanchored tradeoff nor the absence of a direct signal establishes stability.
  if (unanchored || !evidence.length) return { ...result, status: "ambiguous_evidence", reason: "unanchored_evidence" };
  return { ...result, status: up ? "improved" : down ? "declined" : "observed_stable", reason: "direct_evidence" };
}
