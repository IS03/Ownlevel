import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { triggerHaptic } from '@/platform/haptics';
import { restRemaining, shouldSignalRestEnd, type RestDeadline } from './active-session-model';

/** Absolute deadlines keep the same countdown across screens and foreground transitions. */
export function useRestCountdown(timer: RestDeadline | null, signalEnd: boolean) {
  const exerciseId = timer?.exerciseId;
  const [clock, setClock] = useState(() => ({ exerciseId, now: Date.now() }));
  const previousSeconds = useRef<number | null>(null);
  useEffect(() => {
    const update = () => setClock({ exerciseId, now: Date.now() });
    const initialTick = setTimeout(update, 0);
    if (!exerciseId) return () => clearTimeout(initialTick);
    const tick = setInterval(update, 1000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') update(); });
    return () => { clearTimeout(initialTick); clearInterval(tick); subscription.remove(); };
  }, [exerciseId]);
  // An idle tab never briefly displays a stale clock while starting a new exercise.
  const seconds = timer && clock.exerciseId === exerciseId ? restRemaining(timer, clock.now) : 0;
  useEffect(() => {
    if (timer && signalEnd && AppState.currentState === 'active' && shouldSignalRestEnd(previousSeconds.current, seconds, timer, Date.now())) triggerHaptic('restEnd');
    previousSeconds.current = seconds;
  }, [seconds, signalEnd, timer]);
  return seconds;
}

export function restCountdownLabel(seconds: number) {
  return seconds ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : 'Listo';
}
