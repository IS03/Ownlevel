import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppIcon, AppText, GlassSurface, brandTokens, useOwnlevelTheme } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import { PROGRESS_UNITS, rangeTitle, stepProgressRange, type ProgressUnit } from './progress-range';
import { useProgressRange } from './progress-range-context';

/** R1 · the native-feeling period bar: one glass track that scrolls sideways; Personalizado opens the calendar. */
export function PeriodBar({ onCustom }: { onCustom: () => void }) {
  const { colors } = useOwnlevelTheme();
  const { state, setState, today } = useProgressRange();
  const scroll = useRef<ScrollView>(null), offsets = useRef<Record<string, number>>({});
  const reveal = (x: number, animated: boolean) => scroll.current?.scrollTo({ x: Math.max(0, x - 24), animated });
  // Keep the selected option visible (Personalizado sits past the edge), also in a freshly mounted copy (the pinned one).
  useEffect(() => { const x = offsets.current[state.unit]; if (x !== undefined) reveal(x, true); }, [state.unit]);
  const choose = (unit: ProgressUnit) => {
    if (unit === 'custom') { onCustom(); return; }
    if (unit === state.unit) return;
    triggerHaptic('stepperChange');
    // A new unit starts from today, so "Año" shows this year and not the year of the month you were looking at.
    setState({ ...state, unit, anchor: today, custom: null });
  };
  return <GlassSurface style={styles.track} testID="progress-period-bar">
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options} accessibilityRole="tablist" accessibilityLabel="Período">
      {PROGRESS_UNITS.map(o => {
        const on = o.value === state.unit;
        return <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.label}
          onLayout={e => { const first = offsets.current[o.value] === undefined; offsets.current[o.value] = e.nativeEvent.layout.x; if (first && on) reveal(e.nativeEvent.layout.x, false); }} onPress={() => choose(o.value)}
          style={[styles.option, on ? { backgroundColor: colors.surface } : null]} testID={`progress-unit-${o.value}`}>
          <AppText variant="subheadline" style={{ color: on ? colors.text : colors.textMuted, fontWeight: on ? '600' : '500' }}>{o.label}</AppText>
        </Pressable>;
      })}
    </ScrollView>
  </GlassSurface>;
}

/** "‹ Octubre 2026 ›": one unit back or forward, never into the future. */
export function PeriodStepper({ onCustom }: { onCustom: () => void }) {
  const { colors } = useOwnlevelTheme();
  const { state, setState, today } = useProgressRange();
  const { title, subtitle } = rangeTitle(state, today);
  const prev = stepProgressRange(state, -1, today), next = stepProgressRange(state, 1, today);
  const go = (to: typeof prev) => { if (to) { triggerHaptic('stepperChange'); setState(to); } };
  const custom = state.unit === 'custom';
  return <View style={styles.stepper} accessible accessibilityRole="adjustable" accessibilityLabel={`${title}, ${subtitle}`}
    accessibilityActions={[{ name: 'decrement', label: 'Período anterior' }, { name: 'increment', label: 'Período siguiente' }]}
    onAccessibilityAction={e => go(e.nativeEvent.actionName === 'increment' ? next : prev)} testID="progress-period-stepper">
    <Pressable accessibilityElementsHidden disabled={!prev} hitSlop={10} onPress={() => go(prev)} style={styles.arrow}>
      <AppIcon name="chevronLeft" color={prev ? colors.text : colors.border} size={20} /></Pressable>
    {/* A custom range has no neighbors: its title reopens the calendar instead. */}
    <Pressable accessibilityElementsHidden disabled={!custom} onPress={onCustom} style={styles.label}>
      <AppText numeric variant="headline">{title}</AppText>
      <AppText muted numeric variant="caption">{subtitle}</AppText>
    </Pressable>
    <Pressable accessibilityElementsHidden disabled={!next} hitSlop={10} onPress={() => go(next)} style={styles.arrow}>
      <AppIcon name="chevronRight" color={next ? colors.text : colors.border} size={20} /></Pressable>
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

/** The period block: period bar, stepper and the comparison chip. */
export function ProgressPeriodBlock({ onCustom, onCompare }: { onCustom: () => void; onCompare: () => void }) {
  return <View style={styles.block}>
    <PeriodBar onCustom={onCustom} />
    <PeriodStepper onCustom={onCustom} />
    <CompareChip onOpen={onCompare} />
  </View>;
}

/** Header action: "Comparar" (champagne while a comparison is on). */
export function CompareHeaderButton({ onPress }: { onPress: () => void }) {
  const { colors } = useOwnlevelTheme();
  const { compareOn } = useProgressRange();
  return <Pressable accessibilityRole="button" accessibilityLabel={compareOn ? 'Cambiar la comparación' : 'Comparar con otro período'} onPress={onPress}
    hitSlop={8} style={styles.headerButton} testID="progress-compare-button">
    <AppIcon name="compare" color={compareOn ? colors.primary : colors.text} size={17} />
    <AppText variant="subheadline" style={{ fontWeight: '600', color: compareOn ? colors.primary : colors.text }}>Comparar</AppText>
  </Pressable>;
}

const styles = StyleSheet.create({
  track: { borderRadius: brandTokens.radius.full, overflow: 'hidden' },
  options: { padding: 3, gap: 2 },
  option: { minHeight: 34, paddingHorizontal: 14, borderRadius: brandTokens.radius.full, justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, alignItems: 'center' },
  chipRow: { flexDirection: 'row', alignSelf: 'center', gap: 2 },
  chip: { minHeight: 30, paddingHorizontal: 12, justifyContent: 'center', borderTopLeftRadius: 15, borderBottomLeftRadius: 15 },
  chipClose: { width: 32, minHeight: 30, alignItems: 'center', justifyContent: 'center', borderTopRightRadius: 15, borderBottomRightRadius: 15 },
  block: { gap: 6 },
  headerButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, minHeight: 36 },
});
