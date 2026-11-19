import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { ProgressSpark, ProgressSparkPoint } from '@/api/progress';
import { AppText, brandTokens, radius, spacing, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { type DateRange, daysBetween, shortRange } from './progress-range';
import { nutritionValue } from './nutrition-values';
import { formatValue } from './progress-format';

/** Shared value scale; each lane retains its own real calendar positions. Gaps remain gaps. */
export function comparisonGeometry(spark: ProgressSpark, mode: 'bars' | 'dots') {
  const values = [...spark.current, ...(spark.reference ?? [])].flatMap(p => p.value === null ? [] : [p.value]);
  const low = mode === 'bars' ? Math.min(0, ...values) : Math.min(...values);
  const high = Math.max(mode === 'bars' ? 0 : -Infinity, ...values);
  return { low, high, position: (value: number) => high === low ? (mode === 'dots' ? 0.5 : 0) : (value - low) / (high - low) };
}

export function ComparisonChart({ spark, current, reference, mode, unit, testID, selection, onSelect }: {
  spark: ProgressSpark; current: DateRange; reference: DateRange; mode: 'bars' | 'dots'; unit: string; testID: string; selection: string | null; onSelect: (key: string | null) => void;
}) {
  const { colors } = useOwnlevelTheme(), { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(280);
  const { low, high, position } = comparisonGeometry(spark, mode);
  const lanes = [{ key: 'reference', label: 'Referencia', range: reference, points: spark.reference ?? [], color: colors.textMuted },
    { key: 'current', label: 'Período elegido', range: current, points: spark.current, color: colors.primary }];
  const count = Math.max(...lanes.map(l => l.points.length));
  // Reserve a full touch target between bucket centers, retaining each lane's own time scale.
  const minimumWidth = Math.max(...lanes.map(l => {
    const centers = l.points.map(p => daysBetween(l.range.start, p.start) - 1 + daysBetween(p.start, p.end) / 2);
    const gaps = centers.slice(1).map((x, i) => x - centers[i]).filter(n => n > 0);
    return gaps.length ? daysBetween(l.range.start, l.range.end) / Math.min(...gaps) * brandTokens.layout.minTouch + brandTokens.layout.minTouch : 0;
  }));
  const plotWidth = Math.max(width, minimumWidth);
  const selected = lanes.flatMap(l => l.points.map(p => ({ ...p, lane: l, id: `${l.key}:${p.start}:${p.end}` }))).find(p => p.id === selection);
  const value = (p: ProgressSparkPoint) => p.value === null ? 'Sin dato' : unit === 'kcal' ? nutritionValue(p.value, 'kcal') : formatValue(p.value, unit, unit === 'series' ? 'integer' : 'decimal');
  if (!count) return null;
  const plotHeight = brandTokens.layout.minTouch * 2;
  return <View testID={testID} style={styles.chart} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
    {Number.isFinite(low) && Number.isFinite(high) ? <AppText muted numeric variant="caption">Escala compartida · {formatValue(low, unit)} a {formatValue(high, unit)}</AppText> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ width: plotWidth }}>
      <View style={{ width: plotWidth, gap: spacing.md }}>
        {lanes.map(lane => <View key={lane.key} style={{ gap: spacing.xs }}>
          <View style={[styles.labels, fontScale > 1.3 && styles.stacked]}><AppText variant="caption" style={{ color: lane.color }}>{lane.label}</AppText><AppText numeric muted variant="caption">{shortRange(lane.range, current.end)}</AppText></View>
          <View style={{ height: plotHeight }}>
            {lane.points.map(p => {
              const key = `${lane.key}:${p.start}:${p.end}`;
              const x = (daysBetween(lane.range.start, p.start) - 1 + daysBetween(p.start, p.end) / 2) / daysBetween(lane.range.start, lane.range.end);
              const left = Math.max(0, Math.min(plotWidth - brandTokens.layout.minTouch, x * (plotWidth - brandTokens.layout.minTouch)));
              const y = p.value === null ? 0 : position(p.value);
              return <Pressable key={key} testID={`${testID}-${lane.key}-${p.start}-${p.value === null ? 'missing' : p.value === 0 ? 'zero' : 'mark'}`}
                accessibilityRole="button" accessibilityLabel={`${lane.label}, ${shortRange(p, current.end)}: ${value(p)}`} accessibilityState={{ selected: key === selection }}
                onPress={() => { haptics.selection(); onSelect(key === selection ? null : key); }}
                style={[styles.target, { left, height: plotHeight }, key === selection && { backgroundColor: colors.surfaceRaised }]}>
                {p.value === null ? null : mode === 'dots' ? <View style={[styles.dot, { bottom: spacing.xs + y * (plotHeight - spacing.lg), backgroundColor: lane.color }]} />
                  : <View style={[styles.bar, { height: p.value === 0 ? StyleSheet.hairlineWidth : Math.max(StyleSheet.hairlineWidth, y * (plotHeight - spacing.xs)), backgroundColor: lane.color }]} />}
              </Pressable>;
            })}
            {!lane.points.some(p => p.value !== null) ? <AppText muted variant="footnote">{lane.key === 'reference' && spark.reference === null ? 'Serie de referencia no disponible' : 'Sin datos en este período'}</AppText> : null}
          </View>
        </View>)}
      </View>
    </ScrollView>
    {selected ? <View style={styles.readout} accessibilityLiveRegion="polite" accessible accessibilityLabel={`${selected.lane.label}, ${shortRange(selected, current.end)}: ${value(selected)}`}>
      <AppText muted variant="caption">{selected.lane.label} · {shortRange(selected, current.end)}</AppText>
      <AppText numeric variant="headline">{value(selected)}</AppText>
      <AppText muted variant="caption">{mode === 'dots' ? 'Último registro del intervalo' : unit === 'series' ? 'Total del intervalo' : 'Promedio por día utilizado del intervalo'}</AppText>
    </View> : <AppText muted variant="caption">Tocá un punto para ver su intervalo y valor. Los huecos son datos faltantes.</AppText>}
  </View>;
}
const styles = StyleSheet.create({
  chart: { gap: spacing.sm }, labels: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs }, stacked: { flexDirection: 'column' },
  target: { position: 'absolute', width: brandTokens.layout.minTouch, borderRadius: radius.inner, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: spacing.lg, borderTopLeftRadius: spacing.xs, borderTopRightRadius: spacing.xs },
  dot: { position: 'absolute', width: spacing.xs, height: spacing.xs, borderRadius: radius.full }, readout: { gap: spacing.xs },
});
