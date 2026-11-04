import { buildPerformanceInsightsPartialV1, buildPerformanceInsightsV1, type PartialExercise, type PartialSession } from "../performance-insights";
import type { PerformanceCounts, SessionPerformance } from "../performance-insights/types";
import { evaluateAssociations } from "./associations";
import { buildExposureTable, partialOutcomeDays, strictOutcomeDays } from "./exposures";
import { mealTimeEvidence, toPerformanceSessions } from "./source-adapter";
import { INSIGHTS_CONTRACT, INSIGHTS_ENGINE_METHOD, INSIGHTS_ENGINE_PARTIAL_METHOD, INSIGHTS_RISK_BUDGET_CANDIDATE, PARTIAL_ASSOCIATION_PREFIX, type AssociationResult, type DayFact, type ExerciseSummary, type InsightsReadModel, type InsightsSource, type MealTimeEvidence, type PartialDayFact, type PartialExerciseFact, type PartialExerciseSummary, type PartialLane, type SessionFact } from "./types";

export const INSIGHTS_DEFAULT_DAYS = 14;
export const INSIGHTS_MAX_DAYS = 120;
const emptyCounts = (): PerformanceCounts => ({ improved: 0, observedStable: 0, declined: 0, ambiguous: 0, insufficient: 0, total: 0, comparable: 0, coverage: null });
const DAY_MS = 86_400_000;

function exerciseSummaries(sessions: readonly SessionPerformance[], names: ReadonlyMap<string, string>): ExerciseSummary[] {
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

function partialSummaries(sessions: readonly PartialSession[], names: ReadonlyMap<string, string>): PartialExerciseSummary[] {
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

const partialFact = (exercise: PartialExercise, name: string): PartialExerciseFact => ({ exerciseId: exercise.exerciseId, name, reading: exercise.reading, reason: exercise.reason,
  referenceSessionId: exercise.reference?.sessionId ?? null, referenceAgeDays: exercise.reference ? Math.floor(exercise.reference.ageMs / DAY_MS) : null,
  highestInPartialContext: exercise.records.facts.some(fact => fact.isNewHigh) });

/** Pure read model shared by the API and any future consumer. Reads the whole history it receives and pages only the output. */
export function buildInsightsReadModel(source: InsightsSource, options: {
  today: string; before?: string; limit?: number; association?: string; permutations?: number;
}): InsightsReadModel {
  const limit = Math.min(options.limit ?? INSIGHTS_DEFAULT_DAYS, INSIGHTS_MAX_DAYS);
  const adapted = toPerformanceSessions(source);
  const performance = buildPerformanceInsightsV1({ sessions: adapted.sessions, historyCoverage: "complete", exclusionDetail: "summary" });
  const table = buildExposureTable(source, strictOutcomeDays(performance.days), options.today);
  const partial = buildPerformanceInsightsPartialV1({ sessions: adapted.sessions, historyCoverage: "complete", exclusionDetail: "summary" });
  const partialTable = buildExposureTable(source, partialOutcomeDays(partial.days), options.today);
  // Its own family: the correction covers exactly the candidates tested against this outcome.
  const partialCandidates = partialTable.candidates.map(candidate => ({ ...candidate, definition: { ...candidate.definition, id: PARTIAL_ASSOCIATION_PREFIX + candidate.definition.id } }));
  const partialEvaluation = partial.integrity === "valid" ? evaluateAssociations(partialTable.rows, partialCandidates, { permutations: options.permutations }) : { items: [], testable: 0, permutations: options.permutations ?? 0 };
  const evaluation = performance.integrity === "valid" ? evaluateAssociations(table.rows, table.candidates, { permutations: options.permutations }) : { items: [], testable: 0, permutations: options.permutations ?? 0 };

  const sessionById = new Map(source.sessions.map(session => [session.id, session]));
  const names = new Map<string, string>();
  for (const row of source.exercises) { names.set(`${row.sessionId}:${row.exerciseId.toLowerCase()}`, row.name); }

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
  for (const row of performance.exclusions) performanceExclusions[row.reason] = (performanceExclusions[row.reason] ?? 0) + 1;

  const sourceExclusions = { ...table.sourceExclusions };
  if (adapted.orphanRows) sourceExclusions.orphan_rows = adapted.orphanRows;
  const ordered = [...performance.days].sort((a, b) => b.date.localeCompare(a.date));
  const eligible = options.before ? ordered.filter(day => day.date < options.before!) : ordered;
  const page = eligible.slice(0, limit);
  const days: DayFact[] = page.map(day => ({
    date: day.date, counts: day.counts, evaluableSessions: day.evaluableSessions, declineProportion: day.candidateDeclineProportion,
    equalSessionSensitivity: day.equalSessionWeightSensitivity, openDay: day.date >= options.today,
    context: { metrics: table.metricsByDate.get(day.date) ?? [], nutrition: table.nutritionByDate.get(day.date) ?? null },
    sessions: day.sessions.map((session): SessionFact => {
      const row = sessionById.get(session.sessionId);
      return { sessionId: session.sessionId, name: row?.name ?? null, routineId: session.routineId, routineName: row?.routineName ?? null,
        startedAt: row?.startedAt ?? null, endedAt: row?.endedAt ?? null, counts: session.counts,
        exercises: session.exercises.map(exercise => ({ exerciseId: exercise.exerciseId, name: names.get(`${session.sessionId}:${exercise.exerciseId}`) ?? "",
          status: exercise.status, reason: exercise.reason, referenceSessionId: exercise.reference?.sessionId ?? null,
          referenceAgeDays: exercise.reference ? Math.floor(exercise.reference.ageMs / DAY_MS) : null, newHigh: exercise.records.facts.some(fact => fact.isNewHigh) })),
        context: { feelings: table.feelingsBySession.get(session.sessionId) ?? {},
          legacy: { energyLevel: row?.legacyEnergyLevel ?? null, performanceLevel: row?.performanceLevel ?? null, painLevel: row?.painLevel ?? null },
          carbsPre3h: table.carbsPre3hBySession.get(session.sessionId) ?? { value: null, state: "no_start_time" } } };
    }),
  }));

  const publish = (item: (typeof evaluation.items)[number]): AssociationResult => { const published: Omit<typeof item, "strictGate"> & { strictGate?: boolean } = { ...item }; delete published.strictGate; return published; };
  const items = evaluation.items.map(publish);
  const requested = options.association ? table.candidates.find(candidate => candidate.definition.id === options.association) : undefined;
  const dates = performance.days.map(day => day.date);
  const requestedPartial = options.association ? partialCandidates.find(candidate => candidate.definition.id === options.association) : undefined;
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
  for (const row of partial.exclusions) partialExclusions[row.reason] = (partialExclusions[row.reason] ?? 0) + 1;
  const partialByDate = new Map(partial.days.map(day => [day.date, day]));
  const partialDays: PartialDayFact[] = page.map(({ date }) => {
    const day = partialByDate.get(date)!;
    return { date, counts: day.counts, evaluableSessions: day.evaluableSessions, lowerProportion: day.candidateLowerProportion, equalSessionSensitivity: day.equalSessionWeightSensitivity, openDay: date >= options.today,
      sessions: day.sessions.map(session => ({ sessionId: session.sessionId, counts: session.counts, exercises: session.exercises.map(exercise => partialFact(exercise, names.get(`${session.sessionId}:${exercise.exerciseId}`) ?? "")) })) };
  });
  const dayExclusions: Record<string, number> = {};
  for (const key of ["day_still_open", "no_comparable_outcome"]) if (partialTable.sourceExclusions[key]) dayExclusions[key] = partialTable.sourceExclusions[key]!;
  const mealEvidence: Record<MealTimeEvidence, number> = { explicit: 0, registration: 0, unverified: 0, unknown: 0 };
  for (const meal of source.meals) if (meal.entryKind === "meal") mealEvidence[mealTimeEvidence(meal)]++;
  return {
    contractVersion: INSIGHTS_CONTRACT, methodVersion: INSIGHTS_ENGINE_METHOD, performanceMethodVersion: performance.methodVersion,
    today: options.today, integrity: performance.integrity,
    history: { coverage: "complete", firstDate: dates[0] ?? null, lastDate: dates.at(-1) ?? null, sessions: performance.sessions.length, trainingDays: dates.length, outcomeDays: table.rows.length },
    facts: { totals, exercises: exerciseSummaries(performance.sessions, names), days,
      page: { limit, totalDays: eligible.length, nextBefore: eligible.length > page.length ? page.at(-1)!.date : null } },
    metrics: source.metricDefinitions.map(metric => ({ id: metric.id, name: metric.name, unit: metric.unit, valueType: metric.valueType, archived: metric.archived })),
    associations: { outcome: "daily_decline_proportion", candidatesEvaluated: table.candidates.length, testableCandidates: evaluation.testable, permutations: evaluation.permutations,
      promotion: { status: "not_enabled", reason: "risk_budget_not_approved", candidateRiskBudget: INSIGHTS_RISK_BUDGET_CANDIDATE }, items,
      detail: requested ? { id: requested.definition.id, pairs: table.rows.flatMap(row => {
        const exposure = requested.values.get(row.date);
        return exposure === undefined ? [] : [{ date: row.date, exposure, outcome: row.y, sessionIds: table.sessionIdsByDate.get(row.date) ?? [] }];
      }) } : null },
    exclusions: { performance: performanceExclusions, source: sourceExclusions },
    partial: { methodVersion: partial.methodVersion, engineMethodVersion: INSIGHTS_ENGINE_PARTIAL_METHOD, contextCompleteness: partial.contextCompleteness, integrity: partial.integrity,
      partition: partial.partition, outcomeDays: partialTable.rows.length, totals: partialTotals, exercises: partialSummaries(partial.sessions, names), days: partialDays,
      associations: { outcome: "daily_lower_record_proportion", candidatesEvaluated: partialCandidates.length, testableCandidates: partialEvaluation.testable, permutations: partialEvaluation.permutations,
        promotion: { status: "not_enabled", reason: "partial_context" }, items: partialEvaluation.items.map(item => ({ ...publish(item), contextCompleteness: partial.contextCompleteness })),
        detail: requestedPartial ? { id: requestedPartial.definition.id, pairs: partialTable.rows.flatMap(row => {
          const exposure = requestedPartial.values.get(row.date);
          return exposure === undefined ? [] : [{ date: row.date, exposure, outcome: row.y, sessionIds: partialTable.sessionIdsByDate.get(row.date) ?? [] }];
        }) } : null },
      exclusions: { performance: partialExclusions, days: dayExclusions } },
    limits: { configurationSnapshots: { known: source.exercises.filter(row => row.configuration?.trim()).length, total: source.exercises.length }, mealTimeEvidence: mealEvidence, unitBasis: "historical_weight_mode", ingestionCompleteKnown: false, clockVerified: false },
  };
}
