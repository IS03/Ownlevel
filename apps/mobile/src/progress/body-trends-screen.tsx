import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, ScrollView, View } from 'react-native';
import { haptics } from '@/platform/haptics';
import { BodyEditors, BodyStatus, MeasurementRecords, WeightRecords, openTodayWeight, useMeasurementEntry, useWeightEntry } from '@/body/body-screen';
import { useBodyController } from '@/body/use-body-controller';
import { useMobileAuth } from '@/auth';
import { BODY_MEASUREMENT_FIELDS, type BodyMeasurementField } from '@/api/body';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { fetchProgressBody, progressRequestKey, type ProgressBody, type ProgressBodyMetric } from '@/api/progress';
import { LinkRow, AppIcon, AppSheet, AppText, Button, Chip, GlassSurface, Heading, InlineUnavailable, SegmentedControl, SkeletonBlock, UnavailableState, brandTokens, pressedStyle, radius, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { useNutritionStages } from '@/stages/stages-provider';
import { chartBands } from './stages-model';
import { FittedChart } from './fitted-chart';
import { BODY_CHOICES, BodyJournal, BodyRecordComparison, BodyZones } from './body-atlas';
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
import { MIN_WEEKLY_WEIGH_INS } from '../../../../src/lib/progress/body-evolution/weekly';
import { SHORT_BODY_INTERVAL_DAYS } from './body-context-model';
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
    <FittedChart testID="body-trend-chart" unit={metric.unit} mode="dots" connect showScale={false} showExtrema range={chartRange}
      bands={showStages ? bands.map(b=>({start:b.start<chartRange.start?chartRange.start:b.start,end:b.end&&b.end<=chartRange.end?addDays(b.end,-1):chartRange.end,label:b.label})).filter(b=>b.start<=b.end) : []}
      selectedKey={point?.date ?? null} onSelect={date=>onSelect(date===selectedDate?null:date)} points={[...metric.observations].sort((a,b)=>a.date.localeCompare(b.date)).map(o=>({
        key:o.date,start:o.date,end:o.date,value:valid(o.value)?o.value:null,kind:valid(o.value)?'mark':'gap',
        text:`${formatBodyDate(o.date)}, ${formatValue(o.value,metric.unit)}${o.provenanceLabel?` · ${o.provenanceLabel}`:''}`,
      }))} />
    <View style={styles.section} testID="body-point-inspection">
      <View accessible accessibilityLiveRegion="polite" accessibilityLabel={point ? `${formatBodyDate(point.date)}, ${metric.label}, ${formatValue(point.value, metric.unit)}, ${provenance}${valid(point.value) ? '' : ', registro no válido'}` : undefined}>
        {point ? <>
          <AppText variant="headline">{formatBodyDate(point.date)}</AppText>
          <AppText numeric>{`${metric.label} · ${formatValue(point.value, metric.unit)}`}</AppText>
          <AppText muted variant="caption">{provenance}</AppText>
        </> : null}
      </View>
      {point && !valid(point.value) ? <AppText muted variant="caption">Registro no válido como {metric.key === 'body.weight' ? 'peso corporal' : 'medida corporal'}. Podés corregirlo o borrarlo en el original.</AppText> : null}
      {selectedDate && !point ? <AppText muted variant="caption">No hay un registro corporal en esa fecha. Elegí un punto del gráfico para ver el original.</AppText> : null}
      {original ? <LinkRow label="Ver registro original" onPress={() => router.push(original)} /> : null}

    </View>
    {counted.length ? <AppText muted numeric variant="caption" testID="body-trend-zero">
      {counted.length === 1 ? `El pesaje del ${day(counted[0]!)} está en 0 kg` : `${counted.length} pesajes están en 0 kg`}: no es un peso corporal válido. Esta lectura antigua no permite mostrar su cambio ni tendencia.
    </AppText> : left.length ? <AppText muted numeric variant="caption" testID="body-trend-zero">
      {left.length === 1 ? `El pesaje del ${day(left[0]!)} está en 0 kg` : `${left.length} pesajes están en 0 kg`}: no es un peso, así que no cuenta en el gráfico ni en el cambio. Podés corregirlo o borrarlo en tus pesajes.
    </AppText> : null}
    <AppText muted numeric variant="caption">
      {count} {metric.key === 'body.weight' ? count === 1 ? 'pesaje' : 'pesajes' : count === 1 ? 'medición' : 'mediciones'}{invalid.length ? ` válidos · ${invalid.length} no válido${invalid.length === 1 ? '' : 's'}` : ''}{trendNote ? ` · ${metric.trend === 'variable' && metric.confidence !== 'limited' ? 'sin dirección clara' : trendNote.replace(/\.$/, '')}` : ''}
    </AppText>
    {excluded > 0 ? <AppText muted numeric variant="caption">{excluded} {excluded === 1 ? 'medición sospechosa excluida; podés corregirla' : 'mediciones sospechosas excluidas; podés corregirlas'} en Cuerpo.</AppText> : null}
  </View>;
}

/** "body.arm_right" → "armRightCm": the record field behind a measure of this screen (none for the weight). */
function recordField(key: string): BodyMeasurementField | undefined {
  const field = `${key.replace(/^body\./, '').replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}Cm`;
  return (BODY_MEASUREMENT_FIELDS as readonly string[]).includes(field) ? field as BodyMeasurementField : undefined;
}

type Body = NonNullable<ReturnType<typeof useBodyController>>;
type BodyTab = 'weight' | 'measures';
const TAB_OPTIONS = [{ label: 'Peso', value: 'weight' }, { label: 'Medidas', value: 'measures' }] as const;
const RECORD_OPTIONS = [{ label: 'Pesajes', value: 'records' }, { label: 'Semanas', value: 'weeks' }] as const;
const BODY_ROUTE = '/(tabs)/progress/trends/body' as const;
// A session can change accounts without restarting the app. Never use a previous owner's choice.
const lastBodyTab = new WeakMap<MobileApiClient, { owner: string; tab: BodyTab }>();

function BodyMethod({ weight }: { weight: boolean }) {
  const [open, setOpen] = useState(false);
  const { colors } = useOwnlevelTheme();
  return <>
    <LinkRow label="Cómo se calcula" onPress={() => setOpen(true)} />
    {open ? <AppSheet onClose={() => setOpen(false)} testID="body-method" closeLabel="Cerrar cómo se calcula" style={{ backgroundColor: colors.background, maxHeight: '85%' }}>
      <ScrollView contentContainerStyle={styles.method}>
        <Heading level={2}>Cómo se calcula</Heading>
        <AppText variant="headline">Gráfico</AppText>
        <AppText muted>Solo usamos los registros válidos de cada fecha. Cuando comparás períodos, el gráfico muestra únicamente los puntos del período elegido.</AppText>
        <AppText variant="headline">Ver junto a…</AppText>
        <AppText muted>Las comidas se promedian por día cerrado con dato. Suma lo que registraste, que puede no ser todo lo que comiste. Mismo período, escalas distintas. Mirarlos juntos no demuestra una relación causal.</AppText>
        <AppText variant="headline">Comparar dos registros</AppText>
        <AppText muted>Cada valor es el de esa fecha: no completamos huecos con registros anteriores. Con menos de {SHORT_BODY_INTERVAL_DAYS} días, la diferencia describe esas dos fechas.</AppText>
        {weight ? <AppText muted>El cambio equivalente por semana es la diferencia repartida según la cantidad de días entre pesajes.</AppText> : <AppText muted>Una medida puede variar algunos milímetros según cómo te medís. El contorno no separa músculo de grasa.</AppText>}
        <AppText variant="headline">Qué registraste entre esas fechas</AppText>
        <AppText muted>Excluimos los días de ambas mediciones porque no conocemos su hora. Estos registros acompañan el cambio observado y no explican su causa.</AppText>
        <AppText muted>La duración del entrenamiento incluye descansos. Cada ejercicio suma a un solo grupo. El contorno de pecho incluye la espalda. No hay medida de hombros.</AppText>
        {weight ? <>
          <AppText variant="headline">Pesajes por semana</AppText>
          <AppText muted>Tomamos semanas completas de lunes a domingo, con al menos {MIN_WEEKLY_WEIGH_INS} pesajes para calcular la mediana. El cambio se calcula solo entre semanas seguidas. La semana en curso queda fuera.</AppText>
        </> : null}
      </ScrollView>
    </AppSheet> : null}
  </>;
}

function Content({ data, selected, body, editable, selectedDate, onSelect, portada }: { data: ProgressBody; selected: string | null; body: Body | null;
  editable: boolean; selectedDate: string | null; onSelect: (date: string | null) => void; portada: { point: PortadaPoint; matched: boolean } | null }) {
  const { colors } = useOwnlevelTheme();
  const [reading, setReading] = useState<'records' | 'weeks'>('records');
  const key = selected ?? 'body.weight';
  const weight = key === 'body.weight';
  const metric = data.metrics.find(m => m.key === key);
  const field = recordField(key);
  const showRecords = !weight || reading === 'records' || !metric;
  return <>
    {metric ? <>
      <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Selected selectedDate={selectedDate} onSelect={onSelect} routeMetric={selected} metric={metric} portada={portada} excluded={data.excludedSuspect} storedZeros={weight ? (body?.state.read.weights ?? [])
          .filter(row => row.weightKg <= 0 && row.date >= data.period.start && row.date <= data.period.end).map(row => row.date) : []} />
      </View>
      <BodyTimelineContext range={data.period} metric={metric} selectedDate={selectedDate} onSelect={onSelect} />
      {weight ? <BodyRecordComparison metrics={[metric]} today={data.today} /> : null}
      {weight ? <SegmentedControl accessibilityLabel="Leer registros de peso" value={reading} options={RECORD_OPTIONS} onChange={setReading} /> : null}
      {!showRecords ? <WeeklyWeights observations={metric.observations} period={data.period} today={data.today} compactMethod /> : null}
    </> : <AppText muted>{selected ? 'Esta medida no está disponible en esta lectura.' : 'No hay pesos válidos registrados con fecha en esta lectura.'}</AppText>}
    {showRecords && body?.state.read.overview ? <View style={styles.section} testID="body-trend-records">
      {weight ? <WeightRecords state={body.state} controller={body.controller} editable={editable} /> : field
        ? <MeasurementRecords state={body.state} controller={body.controller} editable={editable} field={field} /> : null}
    </View> : null}
  </>;
}

/** Body atlas and per-measure exploration share the confirmed period read and the existing write controller. */
function BodyTrends() {
  const { client } = useMobileApi();
  const router = useRouter();
  const reduced = useReduceMotion();
  const { session } = useMobileAuth();
  const { colors } = useOwnlevelTheme();
  const { query, compare } = useProgressRange();
  const params = useLocalSearchParams<{ metric?: string; registrar?: string; insightsReturn?: string; section?: string; fromBodyMeasures?: string }>();
  const point = usePortadaPoint();
  const owner = session?.user.id ?? 'anonymous';
  const selected = params.metric === 'body.weight' || isBodyChartMetric(params.metric) ? params.metric : null;
  const detail = selected && selected !== 'body.weight' ? selected : null;
  const journal = params.section === 'journal' && !selected;
  const routeTab = detail || params.registrar === 'medidas' || params.section === 'measures' ? 'measures'
    : selected || params.registrar === 'peso' || point ? 'weight' : null;
  const remembered = client ? lastBodyTab.get(client) : undefined;
  const initialTab = routeTab ?? (remembered?.owner === owner ? remembered.tab : 'weight');
  const [selection, setSelection] = useState<{ owner: string; client: typeof client; routeTab: BodyTab | null; tab: BodyTab }>({ owner, client, routeTab, tab: initialTab });
  const accountChanged = selection.owner !== owner || selection.client !== client;
  const tab = accountChanged ? initialTab : routeTab && routeTab !== selection.routeTab ? routeTab : selection.tab;
  if (accountChanged || selection.routeTab !== routeTab) setSelection({ owner, client, routeTab, tab });
  const switchTab = (next: BodyTab) => {
    haptics.selection();
    if (client) lastBodyTab.set(client, { owner, tab: next });
    setSelection({ owner, client, routeTab, tab: next });
  };
  const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressBody(c, query, signal, compare), [query, compare]);
  const readKey = progressRequestKey(query, compare);
  const { state, data, refresh } = useCachedRead(client, 'body', readKey, load);
  const scope = `${readKey}|${journal ? 'journal' : detail ?? tab}`;
  // `fromPortada`: the scope this screen opened with and nothing touched yet; anything else retires the portada point.
  const [inspection, setInspection] = useState({ client, owner: session?.user.id, scope, date: null as string | null, fromPortada: true });
  const sameScope = inspection.client === client && inspection.owner === session?.user.id && inspection.scope === scope;
  if (!sameScope) setInspection({ client, owner: session?.user.id, scope, date: null, fromPortada: false });
  const portadaPoint = sameScope && inspection.fromPortada && tab === 'weight' && !detail && !journal ? point : null;
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
  const title = journal ? 'Tu cuaderno' : detail ? BODY_CHOICES.find(m => m.key === detail)?.label ?? 'Cuerpo' : 'Cuerpo';
  const editable = !!body?.state.read.overview && body.state.read.status === 'ready' && body.state.phase === 'idle' && !body.state.intent && !body.state.editor;
  const measure = tab === 'measures' || !!detail;
  const register = () => {
    if (!body || !editable) return;
    haptics.selection();
    if (measure) body.controller.openMeasurement();
    else openTodayWeight(body.state, body.controller);
  };
  const backToMeasures = detail ? () => {
    if (params.fromBodyMeasures === '1' && router.canGoBack()) router.back();
    else router.replace({ pathname: BODY_ROUTE, params: { section: 'measures' } });
  } : undefined;
  return <><ProgressScroll periodPickerTestID="body-period-picker" compactPeriod title={title} testID="body-trends-screen" onBack={backToMeasures}
    bottomDock={body && !journal ? <Pressable accessibilityRole="button" accessibilityLabel={measure ? 'Registrar medidas' : 'Registrar peso'}
      testID="body-add-menu" disabled={!editable} onPress={register}
      style={({ pressed }) => [pressedStyle(pressed, reduced), !editable && styles.addDisabled]}>
      <GlassSurface interactive tint={colors.brandSubtle} style={styles.add}>
        <AppIcon name="plus" color={colors.primary} />
      </GlassSurface>
    </Pressable> : null}
    refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing}
      onRefresh={() => { void refresh(); void body?.controller.load(); }} tintColor={colors.primary} />}>
    <ReturnToInsights />
    {params.metric && !isBodyChartMetric(params.metric) ? <AppText muted>La medida del enlace no es válida.</AppText> : null}
    {params.insightsReturn === '1' ? <AppText muted variant="footnote" testID="body-from-insights">El peso de un día no dice si te pesaste antes o después de entrenar.</AppText> : null}
    {!detail && !journal ? <SegmentedControl accessibilityLabel="Qué querés ver en Cuerpo" value={tab} options={TAB_OPTIONS} onChange={switchTab} /> : null}
    {body ? <BodyStatus state={body.state} controller={body.controller} /> : null}
    {state.status === 'loading' ? <SkeletonBlock height={200} />
      : !data ? <UnavailableState title="No pudimos cargar Cuerpo" description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente." action={<Button label="Reintentar" onPress={() => void refresh()} />} />
      : <>
        {state.status !== 'ready' ? <InlineUnavailable actionLabel="Reintentar" message="No se pudo actualizar. Mostramos la última lectura confirmada." onAction={() => void refresh()} /> : null}
        {journal ? <BodyJournal key={`${owner}|${readKey}`} data={data} /> : <>
          {tab === 'measures' && !detail ? <>
            <BodyZones data={data} onRegister={body ? register : undefined} disabled={!editable} />
            <BodyRecordComparison key={`${owner}|${readKey}|measures`} metrics={data.metrics.filter(m => m.key !== 'body.weight')} today={data.today} />
          </> : <Content key={`${owner}|${scope}`} data={data} selected={selected} body={body} editable={editable} selectedDate={selectedDate} onSelect={onSelect} portada={portadaPoint ? { point: portadaPoint, matched: !!match } : null} />}
          {!detail ? <LinkRow label="Tu cuaderno" onPress={() => router.push({ pathname: BODY_ROUTE, params: { section: 'journal' } })} /> : null}
          <BodyMethod key={scope} weight={!measure} />
        </>}
      </>}
  </ProgressScroll>
  {body ? <BodyEditors state={body.state} controller={body.controller} initialField={detail ? recordField(detail) : undefined} /> : null}</>;

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
  method: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  add: { width: brandTokens.layout.buttonHeight, height: brandTokens.layout.buttonHeight, borderRadius: radius.tabBar, justifyContent: 'center', alignItems: 'center' },
  addDisabled: { opacity: 0.4 },
});
