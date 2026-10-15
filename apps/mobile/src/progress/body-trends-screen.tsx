import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchProgressBody, progressRequestKey, type ProgressBody, type ProgressBodyMetric } from '@/api/progress';
import { AppText, Button, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, spacing, useOwnlevelTheme } from '@/design-system';
import { PeriodChart } from './period-chart';
import { ProgressRow } from './progress-row';
import { ProgressScroll } from './progress-scroll';
import { useProgressRange } from './progress-range-context';
import { periodHeading, shortRange } from './progress-range';
import { arrowDelta, formatValue, trendText } from './progress-format';
import { useProgressResource } from './use-progress-resource';

/** "82 cm · ↘ 1,5 cm" inside the period; never a change from a single record. */
function metricLine(m: ProgressBodyMetric) {
  if (!m.last) return 'Sin registros en este período';
  const value = `${formatValue(m.last.value, m.unit)}`;
  if (m.change === null) return `${value} · un solo registro`;
  return `${value} · ${arrowDelta(m.change, m.unit)}`;
}

function Selected({ metric, excluded }: { metric: ProgressBodyMetric; excluded: number }) {
  const router = useRouter();
  const { colors } = useOwnlevelTheme();
  const { compareText, state, today } = useProgressRange();
  const day = (d: string) => shortRange({ start: d, end: d }, today);
  const within = state.unit === 'month' ? periodHeading(state, today).replace(/^Tu /, 'en ') : 'en el período';
  return <View style={styles.section} testID="body-trend-summary">
    <View style={styles.numbers}>
      <View style={styles.grow}>
        <AppText numeric variant="largeTitle">{metric.last ? formatValue(metric.last.value, metric.unit) : '—'}</AppText>
        <AppText muted variant="caption">{metric.last ? `último registro · ${day(metric.last.date)}`
          : metric.latest ? `sin registros en este período · el último: ${formatValue(metric.latest.value, metric.unit)}, ${day(metric.latest.date)}` : 'sin registros'}</AppText>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.grow}>
        <AppText numeric variant="largeTitle">{metric.change === null ? '—' : arrowDelta(metric.change, metric.unit)}</AppText>
        <AppText muted variant="caption">{metric.change === null ? 'hacen falta 2 registros' : within}</AppText>
        {compareText ? <AppText numeric variant="caption">{compareText} {metric.referenceChange === null
          ? `sin cambio medible (${metric.referenceCount} registro${metric.referenceCount === 1 ? '' : 's'})` : arrowDelta(metric.referenceChange, metric.unit)}</AppText> : null}
      </View>
    </View>
    {metric.observations.length ? <PeriodChart testID="body-trend-chart" mode="dots" points={metric.observations.map(o => ({
      key: o.date, label: day(o.date), value: o.value, text: `${formatValue(o.value, metric.unit)}${o.imported ? ` · ${o.provenanceLabel}` : ''}`,
      hint: 'Abre el día en Historial', onPress: () => router.push({ pathname: '/history/day/[date]', params: { date: o.date } }),
    }))} /> : null}
    <AppText muted variant="caption">
      {metric.observations.length ? 'Un punto por registro, sin completar días vacíos. ' : ''}{trendText(metric.trend, metric.confidence)}
      {excluded > 0 ? ` ${excluded} medición sospechosa excluida; podés corregirla en Cuerpo.` : ''}
    </AppText>
  </View>;
}

function Content({ data }: { data: ProgressBody }) {
  const [selected, setSelected] = useState<string | null>(null);
  const metric = data.metrics.find(m => m.key === selected) ?? data.metrics[0] ?? null;
  if (!metric) return <AppText muted>Todavía no hay pesos ni medidas registrados con fecha.</AppText>;
  const others = data.metrics.filter(m => m.key !== metric.key);
  return <>
    <Heading level={2}>{metric.label}</Heading>
    <Selected metric={metric} excluded={data.excludedSuspect} />
    {others.length ? <View style={styles.section} testID="body-trend-others">
      <Heading level={2}>{metric.key === 'body.weight' ? 'Medidas' : 'Peso y medidas'}</Heading>
      <View>{others.map(m => <ProgressRow key={m.key} testID={`body-trend-row-${m.key}`} label={`${m.label}. ${metricLine(m)}`} onPress={() => setSelected(m.key)}>
        <View style={styles.grow}><AppText variant="headline">{m.label}</AppText><AppText muted numeric variant="footnote">{metricLine(m)}</AppText></View>
      </ProgressRow>)}</View>
    </View> : null}
  </>;
}

/** Cuerpo in Progreso (P5): values inside the period, a dot per real record; no smoothing, no interpolation, no body fat. */
export function BodyTrendsScreen() {
  const router = useRouter();
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const { query, compare } = useProgressRange();
  const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressBody(c, query, signal, compare), [query, compare]);
  const { state, data, refresh } = useProgressResource(client, progressRequestKey(query, compare), load);
  return <ProgressScroll title="Cuerpo" testID="body-trends-screen" refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}>
    {state.status === 'loading' ? <SkeletonBlock height={200} />
      : !data ? <UnavailableState title="No pudimos cargar Cuerpo" description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente." action={<Button label="Reintentar" onPress={() => void refresh()} />} />
      : <>
        {state.status !== 'ready' ? <InlineUnavailable actionLabel="Reintentar" message="No se pudo actualizar. Mostramos la última lectura confirmada." onAction={() => void refresh()} /> : null}
        <Content data={data} />
      </>}
    <ProgressRow testID="body-trend-open" label="Abrir Cuerpo" onPress={() => router.push('/(tabs)/progress/body')}>
      <View style={styles.grow}><AppText variant="headline">Abrir Cuerpo</AppText><AppText muted variant="footnote">Cargá o corregí pesos y medidas.</AppText></View>
    </ProgressRow>
  </ProgressScroll>;
}
const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  numbers: { flexDirection: 'row', gap: spacing.lg },
  grow: { flex: 1, gap: 2 },
  divider: { width: StyleSheet.hairlineWidth },
});
