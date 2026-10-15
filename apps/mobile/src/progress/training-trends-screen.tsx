import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchProgressTraining, progressRequestKey, type ProgressQuery, type ProgressTraining, type ProgressTrainingExercise } from '@/api/progress';
import { AppIcon, AppText, Button, Heading, InlineUnavailable, PressableSurface, SkeletonBlock, Surface, UnavailableState, spacing, useOwnlevelTheme } from '@/design-system';
import { displayNutritionDate } from '@/nutrition/day-format';
import { ProgressScroll } from './progress-scroll';
import { useProgressRange } from './progress-range-context';
import { formatValue } from './progress-format';
import { TrainingSummaryCard } from './training-summary';
import { useProgressResource } from './use-progress-resource';
import { ValueBars } from './value-bars';

type SeriesMetric = 'sessions' | 'sets' | 'minutes';
const SERIES_LABELS: Record<SeriesMetric, string> = { sessions: 'Sesiones', sets: 'Series', minutes: 'Duración' };
export const STATUS_LABELS: Record<ProgressTrainingExercise['status'], string> = { improved: 'Mejoró', stable: 'Estable', declined: 'Bajó', insufficient_data: 'Sin comparación' };
export const REASON_LABELS: Record<string, string> = {
  new_exercise: 'No se hizo en el período anterior.', not_trained_in_primary: 'No se hizo en este período.',
  different_weight_mode: 'Cambió el modo de carga entre períodos.', missing_weight_mode: 'Falta el modo de carga.',
  unsupported_weight_mode: 'Este modo de carga no tiene una comparación confiable.', incomplete_sets: 'Faltan series comparables.',
  ambiguous_evidence: 'Sin cambio claro.',
};
const fmt = (n: number, d = 1) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: d }).format(n);

function ExerciseRow({ item, onPress }: { item: ProgressTrainingExercise; onPress: () => void }) {
  const { colors } = useOwnlevelTheme();
  const tone = item.status === 'improved' ? colors.primary : item.status === 'declined' ? colors.text : colors.textMuted;
  return <View testID={`training-exercise-${item.id}`}><PressableSurface accessibilityLabel={`${item.name}: ${STATUS_LABELS[item.status]}`} onPress={onPress} style={styles.row}>
    <View style={styles.flex}>
      <AppText variant="label">{item.name}{item.isPersonalRecord ? ' · PR' : ''}</AppText>
      <AppText variant="caption" style={{ color: tone }}>{STATUS_LABELS[item.status]}{item.signal && item.status !== 'stable' ? ` · ${item.signal.description}` : ''}</AppText>
      {item.status === 'insufficient_data' ? <AppText muted variant="caption">{REASON_LABELS[item.reason] ?? 'Datos insuficientes.'}</AppText> : null}
      <AppText muted variant="caption">{item.weightMode ?? 'Sin modo de carga'} · {item.sessions} sesiones · {item.sets} series</AppText>
    </View>
    <AppIcon color={colors.textMuted} name="chevronRight" size={14} />
  </PressableSurface></View>;
}

function Content({ data, query }: { data: ProgressTraining; query: ProgressQuery }) {
  const router = useRouter();
  const [metric, setMetric] = useState<SeriesMetric>('sessions');
  const { compareOn } = useProgressRange();
  const trained = data.exercises.filter(e => e.sessions > 0), previousOnly = compareOn ? data.exercises.filter(e => e.sessions === 0) : [];
  const openExercise = (id: string) => router.push({ pathname: '/(tabs)/progress/trends/exercise/[id]', params: { id } });
  const value = (p: ProgressTraining['series'][number]) => p[metric];
  return <>
    <Surface><TrainingSummaryCard summary={data.summary} /></Surface>
    <AppText muted variant="caption">La duración va del inicio al fin de cada sesión e incluye descansos.</AppText>
    <Surface style={styles.section}>
      <Heading level={2}>Evolución</Heading>
      <View style={styles.wrap}>{(Object.keys(SERIES_LABELS) as SeriesMetric[]).map(k => <Button key={k} label={SERIES_LABELS[k]} variant={metric === k ? 'primary' : 'secondary'} onPress={() => setMetric(k)} />)}</View>
      <AppText muted variant="caption">{data.period.bucket === 'day' ? 'Por día.' : data.period.bucket === 'week' ? 'Por semana.' : 'Por mes.'} Sin entrenamiento = 0.</AppText>
      <ValueBars testID="training-chart" bars={data.series.map(p => ({ key: p.start, label: p.start === p.end ? displayNutritionDate(p.start) : `${displayNutritionDate(p.start)} — ${displayNutritionDate(p.end)}`,
        value: value(p), text: metric === 'minutes' ? formatValue(p.minutes, null, 'duration') : `${value(p)} ${metric === 'sessions' ? 'sesiones' : 'series'}`,
        ...(p.start === p.end && p.sessions > 0 ? { onPress: () => router.push({ pathname: '/history/day/[date]', params: { date: p.start } }), accessibilityHint: 'Abre el día en Historial' } : {}) }))} />
    </Surface>
    <View style={styles.section} testID="training-performance">
      <Heading level={2}>Rendimiento por ejercicio</Heading>
      <AppText muted variant="caption">Cada ejercicio se compara con el período anterior según su modo de carga. Sin estimaciones de 1RM.</AppText>
      {trained.length ? trained.map(e => <ExerciseRow key={e.id} item={e} onPress={() => openExercise(e.id)} />) : <Surface><AppText muted>Sin ejercicios completados en este período.</AppText></Surface>}
      {previousOnly.length ? <AppText muted variant="caption">Sólo en el período anterior: {previousOnly.map(e => e.name).join(', ')}.</AppText> : null}
    </View>
    <Surface style={styles.section} testID="training-prs">
      <Heading level={2}>Récords en el período</Heading>
      <AppText muted variant="caption">Superan todo tu historial anterior en el mismo modo de carga.</AppText>
      {data.personalRecords.length ? data.personalRecords.map(pr => <AppText key={pr.exerciseId}>{pr.name}: {pr.description}</AppText>) : <AppText muted>Sin récords nuevos en este período.</AppText>}
    </Surface>
    <Surface style={styles.section} testID="training-feelings">
      <Heading level={2}>Sensaciones</Heading>
      {data.feelings.length ? data.feelings.map(f => <AppText key={f.key} >
        {f.label} promedio: {fmt(f.average)}/{f.scaleMaximum} · {f.registered} de {f.eligible} sesiones{f.ratio < 0.5 ? ' · pocas sesiones con registro' : ''}</AppText>)
        : <AppText muted>Sin sensaciones suficientes registradas en este período.</AppText>}
    </Surface>
    {trained.length ? <Surface style={styles.section} testID="training-frequency">
      <Heading level={2}>Frecuencia de ejercicios</Heading>
      {[...trained].sort((a, b) => b.sessions - a.sessions).slice(0, 8).map(e => <AppText key={e.id}>{e.name}: {e.sessions} sesiones · última {e.lastDate ? displayNutritionDate(e.lastDate) : '—'}</AppText>)}
    </Surface> : null}
    {data.muscles.length ? <Surface style={styles.section} testID="training-muscles">
      <Heading level={2}>Series por grupo muscular</Heading>
      {data.muscles.map(m => <AppText key={m.key}>{m.label}: {m.sets} series · {m.sessions} sesiones · {m.exercises} ejercicios</AppText>)}
    </Surface> : null}
    {data.routines.length ? <Surface style={styles.section} testID="training-routines">
      <Heading level={2}>Uso de rutinas</Heading>
      {data.routines.map(r => <AppText key={r.id}>{r.name}: {r.sessions} sesiones · {r.sets} series · {formatValue(r.minutes, null, 'duration')}</AppText>)}
    </Surface> : null}
  </>;
}

/** Tendencias de Entrenamiento (M7.2): reliable load metrics + per-exercise performance. Never a global volume. */
export function TrainingTrendsScreen() {
  const router = useRouter();
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const { query, compare } = useProgressRange();
  const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressTraining(c, query, signal, compare), [query, compare]);
  const { state, data, refresh } = useProgressResource(client, progressRequestKey(query, compare), load);
  return <ProgressScroll title="Entrenamiento" testID="training-trends-screen" refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}>
    {state.status === 'loading' ? <SkeletonBlock height={200} />
      : !data ? <UnavailableState title="No pudimos cargar Entrenamiento" description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente." action={<Button label="Reintentar" onPress={() => void refresh()} />} />
      : <>
        {state.status !== 'ready' ? <Surface><InlineUnavailable actionLabel="Reintentar" message="No se pudo actualizar. Mostramos la última lectura confirmada." onAction={() => void refresh()} /></Surface> : null}
        <Content data={data} query={query} />
      </>}
    <Button label="Abrir historial de entrenamiento" variant="secondary" onPress={() => router.push('/(tabs)/train/history')} />
  </ProgressScroll>;
}
const styles = StyleSheet.create({ section: { gap: spacing.sm }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, flex: { flex: 1, gap: 2 } });
