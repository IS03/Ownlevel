import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';

import { FIRST_DATA_HOLD_MS, markRestored, markSplashHidden, onFirstData } from './first-data';

/**
 * Session restoration owns this boundary; navigation and auth semantics are unchanged. With a restored session the splash
 * also waits, at most `FIRST_DATA_HOLD_MS`, for Inicio's first data (#536); without one it goes as soon as restoration ends.
 */
export function useNativeSplash(status: string, waitForData = false) {
  useEffect(() => {
    if (status === 'BOOTSTRAPPING') return;
    markRestored();
    let hidden = false;
    const hide = () => {
      if (hidden) return;
      hidden = true;
      markSplashHidden();
      void SplashScreen.hideAsync().catch(() => undefined);
    };
    if (!waitForData) { hide(); return; }
    const timer = setTimeout(hide, FIRST_DATA_HOLD_MS);
    const stop = onFirstData(hide);
    return () => { clearTimeout(timer); stop(); };
  }, [status, waitForData]);
}
