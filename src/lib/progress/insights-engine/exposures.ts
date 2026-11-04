import type { PartialDay } from "../performance-insights/partial";
import type { DailyPerformance } from "../performance-insights/types";
import { instantMs, mealTimeEvidence, parseSessionFeelings } from "./source-adapter";
import type { Candidate, CandidateDefinition, InsightsSource, MealTimeEvidence, NutritionContext, ObservationRow, SessionFact, SessionFeeling } from "./types";

const HOUR = 3_600_000;
/** Primary window fixed before any result, as a product decision rather than a physiological optimum. */
export const PRIMARY_MEAL_WINDOW_HOURS = 3;
export const SENSITIVITY_MEAL_WINDOW_HOURS = [2, 4] as const;
const NUTRIENTS = ["calories", "proteinG", "carbsG", "fatG"] as const;
type Meal = InsightsSource["meals"][number];
/** Every window of every day asks these again, and the evidence parses raw_input. A meal's answers never change. */
const mealFacts = new WeakMap<Meal, { instant: number | null; evidence: MealTimeEvidence }>();
function factsOf(meal: Meal) {
  let facts = mealFacts.get(meal);
  if (!facts) { facts = { instant: instantMs(meal.consumedAt), evidence: mealTimeEvidence(meal) }; mealFacts.set(meal, facts); }
  return facts;
}

export const previousDate = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const bump = (record: Record<string, number>, key: string) => { record[key] = (record[key] ?? 0) + 1; };

/** What a method hands to the associations. The two methods never share a day's outcome. */
export type OutcomeDay = { date: string; sessions: readonly { sessionId: string; routineId: string | null }[]; outcome: number | null; outcomeSensitivity: number | null };
export const strictOutcomeDays = (days: readonly DailyPerformance[]): OutcomeDay[] => days.map(day => ({ date: day.date, sessions: day.sessions, outcome: day.candidateDeclineProportion, outcomeSensitivity: day.equalSessionWeightSensitivity }));
export const partialOutcomeDays = (days: readonly PartialDay[]): OutcomeDay[] => days.map(day => ({ date: day.date, sessions: day.sessions, outcome: day.candidateLowerProportion, outcomeSensitivity: day.equalSessionWeightSensitivity }));

export type ExposureTable = {
  rows: ObservationRow[]; candidates: Candidate[]; sourceExclusions: Record<string, number>;
  nutritionByDate: ReadonlyMap<string, NonNullable<NutritionContext>>;
  metricsByDate: ReadonlyMap<string, { metricId: string; value: number }[]>;
  feelingsBySession: ReadonlyMap<string, Partial<Record<string, SessionFeeling>>>;
  carbsPre3hBySession: ReadonlyMap<string, SessionFact["context"]["carbsPre3h"]>;
  sessionIdsByDate: ReadonlyMap<string, string[]>;
};

function nutritionDays(meals: readonly Meal[], exclusions: Record<string, number>) {
  const byDate = new Map<string, NonNullable<NutritionContext>>();
  for (const meal of meals) {
    if (meal.entryKind !== "meal" && meal.entryKind !== "legacy_daily_summary") { bump(exclusions, "meal_other_kind"); continue; }
    const day = byDate.get(meal.date) ?? { activeMeals: 0, calories: { recorded: 0, missing: 0 }, proteinG: { recorded: 0, missing: 0 }, carbsG: { recorded: 0, missing: 0 }, fatG: { recorded: 0, missing: 0 } };
    day.activeMeals++;
    for (const nutrient of NUTRIENTS) {
      const value = meal[nutrient];
      if (value === null || !Number.isFinite(value)) day[nutrient].missing++;
      else day[nutrient].recorded += value;
    }
    byDate.set(meal.date, day);
  }
  return byDate;
}

function metricSeries(source: InsightsSource, exclusions: Record<string, number>) {
  const known = new Set(source.metricDefinitions.map(metric => metric.id));
  const series = new Map<string, Map<string, number>>(), byDate = new Map<string, { metricId: string; value: number }[]>();
  for (const row of source.metricValues) {
    const value = typeof row.value === "number" ? row.value : typeof row.value === "string" && row.value.trim() ? Number(row.value) : NaN;
    if (!known.has(row.metricId)) { bump(exclusions, "metric_without_definition"); continue; }
    if (!Number.isFinite(value)) { bump(exclusions, "metric_invalid_value"); continue; }
    const values = series.get(row.metricId) ?? new Map<string, number>();
    values.set(row.date, value); series.set(row.metricId, values);
    const day = byDate.get(row.date);
    if (day) day.push({ metricId: row.metricId, value }); else byDate.set(row.date, [{ metricId: row.metricId, value }]);
  }
  return { series, byDate };
}

/** Sum of the carbohydrates recorded with an explicit time. Absence never becomes zero or fasting. */
function mealWindow(mealsByDate: ReadonlyMap<string, Meal[]>, date: string, start: number, from: number, accept: (meal: Meal) => boolean) {
  const scope = [previousDate(date), date];
  let total = 0, found = 0, partial = false, untimed = false, unverified = false;
  for (const day of scope) for (const meal of mealsByDate.get(day) ?? []) {
    const evidence = meal.entryKind === "meal" && accept(meal);
    const { instant, evidence: known } = factsOf(meal);
    if (!evidence) {
      if (day === date || (instant !== null && instant >= from && instant < start)) { if (known === "unverified") unverified = true; else untimed = true; }
      continue;
    }
    if (instant === null || instant < from || instant >= start) continue;
    found++;
    if (meal.carbsG === null || !Number.isFinite(meal.carbsG)) partial = true; else total += meal.carbsG;
  }
  return { total, found, partial, untimed, unverified };
}
const explicit = (meal: Meal) => factsOf(meal).evidence === "explicit";
const declared = (meal: Meal) => { const { evidence } = factsOf(meal); return evidence === "explicit" || evidence === "registration"; };
const anyInstant = (meal: Meal) => factsOf(meal).evidence !== "unknown";

/**
 * One row per logical day with a comparable outcome. Today stays out: its intake and metrics are still open. A daily metric
 * contributes one observation per day, however many exercises were trained.
 */
export type ExposureContext = ReturnType<typeof buildExposureContext>;
/** What was recorded, whatever method reads it. Built once: the two methods share it and differ only in their outcome days. */
export function buildExposureContext(source: InsightsSource) {
  const exclusions: Record<string, number> = {};
  const nutritionByDate = nutritionDays(source.meals, exclusions);
  const { series, byDate: metricsByDate } = metricSeries(source, exclusions);
  const mealsByDate = new Map<string, Meal[]>();
  for (const meal of source.meals) {
    const rows = mealsByDate.get(meal.date);
    if (rows) rows.push(meal); else mealsByDate.set(meal.date, [meal]);
  }
  const sessionById = new Map(source.sessions.map(session => [session.id, session]));
  const exerciseSession = new Map(source.exercises.map(row => [row.id, row.sessionId]));
  const firstSetAt = new Map<string, number>();
  for (const set of source.sets) {
    const sessionId = exerciseSession.get(set.sessionExerciseId), at = set.isCompleted ? instantMs(set.completedAt) : null;
    if (sessionId && at !== null && at < (firstSetAt.get(sessionId) ?? Infinity)) firstSetAt.set(sessionId, at);
  }
  const feelingsBySession = new Map<string, Partial<Record<string, SessionFeeling>>>();
  for (const row of source.feelings) {
    const session = sessionById.get(row.sessionId);
    if (!session) { bump(exclusions, "feelings_without_session"); continue; }
    const parsed = parseSessionFeelings(row.facts, session, firstSetAt.get(row.sessionId) ?? null);
    for (let i = 0; i < parsed.invalid; i++) bump(exclusions, "feeling_invalid");
    feelingsBySession.set(row.sessionId, parsed.values);
  }
  return { exclusions, nutritionByDate, series, metricsByDate, mealsByDate, sessionById, feelingsBySession };
}

export function buildExposureTable(source: InsightsSource, days: readonly OutcomeDay[], today: string, context: ExposureContext = buildExposureContext(source), sessionContext = true): ExposureTable {
  const { nutritionByDate, series, metricsByDate, mealsByDate, sessionById, feelingsBySession } = context;
  const sourceExclusions: Record<string, number> = { ...context.exclusions };

  const carbsPre3hBySession = new Map<string, SessionFact["context"]["carbsPre3h"]>();
  const sessionIdsByDate = new Map<string, string[]>();
  const rows: ObservationRow[] = [];
  const singleSession = new Map<string, { id: string; start: number | null }>();
  const notEvaluated: Record<string, number> = {};
  for (const day of days) {
    const ids = day.sessions.map(session => session.sessionId);
    sessionIdsByDate.set(day.date, ids);
    // What surrounded a session does not depend on the method: the second method reuses the first one's.
    if (sessionContext) for (const id of ids) {
      const start = instantMs(sessionById.get(id)?.startedAt);
      if (start === null) { carbsPre3hBySession.set(id, { value: null, state: "no_start_time" }); continue; }
      const window = mealWindow(mealsByDate, day.date, start, start - PRIMARY_MEAL_WINDOW_HOURS * HOUR, explicit);
      carbsPre3hBySession.set(id, window.partial ? { value: null, state: "partial_macro" } : window.untimed ? { value: null, state: "untimed_meal_in_scope" } : window.unverified ? { value: null, state: "unverified_meal_time_in_scope" }
        : window.found ? { value: window.total, state: "recorded" } : { value: null, state: "no_registered_meal" });
    }
    if (day.date >= today) { bump(notEvaluated, "day_still_open"); continue; }
    if (day.outcome === null) { bump(notEvaluated, "no_comparable_outcome"); continue; }
    const routines = [...new Set(day.sessions.map(session => session.routineId ?? "free"))];
    rows.push({ date: day.date, y: day.outcome, ySensitivity: day.outcomeSensitivity ?? day.outcome,
      routineKey: routines.length === 1 ? routines[0]! : null });
    if (ids.length === 1) singleSession.set(day.date, { id: ids[0]!, start: instantMs(sessionById.get(ids[0]!)?.startedAt) });
  }
  for (const [key, count] of Object.entries(notEvaluated)) sourceExclusions[key] = count;

  const candidates: Candidate[] = [];
  const definition = (value: CandidateDefinition) => value;
  for (const metric of [...source.metricDefinitions].sort((a, b) => a.id.localeCompare(b.id))) {
    const values = series.get(metric.id) ?? new Map<string, number>();
    for (const window of ["same_day", "previous_day"] as const) {
      const paired = new Map<string, number>(), exclusions: Record<string, number> = {};
      for (const row of rows) {
        const value = values.get(window === "same_day" ? row.date : previousDate(row.date));
        if (value === undefined) bump(exclusions, "metric_not_recorded"); else paired.set(row.date, value);
      }
      candidates.push({ values: paired, exclusions, definition: definition({ id: `metric:${metric.id}:${window}`, family: "metric", window, subject: metric.id,
        temporalBasis: window === "same_day" ? "same_day_unordered" : "previous_logical_day" }) });
    }
  }
  for (const nutrient of NUTRIENTS) for (const window of ["same_day", "previous_day"] as const) {
    const paired = new Map<string, number>(), exclusions: Record<string, number> = {};
    for (const row of rows) {
      const day = nutritionByDate.get(window === "same_day" ? row.date : previousDate(row.date));
      if (!day) bump(exclusions, "no_active_meals");
      else if (day[nutrient].missing) bump(exclusions, "partial_macro");
      else paired.set(row.date, day[nutrient].recorded);
    }
    candidates.push({ values: paired, exclusions, definition: definition({ id: `nutrition:${nutrient}:${window}`, family: "nutrition", window, subject: nutrient,
      temporalBasis: window === "same_day" ? "same_day_unordered" : "previous_logical_day" }) });
  }
  candidates.push(mealCandidate(rows, singleSession, mealsByDate, "pre_3h"), mealCandidate(rows, singleSession, mealsByDate, "same_day_before_start"));
  for (const key of ["energyPre", "fatiguePre"] as const) {
    const paired = new Map<string, number>(), exclusions: Record<string, number> = {};
    for (const row of rows) {
      const session = singleSession.get(row.date);
      if (!session) { bump(exclusions, "multiple_sessions_day"); continue; }
      const fact = feelingsBySession.get(session.id)?.[key];
      if (!fact) bump(exclusions, "feeling_not_recorded");
      else if (fact.timing === "unknown") bump(exclusions, "feeling_capture_unknown");
      else if (fact.timing !== "before_start" && fact.timing !== "before_first_set") bump(exclusions, "feeling_after_first_set");
      else paired.set(row.date, fact.value);
    }
    candidates.push({ values: paired, exclusions, definition: definition({ id: `feeling:${key}:session`, family: "feeling", window: "session", subject: key, temporalBasis: "declared_pre_unverified_clock" }) });
  }
  return { rows, candidates, sourceExclusions, nutritionByDate, metricsByDate, feelingsBySession, carbsPre3hBySession, sessionIdsByDate };
}

function mealCandidate(rows: readonly ObservationRow[], single: ReadonlyMap<string, { id: string; start: number | null }>, mealsByDate: ReadonlyMap<string, Meal[]>, window: "pre_3h" | "same_day_before_start"): Candidate {
  const paired = new Map<string, number>(), exclusions: Record<string, number> = {};
  const sensitivities: Record<string, Map<string, number>> = window === "pre_3h"
    ? { ...Object.fromEntries(SENSITIVITY_MEAL_WINDOW_HOURS.map(hours => [`window_${hours}h`, new Map<string, number>()])), with_registration_time: new Map<string, number>(), with_unverified_time: new Map<string, number>() } : {};
  for (const row of rows) {
    const session = single.get(row.date);
    if (!session) { bump(exclusions, "multiple_sessions_day"); continue; }
    if (session.start === null) { bump(exclusions, "no_start_time"); continue; }
    const dayStart = session.start - 86_400_000 * 2;
    const from = window === "pre_3h" ? session.start - PRIMARY_MEAL_WINDOW_HOURS * HOUR : dayStart;
    const accept = window === "pre_3h" ? explicit : (meal: Meal) => explicit(meal) && meal.date === row.date;
    const result = mealWindow(mealsByDate, row.date, session.start, from, accept);
    if (window === "same_day_before_start") {
      const evidence = (mealsByDate.get(row.date) ?? []).map(meal => factsOf(meal).evidence);
      result.untimed = evidence.some(value => value === "unknown" || value === "registration");
      result.unverified = evidence.includes("unverified");
    }
    if (result.untimed) bump(exclusions, "untimed_meal_in_scope");
    else if (result.unverified) bump(exclusions, "unverified_meal_time_in_scope");
    else if (result.partial) bump(exclusions, "partial_macro");
    else if (!result.found) bump(exclusions, "no_registered_meal_in_window");
    else paired.set(row.date, result.total);
    if (window === "pre_3h") {
      for (const hours of SENSITIVITY_MEAL_WINDOW_HOURS) {
        const other = mealWindow(mealsByDate, row.date, session.start, session.start - hours * HOUR, explicit);
        if (!other.untimed && !other.unverified && !other.partial && other.found) sensitivities[`window_${hours}h`]!.set(row.date, other.total);
      }
      const approximate = mealWindow(mealsByDate, row.date, session.start, from, declared);
      if (!approximate.untimed && !approximate.unverified && !approximate.partial && approximate.found) sensitivities.with_registration_time!.set(row.date, approximate.total);
      const unproven = mealWindow(mealsByDate, row.date, session.start, from, anyInstant);
      if (!unproven.untimed && !unproven.partial && unproven.found) sensitivities.with_unverified_time!.set(row.date, unproven.total);
    }
  }
  return { values: paired, exclusions, sensitivities, definition: { id: `meal_window:carbsG:${window}`, family: "meal_window", window, subject: "carbsG", temporalBasis: "explicit_meal_time_before_start" } };
}
