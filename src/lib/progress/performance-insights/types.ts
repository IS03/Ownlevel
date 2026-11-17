/** Opt-in domain contract; never extend an installed client's strict legacy DTO. */
export const INSIGHTS_PERFORMANCE_METHOD = "insights-performance/1" as const;
export type PerformanceStatus = "improved" | "observed_stable" | "declined" | "ambiguous_evidence" | "insufficient_comparison";
export type PerformanceUnit = "kg" | "lingotes" | "reps" | "seconds";
export type HistoryCoverage = "complete" | "partial" | "unavailable";

export type HistoricalContext = {
  weightMode: string | null;
  unit: PerformanceUnit | null;
  /** Historical identity, not a current catalog lookup. Null means unknown. */
  implement: string | null;
  /** Historical configuration identity. Explicit "none" is allowed only if verified. */
  configuration: string | null;
};
export type PerformanceSet = {
  id: string;
  completed: boolean;
  /** Reps, or seconds for Tiempo (segundos), matching the existing recorded field. */
  amount: number | null;
  load: number | null;
};
export type PerformanceExerciseBlock = {
  id: string;
  exerciseId: string;
  completed: boolean;
  context: HistoricalContext;
  sets: readonly PerformanceSet[];
};
export type PerformanceSession = {
  id: string;
  /** Logical day supplied from the historical day log, never derived from UTC. */
  date: string | null;
  routineId: string | null;
  status: "completed" | "active" | "discarded";
  startedAt: string | null;
  endedAt: string | null;
  chronology: "verified" | "uncertain";
  exercises: readonly PerformanceExerciseBlock[];
};

export type ExclusionReason =
  | "invalid_exercise_id" | "missing_context" | "unsupported_mode" | "mode_unit_mismatch"
  | "different_context" | "mixed_context" | "incomplete_exercise" | "no_completed_sets"
  | "invalid_completed_set" | "duplicate_conflict" | "session_not_completed"
  | "uncertain_chronology" | "not_before_start" | "reference_order_uncertain"
  | "no_compatible_reference" | "history_unavailable" | "invalid_logical_date";
export type PerformanceExclusion = {
  reason: ExclusionReason;
  sessionId: string;
  exerciseId?: string;
  rowIds?: string[];
};
export type DirectEvidence = {
  kind: "reps_at_load" | "load_at_reps" | "bodyweight_reps" | "time";
  /** Load for reps_at_load, reps for load_at_reps. */
  anchor: number | null;
  current: number;
  reference: number;
  delta: number;
  currentSetIds: string[];
  referenceSetIds: string[];
};
export type ExerciseExposure = {
  sessionId: string;
  exerciseId: string;
  blockIds: string[];
  context: HistoricalContext | null;
  sets: PerformanceSet[];
  excludedSetIds: string[];
  deduplicatedRows: number;
  issue: ExclusionReason | null;
};
export type VolumeFact = {
  /** No conversion between load modes, implements or exercises. */
  unit: "kg_reps" | "lingote_reps" | "reps" | "seconds";
  value: number;
} | null;
export type RecordFact = {
  kind: "load" | "reps_at_load" | "bodyweight_reps" | "time";
  anchor: number | null;
  current: number;
  previousMaximum: number;
  isNewHigh: boolean;
};
/**
 * How far the direct evidence moved, beside the classification and never instead of it (#533). Rules in
 * docs/progress/533-cambio-medido.md:
 * - Only amount signals at an equal condition enter `pct`: `reps_at_load` (best reps at the same load), `bodyweight_reps` or
 *   `time`. Each signal is `delta / reference`; a reference of zero is not a base. `pct` is the mean, in percent.
 * - Load signals (`load_at_reps`, more load for the same reps) are counted apart in `load` and never enter `pct`. `load` is null
 *   when the unit is not a load (bodyweight reps, time); its `unit` says whether it is kilograms or plates ("lingotes").
 * - `measured` with `pct` 0 is an observed zero change. Every other state has no `pct`: `not_comparable` (no compatible
 *   reference or an excluded exposure, the reason is the exercise's), `ambiguous` (opposite signals, the status says so),
 *   `no_amount_signal` (only load moved) and `no_positive_reference`.
 */
export type ChangeBasis = "reps_at_load" | "bodyweight_reps" | "time";
export type PerformanceChangeState = "measured" | "not_comparable" | "ambiguous" | "no_amount_signal" | "no_positive_reference";
export type LoadSignals = { unit: "kg" | "lingote"; up: number; same: number; down: number };
export type PerformanceChange = {
  state: PerformanceChangeState;
  pct: number | null;
  basis: ChangeBasis | null;
  /** Amount signals with a positive reference that entered `pct`. */
  signals: number;
  load: LoadSignals | null;
  /**
   * One signal a row can show, as recorded: the heaviest anchor of the ones behind `pct` (or, with only load signals, the
   * heaviest load). Its kind is `basis` when measured and `load_at_reps` when only the load moved. `reps_at_load`: anchor is the
   * load and from → to the best reps; `load_at_reps`: anchor is the reps and from → to the load; bodyweight and time: no anchor.
   * The percentage still comes from every signal.
   */
  shown?: { anchor: number | null; from: number; to: number } | null;
};
export type ExercisePerformance = {
  methodVersion: typeof INSIGHTS_PERFORMANCE_METHOD;
  exerciseId: string;
  status: PerformanceStatus;
  /** #533. Always set by the comparator; optional only for rows built elsewhere. */
  change?: PerformanceChange;
  reason: ExclusionReason | "direct_evidence" | "crossed_signals" | "unanchored_evidence";
  current: ExerciseExposure;
  reference: {
    sessionId: string;
    endedAt: string;
    ageMs: number;
    exposure: ExerciseExposure;
  } | null;
  evidence: DirectEvidence[];
  records: { scope: "provided_compatible_history"; historyCoverage: HistoryCoverage; facts: RecordFact[] };
  volume: { current: VolumeFact; reference: VolumeFact };
  exclusions: PerformanceExclusion[];
};
export type PerformanceCounts = {
  improved: number;
  observedStable: number;
  declined: number;
  ambiguous: number;
  insufficient: number;
  total: number;
  comparable: number;
  coverage: number | null;
};
export type SessionPerformance = {
  methodVersion: typeof INSIGHTS_PERFORMANCE_METHOD;
  sessionId: string;
  date: string | null;
  routineId: string | null;
  exercises: ExercisePerformance[];
  counts: PerformanceCounts;
  exclusions: PerformanceExclusion[];
};
export type DailyPerformance = {
  methodVersion: typeof INSIGHTS_PERFORMANCE_METHOD;
  date: string;
  sessions: SessionPerformance[];
  counts: PerformanceCounts;
  evaluableSessions: number;
  /** Methodological candidates only; neither enables personal patterns. */
  candidateDeclineProportion: number | null;
  equalSessionWeightSensitivity: number | null;
  exclusions: PerformanceExclusion[];
};

/**
 * The same classification as ExercisePerformance, without what only describes it: the exposures and their set copies, the
 * evidence behind the status and the volumes. Reasons, reference (without its exposure), records and exclusions are kept.
 * Asked for with `output: "compact"`; every other consumer keeps the full output.
 */
export type CompactExercisePerformance = Pick<ExercisePerformance, "methodVersion" | "exerciseId" | "status" | "reason" | "exclusions" | "change"> & {
  reference: Omit<NonNullable<ExercisePerformance["reference"]>, "exposure"> | null;
  /** `records.facts` of the full output. */
  records: RecordFact[];
};
export type ComparisonOutput = "full" | "compact";
export type ExerciseOf<O extends ComparisonOutput> = O extends "compact" ? CompactExercisePerformance : ExercisePerformance;
export type SessionPerformanceOf<E> = Omit<SessionPerformance, "exercises"> & { exercises: E[] };
export type DailyPerformanceOf<E> = Omit<DailyPerformance, "sessions"> & { sessions: SessionPerformanceOf<E>[] };
