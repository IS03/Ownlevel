import { Redirect, useIsFocused } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { useSessionPresenceStore } from '@/training/session-presence-provider';

/** The native trigger prevents selection; this route only resolves explicit links. */
export default function ActiveWorkoutShortcut() {
  const store = useSessionPresenceStore();
  const focused = useIsFocused();
  // NativeTabs mounts off-screen content too. Only an explicit link may redirect.
  if (!focused) return null;
  return store ? <ExistingWorkoutRedirect store={store} /> : null;
}

function ExistingWorkoutRedirect({ store }: { store: NonNullable<ReturnType<typeof useSessionPresenceStore>> }) {
  const { session } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  // Never send anyone Home from here: while a workout is starting the presence can still be empty,
  // and that redirect threw the user out of the session they had just opened.
  return session ? <Redirect href={{ pathname: '/(tabs)/train/session/[id]', params: { id: session.id } }} /> : null;
}
