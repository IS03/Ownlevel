import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { AppIcon, AppText, GlassSurface, brandTokens, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import { PROGRESS_UNITS, currentProgressRange, isCurrentProgressRange, rangeTitle, shiftProgressRange, type ProgressRangeState, type ProgressUnit } from './progress-range';
import { useProgressRange } from './progress-range-context';

export const STRIP = 44;
const STRIP_OPEN = 50;

/**
 * R1 · the period strip: one straight glass bar from edge to edge that stays at the top (it never scrolls with the
 * page). The options are spaced so the row runs past the edge and scrolls freely; dragging it opens it a touch while
 * you look. Personalizado (at the end) opens the calendar, with "anterior / siguiente" for the unit you are on.
 */
export function PeriodBar({ onCustom }: { onCustom: () => void }) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion();
  const { state, setState, today } = useProgressRange();
  const scroll = useRef<ScrollView>(null), offsets = useRef<Record<string, number>>({});
  const open = useSharedValue(0);
  // Options near the start stay where they are (no half word at the edge); later ones scroll into view.
  const reveal = (x: number, animated: boolean) => scroll.current?.scrollTo({ x: x < 220 ? 0 : x - 24, animated });
  // Keep the selected option visible (Personalizado sits past the edge).
  useEffect(() => { const x = offsets.current[state.unit]; if (x !== undefined) reveal(x, true); }, [state.unit]);
  const grow = () => { if (!reduced) open.set(withSpring(1, brandTokens.motion.spring)); };
  const settle = () => { open.set(withDelay(350, withTiming(0, { duration: brandTokens.motion.duration.fast }))); };
  const track = useAnimatedStyle(() => ({ height: STRIP + (STRIP_OPEN - STRIP) * open.value }));
  const choose = (unit: ProgressUnit) => {
    if (unit === 'custom') { onCustom(); return; }
    if (unit === state.unit) return;
    triggerHaptic('stepperChange');
    // A new unit starts from today, so "Año" shows this year and not the year of the month you were looking at.
    setState({ ...state, unit, anchor: today, custom: null });
  };
  return <Animated.View style={[styles.strip, { borderColor: colors.border }, track]}>
    {/* Content scrolls under it: a near-solid base so text passing behind never shows through the options. */}
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, opacity: 0.92 }]} />
    <GlassSurface style={StyleSheet.absoluteFill} testID="progress-period-bar" />
    <ScrollView ref={scroll} horizontal bounces={false} decelerationRate="fast" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options}
      onScrollBeginDrag={grow} onScrollEndDrag={settle} onMomentumScrollEnd={settle}
      accessibilityRole="tablist" accessibilityLabel="Período">
      {PROGRESS_UNITS.map(o => {
        const on = o.value === state.unit;
        return <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.label}
          onPress={() => choose(o.value)} style={styles.option} testID={`progress-unit-${o.value}`}
          onLayout={e => { const first = offsets.current[o.value] === undefined; offsets.current[o.value] = e.nativeEvent.layout.x; if (first && on) reveal(e.nativeEvent.layout.x, false); }}>
          <AppText variant="subheadline" style={{ color: on ? colors.primary : colors.textMuted, fontWeight: on ? '700' : '500' }}>{o.label}</AppText>
          {/* The chosen one is champagne with a short line under it; the rest stay muted. */}
          <View style={[styles.mark, { backgroundColor: on ? colors.primary : 'transparent' }]} />
        </Pressable>;
      })}
    </ScrollView>
  </Animated.View>;
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
  // Positioned by the header (edge to edge); opening it overlaps the page instead of pushing it.
  strip: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  options: { paddingHorizontal: 10, alignItems: 'stretch' },
  option: { minWidth: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 6 },
  mark: { width: 16, height: 2, borderRadius: 1 },
  caption: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32 },
  captionText: { flex: 1, minHeight: 32, justifyContent: 'center' },
  chipRow: { flexDirection: 'row', alignSelf: 'flex-start', gap: 2 },
  chip: { minHeight: 30, paddingHorizontal: 12, justifyContent: 'center', borderTopLeftRadius: 15, borderBottomLeftRadius: 15 },
  chipClose: { width: 32, minHeight: 30, alignItems: 'center', justifyContent: 'center', borderTopRightRadius: 15, borderBottomRightRadius: 15 },
  block: { gap: 6 },
  headerButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: brandTokens.radius.full, overflow: 'hidden' },
});
