import { useEffect, useState, useSyncExternalStore } from 'react';
import { Keyboard, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSessionPresenceStore } from './session-presence-provider';
import type { SessionPresence } from './session-presence-store';
import { useRestCountdown } from './use-rest-countdown';

const absent: SessionPresence = { session: null, timer: null, unavailable: false, recovery: false };
const getAbsent = () => absent;
const noSubscription = () => () => {};

/** Navigation observes the existing owner-scoped session; it never creates a controller or writes. */
export function useSessionNavigation() {
  const store = useSessionPresenceStore();
  const presence = useSyncExternalStore(store?.subscribe ?? noSubscription, store?.getSnapshot ?? getAbsent, store?.getSnapshot ?? getAbsent);
  const pathname = usePathname();
  const router = useRouter();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const shown = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hidden = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  const seconds = useRestCountdown(presence.timer, false);
  const inSession = !!presence.session && pathname === `/train/session/${presence.session.id}`;
  const sessionId = presence.session?.id ?? null;
  return {
    ...presence, seconds, inSession, keyboardVisible,
    // The detached "back to the workout" tab: an active workout you are outside of. The tab set
    // changes in place (expo-router patched not to remount the tabs), so UIKit animates it.
    showReturn: !!sessionId && !inSession,
    showRest: !!presence.session && !!presence.timer && seconds > 0 && !inSession && !keyboardVisible,
    openSession: () => {
      if (presence.session) router.navigate({ pathname: '/(tabs)/train/session/[id]', params: { id: presence.session.id } });
    },
  };
}

export type SessionNavigation = ReturnType<typeof useSessionNavigation>;
export const supportsNativeSessionNavigation = Platform.OS === 'ios' && Number(Platform.Version) >= 26;
