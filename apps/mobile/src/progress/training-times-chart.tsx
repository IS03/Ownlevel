import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { AppText, brandTokens, motionDurations, pressedStyle, radius, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { haptics } from '@/platform/haptics';
import type { TrainingTimeGroup, TrainingTimeMetric } from '@/api/training-times';
import { timeAt, timeMetricCount, timeMetricText, timeMetricValue, timeRange } from './training-times-model';

function TimeBar({ value, maximum, selected }: { value: number | null; maximum: number; selected: boolean }) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion();
  const height = value === null ? 0 : value === 0 ? 1 : 112 * value / maximum;
  const animated = useSharedValue(height);
  useEffect(() => { animated.value = reduced ? height : withTiming(height, { duration: motionDurations.base }); }, [animated, height, reduced]);
  const style = useAnimatedStyle(() => ({ height: animated.value }));
  return <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {value === null ? <AppText muted variant="caption">—</AppText> : <Animated.View style={[styles.bar, { backgroundColor: colors.primary, opacity: selected ? 1 : 0.75 }, style]} />}
  </View>;
}

/** Two-hour descriptions, never a curve interpolating between independent sessions. Every column remains a native 44 pt target. */
export function TrainingTimesChart({ bins, metric, selected, unit, onSelect }: { bins: TrainingTimeGroup[]; metric: TrainingTimeMetric; selected: number | null; unit?: string; onSelect: (bin: number | null) => void }) {
  return <TrainingTimingColumns testID="training-times-chart" prefix="training-time-bin" label="Horarios de inicio, de 00 a 24 horas" caption="Hora de inicio · cada columna abarca 2 h"
    selected={selected} onSelect={onSelect} maximum={metric === 'energy' ? 5 : metric === 'improvements' ? 100 : undefined}
    items={bins.map(bin => ({ label: timeAt(bin.fromMinute).slice(0, 2), value: timeMetricValue(bin, metric),
      spoken: `${timeRange(bin)}. ${timeMetricText(bin, metric, unit)}. ${timeMetricCount(bin, metric)} registros utilizados.` }))} />;
}

export function TrainingTimingColumns({ items, selected, onSelect, maximum: fixedMaximum, testID, prefix, label, caption }: {
  items: { label: string; value: number | null; spoken: string }[]; selected: number | null; onSelect: (index: number | null) => void;
  maximum?: number; testID: string; prefix: string; label: string; caption: string;
}) {
  const reduced = useReduceMotion(), { colors } = useOwnlevelTheme();
  const maximum = fixedMaximum ?? Math.max(1, ...items.flatMap(item => item.value === null ? [] : [item.value]));
  return <View style={styles.block} testID={testID}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.columns} accessibilityLabel={label}>
      {items.map((item, index) => <Pressable key={index} accessibilityRole="button" testID={`${prefix}-${index}`}
        accessibilityState={{ selected: selected === index }} accessibilityLabel={`${item.spoken} Ver sesiones.`}
        onPress={() => { haptics.selection(); onSelect(selected === index ? null : index); }}
        style={({ pressed }) => [styles.column, { backgroundColor: selected === index ? colors.brandSubtle : 'transparent' }, pressedStyle(pressed, reduced)]}>
        <TimeBar value={item.value} maximum={maximum} selected={selected === index} />
        <AppText numeric muted={selected !== index} variant="caption">{item.label}</AppText>
      </Pressable>)}
    </ScrollView>
    <AppText muted variant="footnote">{caption}</AppText>
  </View>;
}
const styles = StyleSheet.create({
  block: { gap: spacing.sm }, columns: { gap: spacing.xs }, column: { minWidth: brandTokens.layout.minTouch, minHeight: brandTokens.layout.minTouch, padding: spacing.xs, gap: spacing.sm, borderRadius: radius.chip, alignItems: 'center' },
  track: { height: 120, justifyContent: 'flex-end', alignItems: 'center', width: '100%' }, bar: { width: spacing.xl, borderTopLeftRadius: radius.chip, borderTopRightRadius: radius.chip },
});
