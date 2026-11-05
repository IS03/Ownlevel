import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { ProgressMetrics } from '@/api/progress';
import { AppText, radius, spacing, useOwnlevelTheme } from '@/design-system';
import { PeriodChart } from './period-chart';
import { formatValue } from './progress-format';
import { shortRange } from './progress-range';

// Numeric dates keep both the year and the true bucket bounds, including partial weeks/months.
const date = (value: string) => `${value.slice(8)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;

/** Local inspection surface: no history navigation, no recalculation of server aggregates. */
export function MetricTrendChart({ data }: { data: ProgressMetrics }) {
  const { colors } = useOwnlevelTheme();
  const [source, setSource] = useState(data), [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Even a refresh with the same dates must drop the old selection.
  if (source !== data) { setSource(data); setSelectedKey(null); }
  const m = data.metric!, bucket = data.period.bucket;
  const points = data.series.map(p => {
    const range = p.start === p.end ? date(p.start) : `${date(p.start)} – ${date(p.end)}`;
    const aggregate = bucket === 'day' ? '' : bucket === 'week' ? 'Promedio semanal · ' : 'Promedio mensual · ';
    const value = p.value === null ? 'Sin dato' : `${aggregate}${formatValue(p.value, m.unit, m.valueType)}`;
    const samples = bucket !== 'day' && p.value !== null ? ` · ${p.samples} ${p.samples === 1 ? 'día con dato' : 'días con dato'}` : '';
    return { key: p.start, label: shortRange({ start: p.start, end: p.start }, data.today), value: p.value,
      text: `${range}, ${value}${samples}`, range, detail: `${value}${samples}` };
  });
  const selected = points.find(p => p.key === selectedKey);
  const title = selected?.range ?? 'Tocá una barra';
  const detail = selected?.detail ?? 'Fecha y valor acá mismo. Otro toque quita la selección.';
  // Reserve the readout's intrinsic height using the longest real labels (also scales with Dynamic Type).
  // The overlay stays inside this chart-wide slot, so first/last bars cannot clip it and selection never moves the plot.
  const longest = (values: string[]) => values.reduce((a, b) => b.length > a.length ? b : a, '');
  return <View style={styles.root}>
    <View style={[styles.readout, { backgroundColor: colors.surfaceRaised }]}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.reserve}>
        <AppText numeric variant="caption">{longest(['Tocá una barra', ...points.map(p => p.range)])}</AppText>
        <AppText numeric variant="subheadline">{longest(['Fecha y valor acá mismo. Otro toque quita la selección.', ...points.map(p => p.detail)])}</AppText>
      </View>
      <View testID="metric-trend-readout" accessible accessibilityLabel={`${title}, ${detail}`} accessibilityLiveRegion="polite" style={styles.readoutContent}>
        <AppText numeric muted variant="caption">{title}</AppText>
        <AppText numeric variant="subheadline">{detail}</AppText>
      </View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll} accessibilityLabel="Gráfico de métricas">
      <PeriodChart testID="metric-trend-chart" mode="bars" target={m.currentTarget} points={points}
        inspection={{ selectedKey, onSelect: key => setSelectedKey(old => old === key ? null : key) }} />
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  readout: { borderRadius: radius.inner },
  reserve: { opacity: 0, padding: spacing.sm, gap: spacing.xs },
  readoutContent: { position: 'absolute', top: 0, left: 0, right: 0, padding: spacing.sm, gap: spacing.xs },
  scroll: { flexGrow: 1 },
});
