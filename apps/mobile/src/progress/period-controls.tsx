import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { scrollTo, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import { AppIcon, AppText, GlassSurface, brandTokens, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import { PROGRESS_UNITS, currentProgressRange, isCurrentProgressRange, rangeTitle, shiftProgressRange, type ProgressRangeState, type ProgressUnit } from './progress-range';
import { useProgressRange } from './progress-range-context';

export const STRIP = 44;
/** How much taller the strip gets at full stretch (a fast fling); a slow drag opens it only a little. */
const STRETCH = 12;
/** The options repeat so the strip turns like a wheel: past Personalizado comes Semana again, never a stop. */
const COPIES = 9, MIDDLE = 4;
// A slightly looser spring than the brand's, so the strip "gives" under the finger instead of snapping.
const GIVE = { damping: 20, stiffness: 220, mass: 1 };

/**
 * R1 · the period strip: one straight glass bar from edge to edge at the top of the page. It loops: past the last
 * option comes the first one, and once it rests it quietly re-centres on the middle copy, so the wheel never runs out.
 * The chosen period sits in the middle. Personalizado opens the calendar.
 *
 * While it turns it stretches with the speed of your finger: a slow drag opens it a little, a hard fling opens it all
 * the way, and as the momentum fades it settles back. Everything runs on the UI thread and only transforms move (no
 * height changes, no layout per frame), so opening is as smooth as closing.
 */
export function PeriodBar({ onCustom }: { onCustom: () => void }) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion();
  const { state, setState, today } = useProgressRange();
  const scroll = useAnimatedRef<Animated.ScrollView>();
  const items = useRef<Record<string, { x: number; width: number }>>({});
  const view = useRef(0), placed = useRef(false);
  const copy = useSharedValue(0), x = useSharedValue(0), lastX = useSharedValue(0), lastT = useSharedValue(0), speed = useSharedValue(0);
  const turning = useSharedValue(false), open = useSharedValue(0);
  const jump = (to: number, animated: boolean) => { scheduleOnUI(() => { 'worklet'; scrollTo(scroll, to, 0, animated); }); };
  /** Centre the chosen option, in the copy nearest to where the wheel is now. */
  const centre = (unit: ProgressUnit, animated: boolean) => {
    const item = items.current[unit], width = copy.get();
    if (!item || !width || !view.current) return;
    const inCopy = item.x + item.width / 2 - view.current / 2;
    const k = animated ? Math.round((x.get() - inCopy) / width) : MIDDLE;
    jump(k * width + inCopy, animated);
  };
  const place = () => { if (!placed.current && copy.get() && view.current && items.current[state.unit]) { placed.current = true; centre(state.unit, false); } };
  useEffect(() => { if (placed.current) centre(state.unit, true); }, [state.unit]); // eslint-disable-line react-hooks/exhaustive-deps
  const settle = () => {
    'worklet';
    turning.set(false);
    open.set(withTiming(0, { duration: brandTokens.motion.duration.base }));
    // Back to the middle copy at the same visual spot (identical content, so nothing moves on screen).
    const width = copy.get(), at = x.get();
    if (!width) return;
    const same = MIDDLE * width + ((((at - MIDDLE * width) % width) + width) % width);
    if (Math.abs(same - at) > 0.5) { x.set(same); lastX.set(same); scrollTo(scroll, same, 0, false); }
  };
  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: e => { turning.set(true); lastX.set(e.contentOffset.x); lastT.set(Date.now()); speed.set(0); },
    onScroll: e => {
      x.set(e.contentOffset.x);
      if (!turning.get() || reduced) return;
      const now = Date.now(), dt = Math.max(1, now - lastT.get());
      // px per ms, smoothed so one uneven frame never makes the strip twitch.
      const v = speed.get() * 0.6 + (Math.abs(e.contentOffset.x - lastX.get()) / dt) * 0.4;
      speed.set(v); lastX.set(e.contentOffset.x); lastT.set(now);
      // Slow drag ≈ 0.25 pt/ms → about a third open; a hard fling ≈ 2 pt/ms or more → fully open.
      open.set(withSpring(Math.min(1, 0.2 + v * 0.4), GIVE));
    },
    // Released without a fling: nothing else will move it, so it settles now.
    onEndDrag: e => { if (Math.abs(e.velocity?.x ?? 0) < 0.05) settle(); },
    onMomentumEnd: () => { settle(); },
  });
  const back = useAnimatedStyle(() => ({ transform: [{ scaleY: 1 + (STRETCH / STRIP) * open.value }] }));
  const label = useAnimatedStyle(() => ({ transform: [{ translateY: (STRETCH / 2) * open.value }, { scale: 1 + 0.12 * open.value }] }));
  const choose = (unit: ProgressUnit) => {
    if (unit === 'custom') { onCustom(); return; }
    if (unit === state.unit) return;
    triggerHaptic('stepperChange');
    // A new unit starts from today, so "Año" shows this year and not the year of the month you were looking at.
    setState({ ...state, unit, anchor: today, custom: null });
  };
  return <View style={styles.strip}>
    {/* The base stretches downwards over the page; a near-solid fill keeps text behind it from showing through. */}
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.back, { borderColor: colors.border }, back]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, opacity: 0.92 }]} />
      <GlassSurface style={StyleSheet.absoluteFill} testID="progress-period-bar" />
    </Animated.View>
    <Animated.ScrollView ref={scroll} horizontal bounces={false} decelerationRate="fast" showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16} onScroll={onScroll} onLayout={e => { view.current = e.nativeEvent.layout.width; place(); }}
      accessibilityRole="tablist" accessibilityLabel="Período">
      {Array.from({ length: COPIES }, (_, k) => <View key={k} style={styles.copy} accessibilityElementsHidden={k !== MIDDLE}
        importantForAccessibility={k === MIDDLE ? 'auto' : 'no-hide-descendants'}
        onLayout={k === MIDDLE ? e => { copy.set(e.nativeEvent.layout.width); place(); } : undefined}>
        {PROGRESS_UNITS.map(o => {
          const on = o.value === state.unit;
          return <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.label}
            onPress={() => choose(o.value)} style={styles.option} testID={k === MIDDLE ? `progress-unit-${o.value}` : undefined}
            onLayout={k === MIDDLE ? e => { const { x: at, width } = e.nativeEvent.layout; items.current[o.value] = { x: at, width }; place(); } : undefined}>
            <Animated.View style={[styles.optionInner, label]}>
              <AppText variant="subheadline" style={{ color: on ? colors.primary : colors.textMuted, fontWeight: on ? '700' : '500' }}>{o.label}</AppText>
              {/* The chosen one is champagne with a short line under it; the rest stay muted. */}
              <View style={[styles.mark, { backgroundColor: on ? colors.primary : 'transparent' }]} />
            </Animated.View>
          </Pressable>;
        })}
      </View>)}
    </Animated.ScrollView>
  </View>;
}

/**
 * The dates you are reading, in one line under the strip ("Semana del 12–18 oct · hasta hoy · en curso"), with
 * "Volver a hoy" when you moved away. VoiceOver can still step periods from here (no visible arrows any more).
 */
export function PeriodCaption({ onCustom }: { onCustom: () => void }) {
  const { colors } = useOwnlevelTheme();
  const { state, setState, today } = useProgressRange();
  const { title, subtitle } = rangeTitle(state, today);
  const prev = shiftProgressRange(state, -1, today), next = shiftProgressRange(state, 1, today);
  const current = isCurrentProgressRange(state, today);
  const go = (to: ProgressRangeState | null) => { if (to) { triggerHaptic('stepperChange'); setState(to); } };
  return <View style={styles.caption}>
    <Pressable accessibilityRole="adjustable" accessibilityLabel={`${title}, ${subtitle}`} testID="progress-period-caption"
      accessibilityActions={[{ name: 'decrement', label: 'Período anterior' }, { name: 'increment', label: 'Período siguiente' }, { name: 'activate', label: 'Elegir período' }]}
      onAccessibilityAction={e => { const action = e.nativeEvent.actionName; if (action === 'activate') onCustom(); else go(action === 'increment' ? next : prev); }}
      onPress={onCustom} style={styles.captionText}>
      <AppText muted numeric variant="footnote" numberOfLines={1}>{title} · {subtitle}</AppText>
    </Pressable>
    {!current ? <Pressable accessibilityRole="button" accessibilityLabel="Volver a hoy" hitSlop={10} testID="progress-period-today"
      onPress={() => go(currentProgressRange(state, today))}>
      <AppText variant="footnote" style={{ color: colors.primary, fontWeight: '600' }}>Volver a hoy</AppText>
    </Pressable> : null}
  </View>;
}

/** The comparison is remembered across Progreso screens; this chip shows it and clears it from any of them. */
export function CompareChip({ onOpen }: { onOpen: () => void }) {
  const { colors } = useOwnlevelTheme();
  const { state, setState, compareText } = useProgressRange();
  if (!compareText) return null;
  return <View style={styles.chipRow}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Comparando con ${compareText}. Cambiar`} onPress={onOpen}
      style={[styles.chip, { backgroundColor: colors.brandSubtle }]} testID="progress-compare-chip">
      <AppText numeric variant="footnote" style={{ color: colors.primary, fontWeight: '600' }}>vs. {compareText}</AppText>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Dejar de comparar" hitSlop={10}
      onPress={() => { triggerHaptic('stepperChange'); setState({ ...state, compare: { kind: 'none' } }); }}
      style={[styles.chipClose, { backgroundColor: colors.brandSubtle }]} testID="progress-compare-clear">
      <AppIcon name="close" color={colors.primary} size={13} />
    </Pressable>
  </View>;
}

/** Under the strip: the dates being read and, when on, the comparison chip. */
export function ProgressPeriodBlock({ onCustom, onCompare }: { onCustom: () => void; onCompare: () => void }) {
  return <View style={styles.block}>
    <PeriodCaption onCustom={onCustom} />
    <CompareChip onOpen={onCompare} />
  </View>;
}

/** Header action: "Comparar" on glass (champagne while a comparison is on). */
export function CompareHeaderButton({ onPress }: { onPress: () => void }) {
  const { colors } = useOwnlevelTheme();
  const { compareOn } = useProgressRange();
  return <Pressable accessibilityRole="button" accessibilityLabel={compareOn ? 'Cambiar la comparación' : 'Comparar con otro período'} onPress={onPress}
    hitSlop={4} testID="progress-compare-button">
    <GlassSurface interactive style={styles.headerButton}>
      <AppIcon name="compare" color={compareOn ? colors.primary : colors.text} size={17} />
      <AppText variant="subheadline" style={{ fontWeight: '600', color: compareOn ? colors.primary : colors.text }}>Comparar</AppText>
    </GlassSurface>
  </Pressable>;
}

const styles = StyleSheet.create({
  strip: { height: STRIP, zIndex: 2 },
  // Grows from its top edge, over the page below.
  back: { transformOrigin: 'top', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  copy: { flexDirection: 'row', alignItems: 'stretch' },
  option: { minWidth: 44, paddingHorizontal: 16, justifyContent: 'center' },
  optionInner: { alignItems: 'center', gap: 4, paddingTop: 6 },
  mark: { width: 16, height: 2, borderRadius: 1 },
  caption: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32 },
  captionText: { flex: 1, minHeight: 32, justifyContent: 'center' },
  chipRow: { flexDirection: 'row', alignSelf: 'flex-start', gap: 2 },
  chip: { minHeight: 30, paddingHorizontal: 12, justifyContent: 'center', borderTopLeftRadius: 15, borderBottomLeftRadius: 15 },
  chipClose: { width: 32, minHeight: 30, alignItems: 'center', justifyContent: 'center', borderTopRightRadius: 15, borderBottomRightRadius: 15 },
  block: { gap: 6 },
  headerButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: brandTokens.radius.full, overflow: 'hidden' },
});
