import type { INSIGHTS_PERFORMANCE_PARTIAL_METHOD, PARTIAL_CONTEXT, PartialCounts, PartialReading } from "../performance-insights/partial";
import type { ExclusionReason, PerformanceCounts, PerformanceStatus } from "../performance-insights/types";

/** Versioned, opt-in method. Facts, context and associations stay in separate lanes of the read model. */
export const INSIGHTS_ENGINE_METHOD = "insights-engine/1" as const;
/** Associations over the partial outcome: their own family, ids and calibration, never added to those of the strict method. */
export const INSIGHTS_ENGINE_PARTIAL_METHOD = "insights-engine-partial/1" as const;
export const PARTIAL_ASSOCIATION_PREFIX = "partial:";
export const INSIGHTS_CONTRACT = "performance-insights/1" as const;
export const INSIGHTS_RISK_BUDGET_CANDIDATE = 0.01;

/** Rows as read from their tables. Null always means unknown or not recorded, never zero. */
export type InsightsSource = {
  sessions: readonly {
    id: string; date: string | null; routineId: string | null; routineName: string | null; name: string | null;
    status: "in_progress" | "completed" | "discarded"; startedAt: string | null; endedAt: string | null;
    performanceLevel: number | null; painLevel: number | null; legacyEnergyLevel: number | null;
  }[];
  exercises: readonly {
    id: string; sessionId: string; exerciseId: string; name: string; implement: string | null; weightMode: string | null; isCompleted: boolean;
    /** Historical snapshot. No table stores one yet, so the loader reads null: unknown, never an identity by default. */
    configuration: string | null;
  }[];
  sets: readonly { id: string; sessionExerciseId: string; actualReps: number | null; actualLoad: number | null; isCompleted: boolean; completedAt: string | null }[];
  feelings: readonly { sessionId: string; revision: number; facts: unknown }[];
  metricDefinitions: readonly { id: string; name: string; unit: string | null; valueType: string; archived: boolean }[];
  metricValues: readonly { metricId: string; date: string; value: unknown }[];
  meals: readonly {
    id: string; date: string; consumedAt: string | null; rawInput: unknown; entryKind: string | null; sourceType: string | null;
    calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null;
  }[];
};

/** `explicit` needs a positive marker. `unverified` has an instant but no proof of who set it, or why. */
export type MealTimeEvidence = "explicit" | "registration" | "unverified" | "unknown";
export type FeelingKey = "energyPre" | "fatiguePre" | "energyPost" | "fatiguePost";
/** Order of the capture against the session. The client clock is never treated as verified. */
export type FeelingTiming = "before_start" | "before_first_set" | "after_first_set" | "after_end" | "post_declared" | "unknown";
export type SessionFeeling = { value: number; timing: FeelingTiming; temporalQuality: "unknown" | "unverified_client_clock" };

export type CandidateFamily = "metric" | "nutrition" | "meal_window" | "feeling";
export type CandidateWindow = "same_day" | "previous_day" | "pre_3h" | "same_day_before_start" | "session";
/** What can be said about the order of the exposure and the training. Same-day totals have no order. */
export type TemporalBasis = "same_day_unordered" | "previous_logical_day" | "explicit_meal_time_before_start" | "declared_pre_unverified_clock";
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
  referenceSessionId: string | null; referenceAgeDays: number | null; newHigh: boolean;
};
export type SessionFact = {
  sessionId: string; name: string | null; routineId: string | null; routineName: string | null; startedAt: string | null; endedAt: string | null;
  counts: PerformanceCounts; exercises: ExerciseFact[];
  /** Context recorded around the training. Post feelings stay here and are never an exposure. */
  context: {
    feelings: Partial<Record<FeelingKey, SessionFeeling>>;
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
  context: { metrics: { metricId: string; value: number }[]; nutrition: NutritionContext };
};
export type ExerciseSummary = {
  exerciseId: string; name: string; exposures: number; improved: number; observedStable: number; declined: number; ambiguous: number; insufficient: number;
  lastDate: string | null; lastStatus: PerformanceStatus; lastReason: string;
};

export type PartialExerciseFact = {
  exerciseId: string; name: string; reading: PartialReading; reason: string;
  referenceSessionId: string | null; referenceAgeDays: number | null;
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
export type PartialAssociationResult = AssociationResult & { contextCompleteness: typeof PARTIAL_CONTEXT };
export type PartialLane = {
  methodVersion: typeof INSIGHTS_PERFORMANCE_PARTIAL_METHOD; engineMethodVersion: typeof INSIGHTS_ENGINE_PARTIAL_METHOD; contextCompleteness: typeof PARTIAL_CONTEXT;
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

export type InsightsReadModel = {
  contractVersion: typeof INSIGHTS_CONTRACT;
  methodVersion: typeof INSIGHTS_ENGINE_METHOD;
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
