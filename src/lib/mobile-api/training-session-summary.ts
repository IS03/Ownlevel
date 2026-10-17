// EXPAND · the summary of a completed session: highlights plus how each exercise went against the last time it was
// done. Additive read; the highlights read stays as it is for installed builds. Pure, shared with Expo.
import { HIGHLIGHT_WEIGHT_MODES, parseSessionHighlights, type SessionHighlight } from './training-session-highlights';

export const SUMMARY_STATUSES = ['improved', 'same', 'declined', 'first', 'not_comparable'] as const;
export type SessionComparisonStatus = typeof SUMMARY_STATUSES[number];
export type SessionPreviousSet = { weightKg: number | null; reps: number | null };
export type SessionExerciseComparison = {
  sessionExerciseId: string; exerciseId: string;
  /**
   * improved/same/declined: against the most recent earlier completed session with this exercise and the same load
   * mode. first: never done before. not_comparable: done before, but with another load mode or without completed sets.
   */
  status: SessionComparisonStatus;
  /** Signed change of the best set: load first (kg or lingotes), reps when the load is equal. null unless improved/declined. */
  change: { kind: 'weight' | 'reps'; amount: number } | null;
  previous: { sessionId: string; endedAt: string; sets: SessionPreviousSet[] } | null;
};
export type SessionSummaryDto = {
  sessionId: string; volumeKg: number | null; highlights: SessionHighlight[]; exercises: SessionExerciseComparison[];
};

const object = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const optional = (value: unknown, integer: boolean) => value === null
  || typeof value === 'number' && Number.isFinite(value) && value >= 0 && (!integer || Number.isInteger(value));

function comparison(value: unknown): value is SessionExerciseComparison {
  if (!object(value, ['sessionExerciseId', 'exerciseId', 'status', 'change', 'previous']) || !uuid(value.sessionExerciseId) || !uuid(value.exerciseId)
    || !SUMMARY_STATUSES.includes(value.status as SessionComparisonStatus)) return false;
  const moved = value.status === 'improved' || value.status === 'declined';
  if (moved) {
    const c = value.change;
    if (!object(c, ['kind', 'amount']) || (c.kind !== 'weight' && c.kind !== 'reps') || typeof c.amount !== 'number' || !Number.isFinite(c.amount)
      || c.amount === 0 || (value.status === 'improved') !== (c.amount > 0) || (c.kind === 'reps' && !Number.isInteger(c.amount))) return false;
  } else if (value.change !== null) return false;
  if (value.status === 'first') return value.previous === null;
  const p = value.previous;
  if (value.status === 'not_comparable' && p === null) return true;
  return object(p, ['sessionId', 'endedAt', 'sets']) && uuid(p.sessionId) && typeof p.endedAt === 'string' && !Number.isNaN(Date.parse(p.endedAt))
    && Array.isArray(p.sets) && p.sets.every(set => object(set, ['weightKg', 'reps']) && optional(set.weightKg, false) && optional(set.reps, true));
}
export function parseSessionSummary(value: unknown): SessionSummaryDto | undefined {
  if (!object(value, ['sessionId', 'volumeKg', 'highlights', 'exercises']) || !Array.isArray(value.exercises)) return;
  if (!parseSessionHighlights({ sessionId: value.sessionId, volumeKg: value.volumeKg, highlights: value.highlights })) return;
  const ids = new Set<string>();
  for (const row of value.exercises) {
    if (!comparison(row) || ids.has(row.sessionExerciseId)) return;
    ids.add(row.sessionExerciseId);
  }
  return value as SessionSummaryDto;
}
/** Load modes whose best set is compared by load and then reps; any other mode compares reps. */
export const loadCompared = (mode: string | null) => HIGHLIGHT_WEIGHT_MODES.some(value => value === mode);
