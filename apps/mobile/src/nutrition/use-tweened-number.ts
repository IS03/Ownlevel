import { useEffect, useRef, useState } from 'react';
import { brandTokens, useReduceMotion } from '@/design-system';

const DURATION = brandTokens.motion.duration.slow + 150;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
/** Frames in between keep the target's precision (1.674 never reads as 1.674,37 mid-count). */
const decimals = (n: number) => Math.min(2, (String(n).split('.')[1] ?? '').length);
const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/**
 * Counts from the value on screen to the new one after a change (rings and totals move with it).
 * Missing never animates: to or from null it switches at once (missing ≠ zero). Reduce Motion switches at once.
 */
export function useTweenedNumber(target: number | null): number | null {
  const reduced = useReduceMotion();
  const [shown, setShown] = useState<{ to: number | null; value: number | null }>({ to: target, value: target });
  const onScreen = useRef<number | null>(target);
  useEffect(() => {
    const from = onScreen.current;
    if (reduced || from === null || target === null || from === target) {
      onScreen.current = target;
      setShown({ to: target, value: target });
      return;
    }
    const began = Date.now();
    let frame = requestAnimationFrame(function step() {
      const t = Math.min(1, (Date.now() - began) / DURATION);
      const value = t >= 1 ? target : round(from + (target - from) * easeOut(t), decimals(target));
      onScreen.current = value;
      setShown({ to: target, value });
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [reduced, target]);
  // Until the first frame of a new count, keep what was on screen; a switch to/from missing shows the target.
  if (shown.to === target) return shown.value;
  return reduced || target === null || shown.value === null || shown.to === null ? target : shown.value;
}
