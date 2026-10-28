import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { haptics } from '@/platform/haptics';
import { BodyAddMenu } from '@/body/body-add-menu';
import { BodyEditors, BodyStatus, MeasurementRecords, WeightRecords, openTodayWeight, useMeasurementEntry, useWeightEntry } from '@/body/body-screen';
import { useBodyController } from '@/body/use-body-controller';
import { useMobileAuth } from '@/auth';
import { BODY_MEASUREMENT_FIELDS, type BodyMeasurementField } from '@/api/body';
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
import { useCachedProgressResource } from './use-cached-progress-resource';
import { ProgressReadStatus } from './progress-read-status';

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

/** "body.arm_right" → "armRightCm": the record field behind a measure of this screen (none for the weight). */
function recordField(key: string): BodyMeasurementField | undefined {
  const field = `${key.replace(/^body\./, '').replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}Cm`;
  return (BODY_MEASUREMENT_FIELDS as readonly string[]).includes(field) ? field as BodyMeasurementField : undefined;
}

type Body = NonNullable<ReturnType<typeof useBodyController>>;
/** The weight (or the measure you opened) on top, its records under it; on the main screen, every other measure one tap away. */
function Content({ data, selected, body }: { data: ProgressBody; selected: string | null; body: Body | null }) {
  const router = useRouter();
  const { colors } = useOwnlevelTheme();
  const metric = (selected ? data.metrics.find(m => m.key === selected) : data.metrics.find(m => m.key === 'body.weight')) ?? data.metrics[0] ?? null;
  if (!metric) return <AppText muted>Todavía no hay pesos ni medidas registrados con fecha.</AppText>;
  const others = selected ? [] : data.metrics.filter(m => m.key !== metric.key);
  const field = recordField(metric.key);
  const editable = !!body && body.state.phase === 'idle' && !body.state.intent && !body.state.editor;
  return <>
    {selected ? null : <Heading level={2}>{metric.label}</Heading>}
    <Selected metric={metric} excluded={data.excludedSuspect} />
    {body?.state.read.overview ? <View style={styles.section} testID="body-trend-records">
      <AppText muted variant="footnote">{metric.key === 'body.weight' ? 'Tus pesajes · tocá uno para corregirlo' : 'Tus mediciones · tocá una para corregirla'}</AppText>
      {metric.key === 'body.weight' ? <WeightRecords state={body.state} controller={body.controller} editable={editable} limit={selected ? undefined : 5} />
        : <MeasurementRecords state={body.state} controller={body.controller} editable={editable} field={field} />}
      {!selected && body.state.read.weights.length > 5 ? <Pressable accessibilityRole="button" style={styles.link} testID="body-trend-all-weights"
        onPress={() => { haptics.selection(); router.push({ pathname: '/(tabs)/progress/trends/body', params: { metric: 'body.weight' } }); }}>
        <AppText variant="headline" style={{ color: colors.primary }}>Ver todos los pesajes →</AppText>
      </Pressable> : null}
    </View> : null}
    {others.length ? <View style={styles.section} testID="body-trend-others">
      <Heading level={2}>{metric.key === 'body.weight' ? 'Medidas' : 'Peso y medidas'}</Heading>
      <View>{others.map(m => <ProgressRow key={m.key} testID={`body-trend-row-${m.key}`} label={`${m.label}. ${metricLine(m)}`}
        onPress={() => router.push({ pathname: '/(tabs)/progress/trends/body', params: { metric: m.key } })}>
        <View style={styles.grow}><AppText variant="headline">{m.label}</AppText><AppText muted numeric variant="footnote">{metricLine(m)}</AppText></View>
      </ProgressRow>)}</View>
    </View> : null}
  </>;
}

/**
 * Cuerpo (P5), the only Body screen: values inside the period, a dot per real record (no smoothing, no interpolation,
 * no body fat), the records to correct right under them, and one floating "+" to load a weight or measures here.
 */
export function BodyTrendsScreen() {
  const { client } = useMobileApi();
  const { session } = useMobileAuth();
  const { colors } = useOwnlevelTheme();
  const { query, compare } = useProgressRange();
  const params = useLocalSearchParams<{ metric?: string; registrar?: string }>();
  const selected = typeof params.metric === 'string' && params.metric ? params.metric : null;
  const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressBody(c, query, signal, compare), [query, compare]);
  const { state, data, refresh } = useCachedProgressResource(client, 'body', progressRequestKey(query, compare), load);
  const body = useBodyController(client, session?.user.id ?? 'anonymous');
  // Links from Inicio or Ajustes open the right sheet once ("registrar=peso|medidas").
  useWeightEntry(params.registrar === 'peso', body);
  useMeasurementEntry(params.registrar === 'medidas', body);
  // A saved weight or measurement re-reads Body; the period read follows it.
  const overview = body?.state.read.overview;
  const seen = useRef(overview);
  useEffect(() => {
    if (overview && seen.current && overview !== seen.current) void refresh();
    seen.current = overview;
  }, [overview, refresh]);
  const title = selected ? data?.metrics.find(m => m.key === selected)?.label ?? 'Cuerpo' : 'Cuerpo';
  const editable = !!body?.state.read.overview && body.state.phase === 'idle' && !body.state.intent && !body.state.editor;
  return <><ProgressScroll title={title} testID="body-trends-screen" refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing}
    onRefresh={() => { void refresh(); void body?.controller.load(); }} tintColor={colors.primary} />}>
    <ProgressReadStatus state={state} />
    {body ? <BodyStatus state={body.state} controller={body.controller} /> : null}
    {state.status === 'loading' ? <SkeletonBlock height={200} />
      : !data ? <UnavailableState title="No pudimos cargar Cuerpo" description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente." action={<Button label="Reintentar" onPress={() => void refresh()} />} />
      : <>
        {state.status !== 'ready' ? <InlineUnavailable actionLabel="Reintentar" message="No se pudo actualizar. Mostramos la última lectura confirmada." onAction={() => void refresh()} /> : null}
        <Content data={data} selected={selected} body={body} />
      </>}
    <View style={styles.fabRoom} />
  </ProgressScroll>
  {body ? <>
    <BodyAddMenu disabled={!editable} actions={[
      { key: 'weight', label: 'Registrar peso', icon: 'scale', onPress: () => openTodayWeight(body.state, body.controller) },
      { key: 'measurement', label: 'Registrar medidas', icon: 'ruler', onPress: () => body.controller.openMeasurement() },
    ]} />
    <BodyEditors state={body.state} controller={body.controller} />
  </> : null}</>;
}
const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  numbers: { flexDirection: 'row', gap: spacing.lg },
  grow: { flex: 1, gap: 2 },
  divider: { width: StyleSheet.hairlineWidth },
  chips: { flexDirection: 'row' },
  chart: { marginTop: spacing.sm },
  link: { minHeight: 44, justifyContent: 'center' },
  fabRoom: { height: 72 },
});
