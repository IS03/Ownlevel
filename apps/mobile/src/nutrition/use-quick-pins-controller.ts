import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import type { MobileApiClient } from '@/api/client';
import { fetchQuickOptions, putQuickPins } from '@/api/nutrition-quick';
import type { QuickState } from './quick-controller';
import { QuickPinsController, type QuickPinsState } from './quick-pins-controller';
import { QuickPinsIntentRepository } from './quick-pins-storage';

/**
 * #479 B: one pins controller per account and client (a switch or sign-out disposes it; late answers are ignored). It reads
 * no pins of its own: it adopts `pins` from the quick-options answer Rápido's controller already holds. Mounted by increment C.
 */
export function useQuickPinsController(client: MobileApiClient | null, userId: string, quick: Pick<QuickState, 'options' | 'optionsError'> | null) {
  const [current, setCurrent] = useState<{ client: MobileApiClient; userId: string; controller: QuickPinsController; state: QuickPinsState } | null>(null);
  useEffect(() => {
    if (!client) return;
    const lifetime = new AbortController();
    const controller = new QuickPinsController({ write: write => putQuickPins(client, write, lifetime.signal), read: () => fetchQuickOptions(client, lifetime.signal) },
      new QuickPinsIntentRepository(AsyncStorage, userId));
    const unsubscribe = controller.subscribe(() => setCurrent({ client, userId, controller, state: controller.getSnapshot() }));
    // Reading the stored intent always publishes (idle, uncertain or blocked): that is the first state of this account.
    void controller.initialize();
    return () => { unsubscribe(); controller.dispose(); lifetime.abort(); };
  }, [client, userId]);
  const controller = current?.client === client && current.userId === userId ? current.controller : null;
  const options = quick?.options ?? null, failed = quick?.optionsError ?? false;
  // The same GET answer, once per new answer: no request of its own.
  useEffect(() => { if (controller && options) controller.adopt(options.pins); }, [controller, options]);
  useEffect(() => { if (controller && failed && !options) controller.adopt({ status: 'unavailable' }); }, [controller, failed, options]);
  return controller && current ? current : null;
}
