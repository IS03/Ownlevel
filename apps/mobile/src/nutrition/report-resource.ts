import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { MobileApiClient } from '@/api/client';
import type { MobileApiReadResult } from '@/api/results';
import {
  ApiResourceController,
  type ApiResourceState,
  shouldRefreshOnForeground,
} from '@/api/resource';
import {
  fetchNutritionReport,
  reportQueryKey,
  type NutritionReport,
  type ReportQuery,
} from '@/api/nutrition-report';

const initialState: ApiResourceState<NutritionReport> = { status: 'loading', trigger: 'initial' };

/**
 * Last confirmed reading per client (one client per signed-in user) and query. A cached range shows at once and
 * is revalidated right away; it is never presented as fresher than it is (the read marks it refreshing).
 */
type OkReport = Extract<MobileApiReadResult<NutritionReport>, { status: 'ok' }>;
const cache = new WeakMap<
  MobileApiClient,
  Map<string, { confirmedAt: number; result: OkReport }>
>();
const inFlight = new WeakMap<
  MobileApiClient,
  Map<string, Promise<MobileApiReadResult<NutritionReport>>>
>();
const scope = <V>(map: WeakMap<MobileApiClient, Map<string, V>>, client: MobileApiClient) => {
  let entries = map.get(client);
  if (!entries) {
    entries = new Map();
    map.set(client, entries);
  }
  return entries;
};
const epochs = new WeakMap<MobileApiClient, number>();
const activeReports = new WeakMap<MobileApiClient, Set<ApiResourceController<NutritionReport>>>();
const remember = (
  client: MobileApiClient,
  key: string,
  result: MobileApiReadResult<NutritionReport>,
  epoch: number,
) => {
  if (result.status === 'ok' && (epochs.get(client) ?? 0) === epoch)
    scope(cache, client).set(key, { confirmedAt: Date.now(), result });
  return result;
};
/** Reads a range in the background (calendar months) so opening it shows real data at once. */
export function prefetchNutritionReport(client: MobileApiClient | null, query: ReportQuery) {
  if (!client) return;
  const key = reportQueryKey(query),
    pending = scope(inFlight, client);
  if (scope(cache, client).has(key) || pending.has(key)) return;
  const epoch = epochs.get(client) ?? 0;
  const read = fetchNutritionReport(client, query)
    .then((result) => remember(client, key, result, epoch))
    .finally(() => {
      if (pending.get(key) === read) pending.delete(key);
    });
  pending.set(key, read);
}

export function useNutritionReportResource(client: MobileApiClient | null, query: ReportQuery) {
  const date = reportQueryKey(query);
  const { period, from, to } = query;
  const scopedQuery = useMemo(
    () => ({
      period,
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
    }),
    [period, from, to],
  );
  const [reading, setReading] = useState({ client, date, state: initialState });
  const active = useRef<{
    client: MobileApiClient | null;
    date: string;
    controller: ApiResourceController<NutritionReport>;
  } | null>(null);
  // Hide the previous scope synchronously, even before its effect is cleaned up.
  const state = reading.client === client && reading.date === date ? reading.state : initialState;
  const refresh = useCallback(() => {
    const resource = active.current;
    return resource?.client === client && resource.date === date
      ? resource.controller.refresh('manual')
      : Promise.resolve();
  }, [client, date]);
  useEffect(() => {
    // Create per effect lifetime as well as per date/client. Strict Mode may
    // replay effects; a disposed controller must never be reused.
    const cached = client ? cache.get(client)?.get(date) : undefined;
    const controller = new ApiResourceController(
      (signal) => {
        if (!client)
          return Promise.resolve({
            status: 'unavailable' as const,
            reason: 'invalid_response' as const,
            meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const },
          });
        // A prefetch already on its way answers the first read instead of a second request.
        const pending = inFlight.get(client)?.get(date);
        return (
          pending ??
          (() => {
            const epoch = epochs.get(client) ?? 0;
            return fetchNutritionReport(client, scopedQuery, signal).then((result) =>
              remember(client, date, result, epoch),
            );
          })()
        );
      },
      Date.now,
      cached,
    );
    active.current = { client, date, controller };
    if (client) {
      const live = activeReports.get(client) ?? new Set();
      live.add(controller);
      activeReports.set(client, live);
    }
    const unsubscribe = controller.subscribe((next) => setReading({ client, date, state: next }));
    void controller.refresh('initial');
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (shouldRefreshOnForeground(previous, next)) void controller.refresh('foreground');
      previous = next;
    });
    return () => {
      subscription.remove();
      unsubscribe();
      controller.dispose();
      if (client) activeReports.get(client)?.delete(controller);
      if (active.current?.controller === controller) active.current = null;
    };
  }, [client, date, scopedQuery]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  return { date, state, refresh };
}
/** Tests only: forget every cached range for this client. */
export function resetNutritionReportCacheForTests(client: MobileApiClient) {
  cache.delete(client);
  inFlight.delete(client);
}

/** Drop old prefetches too: they must never repopulate cache after a confirmed plan/configuration write. */
export function invalidateNutritionReports(client: MobileApiClient) {
  epochs.set(client, (epochs.get(client) ?? 0) + 1);
  cache.delete(client);
  inFlight.delete(client);
  activeReports.get(client)?.forEach((controller) => {
    void controller.reload('manual');
  });
}
