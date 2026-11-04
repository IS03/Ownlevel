import { buildPerformanceInsightsV1 } from "../performance-insights";
import type { PerformanceCounts, SessionPerformance } from "../performance-insights/types";
import { evaluateAssociations } from "./associations";
import { buildExposureTable } from "./exposures";
import { toPerformanceSessions } from "./source-adapter";
import { INSIGHTS_CONTRACT, INSIGHTS_ENGINE_METHOD, INSIGHTS_RISK_BUDGET_CANDIDATE, type AssociationResult, type DayFact, type ExerciseSummary, type InsightsReadModel, type InsightsSource, type SessionFact } from "./types";

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

/** Pure read model shared by the API and any future consumer. Reads the whole history it receives and pages only the output. */
export function buildInsightsReadModel(source: InsightsSource, options: {
  today: string; before?: string; limit?: number; association?: string; permutations?: number;
}): InsightsReadModel {
  const limit = Math.min(options.limit ?? INSIGHTS_DEFAULT_DAYS, INSIGHTS_MAX_DAYS);
  const adapted = toPerformanceSessions(source);
  const performance = buildPerformanceInsightsV1({ sessions: adapted.sessions, historyCoverage: "complete", exclusionDetail: "summary" });
  const table = buildExposureTable(source, performance.days, options.today);
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

  const items: AssociationResult[] = evaluation.items.map(item => { const published: Omit<typeof item, "strictGate"> & { strictGate?: boolean } = { ...item }; delete published.strictGate; return published; });
  const requested = options.association ? table.candidates.find(candidate => candidate.definition.id === options.association) : undefined;
  const dates = performance.days.map(day => day.date);
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
    limits: { configurationCaptured: false, unitBasis: "historical_weight_mode", ingestionCompleteKnown: false, clockVerified: false },
  };
}
