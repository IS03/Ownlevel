import { FEELING_INSTRUMENT, FEELING_OUTCOME_KINDS } from './feeling-outcomes';
import type { ExposureContext } from './exposures';
import type { FeelingOutcomeKind, InsightsSource, SessionFact } from './types';

export type PriorFeelingDescription = {
  kind: FeelingOutcomeKind; values: number[]; sessions: number; eligible: number;
  late: number; timingUnknown: number; notRecorded: number; unreadable: number; otherInstrument: number;
};

export type PriorFeelingFact = { state: 'recorded' | 'late' | 'unknown_time' | 'not_recorded' | 'unreadable' | 'other_instrument'; value: number | null };
/** Same prior eligibility used by weekly descriptions, reusing the canonical parsed moment. */
export function priorFeelingFact(context: Pick<SessionFact['context'], 'feelings' | 'unreadableFeelings'>, facts: unknown, key: 'energyPre' | 'fatiguePre'): PriorFeelingFact {
  const pre = context.feelings[key];
  if (context.unreadableFeelings?.includes(key)) return { state: 'unreadable', value: null };
  if (!pre) return { state: 'not_recorded', value: null };
  const raw = (facts as Record<string, { instrumentVersion?: unknown }> | undefined)?.[key];
  if (raw?.instrumentVersion !== FEELING_INSTRUMENT) return { state: 'other_instrument', value: null };
  const state = pre.timing === 'unknown' ? 'unknown_time' : pre.timing !== 'before_start' && pre.timing !== 'before_first_set' ? 'late' : 'recorded';
  return { state, value: state === 'recorded' ? pre.value : null };
}

/** Counts only: all completed sessions, regardless of whether there was a post answer. No search or scale averages. */
export function describePriorFeelings(sessions: InsightsSource['sessions'], context: Pick<ExposureContext, 'feelingsBySession' | 'unreadableFeelingsBySession'>,
  facts: ReadonlyMap<string, unknown>): PriorFeelingDescription[] {
  const completed = sessions.filter(s => s.status === 'completed' && s.date);
  return FEELING_OUTCOME_KINDS.map(kind => {
    const key = kind === 'energy' ? 'energyPre' : 'fatiguePre';
    const result: PriorFeelingDescription = { kind, values: [0, 0, 0, 0, 0], sessions: completed.length,
      eligible: 0, late: 0, timingUnknown: 0, notRecorded: 0, unreadable: 0, otherInstrument: 0 };
    for (const session of completed) {
      const pre = priorFeelingFact({ feelings: context.feelingsBySession.get(session.id) ?? {}, unreadableFeelings: context.unreadableFeelingsBySession.get(session.id) }, facts.get(session.id), key);
      if (pre.state === 'recorded') { result.eligible++; result.values[pre.value! - 1]!++; }
      else result[pre.state === 'unknown_time' ? 'timingUnknown' : pre.state === 'not_recorded' ? 'notRecorded' : pre.state === 'other_instrument' ? 'otherInstrument' : pre.state]++;
    }
    return result;
  });
}
