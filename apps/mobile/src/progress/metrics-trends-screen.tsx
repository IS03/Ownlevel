import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { confirmedReads, scopedReadKey } from '@/api/confirmed-read-cache';
import { isDeniedRead } from '@/api/resource';
import { nutritionToday } from '@/nutrition/day-format';
import { useMobileApi } from '@/api';
import { fetchProgressMetrics, progressRequestKey, type ProgressMetrics } from '@/api/progress';
import { AppIcon, AppText, Button, Heading, GlassSurface, InlineUnavailable, SkeletonBlock, UnavailableState, brandTokens, pressedStyle, spacing, useOwnlevelTheme, usePullRefresh, useReduceMotion, type AppIconName } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import { MetricTrendChart, type MetricInspection, type MetricPointSelection } from './metric-trend-chart';
import { ProgressRow } from './progress-row';
import { ProgressScroll } from './progress-scroll';
import { useProgressRange } from './progress-range-context';
import { shortRange } from './progress-range';
import { arrowDelta, formatValue } from './progress-format';
import { useCachedRead } from '@/api/use-cached-read';
import { ReturnToInsights } from '@/insights/return-to-insights';
import { useProgressRouteRange } from './use-progress-route-range';
import { isChartMetricId, metricOriginalHref } from './metrics-chart-navigation';
import { figuresFitInRow, useMeasuredWidth } from './figure-layout';

const NO_DEFINITIONS: ProgressMetrics['definitions'] = [];
const PCT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

function Detail({ data, inspection }: { data: ProgressMetrics; inspection: MetricInspection }) {
  const { colors } = useOwnlevelTheme();
  const router = useRouter();
  const { width, fontScale, onLayout } = useMeasuredWidth();
  const { today } = useProgressRange();
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
  const target = m.currentTarget !== null && m.currentTarget > 0 && s.average !== null
    ? `${PCT.format(s.average / m.currentTarget * 100)} % del objetivo (${v(m.currentTarget)})` : null;
  const previous = c?.status === 'comparable' && c.deltaAbsolute !== null && data.previous?.average != null
    ? `${arrowDelta(c.deltaAbsolute, m.unit, m.valueType)} frente a ${shortRange({ start: data.period.previousStart, end: data.period.previousEnd }, today)}` : null;
  const change = s.trendDelta === null ? 'Sin datos suficientes'
    : `${arrowDelta(s.trendDelta, m.unit, m.valueType)}${s.trendPercentDelta !== null && s.trendDelta !== 0 ? ` (${PCT.format(Math.abs(s.trendPercentDelta))} %)` : ''}`;
  const overview = [
    ...(target ? [{ label: 'Objetivo actual', value: target }] : []),
    ...(previous ? [{ label: 'Período de referencia', value: previous }] : []),
    { label: 'Cambio en el período', value: change },
  ];
  const stats = [
    { key: 'min', label: 'Mínimo', value: v(s.minimum), when: when(s.minimum) },
    { key: 'max', label: 'Máximo', value: v(s.maximum), when: when(s.maximum) },
    { key: 'median', label: 'Mediana', value: v(s.median), when: '' },
  ];
  // Three columns only while every value fits whole; otherwise (or with large text) one under the other.
  const stacked = !figuresFitInRow({ texts: stats.map(x => x.value), width, fontScale, variant: 'headline' });
  return <>
    <View style={styles.numbers} testID="metric-trend-summary" onLayout={onLayout}>
      <AppText numeric variant="largeTitle" accessibilityLabel={s.average === null ? 'Sin dato' : undefined}>{s.average === null ? '—' : v(s.average)}</AppText>
      <AppText muted variant="caption">Promedio diario</AppText>
      <AppText numeric muted>{s.registeredDays} de {s.eligibleDays} días con dato{low ? ' · pocos para un promedio' : ''}</AppText>
    </View>
    <MetricTrendChart data={data} inspection={inspection} onOpen={isChartMetricId(m.id) ? (start, end) => {
      const href = metricOriginalHref(m.id, start, end, data.period.bucket !== 'day'); if (href) router.push(href);
    } : undefined} />
    <Heading level={2}>Resumen</Heading>
    {overview.map(item => <ProgressRow key={item.label} label={`${item.label}, ${item.value}`}>
      <View style={[styles.trend, fontScale > 1.3 && styles.stacked]}>
        <AppText style={[styles.grow, fontScale > 1.3 && styles.stackedText]}>{item.label}</AppText>
        <AppText numeric variant="headline" style={[styles.grow, fontScale > 1.3 && styles.stackedText]}>{item.value}</AppText>
      </View>
    </ProgressRow>)}
    <View style={[styles.stats, stacked && styles.stacked]} testID="metric-trend-stats">
      {stats.map((x, i) => <View key={x.key} accessible accessibilityLabel={`${x.label}, ${x.value}${x.when}`}
        style={[styles.stat, stacked && styles.stackedStat, i > 0 && [stacked ? styles.statTopDivider : styles.statDivider, { borderColor: colors.border }]]}>
        <AppText muted variant="caption">{x.label}</AppText>
        <AppText numeric variant="headline">{x.value}</AppText>
        {x.when ? <AppText muted numeric variant="caption">{x.when.replace(/^ · /, '')}</AppText> : null}
      </View>)}
    </View>
  </>;
}

/**
 * A metric to look at, as a Liquid Glass capsule (IDENTIDAD.md: glass on controls). The chosen one takes the champagne;
 * an archived one is quieter, in muted text with the archive mark, so it never reads as one you track today.
 */
function MetricChip({ label, selected, onPress, icon, quiet = false, archived = false, expanded, testID }: {
  label: string; selected: boolean; onPress: () => void; icon?: AppIconName; quiet?: boolean; archived?: boolean;
  /** Only for the control that shows or hides the archived metrics: a disclosure button, not one more metric. */
  expanded?: boolean; testID?: string;
}) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion();
  const color = selected ? colors.primary : quiet ? colors.textMuted : colors.text;
  const disclosure = expanded !== undefined;
  // The capsule keeps its look; the touch area reaches the 44 pt minimum around it.
  return <Pressable accessibilityRole={disclosure ? 'button' : 'radio'} accessibilityState={disclosure ? { expanded } : { selected }}
    accessibilityLabel={archived ? `${label}, archivada` : label} testID={testID}
    onPress={() => { triggerHaptic('stepperChange'); onPress(); }} style={({ pressed }) => [styles.chipTarget, pressedStyle(pressed, reduced)]}>
    <GlassSurface interactive tint={selected ? colors.brandSubtle : undefined} style={styles.chip}>
      {icon || archived ? <AppIcon name={icon ?? 'archive'} color={color} size={15} /> : null}
      <AppText variant="subheadline" style={{ color, fontWeight: selected ? '600' : '400' }}>{label}</AppText>
    </GlassSurface>
  </Pressable>;
}

/** Métricas in Progreso (P6): one metric at a time, average per day with data, coverage always visible. No sums, no "target hit" days. */
function MetricsTrends() {
  const params = useLocalSearchParams<{ metric?: string }>();
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const { query, compare } = useProgressRange();
  const routeMetric = typeof params.metric === 'string' ? params.metric : null;
  const [metricId, setMetricId] = useState<string | null>(routeMetric);
  // A new link may reuse the mounted route: it chooses its metric once, and the chips stay free afterwards.
  const [seenMetric, setSeenMetric] = useState(routeMetric);
  if (seenMetric !== routeMetric) { setSeenMetric(routeMetric); setMetricId(routeMetric); }
  const prefix = progressRequestKey(query, compare);
  const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal, background?: boolean) =>
    fetchProgressMetrics(c, query, metricId, signal, compare, background), [query, metricId, compare]);
  const { state, data, refresh } = useCachedRead(client, 'metrics', `${prefix}|${metricId ?? ''}`, load);
  const pull = usePullRefresh(refresh);
  // Fetching another detail should not retire the definitions from this account.
  const [selector, setSelector] = useState({ client, definitions: NO_DEFINITIONS, defaultId: null as string | null });
  const sameClient = selector.client === client && !isDeniedRead(state);
  const definitions = data?.definitions ?? (sameClient ? selector.definitions : NO_DEFINITIONS);
  const defaultId = data && metricId === null ? data.metric?.id ?? null : sameClient ? selector.defaultId : null;
  if (selector.client !== client || definitions !== selector.definitions || defaultId !== selector.defaultId) {
    setSelector({ client, definitions, defaultId });
  }
  const selectedId = data?.metric?.id ?? metricId ?? defaultId;
  const canWarm = state.status === 'ready' && !state.refreshing;
  useFocusEffect(useCallback(() => {
    if (!client || !canWarm) return;
    const cache = confirmedReads(client), day = nutritionToday();
    const stops = definitions.filter(d => d.isActive && d.id !== selectedId).map(definition => {
      const id = definition.id === defaultId ? null : definition.id;
      const entry = cache.get('metrics', scopedReadKey(`${prefix}|${id ?? ''}`, day),
        (signal, background) => fetchProgressMetrics(client, query, id, signal, compare, background));
      return cache.prefetch([entry]);
    });
    return () => { for (const stop of stops) stop(); };
  }, [canWarm, client, compare, defaultId, definitions, prefix, query, selectedId]));
  const definition = data?.metric;
  const scope = JSON.stringify([progressRequestKey(query, compare), metricId, definition?.id, definition?.name, definition?.unit, definition?.valueType, definition?.isActive]);
  const [saved, setSaved] = useState({ client, scope, selection: null as MetricPointSelection });
  const sameScope = saved.client === client && saved.scope === scope;
  const selection = sameScope ? saved.selection : null;
  if (!sameScope) setSaved({ client, scope, selection: null });
  const inspection: MetricInspection = { selection, onSelect: next => setSaved({ client, scope, selection: next }) };
  const [showArchived, setShowArchived] = useState(false);
  const active = definitions.filter(d => d.isActive);
  const archived = definitions.filter(d => !d.isActive);
  return <ProgressScroll title="Métricas" testID="metrics-trends-screen" refreshControl={<RefreshControl {...pull} tintColor={colors.primary} />}>
    <ReturnToInsights />
    {definitions.length ? <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}
      contentContainerStyle={styles.chips} accessibilityLabel="Métrica" testID="progress-metric-chips">
      {active.map(d => <MetricChip key={d.id} label={d.name} selected={d.id === selectedId} onPress={() => setMetricId(d.id === defaultId ? null : d.id)} />)}
      {archived.length ? <>
        <View style={[styles.rule, { backgroundColor: colors.border }]} />
        <MetricChip label={showArchived ? 'Archivadas' : `Archivadas (${archived.length})`} icon="archive" quiet selected={false}
          expanded={showArchived} onPress={() => setShowArchived(v => !v)} testID="metric-archived-toggle" />
        {archived.filter(d => showArchived || d.id === selectedId).map(d =>
          <MetricChip key={d.id} label={d.name} quiet archived selected={d.id === selectedId} onPress={() => setMetricId(d.id)} />)}
      </> : null}
    </ScrollView> : null}
    {state.status === 'loading' ? <MetricDetailSkeleton />
      : !data ? <UnavailableState title="No pudimos cargar tus métricas" description="Tus datos siguen guardados. Revisá la conexión e intentá nuevamente."
        action={<Button label="Reintentar" onPress={() => void refresh()} />} />
      : <>
        {state.status !== 'ready' ? <InlineUnavailable actionLabel="Reintentar" message="No se pudo actualizar. Mostramos la última lectura confirmada." onAction={() => void refresh()} /> : null}
        {data.metric && data.summary ? <Detail data={data} inspection={inspection} />
          : <AppText muted>No hay métricas para analizar.</AppText>}
      </>}
  </ProgressScroll>;
}
function MetricDetailSkeleton() {
  return <View style={styles.skeleton} accessible accessibilityLabel="Cargando la métrica" accessibilityState={{ busy: true }} testID="metric-detail-skeleton">
    <SkeletonBlock height={brandTokens.layout.minTouch} width="40%" />
    <SkeletonBlock height={spacing.md} width="50%" />
    <SkeletonBlock height={brandTokens.layout.minTouch * 3} />
    <View style={styles.trend}>{[0, 1, 2].map(index => <View key={index} style={styles.grow}>
      <SkeletonBlock height={spacing.md} width="70%" /><SkeletonBlock height={spacing.lg} width="85%" />
    </View>)}</View>
  </View>;
}

/** A link can bring a period along (from Insights, the month of that day). It applies before the first read. */
export function MetricsTrendsScreen() {
  const applied = useProgressRouteRange();
  return applied ? <MetricsTrends /> : <SkeletonBlock height={200} />;
}
const styles = StyleSheet.create({
  numbers: { gap: spacing.xs },
  skeleton: { gap: spacing.md },
  grow: { flex: 1, gap: 2 },
  trend: { flex: 1, flexDirection: 'row', gap: spacing.md },
  stacked: { flexDirection: 'column' },
  stackedText: { flex: 0 },
  stackedStat: { flexBasis: 'auto', flexGrow: 0 },
  statTopDivider: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md },
  chipRow: { flexGrow: 0, marginHorizontal: -brandTokens.layout.screenPadding },
  chipTarget: { minHeight: brandTokens.layout.minTouch, justifyContent: 'center' },
  chip: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  rule: { width: StyleSheet.hairlineWidth, height: 24, marginHorizontal: 4 },
  chips: { gap: spacing.sm, paddingHorizontal: brandTokens.layout.screenPadding, alignItems: 'center' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md, paddingVertical: spacing.sm },
  stat: { flexGrow: 1, flexBasis: 90, gap: 2, paddingRight: spacing.sm },
  statDivider: { borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: spacing.md },
});
