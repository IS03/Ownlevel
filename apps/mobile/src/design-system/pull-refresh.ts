import { useCallback, useRef, useState } from 'react';

export type PullRead = () => PromiseLike<unknown> | void;

/** Only the user's pull owns this spinner. The read can join an existing background request. */
export function usePullRefresh(refresh: PullRead) {
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);
  const onRefresh = useCallback(() => {
    if (inFlight.current) return;
    const request = refresh();
    if (!request) return;
    inFlight.current = true;
    setRefreshing(true);
    const settle = () => { inFlight.current = false; setRefreshing(false); };
    void Promise.resolve(request).then(settle, settle);
  }, [refresh]);
  return { refreshing, onRefresh };
}
