import { useCallback } from 'react';
import type { MobileApiClient } from '@/api/client';
import { useCachedRead } from '@/api/use-cached-read';
import { fetchMobileNutritionDay, fetchMobileNutritionWeek, isNutritionDate, notifyTodayNutrition } from '@/api/nutrition-day';
import { confirmedReads, READ_FAMILY_DOMAINS, scopedReadKey } from '@/api/confirmed-read-cache';
import { nutritionWeek } from './day-home-model';
import { nutritionToday, shiftNutritionDate } from './day-format';

/**
 * One retained reading per account and date, shared by the day screen and the meal projection. A day already
 * visited shows at once and revalidates like any other focus; settled writes invalidate it through the API client.
 * Writes keep their own versions and CAS: this reading is what the screen shows, never a write confirmation.
 */
export function useNutritionDayResource(client: MobileApiClient | null, date: string) {
  const load = useCallback((c: MobileApiClient, signal: AbortSignal, background?: boolean) => fetchMobileNutritionDay(c, date, signal, background), [date]);
  const { state, refresh, reload } = useCachedRead(client, 'nutrition-day', date, load);
  return { date, state, refresh, reload };
}

/** Full day responses only. Home's summary/report cannot seed this controller. */
export function prefetchNutritionDays(client: MobileApiClient | null, dates: readonly (string | undefined)[], today = nutritionToday()) {
  if (!client) return () => {};
  const cache = confirmedReads(client), scope = nutritionToday(), limit = today < scope ? today : scope;
  const entries = [...new Set(dates)].filter((date): date is string => !!date && isNutritionDate(date) && date <= limit).slice(0, 2)
    .map(date => cache.get('nutrition-day', scopedReadKey(date, scope), (signal, background) => fetchMobileNutritionDay(client, date, signal, background)));
  return cache.prefetch(entries);
}

const weekUnsupported = new WeakSet<MobileApiClient>();

/** Exactly the seven dates the Nutrition strip represents, with future days left to individual reads. */
export function prefetchNutritionWeek(client: MobileApiClient, date: string, today = nutritionToday(), fromHome = false, after?: () => () => void) {
  const scope = nutritionToday(), limit = today < scope ? today : scope;
  const fallback = () => prefetchNutritionDays(client, fromHome
    ? [date, shiftNutritionDate(date, -1)]
    : [shiftNutritionDate(date, -1), shiftNutritionDate(date, 1)], limit);
  if (weekUnsupported.has(client)) {
    const stopFallback = fallback();
    const stopAfter = after?.();
    return () => { stopFallback(); stopAfter?.(); };
  }
  const dates = nutritionWeek(date, today).filter(candidate => isNutritionDate(candidate) && candidate <= limit);
  if (!dates.length) return after?.() ?? (() => {});

  const cache = confirmedReads(client);
  const entry = cache.get('nutrition-week', scopedReadKey(`${dates[0]}|${dates.at(-1)}`, scope), async signal => {
    const revision = cache.writeRevision(READ_FAMILY_DOMAINS['nutrition-day']);
    const result = await fetchMobileNutritionWeek(client, dates, signal);
    if (!signal.aborted && result.status === 'ok' && scope === nutritionToday()) {
      for (const day of result.data) {
        const target = cache.get('nutrition-day', scopedReadKey(day.date, scope), (readSignal, background) => fetchMobileNutritionDay(client, day.date, readSignal, background));
        if (cache.seedNutritionDay(target, { ...result, data: day }, revision)) notifyTodayNutrition(day);
      }
    }
    return result;
  });
  let stopFallback: (() => void) | undefined;
  let stopAfter: (() => void) | undefined;
  const proceed = () => {
    const state = entry.resource.getSnapshot();
    if (state.status === 'loading' || (state.status === 'ready' && state.refreshing)) return;
    if (state.status === 'unavailable' && state.result.meta.httpStatus === 404 && !stopFallback) {
      weekUnsupported.add(client);
      stopFallback = fallback();
    }
    stopAfter ??= after?.();
  };
  const unsubscribe = entry.resource.subscribe(proceed);
  const stop = cache.prefetch([entry]);
  proceed();
  return () => { stop(); unsubscribe(); stopFallback?.(); stopAfter?.(); };
}
