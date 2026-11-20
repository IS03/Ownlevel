import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import { haptics } from '@/platform/haptics';
import { BodyAddMenu } from '@/body/body-add-menu';
import { BodyEditors, BodyStatus, MeasurementRecords, WeightRecords, openTodayWeight, useMeasurementEntry, useWeightEntry } from '@/body/body-screen';
import { useBodyController } from '@/body/use-body-controller';
import { useMobileAuth } from '@/auth';
import { BODY_MEASUREMENT_FIELDS, type BodyMeasurementField } from '@/api/body';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchProgressBody, progressRequestKey, type ProgressBody, type ProgressBodyMetric } from '@/api/progress';
import { LinkRow, AppText, Button, Chip, ChipGroup, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, brandTokens, radius, spacing, useOwnlevelTheme } from '@/design-system';
import { useNutritionStages } from '@/stages/stages-provider';
import { chartBands } from './stages-model';
import { ExerciseSegmented } from '@/training/exercise-segmented';
import { FittedChart } from './fitted-chart';
import { BODY_CHOICES, BodyJournal, BodyMetricPicker, BodyRecordComparison, BodyZones } from './body-atlas';
import { ProgressScroll } from './progress-scroll';
import { useProgressRange } from './progress-range-context';
import { PROGRESS_UNITS, addDays, progressRange, periodHeading, shortRange, type ProgressUnit } from './progress-range';
import { arrowDelta, formatValue, trendText } from './progress-format';
import { useCachedRead } from '@/api/use-cached-read';
import { ReturnToInsights } from '@/insights/return-to-insights';
import { useProgressRouteRange } from './use-progress-route-range';
import { WeeklyWeights } from './weekly-weights';
import { BodyTimelineContext } from './body-context';
import { formatBodyDate } from '@/body/body-model';
import { bodyObservationHref, isBodyChartMetric } from './body-chart-navigation';
import { figuresFitInRow, useMeasuredWidth } from './figure-layout';
import { PortadaPointNote, sameValue, usePortadaPoint, type PortadaPoint } from './portada-point';

const validBodyValue = (value: number) => Number.isFinite(value) && value > 0;
const bodyDifference = (value: number, unit: string) => Math.abs(value) < 1e-9 ? `= ${formatValue(0, unit)}` : arrowDelta(value, unit);
/** The same difference in words for VoiceOver: an arrow glyph is not a sentence. */
const spokenDifference = (value: number, unit: string) => Math.abs(value) < 1e-9 ? 'sin cambio'
  : `${value < 0 ? 'bajó' : 'subió'} ${formatValue(Math.abs(value), unit)}`;
const LONGER: Partial<Record<ProgressUnit, ProgressUnit>> = { week: '3m', '2w': '3m', '3w': '3m', month: '3m', '3m': '6m', '6m': 'year' };


function Selected({ metric, excluded, storedZeros = [], selectedDate, onSelect, routeMetric, portada }: {
  metric: ProgressBodyMetric; excluded: number; storedZeros?: readonly string[]; selectedDate: string | null;
  onSelect: (date: string | null) => void; routeMetric: string | null; portada?: { point: PortadaPoint; matched: boolean } | null;
}) {
  const router = useRouter();
  const { colors } = useOwnlevelTheme();
  const { compareText, state, setState, today } = useProgressRange();
  const { width, fontScale, onLayout } = useMeasuredWidth();
  const chartRange = progressRange(state,today);
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
  const valid = validBodyValue;
  const invalid = metric.observations.filter(o => !valid(o.value));
  const count = metric.observations.filter(o => valid(o.value)).length;
  // Do not repair an older server's aggregates in presentation or label a stored 0 kg as valid body weight.
  const safeSummary = !invalid.length && (!metric.first || valid(metric.first.value)) && (!metric.last || valid(metric.last.value));
  const point = metric.observations.find(o => o.date === selectedDate);
  const original = point ? bodyObservationHref(point.date, routeMetric) : null;
  const provenance = point?.provenanceLabel.trim() || (point?.imported ? 'Importado' : 'Procedencia no informada');
  // A stored 0 kg is not a weight. A server that still counts it sends it as an observation: said so, never re-computed here.
  // A server that already leaves it out does not send it: the records of the period say it is there and does not count.
  const counted = metric.key === 'body.weight' ? metric.observations.filter(o => o.value === 0).map(o => o.date) : [];
  const left = counted.length ? [] : storedZeros;
  // The trend line only when it adds to the arrow: records that zig-zag, or only two of them.
  const trendNote = safeSummary && count >= 3 ? trendText(metric.trend, metric.confidence) : null;
  if (!metric.last && !metric.observations.length) return <View style={styles.section} testID="body-trend-summary">
    <AppText variant="headline">Sin registros {within}</AppText>
    <AppText muted numeric variant="footnote">{metric.latest && valid(metric.latest.value) ? `El último fue ${formatValue(metric.latest.value, metric.unit)}, el ${day(metric.latest.date)}.` : 'Todavía no registraste esta medida.'}</AppText>
    {metric.latest ? widen : null}
  </View>;
  const lastText = metric.last ? formatValue(metric.last.value, metric.unit) : '';
  const changeText = metric.change !== null ? bodyDifference(metric.change, metric.unit) : null;
  const since = metric.first ? `${within} · desde ${formatValue(metric.first.value, metric.unit)} el ${day(metric.first.date)}` : within;
  // Side by side only when both figures fit whole in the measured width; otherwise one under the other.
  const stacked = !figuresFitInRow({ texts: changeText ? [lastText, changeText] : [lastText], width, fontScale, variant: 'largeTitle' });
  const references = `${metric.referenceCount} ${metric.referenceCount === 1 ? 'registro' : 'registros'}`;
  return <View style={styles.section} testID="body-trend-summary" onLayout={onLayout}>
    {safeSummary && metric.last ? <View testID="body-trend-figures" style={[styles.numbers, stacked && styles.stackedNumbers]}>
      <View style={styles.grow} accessible accessibilityLabel={`Último registro: ${lastText}, ${day(metric.last.date)}`}>
        <AppText numeric variant="largeTitle">{lastText}</AppText>
        <AppText muted numeric variant="footnote">último registro · {day(metric.last.date)}</AppText>
      </View>
      {changeText !== null && metric.change !== null ? <>
        <View style={[styles.divider, stacked && styles.stackedDivider, { backgroundColor: colors.border }]} />
        <View style={styles.grow} accessible accessibilityLabel={`Cambio ${within}: ${spokenDifference(metric.change, metric.unit)}${metric.first ? `, desde ${formatValue(metric.first.value, metric.unit)} el ${day(metric.first.date)}` : ''}`}>
          <AppText numeric variant="title2">{changeText}</AppText>
          <AppText muted numeric variant="footnote">{since}</AppText>
        </View>
      </> : null}
    </View> : <AppText muted testID="body-invalid-summary">Esta lectura incluye registros no válidos. No mostramos cambio ni tendencia; revisá el registro original.</AppText>}
    {safeSummary && compareText ? <View style={[styles.reference, { borderColor: colors.border }]} testID="body-reference-summary" accessible
      accessibilityLabel={`Comparación con ${compareText}: ${metric.referenceChange === null ? 'sin cambio medible' : spokenDifference(metric.referenceChange, metric.unit)}, ${references}. El gráfico muestra solo el período elegido.`}>
      <AppText muted variant="footnote">Comparación · {compareText}</AppText>
      <AppText numeric variant="headline">{metric.referenceChange === null ? 'Sin cambio medible' : bodyDifference(metric.referenceChange, metric.unit)}</AppText>
      <AppText muted numeric variant="footnote">{references} en la referencia. Esta lectura no entrega sus puntos; el gráfico muestra solo el período elegido.</AppText>
    </View> : null}
    {safeSummary && count === 1 ? <>
      <AppText muted variant="footnote" testID="body-trend-single">Un solo registro {within}. Con dos o más vas a ver cómo cambió.</AppText>
      {widen}
    </> : safeSummary && count === 2 ? <AppText muted variant="footnote">Dos registros: muestran una diferencia, todavía con evidencia limitada.</AppText> : null}
    {bands.length ? <View style={styles.chips}><Chip kind="toggle" label="Etapas" selected={showStages} onPress={() => setShowStages(v => !v)} /></View> : null}
    {portada ? <PortadaPointNote point={portada.point} matched={portada.matched} reason="No hay en este período un pesaje con esa fecha y ese valor: no seleccionamos otro en su lugar." /> : null}
    <FittedChart testID="body-trend-chart" unit={metric.unit} mode="dots" connect range={chartRange}
      bands={showStages ? bands.map(b=>({start:b.start<chartRange.start?chartRange.start:b.start,end:b.end&&b.end<=chartRange.end?addDays(b.end,-1):chartRange.end,label:b.label})).filter(b=>b.start<=b.end) : []}
      selectedKey={point?.date ?? null} onSelect={date=>onSelect(date===selectedDate?null:date)} points={[...metric.observations].sort((a,b)=>a.date.localeCompare(b.date)).map(o=>({
        key:o.date,start:o.date,end:o.date,value:valid(o.value)?o.value:null,kind:valid(o.value)?'mark':'gap',
        text:`${formatBodyDate(o.date)}, ${formatValue(o.value,metric.unit)}${o.provenanceLabel?` · ${o.provenanceLabel}`:''}`,
      }))} />
    <View style={styles.section} testID="body-point-inspection">
      <View accessible accessibilityLiveRegion="polite" accessibilityLabel={point ? `${formatBodyDate(point.date)}, ${metric.label}, ${formatValue(point.value, metric.unit)}, ${provenance}${valid(point.value) ? '' : ', registro no válido'}` : 'Tocá un punto para consultar su fecha, valor y procedencia.'}>
        {point ? <>
          <AppText variant="headline">{formatBodyDate(point.date)}</AppText>
          <AppText numeric>{`${metric.label} · ${formatValue(point.value, metric.unit)}`}</AppText>
          <AppText muted variant="caption">{provenance}</AppText>
        </> : <AppText muted variant="footnote">Tocá un punto para ver su fecha y de dónde viene.</AppText>}
      </View>
      {point && !valid(point.value) ? <AppText muted variant="caption">Registro no válido como {metric.key === 'body.weight' ? 'peso corporal' : 'medida corporal'}. Podés corregirlo o borrarlo en el original.</AppText> : null}
      {selectedDate && !point ? <AppText muted variant="caption">No hay un registro corporal en esa fecha. Elegí un punto del gráfico para ver el original.</AppText> : null}
      {original ? <LinkRow label="Ver registro original" onPress={() => router.push(original)} /> : null}
      <AppText muted numeric variant="caption">{count} {count === 1 ? 'registro válido' : 'registros válidos'} en el período{invalid.length ? ` · ${invalid.length} no válido${invalid.length === 1 ? '' : 's'}` : ''}.</AppText>
    </View>
    {counted.length ? <AppText muted numeric variant="caption" testID="body-trend-zero">
      {counted.length === 1 ? `El pesaje del ${day(counted[0]!)} está en 0 kg` : `${counted.length} pesajes están en 0 kg`}: no es un peso corporal válido. Esta lectura antigua no permite mostrar su cambio ni tendencia.
    </AppText> : left.length ? <AppText muted numeric variant="caption" testID="body-trend-zero">
      {left.length === 1 ? `El pesaje del ${day(left[0]!)} está en 0 kg` : `${left.length} pesajes están en 0 kg`}: no es un peso, así que no cuenta en el gráfico ni en el cambio. Podés corregirlo o borrarlo en tus pesajes.
    </AppText> : null}
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
function Content({ data, selected, body, selectedDate, onSelect, portada }: { data: ProgressBody; selected: string | null; body: Body | null;
  selectedDate: string | null; onSelect: (date: string | null) => void; portada: { point: PortadaPoint; matched: boolean } | null }) {
  const router = useRouter();
  const { colors } = useOwnlevelTheme();
  const { fontScale } = useWindowDimensions();
  const [reading, setReading] = useState<'records' | 'weeks'>('records');
  const Selector = fontScale > 1.3 ? ChipGroup : ExerciseSegmented;
  const editable = !!body?.state.read.overview && body.state.read.status === 'ready' && body.state.phase === 'idle' && !body.state.intent && !body.state.editor;
  const metric = selected ? data.metrics.find(m => m.key === selected) : data.metrics.find(m => m.key === 'body.weight') ?? data.metrics[0];
  if (!metric) return <View style={styles.section}>
    <AppText muted>{selected ? 'Esta medida no está disponible en esta lectura.' : 'No hay pesos ni medidas válidos registrados con fecha en esta lectura.'}</AppText>
    {data.excludedSuspect > 0 ? <AppText muted>{data.excludedSuspect} mediciones sospechosas excluidas; los originales siguen en Cuerpo.</AppText> : null}
    {!selected ? <>
      <BodyRecordComparison metrics={data.metrics} today={data.today} />
      <BodyZones data={data} onRegister={body ? () => body.controller.openMeasurement() : undefined} disabled={!editable} />
      <LinkRow label="Explorar peso y medidas" onPress={() => router.push({ pathname: '/(tabs)/progress/trends/body', params: { metric: 'body.weight' } })} />
      <LinkRow label="Tu cuaderno · peso y medidas por fecha" onPress={() => router.push({ pathname: '/(tabs)/progress/trends/body', params: { section: 'journal' } })} />
    </> : null}
    {body?.state.read.overview ? <>
      <WeightRecords state={body.state} controller={body.controller} editable={body.state.phase === 'idle' && !body.state.intent && !body.state.editor} />
      <MeasurementRecords state={body.state} controller={body.controller} editable={body.state.phase === 'idle' && !body.state.intent && !body.state.editor} />
    </> : null}
  </View>;

  const field = recordField(metric.key);
  return <>
    {selected ? null : <Heading level={2}>{metric.label}</Heading>}
    <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Selected selectedDate={selectedDate} onSelect={onSelect} routeMetric={selected} metric={metric} portada={metric.key === 'body.weight' ? portada : null} excluded={data.excludedSuspect} storedZeros={metric.key === 'body.weight' ? (body?.state.read.weights ?? [])
      .filter(row => row.weightKg <= 0 && row.date >= data.period.start && row.date <= data.period.end).map(row => row.date) : []} /></View>
    {selected && (metric.key !== 'body.weight' || reading === 'records') ? <BodyTimelineContext range={data.period} metric={metric} selectedDate={selectedDate} onSelect={onSelect} /> : null}
    {selected ? <>
      <BodyRecordComparison key={metric.key} metrics={[metric]} today={data.today} />
    </> : null}
    {selected && metric.key === 'body.weight' ? <Selector accessibilityLabel="Leer registros de peso" value={reading} options={[{ label: 'Pesajes', value: 'records' }, { label: 'Semanas', value: 'weeks' }]} onChange={setReading} /> : null}
    {/* The weeks of the weights this read already brought: no other request. Body weight, never a lifted load. */}
    {selected && reading === 'weeks' && metric.key === 'body.weight' ? <WeeklyWeights observations={metric.observations} period={data.period} today={data.today} /> : null}
    {selected && (metric.key !== 'body.weight' || reading === 'records') && body?.state.read.overview ? <View style={styles.section} testID="body-trend-records">
      <AppText muted variant="footnote">{metric.key === 'body.weight' ? 'Tus pesajes · tocá uno para corregirlo' : 'Tus mediciones · tocá una para corregirla'}</AppText>
      {metric.key === 'body.weight' ? <WeightRecords state={body.state} controller={body.controller} editable={editable}  />
        : <MeasurementRecords state={body.state} controller={body.controller} editable={editable} field={field} />}

    </View> : null}
    {!selected ? <>
      {/* Opens the weight on its own: every weighing and its weeks. The measures are the zones right below. */}
      <LinkRow label="Ver tus pesajes y semanas" onPress={() => router.push({ pathname: '/(tabs)/progress/trends/body', params: { metric: 'body.weight' } })} />
      <BodyRecordComparison metrics={data.metrics} today={data.today} />
      <BodyZones data={data} onRegister={body ? () => body.controller.openMeasurement() : undefined} disabled={!editable} />
      <LinkRow label="Tu cuaderno · peso y medidas por fecha" onPress={() => router.push({ pathname: '/(tabs)/progress/trends/body', params: { section: 'journal' } })} />
    </> : null}

  </>;
}

/** Body atlas and per-measure exploration share the confirmed period read and the existing write controller. */
function BodyTrends() {
  const { client } = useMobileApi();
  const { session } = useMobileAuth();
  const { colors } = useOwnlevelTheme();
  const { query, compare } = useProgressRange();
  const params = useLocalSearchParams<{ metric?: string; registrar?: string; insightsReturn?: string; section?: string }>();
  const selected = typeof params.metric === 'string' && params.metric ? params.metric : null;
  const measuresOnly = params.section === 'measures' && !selected;
  const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressBody(c, query, signal, compare), [query, compare]);
  const readKey = progressRequestKey(query, compare);
  const { state, data, refresh } = useCachedRead(client, 'body', readKey, load);
  const visibleMetric = selected ?? (data?.metrics.find(m => m.key === 'body.weight') ?? data?.metrics[0])?.key ?? 'body.weight';
  const scope = `${readKey}|${selected ?? ''}|${visibleMetric}`;
  const point = usePortadaPoint();
  // `fromPortada`: the scope this screen opened with and nothing touched yet; anything else retires the portada point.
  const [inspection, setInspection] = useState({ client, owner: session?.user.id, scope, date: null as string | null, fromPortada: true });
  const sameScope = inspection.client === client && inspection.owner === session?.user.id && inspection.scope === scope;
  if (!sameScope) setInspection({ client, owner: session?.user.id, scope, date: null, fromPortada: false });
  const portadaPoint = sameScope && inspection.fromPortada && !selected ? point : null;
  // The spark shows the last weighing of its interval: the same observation here is the last valid one in those dates,
  // with that value. Nothing else is selected in its place.
  const weight = data?.metrics.find(m => m.key === 'body.weight');
  const last = portadaPoint && weight ? weight.observations.filter(o => o.value > 0 && o.date >= portadaPoint.start && o.date <= portadaPoint.end).at(-1) : undefined;
  const match = last && sameValue(last.value, portadaPoint!.value) ? last : undefined;
  const selectedDate = !sameScope ? null : match ? match.date : inspection.date;
  const onSelect = (date: string | null) => setInspection({ client, owner: session?.user.id, scope, date, fromPortada: false });
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
  const title = params.section === 'journal' && !selected ? 'Tu cuaderno' : measuresOnly ? 'Medidas' : selected ? BODY_CHOICES.find(m => m.key === selected)?.label ?? data?.metrics.find(m => m.key === selected)?.label ?? 'Cuerpo' : 'Cuerpo';
  const editable = !!body?.state.read.overview && body.state.read.status === 'ready' && body.state.phase === 'idle' && !body.state.intent && !body.state.editor;
  return <><ProgressScroll periodPickerTestID="body-period-picker" compactPeriod title={title} testID="body-trends-screen" refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing}
    onRefresh={() => { void refresh(); void body?.controller.load(); }} tintColor={colors.primary} />}>
    <ReturnToInsights />
    {selected && !isBodyChartMetric(selected) ? <AppText muted>La medida del enlace no es válida.</AppText> : null}
    {/* Insights reads the weight of a day: it says nothing about when you weighed in, before or after training. */}
    {params.insightsReturn === '1' ? <AppText muted variant="footnote" testID="body-from-insights">El peso de un día no dice si te pesaste antes o después de entrenar.</AppText> : null}
    {selected && isBodyChartMetric(selected) ? <BodyMetricPicker selected={selected} /> : null}
    {body ? <BodyStatus state={body.state} controller={body.controller} /> : null}
    {state.status === 'loading' ? <SkeletonBlock height={200} />
      : !data ? <UnavailableState title="No pudimos cargar Cuerpo" description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente." action={<Button label="Reintentar" onPress={() => void refresh()} />} />
      : <>
        {state.status !== 'ready' ? <InlineUnavailable actionLabel="Reintentar" message="No se pudo actualizar. Mostramos la última lectura confirmada." onAction={() => void refresh()} /> : null}
        {params.section === 'journal' && !selected ? <BodyJournal key={`${session?.user.id}|${readKey}`} data={data} /> : measuresOnly ? <BodyZones data={data} onRegister={body ? () => body.controller.openMeasurement() : undefined} disabled={!editable} /> : <Content key={`${session?.user.id}|${readKey}|${selected ?? ''}`} data={data} selected={selected} body={body} selectedDate={selectedDate} onSelect={onSelect} portada={portadaPoint ? { point: portadaPoint, matched: !!match } : null} />}
      </>}
    <View style={styles.fabRoom} />
  </ProgressScroll>
  {body ? <>
    <BodyAddMenu disabled={!editable} actions={[
      { key: 'weight', label: 'Registrar peso', icon: 'scale', onPress: () => openTodayWeight(body.state, body.controller) },
      { key: 'measurement', label: 'Registrar medidas', icon: 'ruler', onPress: () => body.controller.openMeasurement() },
    ]} />
    <BodyEditors state={body.state} controller={body.controller} initialField={selected ? recordField(selected) : undefined} />
  </> : null}</>;
}
/** A link can bring a period along (from Insights, the month of a day or the days of a relation). It applies before the first read. */
export function BodyTrendsScreen() {
  const applied = useProgressRouteRange();
  return applied ? <BodyTrends /> : <SkeletonBlock height={200} />;
}
const styles = StyleSheet.create({
  summaryCard: { padding: brandTokens.layout.cardPadding, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth },
  section: { gap: spacing.sm },
  numbers: { flexDirection: 'row', gap: spacing.lg },
  grow: { flex: 1, gap: 2 },
  divider: { width: StyleSheet.hairlineWidth },
  chips: { flexDirection: 'row' },
  chart: { marginTop: spacing.sm },
  chartScroll: { flexGrow: 1 },
  stackedNumbers: { flexDirection: 'column' },
  stackedDivider: { width: '100%', height: StyleSheet.hairlineWidth },
  reference: { gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  link: { minHeight: 44, justifyContent: 'center' },
  fabRoom: { height: 72 },
});
