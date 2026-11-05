// Pure strict contract shared by the API and Expo. It accepts only this versioned shape: never a partial read as an empty one.
import { INSIGHTS_PERFORMANCE_PARTIAL_METHOD, PARTIAL_CONTEXT } from "../progress/performance-insights/partial";
import { INSIGHTS_CONTRACT, INSIGHTS_ENGINE_METHOD, INSIGHTS_ENGINE_METHOD_V2, INSIGHTS_ENGINE_PARTIAL_METHOD, INSIGHTS_ENGINE_PARTIAL_METHOD_V2, PARTIAL_ASSOCIATION_PREFIX, type InsightsDaysPage, type InsightsReadModel, type InsightsRelationDetail, type InsightsRelations, type InsightsResponse, type InsightsSummary } from "../progress/insights-engine/types";

export type { AssociationResult, AssociationState, CandidateDefinition, DayFact, ExerciseFact, ExerciseSummary, InsightsDaysPage, InsightsReadModel, InsightsRelationDetail, InsightsRelations, InsightsResponse, InsightsSummary, PartialAssociationState, PartialRelationSummary, RelationSummary, NutritionContext, PartialAssociationResult, PartialDayFact, PartialExerciseFact, PartialExerciseSummary, PartialLane, SessionFact, SessionFeeling } from "../progress/insights-engine/types";
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
  && stringOrNull(v.referenceSessionId) && numberOrNull(v.referenceAgeDays) && typeof v.highestInPartialContext === "boolean";
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

/** The views the route answers with. Consistent patterns stay impossible in this contract until the risk budget is decided. */
export function parsePerformanceInsights(raw: unknown): InsightsResponse | undefined {
  if (!object(raw) || !versions(raw) || typeof raw.sourceRevision !== "string") return undefined;
  return raw.view === "summary" ? parseSummary(raw) : raw.view === "days" ? parseDays(raw) : raw.view === "relations" ? parseRelations(raw) : raw.view === "relation" ? parseRelationDetail(raw) : undefined;
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
