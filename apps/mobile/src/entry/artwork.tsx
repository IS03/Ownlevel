import { useEffect, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import { brandTokens } from '@/design-system';

export type EntryMotion = { level: SharedValue<number>; cover: SharedValue<number>; reduced: boolean };
export const STAIR_END = 7.5; // 200 ms between steps, 300 ms per step (overlap).
const REST_HEIGHTS = [72, 100, 84, 120, 112, 148, 132];
const { palette, radius, space } = brandTokens;

export function EntryGradient({ graphite = false }: { graphite?: boolean }) {
  const id = useId();
  return <Svg width="100%" height="100%" preserveAspectRatio="none" style={StyleSheet.absoluteFill}
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
  const { level, reduced } = motion;
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
    const progress = reduced ? 0 : Math.max(0, Math.min(1, (level.value - index) / 1.5));
    const baseline = Math.min(REST_HEIGHTS[index], height * 0.18);
    const step = height * (0.24 + index * 0.075);
    return { height: baseline + (step - baseline) * progress + breathe.value };
  });
  return <Animated.View style={[styles.bar, { width }, animated]} testID={`entry-bar-${index}`}>
    <EntryGradient />
  </Animated.View>;
}

export function EntryBars({ width, height, motion, resting }: { width: number; height: number; motion: EntryMotion; resting: boolean }) {
  const barWidth = Math.max(1, (width - space.sm * 6) / 7);
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={styles.bars} testID="entry-bars">
    {REST_HEIGHTS.map((_, index) => <LevelBar key={index} index={index} width={barWidth} height={height} motion={motion} resting={resting} />)}
  </View>;
}

export function EntryCover({ width, height, motion }: { width: number; height: number; motion: EntryMotion }) {
  const { cover, reduced } = motion;
  const barWidth = Math.max(1, (width - space.sm * 6) / 7);
  const animated = useAnimatedStyle(() => reduced ? {
    width, height, opacity: cover.value, borderRadius: 0,
  } : {
    width: barWidth + (width - barWidth) * cover.value,
    height: height * (0.69 + 0.31 * cover.value),
    opacity: cover.value > 0 ? 1 : 0,
    borderTopLeftRadius: radius.inner * (1 - cover.value),
    borderTopRightRadius: radius.inner * (1 - cover.value),
  });
  return <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.cover, animated]} testID="entry-cover"><EntryGradient /></Animated.View>;
}

const styles = StyleSheet.create({
  bars: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  bar: { borderTopLeftRadius: radius.inner, borderTopRightRadius: radius.inner, overflow: 'hidden' },
  cover: { position: 'absolute', bottom: 0, right: 0, overflow: 'hidden' },
});
