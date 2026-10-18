import { useEffect, useRef } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { cancelAnimation, interpolateColor, runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { brandTokens, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
export type SaveOrigin = { x: number; y: number; width: number };

/** Visual confirmation only: no request, retry, key, autosave or controller mutation lives here. */
export function FinishSaveAnimation({ running, confirmed, origin, reveal, onReady }: {
  running: boolean; confirmed: boolean; origin: SaveOrigin; reveal: SharedValue<number>; onReady: () => void;
}) {
  const { colors } = useOwnlevelTheme(), reduceMotion = useReduceMotion(), window = useWindowDimensions();
  const shape = useSharedValue(0), rotation = useSharedValue(0), ring = useSharedValue(0.25);
  const notified = useRef(false), ready = useRef(onReady);
  useEffect(() => { ready.current = onReady; }, [onReady]);
  const notify = () => { if (!notified.current) { notified.current = true; triggerHaptic('workoutComplete'); } };
  const done = () => ready.current();
  useEffect(() => {
    if (running && !confirmed) {
      shape.set(reduceMotion ? 1 : withTiming(1, { duration: brandTokens.motion.duration.fast }));
      if (!reduceMotion) rotation.set(withRepeat(withTiming(360, { duration: 1200 }), -1, false));
    } else if (!confirmed) { cancelAnimation(rotation); shape.set(0); ring.set(0.25); }
    return () => cancelAnimation(rotation);
  }, [running, confirmed, reduceMotion, shape, rotation, ring]);
  useEffect(() => {
    if (!confirmed) return;
    cancelAnimation(rotation); rotation.set(0); shape.set(1);
    // The ring closes and the circle opens straight into the champagne of the week intro: no check mark growing on top.
    ring.set(withTiming(1, { duration: brandTokens.motion.duration.fast }, finished => { if (finished) runOnJS(notify)(); }));
    reveal.set(withDelay(reduceMotion ? 0 : brandTokens.motion.duration.fast, withTiming(1, {
      duration: reduceMotion ? brandTokens.motion.duration.fast : brandTokens.motion.duration.base,
    }, finished => { if (finished) { runOnJS(notify)(); runOnJS(done)(); } })));
    return () => { cancelAnimation(ring); cancelAnimation(reveal); };
  // Callback refs preserve the visual sequence across controller read-backs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed, reduceMotion]);
  const circle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(reveal.value, [0, 1], [colors.primary, brandTokens.palette.light.heroFrom]),
    left: origin.x + (origin.width - 50) / 2 * shape.value, top: origin.y,
    width: origin.width + (50 - origin.width) * shape.value, height: 50,
    borderRadius: 14 + 11 * shape.value,
    opacity: running || confirmed ? reduceMotion ? 1 - reveal.value : 1 : 0,
    transform: [{ scale: reduceMotion ? 1 : 1 + (Math.hypot(window.width, window.height) * 4 / 50 - 1) * reveal.value }],
  }));
  const spinning = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }], opacity: 1 - reveal.value }));
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: 2 * Math.PI * 18 * (1 - ring.value) }));
  return <Animated.View pointerEvents="none" style={[styles.circle, { backgroundColor: colors.primary }, circle]} testID="finish-save-animation">
    <Animated.View style={[styles.symbol, spinning]}><Svg width={50} height={50}><AnimatedCircle animatedProps={ringProps} cx={25} cy={25} r={18}
      stroke={colors.onPrimary} strokeWidth={2} strokeDasharray={[2 * Math.PI * 18]} fill="none" /></Svg></Animated.View>
  </Animated.View>;
}
const styles = StyleSheet.create({ circle: { position: 'absolute', justifyContent: 'center', alignItems: 'center' }, symbol: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' } });
