import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { AppText, GlassSurface, brandTokens, useOwnlevelTheme } from '@/design-system';

export type FinishControlProps = { value: number | null; disabled: boolean; onChange: (next: number | null) => void; label: string; field: string };
const AnimatedInput = Animated.createAnimatedComponent(TextInput);
export function FinishScaleControl({ field, value, disabled, onChange, label }: FinishControlProps) {
  const { colors } = useOwnlevelTheme();
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.options, { backgroundColor: colors.surfaceRaised }]}>
    {[1, 2, 3, 4, 5].map(option => <Pressable key={option} testID={`summary-${field}-${option}`} accessibilityRole="radio"
      accessibilityLabel={`${label} ${option} de 5`} accessibilityState={{ selected: option === value, disabled }} disabled={disabled}
      onPress={() => onChange(option === value ? null : option)} style={[styles.option, option === value && { backgroundColor: colors.surface }]}>
      <AppText numeric style={{ color: option === value ? colors.primary : colors.textMuted }} variant="headline">{option}</AppText>
    </Pressable>)}
  </View>;
}
/** The thumb and number stay on the UI thread; only the final integer crosses to the summary draft. */
export function FinishPainControl({ field, value, disabled, onChange, label }: FinishControlProps) {
  const { colors } = useOwnlevelTheme();
  const [width, setWidth] = useState(1);
  const current = useSharedValue(value ?? 0), answered = useSharedValue(value !== null);
  useEffect(() => { current.set(value ?? 0); answered.set(value !== null); }, [value, current, answered]);
  const update = (x: number) => {
    'worklet';
    current.set(Math.round(Math.max(0, Math.min(1, (x - 22) / Math.max(1, width - 44))) * 10)); answered.set(true);
  };
  const commit = () => { 'worklet'; runOnJS(onChange)(current.value); };
  const pan = Gesture.Pan().withTestId(`summary-${field}-pan`).enabled(!disabled).activeOffsetX([-4, 4]).failOffsetY([-12, 12])
    .onStart(event => update(event.x)).onUpdate(event => update(event.x)).onEnd(commit);
  const tap = Gesture.Tap().withTestId(`summary-${field}-tap`).enabled(!disabled).onEnd((event, success) => { if (success) { update(event.x); commit(); } });
  const thumb = useAnimatedStyle(() => ({ opacity: answered.value ? 1 : 0, transform: [{ translateX: current.value / 10 * Math.max(0, width - 44) }] }));
  const fill = useAnimatedStyle(() => ({ width: answered.value ? current.value / 10 * Math.max(0, width - 44) : 0 }));
  const number = useAnimatedProps(() => ({ text: String(current.value), defaultValue: String(current.value) }));
  return <GestureDetector gesture={Gesture.Race(pan, tap)}><View testID={`summary-${field}-slider`} style={styles.slider}
    onLayout={event => setWidth(event.nativeEvent.layout.width)} accessible accessibilityRole="adjustable" accessibilityLabel={`${label}, de 0 a 10`}
    accessibilityValue={value === null ? { text: 'Sin responder' } : { min: 0, max: 10, now: value }} accessibilityState={{ disabled }}
    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={event => {
      if (!disabled) onChange(value === null ? 0 : Math.max(0, Math.min(10, value + (event.nativeEvent.actionName === 'increment' ? 1 : -1))));
    }}>
    <View style={[styles.track, { backgroundColor: colors.surfaceRaised }]}><Animated.View style={[styles.fill, { backgroundColor: colors.primary }, fill]} /></View>
    <Animated.View pointerEvents="none" style={[styles.thumb, thumb]}><GlassSurface style={styles.thumb}>
      <AnimatedInput animatedProps={number} defaultValue={value === null ? '' : String(value)} editable={false} pointerEvents="none" accessibilityElementsHidden
        style={[styles.number, { color: colors.primary }]} underlineColorAndroid="transparent" />
    </GlassSurface></Animated.View>
  </View></GestureDetector>;
}
const styles = StyleSheet.create({
  options: { flexDirection: 'row', borderRadius: brandTokens.radius.full, padding: brandTokens.space.xxs },
  option: { flex: 1, minHeight: brandTokens.layout.minTouch, borderRadius: brandTokens.radius.full, justifyContent: 'center', alignItems: 'center' },
  slider: { minHeight: 52, justifyContent: 'center' }, track: { height: 4, marginHorizontal: 22, borderRadius: 2 },
  fill: { height: 4, borderRadius: 2 }, thumb: { position: 'absolute', width: 44, height: 44, borderRadius: brandTokens.radius.full, alignItems: 'center', justifyContent: 'center' },
  number: { padding: 0, width: 44, textAlign: 'center', ...brandTokens.typeScale.footnote, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
