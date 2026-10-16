import * as ExpoHaptics from 'expo-haptics';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { hapticsMap, type HapticEvent } from '@/design-system/brand';

import type { HapticsPreferenceStorage } from './haptics-preference';

export type { HapticEvent } from '@/design-system/brand';

// Single app haptics API. Features ask for a brand event (IDENTIDAD.md § Movimiento
// y vibración); the brand hapticsMap decides the feedback type. Respects the device
// preference (default ON). Haptics are an enhancement: failures never break a flow.

type State = { enabled: boolean; persistenceFailed: boolean };
let state: State = { enabled: true, persistenceFailed: false };
let storage: HapticsPreferenceStorage | null = null;
let chosen = false;
const listeners = new Set<() => void>();
function update(next: Partial<State>) { state = { ...state, ...next }; listeners.forEach(listener => listener()); }

function run(effect: () => Promise<void>): void {
  if (!state.enabled || Platform.OS === 'web') return;
  try {
    void effect().catch(() => undefined);
  } catch {
    // Unsupported hardware/simulator: no vibration, no error.
  }
}
/** Explicit metric feedback: quick entry and lifting/dropping a definition. Respects Settings. */
export function triggerMetricHaptic(): void { run(() => ExpoHaptics.selectionAsync()); }

export function triggerHaptic(event: HapticEvent): void {
  run(() => {
    switch (hapticsMap[event]) {
      case 'selection': return ExpoHaptics.selectionAsync();
      case 'impactMedium': return ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium);
      case 'impactHeavy': return ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Heavy);
      case 'success': return ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success);
      case 'error': return ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error);
    }
  });
}

/**
 * @deprecated Pre-identity UI tics (navigation, toggles, reorder). Not a brand event:
 * kept so the existing feedback respects the preference; review each use in M9.2/M9.3
 * against the brand event table (plan C12). Do not add new uses.
 */
export const haptics = {
  selection(): void { run(() => ExpoHaptics.selectionAsync()); },
};

/** Loads the saved preference once at startup without blocking; a later user choice wins. */
export function initHapticsPreference(next: HapticsPreferenceStorage): void {
  storage = next;
  next.read().then(saved => { if (saved !== null && !chosen) update({ enabled: saved }); }).catch(() => undefined);
}

export async function setHapticsEnabled(enabled: boolean): Promise<void> {
  chosen = true;
  update({ enabled });
  if (!storage) return;
  try { await storage.write(enabled); update({ persistenceFailed: false }); }
  catch { update({ persistenceFailed: true }); }
}

export function hapticsPreference(): State { return state; }

export function useHapticsPreference(): State & { setEnabled: (enabled: boolean) => Promise<void> } {
  const current = useSyncExternalStore(subscribe, hapticsPreference, hapticsPreference);
  return { ...current, setEnabled: setHapticsEnabled };
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

/** Test-only reset of the module state. */
export function resetHapticsForTests(): void { state = { enabled: true, persistenceFailed: false }; storage = null; chosen = false; listeners.clear(); }
