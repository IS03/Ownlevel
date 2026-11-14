import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { MobileApiClient } from '@/api/client';
import { fetchMobileNutritionDay } from '@/api/nutrition-day';
import { confirmQuickMeal, fetchQuickOptions, previewQuickMeal } from '@/api/nutrition-quick';
import { fetchFood } from '@/api/nutrition-food';
import { settledWritesFor } from '@/api/confirmed-read-cache';
import { shouldRefreshOnForeground } from '@/api/resource';
import { nutritionToday } from './day-format';
import { QuickController, type QuickState } from './quick-controller';
import { QuickIntentRepository } from './quick-storage';
export function useQuickController(client: MobileApiClient | null, userId: string, invalidate: () => void) {
  const [current, setCurrent] = useState<{ client: MobileApiClient; userId: string; controller: QuickController; state: QuickState } | null>(null);
  useEffect(() => {
    if (!client) return;
    const lifetime = new AbortController();
    const controller = new QuickController({ food: id => fetchFood(client, id, lifetime.signal), options: () => fetchQuickOptions(client, lifetime.signal), preview: s => previewQuickMeal(client, s, lifetime.signal),
      confirm: i => confirmQuickMeal(client, i, lifetime.signal), read: d => fetchMobileNutritionDay(client, d, lifetime.signal) }, new QuickIntentRepository(AsyncStorage, userId), invalidate,
      undefined, { now: () => Date.now(), writeRevision: () => settledWritesFor(client, ['nutrition']), today: () => nutritionToday() });
    const unsubscribe = controller.subscribe(() => setCurrent({ client, userId, controller, state: controller.getSnapshot() }));
    void controller.initialize();
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', next => {
      if (shouldRefreshOnForeground(previous, next) && controller.getSnapshot().open) void controller.loadOptions();
      previous = next;
    });
    return () => { subscription.remove(); unsubscribe(); controller.dispose(); lifetime.abort(); };
  }, [client, userId, invalidate]);
  return current?.client === client && current.userId === userId ? current : null;
}
