import { useCallback } from 'react';
import { RefreshControl, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchProgressTrainingExercise, progressRequestKey, type ProgressTrainingExerciseDetail } from '@/api/progress';
import { AppText, Button, Heading, InlineUnavailable, SkeletonBlock, Surface, UnavailableState, spacing, useOwnlevelTheme } from '@/design-system';
import { displayNutritionDate } from '@/nutrition/day-format';
import { ProgressScroll } from './progress-scroll';
import { useComparisonText, useProgressRange } from './progress-range-context';
import { REASON_LABELS, STATUS_LABELS } from './training-trends-screen';
import { useProgressResource } from './use-progress-resource';
import { ValueBars } from './value-bars';

const fmt = (n: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n);
const CHART_TITLES = { load: 'Mejor carga por sesión', reps: 'Más repeticiones por sesión', time: 'Mejor tiempo por sesión' } as const;
const setText = (s: { reps: number | null; weightKg: number | null }) => `${s.reps ?? '—'}${s.weightKg ? ` × ${fmt(s.weightKg)}` : ''}`;

function Content({ data }: { data: ProgressTrainingExerciseDetail }) {
  const router = useRouter();
  const compare = useComparisonText();
  const p = data.performance;
  return <>
    <Surface style={styles.section} testID="exercise-trend-summary">
      <Heading level={2}>{data.exercise.name}</Heading>
      <AppText muted variant="caption">{data.exercise.muscleLabel} · {data.exercise.weightMode ?? 'Sin modo de carga'}</AppText>
      <AppText variant="label">{STATUS_LABELS[p.status]}{p.isPersonalRecord ? ' · Récord en el período' : ''}</AppText>
      {p.signal && p.status !== 'insufficient_data' ? <AppText>{p.signal.description}</AppText> : null}
      {p.status === 'insufficient_data' ? <AppText muted>{REASON_LABELS[p.reason] ?? 'Datos insuficientes.'}</AppText> : null}
      <AppText muted variant="caption">{p.primarySamples} series comparables en este período · {p.referenceSamples} en el anterior</AppText>
      {compare(data.comparisons.sessions, 'sesiones', 'integer') ? <AppText muted variant="caption">Sesiones: {compare(data.comparisons.sessions, 'sesiones', 'integer')}</AppText> : null}
      {compare(data.comparisons.sets, 'series', 'integer') ? <AppText muted variant="caption">Series: {compare(data.comparisons.sets, 'series', 'integer')}</AppText> : null}
    </Surface>
    {data.marks.length ? <Surface style={styles.section} testID="exercise-trend-marks">
      <Heading level={2}>Mejores marcas (historial completo)</Heading>
      {data.marks.map(m => <AppText key={m.kind}>{m.label}: {fmt(m.value)} {m.unit}{m.context ? ` · ${m.context}` : ''} · {displayNutritionDate(m.date)}</AppText>)}
    </Surface> : null}
    <Surface style={styles.section}>
      <Heading level={2}>{data.chart ? CHART_TITLES[data.chart.kind] : 'Evolución'}</Heading>
      {!data.chart ? <AppText muted>Este modo de carga no tiene una métrica de rendimiento comparable. Revisá las sesiones abajo.</AppText>
        : data.chart.points.length === 0 ? <AppText muted>Sin sesiones de este ejercicio en el período.</AppText>
        : <ValueBars testID="exercise-trend-chart" bars={data.chart.points.map(pt => ({ key: `${pt.sessionId}`, label: displayNutritionDate(pt.date), value: pt.value,
          text: `${fmt(pt.value)} ${data.chart!.unit}${pt.context !== null ? ` × ${pt.context} reps` : ''}`, accessibilityHint: 'Abre la sesión',
          onPress: () => router.push({ pathname: '/(tabs)/train/history/[id]', params: { id: pt.sessionId } }) }))} />}
      {data.chart && data.chart.points.length === 1 ? <AppText muted variant="caption">Una sola sesión: no alcanza para una tendencia.</AppText> : null}
    </Surface>
    <Surface style={styles.section} testID="exercise-trend-sessions">
      <Heading level={2}>Sesiones del período</Heading>
      {data.sessions.length ? data.sessions.map(s => <Button key={s.sessionId} variant="quiet" label={`${displayNutritionDate(s.date)} · ${s.routineName} · ${s.sets.map(setText).join(', ')}`}
        onPress={() => router.push({ pathname: '/(tabs)/train/history/[id]', params: { id: s.sessionId } })} />) : <AppText muted>Sin sesiones en este período.</AppText>}
    </Surface>
  </>;
}

/** Exercise analytics (M7.2): reuses the Web exercise read model; drilldowns open the existing Training surfaces. */
export function ExerciseTrendsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; period?: string; from?: string; to?: string }>();
  const id = String(params.id ?? '');
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const { query, compare } = useProgressRange();
  const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressTrainingExercise(c, query, id, signal, compare), [query, id, compare]);
  const { state, data, refresh } = useProgressResource(client, `${progressRequestKey(query, compare)}|${id}`, load);
  const notFound = state.status === 'unavailable' && state.result.meta.httpStatus === 404;
  return <ProgressScroll title="Ejercicio" testID="exercise-trends-screen" refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}>
    {state.status === 'loading' ? <SkeletonBlock height={200} />
      : !data ? notFound ? <Surface><AppText muted>No hay registros completados de este ejercicio.</AppText></Surface>
        : <UnavailableState title="No pudimos cargar el ejercicio" description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente." action={<Button label="Reintentar" onPress={() => void refresh()} />} />
      : <>
        {state.status !== 'ready' ? <Surface><InlineUnavailable actionLabel="Reintentar" message="No se pudo actualizar. Mostramos la última lectura confirmada." onAction={() => void refresh()} /></Surface> : null}
        <Content data={data} />
      </>}
    <Button label="Abrir historial del ejercicio" variant="secondary" onPress={() => router.push({ pathname: '/(tabs)/train/history/exercise/[id]', params: { id } })} />
  </ProgressScroll>;
}
const styles = StyleSheet.create({ section: { gap: spacing.sm } });
