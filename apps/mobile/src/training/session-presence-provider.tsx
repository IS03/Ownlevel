import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { useMobileApi } from '@/api';
import { settledWrites } from '@/api/confirmed-read-cache';
import { shouldRefreshOnForeground } from '@/api/resource';
import { fetchSessionDetail } from '@/api/active-session';
import { fetchMobileTraining } from '@/api/training';
import { useMobileAuth } from '@/auth';
import { homeDay } from '@/home/home-day';
import { activeSessionStorage } from './active-session-native-storage';
import { SessionPresenceStore } from './session-presence-store';
import { useRestCountdown } from './use-rest-countdown';
import type { RestDeadline } from './active-session-model';

export const SessionPresenceContext = createContext<SessionPresenceStore | null>(null);

function RestEndSignal({ store }: { store: SessionPresenceStore }) {
  const { timer } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return timer ? <RestDeadlineSignal key={timer.exerciseId} timer={timer} /> : null;
}
function RestDeadlineSignal({ timer }: { timer: RestDeadline }) {
  useRestCountdown(timer, true);
  return null;
}
function PresenceLifetime({ store, children }: PropsWithChildren<{ store: SessionPresenceStore }>) {
  const pathname = usePathname();
  useEffect(() => {
    store.activate();
    return () => store.dispose();
  }, [store]);
  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', state => {
      if (shouldRefreshOnForeground(previous, state) && !/^\/train\/session\//.test(pathname)) void store.refresh();
      previous = state;
    });
    return () => subscription.remove();
  }, [pathname, store]);
  useEffect(() => {
    // The mounted session controller already reads and publishes its own server truth.
    if (!/^\/train\/session\//.test(pathname)) void store.refreshIfNeeded();
  }, [pathname, store]);
  return <SessionPresenceContext.Provider value={store}>{children}<RestEndSignal store={store} /></SessionPresenceContext.Provider>;
}

export function SessionPresenceProvider({ children }: PropsWithChildren) {
  const { client } = useMobileApi();
  const { session } = useMobileAuth();
  const owner = session?.user.id;
  const store = useMemo(() => client && owner ? new SessionPresenceStore({
    active: () => fetchMobileTraining(client, homeDay().today.slice(0, 7)),
    detail: id => fetchSessionDetail(client, id),
  }, activeSessionStorage, owner, { writeRevision: () => settledWrites(client) }) : null, [client, owner]);
  // A different account gets a fresh store; no session/timer crosses the auth boundary.
  return store ? <PresenceLifetime key={owner} store={store}>{children}</PresenceLifetime> : <>{children}</>;
}

export function useSessionPresenceStore() { return useContext(SessionPresenceContext); }
