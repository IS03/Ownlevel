import { compareExposure, indexRecords } from "./comparator";
import { buildExposure, configurationKnown, contextIssue, contextKey, sameContext, uniqueRows, type ContextRule } from "./exposure";
import { INSIGHTS_PERFORMANCE_METHOD, type ComparisonOutput, type DailyPerformanceOf, type ExerciseExposure, type ExerciseOf, type ExercisePerformance, type HistoryCoverage, type PerformanceCounts, type PerformanceExclusion, type PerformanceSession, type PerformanceStatus, type SessionPerformanceOf } from "./types";

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** Reject local/naive timestamps and impossible dates instead of depending on the host timezone. */
function instant(value: string | null): bigint | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !validDate(match[1]!) || +match[2]! > 23 || +match[3]! > 59 || +match[4]! > 59) return null;
  if (match[6] !== "Z" && (+match[6]!.slice(1, 3) > 23 || +match[6]!.slice(4, 6) > 59)) return null;
  const time = Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}${match[6]}`);
  // PostgreSQL timestamps can contain microseconds. Never truncate them into false ties/order.
  return Number.isFinite(time) ? BigInt(time) * BigInt(1_000_000) + BigInt((match[5] ?? "").padEnd(9, "0")) : null;
}

function interval(session: PerformanceSession) {
  const start = instant(session.startedAt), end = instant(session.endedAt);
  return session.chronology === "verified" && start !== null && end !== null && end > start ? { start, end } : null;
}

function counts(exercises: readonly { status: PerformanceStatus }[]): PerformanceCounts {
  const improved = exercises.filter(row => row.status === "improved").length;
  const observedStable = exercises.filter(row => row.status === "observed_stable").length;
  const declined = exercises.filter(row => row.status === "declined").length;
  const comparable = improved + observedStable + declined;
  return { improved, observedStable, declined, comparable, total: exercises.length,
    ambiguous: exercises.filter(row => row.status === "ambiguous_evidence").length,
    insufficient: exercises.filter(row => row.status === "insufficient_comparison").length,
    coverage: exercises.length ? comparable / exercises.length : null };
}

type PreparedSession = { session: PerformanceSession; time: ReturnType<typeof interval>; exposures: ExerciseExposure[] };

function prepare(session: PerformanceSession, rule: ContextRule): PreparedSession {
  const groups = new Map<string, typeof session.exercises[number][]>();
  for (const block of session.exercises) {
    // PostgreSQL UUID identity is case-insensitive; display names never define identity.
    const id = block.exerciseId.toLowerCase();
    groups.set(id, [...(groups.get(id) ?? []), block]);
  }
  const duplicateBlockIds = new Set(uniqueRows(session.exercises).conflicts);
  const duplicateSetIds = new Set(uniqueRows(session.exercises.flatMap(block => block.sets)).conflicts);
  // Even identical row IDs cannot belong to different exercise identities.
  const owners = new Map<string, Set<string>>();
  for (const [exerciseId, blocks] of groups) for (const block of blocks) {
    for (const id of [`block:${block.id}`, ...block.sets.map(set => `set:${set.id}`)]) {
      const ids = owners.get(id) ?? new Set<string>();
      ids.add(exerciseId);
      owners.set(id, ids);
    }
  }
  // The two methods partition exposures: one with any known configuration belongs to the strict lane only.
  const inScope = ([, blocks]: [string, typeof session.exercises[number][]]) => rule !== "configuration_unknown" || !blocks.some(block => configurationKnown(block.context));
  const exposures = [...groups].filter(inScope).sort(([a], [b]) => a.localeCompare(b)).map(([id, blocks]) => {
    const exposure = buildExposure(session.id, id, blocks, rule);
    const conflict = blocks.some(block => duplicateBlockIds.has(block.id) || owners.get(`block:${block.id}`)!.size > 1
      || block.sets.some(set => duplicateSetIds.has(set.id) || owners.get(`set:${set.id}`)!.size > 1));
    return conflict ? { ...exposure, issue: "duplicate_conflict" as const } : exposure;
  });
  return { session, time: interval(session), exposures };
}

const usableContext = (a: ExerciseExposure, rule: ContextRule) => !!a.context && !contextIssue(a.context, rule) && a.issue !== "mixed_context" && a.issue !== "duplicate_conflict";
function compatibleContext(a: ExerciseExposure, b: ExerciseExposure, rule: ContextRule) {
  return usableContext(a, rule) && usableContext(b, rule) && sameContext(a.context!, b.context!);
}

/** One exercise's history, grouped by context: what a summary needs without visiting every earlier session per exposure. */
type ExerciseIndex = {
  candidates: PreparedSession[];
  groups: Map<string, { sessions: PreparedSession[]; ends: bigint[]; exposures: ExerciseExposure[]; records: ReturnType<typeof indexRecords> }>;
  /** Every candidate is completed, dated and in one context: nothing to exclude for an exposure of that context. */
  uniform: boolean;
};
function indexExercise(exerciseId: string, candidates: PreparedSession[], rule: ContextRule): ExerciseIndex {
  const rows = new Map<string, { row: PreparedSession; exposure: ExerciseExposure; end: bigint }[]>();
  let broken = false;
  for (const row of candidates) {
    const exposure = row.exposures.find(item => item.exerciseId === exerciseId)!;
    if (row.session.status !== "completed" || !row.time || !usableContext(exposure, rule)) { broken = true; continue; }
    const key = contextKey(exposure.context!), group = rows.get(key);
    if (group) group.push({ row, exposure, end: row.time.end }); else rows.set(key, [{ row, exposure, end: row.time.end }]);
  }
  const groups: ExerciseIndex["groups"] = new Map();
  for (const [key, group] of rows) {
    group.sort((a, b) => a.end === b.end ? a.row.session.id.localeCompare(b.row.session.id) : a.end < b.end ? -1 : 1);
    const exposures = group.map(entry => entry.exposure);
    groups.set(key, { sessions: group.map(entry => entry.row), ends: group.map(entry => entry.end), exposures, records: indexRecords(exposures) });
  }
  return { candidates, groups, uniform: !broken && groups.size <= 1 };
}

/** Same result as `evaluate` in summary mode, without its walk over the whole history. */
function evaluateIndexed(current: PreparedSession & { time: NonNullable<PreparedSession["time"]> }, exposure: ExerciseExposure, index: ExerciseIndex, historyCoverage: HistoryCoverage, rule: ContextRule, output: ComparisonOutput) {
  const group = index.groups.get(contextKey(exposure.context!));
  const exclusions: PerformanceExclusion[] = [];
  if (!index.uniform || !group) for (const candidate of index.candidates) {
    if (candidate.session.id === current.session.id) continue;
    const previous = candidate.exposures.find(item => item.exerciseId === exposure.exerciseId)!;
    let reason: PerformanceExclusion["reason"] | null = null;
    if (candidate.session.status !== "completed") reason = "session_not_completed";
    else if (!candidate.time) reason = "uncertain_chronology";
    else if (candidate.time.end >= current.time.start) continue;
    else if (!compatibleContext(exposure, previous, rule)) reason = previous.issue ?? "different_context";
    if (reason) exclusions.push({ reason, sessionId: candidate.session.id, exerciseId: exposure.exerciseId });
  }
  // How many of the group ended before this session started.
  let count = 0;
  if (group) { let low = 0, high = group.ends.length; while (low < high) { const middle = (low + high) >> 1; if (group.ends[middle]! < current.time.start) low = middle + 1; else high = middle; } count = low; }
  let reference: ExercisePerformance["reference"] = null;
  let missingReason: ExercisePerformance["reason"] = "no_compatible_reference";
  if (historyCoverage === "unavailable") missingReason = "history_unavailable";
  else if (count) {
    const top = group!.ends[count - 1]!;
    let first = count - 1;
    while (first > 0 && group!.ends[first - 1] === top) first--;
    if (count - first > 1) {
      missingReason = "reference_order_uncertain";
      for (let at = first; at < count; at++) exclusions.push({ reason: "reference_order_uncertain", sessionId: group!.sessions[at]!.session.id, exerciseId: exposure.exerciseId });
    } else reference = { sessionId: group!.sessions[first]!.session.id, endedAt: group!.sessions[first]!.session.endedAt!, ageMs: Number(current.time.start - top) / 1_000_000, exposure: group!.exposures[first]! };
  }
  if (exposure.issue) exclusions.push({ reason: exposure.issue, sessionId: current.session.id, exerciseId: exposure.exerciseId, rowIds: exposure.blockIds });
  if (reference?.exposure.issue) exclusions.push({ reason: reference.exposure.issue, sessionId: reference.sessionId, exerciseId: exposure.exerciseId, rowIds: reference.exposure.blockIds });
  return compareExposure({ current: exposure, reference, history: [], records: group ? group.records.facts(exposure, count) : [], historyCoverage, exclusions, missingReason }, output);
}

function evaluate(current: PreparedSession, exposure: ExerciseExposure, candidates: readonly PreparedSession[], historyCoverage: HistoryCoverage, exclusionDetail: "full" | "summary", rule: ContextRule, output: ComparisonOutput, index?: ExerciseIndex) {
  // Same result without one row per earlier session: this exposure cannot match any of them, so it never has a reference.
  if (exclusionDetail === "summary" && !usableContext(exposure, rule)) return compareExposure({ current: exposure, reference: null, history: [], historyCoverage,
    exclusions: exposure.issue ? [{ reason: exposure.issue, sessionId: current.session.id, exerciseId: exposure.exerciseId, rowIds: exposure.blockIds }] : [], missingReason: "no_compatible_reference" }, output);
  if (exclusionDetail === "summary" && index && current.time) return evaluateIndexed(current as PreparedSession & { time: NonNullable<PreparedSession["time"]> }, exposure, index, historyCoverage, rule, output);
  const exclusions: PerformanceExclusion[] = [];
  const eligible: Array<{ session: PerformanceSession; end: bigint; exposure: ExerciseExposure }> = [];
  for (const candidate of candidates) {
    if (candidate.session.id === current.session.id) continue;
    const previous = candidate.exposures.find(item => item.exerciseId === exposure.exerciseId)!;
    let reason: PerformanceExclusion["reason"] | null = null;
    if (candidate.session.status !== "completed") reason = "session_not_completed";
    else if (!candidate.time) reason = "uncertain_chronology";
    else if (!current.time || candidate.time.end >= current.time.start) reason = "not_before_start";
    else if (!compatibleContext(exposure, previous, rule)) reason = previous.issue ?? "different_context";
    // Over a whole history every later session would add a row per exposure. It never was a candidate for this reference.
    if (reason === "not_before_start" && exclusionDetail === "summary" && current.time) continue;
    if (reason) exclusions.push({ reason, sessionId: candidate.session.id, exerciseId: exposure.exerciseId });
    else eligible.push({ session: candidate.session, end: candidate.time!.end, exposure: previous });
  }
  eligible.sort((a, b) => a.end === b.end ? a.session.id.localeCompare(b.session.id) : a.end > b.end ? -1 : 1);
  let reference: ExercisePerformance["reference"] = null;
  let missingReason: ExercisePerformance["reason"] = "no_compatible_reference";
  if (!current.time) missingReason = "uncertain_chronology";
  else if (historyCoverage === "unavailable") missingReason = "history_unavailable";
  else if (eligible[0]) {
    if (eligible[1]?.end === eligible[0].end) {
      missingReason = "reference_order_uncertain";
      exclusions.push(...eligible.filter(row => row.end === eligible[0]!.end).map(row => ({
        reason: "reference_order_uncertain" as const, sessionId: row.session.id, exerciseId: exposure.exerciseId,
      })));
    } else reference = { sessionId: eligible[0].session.id, endedAt: eligible[0].session.endedAt!,
      ageMs: Number(current.time.start - eligible[0].end) / 1_000_000, exposure: eligible[0].exposure };
  }
  if (exposure.issue) exclusions.push({ reason: exposure.issue, sessionId: current.session.id, exerciseId: exposure.exerciseId, rowIds: exposure.blockIds });
  if (reference?.exposure.issue) exclusions.push({ reason: reference.exposure.issue, sessionId: reference.sessionId, exerciseId: exposure.exerciseId, rowIds: reference.exposure.blockIds });
  return compareExposure({ current: exposure, reference, history: eligible.map(row => row.exposure), historyCoverage, exclusions, missingReason }, output);
}

/** Candidate aggregation only. Receives one result per genuine session from the kernel. */
function aggregateDays<E extends { status: PerformanceStatus }>(sessions: SessionPerformanceOf<E>[]): DailyPerformanceOf<E>[] {
  const byDate = new Map<string, SessionPerformanceOf<E>[]>();
  for (const session of sessions) {
    if (session.date) byDate.set(session.date, [...(byDate.get(session.date) ?? []), session]);
  }
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => {
    const composition = counts(rows.flatMap(row => row.exercises));
    const evaluable = rows.filter(row => row.counts.comparable > 0);
    return { methodVersion: INSIGHTS_PERFORMANCE_METHOD, date, sessions: rows, counts: composition,
      evaluableSessions: evaluable.length,
      candidateDeclineProportion: composition.comparable ? composition.declined / composition.comparable : null,
      equalSessionWeightSensitivity: evaluable.length
        ? evaluable.reduce((sum, row) => sum + row.counts.declined / row.counts.comparable, 0) / evaluable.length : null,
      exclusions: rows.flatMap(row => row.exclusions),
    };
  });
}

/**
 * `output: "compact"` keeps the classification and drops what only describes it (see CompactExercisePerformance). The walk,
 * the references, the records and every exclusion are the same: only what is handed over changes. The default is "full".
 */
export type ComparisonInput<O extends ComparisonOutput = "full"> = { sessions: readonly PerformanceSession[]; historyCoverage: HistoryCoverage; exclusionDetail?: "full" | "summary"; output?: O };
export type PerformanceComparison<E> = {
  methodVersion: typeof INSIGHTS_PERFORMANCE_METHOD; historyCoverage: HistoryCoverage; integrity: "valid" | "conflicting_duplicates"; deduplicatedSessions: number;
  sessions: SessionPerformanceOf<E>[]; days: DailyPerformanceOf<E>[]; exclusions: PerformanceExclusion[];
};

/** Pure shared entrypoint for future Web/API consumers. No I/O, clock, catalog fallback or legacy adoption. */
export function buildPerformanceInsightsV1<O extends ComparisonOutput = "full">(input: ComparisonInput<O>) {
  return compareSessions(input, "configuration_required");
}

/** Shared by both methods, which differ only in the context rule. `partial.ts` relabels every row before it leaves the kernel. */
export function compareSessions<O extends ComparisonOutput = "full">(input: ComparisonInput<O>, rule: ContextRule, indexed = true): PerformanceComparison<ExerciseOf<O>> {
  type Exercise = ExerciseOf<O>;
  const output: ComparisonOutput = input.output ?? "full";
  const unique = uniqueRows(input.sessions);
  const exclusions: PerformanceExclusion[] = unique.conflicts.map(sessionId => ({ reason: "duplicate_conflict", sessionId }));
  // Contradictory session versions cannot silently disappear from a day's denominator or reference history.
  if (unique.conflicts.length) return { methodVersion: INSIGHTS_PERFORMANCE_METHOD, historyCoverage: input.historyCoverage,
    integrity: "conflicting_duplicates" as const, deduplicatedSessions: unique.deduplicated,
    sessions: [] as SessionPerformanceOf<Exercise>[], days: [] as DailyPerformanceOf<Exercise>[], exclusions };
  const prepared = unique.unique.map(session => prepare(session, rule));
  // Normalize source rows once. Only sessions containing the same UUID are reference candidates.
  const byExercise = new Map<string, PreparedSession[]>();
  for (const row of prepared) for (const exposure of row.exposures) {
    const rows = byExercise.get(exposure.exerciseId);
    if (rows) rows.push(row); else byExercise.set(exposure.exerciseId, [row]);
  }
  const indexes = new Map<string, ExerciseIndex>();
  const indexOf = (exerciseId: string) => {
    let index = indexes.get(exerciseId);
    if (!index) { index = indexExercise(exerciseId, byExercise.get(exerciseId)!, rule); indexes.set(exerciseId, index); }
    return index;
  };
  const sessions: SessionPerformanceOf<Exercise>[] = [];
  for (const current of prepared) {
    if (current.session.status !== "completed") {
      exclusions.push({ reason: "session_not_completed", sessionId: current.session.id });
      continue;
    }
    const detail = input.exclusionDetail ?? "full";
    const exercises = current.exposures.map(exposure => evaluate(current, exposure, byExercise.get(exposure.exerciseId)!, input.historyCoverage, detail, rule, output, detail === "summary" && indexed ? indexOf(exposure.exerciseId) : undefined)) as Exercise[];
    const sessionExclusions = exercises.flatMap(exercise => exercise.exclusions);
    if (!current.time) sessionExclusions.push({ reason: "uncertain_chronology", sessionId: current.session.id });
    const date = validDate(current.session.date) ? current.session.date : null;
    if (!date) sessionExclusions.push({ reason: "invalid_logical_date", sessionId: current.session.id });
    sessions.push({ methodVersion: INSIGHTS_PERFORMANCE_METHOD, sessionId: current.session.id, date,
      routineId: current.session.routineId, exercises, counts: counts(exercises), exclusions: sessionExclusions });
  }
  sessions.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.sessionId.localeCompare(b.sessionId));
  return { methodVersion: INSIGHTS_PERFORMANCE_METHOD, historyCoverage: input.historyCoverage,
    integrity: "valid" as const, deduplicatedSessions: unique.deduplicated, sessions, days: aggregateDays(sessions), exclusions };
}
