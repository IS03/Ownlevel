import type { INSIGHTS_PERFORMANCE_PARTIAL_METHOD, PARTIAL_CONTEXT, PartialCounts, PartialReading } from "../performance-insights/partial";
import type { DirectEvidence, ExclusionReason, PerformanceCounts, PerformanceStatus, PerformanceUnit, RecordFact } from "../performance-insights/types";

/** Versioned, opt-in method. Facts, context and associations stay in separate lanes of the read model. */
export const INSIGHTS_ENGINE_METHOD = "insights-engine/1" as const;
/** Opt-in (#367): the family adds declared sleep nights and same-day body weight. A client that does not ask keeps /1. */
export const INSIGHTS_ENGINE_METHOD_V2 = "insights-engine/2" as const;
export type InsightsEngineMethodVersion = typeof INSIGHTS_ENGINE_METHOD | typeof INSIGHTS_ENGINE_METHOD_V2;
export type InsightsEngineMethod = 1 | 2;
/** Associations over the partial outcome: their own family, ids and calibration, never added to those of the strict method. */
export const INSIGHTS_ENGINE_PARTIAL_METHOD = "insights-engine-partial/1" as const;
export const INSIGHTS_ENGINE_PARTIAL_METHOD_V2 = "insights-engine-partial/2" as const;
export type InsightsEnginePartialMethodVersion = typeof INSIGHTS_ENGINE_PARTIAL_METHOD | typeof INSIGHTS_ENGINE_PARTIAL_METHOD_V2;
export const PARTIAL_ASSOCIATION_PREFIX = "partial:";
export const INSIGHTS_CONTRACT = "performance-insights/1" as const;
export const INSIGHTS_RISK_BUDGET_CANDIDATE = 0.01;

/** Rows as read from their tables. Null always means unknown or not recorded, never zero. */
export type InsightsSource = {
  sessions: readonly {
    id: string; date: string | null; routineId: string | null; routineName: string | null; name: string | null;
    status: "in_progress" | "completed" | "discarded"; startedAt: string | null; endedAt: string | null;
    performanceLevel: number | null; painLevel: number | null; legacyEnergyLevel: number | null;
    /** day_logs.weight_kg of the session's logical day, the body domain's one value per date. Null: none recorded. */
    dayWeightKg?: number | null;
  }[];
  exercises: readonly {
    id: string; sessionId: string; exerciseId: string; name: string; implement: string | null; weightMode: string | null; isCompleted: boolean;
    /** Historical snapshot. No table stores one yet, so the loader reads null: unknown, never an identity by default. */
    configuration: string | null;
    /** `exercise_order` of the block in its session. Read only by the evidence detail; absent means unknown. */
    order?: number | null;
  }[];
  /** `setNumber`: the set's `set_number` in its block. Read only by the evidence detail; absent means unknown. */
  sets: readonly { id: string; sessionExerciseId: string; actualReps: number | null; actualLoad: number | null; isCompleted: boolean; completedAt: string | null; setNumber?: number | null }[];
  feelings: readonly { sessionId: string; revision: number; facts: unknown }[];
  /** systemKey identifies the account's sleep metric; a name or a unit never does. */
  metricDefinitions: readonly { id: string; name: string; unit: string | null; valueType: string; archived: boolean; systemKey?: string | null }[];
  /** sleepNight: whether the value carries a valid declaration of which night it means. Absent: undeclared. */
  metricValues: readonly { metricId: string; date: string; value: unknown; sleepNight?: SleepNightEvidence }[];
  meals: readonly {
    id: string; date: string; consumedAt: string | null; rawInput: unknown; entryKind: string | null; sourceType: string | null;
    /** Who set the time, recorded when it was written. Null: nobody can tell, including every row older than the column. */
    consumedAtSource: string | null;
    /** The import run that wrote this row, if one did. It is what makes a marker in raw_input believable. */
    importRunId: string | null;
    calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null;
  }[];
};

/** `explicit` needs a positive marker. `unverified` has an instant but no proof of who set it, or why. */
export type MealTimeEvidence = "explicit" | "registration" | "unverified" | "unknown";
/** declared: the night that ended the morning of its date, for this exact version of the value. stale: declared for an older one. */
export type SleepNightEvidence = "declared" | "undeclared" | "stale_declaration";
export type FeelingKey = "energyPre" | "fatiguePre" | "energyPost" | "fatiguePost";
/** Order of the capture against the session. The client clock is never treated as verified. */
export type FeelingTiming = "before_start" | "before_first_set" | "after_first_set" | "after_end" | "post_declared" | "unknown";
export type SessionFeeling = { value: number; timing: FeelingTiming; temporalQuality: "unknown" | "unverified_client_clock" };

export type CandidateFamily = "metric" | "nutrition" | "meal_window" | "feeling" | "sleep" | "body";
export type CandidateWindow = "same_day" | "previous_day" | "pre_3h" | "same_day_before_start" | "session" | "night_before";
/** What can be said about the order of the exposure and the training. Same-day totals have no order. */
export type TemporalBasis = "same_day_unordered" | "previous_logical_day" | "explicit_meal_time_before_start" | "declared_pre_unverified_clock"
  /** Sleep declared as the night that ended the morning of the training day. */
  | "declared_night_ending_on_day"
  /** Sleep with no declared night: its date could mean either night, so it stays apart and says so. */
  | "undeclared_sleep_date";
export type CandidateDefinition = {
  id: string; family: CandidateFamily; window: CandidateWindow; temporalBasis: TemporalBasis;
  /** Metric UUID, nutrient or feeling key. Never interpreted through a name or a unit. */
  subject: string;
};
export type Candidate = {
  definition: CandidateDefinition;
  values: ReadonlyMap<string, number>;
  exclusions: Readonly<Record<string, number>>;
  /** Other windows or evidence rules: they show fragility and can never replace the preregistered value. */
  sensitivities?: Readonly<Record<string, ReadonlyMap<string, number>>>;
};
export type ObservationRow = { date: string; y: number; ySensitivity: number; routineKey: string | null };

export type AssociationState = "insufficient_data" | "no_clear_signal" | "exploratory";
export type AssociationReason = "too_few_pairs" | "no_variation" | "no_local_variation" | "sparse_variation" | "weak_or_unstable" | "passes_exploratory_gate";
export type AssociationGroup = { days: number; min: number; max: number; meanOutcome: number };
/** Split at the median on whichever side of the tie is more balanced, chosen from the exposure alone. Equal values never separate. */
export type AssociationGroups = { rule: "median_balanced_ties"; cut: number; lowIncludesCut: boolean; low: AssociationGroup; high: AssociationGroup };
export type AssociationResult = {
  id: string; definition: CandidateDefinition; state: AssociationState; reason: AssociationReason;
  pairs: number; outcomeDays: number; coverage: number | null;
  exclusions: Record<string, number>;
  rho: number | null; localRho: number | null; permutationP: number | null; familyAdjustedP: number | null;
  /** Descriptive only and never used to decide the state. Means of the day's decline proportion, not a percentage of strength. */
  groups: AssociationGroups | null;
  stability: {
    firstHalfRho: number | null; secondHalfRho: number | null; equalSessionRho: number | null; withoutExtremesRho: number | null;
    leaveOneRoutineOutAgrees: boolean | null; selectiveAbsenceGap: number | null;
  };
  sensitivities: Record<string, { pairs: number; rho: number | null }>;
};

export type ExerciseFact = {
  exerciseId: string; name: string; status: PerformanceStatus; reason: string;
  referenceSessionId: string | null; referenceAgeDays: number | null;
  /** Logical date of the compatible reference session, when there is one. Added later: an older answer may not carry it. */
  referenceDate?: string | null;
  newHigh: boolean;
};
export type SessionFact = {
  sessionId: string; name: string | null; routineId: string | null; routineName: string | null; startedAt: string | null; endedAt: string | null;
  counts: PerformanceCounts; exercises: ExerciseFact[];
  /** Context recorded around the training. Post feelings stay here and are never an exposure. */
  context: {
    feelings: Partial<Record<FeelingKey, SessionFeeling>>;
    /** Answers that exist but could not be read. Present only when there is one: an absent key is "not recorded". */
    unreadableFeelings?: FeelingKey[];
    legacy: { energyLevel: number | null; performanceLevel: number | null; painLevel: number | null };
    carbsPre3h: { value: number | null; state: "recorded" | "no_registered_meal" | "partial_macro" | "untimed_meal_in_scope" | "unverified_meal_time_in_scope" | "no_start_time" };
  };
};
export type NutritionContext = {
  activeMeals: number;
  /** Sum of what was recorded. `missing` meals have no value for it, so the total is partial. */
  calories: { recorded: number; missing: number }; proteinG: { recorded: number; missing: number };
  carbsG: { recorded: number; missing: number }; fatG: { recorded: number; missing: number };
} | null;
export type DayFact = {
  date: string; counts: PerformanceCounts; evaluableSessions: number;
  declineProportion: number | null; equalSessionSensitivity: number | null; openDay: boolean;
  sessions: SessionFact[];
  context: { metrics: { metricId: string; value: number; sleepNight?: SleepNightEvidence }[]; nutrition: NutritionContext;
    /** Method 2: the day's weight from the body domain, with why it is missing. Its time is unknown: context, not an antecedent. */
    bodyWeight?: { value: number | null; state: "recorded" | "not_recorded" | "invalid" } };
};
export type ExerciseSummary = {
  exerciseId: string; name: string; exposures: number; improved: number; observedStable: number; declined: number; ambiguous: number; insufficient: number;
  lastDate: string | null; lastStatus: PerformanceStatus; lastReason: string;
};

export type PartialExerciseFact = {
  exerciseId: string; name: string; reading: PartialReading; reason: string;
  referenceSessionId: string | null; referenceAgeDays: number | null;
  /** Logical date of the reference session, as in the strict fact. */
  referenceDate?: string | null;
  /** Highest value in this partial history. It is not a record of the strict method and never a claim about capacity. */
  highestInPartialContext: boolean;
};
export type PartialSessionFact = { sessionId: string; counts: PartialCounts; exercises: PartialExerciseFact[] };
/** Same dates and pagination as `facts.days`, with its own counts. Context stays in the strict day and belongs to neither method. */
export type PartialDayFact = { date: string; counts: PartialCounts; evaluableSessions: number; lowerProportion: number | null; equalSessionSensitivity: number | null; openDay: boolean; sessions: PartialSessionFact[] };
export type PartialExerciseSummary = {
  exerciseId: string; name: string; exposures: number; higher: number; same: number; lower: number; ambiguous: number; insufficient: number;
  lastDate: string | null; lastReading: PartialReading; lastReason: string;
};
/** The strongest thing the partial method can say: the two coincided. It cannot separate that from an unrecorded change of variant. */
export type PartialAssociationState = "insufficient_data" | "no_clear_signal" | "coincidence_context_unknown";
export type PartialAssociationResult = Omit<AssociationResult, "state" | "reason"> & { state: PartialAssociationState; reason: Exclude<AssociationReason, "passes_exploratory_gate"> | "coincides_context_unknown"; contextCompleteness: typeof PARTIAL_CONTEXT };
export type PartialLane = {
  methodVersion: typeof INSIGHTS_PERFORMANCE_PARTIAL_METHOD; engineMethodVersion: InsightsEnginePartialMethodVersion; contextCompleteness: typeof PARTIAL_CONTEXT;
  integrity: "valid" | "conflicting_duplicates";
  /** Exposures with any known configuration count only for the strict method. Adding `comparable` across methods never counts one twice. */
  partition: { total: number; configurationKnown: number; configurationUnknown: number };
  outcomeDays: number; totals: PartialCounts; exercises: PartialExerciseSummary[]; days: PartialDayFact[];
  associations: {
    outcome: "daily_lower_record_proportion"; candidatesEvaluated: number; testableCandidates: number; permutations: number;
    promotion: { status: "not_enabled"; reason: "partial_context" };
    items: PartialAssociationResult[];
    detail: { id: string; pairs: { date: string; exposure: number; outcome: number; sessionIds: string[] }[] } | null;
  };
  exclusions: { performance: Partial<Record<ExclusionReason | string, number>>; days: Record<string, number> };
};

type InsightsVersions = { contractVersion: typeof INSIGHTS_CONTRACT; methodVersion: InsightsEngineMethodVersion; performanceMethodVersion: string; today: string; integrity: "valid" | "conflicting_duplicates";
  /** Identifies the read behind this answer. Pages of a different revision must not be joined. */
  sourceRevision: string };
type PartialLabels = Pick<PartialLane, "methodVersion" | "engineMethodVersion" | "contextCompleteness" | "integrity">;
export type RelationSummary = Pick<AssociationResult, "id" | "definition" | "state" | "reason" | "pairs" | "outcomeDays">;
export type PartialRelationSummary = Pick<PartialAssociationResult, "id" | "definition" | "state" | "reason" | "pairs" | "outcomeDays">;
export type InsightsSummary = InsightsVersions & Pick<InsightsReadModel, "history" | "metrics" | "exclusions" | "limits"> & { view: "summary"; facts: InsightsReadModel["facts"];
  relations: Record<"strict" | "partial", { candidatesEvaluated: number; outcomeDays: number }>;
  partial: Omit<PartialLane, "associations"> };
export type InsightsDaysPage = InsightsVersions & { view: "days"; facts: Pick<InsightsReadModel["facts"], "days" | "page">; partial: PartialLabels & { days: PartialDayFact[] } };
export type InsightsRelations = InsightsVersions & { view: "relations"; metrics: InsightsReadModel["metrics"];
  strict: Omit<InsightsReadModel["associations"], "items" | "detail"> & { outcomeDays: number; items: RelationSummary[] };
  partial: PartialLabels & Omit<PartialLane["associations"], "items" | "detail"> & { outcomeDays: number; items: PartialRelationSummary[] } };
export type InsightsRelationDetail = InsightsVersions & { view: "relation"; metrics: InsightsReadModel["metrics"]; lane: "strict" | "partial"; id: string;
  item: AssociationResult | PartialAssociationResult | null; pairs: { date: string; exposure: number; outcome: number; sessionIds: string[] }[] | null; pairsTotal: number; partial?: PartialLabels };
/** One side of a comparison as recorded: every set of that exposure, in its original field and unit, with the ones it left out. */
/**
 * Every set of the exposure's blocks, completed or not, with the block it belongs to (its `exercise_order` in the session) and its
 * `set_number`: what identifies a set to the person. Listed in id order, the comparator's; a display sorts its own copy. Unknown is null.
 */
export type EvidenceSet = { id: string; blockId: string; blockOrder: number | null; setNumber: number | null; completed: boolean; amount: number | null; load: number | null };
export type EvidenceSide = { sessionId: string; date: string | null; sets: EvidenceSet[]; excludedSetIds: string[] };
/**
 * The evidence behind one exercise of one session, in one method: what the shared comparator saw, never a classification of its
 * own. Asked for only when its detail opens. `status` belongs to the strict lane and `reading` to the partial one, as in the facts.
 */
export type ExerciseEvidence = {
  name: string; reason: string;
  context: { weightMode: string | null; unit: PerformanceUnit | null; implement: string | null; configuration: string | null } | null;
  current: EvidenceSide;
  reference: (EvidenceSide & { ageDays: number }) | null;
  evidence: DirectEvidence[];
  /** Highest values of the compatible history, apart from the result: a record is not an improvement over the reference. */
  records: RecordFact[];
  exclusions: Partial<Record<ExclusionReason, number>>;
} & ({ status: PerformanceStatus } | { reading: PartialReading });
export type InsightsExerciseEvidence = InsightsVersions & { view: "evidence"; lane: "strict" | "partial"; sessionId: string; exerciseId: string; item: ExerciseEvidence | null; partial?: PartialLabels };
export type FeelingOutcomeKind = "energy" | "fatigue";
/**
 * One post feeling as an outcome of its own (#367), described: counts of sessions by its ordinal answer (index 0 is answer 1), apart
 * by the prior answer of the same kind. Nothing is averaged, inverted, summed or subtracted. `days` is what the associations
 * would use; they are not published (`associations.status`), whatever they would say.
 */
export type FeelingOutcomeSummary = {
  kind: FeelingOutcomeKind; outcomeKey: "energyPost" | "fatiguePost"; priorKey: "energyPre" | "fatiguePre"; instrument: "energy-fatigue/1"; methodVersion: "insights-feeling-outcomes/1";
  sessions: { completed: number; answered: number; notRecorded: number; unreadable: number; otherInstrument: number };
  /** Of the answered ones: at the finish (start to two hours after the end), later, unknown, or impossibly before the start. */
  capture: { atFinish: number; late: number; captureUnknown: number; beforeStart: number };
  /** Where each answered one was given. */
  source: { mobile: number; web: number; unknown: number };
  /** Answers at the finish only, by the comparable prior answer of the same kind (1 to 5)... */
  byPrior: { prior: number; posts: number[] }[];
  /** ...and those whose prior answer cannot frame them, with why. */
  priorNotComparable: { posts: number[]; reasons: Record<"not_recorded" | "unreadable" | "capture_unknown" | "after_first_set", number> };
  /** Energy only: sessions with the old flow's energy and no answer at the end. It is never read as one. */
  legacyEnergyOnly: number | null;
  firstDate: string | null; lastDate: string | null;
  days: { eligible: number; exclusions: Record<string, number> };
  associations: { status: "not_published"; reason: "validation_pending" };
};
export type InsightsFeelingOutcomes = InsightsVersions & { view: "feelings"; outcomes: FeelingOutcomeSummary[] };
export type InsightsResponse = InsightsSummary | InsightsDaysPage | InsightsRelations | InsightsRelationDetail | InsightsExerciseEvidence | InsightsFeelingOutcomes;

export type InsightsReadModel = {
  contractVersion: typeof INSIGHTS_CONTRACT;
  methodVersion: InsightsEngineMethodVersion;
  performanceMethodVersion: string;
  today: string;
  integrity: "valid" | "conflicting_duplicates";
  history: { coverage: "complete"; firstDate: string | null; lastDate: string | null; sessions: number; trainingDays: number; outcomeDays: number };
  facts: {
    totals: PerformanceCounts; exercises: ExerciseSummary[]; days: DayFact[];
    page: { limit: number; totalDays: number; nextBefore: string | null };
  };
  metrics: { id: string; name: string; unit: string | null; valueType: string; archived: boolean }[];
  associations: {
    outcome: "daily_decline_proportion"; candidatesEvaluated: number; testableCandidates: number; permutations: number;
    promotion: { status: "not_enabled"; reason: "risk_budget_not_approved"; candidateRiskBudget: number };
    items: AssociationResult[];
    detail: { id: string; pairs: { date: string; exposure: number; outcome: number; sessionIds: string[] }[] } | null;
  };
  exclusions: {
    /** Comparator reasons, each exercise counted once per session. */
    performance: Partial<Record<ExclusionReason | string, number>>;
    source: Record<string, number>;
  };
  /** A separate method. Never merged into `facts` or `associations`, and always shown with its limit. */
  partial: PartialLane;
  limits: { configurationSnapshots: { known: number; total: number }; mealTimeEvidence: Record<MealTimeEvidence, number>; unitBasis: "historical_weight_mode"; ingestionCompleteKnown: false; clockVerified: false };
};
