// Pure strict contract shared by the API and Expo. It accepts only this versioned shape: never a partial read as an empty one.
import { INSIGHTS_CONTRACT, INSIGHTS_ENGINE_METHOD, type InsightsReadModel } from "../progress/insights-engine/types";

export type { AssociationResult, AssociationState, CandidateDefinition, DayFact, ExerciseFact, ExerciseSummary, InsightsReadModel, NutritionContext, SessionFact, SessionFeeling } from "../progress/insights-engine/types";
export const PERFORMANCE_INSIGHTS_PATH = "/api/mobile/v1/progress/performance-insights";

type Json = Record<string, unknown>;
const object = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const count = (value: unknown) => finite(value) && Number.isSafeInteger(value) && value >= 0;
const numberOrNull = (value: unknown) => value === null || finite(value);
const stringOrNull = (value: unknown) => value === null || typeof value === "string";
const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const list = (value: unknown, check: (row: unknown) => boolean) => Array.isArray(value) && value.every(check);
const STATUS = new Set(["improved", "observed_stable", "declined", "ambiguous_evidence", "insufficient_comparison"]);
const STATE = new Set(["insufficient_data", "no_clear_signal", "exploratory"]);
const FAMILY = new Set(["metric", "nutrition", "meal_window", "feeling"]);
const WINDOW = new Set(["same_day", "previous_day", "pre_3h", "same_day_before_start", "session"]);
const BASIS = new Set(["same_day_unordered", "previous_logical_day", "explicit_meal_time_before_start", "declared_pre_unverified_clock"]);
const TIMING = new Set(["before_start", "before_first_set", "after_first_set", "after_end", "post_declared", "unknown"]);
const CARBS = new Set(["recorded", "no_registered_meal", "partial_macro", "untimed_meal_in_scope", "no_start_time"]);

const counts = (v: unknown) => object(v) && ["improved", "observedStable", "declined", "ambiguous", "insufficient", "total", "comparable"].every(k => count(v[k])) && numberOrNull(v.coverage);
const tally = (v: unknown) => object(v) && Object.values(v).every(count);
const recorded = (v: unknown) => object(v) && finite(v.recorded) && count(v.missing);
const nutrition = (v: unknown) => v === null || (object(v) && count(v.activeMeals) && recorded(v.calories) && recorded(v.proteinG) && recorded(v.carbsG) && recorded(v.fatG));
const feeling = (v: unknown) => object(v) && count(v.value) && TIMING.has(String(v.timing)) && (v.temporalQuality === "unknown" || v.temporalQuality === "unverified_client_clock");
const exercise = (v: unknown) => object(v) && uuid(v.exerciseId) && typeof v.name === "string" && STATUS.has(String(v.status)) && typeof v.reason === "string"
  && stringOrNull(v.referenceSessionId) && numberOrNull(v.referenceAgeDays) && typeof v.newHigh === "boolean";
const session = (v: unknown) => object(v) && typeof v.sessionId === "string" && stringOrNull(v.name) && stringOrNull(v.routineId) && stringOrNull(v.routineName)
  && stringOrNull(v.startedAt) && stringOrNull(v.endedAt) && counts(v.counts) && list(v.exercises, exercise) && object(v.context)
  && object(v.context.feelings) && Object.values(v.context.feelings).every(feeling)
  && object(v.context.legacy) && numberOrNull(v.context.legacy.energyLevel) && numberOrNull(v.context.legacy.performanceLevel) && numberOrNull(v.context.legacy.painLevel)
  && object(v.context.carbsPre3h) && numberOrNull(v.context.carbsPre3h.value) && CARBS.has(String(v.context.carbsPre3h.state));
const day = (v: unknown) => object(v) && date(v.date) && counts(v.counts) && count(v.evaluableSessions) && numberOrNull(v.declineProportion) && numberOrNull(v.equalSessionSensitivity)
  && typeof v.openDay === "boolean" && list(v.sessions, session) && object(v.context) && nutrition(v.context.nutrition)
  && list(v.context.metrics, m => object(m) && typeof m.metricId === "string" && finite(m.value));
const summary = (v: unknown) => object(v) && uuid(v.exerciseId) && typeof v.name === "string" && ["exposures", "improved", "observedStable", "declined", "ambiguous", "insufficient"].every(k => count(v[k]))
  && (v.lastDate === null || date(v.lastDate)) && STATUS.has(String(v.lastStatus)) && typeof v.lastReason === "string";
const group = (v: unknown) => object(v) && count(v.days) && finite(v.meanOutcome);
const definition = (v: unknown) => object(v) && typeof v.id === "string" && FAMILY.has(String(v.family)) && WINDOW.has(String(v.window)) && BASIS.has(String(v.temporalBasis)) && typeof v.subject === "string";
const association = (v: unknown) => object(v) && typeof v.id === "string" && definition(v.definition) && STATE.has(String(v.state)) && typeof v.reason === "string"
  && count(v.pairs) && count(v.outcomeDays) && numberOrNull(v.coverage) && tally(v.exclusions)
  && ["rho", "localRho", "permutationP", "familyAdjustedP"].every(k => numberOrNull(v[k]))
  && (v.groups === null || (object(v.groups) && finite(v.groups.cut) && group(v.groups.low) && group(v.groups.high)))
  && object(v.stability) && ["firstHalfRho", "secondHalfRho", "equalSessionRho", "withoutExtremesRho", "selectiveAbsenceGap"].every(k => numberOrNull((v.stability as Json)[k]))
  && (v.stability.leaveOneRoutineOutAgrees === null || typeof v.stability.leaveOneRoutineOutAgrees === "boolean")
  && object(v.sensitivities) && Object.values(v.sensitivities).every(s => object(s) && count(s.pairs) && numberOrNull(s.rho));

/** Consistent patterns stay impossible in this contract until the risk budget is decided. */
export function parsePerformanceInsights(raw: unknown): InsightsReadModel | undefined {
  if (!object(raw) || raw.contractVersion !== INSIGHTS_CONTRACT || raw.methodVersion !== INSIGHTS_ENGINE_METHOD || typeof raw.performanceMethodVersion !== "string"
    || !date(raw.today) || (raw.integrity !== "valid" && raw.integrity !== "conflicting_duplicates")) return undefined;
  const { history, facts, metrics, associations, exclusions, limits } = raw;
  if (!object(history) || history.coverage !== "complete" || !count(history.sessions) || !count(history.trainingDays) || !count(history.outcomeDays)
    || (history.firstDate !== null && !date(history.firstDate)) || (history.lastDate !== null && !date(history.lastDate))) return undefined;
  if (!object(facts) || !counts(facts.totals) || !list(facts.exercises, summary) || !list(facts.days, day) || !object(facts.page)
    || !count(facts.page.limit) || !count(facts.page.totalDays) || (facts.page.nextBefore !== null && !date(facts.page.nextBefore))) return undefined;
  if (!list(metrics, m => object(m) && typeof m.id === "string" && typeof m.name === "string" && stringOrNull(m.unit) && typeof m.valueType === "string" && typeof m.archived === "boolean")) return undefined;
  if (!object(associations) || associations.outcome !== "daily_decline_proportion" || !count(associations.candidatesEvaluated) || !count(associations.testableCandidates) || !count(associations.permutations)
    || !object(associations.promotion) || associations.promotion.status !== "not_enabled" || !list(associations.items, association)) return undefined;
  const detail = associations.detail;
  if (detail !== null && !(object(detail) && typeof detail.id === "string" && list(detail.pairs, p => object(p) && date(p.date) && finite(p.exposure) && finite(p.outcome) && list(p.sessionIds, s => typeof s === "string")))) return undefined;
  if (!object(exclusions) || !tally(exclusions.performance) || !tally(exclusions.source) || !object(limits)) return undefined;
  return raw as unknown as InsightsReadModel;
}
