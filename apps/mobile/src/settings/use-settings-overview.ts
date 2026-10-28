import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useMobileApi } from '@/api';
import { useMobileAuth } from '@/auth';
import type { MobileApiClient } from '@/api/client';
import { READ_REUSE_MS, settledWrites } from '@/api/confirmed-read-cache';
import { shouldRefreshOnForeground } from '@/api/resource';
import { fetchProfileIdentity, type ProfileIdentity } from '@/api/profile-identity';
import { fetchNutritionStages, type NutritionStages } from '@/api/nutrition-stages';
import { fetchMetricDefinitions, type MetricDefinitionsResponse } from '@/api/metric-definitions';
import { cachedStages, rememberStages } from '@/stages/stages-cache';
import { useNutritionConfiguration } from '@/nutrition/config-provider';
type Overview = {
  identity: ProfileIdentity | null;
  stages: NutritionStages | null;
  metrics: MetricDefinitionsResponse | null;
  loading: boolean;
  refreshing: boolean;
  metricsLoading: boolean;
  stagesLoading: boolean;
  identityLoading: boolean;
};
const empty: Overview = {
  identity: null,
  stages: null,
  metrics: null,
  loading: true,
  refreshing: false,
  metricsLoading: true,
  stagesLoading: true,
  identityLoading: true,
};
// Read-only memory cache, namespaced by authenticated client AND user. No private data on disk.
// `confirmedAt`/`writes`: when the last complete read happened and the account's settled writes at its start.
const cache = new WeakMap<MobileApiClient, { userId: string; data: Overview; confirmedAt?: number; writes?: number }>();
/** Same reuse window as the other retained presentation reads. */
export const SETTINGS_OVERVIEW_REUSE_MS = READ_REUSE_MS;
/** Focus re-reads only what may have changed: nothing complete yet, the window expired, or a write settled since. */
export function settingsOverviewStale(client: MobileApiClient, userId: string, now = Date.now()) {
  const stored = cache.get(client);
  return stored?.userId !== userId || stored.confirmedAt === undefined || now - stored.confirmedAt >= SETTINGS_OVERVIEW_REUSE_MS
    || stored.writes !== settledWrites(client);
}
export function useSettingsOverview() {
  const { client } = useMobileApi();
  const { session } = useMobileAuth();
  const userId = session?.user.id ?? '';
  const configuration = useNutritionConfiguration();
  const controller = configuration?.controller;
  const generation = useRef(0);
  const [snapshot, setSnapshot] = useState<{
    client: MobileApiClient | null;
    userId: string;
    data: Overview;
  } | null>(null);
  const stored = client ? cache.get(client) : null;
  const data =
    snapshot?.client === client && snapshot?.userId === userId
      ? snapshot.data
      : stored?.userId === userId
        ? stored.data
        : empty;
  const refresh = useCallback(
    (signal: AbortSignal) => {
      if (!client || !userId) return;
      const previous = cache.get(client);
      const base = previous?.userId === userId ? previous.data : empty;
      setSnapshot({
        client,
        userId,
        data: {
          ...base,
          refreshing: true,
          metricsLoading: true,
          stagesLoading: true,
          identityLoading: true,
        },
      });
      const version = ++generation.current;
      const writes = settledWrites(client);
      let remaining = 3, failed = false;
      let current: Overview = {
        ...base,
        refreshing: true,
        metricsLoading: true,
        stagesLoading: true,
        identityLoading: true,
      };
      const publish = (patch: Partial<Overview>) => {
        if (signal.aborted || version !== generation.current) return;
        remaining -= 1;
        current = {
          ...current,
          ...patch,
          loading:
            (patch.identityLoading ?? current.identityLoading) ||
            (patch.stagesLoading ?? current.stagesLoading),
          refreshing: remaining > 0,
        };
        // Only a complete, fully confirmed read opens the reuse window.
        cache.set(client, { userId, data: current, ...(remaining === 0 && !failed ? { confirmedAt: Date.now(), writes } : {}) });
        setSnapshot({ client, userId, data: current });
      };
      // Publish each answer independently; a slow stage endpoint never hides the profile or summaries.
      void fetchProfileIdentity(client, signal)
        .then((r) =>
          publish({
            identity: r.status === 'ok' ? r.data : (failed = true, base.identity),
            identityLoading: false,
          }),
        )
        .catch(() => { failed = true; publish({ identityLoading: false }); });
      void fetchNutritionStages(client, signal)
        .then((r) =>
          publish({
            stages: r.status === 'ok' ? (rememberStages(client, userId, r.data), r.data) : (failed = true, null),
            stagesLoading: false,
          }),
        )
        .catch(() => { failed = true; publish({ stages: null, stagesLoading: false }); });
      void fetchMetricDefinitions(client, signal)
        .then((r) =>
          publish({
            metrics: r.status === 'ok' ? r.data : (failed = true, base.metrics),
            metricsLoading: false,
          }),
        )
        .catch(() => { failed = true; publish({ metricsLoading: false }); });
      if (controller) void controller.load();
    },
    [client, userId, controller],
  );
  const visible = useRef(false);
  useFocusEffect(
    useCallback(() => {
      visible.current = true;
      const life = new AbortController();
      if (client && settingsOverviewStale(client, userId)) refresh(life.signal);
      return () => { visible.current = false; life.abort(); };
    }, [client, userId, refresh]),
  );
  useEffect(() => {
    const life = new AbortController();
    let previous = AppState.currentState;
    // Back from the background while Ajustes is on screen; not on every inactive → active nor while hidden.
    const subscription = AppState.addEventListener('change', (state) => {
      if (visible.current && shouldRefreshOnForeground(previous, state)) refresh(life.signal);
      previous = state;
    });
    return () => {
      life.abort();
      subscription.remove();
    };
  }, [refresh]);
  const confirmed = client ? cachedStages(client, userId) : null;
  return {
    ...data,
    stages:
      !data.stagesLoading && data.stages === null
        ? null
        : confirmed &&
            (!data.stages ||
              confirmed.listVersion > data.stages.listVersion ||
              confirmed.today > data.stages.today)
          ? confirmed
          : data.stages,
    configuration,
  };
}
