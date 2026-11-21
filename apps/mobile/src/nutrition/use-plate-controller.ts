import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { MobileApiClient } from '@/api/client';
import { fetchMobileNutritionDay } from '@/api/nutrition-day';
import { confirmQuickMeal, previewQuickMeal } from '@/api/nutrition-quick';
import { fetchFoods } from '@/api/nutrition-food';
import { shouldRefreshOnForeground } from '@/api/resource';
import { PlateController, type PlateState } from './plate-controller';
import { PlateIntentRepository } from './plate-storage';
export function usePlateController(client: MobileApiClient | null, userId: string, invalidate: () => void) {
  const [current, setCurrent] = useState<{ client: MobileApiClient; userId: string; controller: PlateController; state: PlateState } | null>(null);
  useEffect(() => {
    if (!client) return;
    const lifetime = new AbortController();
    const controller = new PlateController({ foods: () => fetchFoods(client, 'active', '', lifetime.signal), preview: s => previewQuickMeal(client, s, lifetime.signal),
      confirm: i => confirmQuickMeal(client, i, lifetime.signal), read: d => fetchMobileNutritionDay(client, d, lifetime.signal) }, new PlateIntentRepository(AsyncStorage, userId), invalidate);
    const unsubscribe = controller.subscribe(() => setCurrent({ client, userId, controller, state: controller.getSnapshot() }));
    void controller.initialize();
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', next => {
      if (shouldRefreshOnForeground(previous, next) && controller.getSnapshot().open) void controller.loadFoods();
      previous = next;
    });
    return () => { subscription.remove(); unsubscribe(); controller.dispose(); lifetime.abort(); };
  }, [client, userId, invalidate]);
  return current?.client === client && current.userId === userId ? current : null;
}
