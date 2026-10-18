import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, runOnJS, withSpring } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { AppText, GlassSurface, brandTokens, useOwnlevelTheme } from '@/design-system';

export type FinishControlProps = { value: number | null; disabled: boolean; onChange: (next: number | null) => void; label: string; field: string };
const AnimatedInput = Animated.createAnimatedComponent(TextInput);
const spring = brandTokens.motion.spring;
/**
 * Energy and performance, 1–5. The selection is a Liquid Glass pill at rest too (not only while it moves): tap a number,
 * or drag the pill and it settles on the nearest one. A second tap on the selected number leaves it unanswered.
 * Without Liquid Glass (Android, older iOS, Reduce Transparency) the pill is the solid brand surface.
 */
export function FinishScaleControl({ field, value, disabled, onChange, label }: FinishControlProps) {
  const { colors } = useOwnlevelTheme();
  const [width, setWidth] = useState(0), [held, setHeld] = useState(false);
  // While the sheet is locked (saving), the draft can be cleared under it: keep showing what was answered.
  const [shown, setShown] = useState(value);
  if (!disabled && shown !== value) setShown(value);
  const slot = Math.max(0, width - 2 * brandTokens.space.xxs) / 5;
  const position = useSharedValue(value ?? 3), lift = useSharedValue(0);
  useEffect(() => { if (shown !== null) position.set(withSpring(shown, spring)); }, [shown, position]);
  const pick = (x: number) => { 'worklet'; position.set(Math.max(1, Math.min(5, (x - brandTokens.space.xxs) / Math.max(1, slot) + 0.5))); };
  const settle = () => {
    'worklet';
    const next = Math.round(position.get());
    position.set(withSpring(next, spring)); lift.set(withSpring(0, spring));
    runOnJS(setHeld)(false); runOnJS(onChange)(next);
  };
  const pan = Gesture.Pan().withTestId(`summary-${field}-drag`).enabled(!disabled && slot > 0).activeOffsetX([-6, 6]).failOffsetY([-12, 12])
    .onStart(event => { runOnJS(setHeld)(true); lift.set(withSpring(1, spring)); pick(event.x); }).onUpdate(event => pick(event.x)).onEnd(settle);
  const pill = useAnimatedStyle(() => ({ width: slot, transform: [{ translateX: (position.get() - 1) * slot }, { scale: 1 + 0.06 * lift.get() }] }));
  return <GestureDetector gesture={pan}><View accessibilityRole="radiogroup" accessibilityLabel={label} onLayout={event => setWidth(event.nativeEvent.layout.width)}
    style={[styles.options, { backgroundColor: colors.surfaceRaised }]}>
    {width > 0 ? <Animated.View pointerEvents="none" style={[styles.pill, pill]}>
      <GlassSurface interactive visible={shown !== null || held} style={styles.pillGlass} testID={`summary-${field}-pill`} />
    </Animated.View> : null}
    {[1, 2, 3, 4, 5].map(option => <Pressable key={option} testID={`summary-${field}-${option}`} accessibilityRole="radio"
      accessibilityLabel={`${label} ${option} de 5`} accessibilityState={{ selected: option === value, disabled }} disabled={disabled}
      onPress={() => onChange(option === value ? null : option)} style={styles.option}>
      <AppText numeric style={{ color: option === shown ? colors.primary : colors.text, fontWeight: option === shown ? '600' : '400' }} variant="body">{option}</AppText>
    </Pressable>)}
  </View></GestureDetector>;
}
/** The thumb glides continuously on the UI thread and settles on the nearest whole number; only that integer crosses to the draft. */
export function FinishPainControl({ field, value, disabled, onChange, label }: FinishControlProps) {
  const { colors } = useOwnlevelTheme();
  const [width, setWidth] = useState(1);
  const current = useSharedValue(value ?? 0), answered = useSharedValue(value !== null);
  // The committed integer must not cut the settle spring short; outside changes (Sin dolor, VoiceOver) still move the thumb.
  // While locked (saving), the draft can be cleared under the sheet: the thumb keeps what was answered.
  useEffect(() => {
    if (disabled) return;
    if (Math.round(current.value) !== (value ?? 0)) current.set(value ?? 0);
    answered.set(value !== null);
  }, [value, disabled, current, answered]);
  const update = (x: number) => {
    'worklet';
    current.set(Math.max(0, Math.min(1, (x - 22) / Math.max(1, width - 44))) * 10); answered.set(true);
  };
  const commit = () => { 'worklet'; const settled = Math.round(current.value); current.set(withSpring(settled, spring)); runOnJS(onChange)(settled); };
  const pan = Gesture.Pan().withTestId(`summary-${field}-pan`).enabled(!disabled).activeOffsetX([-4, 4]).failOffsetY([-12, 12])
    .onStart(event => update(event.x)).onUpdate(event => update(event.x)).onEnd(commit);
  const tap = Gesture.Tap().withTestId(`summary-${field}-tap`).enabled(!disabled).onEnd((event, success) => { if (success) { update(event.x); commit(); } });
  // Unanswered still shows the thumb at 0, empty, so it reads as something to slide; an answered 0 shows its number.
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: current.value / 10 * Math.max(0, width - 44) }] }));
  const fill = useAnimatedStyle(() => ({ width: answered.value ? current.value / 10 * Math.max(0, width - 44) : 0 }));
  const number = useAnimatedProps(() => { const text = answered.value ? String(Math.round(current.value)) : ''; return { text, defaultValue: text }; });
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
  pill: { position: 'absolute', top: brandTokens.space.xxs, bottom: brandTokens.space.xxs, left: brandTokens.space.xxs, borderRadius: brandTokens.radius.full },
  pillGlass: { flex: 1, borderRadius: brandTokens.radius.full },
  option: { flex: 1, minHeight: brandTokens.layout.minTouch, borderRadius: brandTokens.radius.full, justifyContent: 'center', alignItems: 'center' },
  slider: { minHeight: 52, justifyContent: 'center' }, track: { height: 4, marginHorizontal: 22, borderRadius: 2 },
  fill: { height: 4, borderRadius: 2 }, thumb: { position: 'absolute', width: 44, height: 44, borderRadius: brandTokens.radius.full, alignItems: 'center', justifyContent: 'center' },
  // No lineHeight: on iOS a TextInput with one draws the digit below center. Full thumb height, centered by the input itself.
  number: { padding: 0, width: 44, height: 44, textAlign: 'center', textAlignVertical: 'center', fontSize: brandTokens.typeScale.footnote.fontSize, fontWeight: '600', fontVariant: ['tabular-nums'], includeFontPadding: false },
});
