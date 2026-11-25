import { Platform } from 'react-native';
import type { ActiveSessionController } from './active-session-controller';
import { liveActivityAction, type LiveActivityAction } from './live-activity-model';
import type { SessionPresenceStore } from './session-presence-store';

type Interaction = { source?: string; target?: string; timestamp?: number };
type Listen = (listener: (event: Interaction) => void) => { remove: () => void };
const none = () => undefined;

/** The same operations as the session screen's own controls: one clock, one rest alert, one draft with its autosave. */
export function applyLiveActivityAction(controller: Pick<ActiveSessionController, 'adjustRest' | 'skipRest' | 'completeShownSet' | 'stopSetStopwatch'>, action: LiveActivityAction) {
  if (action.kind === 'add') controller.adjustRest(15);
  else if (action.kind === 'skip') controller.skipRest();
  else if (action.kind === 'stop') controller.stopSetStopwatch();
  else controller.completeShownSet(action.exerciseId, action.setId);
}

/**
 * #645 · Taps on the Live Activity's buttons. iOS runs their intent in this app's process (also when it was suspended) and
 * expo-widgets forwards it here. Each tap acts once, and only on the mounted session the activity belongs to; with no
 * mounted session (the buttons are gone then) nothing happens.
 */
export function listenLiveActivityActions(store: Pick<SessionPresenceStore, 'getSnapshot' | 'controllerFor'>, listen: Listen | null = nativeListen()) {
  if (!listen) return none;
  const seen = new Set<string>();
  const handle = (event: Interaction) => {
    const key = `${event.source ?? ''}:${event.target ?? ''}:${event.timestamp ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (seen.size > 50) seen.delete(seen.values().next().value!);
    const action = liveActivityAction(event.target), sessionId = store.getSnapshot().session?.id;
    const controller = sessionId ? store.controllerFor(sessionId) : null;
    if (action && controller) applyLiveActivityAction(controller, action);
  };
  try {
    const subscription = listen(handle);
    return () => subscription.remove();
  } catch {
    return none; // No native module in this build: the activity has no buttons to answer.
  }
}

function nativeListen(): Listen | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // Resolved only when used, so a build without the widget extension still opens the workout.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('expo-widgets') as typeof import('expo-widgets')).addUserInteractionListener as unknown as Listen;
  } catch {
    return null;
  }
}
