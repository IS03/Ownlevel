import { useCallback } from 'react';
import type { MobileApiClient } from '@/api/client';
import { confirmedReads, scopedReadKey } from '@/api/confirmed-read-cache';
import { useCachedRead } from '@/api/use-cached-read';
import { fetchNutritionReport, reportQueryKey, type ReportQuery } from '@/api/nutrition-report';
import { nutritionToday } from './day-format';

/**
 * A nutrition report range shared by Nutrición (week, calendar, report) and Progreso. One retained reading per
 * account, Córdoba day and range: it shows at once, revalidates after the reuse window, and every settled write that
 * can move it (meals, metrics, plan, weight, training days) invalidates it through the API client.
 */
export function useNutritionReportResource(client: MobileApiClient | null, query: ReportQuery) {
  const date = reportQueryKey(query);
  const { period, from, to } = query;
  const load = useCallback((c: MobileApiClient, signal: AbortSignal) => fetchNutritionReport(c, {
    period, ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}),
  }, signal), [period, from, to]);
  const { state, refresh } = useCachedRead(client, 'nutrition-report', date, load);
  return { date, state, refresh };
}

/** Reads a range in the background (calendar months) so opening it shows real data at once. */
export function prefetchNutritionReport(client: MobileApiClient | null, query: ReportQuery) {
  if (!client) return;
  const cache = confirmedReads(client);
  const entry = cache.get('nutrition-report', scopedReadKey(reportQueryKey(query), nutritionToday()),
    signal => fetchNutritionReport(client, query, signal));
  // Never a second request: a reading already confirmed or on its way answers the screen that opens it.
  if (entry.resource.getSnapshot().status === 'loading' && !entry.resource.isRefreshing()) void cache.ensure(entry, 'initial');
}
