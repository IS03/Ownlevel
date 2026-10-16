import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useMobileApi } from '@/api';
import { useMobileAuth } from '@/auth';
import type { MobileApiClient } from '@/api/client';
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
const cache = new WeakMap<MobileApiClient, { userId: string; data: Overview }>();
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
      let remaining = 3;
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
        cache.set(client, { userId, data: current });
        setSnapshot({ client, userId, data: current });
      };
      // Publish each answer independently; a slow stage endpoint never hides the profile or summaries.
      void fetchProfileIdentity(client, signal)
        .then((r) =>
          publish({
            identity: r.status === 'ok' ? r.data : base.identity,
            identityLoading: false,
          }),
        )
        .catch(() => publish({ identityLoading: false }));
      void fetchNutritionStages(client, signal)
        .then((r) =>
          publish({
            stages: r.status === 'ok' ? (rememberStages(client, userId, r.data), r.data) : null,
            stagesLoading: false,
          }),
        )
        .catch(() => publish({ stages: null, stagesLoading: false }));
      void fetchMetricDefinitions(client, signal)
        .then((r) =>
          publish({
            metrics: r.status === 'ok' ? r.data : base.metrics,
            metricsLoading: false,
          }),
        )
        .catch(() => publish({ metricsLoading: false }));
      if (controller) void controller.load();
    },
    [client, userId, controller],
  );
  useFocusEffect(
    useCallback(() => {
      const life = new AbortController();
      refresh(life.signal);
      return () => life.abort();
    }, [refresh]),
  );
  useEffect(() => {
    const life = new AbortController();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh(life.signal);
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
