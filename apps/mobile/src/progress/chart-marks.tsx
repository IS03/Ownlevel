import { useEffect, useId, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { motionDurations, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';

type BarProps = {
  height: number; zero?: boolean; negative?: boolean; soft?: boolean; color?: string; style?: StyleProp<ViewStyle>; testID?: string;
  /** Decorative miniatures keep the same shape without an SVG/animation per tiny mark. */
  compact?: boolean;
  animate?: boolean;
  zeroColor?: string;
};
/** Exact baseline, modest rounding, no outline or glass. Missing observations never create this mark. */
export function ChartBar({ height, zero = false, negative = false, soft = false, color, style, testID, compact = false, animate = true, zeroColor }: BarProps) {
  const { colors } = useOwnlevelTheme();
  const curve = zero ? 0 : Math.min(spacing.xs, height / 2);
  const ink = color ?? colors.primary;
  const shape: ViewStyle = { width: '100%', overflow: 'hidden', opacity: soft ? 0.4 : 1,
    borderTopLeftRadius: negative ? 0 : curve, borderTopRightRadius: negative ? 0 : curve,
    borderBottomLeftRadius: negative ? curve : 0, borderBottomRightRadius: negative ? curve : 0,
    backgroundColor: zero ? (zeroColor ?? colors.border) : compact ? ink : 'transparent' };
  return compact ? <View testID={testID} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[shape, style, { height }]} />
    : <AnimatedBar animate={animate} height={height} zero={zero} ink={ink} shape={shape} style={style} testID={testID} />;
}
function AnimatedBar({ animate, height, zero, ink, shape, style, testID }: {
  animate: boolean; height: number; zero: boolean; ink: string; shape: ViewStyle; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  const reduced = useReduceMotion();
  const id = `bar${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const previous = useRef(height), shown = useSharedValue(height), alpha = useSharedValue(1);
  useEffect(() => {
    shown.value = reduced || !animate ? height : withTiming(height, { duration: motionDurations.base });
    if (animate && reduced && previous.current !== height) { alpha.value = 0; alpha.value = withTiming(1, { duration: motionDurations.fast }); }
    previous.current = height;
  }, [alpha, animate, height, reduced, shown]);
  const animated = useAnimatedStyle(() => ({ height: shown.value }));
  const fade = useAnimatedStyle(() => ({ opacity: alpha.value }));
  return <Animated.View testID={testID} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[shape, style, animated]}>
    {!zero ? <Animated.View style={[StyleSheet.absoluteFill, fade]}><Svg width="100%" height="100%"><Defs><LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor={ink} stopOpacity={1} /><Stop offset="1" stopColor={ink} stopOpacity={0.82} />
    </LinearGradient></Defs><Rect width="100%" height="100%" fill={`url(#${id})`} /></Svg></Animated.View> : null}
  </Animated.View>;
}
export function ChartSelectionRule({ selected }: { selected: boolean }) {
  const { colors } = useOwnlevelTheme();
  return selected ? <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.rule, { backgroundColor: colors.textMuted }]} /> : null;
}
const styles = StyleSheet.create({ rule: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: StyleSheet.hairlineWidth, opacity: 0.6 } });
