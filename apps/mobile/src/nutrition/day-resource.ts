import { useCallback } from 'react';
import type { MobileApiClient } from '@/api/client';
import { useCachedRead } from '@/api/use-cached-read';
import { fetchMobileNutritionDay, isNutritionDate } from '@/api/nutrition-day';
import { confirmedReads, scopedReadKey } from '@/api/confirmed-read-cache';
import { nutritionToday } from './day-format';

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
