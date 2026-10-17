import type { MobileApiClient } from '@/api/client';
import { fetchTrainingHistoryMonth } from '@/api/training-history';
import { mondayOf, weekDates } from '@/home/home-day';

// The week of the session just saved, for the post-workout intro (PW3). Server truth from the training calendar,
// read once the finish is confirmed so the saved session is in it. Unavailable → the intro is skipped, never faked.
export type FinishWeek = {
  /** Monday → Sunday. sessionsBefore: sessions that day not counting the one just saved (the day fills with it). */
  days: { date: string; sessionsBefore: number; today: boolean }[];
  /** Sessions this week, the saved one included. */
  sessions: number;
};

export async function fetchFinishWeek(client: MobileApiClient, logDate: string): Promise<FinishWeek | null> {
  const dates = weekDates(mondayOf(logDate));
  const months = [...new Set(dates.map(date => date.slice(0, 7)))];
  const reads = await Promise.all(months.map(month => fetchTrainingHistoryMonth(client, month)));
  if (reads.some(read => read.status !== 'ok')) return null;
  const sessions = new Map(reads.flatMap(read => read.status === 'ok' ? read.data.days.map(day => [day.date, day.sessions] as const) : []));
  // The calendar is read after the confirmed finish: the saved session has to be in it, or the read is not trusted.
  if (!sessions.get(logDate)) return null;
  return {
    days: dates.map(date => ({ date, today: date === logDate, sessionsBefore: (sessions.get(date) ?? 0) - (date === logDate ? 1 : 0) })),
    sessions: dates.reduce((total, date) => total + (sessions.get(date) ?? 0), 0),
  };
}

// Started when the finish is confirmed (during the save animation) and used by the receipt right after. Keyed by the
// saved session, so another session finished the same day reads again.
const FRESH_MS = 60_000;
const reads = new WeakMap<MobileApiClient, Map<string, { at: number; read: Promise<FinishWeek | null> }>>();
export function prefetchFinishWeek(client: MobileApiClient, sessionId: string, logDate: string, now = Date.now()) {
  let map = reads.get(client);
  if (!map) { map = new Map(); reads.set(client, map); }
  const hit = map.get(sessionId);
  if (hit && now - hit.at < FRESH_MS) return hit.read;
  const read = Promise.resolve().then(() => fetchFinishWeek(client, logDate)).catch(() => null);
  map.set(sessionId, { at: now, read });
  return read;
}
