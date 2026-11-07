import { buildPerformanceInsightsPartialV1, buildPerformanceInsightsV1 } from "../performance-insights";
import type { PartialCounts, PartialExerciseOf, PartialSessionOf } from "../performance-insights/partial";
import type { CompactExercisePerformance, PerformanceCounts, PerformanceSession, SessionPerformanceOf } from "../performance-insights/types";
import { evaluateAssociations, type AssociationEvaluation } from "./associations";
import { buildExposureContext, buildExposureTable, partialOutcomeDays, strictOutcomeDays, weightOfDay, type ExposureTable } from "./exposures";
import { describeFeelingOutcome, FEELING_OUTCOME_KINDS } from "./feeling-outcomes";
import { mealTimeEvidence, toPerformanceSessions } from "./source-adapter";
import { INSIGHTS_CONTRACT, INSIGHTS_ENGINE_METHOD, INSIGHTS_ENGINE_METHOD_V2, INSIGHTS_ENGINE_PARTIAL_METHOD, INSIGHTS_ENGINE_PARTIAL_METHOD_V2, type InsightsEngineMethod, type InsightsFeelingOutcomes, type SleepNightEvidence, INSIGHTS_RISK_BUDGET_CANDIDATE, PARTIAL_ASSOCIATION_PREFIX, type AssociationResult, type Candidate, type DayFact, type ExerciseFact, type ExerciseSummary, type InsightsDaysPage, type InsightsReadModel, type InsightsRelationDetail, type InsightsRelations, type InsightsSource, type InsightsSummary, type MealTimeEvidence, type PartialAssociationResult, type PartialDayFact, type PartialExerciseFact, type PartialExerciseSummary, type PartialLane, type PartialRelationSummary, type RelationSummary, type SessionFact } from "./types";

export const INSIGHTS_DEFAULT_DAYS = 14;
export const INSIGHTS_MAX_DAYS = 120;
const emptyCounts = (): PerformanceCounts => ({ improved: 0, observedStable: 0, declined: 0, ambiguous: 0, insufficient: 0, total: 0, comparable: 0, coverage: null });
const DAY_MS = 86_400_000;

/**
 * What the read model keeps of a comparator's session: its published facts. The comparator's evidence, records, volumes and
 * per-exercise exposures stay inside it and become garbage as soon as these are taken (see factsOfStrict, factsOfPartial).
 */
type FactSession<E> = { sessionId: string; date: string | null; routineId: string | null; counts: E extends ExerciseFact ? PerformanceCounts : PartialCounts; exercises: E[] };
const nameOf = (names: ReadonlyMap<string, string>, sessionId: string, exerciseId: string) => names.get(`${sessionId}:${exerciseId}`);

/**
 * The strict comparator, reduced to what is published. It asks for the compact output: the same classification, references and
 * records, without the exposures, evidence and volumes that Insights never shows. Each session is reduced once.
 */
function factsOfStrict(sessions: readonly PerformanceSession[], names: ReadonlyMap<string, string>, dates: ReadonlyMap<string, string | null>) {
  const performance = buildPerformanceInsightsV1({ sessions, historyCoverage: "complete", exclusionDetail: "summary", output: "compact" });
  const reduced = new Map<SessionPerformanceOf<CompactExercisePerformance>, FactSession<ExerciseFact>>();
  const reduce = (session: SessionPerformanceOf<CompactExercisePerformance>) => {
    let row = reduced.get(session);
    if (!row) reduced.set(session, row = { sessionId: session.sessionId, date: session.date, routineId: session.routineId, counts: session.counts,
      exercises: session.exercises.map((exercise): ExerciseFact => ({ exerciseId: exercise.exerciseId, name: nameOf(names, session.sessionId, exercise.exerciseId) ?? "",
        status: exercise.status, reason: exercise.reason, referenceSessionId: exercise.reference?.sessionId ?? null,
        referenceAgeDays: exercise.reference ? Math.floor(exercise.reference.ageMs / DAY_MS) : null, referenceDate: exercise.reference ? dates.get(exercise.reference.sessionId) ?? null : null,
        newHigh: exercise.records.some(fact => fact.isNewHigh) })) });
    return row;
  };
  return { methodVersion: performance.methodVersion, integrity: performance.integrity, exclusionReasons: performance.exclusions.map(row => row.reason),
    sessions: performance.sessions.map(reduce),
    days: performance.days.map(day => ({ date: day.date, counts: day.counts, evaluableSessions: day.evaluableSessions, candidateDeclineProportion: day.candidateDeclineProportion,
      equalSessionWeightSensitivity: day.equalSessionWeightSensitivity, sessions: day.sessions.map(reduce) })) };
}
/** The partial comparator, reduced the same way. */
function factsOfPartial(sessions: readonly PerformanceSession[], names: ReadonlyMap<string, string>, dates: ReadonlyMap<string, string | null>) {
  const partial = buildPerformanceInsightsPartialV1({ sessions, historyCoverage: "complete", exclusionDetail: "summary", output: "compact" });
  const reduced = new Map<PartialSessionOf<CompactExercisePerformance>, FactSession<PartialExerciseFact>>();
  const reduce = (session: PartialSessionOf<CompactExercisePerformance>) => {
    let row = reduced.get(session);
    if (!row) reduced.set(session, row = { sessionId: session.sessionId, date: session.date, routineId: session.routineId, counts: session.counts,
      exercises: session.exercises.map(exercise => partialFact(exercise, nameOf(names, session.sessionId, exercise.exerciseId) ?? "", dates)) });
    return row;
  };
  return { methodVersion: partial.methodVersion, contextCompleteness: partial.contextCompleteness, integrity: partial.integrity, partition: partial.partition,
    exclusionReasons: partial.exclusions.map(row => row.reason), sessions: partial.sessions.map(reduce),
    days: partial.days.map(day => ({ date: day.date, counts: day.counts, evaluableSessions: day.evaluableSessions, candidateLowerProportion: day.candidateLowerProportion,
      equalSessionWeightSensitivity: day.equalSessionWeightSensitivity, sessions: day.sessions.map(reduce) })) };
}

function exerciseSummaries(sessions: readonly FactSession<ExerciseFact>[], names: ReadonlyMap<string, string>): ExerciseSummary[] {
  const summaries = new Map<string, ExerciseSummary>();
  // Sessions arrive by logical date, so the last row of each exercise is its latest exposure.
  for (const session of sessions) for (const exercise of session.exercises) {
    const row = summaries.get(exercise.exerciseId) ?? { exerciseId: exercise.exerciseId, name: names.get(`${session.sessionId}:${exercise.exerciseId}`) ?? "",
      exposures: 0, improved: 0, observedStable: 0, declined: 0, ambiguous: 0, insufficient: 0, lastDate: null, lastStatus: exercise.status, lastReason: exercise.reason };
    row.exposures++;
    if (exercise.status === "improved") row.improved++;
    else if (exercise.status === "observed_stable") row.observedStable++;
    else if (exercise.status === "declined") row.declined++;
    else if (exercise.status === "ambiguous_evidence") row.ambiguous++;
    else row.insufficient++;
    row.lastDate = session.date; row.lastStatus = exercise.status; row.lastReason = exercise.reason;
    row.name = names.get(`${session.sessionId}:${exercise.exerciseId}`) ?? row.name;
    summaries.set(exercise.exerciseId, row);
  }
  return [...summaries.values()].sort((a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? "") || a.exerciseId.localeCompare(b.exerciseId));
}

function partialSummaries(sessions: readonly FactSession<PartialExerciseFact>[], names: ReadonlyMap<string, string>): PartialExerciseSummary[] {
  const summaries = new Map<string, PartialExerciseSummary>();
  for (const session of sessions) for (const exercise of session.exercises) {
    const name = names.get(`${session.sessionId}:${exercise.exerciseId}`);
    const row = summaries.get(exercise.exerciseId) ?? { exerciseId: exercise.exerciseId, name: name ?? "", exposures: 0, higher: 0, same: 0, lower: 0, ambiguous: 0, insufficient: 0, lastDate: null, lastReading: exercise.reading, lastReason: exercise.reason };
    row.exposures++;
    if (exercise.reading === "higher_record") row.higher++;
    else if (exercise.reading === "same_record") row.same++;
    else if (exercise.reading === "lower_record") row.lower++;
    else if (exercise.reading === "ambiguous_evidence") row.ambiguous++;
    else row.insufficient++;
    row.lastDate = session.date; row.lastReading = exercise.reading; row.lastReason = exercise.reason; row.name = name ?? row.name;
    summaries.set(exercise.exerciseId, row);
  }
  return [...summaries.values()].sort((a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? "") || a.exerciseId.localeCompare(b.exerciseId));
}

const partialFact = (exercise: PartialExerciseOf<CompactExercisePerformance>, name: string, dates: ReadonlyMap<string, string | null>): PartialExerciseFact => ({ exerciseId: exercise.exerciseId, name, reading: exercise.reading, reason: exercise.reason,
  referenceSessionId: exercise.reference?.sessionId ?? null, referenceAgeDays: exercise.reference ? Math.floor(exercise.reference.ageMs / DAY_MS) : null,
  referenceDate: exercise.reference ? dates.get(exercise.reference.sessionId) ?? null : null,
  highestInPartialContext: exercise.records.some(fact => fact.isNewHigh) });

const publish = (item: AssociationEvaluation): AssociationResult => { const published: Omit<AssociationEvaluation, "strictGate"> & { strictGate?: boolean } = { ...item }; delete published.strictGate; return published; };
/**
 * The same gate cannot say the same thing here. An unrecorded change of variant tied to the exposure passes it most of the time
 * (see the method's calibration), so a pass only means the two coincided, and it is published as that.
 */
const publishPartial = (item: AssociationEvaluation): PartialAssociationResult => ({ ...publish(item),
  state: item.state === "exploratory" ? "coincidence_context_unknown" : item.state,
  reason: item.reason === "passes_exploratory_gate" ? "coincides_context_unknown" : item.reason, contextCompleteness: "configuration_unknown" });

type Lane<T> = {
  /** Lazy: the permutations are the dominant cost, and neither the first screen nor a page of days needs them. */
  evaluate: () => { items: T[]; testable: number; permutations: number };
  candidates: readonly Candidate[]; rows: ExposureTable["rows"]; sessionIdsByDate: ExposureTable["sessionIdsByDate"];
};
/**
 * Holds only what its relations need. The rest of the exposure table (nutrition, metrics, feelings and meal windows by day)
 * is already copied into the published days, so a snapshot kept for reuse does not keep it twice.
 */
function lane<T>(valid: boolean, table: Pick<ExposureTable, "rows" | "sessionIdsByDate">, candidates: readonly Candidate[], permutations: number | undefined, map: (item: AssociationEvaluation) => T): Lane<T> {
  let result: ReturnType<Lane<T>["evaluate"]> | null = null;
  const { rows, sessionIdsByDate } = table;
  return { candidates, rows, sessionIdsByDate, evaluate: () => {
    if (result) return result;
    const evaluation = valid ? evaluateAssociations(rows, candidates, { permutations }) : { items: [], testable: 0, permutations: permutations ?? 0 };
    return (result = { items: evaluation.items.map(map), testable: evaluation.testable, permutations: evaluation.permutations });
  } };
}
const pairsOf = (table: Pick<Lane<unknown>, "rows" | "sessionIdsByDate">, candidate: Candidate) => table.rows.flatMap(row => {
  const exposure = candidate.values.get(row.date);
  return exposure === undefined ? [] : [{ date: row.date, exposure, outcome: row.y, sessionIds: table.sessionIdsByDate.get(row.date) ?? [] }];
});

export type InsightsSnapshot = ReturnType<typeof createInsightsSnapshot>;
/**
 * Everything the views publish, computed once from one consistent read. It keeps published facts and exposure tables, not the
 * source rows or every set, so it can stay around while the same revision is being looked at. Pure: no I/O, clock or catalog.
 */
export function createInsightsSnapshot(source: InsightsSource, options: { today: string; revision?: string; permutations?: number; method?: InsightsEngineMethod }) {
  const method = options.method ?? 1;
  const names = new Map<string, string>();
  for (const row of source.exercises) { names.set(`${row.sessionId}:${row.exerciseId.toLowerCase()}`, row.name); }
  // One comparator at a time, each reduced to its published facts before the next starts. The adapted sessions live only in
  // this block: nothing after it holds the comparators' evidence, so it is not alive while the exposure tables are built.
  const sessionDates = new Map(source.sessions.map(session => [session.id, session.date]));
  const { performance, partial, orphanRows } = (() => {
    const adapted = toPerformanceSessions(source);
    const strictFacts = factsOfStrict(adapted.sessions, names, sessionDates);
    return { performance: strictFacts, partial: factsOfPartial(adapted.sessions, names, sessionDates), orphanRows: adapted.orphanRows };
  })();
  const context = buildExposureContext(source);
  const sleepIds = new Set(source.metricDefinitions.filter(metric => metric.systemKey === "sleep").map(metric => metric.id));
  const table = buildExposureTable(source, strictOutcomeDays(performance.days), options.today, context, true, method);
  const partialTable = buildExposureTable(source, partialOutcomeDays(partial.days), options.today, context, false, method);
  // Its own family: the correction covers exactly the candidates tested against this outcome.
  const partialCandidates = partialTable.candidates.map(candidate => ({ ...candidate, definition: { ...candidate.definition, id: PARTIAL_ASSOCIATION_PREFIX + candidate.definition.id } }));

  const sessionById = new Map(source.sessions.map(session => [session.id, session]));

  const totals = emptyCounts();
  const performanceExclusions: Record<string, number> = {};
  for (const session of performance.sessions) for (const exercise of session.exercises) {
    totals.total++;
    if (exercise.status === "improved") totals.improved++;
    else if (exercise.status === "observed_stable") totals.observedStable++;
    else if (exercise.status === "declined") totals.declined++;
    else if (exercise.status === "ambiguous_evidence") totals.ambiguous++;
    else totals.insufficient++;
    if (exercise.status === "insufficient_comparison") performanceExclusions[exercise.reason] = (performanceExclusions[exercise.reason] ?? 0) + 1;
  }
  totals.comparable = totals.improved + totals.observedStable + totals.declined;
  totals.coverage = totals.total ? totals.comparable / totals.total : null;
  for (const reason of performance.exclusionReasons) performanceExclusions[reason] = (performanceExclusions[reason] ?? 0) + 1;

  const sourceExclusions = { ...table.sourceExclusions };
  if (orphanRows) sourceExclusions.orphan_rows = orphanRows;
  const ordered = [...performance.days].sort((a, b) => b.date.localeCompare(a.date));
  const days: DayFact[] = ordered.map(day => ({
    date: day.date, counts: day.counts, evaluableSessions: day.evaluableSessions, declineProportion: day.candidateDeclineProportion,
    equalSessionSensitivity: day.equalSessionWeightSensitivity, openDay: day.date >= options.today,
    context: { metrics: method === 2 ? (table.metricsByDate.get(day.date) ?? []).map(row => sleepIds.has(row.metricId) ? { ...row, sleepNight: context.sleepEvidence.get(row.metricId)?.get(day.date) ?? "undeclared" } : row)
      : table.metricsByDate.get(day.date) ?? [], nutrition: table.nutritionByDate.get(day.date) ?? null,
      ...(method === 2 ? { bodyWeight: weightOfDay(context.weightByDate.get(day.date)) } : {}) },
    sessions: day.sessions.map((session): SessionFact => {
      const row = sessionById.get(session.sessionId);
      return { sessionId: session.sessionId, name: row?.name ?? null, routineId: session.routineId, routineName: row?.routineName ?? null,
        startedAt: row?.startedAt ?? null, endedAt: row?.endedAt ?? null, counts: session.counts, exercises: session.exercises,
        context: { feelings: table.feelingsBySession.get(session.sessionId) ?? {},
          ...(context.unreadableFeelingsBySession.has(session.sessionId) ? { unreadableFeelings: context.unreadableFeelingsBySession.get(session.sessionId)! } : {}),
          legacy: { energyLevel: row?.legacyEnergyLevel ?? null, performanceLevel: row?.performanceLevel ?? null, painLevel: row?.painLevel ?? null },
          carbsPre3h: table.carbsPre3hBySession.get(session.sessionId) ?? { value: null, state: "no_start_time" } } };
    }),
  }));

  const dates = performance.days.map(day => day.date);
  const partialTotals: PartialLane["totals"] = { higher: 0, same: 0, lower: 0, ambiguous: 0, insufficient: 0, total: 0, comparable: 0, coverage: null };
  const partialExclusions: Record<string, number> = {};
  for (const session of partial.sessions) for (const exercise of session.exercises) {
    partialTotals.total++;
    if (exercise.reading === "higher_record") partialTotals.higher++;
    else if (exercise.reading === "same_record") partialTotals.same++;
    else if (exercise.reading === "lower_record") partialTotals.lower++;
    else if (exercise.reading === "ambiguous_evidence") partialTotals.ambiguous++;
    else { partialTotals.insufficient++; partialExclusions[exercise.reason] = (partialExclusions[exercise.reason] ?? 0) + 1; }
  }
  partialTotals.comparable = partialTotals.higher + partialTotals.same + partialTotals.lower;
  partialTotals.coverage = partialTotals.total ? partialTotals.comparable / partialTotals.total : null;
  for (const reason of partial.exclusionReasons) partialExclusions[reason] = (partialExclusions[reason] ?? 0) + 1;
  const partialByDate = new Map(partial.days.map(day => [day.date, day]));
  const partialDays: PartialDayFact[] = days.map(({ date }) => {
    const day = partialByDate.get(date)!;
    return { date, counts: day.counts, evaluableSessions: day.evaluableSessions, lowerProportion: day.candidateLowerProportion, equalSessionSensitivity: day.equalSessionWeightSensitivity, openDay: date >= options.today,
      sessions: day.sessions.map(session => ({ sessionId: session.sessionId, counts: session.counts, exercises: session.exercises })) };
  });
  const dayExclusions: Record<string, number> = {};
  for (const key of ["day_still_open", "no_comparable_outcome"]) if (partialTable.sourceExclusions[key]) dayExclusions[key] = partialTable.sourceExclusions[key]!;

  // Two outcomes of their own, described. Their associations are not published, so nothing of them is prepared or kept here:
  // `prepareFeelingAssociations` builds them only when asked for explicitly.
  const feelingOutcomes = FEELING_OUTCOME_KINDS.map(kind => describeFeelingOutcome(source, kind, context, options.today));

  const mealEvidence: Record<MealTimeEvidence, number> = { explicit: 0, registration: 0, unverified: 0, unknown: 0 };
  for (const meal of source.meals) if (meal.entryKind === "meal") mealEvidence[mealTimeEvidence(meal)]++;
  return {
    today: options.today, revision: options.revision ?? "", method, performanceMethodVersion: performance.methodVersion, integrity: performance.integrity, days, partialDays,
    history: { coverage: "complete" as const, firstDate: dates[0] ?? null, lastDate: dates.at(-1) ?? null, sessions: performance.sessions.length, trainingDays: dates.length, outcomeDays: table.rows.length },
    totals, exercises: exerciseSummaries(performance.sessions, names),
    metrics: source.metricDefinitions.map(metric => ({ id: metric.id, name: metric.name, unit: metric.unit, valueType: metric.valueType, archived: metric.archived })),
    exclusions: { performance: performanceExclusions, source: sourceExclusions },
    limits: { configurationSnapshots: { known: source.exercises.filter(row => row.configuration?.trim()).length, total: source.exercises.length }, mealTimeEvidence: mealEvidence, unitBasis: "historical_weight_mode" as const, ingestionCompleteKnown: false as const, clockVerified: false as const,
      ...(method === 2 ? methodTwoLimits(source) : {}) },
    strict: lane(performance.integrity === "valid", table, table.candidates, options.permutations, publish),
    partial: { methodVersion: partial.methodVersion, contextCompleteness: partial.contextCompleteness, integrity: partial.integrity, partition: partial.partition, outcomeDays: partialTable.rows.length, totals: partialTotals, exercises: partialSummaries(partial.sessions, names), exclusions: { performance: partialExclusions, days: dayExclusions },
      lane: lane(partial.integrity === "valid", partialTable, partialCandidates, options.permutations, publishPartial) },
    /** Counts and states only (`view=feelings`). */
    feelingOutcomes,
  };
}

function pageOf(snapshot: InsightsSnapshot, options: { before?: string; limit?: number }) {
  const limit = Math.min(options.limit ?? INSIGHTS_DEFAULT_DAYS, INSIGHTS_MAX_DAYS);
  const start = options.before ? snapshot.days.findIndex(day => day.date < options.before!) : 0;
  const from = start < 0 ? snapshot.days.length : start, to = Math.min(from + limit, snapshot.days.length);
  const days = snapshot.days.slice(from, to);
  return { days, partialDays: snapshot.partialDays.slice(from, to),
    page: { limit, totalDays: snapshot.days.length - from, nextBefore: to < snapshot.days.length ? days.at(-1)!.date : null } };
}
const strictPromotion = { status: "not_enabled", reason: "risk_budget_not_approved", candidateRiskBudget: INSIGHTS_RISK_BUDGET_CANDIDATE } as const;
const partialPromotion = { status: "not_enabled", reason: "partial_context" } as const;
/** Method 2 also says how many sleep values have a declared night, and how many training days have a usable weight. */
function methodTwoLimits(source: InsightsSource) {
  const sleepIds = new Set(source.metricDefinitions.filter(metric => metric.systemKey === "sleep").map(metric => metric.id));
  const sleepNights: Record<SleepNightEvidence, number> = { declared: 0, undeclared: 0, stale_declaration: 0 };
  for (const row of source.metricValues) if (sleepIds.has(row.metricId)) sleepNights[row.sleepNight ?? "undeclared"]++;
  const bodyWeight = { recorded: 0, not_recorded: 0, invalid: 0 };
  for (const date of new Set(source.sessions.map(session => session.date).filter((date): date is string => !!date)))
    bodyWeight[weightOfDay(source.sessions.find(session => session.date === date)?.dayWeightKg).state]++;
  return { sleepNights, bodyWeightTrainingDays: bodyWeight };
}
const engineVersion = (snapshot: InsightsSnapshot) => snapshot.method === 2 ? INSIGHTS_ENGINE_METHOD_V2 : INSIGHTS_ENGINE_METHOD;
const versions = (snapshot: InsightsSnapshot) => ({ contractVersion: INSIGHTS_CONTRACT, methodVersion: engineVersion(snapshot), performanceMethodVersion: snapshot.performanceMethodVersion,
  today: snapshot.today, integrity: snapshot.integrity, sourceRevision: snapshot.revision });
const partialLabels = (snapshot: InsightsSnapshot) => ({ methodVersion: snapshot.partial.methodVersion, engineMethodVersion: snapshot.method === 2 ? INSIGHTS_ENGINE_PARTIAL_METHOD_V2 : INSIGHTS_ENGINE_PARTIAL_METHOD, contextCompleteness: snapshot.partial.contextCompleteness, integrity: snapshot.partial.integrity });

/** Energy and fatigue at the end as outcomes, described: counts by answer and by the prior answer. No association is published. */
export function insightsFeelingOutcomes(snapshot: InsightsSnapshot): InsightsFeelingOutcomes {
  return { view: "feelings", ...versions(snapshot), outcomes: snapshot.feelingOutcomes };
}

/** What opens the screen: facts, context and denominators. Says how many relations exist without running them. */
export function insightsSummary(snapshot: InsightsSnapshot, options: { before?: string; limit?: number } = {}): InsightsSummary {
  const page = pageOf(snapshot, options);
  return { view: "summary", ...versions(snapshot), history: snapshot.history, facts: { totals: snapshot.totals, exercises: snapshot.exercises, days: page.days, page: page.page },
    metrics: snapshot.metrics, exclusions: snapshot.exclusions, limits: snapshot.limits,
    relations: { strict: { candidatesEvaluated: snapshot.strict.candidates.length, outcomeDays: snapshot.history.outcomeDays }, partial: { candidatesEvaluated: snapshot.partial.lane.candidates.length, outcomeDays: snapshot.partial.outcomeDays } },
    partial: { ...partialLabels(snapshot), partition: snapshot.partial.partition, outcomeDays: snapshot.partial.outcomeDays, totals: snapshot.partial.totals, exercises: snapshot.partial.exercises, days: page.partialDays, exclusions: snapshot.partial.exclusions } };
}

/** More days of the same revision. Totals and exercises are already on the client. */
export function insightsDaysPage(snapshot: InsightsSnapshot, options: { before?: string; limit?: number }): InsightsDaysPage {
  const page = pageOf(snapshot, options);
  return { view: "days", ...versions(snapshot), facts: { days: page.days, page: page.page }, partial: { ...partialLabels(snapshot), days: page.partialDays } };
}

const relationSummary = <T extends RelationSummary | PartialRelationSummary>(item: T): T => ({ id: item.id, definition: item.definition, state: item.state, reason: item.reason, pairs: item.pairs, outcomeDays: item.outcomeDays } as T);
/** One line per relation. A lane without outcome days has nothing per candidate to say: its count and days say it. */
export function insightsRelations(snapshot: InsightsSnapshot): InsightsRelations {
  const strict = snapshot.strict.evaluate(), partial = snapshot.partial.lane.evaluate();
  return { view: "relations", ...versions(snapshot), metrics: snapshot.metrics,
    strict: { outcome: "daily_decline_proportion", outcomeDays: snapshot.history.outcomeDays, candidatesEvaluated: snapshot.strict.candidates.length, testableCandidates: strict.testable, permutations: strict.permutations, promotion: strictPromotion,
      items: snapshot.history.outcomeDays ? strict.items.map(item => relationSummary<RelationSummary>(item)) : [] },
    partial: { ...partialLabels(snapshot), outcome: "daily_lower_record_proportion", outcomeDays: snapshot.partial.outcomeDays, candidatesEvaluated: snapshot.partial.lane.candidates.length, testableCandidates: partial.testable, permutations: partial.permutations, promotion: partialPromotion,
      items: snapshot.partial.outcomeDays ? partial.items.map(item => relationSummary<PartialRelationSummary>(item)) : [] } };
}

/** Pairs a relation answers with unless all of them are asked for. Its numbers always come from every pair. */
export const INSIGHTS_RECENT_PAIRS = 60;

/** One relation with its evidence. Evaluates only its own method's family. An unknown id is null, never an empty relation. */
export function insightsRelation(snapshot: InsightsSnapshot, id: string, options: { pairs?: "all" | "recent" } = {}): InsightsRelationDetail {
  const isPartial = id.startsWith(PARTIAL_ASSOCIATION_PREFIX);
  const shared = { view: "relation" as const, ...versions(snapshot), metrics: snapshot.metrics, id, ...(isPartial ? { partial: partialLabels(snapshot) } : {}) };
  const chosen: Lane<AssociationResult | PartialAssociationResult> = isPartial ? snapshot.partial.lane : snapshot.strict;
  const candidate = chosen.candidates.find(row => row.definition.id === id);
  const item = candidate ? chosen.evaluate().items.find(row => row.id === id) ?? null : null;
  const pairs = candidate && item ? pairsOf(chosen, candidate) : null;
  return { ...shared, lane: isPartial ? "partial" : "strict", item, pairs: pairs && options.pairs === "recent" ? pairs.slice(-INSIGHTS_RECENT_PAIRS) : pairs, pairsTotal: pairs?.length ?? 0 };
}

/** Everything at once, for the pure consumers and the tests that compare the views against it. The route serves the views. */
export function buildInsightsReadModel(source: InsightsSource, options: {
  today: string; before?: string; limit?: number; association?: string; permutations?: number;
}): InsightsReadModel {
  const snapshot = createInsightsSnapshot(source, options);
  const page = pageOf(snapshot, options);
  const strict = snapshot.strict.evaluate(), partial = snapshot.partial.lane.evaluate();
  const requested = options.association ? snapshot.strict.candidates.find(candidate => candidate.definition.id === options.association) : undefined;
  const requestedPartial = options.association ? snapshot.partial.lane.candidates.find(candidate => candidate.definition.id === options.association) : undefined;
  return {
    contractVersion: INSIGHTS_CONTRACT, methodVersion: INSIGHTS_ENGINE_METHOD, performanceMethodVersion: snapshot.performanceMethodVersion,
    today: options.today, integrity: snapshot.integrity, history: snapshot.history,
    facts: { totals: snapshot.totals, exercises: snapshot.exercises, days: page.days, page: page.page },
    metrics: snapshot.metrics,
    associations: { outcome: "daily_decline_proportion", candidatesEvaluated: snapshot.strict.candidates.length, testableCandidates: strict.testable, permutations: strict.permutations,
      promotion: strictPromotion, items: strict.items,
      detail: requested ? { id: requested.definition.id, pairs: pairsOf(snapshot.strict, requested) } : null },
    exclusions: snapshot.exclusions,
    partial: { ...partialLabels(snapshot), partition: snapshot.partial.partition, outcomeDays: snapshot.partial.outcomeDays, totals: snapshot.partial.totals, exercises: snapshot.partial.exercises, days: page.partialDays,
      associations: { outcome: "daily_lower_record_proportion", candidatesEvaluated: snapshot.partial.lane.candidates.length, testableCandidates: partial.testable, permutations: partial.permutations,
        promotion: partialPromotion, items: partial.items,
        detail: requestedPartial ? { id: requestedPartial.definition.id, pairs: pairsOf(snapshot.partial.lane, requestedPartial) } : null },
      exclusions: snapshot.partial.exclusions },
    limits: snapshot.limits,
  };
}
