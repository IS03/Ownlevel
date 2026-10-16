import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { MobileNutritionDayResponse } from '@/api/nutrition-day';
import { AppText, brandTokens, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { NutritionSwitchText } from '@/home/home-nutrition-switch';
import { number, nutrientAmount } from './day-format';
import { dayRings, type RingReading } from './day-home-model';
import { NutritionRings } from './day-rings';
import { useTweenedNumber } from './use-tweened-number';

export function readingLabel(reading: RingReading, unit: string, remaining = false) {
  if (reading.value === null) return 'Sin dato';
  const value = remaining && reading.target !== null ? reading.target - reading.value : reading.value;
  return `${number(value)}${unit ? ` ${unit}` : ''}${reading.partial ? ' · parcial' : ''}`;
}
function SummaryValue({ label, reading, unit, progress, remaining, reduced, color, testID }: {
  label: string; reading: RingReading; unit: string; progress: Animated.Value; remaining: boolean; reduced: boolean; color: string; testID: string;
}) {
  return <View style={styles.stat}>
    <View style={styles.label}><View style={[styles.dot, { backgroundColor: color }]} /><AppText muted variant="footnote">{label}</AppText></View>
    <View style={styles.value}>
      <NutritionSwitchText alternate={readingLabel(reading, '', true)} numeric progress={progress} reduced={reduced} remaining={remaining}
        testID={testID} value={readingLabel(reading, '')} variant="title2" />
      <AppText muted numeric variant="caption">{reading.target === null ? unit : `/ ${number(reading.target)}${unit === 'g' ? ' g' : ''}`}</AppText>
    </View>
    {reading.target === null ? <AppText muted variant="caption">Sin objetivo</AppText> : null}
  </View>;
}
export function NutritionDaySummary({ data }: { data: MobileNutritionDayResponse }) {
  const { colors, isDark } = useOwnlevelTheme();
  const { width, fontScale } = useWindowDimensions();
  const reduced = useReduceMotion();
  const [remaining, setRemaining] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));
  const hasToggled = useRef(false);
  useEffect(() => {
    if (!hasToggled.current && !remaining) return;
    hasToggled.current = true;
    const [x1, y1, x2, y2] = brandTokens.motion.easing;
    const animation = Animated.timing(progress, { toValue: remaining ? 1 : 0, duration: reduced ? 200 : 300,
      easing: Easing.bezier(x1, y1, x2, y2), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [progress, reduced, remaining]);
  const raw = dayRings(data);
  const n = data.nutrition.status === 'ok' && data.nutrition.data.dayState === 'recorded' ? data.nutrition.data : null;
  // After a meal is added, edited or removed the totals count to their new values and the rings follow.
  const calories = useTweenedNumber(raw.calories.value), protein = useTweenedNumber(raw.protein.value);
  const carbs = useTweenedNumber(n ? n.summary.carbsG.knownTotal : null), fat = useTweenedNumber(n ? n.summary.fatG.knownTotal : null);
  const readings = { calories: { ...raw.calories, value: calories }, protein: { ...raw.protein, value: protein } };
  const macro = (key: 'carbsG' | 'fatG') => n ? { ...n.summary[key], knownTotal: (key === 'carbsG' ? carbs : fat) ?? n.summary[key].knownTotal } : null;
  const canToggle = [raw.calories, raw.protein].some(r => r.target !== null && r.value !== null);
  const status = remaining ? 'Te falta' : 'Llevás';
  const stacked = width < 350 || fontScale > 1.3;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canToggle }} disabled={!canToggle}
    accessibilityLabel={`${status}. Calorías: ${readingLabel(raw.calories, 'kcal', remaining)}. Objetivo: ${raw.calories.target === null ? 'sin objetivo' : number(raw.calories.target)} kcal. Proteína: ${readingLabel(raw.protein, 'g', remaining)}. Objetivo: ${raw.protein.target === null ? 'sin objetivo' : number(raw.protein.target)} g. Carbos: ${n ? nutrientAmount(n.summary.carbsG, n.summary.entryCount, 'g') : 'Sin dato'}. Grasas: ${n ? nutrientAmount(n.summary.fatG, n.summary.entryCount, 'g') : 'Sin dato'}.`}
    accessibilityHint={canToggle ? `Tocá para ver lo que ${remaining ? 'llevás' : 'te falta'}. Los valores negativos indican cuánto superaste el objetivo.` : undefined}
    onPress={() => setRemaining(v => !v)} style={[styles.summary, stacked && styles.stacked]} testID="nutrition-summary">
    <NutritionRings readings={readings} />
    <View style={[styles.legend, stacked && styles.stackedLegend]}>
      <AppText muted variant="caption" testID="nutrition-summary-mode">{status}</AppText>
      <SummaryValue label="Calorías" reading={readings.calories} unit="kcal" progress={progress} remaining={remaining} reduced={reduced}
        color={brandTokens.palette.dark.accent} testID="nutrition-calorie-value" />
      <SummaryValue label="Proteína" reading={readings.protein} unit="g" progress={progress} remaining={remaining} reduced={reduced}
        color={isDark ? brandTokens.palette.dark.heroTo : colors.primary} testID="nutrition-protein-value" />
      <View style={[styles.macros, { opacity: remaining ? 0.55 : 1 }]} testID="nutrition-summary-macros">
        {(['carbsG', 'fatG'] as const).map((key, i) => <View key={key} style={styles.macro}>
          <AppText muted variant="caption">{i === 0 ? 'Carbos' : 'Grasas'}</AppText>
          <AppText numeric variant="subheadline">{n ? nutrientAmount(macro(key)!, n.summary.entryCount, 'g') : 'Sin dato'}</AppText>
        </View>)}
      </View>
    </View>
  </Pressable>;
}
const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 8 },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  stackedLegend: { flex: 0, width: '100%' }, legend: { flex: 1, gap: 8 }, stat: { gap: 0 }, label: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 }, value: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 4 },
  macros: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' }, macro: { gap: 0 },
});
