import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

import { fetchMobileHome, useApiResource } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { settledWrites } from '@/api/confirmed-read-cache';
import { fetchHistoryDay } from '@/api/history';
import { fetchNutritionReport } from '@/api/nutrition-report';
import { fetchProgressHabitWeek, fetchProgressBody, fetchProgressTrainingRecords } from '@/api/progress';
import type { MobileApiReadResult } from '@/api/results';
import { fetchTrainingHistory, type TrainingHistorySession } from '@/api/training-history';

import { homeDay } from './home-day';

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
 * The minimum time between tab-focus refreshes. Returning to the tab inside this window
 * keeps the confirmed reads; foregrounding the app (useApiResource) and pull-to-refresh
 * always refresh, and a day change or a write settled anywhere since the last refresh
 * (a meal, a weight, a finished session) always refreshes.
 */
export const HOME_FOCUS_REFRESH_MS = 30_000;

export function shouldRefreshOnFocus(
  last: { at: number; day: string; writes?: number } | null, now: number, day: string, writes = 0,
): boolean {
  return !last || last.day !== day || now - last.at >= HOME_FOCUS_REFRESH_MS || (last.writes ?? 0) !== writes;
}

/** Home's reads, issued in parallel; each block renders from its own state. */
export function useHomeResources(client: MobileApiClient | null, now: () => Date = () => new Date()) {
  // Home stays mounted as a tab: returning to the foreground refreshes it only when it is the visible screen. Hidden,
  // it catches up on its next focus (interval, new day or a settled write), as when switching tabs.
  const visible = useRef(false);
  const foreground = useCallback(() => visible.current, []);
  const home = useApiResource(useCallback((signal: AbortSignal) =>
    client ? fetchMobileHome(client, signal) : Promise.resolve(unavailable), [client]), { refreshOnForeground: foreground });
  const today = useApiResource(useCallback((signal: AbortSignal) =>
    client ? fetchHistoryDay(client, homeDay(now()).today, signal) : Promise.resolve(unavailable), [client, now]), { refreshOnForeground: foreground });
  const calories = useApiResource(useCallback((signal: AbortSignal) => {
    const day = homeDay(now());
    return client
      ? fetchNutritionReport(client, { period: 'custom', from: day.weekStart, to: day.today }, signal)
      : Promise.resolve(unavailable);
  }, [client, now]), { refreshOnForeground: foreground });
  const habits = useApiResource(useCallback((signal: AbortSignal) =>
    client ? fetchProgressHabitWeek(client, homeDay(now()).weekStart, signal) : Promise.resolve(unavailable), [client, now]), { refreshOnForeground: foreground });
  const training = useApiResource(useCallback((signal: AbortSignal) =>
    client ? loadTrainingWeek(client, homeDay(now()).weekStart, signal) : Promise.resolve(unavailable), [client, now]), { refreshOnForeground: foreground });
  const progressBody = useApiResource(useCallback((signal: AbortSignal) =>
    client ? fetchProgressBody(client, { period: '7' }, signal) : Promise.resolve(unavailable), [client]), { refreshOnForeground: foreground });
  const progressRecords = useApiResource(useCallback((signal: AbortSignal) =>
    client ? fetchProgressTrainingRecords(client, { period: '30' }, signal) : Promise.resolve(unavailable), [client]), { refreshOnForeground: foreground });

  const refreshHome = home.refresh, refreshToday = today.refresh;
  const refreshCalories = calories.refresh, refreshTraining = training.refresh, refreshHabits = habits.refresh;
  const refreshProgressBody = progressBody.refresh, refreshProgressRecords = progressRecords.refresh;
  const refreshAll = useCallback(() => {
    void Promise.all([refreshHome(), refreshToday(), refreshCalories(), refreshHabits(), refreshTraining(),
      refreshProgressBody(), refreshProgressRecords()]);
  }, [refreshCalories, refreshHabits, refreshHome, refreshToday, refreshTraining, refreshProgressBody, refreshProgressRecords]);

  const reloadHome = home.reload, reloadToday = today.reload, reloadCalories = calories.reload;
  const reloadHabits = habits.reload, reloadTraining = training.reload;
  const reloadProgressBody = progressBody.reload, reloadProgressRecords = progressRecords.reload;
  const reloadAll = useCallback(() => {
    void Promise.all([reloadHome(), reloadToday(), reloadCalories(), reloadHabits(), reloadTraining(),
      reloadProgressBody(), reloadProgressRecords()]);
  }, [reloadHome, reloadToday, reloadCalories, reloadHabits, reloadTraining, reloadProgressBody, reloadProgressRecords]);

  const lastFocus = useRef<{ at: number; day: string; writes: number } | null>(null);
  const markRefreshed = useCallback(() => {
    lastFocus.current = { at: now().getTime(), day: homeDay(now()).today, writes: settledWrites(client) };
  }, [client, now]);
  const refreshNow = useCallback(() => {
    const changed = (lastFocus.current?.writes ?? 0) !== settledWrites(client);
    markRefreshed();
    // A pending read may predate the write; refresh() would join it and accept stale data.
    if (changed) reloadAll(); else refreshAll();
  }, [client, markRefreshed, refreshAll, reloadAll]);
  useFocusEffect(useCallback(() => {
    visible.current = true;
    const blur = () => { visible.current = false; };
    const day = homeDay(now()).today;
    // The first focus coincides with the initial reads.
    if (lastFocus.current === null) { markRefreshed(); return blur; }
    if (shouldRefreshOnFocus(lastFocus.current, now().getTime(), day, settledWrites(client))) refreshNow();
    return blur;
  }, [client, markRefreshed, now, refreshNow]));

  const invalidate = useCallback(() => { markRefreshed(); void Promise.all([reloadHome(), reloadToday(), reloadCalories()]); }, [markRefreshed, reloadHome, reloadToday, reloadCalories]);

  return { calories, habits, home, progressBody, progressRecords, refresh: refreshNow, invalidate, today, training };
}
