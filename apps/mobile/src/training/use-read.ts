import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { MobileApiReadResult, MobileApiRequestResult } from '@/api/results';

/**
 * Small read state for history screens. A reload keeps the last confirmed data
 * visible (stale, not empty); "not_found" stays distinct from "unavailable".
 */
export type ReadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T; refreshing: boolean; stale: boolean }
  | { status: 'not_found' }
  | { status: 'unavailable' };
type Loader<T> = (signal: AbortSignal) => Promise<MobileApiReadResult<T> | MobileApiRequestResult<T>>;

export function useRead<T>(loader: Loader<T>, initial?: T, { loadOnMount = true }: { loadOnMount?: boolean } = {}) {
  const [state, setState] = useState<ReadState<T>>(initial === undefined ? { status: 'loading' } : { status: 'ready', data: initial, refreshing: true, stale: false });
  const controller = useRef<AbortController | null>(null);
  const start = useCallback(() => {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    return loader(abort.signal).then(result => {
      if (abort.signal.aborted) return;
      if (result.status === 'ok') setState({ status: 'ready', data: result.data, refreshing: false, stale: false });
      else if (result.status === 'not_found') setState({ status: 'not_found' });
      else setState(current => current.status === 'ready' ? { ...current, refreshing: false, stale: true } : { status: 'unavailable' });
    });
  }, [loader]);
  const reload = useCallback(() => {
    setState(current => current.status === 'ready' ? { ...current, refreshing: true } : { status: 'loading' });
    return start();
  }, [start]);
  useEffect(() => {
    if (loadOnMount) void start();
    return () => controller.current?.abort();
  }, [start, loadOnMount]);
  return { state, reload };
}

/** Navigation owns the initial load and every return; it must not also load on mount. */
export function useFocusedRead<T>(loader: Loader<T>) {
  const read = useRead(loader, undefined, { loadOnMount: false });
  const { reload } = read;
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  return read;
}
