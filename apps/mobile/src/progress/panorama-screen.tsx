import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { useCachedRead } from '@/api/use-cached-read';
import { fetchProgressFindings, type ProgressEditorialFinding, type ProgressOverview, type ProgressDestination, type ProgressSpark } from '@/api/progress';
import { LinkRow, AppText, Button, ChipGroup, SegmentedControl, InlineUnavailable, SkeletonBlock, UnavailableState, spacing } from '@/design-system';
import { exactPeriodRange } from '@/insights/period-model';
import { addDays, progressStateForRange } from './progress-range';
import { fetchHistoryRange } from '@/api/history';
import { fetchNutritionReport, reportQueryKey } from '@/api/nutrition-report';
import { PanoramaAtlas, type AtlasDaily } from './panorama-atlas';
import { PanoramaTools, type PortadaTool } from './panorama-tools';
import { ProgressFindings } from './progress-findings';
import { useProgressRange } from './progress-range-context';
import { CompareSheet } from './period-sheets';
import { ProgressScroll } from './progress-scroll';
import { PeriodChart } from './period-chart';
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
function Preview({ kind, spark, mode, selectedKey, onSelect, value, onOpen }: {
  kind: SparkKind; spark: ProgressSpark | null | undefined; mode: 'bars' | 'dots';
  selectedKey: string | null; onSelect: (key: string | null) => void; value: number | null; onOpen: () => void;
}) {
  const points = spark ? sparkPoints(spark, SPARK_UNIT[kind]) : [];
  const selected = points.find(p => p.key === selectedKey);
  const caption = selected ? kind === 'training' ? 'Series del intervalo' : kind === 'weight' ? 'Último pesaje del intervalo' : 'Promedio por día utilizado'
    : kind === 'training' ? 'Series de estos 30 días' : kind === 'weight' ? 'Último pesaje del período' : 'Promedio por día utilizado';
  const shown = selected ? selected.value : value;
  return <View style={styles.preview} testID={`panorama-preview-${kind}`}>
    <View accessibilityLiveRegion="polite">
      <AppText muted variant="footnote">{caption}</AppText>
      <AppText numeric variant="title1">{shown === null ? 'Sin dato' : portadaValue(shown, SPARK_UNIT[kind])}</AppText>
      {selected ? <AppText muted numeric variant="footnote">{exactPeriodRange(selected)}</AppText> : null}
    </View>
    {points.some(p => p.value !== null) ? <>
      <PeriodChart testID={`panorama-chart-${kind}`} points={points} mode={mode}
        inspection={{ selectedKey: selected?.key ?? null, onSelect: key => { haptics.selection(); onSelect(selected?.key === key ? null : key); } }} />
      <AppText muted variant="caption">{kind === 'training' ? 'Series registradas por intervalo.' : kind === 'weight' ? 'Último pesaje de cada intervalo; los huecos no son ceros.' : 'Promedios del nutriente registrado; no confirman toda la ingesta.'} Tocá un punto para consultar sus fechas.</AppText>
    </> : <AppText muted variant="footnote">No hay puntos disponibles en esta lectura.</AppText>}
    <LinkRow label={kind === 'training' ? 'Abrir entrenamiento' : kind === 'weight' ? 'Abrir peso y medidas' : 'Abrir nutrición'} onPress={onOpen} />
  </View>;
}

type SparkPoints = Partial<Record<SparkKind, string | null>>;
export function ProgressPanorama({ data, onOpen, points = {}, onPoint = () => undefined, previewKind, onPreviewKind, daily, expanded = false, onToggle = () => undefined }: {
  data: ProgressOverview; onOpen: (d: ProgressDestination, point?: PortadaPoint | null) => void;
  points?: SparkPoints; onPoint?: (kind: SparkKind, key: string | null) => void; previewKind?: SparkKind; onPreviewKind?: (kind: SparkKind) => void; daily?: AtlasDaily; expanded?: boolean; onToggle?: () => void;
}) {
  const [localKind, setLocalKind] = useState<SparkKind>('training');
  const kind = previewKind ?? localKind;
  const { fontScale } = useWindowDimensions();
  const Selector = fontScale > 1.3 ? ChipGroup : SegmentedControl;
  const summaryValue = kind === 'training' ? data.training.status === 'ok' ? data.training.data.sets : null
    : kind === 'weight' ? data.sparks?.weight?.last && data.sparks.weight.last > 0 ? data.sparks.weight.last : null
    : data.nutrition.status === 'ok' ? data.nutrition.data.averageKcal : null;
  const destination: ProgressDestination = kind === 'training' ? { kind: 'training' } : kind === 'weight' ? { kind: 'body' } : { kind: 'nutrition' };
  const openArea = (d: ProgressDestination) => {
    const kind = d.kind === 'body' ? 'weight' : d.kind === 'nutrition' ? 'nutrition' : 'training';
    onOpen(d, inspectedPoint(data.sparks?.[kind], kind, points[kind]));
  };
  return <>
    <PanoramaAtlas data={data} daily={daily} onOpen={openArea} />
    <LinkRow kind="disclosure" expanded={expanded} label={expanded ? 'Ocultar puntos del resumen' : 'Ver puntos del resumen'} onPress={onToggle} />
    {expanded ? <View style={styles.expanded} testID="panorama-points">
      <Selector accessibilityLabel="Qué mirar en el resumen" value={kind} options={[{ value: 'training', label: 'Entrenar' }, { value: 'weight', label: 'Peso' }, { value: 'nutrition', label: 'Nutrición' }]}
        onChange={next => { haptics.selection(); (onPreviewKind ?? setLocalKind)(next); }} />
      <Preview kind={kind} spark={data.sparks?.[kind]} mode={kind === 'weight' ? 'dots' : 'bars'} value={summaryValue}
        selectedKey={points[kind] ?? null} onSelect={key => onPoint(kind, key)} onOpen={() => openArea(destination)} />
    </View> : null}
  </>;
}

function OverviewContent({selected, onSelect, contextOpen, onContextToggle, points, onPoint, previewKind, onPreviewKind}: {selected: string | null; onSelect: (id: string | null) => void; contextOpen: boolean; onContextToggle: () => void;
  previewKind: SparkKind; onPreviewKind: (kind: SparkKind) => void; points: SparkPoints; onPoint: (kind: SparkKind, key: string | null) => void}) {
    const { client } = useMobileApi(), router = useRouter(), { today, state: rangeState, setState } = useProgressRange();
    const [comparing, setComparing] = useState(false);
    const from = addDays(today, -29);
    const query = useMemo(() => ({ period: 'custom' as const, from, to: today }), [from, today]);
    const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressFindings(c, { period: 'custom', from, to: today }, signal), [from, today]);
    const { state, data, refresh } = useCachedRead(client, 'overview', `panorama-v2|${from}|${today}`, load);
    const historyLoad = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchHistoryRange(c, { from: query.from, to: query.to }, signal), [query]);
    const reportLoad = useCallback((c: NonNullable<typeof client>, signal: AbortSignal, background?: boolean) => fetchNutritionReport(c, query, signal, background), [query]);
    const history = useCachedRead(data ? client : null, 'overview', `panorama-calendar|${from}|${today}`, historyLoad);
    const report = useCachedRead(data ? client : null, 'nutrition-report', reportQueryKey(query), reportLoad);
    const refreshAll = () => Promise.all([refresh(), history.refresh(), report.refresh()]);
    const daily: AtlasDaily = { history: history.data, report: report.data,
      historyStale: history.state.status === 'unavailable' && !!history.data, reportStale: report.state.status === 'unavailable' && !!report.data,
      loading: history.state.status === 'loading' || report.state.status === 'loading' };

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
    return <><ProgressScroll root periodControls={false} title="Progreso" testID="progress-overview" refreshControl={<RefreshControl refreshing={(state.status === 'ready' && state.refreshing) || (history.state.status === 'ready' && history.state.refreshing) || (report.state.status === 'ready' && report.state.refreshing)} onRefresh={() => void refreshAll()}/>}>
   {data ? <>{state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Conservamos la última lectura confirmada." actionLabel="Reintentar" onAction={() => void refreshAll()}/> : null}<ProgressPanorama data={data} daily={daily} onOpen={open} points={points} onPoint={onPoint} previewKind={previewKind} onPreviewKind={onPreviewKind} expanded={contextOpen} onToggle={onContextToggle}/><ProgressFindings items={data.findings} sourcesUnavailable={data.training.status !== 'ok' || data.nutrition.status !== 'ok'} selected={selected} onSelect={onSelect} onOpen={item => open(item.destination, null, item)}/></> : state.status === 'loading' ? <SkeletonBlock height={176}/> : <UnavailableState title="No pudimos leer tu progreso" description="Tus registros siguen guardados." action={<Button label="Reintentar" onPress={() => void refresh()}/>}/>}
   <PanoramaTools today={today} onTool={tool}/>
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
  preview: { gap: spacing.md },
  expanded: { gap: spacing.lg, paddingVertical: spacing.md },
});
