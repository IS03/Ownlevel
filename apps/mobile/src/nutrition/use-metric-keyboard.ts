import { useEffect } from 'react';
import { Keyboard, useWindowDimensions } from 'react-native';
import { cancelAnimation, ReduceMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { KEYBOARD_EASING, type SheetKeyboard } from '@/design-system';

const INSTANT_FRAME_MS = 250;

/** The native frame event owns the timing. Do not use Reanimated's estimated iOS keyboard frames. */
export function useMetricKeyboard(): SheetKeyboard {
  const { height: windowHeight } = useWindowDimensions();
  const height = useSharedValue(0), target = useSharedValue(0), duration = useSharedValue(0);
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardWillChangeFrame', event => {
      const next = Math.max(0, windowHeight - event.endCoordinates.screenY);
      // A hardware keyboard's bar arrives with no animation; moving the sheet in one frame reads as a jump.
      const time = event.duration > 0 ? event.duration : INSTANT_FRAME_MS;
      // Destination and timing first: a sheet still entering finishes its travel on the keyboard's curve.
      duration.set(time);
      target.set(next);
      height.set(withTiming(next, {
        duration: time,
        easing: KEYBOARD_EASING,
        // Keyboard movement is native, including when Reduce Motion is on.
        reduceMotion: ReduceMotion.Never,
      }));
    });
    return () => { subscription.remove(); cancelAnimation(height); };
  }, [duration, height, target, windowHeight]);
  return { height, target, duration };
}
