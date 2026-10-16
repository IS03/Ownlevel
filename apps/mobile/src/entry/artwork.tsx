import { useEffect, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import { brandTokens } from '@/design-system';
import { ENTRY_BAR_BLEED, ENTRY_REST_HEIGHTS, entryBarFrame } from './motion-model';

export type EntryMotion = { level: SharedValue<number>; arrival: SharedValue<number>; spread: SharedValue<number>; reduced: boolean };
const { palette, radius } = brandTokens;

export function EntryGradient({ graphite = false, width = '100%', height = '100%' }: { graphite?: boolean; width?: number | '100%'; height?: number | '100%' }) {
  const id = useId();
  return <Svg width={width} height={height} preserveAspectRatio="none" style={StyleSheet.absoluteFill}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Defs><LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor={graphite ? '#26262A' : palette.dark.heroFrom} />
      <Stop offset="1" stopColor={graphite ? palette.dark.bg : palette.dark.heroTo} />
    </LinearGradient></Defs>
    <Rect width="100%" height="100%" fill={`url(#${id})`} />
  </Svg>;
}

function LevelBar({ index, width, height, motion, resting }: {
  index: number; width: number; height: number; motion: EntryMotion; resting: boolean;
}) {
  const breathe = useSharedValue(0);
  const { level, arrival, spread, reduced } = motion;
  useEffect(() => {
    if (resting && !reduced) {
      const duration = 2400 + index * 100;
      breathe.set(withDelay(index * 300, withRepeat(withSequence(
        withTiming(4 + index % 3 * 2, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration, easing: Easing.inOut(Easing.sin) }),
      ), -1)));
    } else {
      cancelAnimation(breathe);
      breathe.set(reduced ? 0 : withTiming(0, { duration: brandTokens.motion.duration.base }));
    }
    return () => cancelAnimation(breathe);
  }, [breathe, index, reduced, resting]);
  const animated = useAnimatedStyle(() => {
    return entryBarFrame(index, width, height, reduced ? 0 : level.value, reduced ? 0 : arrival.value, reduced ? 0 : breathe.value, reduced ? 0 : spread.value);
  });
  const bounds = entryBarFrame(index, width, height, 0, 0);
  return <Animated.View style={[styles.bar, animated]} testID={`entry-bar-${index}`}>
    <EntryGradient width={Math.ceil(bounds.width)} height={Math.ceil(height + ENTRY_BAR_BLEED)} />
  </Animated.View>;
}

export function EntryBars({ width, height, motion, resting }: { width: number; height: number; motion: EntryMotion; resting: boolean }) {
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={StyleSheet.absoluteFill} testID="entry-bars">
    {ENTRY_REST_HEIGHTS.map((_, index) => <LevelBar key={index} index={index} width={width} height={height} motion={motion} resting={resting} />)}
  </View>;
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, borderTopLeftRadius: radius.inner, borderTopRightRadius: radius.inner, overflow: 'hidden' },
});
