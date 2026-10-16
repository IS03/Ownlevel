import { useCallback, useState } from 'react';

/**
 * The pull spinner belongs to the pull. Refreshes started by focus, foreground or a save run quietly:
 * a visible spinner pushes the whole screen down and back, and moves what the user is about to tap.
 */
export function usePullRefresh(refreshing: boolean, refresh: () => unknown) {
  const [pulled, setPulled] = useState(false);
  const [wasRefreshing, setWasRefreshing] = useState(refreshing);
  if (wasRefreshing !== refreshing) {
    setWasRefreshing(refreshing);
    if (!refreshing) setPulled(false);
  }
  const onRefresh = useCallback(() => { setPulled(true); void refresh(); }, [refresh]);
  return { refreshing: pulled && refreshing, onRefresh };
}
