import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ProgressMetrics } from '@/api/progress';
import { AppText, spacing } from '@/design-system';
import { ChartReadout, ChartOpenAction, ChartExplanation, type ChartReading } from './chart-reading';
import { FittedChart } from './fitted-chart';
import { formatValue } from './progress-format';
import { shortRange } from './progress-range';

// Numeric dates keep both the year and the true bucket bounds, including partial weeks/months.
const date = (value: string) => `${value.slice(8)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;

export type MetricPointSelection = { start: string; end: string } | null;
export type MetricInspection = { selection: MetricPointSelection; onSelect: (next: MetricPointSelection) => void };

/** Local inspection surface: no history navigation, no recalculation of server aggregates. */
export function MetricTrendChart({ data, inspection, onOpen }: { data: ProgressMetrics; inspection?: MetricInspection; onOpen?: (start: string, end: string) => void }) {
  const [source, setSource] = useState(data), [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Standalone callers retain reset-on-refresh; the owning screen can preserve a scoped selection.
  if (source !== data) { setSource(data); if (!inspection) setSelectedKey(null); }
  const m = data.metric!, bucket = data.period.bucket;
  const points = data.series.map(p => {
    const range = p.start === p.end ? date(p.start) : `${date(p.start)} – ${date(p.end)}`;
    const aggregate = bucket === 'day' ? '' : bucket === 'week' ? 'Promedio semanal · ' : 'Promedio mensual · ';
    const value = p.value === null ? 'Sin dato' : `${aggregate}${formatValue(p.value, m.unit, m.valueType)}`;
    const samples = bucket !== 'day' && p.value !== null ? ` · ${p.samples} ${p.samples === 1 ? 'día con dato' : 'días con dato'}` : '';
    return { key: p.start, end: p.end, samples: p.samples, label: shortRange({ start: p.start, end: p.start }, data.today), value: p.value,
      text: `${range}, ${value}${samples}`, range, detail: `${value}${samples}` };
  });
  const selected = inspection ? points.find(p => p.key === inspection.selection?.start && p.end === inspection.selection.end) : points.find(p => p.key === selectedKey);
  const select = (key: string) => {
    if (!inspection) { setSelectedKey(old => old === key ? null : key); return; }
    const point = points.find(p => p.key === key);
    inspection.onSelect(point && selected?.key !== key ? { start: point.key, end: point.end } : null);
  };
  const title = selected?.range ?? 'Tocá una barra';
  const detail = selected?.detail ?? 'Tocá una barra para ver fecha y valor.';
  const reading = (point: typeof points[number]): ChartReading => ({
    title: shortRange({ start: point.key, end: point.end }, data.today),
    value: point.value === null ? 'Sin dato' : formatValue(point.value, m.unit, m.valueType),
    detail: `${bucket === 'day' ? 'Registro diario' : bucket === 'week' ? 'Promedio semanal' : 'Promedio mensual'} · ${point.samples} ${point.samples === 1 ? 'día con dato' : 'días con dato'}${point.key <= data.today && point.end >= data.today ? ' · Hoy sigue en curso' : ''}`,
  });
  const overview: ChartReading = { title, value: '', detail: 'Fecha y valor' };
  const bucketLabel = bucket === 'day' ? 'Registro diario' : bucket === 'week' ? 'Promedio semanal' : 'Promedio mensual';
  const target = m.currentTarget === null ? null : formatValue(m.currentTarget, m.unit, m.valueType);
  const values = data.series.flatMap(p => p.value === null ? [] : [p.value]);
  const bound = (value: number) => formatValue(value, m.unit, m.valueType);
  const scale = values.length || m.currentTarget !== null
    ? `${bound(Math.min(0, m.currentTarget ?? 0, ...values))} – ${bound(Math.max(1, m.currentTarget ?? 0, ...values))}` : null;
  return <View style={styles.root}>
    <ChartReadout testID="metric-trend-readout" reading={selected ? reading(selected) : overview}
      candidates={[overview, ...points.map(reading)]} accessibilityLabel={selected ? `${title}, ${detail}` : `${title}, para ver fecha y valor`}
      onClear={selected ? () => select(selected.key) : undefined} />
    <View accessibilityLabel="Gráfico de métricas">
      <FittedChart testID="metric-trend-chart" label="Gráfico de métricas" mode="bars" showScale={false} currentTarget={m.currentTarget} valueType={m.valueType} unit={m.unit ?? undefined}
        range={data.period} points={points.map(p => ({ ...p, start: p.key, kind: p.value === null ? 'gap' : p.value === 0 ? 'zero' : 'mark' }))}
        selectedKey={selected?.key ?? null} onSelect={select} />
    </View>
    <AppText muted variant="caption" testID="metric-trend-legend">{bucketLabel}{target ? ` · ╌ objetivo actual ${target}` : ''}</AppText>
    {onOpen ? <ChartOpenAction label={bucket === 'day' ? 'Abrir registro diario original' : 'Recorrer días del intervalo'}
      onPress={selected ? () => onOpen(selected.key, selected.end) : undefined} /> : null}
    <ChartExplanation>
      {scale ? <AppText muted variant="footnote">Escala · {scale}</AppText> : null}
      {data.period.includesToday ? <AppText muted variant="footnote">Hoy cuenta cuando termine el día.</AppText> : null}
      <AppText muted variant="footnote">Un día sin registro no cuenta como cero. El objetivo de la línea es el actual, no el histórico.</AppText>
      {bucket !== 'day' ? <AppText muted variant="footnote">Este promedio no es un registro diario. El agregado no identifica qué fechas aportaron; podés recorrer los días del intervalo.</AppText> : null}
    </ChartExplanation>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
});
