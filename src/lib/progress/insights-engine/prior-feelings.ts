import { FEELING_INSTRUMENT, FEELING_OUTCOME_KINDS } from './feeling-outcomes';
import type { ExposureContext } from './exposures';
import type { FeelingOutcomeKind, InsightsSource } from './types';

export type PriorFeelingDescription = {
  kind: FeelingOutcomeKind; values: number[]; sessions: number; eligible: number;
  late: number; timingUnknown: number; notRecorded: number; unreadable: number; otherInstrument: number;
};

/** Counts only: all completed sessions, regardless of whether there was a post answer. No search or scale averages. */
export function describePriorFeelings(sessions: InsightsSource['sessions'], context: Pick<ExposureContext, 'feelingsBySession' | 'unreadableFeelingsBySession'>,
  facts: ReadonlyMap<string, unknown>): PriorFeelingDescription[] {
  const completed = sessions.filter(s => s.status === 'completed' && s.date);
  return FEELING_OUTCOME_KINDS.map(kind => {
    const key = kind === 'energy' ? 'energyPre' : 'fatiguePre';
    const result: PriorFeelingDescription = { kind, values: [0, 0, 0, 0, 0], sessions: completed.length,
      eligible: 0, late: 0, timingUnknown: 0, notRecorded: 0, unreadable: 0, otherInstrument: 0 };
    for (const session of completed) {
      const pre = context.feelingsBySession.get(session.id)?.[key];
      if (context.unreadableFeelingsBySession.get(session.id)?.includes(key)) { result.unreadable++; continue; }
      if (!pre) { result.notRecorded++; continue; }
      const raw = (facts.get(session.id) as Record<string, { instrumentVersion?: unknown }> | undefined)?.[key];
      if (raw?.instrumentVersion !== FEELING_INSTRUMENT) { result.otherInstrument++; continue; }
      if (pre.timing === 'unknown') result.timingUnknown++;
      else if (pre.timing !== 'before_start' && pre.timing !== 'before_first_set') result.late++;
      else { result.eligible++; result.values[pre.value - 1]!++; }
    }
    return result;
  });
}
