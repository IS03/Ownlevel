import { useCallback } from 'react';
import * as SplashScreen from 'expo-splash-screen';

import { markSplashHidden } from './first-data';

let handled = false;

/** The branded React view must have native bounds before iOS/Android reveals it. */
export function useNativeSplash(ready: boolean) {
  return useCallback(() => {
    if (handled || !ready) return;
    handled = true;
    markSplashHidden();
    void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
}
