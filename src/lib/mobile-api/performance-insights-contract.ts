import { validCoincidenceSelection } from '../progress/insights-engine/descriptive-transport';
export { coincidenceWeeks } from '../progress/insights-engine/descriptive-weeks';
export type { CoincidenceEvidence } from '../progress/insights-engine/week-exploration';
// Pure strict contract shared by the API and Expo. It accepts only this versioned shape: never a partial read as an empty one.
import { INSIGHTS_PERFORMANCE_PARTIAL_METHOD, PARTIAL_CONTEXT } from "../progress/performance-insights/partial";
import { periodOf } from "../progress/insights-engine/period-range";
export type { SessionTemporalDay } from '../progress/insights-engine/session-temporal';
import type { SessionTemporalDay } from '../progress/insights-engine/session-temporal';
export type { PeriodExploration } from '../progress/insights-engine/week-exploration';
import type { PeriodExploration } from '../progress/insights-engine/week-exploration';
export type { InsightsPinnedPeriodSummary, InsightsPeriodFeelings, InsightsPeriodNutrition } from "../progress/insights-engine/types";
import { INSIGHTS_CONTRACT, INSIGHTS_ENGINE_METHOD, INSIGHTS_ENGINE_METHOD_V2, INSIGHTS_ENGINE_PARTIAL_METHOD, INSIGHTS_ENGINE_PARTIAL_METHOD_V2, PARTIAL_ASSOCIATION_PREFIX, type InsightsDaysPage, type InsightsExerciseEvidence, type InsightsFeelingOutcomes, type InsightsPeriodSummary, type InsightsReadModel, type InsightsRelationDetail, type InsightsRelations, type InsightsResponse, type InsightsSummary, type InsightsPinnedPeriodSummary, type InsightsPeriodFeelings, type InsightsPeriodNutrition } from "../progress/insights-engine/types";

export type { AssociationResult, AssociationState, CandidateDefinition, DayFact, EvidenceSet, EvidenceSide, ExerciseEvidence, FeelingOutcomeKind, FeelingOutcomeSummary, InsightsFeelingOutcomes, InsightsPeriodSummary, ExerciseFact, InsightsExerciseEvidence, ExerciseSummary, InsightsDaysPage, InsightsReadModel, InsightsRelationDetail, InsightsRelations, InsightsResponse, InsightsSummary, PartialAssociationState, PartialRelationSummary, RelationSummary, NutritionContext, PartialAssociationResult, PartialDayFact, PartialExerciseFact, PartialExerciseSummary, PartialLane, SessionFact, SessionFeeling } from "../progress/insights-engine/types";
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
/** No "exploratory" here: a partial reading can never arrive with the words of the strict method. */
const PARTIAL_STATE = new Set(["insufficient_data", "no_clear_signal", "coincidence_context_unknown"]);
// Method 2 adds sleep and body. A /1 answer never carries them, so a client built for /1 that never asks for /2 is unaffected.
const FAMILY = new Set(["metric", "nutrition", "meal_window", "feeling", "sleep", "body"]);
const WINDOW = new Set(["same_day", "previous_day", "pre_3h", "same_day_before_start", "session", "night_before"]);
const BASIS = new Set(["same_day_unordered", "previous_logical_day", "explicit_meal_time_before_start", "declared_pre_unverified_clock", "declared_night_ending_on_day", "undeclared_sleep_date"]);
const TIMING = new Set(["before_start", "before_first_set", "after_first_set", "after_end", "post_declared", "unknown"]);
const CARBS = new Set(["recorded", "no_registered_meal", "partial_macro", "untimed_meal_in_scope", "unverified_meal_time_in_scope", "no_start_time"]);

const counts = (v: unknown) => object(v) && ["improved", "observedStable", "declined", "ambiguous", "insufficient", "total", "comparable"].every(k => count(v[k])) && numberOrNull(v.coverage);
const tally = (v: unknown) => object(v) && Object.values(v).every(count);
const recorded = (v: unknown) => object(v) && finite(v.recorded) && count(v.missing);
const nutrition = (v: unknown) => v === null || (object(v) && count(v.activeMeals) && recorded(v.calories) && recorded(v.proteinG) && recorded(v.carbsG) && recorded(v.fatG));
const FEELING_KEY = new Set(["energyPre", "fatiguePre", "energyPost", "fatiguePost"]);
const feeling = (v: unknown) => object(v) && count(v.value) && TIMING.has(String(v.timing)) && (v.temporalQuality === "unknown" || v.temporalQuality === "unverified_client_clock");
/** Optional: an answer of an older server does not carry it. When present it is a date or null, nothing else. */
const referenceDate = (v: unknown) => v === undefined || v === null || date(v);
const exercise = (v: unknown) => object(v) && uuid(v.exerciseId) && typeof v.name === "string" && STATUS.has(String(v.status)) && typeof v.reason === "string"
  && stringOrNull(v.referenceSessionId) && numberOrNull(v.referenceAgeDays) && referenceDate(v.referenceDate) && typeof v.newHigh === "boolean";
/** A value is only there when its state says it was recorded; every other state has none. */
const preWindow = (v: unknown) => object(v) && numberOrNull(v.value) && CARBS.has(String(v.state)) && (v.state === "recorded") === (v.value !== null) && (v.value === null || (v.value as number) >= 0);
const LAST_MEAL = new Set(["recorded", "no_explicit_meal_in_12h", "no_start_time"]);
/** #367 phase 2. Optional: an older server does not send it. Hours since the last explicit meal are within (0, 12]. */
const preStart = (v: unknown) => object(v) && preWindow(v.proteinG) && preWindow(v.calories) && object(v.lastExplicitMeal)
  && LAST_MEAL.has(String(v.lastExplicitMeal.state)) && typeof v.lastExplicitMeal.untimedInScope === "boolean" && typeof v.lastExplicitMeal.unverifiedInScope === "boolean"
  && (v.lastExplicitMeal.state === "recorded" ? finite(v.lastExplicitMeal.hours) && (v.lastExplicitMeal.hours as number) > 0 && (v.lastExplicitMeal.hours as number) <= 12 : v.lastExplicitMeal.hours === null);
const session = (v: unknown) => object(v) && typeof v.sessionId === "string" && stringOrNull(v.name) && stringOrNull(v.routineId) && stringOrNull(v.routineName)
  && stringOrNull(v.startedAt) && stringOrNull(v.endedAt) && counts(v.counts) && list(v.exercises, exercise) && object(v.context)
  && object(v.context.feelings) && Object.values(v.context.feelings).every(feeling)
  // Optional and added later: a client that does not know it ignores it, and one that does never reads it as "not recorded".
  && (v.context.unreadableFeelings === undefined || list(v.context.unreadableFeelings, key => FEELING_KEY.has(String(key))))
  && object(v.context.legacy) && numberOrNull(v.context.legacy.energyLevel) && numberOrNull(v.context.legacy.performanceLevel) && numberOrNull(v.context.legacy.painLevel)
  && preWindow(v.context.carbsPre3h) && (v.context.preStart === undefined || preStart(v.context.preStart));
const day = (v: unknown) => object(v) && date(v.date) && counts(v.counts) && count(v.evaluableSessions) && numberOrNull(v.declineProportion) && numberOrNull(v.equalSessionSensitivity)
  && typeof v.openDay === "boolean" && list(v.sessions, session) && object(v.context) && nutrition(v.context.nutrition)
  && list(v.context.metrics, m => object(m) && typeof m.metricId === "string" && finite(m.value));
const summary = (v: unknown) => object(v) && uuid(v.exerciseId) && typeof v.name === "string" && ["exposures", "improved", "observedStable", "declined", "ambiguous", "insufficient"].every(k => count(v[k]))
  && (v.lastDate === null || date(v.lastDate)) && STATUS.has(String(v.lastStatus)) && typeof v.lastReason === "string";
const group = (v: unknown) => object(v) && count(v.days) && finite(v.min) && finite(v.max) && finite(v.meanOutcome);
const definition = (v: unknown) => object(v) && typeof v.id === "string" && FAMILY.has(String(v.family)) && WINDOW.has(String(v.window)) && BASIS.has(String(v.temporalBasis)) && typeof v.subject === "string";
const relation = (v: unknown, states: Set<string>) => object(v) && typeof v.id === "string" && definition(v.definition) && states.has(String(v.state)) && typeof v.reason === "string"
  && count(v.pairs) && count(v.outcomeDays);
const associationBody = (v: unknown, states: Set<string>) => object(v) && relation(v, states)
  && count(v.pairs) && count(v.outcomeDays) && numberOrNull(v.coverage) && tally(v.exclusions)
  && ["rho", "localRho", "permutationP", "familyAdjustedP"].every(k => numberOrNull(v[k]))
  && (v.groups === null || (object(v.groups) && v.groups.rule === "median_balanced_ties" && finite(v.groups.cut) && typeof v.groups.lowIncludesCut === "boolean" && group(v.groups.low) && group(v.groups.high)))
  && object(v.stability) && ["firstHalfRho", "secondHalfRho", "equalSessionRho", "withoutExtremesRho", "selectiveAbsenceGap"].every(k => numberOrNull((v.stability as Json)[k]))
  && (v.stability.leaveOneRoutineOutAgrees === null || typeof v.stability.leaveOneRoutineOutAgrees === "boolean")
  && object(v.sensitivities) && Object.values(v.sensitivities).every(s => object(s) && count(s.pairs) && numberOrNull(s.rho));
const READING = new Set(["higher_record", "same_record", "lower_record", "ambiguous_evidence", "insufficient_comparison"]);
const partialCounts = (v: unknown) => object(v) && ["higher", "same", "lower", "ambiguous", "insufficient", "total", "comparable"].every(k => count(v[k])) && numberOrNull(v.coverage);
const partialExercise = (v: unknown) => object(v) && uuid(v.exerciseId) && typeof v.name === "string" && READING.has(String(v.reading)) && typeof v.reason === "string"
  && stringOrNull(v.referenceSessionId) && numberOrNull(v.referenceAgeDays) && referenceDate(v.referenceDate) && typeof v.highestInPartialContext === "boolean";
const partialDay = (v: unknown) => object(v) && date(v.date) && partialCounts(v.counts) && count(v.evaluableSessions) && numberOrNull(v.lowerProportion) && numberOrNull(v.equalSessionSensitivity) && typeof v.openDay === "boolean"
  && list(v.sessions, s => object(s) && typeof s.sessionId === "string" && partialCounts(s.counts) && list(s.exercises, partialExercise));
const partialSummary = (v: unknown) => object(v) && uuid(v.exerciseId) && typeof v.name === "string" && ["exposures", "higher", "same", "lower", "ambiguous", "insufficient"].every(k => count(v[k]))
  && (v.lastDate === null || date(v.lastDate)) && READING.has(String(v.lastReading)) && typeof v.lastReason === "string";
const association = (v: unknown) => associationBody(v, STATE);
const partialAssociation = (v: unknown) => associationBody(v, PARTIAL_STATE) && (v as Json).contextCompleteness === PARTIAL_CONTEXT && String((v as Json).id).startsWith(PARTIAL_ASSOCIATION_PREFIX);
const pairs = (v: unknown) => v === null || (object(v) && typeof v.id === "string" && list(v.pairs, p => object(p) && date(p.date) && finite(p.exposure) && finite(p.outcome) && list(p.sessionIds, s => typeof s === "string")));
/** Its labels are required: a partial reading can never arrive looking like one of the strict method. */
const partialLabels = (v: unknown) => object(v) && v.methodVersion === INSIGHTS_PERFORMANCE_PARTIAL_METHOD && (v.engineMethodVersion === INSIGHTS_ENGINE_PARTIAL_METHOD || v.engineMethodVersion === INSIGHTS_ENGINE_PARTIAL_METHOD_V2) && v.contextCompleteness === PARTIAL_CONTEXT
  && (v.integrity === "valid" || v.integrity === "conflicting_duplicates");
const partialFacts = (v: unknown) => object(v) && partialLabels(v) && object(v.partition) && count(v.partition.total) && count(v.partition.configurationKnown) && count(v.partition.configurationUnknown)
  && v.partition.total === Number(v.partition.configurationKnown) + Number(v.partition.configurationUnknown)
  && count(v.outcomeDays) && partialCounts(v.totals) && list(v.exercises, partialSummary) && list(v.days, partialDay)
  && object(v.exclusions) && tally(v.exclusions.performance) && tally(v.exclusions.days);
const partialLane = (v: unknown) => partialFacts(v) && object(v) && object(v.associations) && v.associations.outcome === "daily_lower_record_proportion" && count(v.associations.candidatesEvaluated) && count(v.associations.testableCandidates) && count(v.associations.permutations)
  && object(v.associations.promotion) && v.associations.promotion.status === "not_enabled" && list(v.associations.items, partialAssociation) && pairs(v.associations.detail);

const versions = (raw: Json) => raw.contractVersion === INSIGHTS_CONTRACT && (raw.methodVersion === INSIGHTS_ENGINE_METHOD || raw.methodVersion === INSIGHTS_ENGINE_METHOD_V2) && typeof raw.performanceMethodVersion === "string"
  && date(raw.today) && (raw.integrity === "valid" || raw.integrity === "conflicting_duplicates");
const page = (v: unknown) => object(v) && count(v.limit) && count(v.totalDays) && (v.nextBefore === null || date(v.nextBefore));
const historyBlock = (v: unknown) => object(v) && v.coverage === "complete" && count(v.sessions) && count(v.trainingDays) && count(v.outcomeDays) && (v.firstDate === null || date(v.firstDate)) && (v.lastDate === null || date(v.lastDate));
const metricList = (v: unknown) => list(v, m => object(m) && typeof m.id === "string" && typeof m.name === "string" && stringOrNull(m.unit) && typeof m.valueType === "string" && typeof m.archived === "boolean");
const limitsBlock = (v: unknown) => object(v) && object(v.configurationSnapshots) && count(v.configurationSnapshots.known) && count(v.configurationSnapshots.total) && tally(v.mealTimeEvidence);
const exclusionBlock = (v: unknown) => object(v) && tally(v.performance) && tally(v.source);
const factsBlock = (v: unknown) => object(v) && counts(v.totals) && list(v.exercises, summary) && list(v.days, day) && page(v.page);
/** An empty list is only allowed when the lane has no outcome days to evaluate: never a silent "no relations". */
const relationLane = (v: Json, check: (row: unknown) => boolean) => count(v.outcomeDays) && count(v.candidatesEvaluated) && count(v.testableCandidates) && count(v.permutations) && object(v.promotion) && v.promotion.status === "not_enabled"
  && list(v.items, check) && (v.items as unknown[]).length === (v.outcomeDays ? v.candidatesEvaluated : 0);
const sameDays = (a: unknown, b: unknown) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((row, index) => (row as Json).date === (b[index] as Json).date);

function parseSummary(raw: Json) {
  const { history, facts, metrics, exclusions, limits, relations, partial } = raw;
  const lane = (v: unknown) => object(v) && count(v.candidatesEvaluated) && count(v.outcomeDays);
  if (!historyBlock(history) || !factsBlock(facts) || !metricList(metrics) || !exclusionBlock(exclusions) || !limitsBlock(limits) || !partialFacts(partial)) return undefined;
  if (!object(relations) || !lane(relations.strict) || !lane(relations.partial) || !sameDays((facts as Json).days, (partial as Json).days)) return undefined;
  return raw as unknown as InsightsSummary;
}
function parseDays(raw: Json) {
  const { facts, partial } = raw;
  if (!object(facts) || !list(facts.days, day) || !page(facts.page) || !object(partial) || !partialLabels(partial) || !list(partial.days, partialDay) || !sameDays(facts.days, partial.days)) return undefined;
  return raw as unknown as InsightsDaysPage;
}
function parseRelations(raw: Json) {
  const { strict, partial, metrics } = raw;
  if (!metricList(metrics) || !object(strict) || !object(partial) || !partialLabels(partial)) return undefined;
  if (!relationLane(strict, row => relation(row, STATE)) || !relationLane(partial, row => relation(row, PARTIAL_STATE) && String((row as Json).id).startsWith(PARTIAL_ASSOCIATION_PREFIX))) return undefined;
  return raw as unknown as InsightsRelations;
}
function parseRelationDetail(raw: Json) {
  const { lane, id, item, pairs: rows, pairsTotal, metrics, partial } = raw;
  if (!count(pairsTotal)) return undefined;
  if (!metricList(metrics) || typeof id !== "string" || (lane !== "strict" && lane !== "partial") || (lane === "partial" && !partialLabels(partial))) return undefined;
  if (lane === "partial" ? !id.startsWith(PARTIAL_ASSOCIATION_PREFIX) : id.startsWith(PARTIAL_ASSOCIATION_PREFIX)) return undefined;
  if (item === null) return rows === null && pairsTotal === 0 ? raw as unknown as InsightsRelationDetail : undefined;
  if (!(lane === "partial" ? partialAssociation(item) : association(item)) || (item as Json).id !== id) return undefined;
  // Fewer than the total is a page of the newest ones: the total is what says more exist.
  return pairs({ id, pairs: rows }) && Array.isArray(rows) && rows.length <= (pairsTotal as number) ? raw as unknown as InsightsRelationDetail : undefined;
}

const UNIT = new Set(["kg", "lingotes", "reps", "seconds"]);
const SIGNAL = new Set(["reps_at_load", "load_at_reps", "bodyweight_reps", "time"]);
const RECORD = new Set(["load", "reps_at_load", "bodyweight_reps", "time"]);
const ids = (v: unknown) => list(v, row => typeof row === "string");
const countOrNull = (v: unknown) => v === null || count(v);
const evidenceSet = (v: unknown) => object(v) && typeof v.id === "string" && typeof v.blockId === "string" && countOrNull(v.blockOrder) && countOrNull(v.setNumber)
  && typeof v.completed === "boolean" && numberOrNull(v.amount) && numberOrNull(v.load);
const evidenceSide = (v: unknown) => object(v) && uuid(v.sessionId) && (v.date === null || date(v.date)) && list(v.sets, evidenceSet) && ids(v.excludedSetIds);
const signal = (v: unknown) => object(v) && SIGNAL.has(String(v.kind)) && numberOrNull(v.anchor) && finite(v.current) && finite(v.reference) && finite(v.delta) && ids(v.currentSetIds) && ids(v.referenceSetIds);
const record = (v: unknown) => object(v) && RECORD.has(String(v.kind)) && numberOrNull(v.anchor) && finite(v.current) && finite(v.previousMaximum) && typeof v.isNewHigh === "boolean";
const evidenceContext = (v: unknown) => v === null || (object(v) && stringOrNull(v.weightMode) && (v.unit === null || UNIT.has(String(v.unit))) && stringOrNull(v.implement) && stringOrNull(v.configuration));
/** What a comparison rests on. A signal must point at sets of its own sides: evidence that names no recorded set is not evidence. */
const evidenceItem = (v: unknown, lane: "strict" | "partial") => {
  if (!object(v) || typeof v.name !== "string" || typeof v.reason !== "string" || !evidenceContext(v.context) || !evidenceSide(v.current) || !list(v.evidence, signal) || !list(v.records, record) || !tally(v.exclusions)) return false;
  if (lane === "strict" ? !STATUS.has(String(v.status)) || "reading" in v : !READING.has(String(v.reading)) || "status" in v) return false;
  const reference = v.reference;
  if (reference !== null && (!evidenceSide(reference) || !count((reference as Json).ageDays))) return false;
  const own = (side: unknown) => new Set(((side as Json | null)?.sets as Json[] | undefined ?? []).map(set => set.id));
  const current = own(v.current), earlier = own(reference);
  return (v.evidence as Json[]).every(row => (reference !== null) && (row.currentSetIds as string[]).every(id => current.has(id)) && (row.referenceSetIds as string[]).every(id => earlier.has(id)));
};
function parseEvidence(raw: Json) {
  const { lane, sessionId, exerciseId, item, partial } = raw;
  if ((lane !== "strict" && lane !== "partial") || !uuid(sessionId) || !uuid(exerciseId) || (lane === "partial" && !partialLabels(partial))) return undefined;
  return item === null || (evidenceItem(item, lane) && String(((item as Json).current as Json).sessionId).toLowerCase() === String(sessionId).toLowerCase()) ? raw as unknown as InsightsExerciseEvidence : undefined;
}

const five = (v: unknown) => list(v, count) && (v as unknown[]).length === 5;
const sum = (v: unknown) => (v as number[]).reduce((total, value) => total + value, 0);
const PRIOR_REASONS = ["not_recorded", "unreadable", "capture_unknown", "after_first_set"];
/**
 * Every count adds up: answered ones split into captures and sources, the ones at the finish into prior levels and the not
 * comparable, and those by reason. A summary whose parts do not match its whole is refused, never shown.
 */
function feelingOutcome(v: unknown, kind: string) {
  if (!object(v) || v.kind !== kind || v.outcomeKey !== `${kind}Post` || v.priorKey !== `${kind}Pre` || v.instrument !== "energy-fatigue/1" || v.methodVersion !== "insights-feeling-outcomes/1") return false;
  const { sessions, capture, source, byPrior, priorNotComparable, days, associations } = v;
  if (!object(sessions) || !["completed", "answered", "notRecorded", "unreadable", "otherInstrument"].every(k => count(sessions[k]))) return false;
  if ((sessions.answered as number) + (sessions.notRecorded as number) + (sessions.unreadable as number) + (sessions.otherInstrument as number) !== sessions.completed) return false;
  if (!object(capture) || !["atFinish", "late", "captureUnknown", "beforeStart"].every(k => count(capture[k])) || sum(Object.values(capture)) !== sessions.answered) return false;
  if (!object(source) || !["mobile", "web", "unknown"].every(k => count(source[k])) || sum(Object.values(source)) !== sessions.answered) return false;
  if (!Array.isArray(byPrior) || byPrior.length !== 5 || !byPrior.every((row, index) => object(row) && row.prior === index + 1 && five(row.posts))) return false;
  if (!object(priorNotComparable) || !five(priorNotComparable.posts) || !object(priorNotComparable.reasons) || !PRIOR_REASONS.every(k => count((priorNotComparable.reasons as Json)[k]))) return false;
  if (sum(Object.values(priorNotComparable.reasons as Json)) !== sum(priorNotComparable.posts)) return false;
  if (sum(byPrior.flatMap(row => (row as Json).posts as number[])) + sum(priorNotComparable.posts) !== capture.atFinish) return false;
  if (kind === "energy" ? !count(v.legacyEnergyOnly) : v.legacyEnergyOnly !== null) return false;
  if (!(v.firstDate === null || date(v.firstDate)) || !(v.lastDate === null || date(v.lastDate))) return false;
  if (!object(days) || !count(days.eligible) || !tally(days.exclusions) || (days.eligible as number) + sum(Object.values(days.exclusions as Json)) !== capture.atFinish) return false;
  return object(associations) && associations.status === "not_published" && associations.reason === "validation_pending" && Object.keys(associations).length === 2;
}
function parseFeelings(raw: Json) {
  const { outcomes } = raw;
  return Array.isArray(outcomes) && outcomes.length === 2 && feelingOutcome(outcomes[0], "energy") && feelingOutcome(outcomes[1], "fatigue") ? raw as unknown as InsightsFeelingOutcomes : undefined;
}

/** The reference date is explicit in new opt-in views; installed clients keep `view=period` unchanged. */
export function validPeriodAnchor(value: unknown): value is string {
  if (!date(value) || (value as string) < "0100-01-01") return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}
function pinnedFrame(raw: Json) {
  if (!validPeriodAnchor(raw.asOf) || raw.asOf > String(raw.today) || !object(raw.period) || raw.periodMethodVersion !== "insights-period/1") return false;
  const expected = periodOf(raw.asOf), p = raw.period;
  return p.start === expected.start && p.end === expected.end && p.days === expected.days && Array.isArray(p.months)
    && p.months.length === 3 && p.months.every((m, i) => m === expected.months[i]);
}
function parsePeriodFeelings(raw: Json) {
  if (!pinnedFrame(raw) || !parseFeelings(raw)) return undefined;
  const p = raw.period as Json;
  return (raw.outcomes as Json[]).every(o => (o.firstDate === null || String(o.firstDate) >= String(p.start) && String(o.firstDate) <= String(p.end))
    && (o.lastDate === null || String(o.lastDate) >= String(p.start) && String(o.lastDate) <= String(p.end))) ? raw as unknown as InsightsPeriodFeelings : undefined;
}
function parsePeriodNutrition(raw: Json) {
  if (!pinnedFrame(raw) || raw.ingestionCompleteKnown !== false || !Array.isArray(raw.days) || !count(raw.daysWithoutMeals)) return undefined;
  const p = raw.period as Json;
  if (raw.days.length + (raw.daysWithoutMeals as number) !== p.days) return undefined;
  const valid = raw.days.every((d: unknown, index: number) => {
    if (!object(d) || !validPeriodAnchor(d.date) || d.date < String(p.start) || d.date > String(p.end) || !count(d.activeMeals) || (d.activeMeals as number) < 1) return false;
    if (index && String((raw.days as Json[])[index - 1]!.date) <= String(d.date)) return false;
    return ["calories", "proteinG", "carbsG", "fatG"].every(key => {
      const n = d[key]; return object(n) && finite(n.recorded) && count(n.missing) && (n.missing as number) <= (d.activeMeals as number)
        && (n.missing !== d.activeMeals || n.recorded === 0);
    });
  });
  return valid ? raw as unknown as InsightsPeriodNutrition : undefined;
}

const month = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}$/.test(v);
const nonNegative = (v: unknown) => finite(v) && (v as number) >= 0;
const weighIn = (v: unknown) => object(v) && date(v.date) && finite(v.value) && (v.value as number) > 0;
const week = (v: unknown) => object(v) && date(v.start) && date(v.end) && list(v.weighIns, weighIn) && (v.median === null || (finite(v.median) && (v.weighIns as unknown[]).length >= 3))
  && (v.median !== null || (v.weighIns as unknown[]).length < 3);
const CHANGE = new Set(["computed", "week_insufficient", "previous_week_insufficient"]);
const weekChange = (v: unknown) => object(v) && date(v.weekStart) && date(v.previousStart) && CHANGE.has(String(v.reason)) && (v.reason === "computed") === finite(v.change) && (v.change === null || finite(v.change));
const nutrientBlock = (v: unknown, daysWithMeals: number) => object(v) && count(v.knownDays) && count(v.partialDays) && (v.knownDays as number) + (v.partialDays as number) === daysWithMeals
  && nonNegative(v.recorded) && (v.dailyMedian === null ? v.knownDays === 0 : nonNegative(v.dailyMedian) && (v.knownDays as number) > 0);
/**
 * The last three whole months. Its dates must be what they say (whole months, the counts adding up), each part keeps its own
 * method, and no association comes in it.
 */
function parsePeriod(raw: Json) {
  const { period, training, routines, feelings, nutrition, weight, associations } = raw;
  if (raw.periodMethodVersion !== "insights-period/1" || !object(period) || !date(period.start) || !date(period.end) || !list(period.months, month) || !count(period.days)) return undefined;
  // The period is the one its own date announces (#416): the three whole months before today's, with their exact first and last
  // day, in order, and their number of days. Any other dates contradict what the answer says it describes.
  const expected = periodOf(String(raw.today));
  if (period.start !== expected.start || period.end !== expected.end || period.days !== expected.days
    || (period.months as string[]).length !== expected.months.length || (period.months as string[]).some((value, index) => value !== expected.months[index])) return undefined;
  const inside = (value: unknown) => date(value) && (value as string) >= expected.start && (value as string) <= expected.end;
  if (!object(training) || !count(training.sessions) || !count(training.trainingDays) || !count(training.multipleSessionDays) || !counts(training.strict) || !partialCounts(training.partial)) return undefined;
  if ((training.trainingDays as number) > (training.sessions as number) || (training.multipleSessionDays as number) > (training.trainingDays as number)) return undefined;
  if (!object(routines) || !["none", "single", "sequence", "alternating"].includes(String(routines.order))
    || !list(routines.items, row => object(row) && stringOrNull(row.routineId) && stringOrNull(row.name) && count(row.sessions) && date(row.first) && date(row.last))) return undefined;
  if (!Array.isArray(feelings) || feelings.length !== 2 || !feelingOutcome(feelings[0], "energy") || !feelingOutcome(feelings[1], "fatigue")) return undefined;
  if (!object(nutrition) || !count(nutrition.daysWithMeals) || (nutrition.daysWithMeals as number) > (period.days as number) || !object(nutrition.nutrients)
    || !["calories", "proteinG", "carbsG", "fatG"].every(key => nutrientBlock((nutrition.nutrients as Json)[key], nutrition.daysWithMeals as number))) return undefined;
  if (!object(weight) || weight.methodVersion !== "body-weekly/1" || !list(weight.weeks, week) || !list(weight.changes, weekChange) || !count(weight.weighIns)
    || !object(weight.outside) || !count(weight.outside.partialWeeks) || !count(weight.outside.currentWeek) || !count(weight.outside.invalid)) return undefined;
  if ((weight.changes as unknown[]).length !== Math.max(0, (weight.weeks as unknown[]).length - 1)) return undefined;
  // Every dated part lies inside the period: whole weeks, their weigh-ins and the routines' first and last sessions.
  if (!(weight.weeks as Json[]).every(row => inside(row.start) && inside(row.end) && (row.weighIns as Json[]).every(entry => inside(entry.date)))) return undefined;
  if (!(routines.items as Json[]).every(row => inside(row.first) && inside(row.last) && (row.first as string) <= (row.last as string))) return undefined;
  return object(associations) && associations.status === "not_computed_for_period" ? raw as unknown as InsightsPeriodSummary : undefined;
}

/** The views the route answers with. Consistent patterns stay impossible in this contract until the risk budget is decided. */
export function parsePerformanceInsights(raw: unknown): InsightsResponse | undefined {
  if (!object(raw) || !versions(raw) || typeof raw.sourceRevision !== "string") return undefined;
  if (raw.view === 'session-temporal') return parseTemporal(raw);
  if(raw.view==='coincidence-evidence')return parseCoincidencePage(raw);
  if (raw.view === 'period-explore') return parseExploration(raw);
  if (raw.view === "period-feelings") return parsePeriodFeelings(raw);
  if (raw.view === "period-nutrition") return parsePeriodNutrition(raw);
  if (raw.view === "period-at") return pinnedFrame(raw) && parsePeriod({ ...raw, today: raw.asOf }) ? raw as unknown as InsightsPinnedPeriodSummary : undefined;
  return raw.view === "summary" ? parseSummary(raw) : raw.view === "days" ? parseDays(raw) : raw.view === "relations" ? parseRelations(raw) : raw.view === "relation" ? parseRelationDetail(raw) : raw.view === "evidence" ? parseEvidence(raw) : raw.view === "feelings" ? parseFeelings(raw) : raw.view === "period" ? parsePeriod(raw) : undefined;
}

const instantValue = (v: unknown) => typeof v === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const coincidencePost=(p:unknown)=>object(p)&&['recorded','before_end','late','unknown_time','not_recorded','unreadable','other_instrument'].includes(String(p.state))&&(p.state==='recorded'?Number.isInteger(p.value)&&Number(p.value)>=1&&Number(p.value)<=5:p.value===null);
function coincidenceRow(r:unknown,inside:(d:unknown)=>boolean) {
  return object(r)&&uuid(r.id)&&inside(r.date)&&typeof r.name==='string'&&stringOrNull(r.routineId)&&stringOrNull(r.routineName)&&stringOrNull(r.startedAt)&&counts(r.strict)&&(r.partial===null||partialCounts(r.partial))
    &&object(r.protein)&&['recorded','no_registered_meal','partial_macro','untimed_meal_in_scope','unverified_meal_time_in_scope','no_start_time','invalid','unavailable'].includes(String(r.protein.state))&&(r.protein.state==='recorded'?finite(r.protein.value)&&r.protein.value>=0:r.protein.value===null)
    &&(r.band===null||['morning','midday','afternoon','night'].includes(String(r.band)))&&object(r.post)&&coincidencePost(r.post.energy)&&coincidencePost(r.post.fatigue);
}
function coincidences(v: unknown, period: Json): boolean {
  if(!object(v)||v.methodVersion!=='insights-coincidences/1'||v.claim!=='descriptive_only'||!Array.isArray(v.sessionRows)||!Array.isArray(v.weekRows))return false;
  const inside=(d:unknown)=>validPeriodAnchor(d)&&d>=String(period.start)&&d<=String(period.end);
  if(!v.sessionRows.every(r=>coincidenceRow(r,inside)))return false;
  const ids=new Set(v.sessionRows.map(r=>(r as Json).id));if(ids.size!==v.sessionRows.length)return false;
  const status=(s:unknown)=>s==='described'||s==='insufficient';
  const references=(g:Json)=>Array.isArray(g.ids)&&new Set(g.ids).size===g.ids.length&&g.ids.every(id=>ids.has(id))&&g.sessions===g.ids.length;
  const routines=(g:Json)=>Array.isArray(g.routines)&&g.routines.every(r=>object(r)&&stringOrNull(r.id)&&stringOrNull(r.name)&&count(r.sessions))&&g.routines.reduce((s,r)=>s+Number((r as Json).sessions),0)===g.sessions;
  const total=(c:unknown,keys:string[])=>object(c)&&keys.every(k=>count(c[k]))&&Number(c.comparable)<=Number(c.total);
  if(!object(v.protein)||!numberOrNull(v.protein.cut)||!status(v.protein.status)||typeof v.protein.strictReady!=='boolean'||typeof v.protein.partialReady!=='boolean'||v.protein.total!==ids.size||!count(v.protein.eligible)||!tally(v.protein.exclusions)
    ||!Array.isArray(v.protein.groups)||v.protein.groups.length!==2||!v.protein.groups.every((g,i)=>object(g)&&g.key===(i?'upper':'lower')&&references(g)&&routines(g)&&count(g.strictSessions)&&count(g.partialSessions)&&Number(g.strictSessions)<=Number(g.sessions)&&Number(g.partialSessions)<=Number(g.sessions)
      &&total(g.strict,['improved','observedStable','declined','ambiguous','insufficient','total','comparable'])&&total(g.partial,['higher','same','lower','ambiguous','insufficient','total','comparable'])))return false;
  const pg=v.protein.groups as Json[];
  const uniquePartition=(groups:Json[],key:string)=>{const refs=groups.flatMap(g=>g[key] as unknown[]);return new Set(refs).size===refs.length;};
  if(!uniquePartition(pg,'ids'))return false;
  if(pg.reduce((n,g)=>n+Number(g.sessions),0)!==v.protein.eligible||Number(v.protein.eligible)+Object.values(v.protein.exclusions as Json).reduce<number>((n,c)=>n+Number(c),0)!==ids.size)return false;
  const ordinal=(o:unknown,n:unknown)=>object(o)&&Array.isArray(o.posts)&&o.posts.length===5&&o.posts.every(count)&&o.total===n&&count(o.eligible)&&tally(o.exclusions)&&o.posts.reduce((s,x)=>s+Number(x),0)===o.eligible
    &&Number(o.eligible)+Object.values(o.exclusions as Json).reduce<number>((s,x)=>s+Number(x),0)===n;
  if(!object(v.timing)||v.timing.total!==ids.size||!count(v.timing.unknownStart)||typeof v.timing.energyReady!=='boolean'||typeof v.timing.fatigueReady!=='boolean'||!Array.isArray(v.timing.groups)||v.timing.groups.length!==4
    ||!v.timing.groups.every((g,i)=>object(g)&&g.key===['morning','midday','afternoon','night'][i]&&references(g)&&routines(g)&&ordinal(g.energy,g.sessions)&&ordinal(g.fatigue,g.sessions)))return false;
  if((v.timing.groups as Json[]).reduce((n,g)=>n+Number(g.sessions),0)+Number(v.timing.unknownStart)!==ids.size)return false;
  if(!uniquePartition(v.timing.groups as Json[],'ids'))return false;
  if(!v.weekRows.every(w=>object(w)&&inside(w.start)&&inside(w.end)&&String(w.start)<=String(w.end)&&typeof w.wholeWeek==='boolean'&&numberOrNull(w.proteinPerRecordedDay)&&count(w.completeDays)&&count(w.partialDays)&&count(w.unknownDays)
    &&numberOrNull(w.median)&&Array.isArray(w.weighIns)&&w.weighIns.every(weighIn)&&numberOrNull(w.change)&&['computed','week_insufficient','previous_week_insufficient','no_previous_week'].includes(String(w.changeReason))&&(w.changeReason==='computed'?w.change!==null:w.change===null)
    &&(w.previousStart===null||validPeriodAnchor(w.previousStart))&&Array.isArray(w.days)&&w.days.length>=1&&w.days.length<=7&&Number(w.completeDays)+Number(w.partialDays)+Number(w.unknownDays)===w.days.length
    &&w.days.every(d=>object(d)&&inside(d.date)&&count(d.records)&&(d.protein===null||recorded(d.protein)))))return false;
  const starts=new Set(v.weekRows.map(w=>(w as Json).start));if(starts.size!==v.weekRows.length)return false;
  if(!object(v.body)||!numberOrNull(v.body.cut)||!status(v.body.status)||v.body.total!==starts.size||!count(v.body.excludedNutrition)||!Array.isArray(v.body.groups)||v.body.groups.length!==2
    ||!v.body.groups.every((g,i)=>object(g)&&g.key===(i?'upper':'lower')&&Array.isArray(g.starts)&&new Set(g.starts).size===g.starts.length&&g.starts.every(s=>starts.has(s))&&g.weeks===g.starts.length
      &&['eligible','increased','same','decreased','completeDays','partialDays','unknownDays'].every(k=>count(g[k]))&&Number(g.eligible)<=Number(g.weeks)&&Number(g.increased)+Number(g.same)+Number(g.decreased)===g.eligible))return false;
  return uniquePartition(v.body.groups as Json[],'starts')&&(v.body.groups as Json[]).reduce((n,g)=>n+Number(g.weeks),0)+Number(v.body.excludedNutrition)===starts.size;
}
function parseExploration(raw: Json) {
  if(!pinnedFrame(raw)||raw.explorationMethodVersion!=='insights-week-explore/1'||raw.associations!=='not_computed'||!Array.isArray(raw.weeks)||!Array.isArray(raw.metrics))return undefined;
  if(!raw.metrics.every(m=>object(m)&&uuid(m.id)&&typeof m.name==='string'&&stringOrNull(m.unit)&&typeof m.valueType==='string'&&typeof m.archived==='boolean'))return undefined;
  let expected=String((raw.period as Json).start),total=0;
  for(const w of raw.weeks) {
    if(!object(w)||!validPeriodAnchor(w.start)||!validPeriodAnchor(w.end)||typeof w.wholeWeek!=='boolean'||!Array.isArray(w.days)||!w.days.length||w.days.length>7||w.start!==expected||!Array.isArray(w.feelings)||w.feelings.length!==2||!feelingOutcome(w.feelings[0],'energy')||!feelingOutcome(w.feelings[1],'fatigue'))return undefined;
    if(w.priorFeelings!==undefined) {
      if(!Array.isArray(w.priorFeelings)||w.priorFeelings.length!==2)return undefined;
      for(const [i,kind] of ['energy','fatigue'].entries()) {
        const f=w.priorFeelings[i], sessions=((w.feelings[i] as Json).sessions as Json).completed;
        if(!object(f)||f.kind!==kind||!Array.isArray(f.values)||f.values.length!==5||!f.values.every(count)
          ||!['sessions','eligible','late','timingUnknown','notRecorded','unreadable','otherInstrument'].every(k=>count(f[k]))
          ||f.values.reduce((n,v)=>n+Number(v),0)!==f.eligible
          ||Number(f.eligible)+Number(f.late)+Number(f.timingUnknown)+Number(f.notRecorded)+Number(f.unreadable)+Number(f.otherInstrument)!==f.sessions
          ||f.sessions!==sessions)return undefined;
      }
    }
    if(w.weight!==null&&(!object(w.weight)||!validPeriodAnchor(w.weight.start)||!validPeriodAnchor(w.weight.end)||!numberOrNull(w.weight.median)||!list(w.weight.weighIns,weighIn)))return undefined;
    if(object(w.weight)&&(w.weight.start!==w.start||w.weight.end!==w.end||!Array.isArray(w.weight.weighIns)||w.weight.weighIns.some(v=>!object(v)||String(v.date)<w.start!||String(v.date)>w.end!)||w.weight.median!==null&&((w.weight.weighIns as unknown[]).length<3||Number(w.weight.median)<=0)))return undefined;
    if(w.weightChange!==null&&(!object(w.weightChange)||!validPeriodAnchor(w.weightChange.weekStart)||!validPeriodAnchor(w.weightChange.previousStart)||!numberOrNull(w.weightChange.change)||!['computed','week_insufficient','previous_week_insufficient'].includes(String(w.weightChange.reason))))return undefined;
    for(const d of w.days) {
      if(!object(d)||d.date!==expected||!(d.training===null||object(d.training)&&count(d.training.sessions)&&Number(d.training.sessions)>0&&counts(d.training.counts))||!(d.partial===null||object(d.partial)&&partialCounts(d.partial.counts))||!nutrition(d.nutrition)
        ||!object(d.weight)||!['recorded','not_recorded','invalid'].includes(String(d.weight.state))||!numberOrNull(d.weight.value)||(d.weight.state==='recorded' ? !finite(d.weight.value)||d.weight.value<=0 : d.weight.value!==null)
        ||!Array.isArray(d.metrics)||!d.metrics.every(m=>object(m)&&uuid(m.metricId)&&finite(m.value)))return undefined;
      expected=new Date(Date.parse(`${expected}T12:00:00Z`)+86_400_000).toISOString().slice(0,10);total++;
    }
    if(w.end!==String((w.days[w.days.length-1] as Json).date))return undefined;
    const full=w.days.length===7&&new Date(`${w.start}T12:00:00Z`).getUTCDay()===1;
    if(w.wholeWeek!==full||!full&&w.weight!==null)return undefined;
  }
  if(raw.coincidenceSummary!==undefined&&!compactCoincidences(raw.coincidenceSummary))return undefined;
  if(raw.coincidences!==undefined&&!coincidences(raw.coincidences,raw.period as Json))return undefined;
  return total===(raw.period as Json).days?raw as unknown as PeriodExploration:undefined;
}
function refs(v: unknown): boolean {
  return object(v) && count(v.total) && count(v.omitted) && Array.isArray(v.rows) && v.rows.length <= 20 && v.rows.length + Number(v.omitted) === v.total
    && Array.isArray(v.dates) && v.dates.every(validPeriodAnchor) && new Set(v.dates).size === v.dates.length
    && new Set(v.rows.map(r => object(r) ? r.id : null)).size === v.rows.length
    && v.rows.every(r => object(r) && uuid(r.id) && validPeriodAnchor(r.date) && ['meal','legacy_daily_summary'].includes(String(r.entryKind)) && (r.at === null || instantValue(r.at))
      && ['explicit','registration','unverified','unknown'].includes(String(r.timeEvidence)) && ['calories','proteinG','carbsG','fatG'].every(k => r[k] === null || finite(r[k]) && Number(r[k]) >= 0));
}
function parseTemporal(raw: Json) {
  if (raw.contextMethodVersion !== 'session-temporal/1' || raw.timezone !== 'America/Argentina/Cordoba' || !validPeriodAnchor(raw.date) || raw.date > String(raw.today)
    || !instantValue(raw.calculatedAt) || raw.ingestionCompleteKnown !== false || raw.associations !== 'not_computed' || !Array.isArray(raw.sessions)) return undefined;
  if (new Set(raw.sessions.map(s => object(s) ? s.sessionId : null)).size !== raw.sessions.length) return undefined;
  const valid = raw.sessions.every(s => {
    if (!object(s) || !uuid(s.sessionId) || typeof s.name !== 'string' || ![s.startedAt,s.endedAt].every(v => v === null || instantValue(v))
      || !numberOrNull(s.durationMinutes) || s.durationMinutes !== null && Number(s.durationMinutes) < 0 || !object(s.before) || !preWindow(s.before.carbsPre3h) || !preStart(s.before.preStart)
      || !(s.before.evidence === null || refs(s.before.evidence)) || !refs(s.before.lastMeal)
      || !(s.before.coverage3h === null || object(s.before.coverage3h) && count(s.before.coverage3h.knownMeals) && count(s.before.coverage3h.uncertainMeals))
      || !['recorded','no_end_time','invalid_time'].includes(String(s.timingState))) return false;
    if (s.timingState !== 'recorded') return s.post === null && s.durationMinutes === null && (s.timingState !== 'no_end_time' || s.endedAt === null);
    if (!instantValue(s.endedAt) || Date.parse(String(s.endedAt)) > Date.parse(String(raw.calculatedAt))
      || (s.startedAt === null ? s.durationMinutes !== null : s.durationMinutes !== (Date.parse(String(s.endedAt)) - Date.parse(String(s.startedAt))) / 60_000)) return false;
    const p = s.post;
    return object(p) && instantValue(p.from) && instantValue(p.to) && instantValue(s.endedAt) && Date.parse(String(p.from)) === Date.parse(String(s.endedAt))
      && Date.parse(String(p.to)) - Date.parse(String(p.from)) === 3 * 3_600_000 && typeof p.provisional === 'boolean'
      && p.provisional === (Date.parse(String(raw.calculatedAt)) < Date.parse(String(p.to))) && count(p.knownMeals) && count(p.uncertainMeals)
      && refs(p.evidence) && (p.evidence as Json).total === Number(p.knownMeals) + Number(p.uncertainMeals)
      && Array.isArray(p.overlaps) && p.overlaps.every(uuid) && new Set(p.overlaps).size === p.overlaps.length && !p.overlaps.includes(s.sessionId)
      && object(p.nutrients) && ['calories','proteinG','carbsG','fatG'].every(k => { const n = (p.nutrients as Json)[k]; return object(n) && finite(n.recorded) && n.recorded >= 0 && count(n.missing) && Number(n.missing) <= Number(p.knownMeals) && (n.missing !== p.knownMeals || n.recorded === 0); });
  });
  return valid ? raw as unknown as SessionTemporalDay : undefined;
}

/** The whole pure model, for consumers of the domain module. The route never sends it. */
export function parseCompleteInsights(raw: unknown): InsightsReadModel | undefined {
  if (!object(raw) || !versions(raw)) return undefined;
  const { history, facts, metrics, associations, exclusions, limits } = raw;
  if (!historyBlock(history) || !factsBlock(facts) || !metricList(metrics)) return undefined;
  if (!object(associations) || associations.outcome !== "daily_decline_proportion" || !count(associations.candidatesEvaluated) || !count(associations.testableCandidates) || !count(associations.permutations)
    || !object(associations.promotion) || associations.promotion.status !== "not_enabled" || !list(associations.items, association)) return undefined;
  if (!pairs(associations.detail) || !partialLane(raw.partial)) return undefined;
  if (!exclusionBlock(exclusions) || !limitsBlock(limits)) return undefined;
  return raw as unknown as InsightsReadModel;
}

function compactCoincidences(v:unknown):boolean {
  if(!object(v)||v.methodVersion!=='insights-coincidences/2'||v.claim!=='descriptive_only'||v.sessionRows!==undefined||v.weekRows!==undefined)return false;
  const routines=(o:unknown)=>object(o)&&count(o.distinct)&&count(o.unknownSessions);
  const ordinal=(o:unknown,n:unknown)=>object(o)&&o.total===n&&count(o.eligible)&&Array.isArray(o.posts)&&o.posts.length===5&&o.posts.every(count)&&o.posts.reduce((a,b)=>a+Number(b),0)===o.eligible&&tally(o.exclusions)&&Number(o.eligible)+Object.values(o.exclusions as Json).reduce<number>((a,b)=>a+Number(b),0)===n;
  if(!object(v.protein)||!numberOrNull(v.protein.cut)||!count(v.protein.total)||!count(v.protein.eligible)||!tally(v.protein.exclusions)||typeof v.protein.strictReady!=='boolean'||typeof v.protein.partialReady!=='boolean'||!['described','insufficient'].includes(String(v.protein.status))||!Array.isArray(v.protein.groups)||v.protein.groups.length!==2
    ||!v.protein.groups.every((g,i)=>object(g)&&g.key===(i?'upper':'lower')&&g.ids===undefined&&count(g.sessions)&&object(g.strict)&&counts({...g.strict,coverage:null})&&object(g.partial)&&partialCounts({...g.partial,coverage:null})&&count(g.strictSessions)&&count(g.partialSessions)&&routines(g.routines)))return false;
  if(!object(v.timing)||v.timing.total!==v.protein.total||!count(v.timing.unknownStart)||typeof v.timing.energyReady!=='boolean'||typeof v.timing.fatigueReady!=='boolean'||!Array.isArray(v.timing.groups)||v.timing.groups.length!==4
    ||!v.timing.groups.every((g,i)=>object(g)&&g.key===['morning','midday','afternoon','night'][i]&&g.ids===undefined&&count(g.sessions)&&ordinal(g.energy,g.sessions)&&ordinal(g.fatigue,g.sessions)&&routines(g.routines)))return false;
  if(!object(v.body)||!numberOrNull(v.body.cut)||!count(v.body.total)||!count(v.body.excludedNutrition)||!['described','insufficient'].includes(String(v.body.status))||!Array.isArray(v.body.groups)||v.body.groups.length!==2
    ||!v.body.groups.every((g,i)=>object(g)&&g.key===(i?'upper':'lower')&&g.starts===undefined&&['weeks','eligible','increased','same','decreased','completeDays','partialDays','unknownDays'].every(k=>count(g[k]))&&Number(g.increased)+Number(g.same)+Number(g.decreased)===g.eligible))return false;
  const sum=(gs:unknown[],k:string)=>gs.reduce<number>((n,g)=>n+Number((g as Json)[k]),0);
  return sum(v.protein.groups,'sessions')===v.protein.eligible&&Number(v.protein.eligible)+Object.values(v.protein.exclusions as Json).reduce<number>((n,c)=>n+Number(c),0)===v.protein.total
    &&sum(v.timing.groups,'sessions')+Number(v.timing.unknownStart)===v.timing.total&&sum(v.body.groups,'weeks')+Number(v.body.excludedNutrition)===v.body.total;
}
function parseCoincidencePage(raw:Json) {
  if(!pinnedFrame(raw)||!object(raw.selection)||!validCoincidenceSelection(raw.selection.kind,raw.selection.group)||typeof raw.requestedRevision!=='string'||!count(raw.offset)||Number(raw.offset)%25!==0||!count(raw.total)||!Array.isArray(raw.sessionRows)||raw.sessionRows.length>25)return undefined;
  if(raw.status==='revision_changed')return raw.sessionRows.length===0&&raw.total===0&&raw.nextOffset===null&&raw.requestedRevision!==raw.sourceRevision?raw as unknown as import('../progress/insights-engine/week-exploration').CoincidenceEvidence:undefined;
  if(raw.status!=='ready'||raw.requestedRevision!==raw.sourceRevision||Number(raw.offset)>Number(raw.total)||raw.sessionRows.length!==Math.min(25,Number(raw.total)-Number(raw.offset)))return undefined;
  const end=Number(raw.offset)+raw.sessionRows.length;
  if(raw.nextOffset!==(end<Number(raw.total)?end:null))return undefined;
  const inside=(d:unknown)=>validPeriodAnchor(d)&&d>=String((raw.period as Json).start)&&d<=String((raw.period as Json).end);
  if(!raw.sessionRows.every(r=>coincidenceRow(r,inside)))return undefined;
  if(new Set(raw.sessionRows.map(r=>(r as Json).id)).size!==raw.sessionRows.length)return undefined;
  return raw as unknown as import('../progress/insights-engine/week-exploration').CoincidenceEvidence;
}
