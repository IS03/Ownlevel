import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import type { MobileApiClient } from '@/api/client';
import { useMobileApi } from '@/api';
import { useCachedRead } from '@/api/use-cached-read';
import { fetchTrainingTimes, trainingTimesKey, type ProgressTrainingTimes, type TrainingTimeMetric, type TrainingTimeSelection, type TrainingTimeSession } from '@/api/training-times';
import { progressQueryParams, type ProgressQuery } from '@/api/progress';
import { AppSheet, AppText, Button, GlassSurface, Heading, InlineUnavailable, LinkRow, ListRow, SkeletonBlock, brandTokens, radius, spacing, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { ProgressScroll } from './progress-scroll';
import { useProgressRange } from './progress-range-context';
import { TrainingTimesChart } from './training-times-chart';
import { comparableTimes, TIME_METRICS, timeAt, timeMetricCount, timeMetricLabel, timeMetricText, timeNumber, timeRange } from './training-times-model';

const initialSelection = (): TrainingTimeSelection => ({ routine: null, execution: null, bin: null, offset: 0 });
const BAND_LABELS = ['Madrugada', 'Mañana', 'Tarde', 'Noche'];
const executionLabel = (e: ProgressTrainingTimes['executions'][number]) => `${e.implement} · ${e.mode} · ${e.configuration === 'not_applicable' ? 'Sin variante' : e.configuration.replace(/^recorded:/, '')}`;

export function TrainingTimesScreen() {
  const { query } = useProgressRange();
  // Changing the shared period clears filters that may no longer exist, never showing another period's reading.
  return <TimingReader key={progressQueryParams(query)} query={query} />;
}

function TimingReader({ query }: { query: ProgressQuery }) {
  const { client } = useMobileApi(), router = useRouter();
  const { fontScale } = useWindowDimensions();
  const [selection, setSelection] = useState(initialSelection), [metric, setMetric] = useState<TrainingTimeMetric>('sessions');
  const [sheet, setSheet] = useState<'metric' | 'routine' | 'execution' | 'method' | null>(null);
  const load = useCallback((api: MobileApiClient, signal: AbortSignal) => fetchTrainingTimes(api, query, selection, signal), [query, selection]);
  const { data: currentData, state, refresh } = useCachedRead(client, 'training', trainingTimesKey(query, selection), load);
  const [prior, retain] = useState<{ client: MobileApiClient | null; data: ProgressTrainingTimes } | null>(null);
  // Inspecting another time keeps the chart in place. Only its session page waits; filters/account changes never reuse it.
  const data = currentData ?? (prior?.client === client && prior.data.selection.routine === selection.routine && prior.data.selection.execution === selection.execution ? prior.data : undefined);
  const pageReady = !!currentData;
  const setFilter = (patch: Partial<TrainingTimeSelection>) => { haptics.selection(); if (data) retain({ client, data }); setSelection(old => ({ ...old, ...patch, offset: patch.offset ?? 0 })); };
  const chooseMetric = (next: TrainingTimeMetric) => { haptics.selection(); setMetric(next); setSheet(next === 'load' && !selection.execution ? 'execution' : null); };
  const reset = () => { retain(null); setSelection(initialSelection()); setMetric('sessions'); setSheet(null); };
  const shell = (children: React.ReactNode) => <ProgressScroll title="Tus horarios" testID="training-times-screen" comparisonControls={false}
    refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} />}>{children}</ProgressScroll>;
  if (!data) return shell(<>
    {state.status === 'loading' ? <><SkeletonBlock height={64} /><SkeletonBlock height={180} /><SkeletonBlock height={180} /></> : <InlineUnavailable message="No pudimos traer tus horarios." actionLabel="Reintentar" onAction={() => void refresh()} />}
    {selection.routine !== null || selection.execution !== null ? <Button label="Quitar filtros" variant="quiet" onPress={reset} /> : null}
  </>);
  const execution = data.executions.find(e => e.key === selection.execution), unit = execution?.unit;
  const group = selection.bin === null ? data.total : data.bins[selection.bin]!;
  const unknown = data.coverage.sessions - data.coverage.timed;
  const openSession = (row: TrainingTimeSession) => router.push({ pathname: '/(tabs)/progress/training-session/[id]', params: { id: row.id } });
  return shell(<>
    {state.status === 'unavailable' ? <InlineUnavailable message="No pudimos actualizar. Esta es la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    <AppText muted variant="footnote" numeric>{data.coverage.timed} de {data.coverage.sessions} sesiones con inicio utilizable · hora de Córdoba</AppText>
    <GlassSurface style={styles.controls}>
      <LinkRow label="Rutina" value={data.routines.find(r => r.id === selection.routine)?.name ?? 'Todas'} onPress={() => { haptics.selection(); setSheet('routine'); }} testID="training-time-routine" />
      <LinkRow label="Qué mirar" value={timeMetricLabel(metric)} onPress={() => { haptics.selection(); setSheet('metric'); }} testID="training-time-metric" />
    </GlassSurface>
    {metric === 'load' ? <LinkRow label="Ejercicio" value={execution?.name ?? 'Elegir'} onPress={() => { haptics.selection(); setSheet('execution'); }} testID="training-time-execution" /> : null}
    {execution ? <View style={styles.block}>
      <AppText variant="headline">{execution.name}</AppText><AppText muted variant="footnote">{executionLabel(execution)}</AppText>
      {metric !== 'load' ? <Button label="Ver todos los ejercicios" variant="quiet" onPress={() => setFilter({ execution: null })} /> : null}
    </View> : null}
    {metric === 'load' && !execution ? <View style={styles.block}><Heading level={2}>Una carga, en su contexto</Heading><AppText muted>Elegí un ejercicio y su forma de hacerlo. Los kilos de ejercicios distintos no se mezclan.</AppText>
      <Button label="Elegir ejercicio" variant="secondary" onPress={() => setSheet('execution')} /></View> : <>
      <View style={styles.block} testID="training-time-reading">
        <AppText muted variant="subheadline">{selection.bin === null ? 'Todo el día' : timeRange(group)}</AppText>
        <AppText variant="title1" numeric>{timeMetricText(group, metric, unit)}</AppText>
        <AppText muted variant="footnote" numeric>{timeMetricCount(group, metric)} {metric === 'improvements' ? 'comparaciones válidas' : 'sesiones con este dato'} · {group.sessions} sesiones en la selección</AppText>
      </View>
      <TrainingTimesChart bins={data.bins} metric={metric} selected={selection.bin} unit={unit} onSelect={bin => setFilter({ bin })} />
      {selection.bin !== null ? <Button label="Ver todos los horarios" variant="quiet" onPress={() => setFilter({ bin: null })} /> : null}
      <MetricDetail data={data} metric={metric} selected={selection.bin} />
      <View style={styles.block}><Heading level={2}>Por franja</Heading>
        {data.bands.map((band, i) => <View key={band.fromMinute} style={[styles.band, fontScale > 1.3 && styles.stacked]} accessible accessibilityLabel={`${BAND_LABELS[i]}, ${timeRange(band)}. ${timeMetricText(band, metric, unit)}. ${timeMetricCount(band, metric)} registros utilizados.`}>
          <View style={styles.flex}><AppText variant="headline">{BAND_LABELS[i]}</AppText><AppText muted variant="caption">{timeRange(band)}</AppText></View>
          <View style={styles.flex}><AppText numeric>{timeMetricText(band, metric, unit)}</AppText><AppText muted numeric variant="caption">{timeMetricCount(band, metric)} {metric === 'improvements' ? 'comparaciones' : 'sesiones'}</AppText></View>
        </View>)}
      </View>
    </>}
    {metric !== 'load' || execution ? <View style={styles.block}>
      <Heading level={2}>Las sesiones detrás</Heading>
      {!pageReady ? <><AppText muted variant="footnote">{state.status === 'unavailable' ? 'No pudimos traer las sesiones de esta selección.' : 'Actualizando sesiones…'}</AppText><SkeletonBlock height={64} /></> : <>
      {data.page.total && data.page.rows.length ? <AppText muted variant="footnote" numeric>{selection.offset + 1}–{selection.offset + data.page.rows.length} de {data.page.total}{selection.bin !== null ? ` · ${timeRange(group)}` : ''}</AppText> : <AppText muted>Sin sesiones con inicio utilizable para esta selección.</AppText>}
      {data.page.rows.map(row => <SessionRow key={row.id} row={row} metric={metric} unit={unit} onPress={() => openSession(row)} />)}
      <View style={styles.pagination}>
        {selection.offset > 0 ? <Button label="Anteriores" variant="quiet" onPress={() => setFilter({ offset: Math.max(0, selection.offset - 30) })} /> : null}
        {data.page.nextOffset !== null ? <Button label="Siguientes" variant="quiet" onPress={() => setFilter({ offset: data.page.nextOffset! })} /> : null}
      </View></>}
    </View> : null}
    {unknown ? <AppText muted variant="footnote" numeric>{unknown} sesiones quedaron fuera del horario: {data.coverage.missingStart + data.coverage.invalidStart} sin inicio válido, {data.coverage.differentDay} con inicio en otro día y {data.coverage.futureStart} con inicio futuro.</AppText> : null}
    <AppText muted variant="footnote">Según el inicio guardado. Los horarios antiguos pueden ser aproximados. Muestra qué coincidió, no qué lo causó.</AppText>
    <LinkRow label="Cómo se lee" onPress={() => { haptics.selection(); setSheet('method'); }} />
    {sheet ? <AppSheet onClose={() => setSheet(null)} closeLabel="Cerrar" testID={`training-times-${sheet}-sheet`}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
        <Heading level={2}>{sheet === 'metric' ? 'Qué querés mirar' : sheet === 'routine' ? 'Elegir rutina' : sheet === 'execution' ? 'Ejercicio y forma de hacerlo' : 'Cómo se lee'}</Heading>
        {sheet === 'metric' ? TIME_METRICS.map(option => <ListRow key={option.value} title={option.label} subtitle={option.description}
          value={metric === option.value ? 'Elegido' : undefined} onPress={() => chooseMetric(option.value)} testID={`training-time-choose-${option.value}`} />) : null}
        {sheet === 'routine' ? <><ListRow title="Todas las rutinas" onPress={() => { setFilter({ routine: null, execution: null, bin: null }); setSheet(null); }} />
          {data.routines.map(r => <ListRow key={r.id} title={r.name} subtitle={`${r.sessions} sesiones`} onPress={() => { setFilter({ routine: r.id, execution: null, bin: null }); setSheet(null); }} testID={`training-time-routine-${r.id}`} />)}</> : null}
        {sheet === 'execution' ? <>
          {data.executions.length ? data.executions.map(e => <ListRow key={e.key} title={e.name} subtitle={executionLabel(e)} value={selection.execution === e.key ? 'Elegido' : undefined}
            onPress={() => { setFilter({ execution: e.key, bin: null }); setSheet(null); }} testID={`training-time-exercise-${e.exerciseId}`} />) : <AppText muted>No hay cargas con implemento, variante y modo de peso conocidos en este período. Los modos de asistencia o sin carga compatible no se comparan como kilos.</AppText>}
        </> : null}
        {sheet === 'method' ? <>
          <AppText>Se agrupa por la hora de inicio guardada, en Córdoba. Una sesión que cruza medianoche conserva la hora en que empezó.</AppText>
          <AppText muted>No podemos certificar la hora real de los registros antiguos. Los inicios que no coinciden con el día registrado quedan fuera del análisis horario.</AppText>
          <AppText>Duración: mediana del tiempo entre inicio y final, con descansos. No mide intensidad. Las sesiones sin final válido no entran en esa mediana.</AppText>
          <AppText>Energía: respuestas previas registradas antes del inicio o de la primera serie, según la comprobación temporal existente. Las tardías o inciertas quedan fuera.</AppText>
          <AppText>Mejoras: cada ejercicio frente a su sesión anterior compatible, con el mismo implemento, variante y modo. Una comparación no es una sesión ni una prueba del efecto del horario.</AppText>
          <AppText>Cargas: mediana de la serie con más carga de cada sesión, con sus repeticiones disponibles al abrirla. No estima fuerza máxima ni mezcla ejercicios o modos.</AppText>
          <AppText muted>Una franja puede contener otras rutinas o fechas. Filtrá la misma rutina para comparar un contexto más parecido. Pocos registros y descansos largos pueden cambiar la lectura. Las franjas son una organización de pantalla, no límites biológicos.</AppText>
        </> : null}
      </ScrollView>
    </AppSheet> : null}
  </>);
}

function MetricDetail({ data, metric, selected }: { data: ProgressTrainingTimes; metric: TrainingTimeMetric; selected: number | null }) {
  const group = selected === null ? data.total : data.bins[selected]!;
  if (metric === 'duration') return <AppText muted variant="footnote">Mediana por sesión, con descansos. No mide intensidad.</AppText>;
  if (metric === 'load') return <AppText muted variant="footnote">Mediana de la carga máxima registrada en cada sesión. Abrí una sesión para ver las repeticiones. No es una estimación de fuerza.</AppText>;
  if (metric === 'energy') return <View style={styles.block} testID="training-time-energy-distribution"><AppText variant="headline">Así llegaste</AppText>
    <View style={styles.distribution}>{group.energy.distribution.map((n, index) => <View key={index} style={styles.block} accessible accessibilityLabel={`Energía ${index + 1} de 5: ${n} sesiones`}><AppText muted numeric variant="caption">{index + 1} de 5</AppText><AppText numeric variant="headline">{n}</AppText></View>)}</View>
    <AppText muted variant="footnote">Mediana de respuestas previas. Cada nivel conserva su cantidad de sesiones.</AppText></View>;
  if (metric === 'improvements') return <View style={styles.block}><AppText muted numeric variant="footnote">{group.performance.stable} sin cambio observado · {group.performance.declined} bajaron · {group.performance.ambiguous} con señales mixtas · {group.performance.insufficient} sin comparación suficiente.</AppText>
    <AppText muted variant="footnote">{comparableTimes(group) ? 'Los porcentajes usan solo comparaciones válidas.' : 'Todavía no hay comparaciones válidas en esta selección.'} No identifica un horario mejor para progresar.</AppText></View>;
  return null;
}

function SessionRow({ row, metric, unit, onPress }: { row: TrainingTimeSession; metric: TrainingTimeMetric; unit?: string; onPress: () => void }) {
  const { colors } = useOwnlevelTheme(), { fontScale } = useWindowDimensions();
  const value = metric === 'duration' ? row.minutes === null ? 'Sin duración válida' : `${timeNumber(row.minutes)} min`
    : metric === 'energy' ? row.energy.value === null ? 'Sin energía previa utilizable' : `Energía ${row.energy.value} de 5`
    : metric === 'improvements' ? `${row.performance.improved} mejoraron · ${row.performance.improved + row.performance.stable + row.performance.declined} comparables`
    : metric === 'load' ? row.load === null ? 'Sin carga utilizable' : `${timeNumber(row.load.value)} ${unit} × ${row.load.reps} reps` : `${timeNumber(row.minutes ?? 0)} min`;
  return <View style={[styles.session, { borderColor: colors.border }, fontScale > 1.3 && styles.stacked]}>
    <ListRow title={row.name} subtitle={`${row.date.split('-').reverse().join('/')} · ${timeAt(row.minute)}`} onPress={onPress} testID={`training-time-session-${row.id}`} />
    <AppText muted numeric variant="footnote">{metric === 'sessions' && row.minutes === null ? 'Sin duración válida' : value}</AppText>
  </View>;
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm }, flex: { flex: 1, gap: spacing.xs }, controls: { borderRadius: radius.card, paddingHorizontal: spacing.md },
  band: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingVertical: spacing.sm },
  pagination: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, distribution: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  sheet: { padding: brandTokens.layout.screenPadding, paddingBottom: spacing.xxl, gap: spacing.md },
  session: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: spacing.sm, gap: spacing.xs }, stacked: { flexDirection: 'column', alignItems: 'stretch' },
});
