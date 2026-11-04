import { configurationKnown, uniqueRows } from "./exposure";
import { compareSessions } from "./kernel";
import type { DailyPerformance, ExercisePerformance, HistoryCoverage, PerformanceSession, PerformanceStatus, SessionPerformance } from "./types";

/**
 * A separate method, not a relaxation of `insights-performance/1`. Compares the same UUID, mode, unit and implement while the
 * configuration stays unknown on both sides: an unrecorded change of grip or bench can move these numbers, so they only say
 * what was recorded, never what changed in the person. Nothing is taken from the current catalog.
 */
export const INSIGHTS_PERFORMANCE_PARTIAL_METHOD = "insights-performance-partial/1" as const;
export const PARTIAL_CONTEXT = "configuration_unknown" as const;

export type PartialReading = "higher_record" | "same_record" | "lower_record" | "ambiguous_evidence" | "insufficient_comparison";
const READING: Record<PerformanceStatus, PartialReading> = {
  improved: "higher_record", observed_stable: "same_record", declined: "lower_record",
  ambiguous_evidence: "ambiguous_evidence", insufficient_comparison: "insufficient_comparison",
};

export type PartialCounts = { higher: number; same: number; lower: number; ambiguous: number; insufficient: number; total: number; comparable: number; coverage: number | null };
type Labels = { methodVersion: typeof INSIGHTS_PERFORMANCE_PARTIAL_METHOD; contextCompleteness: typeof PARTIAL_CONTEXT };
export type PartialExercise = Omit<ExercisePerformance, "methodVersion" | "status"> & Labels & { reading: PartialReading };
export type PartialSession = Omit<SessionPerformance, "methodVersion" | "exercises" | "counts"> & Labels & { exercises: PartialExercise[]; counts: PartialCounts };
export type PartialDay = Omit<DailyPerformance, "methodVersion" | "sessions" | "counts" | "candidateDeclineProportion"> & Labels & {
  sessions: PartialSession[]; counts: PartialCounts;
  /** Share of comparable exposures with a lower record. Not a share of declines: nothing here proves a decline. */
  candidateLowerProportion: number | null;
};

const LABELS: Labels = { methodVersion: INSIGHTS_PERFORMANCE_PARTIAL_METHOD, contextCompleteness: PARTIAL_CONTEXT };
const relabelCounts = (counts: SessionPerformance["counts"]): PartialCounts => ({ higher: counts.improved, same: counts.observedStable, lower: counts.declined,
  ambiguous: counts.ambiguous, insufficient: counts.insufficient, total: counts.total, comparable: counts.comparable, coverage: counts.coverage });
const relabelExercise = ({ status, ...exercise }: ExercisePerformance): PartialExercise => ({ ...exercise, ...LABELS, reading: READING[status] });
const relabelSession = (session: SessionPerformance): PartialSession => ({ ...session, ...LABELS, exercises: session.exercises.map(relabelExercise), counts: relabelCounts(session.counts) });

/** Exposures that hold a known configuration, however many blocks they span. They belong to the strict lane alone. */
function knownConfigurationExposures(rows: readonly PerformanceSession[]) {
  let known = 0, total = 0;
  // Over the same deduplicated sessions the methods count. A contradictory history has no denominators at all.
  const { unique: sessions, conflicts } = uniqueRows(rows);
  if (conflicts.length) return { total: 0, configurationKnown: 0, configurationUnknown: 0 };
  for (const session of sessions) {
    if (session.status !== "completed") continue;
    const exercises = new Map<string, boolean>();
    for (const block of session.exercises) {
      const id = block.exerciseId.toLowerCase();
      exercises.set(id, (exercises.get(id) ?? false) || configurationKnown(block.context));
    }
    total += exercises.size;
    for (const value of exercises.values()) if (value) known++;
  }
  return { total, configurationKnown: known, configurationUnknown: total - known };
}

export function buildPerformanceInsightsPartialV1(input: { sessions: readonly PerformanceSession[]; historyCoverage: HistoryCoverage; exclusionDetail?: "full" | "summary" }) {
  const base = compareSessions(input, PARTIAL_CONTEXT);
  const sessions = base.sessions.map(relabelSession), byId = new Map(sessions.map(session => [session.sessionId, session]));
  return { ...LABELS, historyCoverage: base.historyCoverage, integrity: base.integrity, deduplicatedSessions: base.deduplicatedSessions, exclusions: base.exclusions,
    /** Every completed exposure falls on exactly one side, so the two methods never count the same observation as comparable. */
    partition: knownConfigurationExposures(input.sessions),
    sessions,
    days: base.days.map(({ candidateDeclineProportion, ...day }): PartialDay => ({ ...day, ...LABELS, candidateLowerProportion: candidateDeclineProportion,
      sessions: day.sessions.map(session => byId.get(session.sessionId)!), counts: relabelCounts(day.counts) })),
  };
}
