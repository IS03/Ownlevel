import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { haptics } from '@/platform/haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchProgressBody, progressRequestKey, type ProgressBody, type ProgressBodyMetric } from '@/api/progress';
import { AppText, Button, Chip, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, spacing, useOwnlevelTheme } from '@/design-system';
import { useNutritionStages } from '@/stages/stages-provider';
import { chartBands } from './stages-model';
import { PeriodChart } from './period-chart';
import { ProgressRow } from './progress-row';
import { ProgressScroll } from './progress-scroll';
import { useProgressRange } from './progress-range-context';
import { PROGRESS_UNITS, periodHeading, shortRange, type ProgressUnit } from './progress-range';
import { arrowDelta, formatValue, trendText } from './progress-format';
import { useProgressResource } from './use-progress-resource';

const LONGER: Partial<Record<ProgressUnit, ProgressUnit>> = { week: '3m', '2w': '3m', '3w': '3m', month: '3m', '3m': '6m', '6m': 'year' };

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
  const { compareText, state, setState, today } = useProgressRange();
  const day = (d: string) => shortRange({ start: d, end: d }, today);
  // With too few records, one tap to a longer period (never Personalizado: that one you chose on purpose).
  const longer = LONGER[state.unit];
  const widen = longer ? <Pressable accessibilityRole="button" testID="body-trend-widen" style={styles.link}
    onPress={() => { haptics.selection(); setState({ ...state, unit: longer, anchor: today, custom: null }); }}>
    <AppText variant="headline" style={{ color: colors.primary }}>Ver {PROGRESS_UNITS.find(u => u.value === longer)!.label.toLocaleLowerCase('es-AR')} →</AppText>
  </Pressable> : null;
  const within = state.unit === 'month' ? periodHeading(state, today).replace(/^Tu /, 'en ') : 'en el período';
  // Stages behind the weight, only if you ask for them (off by default) and only when the range touches one.
  const [showStages, setShowStages] = useState(false);
  const stages = useNutritionStages()?.state.list;
  const bands = metric.key === 'body.weight' ? chartBands(stages, metric.observations.map(o => o.date)) : [];
  const count = metric.observations.length;
  const plain = (v: number) => formatValue(v, null);
  // The trend line only when it adds to the arrow: records that zig-zag, or only two of them.
  const trendNote = metric.trend === 'variable' || metric.confidence === 'limited' ? trendText(metric.trend, metric.confidence) : null;
  if (!metric.last) return <View style={styles.section} testID="body-trend-summary">
    <AppText variant="headline">Sin registros {within}</AppText>
    <AppText muted numeric variant="footnote">{metric.latest ? `El último fue ${formatValue(metric.latest.value, metric.unit)}, el ${day(metric.latest.date)}.` : 'Todavía no registraste esta medida.'}</AppText>
    {metric.latest ? widen : null}
  </View>;
  return <View style={styles.section} testID="body-trend-summary">
    <View style={styles.numbers}>
      <View style={styles.grow}>
        <AppText numeric variant="largeTitle">{formatValue(metric.last.value, metric.unit)}</AppText>
        <AppText muted numeric variant="caption">último registro · {day(metric.last.date)}</AppText>
      </View>
      {metric.change !== null ? <>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.grow}>
          <AppText numeric variant="largeTitle">{arrowDelta(metric.change, metric.unit)}</AppText>
          <AppText muted numeric variant="caption">{metric.first ? `${within} · desde ${formatValue(metric.first.value, metric.unit)}` : within}</AppText>
          {compareText ? <AppText numeric variant="caption">{compareText} {metric.referenceChange === null
            ? `sin cambio medible (${metric.referenceCount} registro${metric.referenceCount === 1 ? '' : 's'})` : arrowDelta(metric.referenceChange, metric.unit)}</AppText> : null}
        </View>
      </> : null}
    </View>
    {count < 2 ? <>
      <AppText muted variant="footnote" testID="body-trend-single">Un solo registro {within}. Con dos o más vas a ver cómo cambió.</AppText>
      {widen}
    </> : <>
      {bands.length ? <View style={styles.chips}><Chip kind="toggle" label="Etapas" selected={showStages} onPress={() => setShowStages(v => !v)} /></View> : null}
      <View style={styles.chart}><PeriodChart testID="body-trend-chart" mode="dots" bands={showStages ? bands : undefined} points={metric.observations.map(o => ({
        key: o.date, label: day(o.date), value: o.value, valueText: plain(o.value), text: `${formatValue(o.value, metric.unit)}${o.imported ? ` · ${o.provenanceLabel}` : ''}`,
        hint: 'Abre el día en Historial', onPress: () => router.push({ pathname: '/history/day/[date]', params: { date: o.date } }),
      }))} /></View>
    </>}
    {trendNote || excluded > 0 ? <AppText muted variant="caption">
      {trendNote}{excluded > 0 ? `${trendNote ? ' ' : ''}${excluded} medición sospechosa excluida; podés corregirla en Cuerpo.` : ''}
    </AppText> : null}
  </View>;
}

/** The weight (or the measure you opened) on top; on the main screen, every other measure one tap away. */
function Content({ data, selected }: { data: ProgressBody; selected: string | null }) {
  const router = useRouter();
  const metric = (selected ? data.metrics.find(m => m.key === selected) : data.metrics.find(m => m.key === 'body.weight')) ?? data.metrics[0] ?? null;
  if (!metric) return <AppText muted>Todavía no hay pesos ni medidas registrados con fecha.</AppText>;
  const others = selected ? [] : data.metrics.filter(m => m.key !== metric.key);
  return <>
    {selected ? null : <Heading level={2}>{metric.label}</Heading>}
    <Selected metric={metric} excluded={data.excludedSuspect} />
    {others.length ? <View style={styles.section} testID="body-trend-others">
      <Heading level={2}>{metric.key === 'body.weight' ? 'Medidas' : 'Peso y medidas'}</Heading>
      <View>{others.map(m => <ProgressRow key={m.key} testID={`body-trend-row-${m.key}`} label={`${m.label}. ${metricLine(m)}`}
        onPress={() => router.push({ pathname: '/(tabs)/progress/trends/body', params: { metric: m.key } })}>
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
  const params = useLocalSearchParams<{ metric?: string }>();
  const selected = typeof params.metric === 'string' && params.metric ? params.metric : null;
  const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressBody(c, query, signal, compare), [query, compare]);
  const { state, data, refresh } = useProgressResource(client, progressRequestKey(query, compare), load);
  const title = selected ? data?.metrics.find(m => m.key === selected)?.label ?? 'Cuerpo' : 'Cuerpo';
  return <ProgressScroll title={title} testID="body-trends-screen" refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}>
    {state.status === 'loading' ? <SkeletonBlock height={200} />
      : !data ? <UnavailableState title="No pudimos cargar Cuerpo" description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente." action={<Button label="Reintentar" onPress={() => void refresh()} />} />
      : <>
        {state.status !== 'ready' ? <InlineUnavailable actionLabel="Reintentar" message="No se pudo actualizar. Mostramos la última lectura confirmada." onAction={() => void refresh()} /> : null}
        <Content data={data} selected={selected} />
      </>}
    <ProgressRow testID="body-trend-open" label="Cargar o corregir en Cuerpo" onPress={() => router.push('/(tabs)/progress/body')}>
      <View style={styles.grow}><AppText variant="headline">Cargar o corregir</AppText><AppText muted variant="footnote">Tus pesos y medidas, en Cuerpo.</AppText></View>
    </ProgressRow>
  </ProgressScroll>;
}
const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  numbers: { flexDirection: 'row', gap: spacing.lg },
  grow: { flex: 1, gap: 2 },
  divider: { width: StyleSheet.hairlineWidth },
  chips: { flexDirection: 'row' },
  chart: { marginTop: spacing.sm },
  link: { minHeight: 44, justifyContent: 'center' },
});
