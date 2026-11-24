import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { triggerHaptic } from '@/platform/haptics';
import { restRemaining, shouldSignalRestEnd, type RestDeadline } from './active-session-model';

/** Absolute deadlines keep the same countdown across screens and foreground transitions. */
export function useRestClock(timer: RestDeadline | null, signalEnd: boolean) {
  const exerciseId = timer?.exerciseId, endAt = timer?.endAt;
  const [clock, setClock] = useState(() => ({ exerciseId, now: Date.now() }));
  const previousSeconds = useRef<number | null>(null);
  useEffect(() => {
    const update = () => setClock({ exerciseId, now: Date.now() });
    const initialTick = setTimeout(update, 0);
    if (!exerciseId || endAt === undefined) return () => clearTimeout(initialTick);
    const tick = setInterval(() => {
      update();
      if (Date.now() >= endAt + 8000) clearInterval(tick);
    }, 1000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') update(); });
    return () => { clearTimeout(initialTick); clearInterval(tick); subscription.remove(); };
  }, [exerciseId, endAt]);
  const ready = clock.exerciseId === exerciseId;
  const seconds = timer && ready ? restRemaining(timer, clock.now) : 0;
  useEffect(() => {
    if (timer && signalEnd && AppState.currentState === 'active' && shouldSignalRestEnd(previousSeconds.current, seconds, timer, Date.now())) triggerHaptic('restEnd');
    previousSeconds.current = seconds;
  }, [seconds, signalEnd, timer]);
  const recentlyFinished = !!timer && ready && seconds === 0 && clock.now - timer.endAt < 8000;
  return { seconds, recentlyFinished, ready };
}

export function useRestCountdown(timer: RestDeadline | null, signalEnd: boolean) {
  return useRestClock(timer, signalEnd).seconds;
}

export function restCountdownLabel(seconds: number) {
  return seconds ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : 'Listo';
}
