import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { MobileApiClient } from '@/api/client';
import { ActiveSessionController, activeSessionApi, sessionIntentKey } from './active-session-controller';
import { SessionDraftRepository } from './active-session-storage';
import { activeSessionStorage } from './active-session-native-storage';
import { trainingFeelingsApi, TrainingFeelingsJournal } from '@/api/training-feelings';
import { useSessionPresenceStore } from './session-presence-provider';

export function useActiveSession(client: MobileApiClient, userId: string, sessionId: string) {
  const presence = useSessionPresenceStore();
  const controller = useMemo(() => new ActiveSessionController(activeSessionApi(client, sessionId),
    new SessionDraftRepository(activeSessionStorage, userId, sessionId), sessionIntentKey, Date.now,
    new TrainingFeelingsJournal(activeSessionStorage, trainingFeelingsApi(client, sessionId), userId, sessionId, 'mobile', sessionIntentKey)), [client, sessionId, userId]);
  useEffect(() => {
    controller.activate();
    if (AppState.currentState !== 'active') controller.suspend();
    void controller.refresh();
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', next => {
      if (next !== 'active') controller.suspend();
      else if (previous !== 'active') void controller.resume();
      previous = next;
    });
    return () => { subscription.remove(); controller.dispose(); };
  }, [controller]);
  useEffect(() => presence?.attach(sessionId, controller), [controller, presence, sessionId]);
  useFocusEffect(useCallback(() => { void controller.resume(); return () => { controller.suspend(); }; }, [controller]));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { controller, state };
}
