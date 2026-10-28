import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchProgressMetrics, progressRequestKey, type ProgressMetrics } from '@/api/progress';
import { AppIcon, AppText, Button, GlassSurface, InlineUnavailable, SkeletonBlock, UnavailableState, pressedStyle, spacing, useOwnlevelTheme, useReduceMotion, type AppIconName } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import { PeriodChart } from './period-chart';
import { ProgressRow } from './progress-row';
import { ProgressScroll } from './progress-scroll';
import { useProgressRange } from './progress-range-context';
import { shortRange } from './progress-range';
import { arrowDelta, formatValue } from './progress-format';
import { useCachedProgressResource } from './use-cached-progress-resource';
import { ProgressReadStatus } from './progress-read-status';

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
  // Today without a value is still in course, not a gap.
  const gaps = data.series.some(p => p.value === null && !(p.start <= data.today && p.end >= data.today));
  const stats = [
    { key: 'min', label: 'Mínimo', value: v(s.minimum), when: when(s.minimum) },
    { key: 'max', label: 'Máximo', value: v(s.maximum), when: when(s.maximum) },
    { key: 'median', label: 'Mediana', value: v(s.median), when: '' },
  ];
  return <>
    <View style={styles.numbers} testID="metric-trend-summary">
      <View style={styles.grow}>
        <AppText numeric variant="largeTitle">{s.average === null ? '—' : v(s.average)}</AppText>
        <AppText muted variant="caption">promedio por día con dato</AppText>
        {m.currentTarget !== null ? <AppText muted numeric variant="caption">objetivo {v(m.currentTarget)}</AppText> : null}
        {compareText ? <AppText numeric variant="caption" testID="metric-trend-comparison">{compareText} {data.previous?.average == null ? 'sin datos'
          : `${v(data.previous.average)}${c && c.status === 'comparable' && c.deltaAbsolute !== null ? ` · ${arrowDelta(c.deltaAbsolute, m.unit, m.valueType)}` : ''}`}</AppText> : null}
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.grow}>
        <AppText numeric variant="largeTitle">{s.registeredDays} de {s.eligibleDays}</AppText>
        <AppText variant="caption" style={{ color: low ? colors.text : colors.textMuted }}>días con dato{low ? ' · pocos para un promedio' : ''}</AppText>
        {compareText && data.previous ? <AppText numeric muted variant="caption">{compareText} {data.previous.registeredDays} de {data.previous.eligibleDays}</AppText> : null}
      </View>
    </View>
    <PeriodChart testID="metric-trend-chart" mode="bars" target={m.currentTarget} points={data.series.map(p => ({
      key: p.start, label: day(p.start), value: p.value,
      text: `${p.value === null ? 'sin dato' : v(p.value)}${p.samples > 1 ? `, promedio de ${p.samples} días` : ''}`,
      ...(p.start === p.end && p.value !== null ? { onPress: () => onDay(p.start), hint: 'Abre el día en Historial' } : {}),
    }))} />
    {/* One legend line, only with what this chart shows. */}
    <View style={styles.legend} testID="metric-trend-legend">
      {!daily ? <AppText muted variant="caption">{data.period.bucket === 'week' ? 'cada barra: promedio de la semana' : 'cada barra: promedio del mes'}</AppText> : null}
      {m.currentTarget !== null ? <View style={styles.legendItem}>
        <View style={[styles.dash, { borderColor: colors.text }]} />
        <AppText muted numeric variant="caption">objetivo actual {v(m.currentTarget)}</AppText>
      </View> : null}
      {gaps ? <AppText muted variant="caption">hueco: sin dato</AppText> : null}
      {data.period.includesToday ? <AppText muted variant="caption">hoy cuenta cuando termina</AppText> : null}
    </View>
    <View style={styles.stats} testID="metric-trend-stats">
      {stats.map((x, i) => <View key={x.key} accessible accessibilityLabel={`${x.label}, ${x.value}${x.when}`}
        style={[styles.stat, i > 0 && [styles.statDivider, { borderColor: colors.border }]]}>
        <AppText muted variant="caption">{x.label}</AppText>
        <AppText numeric variant="headline">{x.value}</AppText>
        {x.when ? <AppText muted numeric variant="caption">{x.when.replace(/^ · /, '')}</AppText> : null}
      </View>)}
    </View>
    <ProgressRow label={`Del primer al último dato, ${s.trendDelta === null ? 'datos insuficientes' : arrowDelta(s.trendDelta, m.unit, m.valueType)}`}>
      <View style={styles.grow}><AppText>Del primer al último dato</AppText></View>
      <AppText numeric variant="headline">{s.trendDelta === null ? 'Sin datos suficientes' : `${arrowDelta(s.trendDelta, m.unit, m.valueType)}${s.trendPercentDelta !== null && s.trendDelta !== 0 ? ` (${PCT.format(Math.abs(s.trendPercentDelta))} %)` : ''}`}</AppText>
    </ProgressRow>
  </>;
}

/**
 * A metric to look at, as a Liquid Glass capsule (IDENTIDAD.md: glass on controls). The chosen one takes the champagne;
 * an archived one is quieter, in muted text with the archive mark, so it never reads as one you track today.
 */
function MetricChip({ label, selected, onPress, icon, quiet = false, archived = false, testID }: {
  label: string; selected: boolean; onPress: () => void; icon?: AppIconName; quiet?: boolean; archived?: boolean; testID?: string;
}) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion();
  const color = selected ? colors.primary : quiet ? colors.textMuted : colors.text;
  return <Pressable accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={archived ? `${label}, archivada` : label} testID={testID}
    onPress={() => { triggerHaptic('stepperChange'); onPress(); }} style={({ pressed }) => pressedStyle(pressed, reduced)}>
    <GlassSurface interactive tint={selected ? colors.brandSubtle : undefined} style={styles.chip}>
      {icon || archived ? <AppIcon name={icon ?? 'archive'} color={color} size={15} /> : null}
      <AppText variant="subheadline" style={{ color, fontWeight: selected ? '600' : '400' }}>{label}</AppText>
    </GlassSurface>
  </Pressable>;
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
  const { state, data, refresh } = useCachedProgressResource(client, 'metrics', `${progressRequestKey(query, compare)}|${metricId ?? ''}`, load);
  const [showArchived, setShowArchived] = useState(false);
  const active = data?.definitions.filter(d => d.isActive) ?? [];
  const archived = data?.definitions.filter(d => !d.isActive) ?? [];
  return <ProgressScroll title="Métricas" testID="metrics-trends-screen" refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}>
    <ProgressReadStatus state={state} />
    {state.status === 'loading' ? <SkeletonBlock height={200} />
      : !data ? <UnavailableState title="No pudimos cargar tus métricas" description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente." action={<Button label="Reintentar" onPress={() => void refresh()} />} />
      : <>
        {state.status !== 'ready' ? <InlineUnavailable actionLabel="Reintentar" message="No se pudo actualizar. Mostramos la última lectura confirmada." onAction={() => void refresh()} /> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chips} accessibilityLabel="Métrica">
          {active.map(d => <MetricChip key={d.id} label={d.name} selected={d.id === data.metric?.id} onPress={() => setMetricId(d.id)} />)}
          {/* Archived metrics live after a divider, quieter and with their own mark; collapsed until you ask for them. */}
          {archived.length ? <>
            <View style={[styles.rule, { backgroundColor: colors.border }]} />
            <MetricChip label={showArchived ? 'Archivadas' : `Archivadas (${archived.length})`} icon="archive" quiet selected={false}
              onPress={() => setShowArchived(v => !v)} testID="metric-archived-toggle" />
            {showArchived || archived.some(d => d.id === data.metric?.id) ? archived.filter(d => showArchived || d.id === data.metric?.id).map(d =>
              <MetricChip key={d.id} label={d.name} quiet archived selected={d.id === data.metric?.id} onPress={() => setMetricId(d.id)} />) : null}
          </> : null}
        </ScrollView>
        {data.metric && data.summary ? <Detail data={data} onDay={date => router.push({ pathname: '/history/day/[date]', params: { date } })} />
          : <AppText muted>No hay métricas para analizar.</AppText>}
      </>}
  </ProgressScroll>;
}
const styles = StyleSheet.create({
  numbers: { flexDirection: 'row', gap: spacing.lg },
  grow: { flex: 1, gap: 2 },
  divider: { width: StyleSheet.hairlineWidth },
  chipRow: { flexGrow: 0, marginHorizontal: -16 },
  chip: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  rule: { width: StyleSheet.hairlineWidth, height: 24, marginHorizontal: 4 },
  chips: { gap: spacing.sm, paddingVertical: 2, paddingHorizontal: 16, alignItems: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dash: { width: 14, borderTopWidth: 1, borderStyle: 'dashed', opacity: 0.6 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md, paddingVertical: spacing.sm },
  stat: { flexGrow: 1, flexBasis: 90, gap: 2, paddingRight: spacing.sm },
  statDivider: { borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: spacing.md },
});
