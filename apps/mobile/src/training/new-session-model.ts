import type { MobileApiClient } from '@/api/client';
import { fetchTrainingHistory, fetchTrainingWeekdaySessions, type TrainingHistorySession, type TrainingWeekdaySession } from '@/api/training-history';
import { addIsoDays } from '@/home/format';

import { daysBetween, sessionDay } from './training-hub-model';

/** Weeks of history behind the recommendation. */
export const RECOMMENDATION_WEEKS = 12;
/** A routine is recommended only if it was done at least this many of those weekdays. */
export const RECOMMENDATION_MIN_DAYS = 2;

export type Recommendation = { routineId: string; days: number; doneToday: boolean };
export type RecommendationData = {
  today: string;
  /** Finished sessions of today and of the same weekday in the last 12 weeks; null when they could not be read. */
  sameWeekday: TrainingWeekdaySession[] | null;
  /** The newest history page, for "hoy / ayer / hace N días"; null when unavailable. */
  recent: TrainingHistorySession[] | null;
};

/** Today and the same weekday of each of the last `weeks` weeks. */
export function sameWeekdayDates(today: string, weeks = RECOMMENDATION_WEEKS): string[] {
  return Array.from({ length: weeks + 1 }, (_, index) => addIsoDays(today, -7 * index));
}

/**
 * What the recommendation needs, read in parallel: the sessions of today and of the same weekday
 * in the last 12 weeks (one read: id, routine and date only) and the newest history page. A failed
 * read leaves the recommendation unknown (never guessed); a failed page only drops the "last done" labels.
 */
export async function loadRecommendationData(client: MobileApiClient, today: string, signal?: AbortSignal): Promise<RecommendationData> {
  const [weekdays, page] = await Promise.all([
    fetchTrainingWeekdaySessions(client, today, RECOMMENDATION_WEEKS, signal),
    fetchTrainingHistory(client, null, signal),
  ]);
  return { recent: page.status === 'ok' ? page.data.sessions : null, sameWeekday: weekdays.status === 'ok' ? weekdays.data.sessions : null, today };
}

const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/**
 * The routine most often done on today's weekday in the last `weeks` weeks (distinct days,
 * by the server logDate; today itself does not count). Ties go to the one done most
 * recently. Only active routines; free sessions never count. Below `minDays`, there is no
 * recommendation. If it was already done today it is still the recommendation, flagged.
 */
export function recommendRoutine(sessions: readonly Pick<TrainingHistorySession, 'routineId' | 'logDate'>[], activeRoutineIds: readonly string[], today: string,
  weeks = RECOMMENDATION_WEEKS, minDays = RECOMMENDATION_MIN_DAYS): Recommendation | null {
  const active = new Set(activeRoutineIds);
  const weekday = weekdayOf(today);
  const doneToday = new Set(sessions.filter(session => sessionDay(session) === today).map(session => session.routineId));
  const days = new Map<string, Set<string>>();
  for (const session of sessions) {
    const date = sessionDay(session);
    if (!session.routineId || !active.has(session.routineId) || date >= today || weekdayOf(date) !== weekday) continue;
    if (daysBetween(date, today) > weeks * 7) continue;
    const set = days.get(session.routineId) ?? new Set<string>();
    set.add(date);
    days.set(session.routineId, set);
  }
  const ranked = [...days.entries()]
    .map(([routineId, dates]) => ({ routineId, days: dates.size, last: [...dates].sort().at(-1)! }))
    .sort((a, b) => b.days - a.days || b.last.localeCompare(a.last));
  const pick = ranked.find(candidate => candidate.days >= minDays);
  return pick ? { days: pick.days, doneToday: doneToday.has(pick.routineId), routineId: pick.routineId } : null;
}

const WEEKDAYS_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "viernes" / "los viernes" for copy about today's weekday. */
export function weekdayName(today: string, plural = false): string {
  return (plural ? WEEKDAYS_PLURAL : WEEKDAYS)[weekdayOf(today)];
}
