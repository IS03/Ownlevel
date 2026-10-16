import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useMobileApi } from '@/api';
import { useMobileAuth } from '@/auth';
import {
  fetchMetricDefinitions,
  type MetricDefinition,
} from '@/api/metric-definitions';
import type { MobileApiClient } from '@/api/client';
const cache = new WeakMap<
  MobileApiClient,
  { userId: string; definitions: MetricDefinition[] }
>();
const epochs = new WeakMap<MobileApiClient, number>();
const listeners = new Set<() => void>();
const changes = new Set<{
  client: MobileApiClient;
  userId: string;
  run: () => void;
}>();
export function subscribeMetricDefinitionsChanged(
  client: MobileApiClient,
  userId: string,
  run: () => void,
) {
  const entry = { client, userId, run };
  changes.add(entry);
  return () => {
    changes.delete(entry);
  };
}
export function metricDefinitionsChanged(
  client: MobileApiClient,
  userId: string,
) {
  changes.forEach((c) => {
    if (c.client === client && c.userId === userId) c.run();
  });
}
export function cachedMetricPresentation(
  client: MobileApiClient,
  userId: string,
) {
  const entry = cache.get(client);
  return entry?.userId === userId ? entry.definitions : [];
}
export function rememberMetricPresentation(
  client: MobileApiClient,
  userId: string,
  definitions: MetricDefinition[],
) {
  if (
    cache.get(client)?.userId === userId &&
    cache.get(client)?.definitions === definitions
  )
    return;
  epochs.set(client, (epochs.get(client) ?? 0) + 1);
  cache.set(client, { userId, definitions });
  listeners.forEach((f) => f());
}
/** Opt-in definitions are joined locally. Embedded day/Home DTOs stay compatible with old installed apps. */
export function useMetricPresentation() {
  const { client } = useMobileApi(),
    { session } = useMobileAuth();
  const userId = session?.user.id ?? '';
  const [, update] = useState(0);
  useEffect(() => {
    const f = () => update((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  useEffect(() => {
    if (!client || !userId) return;
    const life = new AbortController();
    let generation = 0;
    const refresh = () => {
      const epoch = epochs.get(client) ?? 0,
        run = ++generation;
      void fetchMetricDefinitions(client, life.signal)
        .then((r) => {
          if (
            !life.signal.aborted &&
            run === generation &&
            (epochs.get(client) ?? 0) === epoch &&
            r.status === 'ok'
          )
            rememberMetricPresentation(client, userId, r.data.definitions);
        })
        .catch(() => undefined);
    };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      life.abort();
      subscription.remove();
    };
  }, [client, userId]);
  const stored = client ? cache.get(client) : null;
  return stored?.userId === userId ? stored.definitions : [];
}
