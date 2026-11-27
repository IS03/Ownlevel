import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import type { ProgressEditorialFinding, ProgressOverview, ProgressDestination, ProgressSpark } from '@/api/progress';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AppIcon, AppText, Button, GlassSurface, brandTokens, radius, useOwnlevelTheme, ChipGroup, SegmentedControl, InlineUnavailable, SkeletonBlock, UnavailableState, spacing, usePullRefresh, useReduceMotion } from '@/design-system';
import { exactPeriodRange } from '@/insights/period-model';
import { progressStateForRange, shortRange, type DateRange } from './progress-range';
import { usePanoramaReads } from './panorama-resource';
import { MyViews } from './my-views';
import { PanoramaAtlas, type AtlasDaily } from './panorama-atlas';
import { PanoramaTools, type PortadaTool } from './panorama-tools';
import { ProgressFindings } from './progress-findings';
import { useProgressRange } from './progress-range-context';
import { CompareSheet } from './period-sheets';
import { ProgressScroll } from './progress-scroll';
import { FittedChart } from './fitted-chart';
import { ChartReadout, type ChartReading } from './chart-reading';
import { haptics } from '@/platform/haptics';
import { formatValue } from './progress-format';
import { destinationRoute } from './progress-destination';
import { portadaPointParams, type PortadaPoint } from './portada-point';
type SparkKind = 'training' | 'weight' | 'nutrition';
const SPARK_UNIT: Record<SparkKind, string> = { training: 'series', weight: 'kg', nutrition: 'kcal' };
/**
 * #519 · A brief reading: kcal and protein per day in whole numbers, weight with one decimal at most. Presentation only:
 * the values, their precision in the details and every calculation stay as they are.
 */
export function portadaValue(value: number, unit: string) {
  if (unit === 'kg') return formatValue(Math.round(value * 10) / 10, 'kg');
  return formatValue(value, unit, 'integer');
}
/** The spark's points with the readout they show; the same text travels to the detail with the inspected point. */
const sparkPoints = (spark: ProgressSpark, unit: string) => spark.current.map(p => ({ key: p.start, start: p.start, end: p.end, label: p.start.slice(8), value: p.value,
  text: `${exactPeriodRange(p)}: ${p.value === null ? 'sin dato' : portadaValue(p.value, unit)}` }));
/** The inspected point of a spark, if it is still in this read (a refresh can retire it). */
function inspectedPoint(spark: ProgressSpark | null | undefined, kind: SparkKind, key: string | null | undefined): PortadaPoint | null {
    const p = spark && key ? sparkPoints(spark, SPARK_UNIT[kind]).find(x => x.key === key) : undefined;
    return p ? { start: p.start, end: p.end, value: p.value, text: p.text } : null;
}

/** Inspect a single chart at a time; its exact bucket and the domain detail share the same selection. */
function Preview({ kind, spark, mode, selectedKey, onSelect, value, range }: {
  kind: SparkKind; spark: ProgressSpark | null | undefined; mode: 'bars' | 'dots'; range: DateRange;
  selectedKey: string | null; onSelect: (key: string | null) => void; value: number | null;
}) {
  const reduced = useReduceMotion();
  const points = spark ? sparkPoints(spark, SPARK_UNIT[kind]) : [];
  const selected = points.find(p => p.key === selectedKey);
  const detail = kind === 'training' ? 'Series registradas' : kind === 'weight' ? 'Peso registrado · último por intervalo' : 'Promedio por día utilizado';
  const reading = (point?: typeof points[number]): ChartReading => ({
    title: point ? shortRange(point, range.end) : 'Período completo',
    value: (point ? point.value : value) === null ? 'Sin dato' : portadaValue((point ? point.value : value)!, SPARK_UNIT[kind]), detail,
  });
  return <View style={styles.preview} testID={`panorama-preview-${kind}`}>
    <ChartReadout reading={reading(selected)} candidates={[reading(), ...points.map(p => reading(p))]} testID={`panorama-reading-${kind}`}
      accessibilityLabel={selected ? selected.text : `${reading().value}, ${detail}, período completo`}
      clearPresentation="inline" onClear={selected ? () => onSelect(null) : undefined} />
    {points.some(p => p.value !== null) ? <Animated.View key={kind} entering={reduced ? undefined : FadeIn.duration(brandTokens.motion.duration.fast)}>
      <FittedChart testID={`panorama-chart-${kind}`} label={`Resumen de ${kind === 'training' ? 'Entrenamiento' : kind === 'weight' ? 'Peso' : 'Nutrición'}`}
      range={range} showScale={false} showExtrema={mode === 'dots'} highlightLast={mode === 'dots'} connect={mode === 'dots'} animateBars={false} maxBarWidth={brandTokens.space.xxxl} unit={SPARK_UNIT[kind]} mode={mode}
      points={points.map(p => ({ ...p, kind: p.value === null ? 'gap' : p.value === 0 ? 'zero' : 'mark' }))}
      selectedKey={selected?.key ?? null} onSelect={key => onSelect(selected?.key === key ? null : key)} />
      </Animated.View> : <AppText muted variant="footnote">No hay puntos disponibles en esta lectura.</AppText>}
  </View>;
}

type SparkPoints = Partial<Record<SparkKind, string | null>>;
export function ProgressPanorama({ data, onOpen, points = {}, onPoint = () => undefined, previewKind, onPreviewKind, daily, expanded = false, onToggle = () => undefined }: {
  data: ProgressOverview; onOpen: (d: ProgressDestination, point?: PortadaPoint | null) => void;
  points?: SparkPoints; onPoint?: (kind: SparkKind, key: string | null) => void; previewKind?: SparkKind; onPreviewKind?: (kind: SparkKind) => void; daily?: AtlasDaily; expanded?: boolean; onToggle?: () => void;
}) {
  const [localKind, setLocalKind] = useState<SparkKind>('training');
  const kind = previewKind ?? localKind;
  const { fontScale } = useWindowDimensions(), { colors } = useOwnlevelTheme();
  const Selector = fontScale > 1.3 ? ChipGroup : SegmentedControl;
  const summaryValue = kind === 'training' ? data.training.status === 'ok' ? data.training.data.sets : null
    : kind === 'weight' ? data.sparks?.weight?.last && data.sparks.weight.last > 0 ? data.sparks.weight.last : null
    : data.nutrition.status === 'ok' ? data.nutrition.data.averageKcal : null;
  const openArea = (d: ProgressDestination) => {
    const kind = d.kind === 'body' ? 'weight' : d.kind === 'nutrition' ? 'nutrition' : 'training';
    onOpen(d, inspectedPoint(data.sparks?.[kind], kind, points[kind]));
  };
  return <>
    <PanoramaAtlas data={data} daily={daily} onOpen={openArea} />
    <GlassSurface style={styles.pointsControl}>
      <Pressable testID="panorama-points-toggle" accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={expanded ? 'Ocultar puntos del resumen' : 'Ver puntos del resumen'}
        onPress={() => { haptics.selection(); onToggle(); }} style={styles.pointsButton}>
        <AppIcon name="activity" size={20} color={colors.primary} /><AppText variant="headline" style={styles.grow}>Puntos del resumen</AppText>
        <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}><AppIcon name="chevronDown" size={17} color={colors.textMuted} /></View>
      </Pressable>
    </GlassSurface>
    {expanded ? <View style={styles.expanded} testID="panorama-points">
      <Selector accessibilityLabel="Qué mirar en el resumen" value={kind} options={[{ value: 'training', label: 'Entrenar' }, { value: 'weight', label: 'Peso' }, { value: 'nutrition', label: 'Nutrición' }]}
        onChange={next => { haptics.selection(); (onPreviewKind ?? setLocalKind)(next); }} />
      <Preview kind={kind} spark={data.sparks?.[kind]} mode={kind === 'weight' ? 'dots' : 'bars'} value={summaryValue} range={data.period}
        selectedKey={points[kind] ?? null} onSelect={key => onPoint(kind, key)} />
    </View> : null}
  </>;
}

const PANORAMA_WAIT_MS = 1500;

function PanoramaSkeleton() {
  const { fontScale, width } = useWindowDimensions();
  const stacked = fontScale > 1.3 || width < 360;
  return <View accessible accessibilityLabel="Cargando resumen de Progreso" accessibilityState={{ busy: true }}
    style={styles.skeleton} testID="panorama-skeleton">
    <View style={styles.skeletonPanel}>
      <SkeletonBlock width="50%" height={spacing.lg} />
      <View style={[styles.skeletonRow, stacked && styles.stacked]}>
        <View style={styles.skeletonNumber}>
          <SkeletonBlock width={spacing.xxxl} height={brandTokens.layout.minTouch} />
          <SkeletonBlock width={spacing.xxxl} height={spacing.sm} />
        </View>
        <View style={styles.skeletonCalendar}>
          {[0, 1, 2, 3, 4].map(week => <View key={week} style={styles.skeletonWeek}>
            {[0, 1, 2, 3, 4, 5, 6].map(day => <View style={styles.grow} key={day}><SkeletonBlock height={spacing.lg} /></View>)}
          </View>)}
        </View>
      </View>
      <SkeletonBlock width="55%" height={spacing.sm} />
    </View>
    <View style={[styles.skeletonRow, stacked && styles.stacked]}>
      <View style={styles.skeletonArea}>
        <SkeletonBlock width="55%" height={spacing.lg} />
        <SkeletonBlock width="70%" height={spacing.xl} />
        <View style={styles.skeletonPlot}>{[spacing.md, spacing.xl, spacing.lg, spacing.xxl].map(height =>
          <SkeletonBlock key={height} width={spacing.xs} height={height} />)}</View>
      </View>
      <View style={styles.skeletonArea}>
        <SkeletonBlock width="60%" height={spacing.lg} />
        <SkeletonBlock width="85%" height={spacing.xl} />
        <View style={styles.skeletonPlot}>{[spacing.lg, spacing.xl, spacing.md, spacing.xxl, spacing.lg, spacing.md].map((height, index) =>
          <SkeletonBlock key={index} width={spacing.sm} height={height} />)}</View>
      </View>
    </View>
  </View>;
}

function OverviewContent({selected, onSelect, contextOpen, onContextToggle, points, onPoint, previewKind, onPreviewKind}: {selected: string | null; onSelect: (id: string | null) => void; contextOpen: boolean; onContextToggle: () => void;
  previewKind: SparkKind; onPreviewKind: (kind: SparkKind) => void; points: SparkPoints; onPoint: (kind: SparkKind, key: string | null) => void}) {
    const { client } = useMobileApi(), router = useRouter(), { today, state: rangeState, setState } = useProgressRange();
    const [comparing, setComparing] = useState(false);
    const reduced = useReduceMotion();
    const { query, summary, history, report } = usePanoramaReads(client, today);
    const { from } = query, { state, data, refresh } = summary;
    const { refresh: refreshHistory } = history, { refresh: refreshReport } = report;
    const refreshAll = useCallback(async () => { await Promise.all([refresh(), refreshHistory(), refreshReport()]); },
      [refresh, refreshHistory, refreshReport]);
    const pull = usePullRefresh(refreshAll);
    const historyLoading = history.state.status === 'loading', reportLoading = report.state.status === 'loading';
    const waiting = state.status === 'loading' || historyLoading || reportLoading;
    const [expiredWindow, setExpiredWindow] = useState<string | null>(null);
    useEffect(() => {
      if (!waiting || expiredWindow === today) return;
      const timer = setTimeout(() => setExpiredWindow(today), PANORAMA_WAIT_MS);
      return () => clearTimeout(timer);
    }, [expiredWindow, today, waiting]);
    const holding = waiting && expiredWindow !== today && (state.status === 'loading' || state.status === 'ready');
    const daily: AtlasDaily = { history: history.data, report: report.data,
      historyStale: history.state.status === 'unavailable' && !!history.data, reportStale: report.state.status === 'unavailable' && !!report.data,
      historyLoading, reportLoading };

    const open = (d: ProgressDestination, point?: PortadaPoint | null, finding?: ProgressEditorialFinding) => {
        // Training/exercise details also use the shared range; set it before mounting their reader.
        const next = progressStateForRange(query.from, query.to, rangeState, today);
        if (next) setState({...next, compare: finding?.method === 'progress-nutrition'
          ? {kind: 'custom', range: {start: finding.reference.start!, end: finding.reference.end}} : {kind: 'none'}});
        const dest = destinationRoute(d);
        // The inspected spark point travels as route params; the detail selects it only if it holds the same datum.
        router.push({pathname: dest.pathname, params: {...dest.extra, from: query.from, to: query.to, ...(point ? portadaPointParams(point) : {})}});
    };
    // A tool opens on the portada window; comparison stays above the source until confirmation.
    const tool = (t: PortadaTool) => {
        if (t === 'weight' || t === 'measures') {
          const next = progressStateForRange(query.from, query.to, rangeState, today);
          if (next) setState({ ...next, compare: { kind: 'none' } });
          router.push({ pathname: '/(tabs)/progress/trends/body', params: { from, to: today, ...(t === 'weight' ? { metric: 'body.weight' } : { section: 'measures' }) } }); return;
        }
        if (t === 'metrics') { router.push('/(tabs)/progress/trends/metrics'); return; }
        // The 30 days remain a draft until «Ver comparación» confirms A and B together.
        if (t === 'compare') { setComparing(true); return; }
        const next = progressStateForRange(query.from, query.to, rangeState, today);
        if (next) setState({ ...next, compare: { kind: 'none' } });
        router.push('/(tabs)/progress/trends/meal-times');
    };
    return <>
      <ProgressScroll root periodControls={false} title="Progreso" testID="progress-overview" refreshControl={<RefreshControl {...pull} />}>
        {holding ? <PanoramaSkeleton />
          : data ? <>
            {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Conservamos la última lectura confirmada."
              actionLabel="Reintentar" onAction={() => void refreshAll()} /> : null}
            <Animated.View entering={reduced ? undefined : FadeIn.duration(brandTokens.motion.duration.fast)} style={styles.overview}>
              <ProgressPanorama data={data} daily={daily} onOpen={open} points={points} onPoint={onPoint}
                previewKind={previewKind} onPreviewKind={onPreviewKind} expanded={contextOpen} onToggle={onContextToggle} />
            </Animated.View>
          </> : state.status === 'loading' ? <PanoramaSkeleton /> : <UnavailableState title="No pudimos leer tu progreso"
            description="Tus registros siguen guardados." action={<Button label="Reintentar" onPress={() => void refreshAll()} />} />}
        <MyViews portadaQuery={query} />
        {data && !holding ? <ProgressFindings items={data.findings} sourcesUnavailable={data.training.status !== 'ok' || data.nutrition.status !== 'ok'}
          selected={selected} onSelect={onSelect} onOpen={item => open(item.destination, null, item)} /> : null}
        <PanoramaTools today={today} onTool={tool} />
      </ProgressScroll>
 {comparing ? <CompareSheet proposal={{start: from, end: today}} onClose={() => setComparing(false)} onApplied={() => router.push('/(tabs)/progress/compare')} /> : null}</>;
}
/** Unmount this reading while the tab/route is hidden; confirmed cache restores it synchronously on return. */
export function ProgressOverviewScreen() {
    const {client} = useMobileApi(), {today} = useProgressRange();
    const [visible, setVisible] = useState(false);
    // Only local state survives the trip (open finding, context, inspected spark points). Readings stay in the
    // existing account-scoped cache. A new account or a new window (another day) retires all of it.
    const [selection, setSelection] = useState<{client: typeof client; window: string; id: string | null; contextOpen: boolean; previewKind: SparkKind; points: SparkPoints}>({client, window: today, id: null, contextOpen: false, previewKind: 'training', points: {}});
    const current = selection.client === client && selection.window === today;
    if (!current) setSelection({client, window: today, id: null, contextOpen: false, previewKind: 'training', points: {}});
    useFocusEffect(useCallback(() => {setVisible(true); return () => setVisible(false);}, []));
    return visible ? <OverviewContent selected={current ? selection.id : null}
      previewKind={current ? selection.previewKind : 'training'} onPreviewKind={previewKind => setSelection(s => ({ ...s, previewKind }))}
      contextOpen={current && selection.contextOpen} points={current ? selection.points : {}}
      onSelect={id => setSelection(s => ({...s, id}))}
      onContextToggle={() => setSelection(s => ({...s, contextOpen: !s.contextOpen}))}
      onPoint={(kind, key) => setSelection(s => ({...s, points: {...s.points, [kind]: key}}))}/> : null;
}
const styles = StyleSheet.create({
  pointsControl: { borderRadius: radius.button, overflow: 'hidden', marginVertical: spacing.sm },
  pointsButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, minHeight: brandTokens.layout.buttonHeight }, grow: { flex: 1 },
  preview: { gap: spacing.md },
  overview: { gap: spacing.sm },
  skeleton: { gap: spacing.lg },
  skeletonPanel: { padding: brandTokens.layout.cardPadding, gap: spacing.md },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stacked: { flexDirection: 'column', alignItems: 'stretch' },
  skeletonNumber: { gap: spacing.sm },
  skeletonCalendar: { flex: 1, gap: spacing.xs },
  skeletonWeek: { flexDirection: 'row', gap: spacing.xs },
  skeletonArea: { flex: 1, gap: spacing.sm },
  skeletonPlot: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', gap: spacing.xs },
  expanded: { gap: spacing.lg, paddingVertical: spacing.md },
});
