import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

/** A return revalidates the whole reading, including external revisions. Initial mount is already loaded by the resource. */
export function usePeriodReturn(refresh: () => Promise<unknown>) {
  const opened = useRef(false);
  useFocusEffect(useCallback(() => { if (opened.current) void refresh(); opened.current = true; }, [refresh]));
}
