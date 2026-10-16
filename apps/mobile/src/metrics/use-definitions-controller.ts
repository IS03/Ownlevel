import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { MobileApiClient } from '@/api/client';
import { fetchMetricDefinitions, mutateMetricDefinition, reorderMetricDefinitions } from '@/api/metric-definitions';
import { shouldRefreshOnForeground } from '@/api/resource';
import { DefinitionsController, type DefinitionsState } from './definitions-controller';
import { DefinitionIntentRepository } from './definitions-storage';
import {rememberMetricPresentation,metricDefinitionsChanged} from './presentation-resource';

/**
 * One controller per client/user. Focus/foreground re-read server truth; drafts stay.
 * Daily Metrics and Nutrition re-read their day on focus, so they reflect every
 * confirmed change when the user returns to them (no parallel cache to keep in sync).
 */
export function useDefinitionsController(client: MobileApiClient | null, userId: string) {
  const [current, setCurrent] = useState<{ client: MobileApiClient; userId: string; controller: DefinitionsController; state: DefinitionsState } | null>(null);
  useEffect(() => {
    if (!client) return;
    const life = new AbortController();
    const controller = new DefinitionsController({
      read: () => fetchMetricDefinitions(client,life.signal),
      mutate: intent => mutateMetricDefinition(client, intent, life.signal),
      reorder: intent => reorderMetricDefinitions(client, intent, life.signal),
    }, new DefinitionIntentRepository(AsyncStorage, userId),()=>metricDefinitionsChanged(client,userId));
    const unsubscribe = controller.subscribe(() => {const state=controller.getSnapshot();if(state.read.definitions&&!state.read.refreshing&&!state.read.stale&&['idle','confirmed'].includes(state.phase))rememberMetricPresentation(client,userId,state.read.definitions);setCurrent({ client, userId, controller, state });});
    void controller.initialize();
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', next => { if (shouldRefreshOnForeground(previous, next)) void controller.load(); previous = next; });
    return () => { subscription.remove(); unsubscribe(); controller.dispose(); life.abort(); };
  }, [client, userId]);
  const active = current?.client === client && current.userId === userId ? current : null;
  const controller = active?.controller;
  useFocusEffect(useCallback(() => { if (controller && controller.getSnapshot().phase !== 'loading') void controller.load(); }, [controller]));
  return active;
}
