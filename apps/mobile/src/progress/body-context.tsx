import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchNutritionReport } from '@/api/nutrition-report';
import { fetchProgressBody, fetchProgressExplore, fetchProgressMetrics, fetchProgressTraining, type ProgressBodyMetric } from '@/api/progress';
import { LinkRow, AppText, Heading, InlineUnavailable, SkeletonBlock, spacing } from '@/design-system';
import { fetchNutritionStages } from '@/api/nutrition-stages';
import { bodyWeekRange, bodyWeekReference, intervalStages } from './body-context-model';
import { OptionSheet } from './explore-sheets';
import { nutritionValue } from './nutrition-values';
import { FittedChart } from './fitted-chart';
import { formatBodyDate } from '@/body/body-model';
import { arrowDelta, formatValue } from './progress-format';
import { daysBetween, type DateRange } from './progress-range';
import { useProgressResource } from './use-progress-resource';
import { nutritionChartDayHref } from './nutrition-chart-navigation';
import { metricOriginalHref } from './metrics-chart-navigation';
import { isBodyChartMetric } from './body-chart-navigation';

const NUTRIENTS = [
  { key: 'nutrition.kcal', field: 'calories', label: 'Calorías', unit: 'kcal' },
  { key: 'nutrition.protein', field: 'protein', label: 'Proteína', unit: 'g' },
  { key: 'nutrition.carbs', field: 'carbs', label: 'Carbohidratos', unit: 'g' },
  { key: 'nutrition.fat', field: 'fat', label: 'Grasas', unit: 'g' },
] as const;
const CHOICES = [...NUTRIENTS.map(n => ({ key: n.key, label: n.label, detail: 'Alimentación registrada' })),
  { key: 'training.sets', label: 'Series', detail: 'Entrenamiento registrado' },
  { key: 'training.sessions', label: 'Sesiones', detail: 'Entrenamiento registrado' },
  { key: 'training.minutes', label: 'Duración', detail: 'Incluye descansos' }];
const queryFor = (range: DateRange) => ({ period: 'custom' as const, from: range.start, to: range.end });
const rangeKey = (range: DateRange) => `${range.start}|${range.end}`;
const amount = (value: number | null, unit: 'kcal' | 'g') => value === null ? 'Sin dato' : nutritionValue(value, unit);
const datesText = (range: DateRange) => `${formatBodyDate(range.start)} → ${formatBodyDate(range.end)}`;

function ReadNotice({ loading, unavailable, retained, retry }: { loading: boolean; unavailable: boolean; retained: boolean; retry: () => void }) {
  if (loading) return <SkeletonBlock height={100} />;
  if (!unavailable) return null;
  return <InlineUnavailable message={retained ? 'No se pudo actualizar. Mostramos la última lectura confirmada.' : 'No pudimos consultar este contexto. No significa que no haya registros.'} actionLabel="Reintentar" onAction={retry} />;
}
function ContextPicker({ range, selected, onPick, onClose, interval = false }: { range: DateRange; selected: string; onPick: (key: string) => void; onClose: () => void; interval?: boolean }) {
  const { client } = useMobileApi();
  const { start, end } = range;
  const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressMetrics(c, queryFor({ start, end }), null, signal), [start, end]);
  const { state, data, refresh } = useProgressResource(client, `body-context-choices|${rangeKey(range)}`, load);
  return <OptionSheet title="Qué querés mirar junto al cuerpo" selected={selected} onPick={onPick} onClose={onClose}
    options={[...(interval ? [{ key: 'nutrition.kcal', label: 'Alimentación', detail: 'Calorías, proteína, carbohidratos y grasas' }, { key: 'training.sets', label: 'Entrenamiento', detail: 'Sesiones, series, duración y grupos musculares' }] : CHOICES), ...(data?.definitions ?? []).map(d => ({ key: `metric.${d.id}`, label: d.name, detail: `Tu métrica${d.unit && d.unit !== d.name.toLowerCase() ? ` · ${d.unit}` : ''}${d.isActive ? '' : ' · archivada'}` }))]}>
    <ReadNotice loading={state.status === 'loading'} unavailable={state.status !== 'ready' && state.status !== 'loading'} retained={!!data} retry={() => void refresh()} />
    {data && !data.definitions.length ? <AppText muted variant="footnote">No hay métricas personales disponibles.</AppText> : null}
  </OptionSheet>;
}
function ContextStages({ range }: { range: DateRange }) {
  const { client } = useMobileApi();
  const { state, data: list, refresh } = useProgressResource(client, 'body-context-stages', fetchNutritionStages);
  const items = list ? intervalStages(list, range) : [];
  return <View style={styles.section} testID="body-context-stages">
    <AppText variant="headline">Etapas del intervalo</AppText>
    <ReadNotice loading={state.status === 'loading'} unavailable={state.status !== 'ready' && state.status !== 'loading'} retained={!!list} retry={() => void refresh()} />
    {!list ? null : !items.length ? <AppText muted variant="footnote">Sin etapas registradas en estas fechas.</AppText>
      : items.map(s => <View key={s.id}><AppText>{s.name}</AppText><AppText muted numeric variant="caption">{datesText(s)}</AppText></View>)}
  </View>;
}
type ChartProps = { selectedDate: string | null; onSelect: (date: string) => void; bodyMetric: string };
const bodyOrigin = (chart: ChartProps) => ({ fromProgressBody: '1', fromProgressBodyMetric: isBodyChartMetric(chart.bodyMetric) ? chart.bodyMetric : 'body.weight' });
function NutritionContext({ range, choice, chart }: { range: DateRange; choice: string; chart?: ChartProps }) {
  const { client } = useMobileApi(), router = useRouter();
  const { start, end } = range;
  const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchNutritionReport(c, queryFor({ start, end }), signal), [start, end]);
  const { state, data, refresh } = useProgressResource(client, `body-context-nutrition|${rangeKey(range)}`, load);
  const nutrient = NUTRIENTS.find(n => n.key === choice) ?? NUTRIENTS[0];
  const selected = data?.days.find(d => d.date === chart?.selectedDate), point = selected?.nutrients[nutrient.field];
  return <View style={styles.section}>
    <ReadNotice loading={state.status === 'loading'} unavailable={state.status !== 'ready' && state.status !== 'loading'} retained={!!data} retry={() => void refresh()} />
    {data ? <>
      {data.range.notice ? <AppText muted variant="footnote">{data.range.notice}</AppText> : null}
      <AppText muted numeric variant="footnote">{data.coverage.registeredDays} de {data.range.days} días con comidas registradas.</AppText>
      <View style={styles.grid}>{(chart ? [nutrient] : NUTRIENTS).map(n => { const stat = data.summary.metrics[n.field]; return <View key={n.key} style={[styles.figure, styles.cell]}>
        <AppText muted variant="footnote">{chart ? 'Promedio del período' : n.label}</AppText><AppText numeric variant="title2">{amount(stat.value, n.unit)}</AppText>
        {stat.denominator < data.coverage.finalizedDays || stat.partialDays ? <AppText muted numeric variant="caption">{stat.denominator} de {data.coverage.finalizedDays} días{stat.partialDays ? ` · ${stat.partialDays} ${stat.partialDays === 1 ? 'parcial' : 'parciales'}` : ''}</AppText> : null}
      </View>; })}</View>
      <AppText muted variant="caption">Promedio por día cerrado con dato. Suma lo que registraste, que puede no ser todo lo que comiste.</AppText>
      {!chart && (data.summary.metrics.targetCalories.value !== null || data.summary.metrics.targetProtein.value !== null) ? <AppText muted numeric variant="caption">Tu objetivo promedio en esas fechas: {[
        data.summary.metrics.targetCalories.value !== null ? `${amount(data.summary.metrics.targetCalories.value, 'kcal')}${data.summary.metrics.targetCalories.denominator < data.coverage.finalizedDays ? ` (${data.summary.metrics.targetCalories.denominator} días)` : ''}` : null,
        data.summary.metrics.targetProtein.value !== null ? `${amount(data.summary.metrics.targetProtein.value, 'g')} de proteína${data.summary.metrics.targetProtein.denominator < data.coverage.finalizedDays ? ` (${data.summary.metrics.targetProtein.denominator} días)` : ''}` : null,
      ].filter(Boolean).join(' y ')}.</AppText> : null}
      {chart ? <>
        <FittedChart testID="body-context-chart" label={`${nutrient.label} registradas`} range={range} mode="bars" unit={nutrient.unit} selectedKey={chart.selectedDate} onSelect={chart.onSelect}
          points={data.days.slice().reverse().map(d => ({ key: d.date, start: d.date, end: d.date, value: d.nutrients[nutrient.field].value,
            soft: d.isToday, partial: d.nutrients[nutrient.field].status === 'partial', text: `${formatBodyDate(d.date)}, ${nutrient.label}, ${formatValue(d.nutrients[nutrient.field].value, nutrient.unit)}${d.isToday ? ', hoy en curso' : ''}${d.nutrients[nutrient.field].status === 'partial' ? ', suma parcial entre comidas registradas' : ''}` }))} />
        {chart.selectedDate ? <View accessibilityLiveRegion="polite"><AppText numeric variant="headline">{formatBodyDate(chart.selectedDate)}</AppText>
          <AppText numeric>{point?.value !== null && point?.value !== undefined ? amount(point.value, nutrient.unit) : 'Sin dato de este nutriente en esta fecha'}</AppText>
          {selected?.isToday ? <AppText muted variant="caption">Hoy en curso; no entra en el promedio.</AppText> : null}
          {point ? <AppText muted numeric variant="caption">{point.knownMeals} comidas con dato · {point.missingMeals} sin ese dato.</AppText> : null}
          {selected?.hasNutrition ? <LinkRow label="Ver comidas de esa fecha" onPress={() => { const href = nutritionChartDayHref(selected.date); if (href) router.push({ ...href, params: { ...href.params, ...bodyOrigin(chart) } }); }} /> : null}
        </View> : null}
      </> : null}
    </> : null}
  </View>;
}
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
function TrainingContext({ range }: { range: DateRange }) {
  const { client } = useMobileApi();
  const { start, end } = range;
  const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressTraining(c, queryFor({ start, end }), signal), [start, end]);
  const { state, data, refresh } = useProgressResource(client, `body-context-training|${rangeKey(range)}`, load);
  return <View style={styles.section}>
    <ReadNotice loading={state.status === 'loading'} unavailable={state.status !== 'ready' && state.status !== 'loading'} retained={!!data} retry={() => void refresh()} />
    {data ? <>
      <AppText numeric variant="headline">{count(data.summary.sessions, 'sesión', 'sesiones')} · {count(data.summary.sets, 'serie', 'series')} · {formatValue(data.summary.minutes, null, 'duration')}</AppText>
      <AppText muted variant="caption">La duración incluye los descansos.</AppText>
      <AppText variant="headline">Series por grupo muscular</AppText>
      {data.muscles.map(m => <View key={m.key} style={styles.muscle}><AppText>{m.label}</AppText><AppText numeric>{count(m.sets, 'serie', 'series')}</AppText></View>)}
      {!data.muscles.length ? <AppText muted variant="footnote">Sin series asignadas a grupos en estas fechas.</AppText> : null}
      <AppText muted variant="caption">Cada ejercicio suma a un solo grupo. El contorno de pecho incluye la espalda; no hay medida de hombros.</AppText>
    </> : null}
  </View>;
}
function ExploreContext({ range, choice, chart }: { range: DateRange; choice: string; chart?: ChartProps }) {
  const { client } = useMobileApi(), router = useRouter();
  const series = !!chart;
  const { start, end } = range;
  const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressExplore(c, queryFor({ start, end }), { measure: choice, breakdown: null, days: null, series }, signal), [start, end, choice, series]);
  const { state, data, refresh } = useProgressResource(client, `body-context-explore|${rangeKey(range)}|${choice}|${series}`, load);
  const current = data?.current;
  const bucket = current?.series?.find(b => chart?.selectedDate && b.start <= chart.selectedDate && b.end >= chart.selectedDate);
  const value = (v: number | null) => formatValue(v, data?.measure.valueType === 'duration' ? null : data?.measure.unit ?? null, data?.measure.valueType);
  return <View style={styles.section}>
    <ReadNotice loading={state.status === 'loading'} unavailable={state.status !== 'ready' && state.status !== 'loading'} retained={!!data} retry={() => void refresh()} />
    {data && current ? <>
      <AppText variant="headline">{data.measure.label}</AppText><AppText numeric variant="title2">{value(current.value)}</AppText>
      <AppText muted numeric variant="caption">{data.measure.aggregation === 'sum' ? 'Total registrado' : 'Promedio por día con dato'} · {current.coverage.days} de {current.coverage.eligible} días con dato.</AppText>
      {chart && current.series ? <>
        <FittedChart testID="body-context-chart" label={data.measure.label} points={current.series.map(b => ({ key: b.start, start: b.start, end: b.end, value: b.value, soft: b.start <= data.today && b.end >= data.today, text: `${datesText(b)}, ${value(b.value)}${b.start <= data.today && b.end >= data.today ? ', intervalo en curso' : ''}` }))}
          range={range} unit={data.measure.unit ?? undefined} mode="bars" selectedKey={bucket?.start ?? null} onSelect={chart.onSelect} />
        {chart.selectedDate ? <View accessibilityLiveRegion="polite"><AppText muted numeric>{bucket ? datesText(bucket) : formatBodyDate(chart.selectedDate)}</AppText>
          <AppText numeric>{bucket ? value(bucket.value) : 'Sin dato en esta fecha'}</AppText>
          {bucket && bucket.start <= data.today && bucket.end >= data.today ? <AppText muted variant="caption">Intervalo en curso.</AppText> : null}
          {bucket && bucket.start !== bucket.end ? <AppText muted variant="caption">Dato del intervalo completo, no de un único día.</AppText> : null}
          {bucket && choice.startsWith('metric.') ? <LinkRow label="Ver registros de la métrica" onPress={() => { const href = metricOriginalHref(choice.slice(7), bucket.start, bucket.end); if (href) router.push({ ...href, params: { ...href.params, ...bodyOrigin(chart) } }); }} /> : null}
        </View> : null}
      </> : null}
    </> : null}
  </View>;
}
/** Context has an exact local range, never changes the shared A/B selection. */
export function BodyIntervalContext({ range }: { range: DateRange | null }) {
  const [choice, setChoice] = useState('nutrition.kcal'), [picker, setPicker] = useState(false);
  return <View style={styles.section} testID="body-interval-context">
    <Heading level={2}>Qué registraste entre esas fechas</Heading>
    {!range ? <AppText muted>No hay días intermedios para resumir contexto.</AppText> : <>
      <AppText muted numeric variant="footnote">{datesText(range)} · {daysBetween(range.start, range.end)} días.</AppText>
      <AppText muted variant="caption">Excluimos los días de ambas mediciones porque no conocemos su hora.</AppText>
      <LinkRow label="Mirar" value={choice.startsWith('training.') ? 'Entrenamiento' : choice.startsWith('nutrition.') ? 'Alimentación' : 'Tu métrica'} onPress={() => setPicker(true)} />
      {choice.startsWith('nutrition.') ? <NutritionContext range={range} choice={choice} /> : choice.startsWith('training.') ? <TrainingContext range={range} /> : <ExploreContext range={range} choice={choice} />}
      <ContextStages range={range} />
      <AppText muted variant="caption">Estos registros acompañan el cambio observado; no explican su causa.</AppText>
      {picker ? <ContextPicker interval range={range} selected={choice} onPick={setChoice} onClose={() => setPicker(false)} /> : null}
    </>}
  </View>;
}
export function BodyTimelineContext({ range, metric, selectedDate, onSelect }: { range: DateRange; metric: ProgressBodyMetric; selectedDate: string | null; onSelect: (date: string | null) => void }) {
  const [open, setOpen] = useState(false), [choice, setChoice] = useState('nutrition.kcal'), [picker, setPicker] = useState(false);
  const chart = { selectedDate, onSelect: (date: string) => onSelect(date), bodyMetric: metric.key };
  const point = metric.observations.find(o => o.date === selectedDate);
  return <View style={styles.section} testID="body-timeline-context">
    <LinkRow kind="disclosure" expanded={open} label="Ver junto a comida, métricas o entrenamiento" onPress={() => setOpen(v => !v)} />
    {open ? <>
      <Heading level={2}>En las mismas fechas</Heading>
      <LinkRow label="Mirar" value={CHOICES.find(c => c.key === choice)?.label ?? 'Tu métrica'} onPress={() => setPicker(true)} />
      {selectedDate ? <AppText muted numeric variant="footnote">{metric.label} · {formatBodyDate(selectedDate)}: {point ? formatValue(point.value, metric.unit) : 'sin registro corporal en esta fecha'}</AppText> : null}
      {choice.startsWith('nutrition.') ? <NutritionContext range={range} choice={choice} chart={chart} /> : <ExploreContext range={range} choice={choice} chart={chart} />}
      <AppText muted variant="caption">Mismo período, escalas distintas. Mirarlos juntos no demuestra una relación causal.</AppText>
      {picker ? <ContextPicker range={range} selected={choice} onPick={setChoice} onClose={() => setPicker(false)} /> : null}
    </> : null}
  </View>;
}
function WeeklyReferenceRead({ a, b, today }: { a: string; b: string; today: string }) {
  const { client } = useMobileApi();
  const firstRange = bodyWeekRange(a), lastRange = bodyWeekRange(b);
  const load = useCallback(async (c: NonNullable<typeof client>, signal: AbortSignal) => {
    const [first, last] = await Promise.all([fetchProgressBody(c, queryFor(bodyWeekRange(a)), signal), fetchProgressBody(c, queryFor(bodyWeekRange(b)), signal)]);
    if (first.status !== 'ok') return first;
    if (last.status !== 'ok') return last;
    return { ...first, data: { first: bodyWeekReference(first.data.metrics.find(m => m.key === 'body.weight'), a, today), last: bodyWeekReference(last.data.metrics.find(m => m.key === 'body.weight'), b, today) } };
  }, [a, b, today]);
  const { state, data, refresh } = useProgressResource(client, `body-context-weeks|${firstRange.start}|${lastRange.start}`, load);
  const change = data?.first?.median !== null && data?.first?.median !== undefined && data?.last?.median !== null && data?.last?.median !== undefined ? data.last.median - data.first.median : null;
  return <View style={styles.section}>
    <ReadNotice loading={state.status === 'loading'} unavailable={state.status !== 'ready' && state.status !== 'loading'} retained={!!data} retry={() => void refresh()} />
    {data ? <>
      {[{ range: firstRange, week: data.first }, { range: lastRange, week: data.last }].map(({ range, week }) => <View key={range.start}>
        <AppText muted numeric variant="footnote">{datesText(range)}</AppText><AppText numeric>{week?.median !== null && week?.median !== undefined ? formatValue(week.median, 'kg') : 'Sin mediana suficiente'} · {week?.weighIns.length ?? 0} pesajes válidos</AppText>
      </View>)}
      {change !== null ? <AppText numeric variant="headline">{Math.abs(change) < 1e-9 ? '= 0 kg' : arrowDelta(change, 'kg')} entre medianas semanales</AppText> : <AppText muted variant="caption">Necesitás al menos tres pesajes válidos en cada semana.</AppText>}
    </> : null}
    <AppText muted variant="caption">Referencia de semanas completas, que pueden salir del intervalo. No es el peso exacto del día de la medición.</AppText>
  </View>;
}
export function WeeklyWeightReference({ a, b, today }: { a: string; b: string; today: string }) {
  const [open, setOpen] = useState(false);
  const first = bodyWeekRange(a), last = bodyWeekRange(b);
  const eligible = first.start !== last.start && last.end < today && first.end < today;
  return <View style={styles.section}>
    <LinkRow kind="disclosure" expanded={open} label="Peso semanal de referencia" onPress={() => setOpen(v => !v)} />
    {open ? eligible ? <WeeklyReferenceRead a={a} b={b} today={today} /> : <AppText muted variant="footnote">La referencia necesita dos semanas distintas, completas y cerradas. La semana en curso no cuenta.</AppText> : null}
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: spacing.sm }, figure: { gap: spacing.xs, paddingVertical: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md }, cell: { flexGrow: 1, flexBasis: '45%', minWidth: 140 },
  muscle: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: spacing.md, paddingVertical: spacing.xs },
});
