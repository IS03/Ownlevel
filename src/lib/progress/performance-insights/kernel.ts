import { compareExposure } from "./comparator";
import { buildExposure, contextIssue, sameContext, uniqueRows } from "./exposure";
import { INSIGHTS_PERFORMANCE_METHOD, type DailyPerformance, type ExerciseExposure, type ExercisePerformance, type HistoryCoverage, type PerformanceCounts, type PerformanceExclusion, type PerformanceSession, type SessionPerformance } from "./types";

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

function counts(exercises: readonly ExercisePerformance[]): PerformanceCounts {
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

function prepare(session: PerformanceSession): PreparedSession {
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
  const exposures = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([id, blocks]) => {
    const exposure = buildExposure(session.id, id, blocks);
    const conflict = blocks.some(block => duplicateBlockIds.has(block.id) || owners.get(`block:${block.id}`)!.size > 1
      || block.sets.some(set => duplicateSetIds.has(set.id) || owners.get(`set:${set.id}`)!.size > 1));
    return conflict ? { ...exposure, issue: "duplicate_conflict" as const } : exposure;
  });
  return { session, time: interval(session), exposures };
}

const usableContext = (a: ExerciseExposure) => !!a.context && !contextIssue(a.context) && a.issue !== "mixed_context" && a.issue !== "duplicate_conflict";
function compatibleContext(a: ExerciseExposure, b: ExerciseExposure) {
  return usableContext(a) && usableContext(b) && sameContext(a.context!, b.context!);
}

function evaluate(current: PreparedSession, exposure: ExerciseExposure, candidates: readonly PreparedSession[], historyCoverage: HistoryCoverage, exclusionDetail: "full" | "summary") {
  // Same result without one row per earlier session: this exposure cannot match any of them, so it never has a reference.
  if (exclusionDetail === "summary" && !usableContext(exposure)) return compareExposure({ current: exposure, reference: null, history: [], historyCoverage,
    exclusions: exposure.issue ? [{ reason: exposure.issue, sessionId: current.session.id, exerciseId: exposure.exerciseId, rowIds: exposure.blockIds }] : [], missingReason: "no_compatible_reference" });
  const exclusions: PerformanceExclusion[] = [];
  const eligible: Array<{ session: PerformanceSession; end: bigint; exposure: ExerciseExposure }> = [];
  for (const candidate of candidates) {
    if (candidate.session.id === current.session.id) continue;
    const previous = candidate.exposures.find(item => item.exerciseId === exposure.exerciseId)!;
    let reason: PerformanceExclusion["reason"] | null = null;
    if (candidate.session.status !== "completed") reason = "session_not_completed";
    else if (!candidate.time) reason = "uncertain_chronology";
    else if (!current.time || candidate.time.end >= current.time.start) reason = "not_before_start";
    else if (!compatibleContext(exposure, previous)) reason = previous.issue ?? "different_context";
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
  return compareExposure({ current: exposure, reference, history: eligible.map(row => row.exposure), historyCoverage, exclusions, missingReason });
}

/** Candidate aggregation only. Receives one result per genuine session from the kernel. */
function aggregateDays(sessions: SessionPerformance[]): DailyPerformance[] {
  const byDate = new Map<string, SessionPerformance[]>();
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

/** Pure shared entrypoint for future Web/API consumers. No I/O, clock, catalog fallback or legacy adoption. */
export function buildPerformanceInsightsV1(input: { sessions: readonly PerformanceSession[]; historyCoverage: HistoryCoverage; exclusionDetail?: "full" | "summary" }) {
  const unique = uniqueRows(input.sessions);
  const exclusions: PerformanceExclusion[] = unique.conflicts.map(sessionId => ({ reason: "duplicate_conflict", sessionId }));
  // Contradictory session versions cannot silently disappear from a day's denominator or reference history.
  if (unique.conflicts.length) return { methodVersion: INSIGHTS_PERFORMANCE_METHOD, historyCoverage: input.historyCoverage,
    integrity: "conflicting_duplicates" as const, deduplicatedSessions: unique.deduplicated,
    sessions: [] as SessionPerformance[], days: [] as DailyPerformance[], exclusions };
  const prepared = unique.unique.map(prepare);
  // Normalize source rows once. Only sessions containing the same UUID are reference candidates.
  const byExercise = new Map<string, PreparedSession[]>();
  for (const row of prepared) for (const exposure of row.exposures) {
    const rows = byExercise.get(exposure.exerciseId);
    if (rows) rows.push(row); else byExercise.set(exposure.exerciseId, [row]);
  }
  const sessions: SessionPerformance[] = [];
  for (const current of prepared) {
    if (current.session.status !== "completed") {
      exclusions.push({ reason: "session_not_completed", sessionId: current.session.id });
      continue;
    }
    const exercises = current.exposures.map(exposure => evaluate(current, exposure, byExercise.get(exposure.exerciseId)!, input.historyCoverage, input.exclusionDetail ?? "full"));
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
