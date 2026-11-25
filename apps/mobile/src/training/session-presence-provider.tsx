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
import { syncRestAlert, syncSetTargetAlert } from './session-rest-alert';
import { liveActivityState, type RestAnchor } from './live-activity-model';
import { syncLiveActivity } from './live-activity-sync';
import { listenLiveActivityActions } from './live-activity-actions';
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
    let anchor: RestAnchor = null;
    const sync = (force = false) => {
      const presence = store.getSnapshot();
      syncRestAlert(presence.timer?.endAt ?? null);
      const watch = presence.stopwatch;
      syncSetTargetAlert(watch?.target ? watch.startedAt + watch.target * 1000 : null, watch?.target ?? null);
      const next = liveActivityState(presence, anchor, Date.now());
      anchor = next.anchor;
      void syncLiveActivity(next.state, force);
    };
    const unsubscribe = store.subscribe(() => sync());
    // iOS starts a Live Activity only in the foreground: retry one that could not start.
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') sync(true); });
    // +15 s, Saltar and Completar serie from the Lock Screen and the Dynamic Island (#645).
    const stopActions = listenLiveActivityActions(store);
    sync();
    // Signing out or switching accounts ends both the alert and the activity.
    return () => { unsubscribe(); foreground.remove(); stopActions(); store.dispose(); syncRestAlert(null); syncSetTargetAlert(null, null); void syncLiveActivity(null); };
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
