import { useEffect } from 'react';
import { Keyboard, useWindowDimensions } from 'react-native';
import { cancelAnimation, Easing, ReduceMotion, useSharedValue, withTiming } from 'react-native-reanimated';

/** The native frame event owns the timing. Do not use Reanimated's estimated iOS keyboard frames. */
export function useMetricKeyboard() {
  const { height: windowHeight } = useWindowDimensions();
  const height = useSharedValue(0);
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardWillChangeFrame', event => {
      const target = Math.max(0, windowHeight - event.endCoordinates.screenY);
      height.set(withTiming(target, {
        duration: event.duration,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        // Keyboard movement is native, including when Reduce Motion is on.
        reduceMotion: ReduceMotion.Never,
      }));
    });
    return () => { subscription.remove(); cancelAnimation(height); };
  }, [height, windowHeight]);
  return height;
}
