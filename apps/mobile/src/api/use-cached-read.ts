import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { MobileApiClient } from '@/api/client';
import type { MobileApiReadResult } from '@/api/results';
import { ApiResourceController, shouldRefreshOnForeground } from '@/api/resource';
import { confirmedReads, scopedReadKey, type ReadFamily } from '@/api/confirmed-read-cache';
import { nutritionToday } from '@/nutrition/day-format';

/** Opt-in presentation reads only. Operational/CAS reads never pass through this hook. */
export function useCachedRead<T>(client: MobileApiClient | null, family: ReadFamily, key: string,
  load: (client: MobileApiClient, signal: AbortSignal) => Promise<MobileApiReadResult<T>>) {
  const day = nutritionToday();
  const [, updateDay] = useState(day);
  const cache = client ? confirmedReads(client) : null;
  const entry = useMemo(() => cache && client ? cache.get(family, scopedReadKey(key, day), signal => load(client, signal)) : null, [cache, client, family, day, key, load]);
  const unavailable = useMemo(() => new ApiResourceController<T>(() => Promise.resolve({ status: 'auth_required',
    meta: { durationMs: 0, httpStatus: null, outcome: 'auth_required' } })), []);
  const resource = entry?.resource ?? unavailable;
  const subscribe = useCallback((listener: () => void) => resource.subscribe(listener), [resource]);
  const getSnapshot = useCallback(() => resource.getSnapshot(), [resource]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const visible = useRef(false);
  useEffect(() => {
    const detach = cache && entry ? cache.mount(entry) : () => {};
    if (cache && entry) void cache.ensure(entry, 'initial'); else void resource.refresh('initial');
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', next => {
      if (visible.current && shouldRefreshOnForeground(previous, next)) {
        const today = nutritionToday();
        if (today !== day) updateDay(today);
        else if (cache && entry) void cache.ensure(entry, 'foreground');
        else void resource.refresh('foreground');
      }
      previous = next;
    });
    return () => { subscription.remove(); detach(); };
  }, [cache, entry, resource, day]);
  useFocusEffect(useCallback(() => {
    visible.current = true;
    const blur = cache && entry ? cache.focus(entry) : () => {};
    if (cache && entry) {
      const today = nutritionToday();
      if (today !== day) updateDay(today); else void cache.ensure(entry, 'initial');
    }
    return () => { visible.current = false; blur(); };
  }, [cache, entry, day]));
  const refresh = useCallback(() => cache && entry ? cache.ensure(entry, 'manual') : resource.refresh('manual'), [cache, entry, resource]);
  /** After a confirmed write: never settle on a read that started before it. */
  const reload = useCallback(() => cache && entry ? cache.reload(entry) : resource.reload('manual'), [cache, entry, resource]);
  const current = state.status === 'ready' ? state.current : state.status === 'unavailable' ? state.previous : undefined;
  return { state, data: current?.data, refresh, reload };
}
