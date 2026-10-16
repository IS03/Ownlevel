import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { MobileApiClient } from '@/api/client';
import { ApiResourceController, type ApiResourceState, shouldRefreshOnForeground } from '@/api/resource';
import { fetchMobileNutritionDay, type MobileNutritionDayResponse } from '@/api/nutrition-day';

const initialState: ApiResourceState<MobileNutritionDayResponse> = { status: 'loading', trigger: 'initial' };

export function useNutritionDayResource(client: MobileApiClient | null, date: string) {
  const [reading, setReading] = useState({ client, date, state: initialState });
  const active = useRef<{ client: MobileApiClient | null; date: string; controller: ApiResourceController<MobileNutritionDayResponse> } | null>(null);
  // Hide the previous scope synchronously, even before its effect is cleaned up.
  const state = reading.client === client && reading.date === date ? reading.state : initialState;
  const refresh = useCallback(() => {
    const resource = active.current;
    return resource?.client === client && resource.date === date
      ? resource.controller.refresh('manual') : Promise.resolve();
  }, [client, date]);
  /** After a confirmed write: drop any read that may predate it. */
  const reload = useCallback(() => {
    const resource = active.current;
    return resource?.client === client && resource.date === date
      ? resource.controller.reload('manual') : Promise.resolve();
  }, [client, date]);
  useEffect(() => {
    // Create per effect lifetime as well as per date/client. Strict Mode may
    // replay effects; a disposed controller must never be reused.
    const controller = new ApiResourceController(signal => client
      ? fetchMobileNutritionDay(client, date, signal)
      : Promise.resolve({ status: 'unavailable' as const, reason: 'invalid_response' as const,
        meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const } }));
    active.current = { client, date, controller };
    const unsubscribe = controller.subscribe(next => setReading({ client, date, state: next }));
    void controller.refresh('initial');
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', next => {
      if (shouldRefreshOnForeground(previous, next)) void controller.refresh('foreground');
      previous = next;
    });
    return () => {
      subscription.remove(); unsubscribe(); controller.dispose();
      if (active.current?.controller === controller) active.current = null;
    };
  }, [client, date]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  return { date, state, refresh, reload };
}
