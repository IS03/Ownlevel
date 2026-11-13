import { useCallback, useEffect, useMemo, useReducer, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { MobileApiClient } from '@/api/client';
import { confirmedReads, scopedReadKey } from '@/api/confirmed-read-cache';
import { fetchMobileHome, type MobileHomeResponse } from '@/api/home';
import { ApiResourceController, shouldRefreshOnForeground, type ResourceRefreshTrigger } from '@/api/resource';

const unavailable = {
  status: 'unavailable' as const,
  reason: 'invalid_response' as const,
  meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const },
};

/** The one retained `/home` reading of this account and Córdoba day (`day`), shared by Inicio and Entrenar. */
export function sharedHomeRead(client: MobileApiClient, day: string) {
  return confirmedReads(client).get<MobileHomeResponse>('home', scopedReadKey('home', day), signal => fetchMobileHome(client, signal));
}

/**
 * `/api/mobile/v1/home` through the existing ConfirmedReadCache (#303 C2): Inicio and Entrenar read the SAME retained
 * controller, so a reading one of them confirmed less than 30 s ago (and not invalidated by a write since) answers the
 * other without a request, and two simultaneous asks share one request. Scoped by client (account) and Córdoba day.
 *
 * - `ensure('initial')` reuses a fresh, valid reading; `ensure('manual' | 'foreground')` always reads (joining a read
 *   already in flight).
 * - `reload()` after a settled write: never joins a read that may predate it (see ConfirmedReadCache.reload).
 * - `focus()` while the screen is on screen: a write of its domains then revalidates it at once (as other families).
 * - 401/403 discard the confirmed reading (no protected data shown as confirmed); the provider clears the whole cache
 *   when the account changes.
 */
export function useSharedHomeRead(client: MobileApiClient | null, today: () => string, visible: () => boolean) {
  const cache = client ? confirmedReads(client) : null;
  // The Córdoba day keys the reading. Past midnight a read must land in the new day's reading, not the old one: a
  // read asked for after the day changed re-renders onto the new key, whose first ensure reads it (once).
  const [, nextDay] = useReducer((n: number) => n + 1, 0);
  const day = today();
  const todayRef = useRef(today);
  useEffect(() => { todayRef.current = today; });
  const dayChanged = useCallback(() => {
    if (todayRef.current() === day) return false;
    nextDay(); return true;
  }, [day]);
  const entry = useMemo(() => client ? sharedHomeRead(client, day) : null, [client, day]);
  // No client: the same honest unavailable answer the screens showed before, never a shared reading.
  const fallback = useMemo(() => new ApiResourceController<MobileHomeResponse>(() => Promise.resolve(unavailable)), []);
  useEffect(() => () => fallback.dispose(), [fallback]);
  const resource = entry?.resource ?? fallback;
  const subscribe = useCallback((listener: () => void) => resource.subscribe(listener), [resource]);
  const getSnapshot = useCallback(() => resource.getSnapshot(), [resource]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const visibleRef = useRef(visible);
  useEffect(() => { visibleRef.current = visible; });

  const ensure = useCallback((trigger: ResourceRefreshTrigger) => dayChanged() ? Promise.resolve()
    : cache && entry ? cache.ensure(entry, trigger) : resource.refresh(trigger), [cache, dayChanged, entry, resource]);
  const reload = useCallback(() => dayChanged() ? Promise.resolve()
    : cache && entry ? cache.reload(entry) : resource.reload('manual'), [cache, dayChanged, entry, resource]);
  /** Marks the reading as on screen; returns the blur. */
  const focus = useCallback(() => cache && entry ? cache.focus(entry) : () => {}, [cache, entry]);

  useEffect(() => {
    const detach = cache && entry ? cache.mount(entry) : () => {};
    void ensure('initial');
    let previous = AppState.currentState;
    // Both screens stay mounted as tabs: only the one on screen reads when the app returns to the foreground.
    const subscription = AppState.addEventListener('change', next => {
      if (shouldRefreshOnForeground(previous, next) && visibleRef.current()) void ensure('foreground');
      previous = next;
    });
    return () => { subscription.remove(); detach(); };
  }, [cache, entry, ensure]);

  return { state, resource, ensure, reload, focus, refresh: useCallback(() => ensure('manual'), [ensure]) };
}
