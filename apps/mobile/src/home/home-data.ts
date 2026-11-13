import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

import { fetchMobileHome, useApiResource } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { settledWritesFor, type WriteDomain } from '@/api/confirmed-read-cache';
import { fetchHistoryDay } from '@/api/history';
import { useNutritionReportResource } from '@/nutrition/report-resource';
import { fetchProgressHabitWeek, fetchProgressBody, fetchProgressTrainingRecords } from '@/api/progress';
import type { MobileApiReadResult } from '@/api/results';
import { fetchTrainingHistory, type TrainingHistorySession } from '@/api/training-history';

import { homeDay } from './home-day';
import { prefetchNutritionDays } from '@/nutrition/day-resource';
import { shiftNutritionDate } from '@/nutrition/day-format';

/**
 * Completed sessions of the current week (Monday → today) plus whether the user ever trained.
 * `recent` keeps every session read on the way (newest first) and `historyComplete` says
 * whether that is the whole history: the start sheet's "Última vez" comes from here.
 */
export type HomeTrainingWeek = {
  weekStart: string; sessions: TrainingHistorySession[]; everTrained: boolean;
  recent: TrainingHistorySession[]; historyComplete: boolean;
};

const unavailable = {
  status: 'unavailable' as const,
  reason: 'invalid_response' as const,
  meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const },
};

// History pages are newest first; the current week fits in the first page almost always.
const MAX_WEEK_PAGES = 4;

export async function loadTrainingWeek(
  client: MobileApiClient, weekStart: string, signal?: AbortSignal,
): Promise<MobileApiReadResult<HomeTrainingWeek>> {
  const sessions: TrainingHistorySession[] = [];
  const recent: TrainingHistorySession[] = [];
  let cursor: string | null = null;
  let everTrained = false;
  for (let page = 0; page < MAX_WEEK_PAGES; page++) {
    const result = await fetchTrainingHistory(client, cursor, signal);
    if (result.status !== 'ok') return result;
    if (result.data.sessions.length > 0) everTrained = true;
    let reachedOlder = false;
    recent.push(...result.data.sessions);
    for (const session of result.data.sessions) {
      if (session.logDate >= weekStart) sessions.push(session);
      else reachedOlder = true;
    }
    cursor = result.data.nextCursor;
    if (reachedOlder || !cursor) {
      return { status: 'ok', data: { weekStart, sessions, everTrained, recent, historyComplete: !cursor }, meta: result.meta };
    }
  }
  // More history than the page budget inside one week: do not show partial week totals.
  return unavailable;
}

/**
 * The write domains each Home read depends on (server sources in parentheses). A settled write of another domain does
 * not move it; a write that maps to no domain (profile, account…) still invalidates every read. Views and insight
 * writes (Progreso) move none of them.
 */
export const HOME_READ_DOMAINS = {
  // /home: profile, nutrition day summary (meals, day_logs incl. water/steps, targets from training day and weight),
  // active session, week training snapshot and start routines.
  home: ['body', 'training', 'nutrition'],
  // /history/days/:date: training, active session, nutrition day (with the configured daily metrics) and body.
  today: ['body', 'training', 'nutrition', 'metrics'],
  // Nutrition report (same domains as its retained-read family): intake, targets by training day, energy by weight.
  calories: ['nutrition', 'body', 'training'],
  // /progress/habits: daily_metric_values + user_metrics (values are written through the nutrition day route).
  habits: ['metrics', 'nutrition'],
  // Training history pages.
  training: ['training'],
  // /progress/body: profile weight, weight history and measurements.
  progressBody: ['body'],
  // /progress/training/records: completed sessions.
  progressRecords: ['training'],
} as const satisfies Record<string, readonly WriteDomain[]>;
export type HomeRead = keyof typeof HOME_READ_DOMAINS;
const HOME_READS = Object.keys(HOME_READ_DOMAINS) as HomeRead[];
type Revisions = Record<HomeRead, number>;
const revisionsOf = (client: MobileApiClient | null) =>
  Object.fromEntries(HOME_READS.map(read => [read, settledWritesFor(client, HOME_READ_DOMAINS[read])])) as Revisions;
/** The reads a write settled since `last` may have moved. */
export const homeReadsMovedSince = (last: Revisions | undefined, current: Revisions) =>
  HOME_READS.filter(read => (last?.[read] ?? 0) !== current[read]);

/**
 * The minimum time between tab-focus refreshes. Returning to the tab inside this window
 * keeps the confirmed reads; foregrounding the app (useApiResource) and pull-to-refresh
 * always refresh, and a day change always refreshes. A write settled anywhere since the
 * last refresh (a meal, a weight, a finished session) re-reads only the reads of its domains.
 */
export const HOME_FOCUS_REFRESH_MS = 30_000;

/** Whether a focus refreshes every read: first focus, a new day or the interval elapsed. Writes are per read (above). */
export function shouldRefreshOnFocus(last: { at: number; day: string } | null, now: number, day: string): boolean {
  return !last || last.day !== day || now - last.at >= HOME_FOCUS_REFRESH_MS;
}

/** Home's reads, issued in parallel; each block renders from its own state. */
export function useHomeResources(client: MobileApiClient | null, now: () => Date = () => new Date()) {
  // Home stays mounted as a tab: returning to the foreground refreshes it only when it is the visible screen. Hidden,
  // it catches up on its next focus (interval, new day or a settled write), as when switching tabs.
  const visible = useRef(false);
  const stopWarming = useRef<(() => void) | null>(null);
  const warmOnFocus = useRef<() => void>(() => {});
  const foreground = useCallback(() => visible.current, []);
  const home = useApiResource(useCallback((signal: AbortSignal) =>
    client ? fetchMobileHome(client, signal) : Promise.resolve(unavailable), [client]), { refreshOnForeground: foreground });
  const today = useApiResource(useCallback((signal: AbortSignal) =>
    client ? fetchHistoryDay(client, homeDay(now()).today, signal) : Promise.resolve(unavailable), [client, now]), { refreshOnForeground: foreground });
  const reportDay = homeDay(now());
  const calories = useNutritionReportResource(client, { period: 'custom', from: reportDay.weekStart, to: reportDay.today });
  const habits = useApiResource(useCallback((signal: AbortSignal) =>
    client ? fetchProgressHabitWeek(client, homeDay(now()).weekStart, signal) : Promise.resolve(unavailable), [client, now]), { refreshOnForeground: foreground });
  const training = useApiResource(useCallback((signal: AbortSignal) =>
    client ? loadTrainingWeek(client, homeDay(now()).weekStart, signal) : Promise.resolve(unavailable), [client, now]), { refreshOnForeground: foreground });
  const progressBody = useApiResource(useCallback((signal: AbortSignal) =>
    client ? fetchProgressBody(client, { period: '7' }, signal) : Promise.resolve(unavailable), [client]), { refreshOnForeground: foreground });
  const progressRecords = useApiResource(useCallback((signal: AbortSignal) =>
    client ? fetchProgressTrainingRecords(client, { period: '30' }, signal) : Promise.resolve(unavailable), [client]), { refreshOnForeground: foreground });

  // Latest refresh/reload of each read, by name: the focus logic reaches them through a ref.
  const actions: Record<HomeRead, { refresh: () => Promise<void>; reload: () => Promise<void> }> = {
    home, today, calories, habits, training, progressBody, progressRecords,
  };
  const actionsRef = useRef(actions);
  useEffect(() => { actionsRef.current = actions; });

  const lastFocus = useRef<{ at: number; day: string; writes: Revisions } | null>(null);
  const markRefreshed = useCallback(() => {
    lastFocus.current = { at: now().getTime(), day: homeDay(now()).today, writes: revisionsOf(client) };
  }, [client, now]);
  /** Pull-to-refresh, interval and new day: every read refreshes; a read a write may have moved reloads instead. */
  const refreshNow = useCallback(() => {
    const moved = new Set(homeReadsMovedSince(lastFocus.current?.writes, revisionsOf(client)));
    markRefreshed();
    // A pending read may predate the write; refresh() would join it and accept stale data.
    void Promise.all(HOME_READS.map(read => moved.has(read) ? actionsRef.current[read].reload() : actionsRef.current[read].refresh()));
  }, [client, markRefreshed]);
  useFocusEffect(useCallback(() => {
    visible.current = true;
    const blur = () => { visible.current = false; stopWarming.current?.(); };
    const day = homeDay(now()).today;
    const last = lastFocus.current;
    // The first focus coincides with the initial reads.
    if (last === null) { markRefreshed(); warmOnFocus.current(); return blur; }
    if (shouldRefreshOnFocus(last, now().getTime(), day)) { refreshNow(); return blur; }
    // Inside the interval, the same day: only the reads a settled write may have moved, and the interval keeps running.
    const current = revisionsOf(client), moved = homeReadsMovedSince(last.writes, current);
    if (moved.length) {
      lastFocus.current = { ...last, writes: current };
      void Promise.all(moved.map(read => actionsRef.current[read].reload()));
    } else warmOnFocus.current();
    return blur;
  }, [client, markRefreshed, now, refreshNow]));

  // After a write made from Home (a daily metric): reload its blocks now. Only those count as caught up, so any other
  // read the write moved (the habit week) still reloads on the next focus.
  const invalidate = useCallback(() => {
    const reloaded: HomeRead[] = ['home', 'today', 'calories'];
    const previous = lastFocus.current?.writes, current = revisionsOf(client);
    markRefreshed();
    if (lastFocus.current && previous) lastFocus.current.writes = { ...previous, ...Object.fromEntries(reloaded.map(read => [read, current[read]])) };
    void Promise.all(reloaded.map(read => actionsRef.current[read].reload()));
  }, [client, markRefreshed]);

  const homeSettled = [home, today, calories, habits, training, progressBody, progressRecords].every(resource =>
    resource.state.status !== 'loading' && !(resource.state.status === 'ready' && resource.state.refreshing));
  const warmDay = homeDay(now()).today;
  useEffect(() => {
    const start = () => {
      stopWarming.current?.();
      stopWarming.current = client && homeSettled && visible.current
        ? prefetchNutritionDays(client, [warmDay, shiftNutritionDate(warmDay, -1)], warmDay) : null;
    };
    warmOnFocus.current = start; start();
    return () => { stopWarming.current?.(); stopWarming.current = null; };
  }, [client, homeSettled, warmDay]);

  return { calories, habits, home, progressBody, progressRecords, refresh: refreshNow, invalidate, today, training };
}
