import { cordobaDateOf } from '../phase2/cordoba-date';
import { instantMs } from './insights-engine/source-adapter';

const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Cordoba', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
export type TrainingStartState = 'missingStart' | 'invalidStart' | 'differentDay' | 'futureStart';
/** A usable saved start is not a certification of historical provenance. Backdated loads never become workout times. */
export function trainingStartTime(session: { date: string | null; startedAt: string | null }, today: string): { state: TrainingStartState } | { state: 'timed'; start: number; minute: number } {
  if (!session.startedAt) return { state: 'missingStart' };
  const start = instantMs(session.startedAt);
  if (start === null) return { state: 'invalidStart' };
  const date = cordobaDateOf(start);
  if (date > today) return { state: 'futureStart' };
  if (date !== session.date) return { state: 'differentDay' };
  const parts = clock.formatToParts(start);
  return { state: 'timed', start, minute: Number(parts.find(p => p.type === 'hour')!.value) * 60 + Number(parts.find(p => p.type === 'minute')!.value) };
}
export function trainingTimesPreview(sessions: readonly { date: string | null; startedAt: string | null }[], today: string) {
  const bins = Array<number>(12).fill(0); let excluded = 0;
  for (const s of sessions) { const time = trainingStartTime(s, today); if (time.state === 'timed') bins[Math.floor(time.minute / 120)]!++; else excluded++; }
  return { bins, timed: bins.reduce((a, b) => a + b, 0), excluded };
}
