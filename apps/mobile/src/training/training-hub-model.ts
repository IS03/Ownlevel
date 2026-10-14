import type { TrainingHistorySession } from '@/api/training-history';

/**
 * Training hub rules, pure and deterministic.
 *
 * A session belongs to its server `logDate`: the local date (Córdoba) of its start, the
 * same day Home and History use. It is never recomputed from timestamps on the device, so
 * a session that crosses midnight, or a phone in another time zone, never moves days.
 */
export function sessionDay(session: Pick<TrainingHistorySession, 'logDate'>): string {
  return session.logDate;
}

/** `level` (1–4): History's person-relative intensity; absent = not trained (or not read). */
export type HubDayMark = { date: string; trained: boolean; isToday: boolean; future: boolean; known: boolean; level?: 1 | 2 | 3 | 4 };

/**
 * What each day of the strip shows: a filled circle when it has at least one finished
 * session (several sessions are still one circle). `trainedDays` holds the known trained
 * days; a day whose month was not read stays `known: false` (never drawn as "not trained").
 */
export function weekMarks(dates: string[], today: string, trainedDays: ReadonlySet<string>, knownMonths: ReadonlySet<string>): HubDayMark[] {
  return dates.map(date => ({
    date,
    future: date > today,
    isToday: date === today,
    known: knownMonths.has(date.slice(0, 7)),
    trained: trainedDays.has(date),
  }));
}

/** "N días entrenados": distinct days of `month` with at least one finished session. */
export function monthTrainedDays(days: readonly string[], month: string): number {
  return new Set(days.filter(day => day.slice(0, 7) === month)).size;
}

/**
 * Sessions of one day in display order: the main one first (longest; a tie goes to the one
 * that started first; an unknown duration ranks last), then the rest by the same rule.
 */
export function orderDaySessions<T extends Pick<TrainingHistorySession, 'durationMilliseconds' | 'startedAt'>>(sessions: readonly T[]): T[] {
  return [...sessions].sort((a, b) => {
    const da = a.durationMilliseconds ?? -1;
    const db = b.durationMilliseconds ?? -1;
    return db !== da ? db - da : a.startedAt.localeCompare(b.startedAt);
  });
}

export const HUB_MAX_EXTRA_SESSIONS = 3;

export type HubDayBlock<T> =
  | { kind: 'empty'; date: string }
  | { kind: 'single'; date: string; main: T }
  | { kind: 'multiple'; date: string; main: T; others: T[]; remaining: number };

/**
 * The day block for `date` (today in this pass; written for any date so a selected day can
 * reuse it). Only finished sessions count: the history never includes a session in course.
 */
export function dayBlock<T extends Pick<TrainingHistorySession, 'durationMilliseconds' | 'logDate' | 'startedAt'>>(
  date: string, sessions: readonly T[],
): HubDayBlock<T> {
  const ordered = orderDaySessions(sessions.filter(session => sessionDay(session) === date));
  if (ordered.length === 0) return { kind: 'empty', date };
  const [main, ...rest] = ordered;
  if (rest.length === 0) return { kind: 'single', date, main };
  return { kind: 'multiple', date, main, others: rest.slice(0, HUB_MAX_EXTRA_SESSIONS), remaining: Math.max(0, rest.length - HUB_MAX_EXTRA_SESSIONS) };
}

/** Days between two ISO dates (calendar days, no time zone involved). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** "hoy" / "ayer" / "hace N días" for a routine's latest known session; null when none was read. */
export function routineLastDone(routineId: string, sessions: readonly Pick<TrainingHistorySession, 'logDate' | 'routineId'>[], today: string): string | null {
  const latest = sessions.filter(session => session.routineId === routineId && session.logDate <= today)
    .map(sessionDay).sort().at(-1);
  if (!latest) return null;
  const days = daysBetween(latest, today);
  return days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;
}

export type HubMonthCell = { date: string; day: number; trained: boolean; isToday: boolean; future: boolean; level?: 1 | 2 | 3 | 4 };

/**
 * The month grid (Monday first, `null` for padding cells). `trainedDays` null means the
 * month was not read: no day is marked, and the caller says it is unavailable.
 */
export function monthCells(weeks: readonly (readonly ({ date: string; day: number } | null)[])[], today: string, trainedDays: ReadonlySet<string> | null): (HubMonthCell | null)[][] {
  return weeks.map(week => week.map(cell => cell && {
    date: cell.date, day: cell.day, future: cell.date > today, isToday: cell.date === today, trained: trainedDays?.has(cell.date) ?? false,
  }));
}

/** Years offered by the month/year picker: a few back from today, plus the next one. */
export function pickerYears(today: string, back = 5): number[] {
  const year = Number(today.slice(0, 4));
  return Array.from({ length: back + 2 }, (_, index) => year - back + index);
}
