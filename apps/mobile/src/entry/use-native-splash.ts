import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
/** Session restoration owns this boundary; navigation and auth semantics are unchanged. */
export function useNativeSplash(status: string) {
  useEffect(() => {
    if (status !== 'BOOTSTRAPPING') void SplashScreen.hideAsync().catch(() => undefined);
  }, [status]);
}
