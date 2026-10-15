import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchProgressMetrics, progressRequestKey, type ProgressMetrics } from '@/api/progress';
import { AppText, Button, Chip, InlineUnavailable, SkeletonBlock, UnavailableState, spacing, useOwnlevelTheme } from '@/design-system';
import { PeriodChart } from './period-chart';
import { ProgressRow } from './progress-row';
import { ProgressScroll } from './progress-scroll';
import { useProgressRange } from './progress-range-context';
import { shortRange } from './progress-range';
import { arrowDelta, formatValue } from './progress-format';
import { useProgressResource } from './use-progress-resource';

const PCT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

function Detail({ data, onDay }: { data: ProgressMetrics; onDay: (date: string) => void }) {
  const { colors } = useOwnlevelTheme();
  const { compareText, today } = useProgressRange();
  const m = data.metric!, s = data.summary!, v = (n: number | null) => formatValue(n, m.unit, m.valueType);
  const low = s.coverageRatio !== null && s.coverageRatio < 0.5;
  const daily = data.period.bucket === 'day';
  const day = (d: string) => shortRange({ start: d, end: d }, today);
  // The day of the minimum/maximum is only exact with one day per bar.
  const when = (value: number | null) => {
    const hit = daily && value !== null ? data.series.find(p => p.value === value) : undefined;
    return hit ? ` · ${day(hit.start)}` : '';
  };
  const c = data.comparison;
  return <>
    <View style={styles.numbers} testID="metric-trend-summary">
      <View style={styles.grow}>
        <AppText numeric variant="largeTitle">{s.average === null ? '—' : v(s.average)}</AppText>
        <AppText muted variant="caption">promedio por día con dato{m.currentTarget !== null ? ` · obj. ${v(m.currentTarget)}` : ''}</AppText>
        {compareText ? <AppText numeric variant="caption" testID="metric-trend-comparison">{compareText} {data.previous?.average == null ? 'sin datos'
          : `${v(data.previous.average)}${c && c.status === 'comparable' && c.deltaAbsolute !== null ? ` · ${arrowDelta(c.deltaAbsolute, m.unit, m.valueType)}` : ''}`}</AppText> : null}
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.grow}>
        <AppText numeric variant="largeTitle">{s.registeredDays}/{s.eligibleDays}</AppText>
        <AppText variant="caption" style={{ color: low ? colors.text : colors.textMuted }}>días con dato{low ? ' · cobertura baja' : ''}</AppText>
        {compareText && data.previous ? <AppText numeric muted variant="caption">{compareText} {data.previous.registeredDays}/{data.previous.eligibleDays}</AppText> : null}
      </View>
    </View>
    <PeriodChart testID="metric-trend-chart" mode="bars" target={m.currentTarget} points={data.series.map(p => ({
      key: p.start, label: day(p.start), value: p.value,
      text: `${p.value === null ? 'sin dato' : v(p.value)}${p.samples > 1 ? `, promedio de ${p.samples} días` : ''}`,
      ...(p.start === p.end && p.value !== null ? { onPress: () => onDay(p.start), hint: 'Abre el día en Historial' } : {}),
    }))} />
    <AppText muted variant="caption">
      {daily ? 'Un día por barra' : data.period.bucket === 'week' ? 'Promedio por semana' : 'Promedio por mes'}
      {m.currentTarget !== null ? ' · línea = objetivo actual' : ''} · hueco = sin dato
      {data.period.includesToday ? ' · hoy no se incluye mientras está en curso' : ''}. Un 0 registrado cuenta; un día sin dato no.
    </AppText>
    <View>
      <ProgressRow label={`Mínimo, ${v(s.minimum)}`}><View style={styles.grow}><AppText variant="headline">Mínimo</AppText><AppText muted numeric variant="footnote">{v(s.minimum)}{when(s.minimum)}</AppText></View></ProgressRow>
      <ProgressRow label={`Máximo, ${v(s.maximum)}`}><View style={styles.grow}><AppText variant="headline">Máximo</AppText><AppText muted numeric variant="footnote">{v(s.maximum)}{when(s.maximum)}</AppText></View></ProgressRow>
      <ProgressRow label={`Mediana, ${v(s.median)}`}><View style={styles.grow}><AppText variant="headline">Mediana</AppText><AppText muted numeric variant="footnote">{v(s.median)}</AppText></View></ProgressRow>
      <ProgressRow><View style={styles.grow}><AppText variant="headline">Del primer al último dato</AppText>
        <AppText muted numeric variant="footnote">{s.trendDelta === null ? 'Datos insuficientes' : `${arrowDelta(s.trendDelta, m.unit, m.valueType)}${s.trendPercentDelta !== null ? ` (${PCT.format(Math.abs(s.trendPercentDelta))} %)` : ''}`}</AppText></View></ProgressRow>
    </View>
    {m.currentTarget !== null ? <AppText muted variant="caption">El objetivo es el actual: no hay objetivos históricos por período.</AppText> : null}
  </>;
}

/** Métricas in Progreso (P6): one metric at a time, average per day with data, coverage always visible. No sums, no "target hit" days. */
export function MetricsTrendsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ metric?: string }>();
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const { query, compare } = useProgressRange();
  const [metricId, setMetricId] = useState<string | null>(typeof params.metric === 'string' ? params.metric : null);
  const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressMetrics(c, query, metricId, signal, compare), [query, metricId, compare]);
  const { state, data, refresh } = useProgressResource(client, `${progressRequestKey(query, compare)}|${metricId ?? ''}`, load);
  return <ProgressScroll title="Métricas" testID="metrics-trends-screen" refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}>
    {state.status === 'loading' ? <SkeletonBlock height={200} />
      : !data ? <UnavailableState title="No pudimos cargar tus métricas" description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente." action={<Button label="Reintentar" onPress={() => void refresh()} />} />
      : <>
        {state.status !== 'ready' ? <InlineUnavailable actionLabel="Reintentar" message="No se pudo actualizar. Mostramos la última lectura confirmada." onAction={() => void refresh()} /> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel="Métrica">
          {data.definitions.map(d => <Chip key={d.id} label={`${d.name}${d.isActive ? '' : ' · archivada'}`} selected={d.id === data.metric?.id} onPress={() => setMetricId(d.id)} />)}
        </ScrollView>
        {data.metric && data.summary ? <Detail data={data} onDay={date => router.push({ pathname: '/history/day/[date]', params: { date } })} />
          : <AppText muted>No hay métricas para analizar.</AppText>}
      </>}
    <ProgressRow testID="metric-trend-open" label="Abrir Métricas diarias" onPress={() => router.push('/(tabs)/progress/metrics')}>
      <View style={styles.grow}><AppText variant="headline">Abrir Métricas diarias</AppText><AppText muted variant="footnote">Cargá o corregí el dato de un día.</AppText></View>
    </ProgressRow>
  </ProgressScroll>;
}
const styles = StyleSheet.create({
  numbers: { flexDirection: 'row', gap: spacing.lg },
  grow: { flex: 1, gap: 2 },
  divider: { width: StyleSheet.hairlineWidth },
  chips: { gap: spacing.sm, paddingVertical: 2 },
});
