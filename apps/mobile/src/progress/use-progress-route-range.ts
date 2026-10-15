import { useLayoutEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { progressStateForRange } from './progress-range';
import { useProgressRange } from './progress-range-context';

export function useProgressRouteRange() {
  const params = useLocalSearchParams<{ from?: string; to?: string }>();
  const { state, setState, today } = useProgressRange();
  const key = `${params.from ?? ''}|${params.to ?? ''}`;
  const makeEntry = () => ({
    key,
    initial: state,
    incoming: progressStateForRange(params.from, params.to, state, today),
  });
  const [entry, setEntry] = useState(makeEntry);
  // A new link may reuse the mounted route. Consume each set of incoming params once,
  // while changes made in the shared period controls remain free afterwards.
  if (entry.key !== key) setEntry(makeEntry());
  const pending = entry.incoming !== null && state === entry.initial;
  useLayoutEffect(() => {
    if (pending && entry.incoming) setState(entry.incoming);
  }, [entry, pending, setState]);
  return entry.key === key && !pending;
}
