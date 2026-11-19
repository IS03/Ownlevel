import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchProgressOverview, progressRequestKey, type MetricValueType, type ProgressComparison, type ProgressDestination, type ProgressOverview } from '@/api/progress';
import { useCachedRead } from '@/api/use-cached-read';
import { AppIcon, AppText, Button, ChipGroup, GlassSurface, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, atmosphere, brandTokens, glowGradient, pressedStyle, radius, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { CompareSheet } from './period-sheets';
import { ComparisonChart } from './comparison-chart';
import { ProgressScroll } from './progress-scroll';
import { ProgressReadStatus } from './progress-read-status';
import { ProgressRow } from './progress-row';
import { useProgressRange } from './progress-range-context';
import { daysBetween, progressRange, shortRange } from './progress-range';
import { arrowDelta, comparisonText, coverageText, formatValue } from './progress-format';
import { nutritionValue } from './nutrition-values';
import { destinationRoute } from './progress-destination';

const TOPICS = [{ value: 'all', label: 'Resumen' }, { value: 'training', label: 'Entrenamiento' }, { value: 'body', label: 'Cuerpo' }, { value: 'nutrition', label: 'Nutrición' }, { value: 'metrics', label: 'Métricas' }] as const;
type Topic = typeof TOPICS[number]['value'];
type ViewState = { topic: Topic; points: Record<string, string | null>; more: boolean; scroll: number };
const countUnit = (n: number | null, unit: string | null) => Math.abs(n ?? 0) === 1 ? unit === 'sesiones' ? 'sesión' : unit === 'series' ? 'serie' : unit : unit;
const initialView = (): ViewState => ({ topic: 'all', points: {}, more: false, scroll: 0 });

/** Only confirmed server comparisons supply differences; no local scoring or inferred recommendations. */
function Pair({ label, comparison, current, previous, unit, type = 'decimal', detail, onBand = false }: {
  label: string; comparison?: ProgressComparison; current?: number | null; previous?: number | null; unit: string | null; type?: MetricValueType; detail?: string; onBand?: boolean;
}) {
  const { fontScale, width } = useWindowDimensions(), { colors, isDark } = useOwnlevelTheme();
  const mutedColor = onBand ? atmosphere[isDark ? 'dark' : 'light'].bandTextMuted ?? colors.textMuted : colors.textMuted;
  const a = comparison?.current ?? current ?? null, b = comparison?.previous ?? previous ?? null;
  const value = (n: number | null) => unit === 'kcal' || unit === 'g' ? nutritionValue(n, unit) : formatValue(n, countUnit(n, unit), type);
  let difference: string | null = null;
  if (comparison) {
    const delta = comparison.deltaAbsolute;
    difference = comparison.status !== 'comparable' || delta === null
      ? comparisonText(comparison, unit, type, 'la referencia elegida')
      : comparison.change === 'stable' ? 'Estable frente a la referencia'
      : delta !== 0 && (unit === 'kcal' || unit === 'g')
        ? `${delta > 0 ? '↗' : '↘'} ${nutritionValue(Math.abs(delta), unit)}`
        : arrowDelta(delta, countUnit(delta, unit), type);
  }
  return <View style={styles.pairBlock}>
    <AppText muted variant="subheadline" style={{color: mutedColor}}>{label}</AppText>
    <View style={[styles.pair, (fontScale > 1.3 || width < 375) && styles.stacked]}>
      <View style={styles.figure}><AppText muted variant="caption" style={{color: mutedColor}}>Referencia</AppText><AppText numeric variant="title2" style={{ color: mutedColor }}>{value(b)}</AppText></View>
      <View style={styles.figure}><AppText muted variant="caption" style={{color: mutedColor}}>Período elegido</AppText><AppText numeric variant="title2">{value(a)}</AppText></View>
    </View>
    {difference ? <AppText muted numeric variant="footnote" style={{color: mutedColor}}>{difference}</AppText> : null}
    {detail ? <AppText muted variant="footnote">{detail}</AppText> : null}
  </View>;
}

export function PeriodComparisonContent({ data, view, onView, onOpen }: { data: ProgressOverview; view: ViewState; onView: (next: ViewState) => void; onOpen: (destination: ProgressDestination) => void }) {
  const { state, today, compare } = useProgressRange(), { colors, isDark } = useOwnlevelTheme(), reduced = useReduceMotion();
  const current = progressRange(state, today);
  const { topic, more, points } = view;
  const point = (chart: string) => ({ selection: points[chart] ?? null, onSelect: (key: string | null) => onView({ ...view, points: { ...points, [chart]: key } }) });
  if (!compare) return null;
  const t = data.training.status === 'ok' ? data.training.data : null;
  const n = data.nutrition.status === 'ok' ? data.nutrition.data : null;
  const metrics = data.metrics.status === 'ok' ? data.metrics.data.items : null;
  const w = data.body.status === 'ok' ? data.sparks?.weight : null;
  const show = (key: Topic) => topic === 'all' || topic === key;
  const missing = [
    { topic: 'training', text: !t ? 'Entrenamiento: lectura no disponible.' : null },
    { topic: 'body', text: data.body.status !== 'ok' ? 'Cuerpo: lectura no disponible.' : !w ? 'Peso: resumen no disponible. Abrí Cuerpo para ver los registros.' : w.last === null || w.referenceLast === null ? 'Peso: faltan registros en alguno de los períodos.' : null },
    { topic: 'nutrition', text: !n ? 'Nutrición: lectura no disponible.' : n.calories.status !== 'comparable' ? `Calorías: ${comparisonText(n.calories, 'kcal')}` : null },
    { topic: 'nutrition', text: n && n.protein.status !== 'comparable' ? `Proteína: ${comparisonText(n.protein, 'g')}` : null },
    { topic: 'metrics', text: metrics === null ? 'Métricas: lectura no disponible.' : !metrics.length ? 'Métricas: sin datos en el período elegido.' : null },
    ...(metrics ?? []).filter(m => m.comparison.status !== 'comparable').map(m => ({ topic: 'metrics', text: `${m.name}: ${comparisonText(m.comparison, m.unit, m.valueType)}` })),
  ].filter(item => (topic === 'all' || topic === item.topic) && item.text).map(item => item.text!);
  const areaHeader = (label: string, destination: ProgressDestination) => <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${label.toLocaleLowerCase('es-AR')} con estos períodos`} onPress={() => { haptics.selection(); onOpen(destination); }}
    style={({ pressed }) => [styles.areaHeader, pressedStyle(pressed, reduced)]}><Heading level={2} style={styles.grow}>{label}</Heading><AppIcon name="chevronRight" color={colors.textMuted} /></Pressable>;
  return <Animated.View key={topic} entering={FadeIn.duration(brandTokens.motion.duration.fast)} layout={reduced ? undefined : LinearTransition.duration(brandTokens.motion.duration.fast)} style={styles.content} testID="period-comparison-content">
    {topic === 'all' && data.changes.length ? <View style={styles.content} testID="comparison-changes">
      <Heading level={2}>Qué cambió</Heading>
      {data.changes.slice(0, 3).map(change => <ProgressRow key={change.id} label={`${change.label}. ${change.description}`} onPress={() => onOpen(change.destination)}>
        <View style={styles.grow}><AppText variant="headline">{change.label}</AppText><AppText muted numeric variant="footnote">{change.description}</AppText></View>
      </ProgressRow>)}
    </View> : null}
    {show('training') ? <View style={styles.area} testID="comparison-training">
      {areaHeader('Entrenamiento', { kind: 'training' })}
      {t ? <>
        <View style={[styles.band, { backgroundColor: colors.surfaceRaised, experimental_backgroundImage: glowGradient(atmosphere[isDark ? 'dark' : 'light'].band) }]}>
          <Pair onBand label="Sesiones registradas" current={t.sessions} comparison={t.comparisons.sessions} unit="sesiones" type="integer" />
          <Pair onBand label="Tiempo, con descansos" current={t.minutes} comparison={t.comparisons.minutes} unit={null} type="duration" />
        </View>
        <Pair label="Series completadas" current={t.sets} comparison={t.comparisons.sets} unit="series" type="integer" />
        {data.sparks?.training ? <ComparisonChart key={`training:${current.start}:${current.end}:${compare.start}:${compare.end}`} spark={data.sparks.training} current={current} reference={compare} mode="bars" unit="series" {...point('training')} testID="comparison-training-chart" /> : null}
        <AppText muted variant="footnote">Actividad registrada; no mide ganancia muscular ni fuerza.</AppText>
      </> : <AppText muted>No pudimos leer Entrenamiento.</AppText>}
    </View> : null}
    {show('body') ? <View style={styles.area} testID="comparison-body">
      {areaHeader('Cuerpo', { kind: 'body' })}
      {data.body.status === 'ok' ? <>
        <Pair label="Último peso registrado en cada período" current={w?.last} previous={w?.referenceLast} unit="kg" detail="Son registros de fechas distintas, no promedios ni una tendencia." />
        {w ? <ComparisonChart key={`weight:${current.start}:${current.end}:${compare.start}:${compare.end}`} spark={w} current={current} reference={compare} mode="dots" unit="kg" {...point('weight')} testID="comparison-weight-chart" /> : null}
        <Button variant="quiet" label="Ver peso y medidas" onPress={() => onOpen({ kind: 'body' })} />
      </> : <AppText muted>No pudimos leer Cuerpo.</AppText>}
    </View> : null}
    {show('nutrition') ? <View style={styles.area} testID="comparison-nutrition">
      {areaHeader('Nutrición', { kind: 'nutrition' })}
      {n ? <>
        <Pair label="Calorías registradas · promedio diario" current={n.averageKcal} comparison={n.calories} unit="kcal" type="integer" />
        {data.sparks?.nutrition ? <ComparisonChart key={`nutrition:${current.start}:${current.end}:${compare.start}:${compare.end}`} spark={data.sparks.nutrition} current={current} reference={compare} mode="bars" unit="kcal" {...point('nutrition')} testID="comparison-nutrition-chart" /> : null}
        <Pair label="Proteína registrada · promedio diario" current={n.averageProteinG} comparison={n.protein} unit="g" />
        <AppText muted numeric variant="footnote">Período elegido: {n.registeredDays} de {n.days} días con alimentación registrada. Los promedios excluyen hoy y pueden usar distintos días.</AppText>
        <Button variant="quiet" label="Ver nutrición y cobertura" onPress={() => onOpen({ kind: 'nutrition' })} />
      </> : <AppText muted>No pudimos leer Nutrición.</AppText>}
    </View> : null}
    {show('metrics') ? <View style={styles.area} testID="comparison-metrics">
      <Heading level={2}>Métricas personales</Heading>
      {metrics === null ? <AppText muted>No pudimos leer tus métricas.</AppText> : !metrics.length ? <AppText muted>Sin métricas con datos en el período elegido.</AppText> : metrics.filter(m => m.comparison.status === 'comparable').map(m => <View key={m.id}>
        <Pair label={m.name} comparison={m.comparison} unit={m.unit} type={m.valueType} detail={`Período elegido: ${coverageText(m.coverage)}. Cada período usa sus propios días con dato.`} />
        <Button variant="quiet" label={`Ver ${m.name.toLocaleLowerCase('es-AR')}`} onPress={() => onOpen({ kind: 'metrics', metricId: m.id })} />
      </View>)}
    </View> : null}
    {missing.length ? <View style={[styles.area, { borderColor: colors.border }]}>
      <Pressable testID="comparison-missing-toggle" accessibilityRole="button" accessibilityLabel="Datos que faltan o no se pueden comparar" accessibilityState={{expanded: more}}
        onPress={() => { haptics.selection(); onView({ ...view, more: !more }); }} style={styles.areaHeader}>
        <AppText variant="headline" style={styles.grow}>Para completar la comparación</AppText><AppText numeric muted variant="footnote">{missing.length}</AppText><AppIcon name={more ? 'close' : 'chevronDown'} color={colors.textMuted} />
      </Pressable>
      {more ? <View style={styles.content}>{missing.map(item => <AppText key={item} muted variant="footnote">{item}</AppText>)}
        {(show('metrics') ? metrics ?? [] : []).filter(m => m.comparison.status !== 'comparable').map(m => <Button key={m.id} variant="quiet" label={`Ver ${m.name.toLocaleLowerCase('es-AR')}`} onPress={() => onOpen({ kind: 'metrics', metricId: m.id })} />)}
      </View> : null}
    </View> : null}
  </Animated.View>;
}

function ComparisonReading({ view, onView }: { view: ViewState; onView: (next: ViewState) => void }) {
  const { client } = useMobileApi(), router = useRouter(), { query, compare, state: rangeState, today, setState } = useProgressRange();
  const { colors } = useOwnlevelTheme(), { fontScale, width } = useWindowDimensions();
  const [editing, setEditing] = useState(false);
  const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressOverview(c, query, signal, compare), [query, compare]);
  const { state, data, refresh } = useCachedRead(compare ? client : null, 'overview', progressRequestKey(query, compare), load);
  const current = progressRange(rangeState, today);
  const open = (destination: ProgressDestination) => { const route = destinationRoute(destination); router.push({ pathname: route.pathname, params: route.extra }); };
  return <>
    <ProgressScroll title="Comparar períodos" testID="period-comparison" periodControls={false} initialScrollPosition={view.scroll} onScrollPosition={scroll => onView({ ...view, scroll })} refreshControl={compare ? <RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} /> : undefined}>
      <View style={styles.content}>
        <Pressable testID="comparison-edit-dates" accessibilityRole="button" accessibilityLabel="Editar períodos de comparación" onPress={() => { haptics.selection(); setEditing(true); }}>
          <GlassSurface interactive style={[styles.dates, (fontScale > 1.3 || width < 375) && styles.stacked]}>
            <View style={styles.figure}><AppText muted variant="caption">Referencia</AppText><AppText numeric variant="headline">{compare ? shortRange(compare, today) : 'Elegí un período'}</AppText>{compare ? <AppText muted numeric variant="caption">{daysBetween(compare.start, compare.end)} días</AppText> : null}</View>
            <AppIcon name="compare" color={colors.textMuted} />
            <View style={styles.figure}><AppText variant="caption" style={{ color: colors.primary }}>Período elegido</AppText><AppText numeric variant="headline">{shortRange(current, today)}</AppText><AppText muted numeric variant="caption">{daysBetween(current.start, current.end)} días{current.end === today ? ' · en curso' : ''}</AppText></View>
          </GlassSurface>
        </Pressable>
        {compare ? <>
          {daysBetween(current.start, current.end) !== daysBetween(compare.start, compare.end) ? <AppText muted variant="footnote">Distinta duración: los totales no son equivalentes. Los promedios conservan sus días utilizados.</AppText> : null}
          {current.start <= compare.end && compare.start <= current.end ? <AppText muted variant="footnote">Los períodos se superponen.</AppText> : null}
          <ChipGroup accessibilityLabel="Tema de la comparación" options={[...TOPICS]} value={view.topic} onChange={next => { haptics.selection(); onView({ ...view, topic: next }); }} />
          <ProgressReadStatus state={state} />
          {data ? <>{state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Conservamos la última lectura confirmada de estos períodos." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}<PeriodComparisonContent data={data} view={view} onView={onView} onOpen={open} /></>
            : state.status === 'loading' ? <SkeletonBlock height={240} /> : <UnavailableState title="No pudimos leer la comparación" description="Tus registros siguen guardados." action={<Button label="Reintentar" onPress={() => void refresh()} />} />}
          <Button variant="quiet" label="Quitar comparación" onPress={() => { haptics.selection(); setState({ ...rangeState, compare: { kind: 'none' } }); }} />
        </> : <Button label="Elegir períodos" icon="calendar" onPress={() => setEditing(true)} />}
      </View>
    </ProgressScroll>
    {editing ? <CompareSheet onClose={() => setEditing(false)} /> : null}
  </>;
}

/** Hidden routes do not re-read when a detail changes the shared range. Account-scoped cache restores the result on return. */
export function PeriodComparisonScreen() {
  const [focused, setFocused] = useState(false);
  const { client } = useMobileApi(), { query, compare } = useProgressRange();
  const key = progressRequestKey(query, compare);
  const [local, setLocal] = useState(() => ({ client, key, view: initialView() }));
  const current = local.client === client && local.key === key;
  if (!current) setLocal({ client, key, view: initialView() });
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  return focused ? <ComparisonReading key={key} view={current ? local.view : initialView()} onView={view => setLocal({ client, key, view })} /> : null;
}
const styles = StyleSheet.create({
  content: { gap: spacing.xl }, grow: { flex: 1 }, dates: { padding: spacing.md, borderRadius: radius.card, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pair: { flexDirection: 'row', gap: spacing.lg }, stacked: { flexDirection: 'column', alignItems: 'stretch' }, figure: { flex: 1, gap: spacing.xs },
  pairBlock: { gap: spacing.xs }, area: { gap: spacing.md, paddingVertical: spacing.sm }, areaHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: brandTokens.layout.minTouch },
  band: { padding: brandTokens.layout.cardPadding, borderRadius: radius.card, gap: spacing.lg },
});
