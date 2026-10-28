import { useCallback } from 'react';
import type { MobileApiClient } from '@/api/client';
import { useCachedRead } from '@/api/use-cached-read';
import { fetchMobileNutritionDay } from '@/api/nutrition-day';

/**
 * One retained reading per account and date, shared by the day screen and the meal projection. A day already
 * visited shows at once and revalidates like any other focus; settled writes invalidate it through the API client.
 * Writes keep their own versions and CAS: this reading is what the screen shows, never a write confirmation.
 */
export function useNutritionDayResource(client: MobileApiClient | null, date: string) {
  const load = useCallback((c: MobileApiClient, signal: AbortSignal) => fetchMobileNutritionDay(c, date, signal), [date]);
  const { state, refresh, reload } = useCachedRead(client, 'nutrition-day', date, load);
  return { date, state, refresh, reload };
}
