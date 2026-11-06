import { buildPerformanceInsightsPartialV1, buildPerformanceInsightsV1 } from "../performance-insights";
import type { ExclusionReason, ExerciseExposure, ExercisePerformance } from "../performance-insights/types";
import { INSIGHTS_CONTRACT, INSIGHTS_ENGINE_METHOD, INSIGHTS_ENGINE_METHOD_V2, INSIGHTS_ENGINE_PARTIAL_METHOD, INSIGHTS_ENGINE_PARTIAL_METHOD_V2, type EvidenceSide, type ExerciseEvidence, type InsightsEngineMethod, type InsightsExerciseEvidence, type InsightsSource } from "./types";
import { toPerformanceSessions } from "./source-adapter";

const DAY_MS = 86_400_000;
export type EvidenceLane = "strict" | "partial";

/**
 * Only the sessions that hold this exercise: the shared comparator takes its reference candidates from them alone, and nothing
 * else in a session changes how one exercise is prepared. The loader reads this subset; tests prove it decides as the whole history.
 */
export function exerciseSubset(source: InsightsSource, exerciseId: string): InsightsSource {
  const id = exerciseId.toLowerCase();
  const exercises = source.exercises.filter(row => row.exerciseId.toLowerCase() === id);
  const sessionIds = new Set(exercises.map(row => row.sessionId)), rowIds = new Set(exercises.map(row => row.id));
  return { ...source, sessions: source.sessions.filter(row => sessionIds.has(row.id)), exercises, sets: source.sets.filter(row => rowIds.has(row.sessionExerciseId)),
    feelings: [], metricDefinitions: [], metricValues: [], meals: [] };
}

type Rows = { dates: ReadonlyMap<string, string | null>; blocks: ReadonlyMap<string, InsightsSource["exercises"][number]>; setsOf: ReadonlyMap<string, InsightsSource["sets"][number][]> };
/**
 * The comparator keeps only the completed sets of an exposure. The detail lists every recorded set of its blocks, read from the same
 * rows with the same fields the comparator was given (`toPerformanceSessions`), so a set left out is still seen and said why.
 */
const side = (exposure: ExerciseExposure, rows: Rows): EvidenceSide => ({ sessionId: exposure.sessionId, date: rows.dates.get(exposure.sessionId) ?? null,
  sets: exposure.blockIds.flatMap(blockId => (rows.setsOf.get(blockId) ?? []).map(set => ({ id: set.id, blockId, blockOrder: rows.blocks.get(blockId)?.order ?? null,
    setNumber: set.setNumber ?? null, completed: set.isCompleted, amount: set.actualReps, load: set.actualLoad }))).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  excludedSetIds: [...exposure.excludedSetIds] });

function evidenceOf(row: Pick<ExercisePerformance, "reason" | "current" | "reference" | "evidence" | "records" | "exclusions">, name: string, dates: Rows): Omit<ExerciseEvidence, "status" | "reading"> {
  const exclusions: Partial<Record<ExclusionReason, number>> = {};
  for (const exclusion of row.exclusions) exclusions[exclusion.reason] = (exclusions[exclusion.reason] ?? 0) + 1;
  return { name, reason: row.reason, context: row.current.context ? { ...row.current.context } : null, current: side(row.current, dates),
    reference: row.reference ? { ...side(row.reference.exposure, dates), ageDays: Math.floor(row.reference.ageMs / DAY_MS) } : null,
    evidence: row.evidence.map(signal => ({ ...signal, currentSetIds: [...signal.currentSetIds], referenceSetIds: [...signal.referenceSetIds] })),
    records: row.records.facts.map(fact => ({ ...fact })), exclusions };
}

/**
 * The comparison Insights published for one exercise of one session, with what it rests on: the same comparator, the same method
 * and the same reference. Nothing is reclassified here, and no volume, percentage or estimated maximum is added.
 */
export function insightsExerciseEvidence(source: InsightsSource, selection: { sessionId: string; exerciseId: string; lane: EvidenceLane },
  options: { today: string; revision?: string; method?: InsightsEngineMethod }): InsightsExerciseEvidence {
  const method = options.method ?? 1;
  const sessions = toPerformanceSessions(source).sessions;
  const input = { sessions, historyCoverage: "complete" as const, exclusionDetail: "summary" as const };
  const strict = buildPerformanceInsightsV1(input);
  const setsOf = new Map<string, InsightsSource["sets"][number][]>();
  for (const set of source.sets) setsOf.set(set.sessionExerciseId, [...(setsOf.get(set.sessionExerciseId) ?? []), set]);
  const dates: Rows = { dates: new Map(source.sessions.map(row => [row.id, row.date])), blocks: new Map(source.exercises.map(row => [row.id, row])), setsOf };
  const sessionId = selection.sessionId.toLowerCase(), exerciseId = selection.exerciseId.toLowerCase();
  const name = source.exercises.find(row => row.sessionId.toLowerCase() === sessionId && row.exerciseId.toLowerCase() === exerciseId)?.name ?? "";
  const header = { view: "evidence" as const, contractVersion: INSIGHTS_CONTRACT, methodVersion: method === 2 ? INSIGHTS_ENGINE_METHOD_V2 : INSIGHTS_ENGINE_METHOD,
    performanceMethodVersion: strict.methodVersion, today: options.today, integrity: strict.integrity, sourceRevision: options.revision ?? "",
    lane: selection.lane, sessionId: selection.sessionId, exerciseId: selection.exerciseId };
  if (selection.lane === "strict") {
    const row = strict.sessions.find(session => session.sessionId.toLowerCase() === sessionId)?.exercises.find(exercise => exercise.exerciseId === exerciseId);
    return { ...header, item: row ? { ...evidenceOf(row, name, dates), status: row.status } : null };
  }
  const partial = buildPerformanceInsightsPartialV1(input);
  const row = partial.sessions.find(session => session.sessionId.toLowerCase() === sessionId)?.exercises.find(exercise => exercise.exerciseId === exerciseId);
  return { ...header, partial: { methodVersion: partial.methodVersion, engineMethodVersion: method === 2 ? INSIGHTS_ENGINE_PARTIAL_METHOD_V2 : INSIGHTS_ENGINE_PARTIAL_METHOD,
    contextCompleteness: partial.contextCompleteness, integrity: partial.integrity },
  item: row ? { ...evidenceOf(row, name, dates), reading: row.reading } : null };
}
