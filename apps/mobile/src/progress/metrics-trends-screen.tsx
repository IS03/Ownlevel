import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchProgressMetrics, progressRequestKey, type ProgressMetrics } from '@/api/progress';
import { AppText, Button, Heading, InlineUnavailable, SkeletonBlock, Surface, UnavailableState, spacing, useOwnlevelTheme } from '@/design-system';
import { displayNutritionDate } from '@/nutrition/day-format';
import { ProgressScroll } from './progress-scroll';
import { useComparisonText, useProgressRange } from './progress-range-context';
import { formatDelta, formatValue } from './progress-format';
import { useProgressResource } from './use-progress-resource';
import { ValueBars } from './value-bars';

function Detail({ data, onDay }: { data: ProgressMetrics; onDay: (date: string) => void }) {
  const { colors } = useOwnlevelTheme();
  const compare = useComparisonText(), { compareText } = useProgressRange();
  const m = data.metric!, s = data.summary!, v = (n: number | null) => formatValue(n, m.unit, m.valueType);
  const low = s.coverageRatio !== null && s.coverageRatio < 0.5;
  return <>
    <Surface style={styles.section} testID="metric-trend-summary">
      <Heading level={2}>{m.name}{m.isActive ? '' : ' · archivada'}</Heading>
      <AppText variant="label">Promedio: {v(s.average)}</AppText>
      <AppText muted variant="caption">Sobre días con dato. Un 0 registrado cuenta; un día sin dato no.</AppText>
      <AppText>Mediana: {v(s.median)} · Mínimo: {v(s.minimum)} · Máximo: {v(s.maximum)}</AppText>
      <AppText variant="caption" style={low ? { color: colors.text } : undefined}>{s.registeredDays} de {s.eligibleDays} días con dato{low ? ' · cobertura baja' : ''}</AppText>
      {s.trendDelta !== null ? <AppText muted variant="caption">Del primer al último dato: {formatDelta(s.trendDelta, m.unit, m.valueType)}{s.trendPercentDelta !== null ? ` (${s.trendPercentDelta > 0 ? '+' : ''}${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(s.trendPercentDelta)}%)` : ''}</AppText>
        : <AppText muted variant="caption">Tendencia: datos insuficientes.</AppText>}
      {m.currentTarget !== null ? <AppText muted variant="caption">Objetivo actual: {v(m.currentTarget)} (no hay objetivos históricos por período)</AppText> : null}
      {data.period.includesToday ? <AppText muted variant="caption">Hoy no se incluye mientras está en curso.</AppText> : null}
    </Surface>
    {compareText && data.comparison ? <Surface style={styles.section} testID="metric-trend-comparison">
      <Heading level={2}>Frente a {compareText}</Heading>
      <AppText>{compare(data.comparison, m.unit, m.valueType)}</AppText>
      {data.previous ? <AppText muted variant="caption">{compareText}: promedio {v(data.previous.average)} · {data.previous.registeredDays} de {data.previous.eligibleDays} días con dato</AppText> : null}
    </Surface> : null}
    <Surface style={styles.section}>
      <Heading level={2}>Evolución</Heading>
      <AppText muted variant="caption">{data.period.bucket === 'day' ? 'Por día.' : data.period.bucket === 'week' ? 'Promedio por semana.' : 'Promedio por mes.'} Los tramos sin dato quedan vacíos.</AppText>
      <ValueBars testID="metric-trend-chart" bars={data.series.map(p => ({ key: p.start,
        label: p.start === p.end ? displayNutritionDate(p.start) : `${displayNutritionDate(p.start)} — ${displayNutritionDate(p.end)}`,
        value: p.value, text: v(p.value), detail: p.samples > 1 ? `${p.samples} días` : undefined,
        ...(p.start === p.end && p.value !== null ? { onPress: () => onDay(p.start), accessibilityHint: 'Abre el día en Historial' } : {}) }))} />
    </Surface>
  </>;
}

/** Tendencias de Métricas (M7.1): generic safe analytics for system and custom metrics. No sums, no "target hit" days. */
export function MetricsTrendsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ period?: string; from?: string; to?: string; metric?: string }>();
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const { query, compare } = useProgressRange();
  const [metricId, setMetricId] = useState<string | null>(typeof params.metric === 'string' ? params.metric : null);
  const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressMetrics(c, query, metricId, signal, compare), [query, metricId, compare]);
  const { state, data, refresh } = useProgressResource(client, `${progressRequestKey(query, compare)}|${metricId ?? ''}`, load);
  return <ProgressScroll title="Métricas" testID="metrics-trends-screen" refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}>
    {state.status === 'loading' ? <SkeletonBlock height={160} />
      : !data ? <UnavailableState title="No pudimos cargar tus métricas" description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente." action={<Button label="Reintentar" onPress={() => void refresh()} />} />
      : <>
        {state.status !== 'ready' ? <Surface><InlineUnavailable actionLabel="Reintentar" message="No se pudo actualizar. Mostramos la última lectura confirmada." onAction={() => void refresh()} /></Surface> : null}
        <View style={styles.wrap}>{data.definitions.map(d => <Button key={d.id} label={`${d.name}${d.isActive ? '' : ' · archivada'}`}
          variant={d.id === data.metric?.id ? 'primary' : 'secondary'} onPress={() => setMetricId(d.id)} />)}</View>
        {data.metric ? <Detail data={data} onDay={date => router.push({ pathname: '/history/day/[date]', params: { date } })} />
          : <Surface><AppText muted>No hay métricas para analizar.</AppText></Surface>}
      </>}
    <Button label="Abrir Métricas diarias" variant="secondary" onPress={() => router.push('/(tabs)/progress/metrics')} />
  </ProgressScroll>;
}
const styles = StyleSheet.create({ section: { gap: spacing.sm }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm } });
