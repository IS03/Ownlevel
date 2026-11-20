import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import type { MobileApiClient } from '@/api/client';
import { useMobileApi } from '@/api';
import { useCachedRead } from '@/api/use-cached-read';
import { fetchTrainingRecovery, RECOVERY_BINS, recoveryReadKey, type ProgressTrainingRecovery, type RecoveryGroup, type RecoveryRow, type RecoverySelection } from '@/api/training-recovery';
import { progressQueryParams, type ProgressQuery } from '@/api/progress';
import { AppSheet, AppText, GlassSurface, Heading, InlineUnavailable, LinkRow, ListRow, SkeletonBlock, brandTokens, radius, spacing } from '@/design-system';
import { ExerciseSegmented } from '@/training/exercise-segmented';
import { haptics } from '@/platform/haptics';
import { ProgressScroll } from './progress-scroll';
import { useProgressRange } from './progress-range-context';
import { TrainingTimingColumns } from './training-times-chart';
import { timeNumber } from './training-times-model';

const SCOPES = [{ value: 'all', label: 'General' }, { value: 'routine', label: 'Misma rutina' }] as const;
const METRICS = [{ value: 'energy', label: 'Energía' }, { value: 'fatigue', label: 'Fatiga' }, { value: 'improvements', label: 'Mejoras' }] as const;
type Metric = typeof METRICS[number]['value'];
const initial = (): RecoverySelection => ({ scope: 'all', routine: null, bin: null, offset: 0 });
const comparable = (group: RecoveryGroup) => group.performance.improved + group.performance.stable + group.performance.declined;
const metricValue = (group: RecoveryGroup, metric: Metric) => metric === 'improvements' ? comparable(group) ? 100 * group.performance.improved / comparable(group) : null : group[metric].median;
const metricSay = (group: RecoveryGroup, metric: Metric) => metric === 'improvements' ? comparable(group) ? `${group.performance.improved} de ${comparable(group)} comparaciones mejoraron` : 'Sin comparaciones suficientes' : group[metric].median === null ? 'Sin respuestas previas utilizables' : `${timeNumber(group[metric].median!)} de 5, mediana de ${group[metric].n} respuestas previas`;
/** Shares of improvements are small: the bars go up to the highest band, so the differences between bands can be seen. */
const improvementScale = (groups: readonly RecoveryGroup[]) => Math.max(1, ...groups.map(g => metricValue(g, 'improvements') ?? 0));
const gapLabel = (row: RecoveryRow) => row.gap.hours === null ? ({ no_previous: 'Sin sesión anterior registrada', no_routine: 'Sin una rutina identificada', uncertain_order: 'Orden de las sesiones incierto', invalid_previous: 'Horario anterior incompleto o incierto', overlap: 'Los horarios se superponen', paired: '' })[row.gap.state]
  : row.gap.hours === 0 ? 'Sin separación entre sesiones' : row.gap.hours < 1 ? 'Menos de 1 h entre sesiones' : `${timeNumber(row.gap.hours)} h entre sesiones`;

export function TrainingRecoveryScreen() {
  const { query } = useProgressRange();
  return <RecoveryReader key={progressQueryParams(query)} query={query} />;
}
function RecoveryReader({ query }: { query: ProgressQuery }) {
  const { client } = useMobileApi(), router = useRouter(), { fontScale } = useWindowDimensions();
  const [selection, setSelection] = useState(initial), [metric, setMetric] = useState<Metric>('improvements');
  const [sheet, setSheet] = useState<'routine' | 'method' | null>(null);
  const load = useCallback((api: MobileApiClient, signal: AbortSignal) => fetchTrainingRecovery(api, query, selection, signal), [query, selection]);
  const { data: current, state, refresh } = useCachedRead(client, 'training', recoveryReadKey(query, selection), load);
  const [previous, retain] = useState<{ client: MobileApiClient | null; data: ProgressTrainingRecovery } | null>(null);
  const data = current ?? (previous?.client === client && previous.data.selection.scope === selection.scope && previous.data.selection.routine === selection.routine ? previous.data : undefined);
  const change = (patch: Partial<RecoverySelection>) => { haptics.selection(); if (data) retain({ client, data }); setSelection(old => ({ ...old, ...patch, offset: patch.offset ?? 0 })); };
  const shell = (children: React.ReactNode) => <ProgressScroll title="Entre sesiones" testID="training-recovery-screen" comparisonControls={false}
    refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} />}>{children}</ProgressScroll>;
  if (!data) return shell(<>{state.status === 'loading' ? <><SkeletonBlock height={64} /><SkeletonBlock height={180} /></> : <InlineUnavailable message="No pudimos traer los intervalos entre sesiones." actionLabel="Reintentar" onAction={() => void refresh()} />}
    {selection.routine !== null ? <LinkRow kind="back" label="Ver todas las rutinas" onPress={() => change({ routine: null, bin: null })} /> : null}</>);
  const group = selection.bin === null ? data.total : data.groups[selection.bin]!;
  const open = (id: string) => { haptics.selection(); router.push({ pathname: '/(tabs)/progress/training-session/[id]', params: { id } }); };
  return shell(<>
    {state.status === 'unavailable' ? <InlineUnavailable message="No pudimos actualizar. Esta es la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    <ExerciseSegmented accessibilityLabel="Desde qué entrenamiento se mide el intervalo" options={SCOPES} value={selection.scope} onChange={scope => change({ scope, bin: null })} />
    <AppText muted variant="subheadline">{selection.scope === 'all' ? 'Desde el final del último entrenamiento registrado hasta el inicio del siguiente.' : 'Desde el final de la última vez que hiciste esa rutina. Puede haber otros entrenamientos en el medio.'}</AppText>
    <GlassSurface style={styles.controls}><LinkRow label="Rutina" value={data.routines.find(r => r.id === selection.routine)?.name ?? 'Todas'} onPress={() => { haptics.selection(); setSheet('routine'); }} testID="recovery-routine" /></GlassSurface>
    <AppText muted numeric variant="footnote">{data.coverage.paired} de {data.coverage.sessions} sesiones con intervalo utilizable</AppText>
    <ExerciseSegmented accessibilityLabel="Qué comparar con el intervalo" options={METRICS} value={metric} onChange={next => { haptics.selection(); setMetric(next); }} />
    <View style={styles.block} testID="recovery-reading"><Heading level={2}>{selection.bin === null ? 'Todos los intervalos' : RECOVERY_BINS[selection.bin]!.label}</Heading>
      <AppText numeric variant="headline">{metricSay(group, metric)}</AppText>
      <AppText muted numeric variant="footnote">{group.sessions} sesiones en esta selección</AppText>
    </View>
    <TrainingTimingColumns testID="recovery-chart" prefix="recovery-bin" label="Intervalos entre el final anterior y el inicio siguiente" caption="Horas transcurridas · no certifican recuperación física"
      maximum={metric === 'improvements' ? improvementScale(data.groups) : 5} selected={selection.bin} onSelect={bin => change({ bin })}
      items={data.groups.map((g, i) => ({ label: ['<24 h', '24–48 h', '48–72 h', '3–7 d', '7 d +'][i]!, value: metricValue(g, metric), spoken: `${RECOVERY_BINS[i]!.label}. ${metricSay(g, metric)}. ${g.sessions} sesiones.` }))} />
    {selection.bin !== null ? <LinkRow kind="back" label="Ver todos los intervalos" onPress={() => change({ bin: null })} /> : null}
    <View style={styles.block}>
      <Heading level={2}>Cómo llegaste y cómo te fue</Heading>
      <View style={[styles.summary, fontScale > 1.3 && styles.stacked]}>
        {(['energy', 'fatigue'] as const).map(key => <View key={key} style={styles.fact} accessible accessibilityLabel={`${key === 'energy' ? 'Energía' : 'Fatiga'} al llegar. ${metricSay(group, key)}`}>
          <AppText muted variant="subheadline">{key === 'energy' ? 'Energía al llegar' : 'Fatiga al llegar'}</AppText>
          <AppText numeric variant="title2">{group[key].median === null ? '—' : `${timeNumber(group[key].median!)} de 5`}</AppText>
          <AppText muted numeric variant="caption">Mediana · {group[key].n} respuestas previas</AppText>
          <AppText muted numeric variant="caption">{group[key].distribution.map((n, i) => `${i + 1}: ${n}`).join(' · ')} sesiones por nivel</AppText>
        </View>)}
      </View>
      <AppText numeric variant="headline">{metricSay(group, 'improvements')}</AppText>
      <AppText muted numeric variant="footnote">{group.performance.stable} sin cambio observado · {group.performance.declined} bajaron · {group.performance.ambiguous} con señales mixtas · {group.performance.insufficient} sin comparación suficiente.</AppText>
      <AppText muted variant="footnote">Cada ejercicio, frente a su vez anterior. Describe coincidencias; no demuestra el efecto del intervalo.</AppText>
    </View>
    <View style={styles.block}><Heading level={2}>Las sesiones detrás</Heading>
      {!current ? <><AppText muted variant="footnote">{state.status === 'unavailable' ? 'No pudimos traer esta selección.' : 'Actualizando sesiones…'}</AppText><SkeletonBlock height={64} /></> : <>
        {data.page.rows.length ? <AppText muted numeric variant="footnote">{selection.offset + 1}–{selection.offset + data.page.rows.length} de {data.page.total}</AppText> : <AppText muted>Sin sesiones con este intervalo registrado.</AppText>}
        {data.page.rows.map(row => <View key={row.id} style={styles.block}>
          <ListRow title={row.name} subtitle={`${row.date.split('-').reverse().join('/')} · ${gapLabel(row)}`} onPress={() => open(row.id)} testID={`recovery-session-${row.id}`}
            accessibilityLabel={`${row.name}, ${row.date}. ${gapLabel(row)}. Energía ${row.energy.value === null ? 'sin respuesta previa utilizable' : `${row.energy.value} de 5`}, fatiga ${row.fatigue.value === null ? 'sin respuesta previa utilizable' : `${row.fatigue.value} de 5`}. Abrir registro.`} />
          <AppText muted numeric variant="footnote">Energía {row.energy.value ?? '—'} · Fatiga {row.fatigue.value ?? '—'} · {row.performance.improved + row.performance.stable + row.performance.declined ? `${row.performance.improved} ejercicios mejoraron` : 'Sin comparación suficiente'}</AppText>
          {selection.scope === 'routine' && row.gap.state === 'paired' ? <AppText muted numeric variant="footnote">{row.gap.intervening === null ? 'No podemos ubicar todos los entrenamientos intermedios.' : `${row.gap.intervening} ${row.gap.intervening === 1 ? 'entrenamiento registrado' : 'entrenamientos registrados'} en el medio.`}</AppText> : null}
          {row.gap.previous ? <LinkRow label={`Anterior: ${row.gap.previous.name}`} value={row.gap.previous.date.split('-').reverse().join('/')} onPress={() => open(row.gap.previous!.id)} testID={`recovery-previous-${row.id}`} /> : null}
        </View>)}
        {selection.offset > 0 ? <LinkRow kind="back" label="Sesiones anteriores" onPress={() => change({ offset: Math.max(0, selection.offset - 30) })} /> : null}
        {data.page.nextOffset !== null ? <LinkRow label="Más sesiones" onPress={() => change({ offset: data.page.nextOffset! })} /> : null}
      </>}
    </View>
    <AppText muted variant="footnote">{data.coverage.currentTimeExcluded + Object.values(data.coverage.excluded).reduce((a, b) => a + b, 0)} sesiones sin intervalo calculable. Los huecos no se convierten en cero ni en días de descanso.</AppText>
    <LinkRow label="Qué se pudo calcular" onPress={() => { haptics.selection(); setSheet('method'); }} />
    {sheet ? <AppSheet onClose={() => setSheet(null)} closeLabel="Cerrar" testID={`recovery-${sheet}-sheet`}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheet}>
      <Heading level={2}>{sheet === 'routine' ? 'Elegir rutina' : 'Qué se pudo calcular'}</Heading>
      {sheet === 'routine' ? <><ListRow title="Todas las rutinas" onPress={() => { change({ routine: null, bin: null }); setSheet(null); }} />
        {data.routines.map(r => <ListRow key={r.id} title={r.name} subtitle={`${r.sessions} sesiones`} value={selection.routine === r.id ? 'Elegida' : undefined} accessibilityLabel={`${r.name}, ${r.sessions} sesiones${selection.routine === r.id ? ', elegida' : ''}`} onPress={() => { change({ routine: r.id, bin: null }); setSheet(null); }} testID={`recovery-routine-${r.id}`} />)}</> : <>
        <AppText>Usamos el final guardado de la sesión anterior y el inicio guardado de la siguiente. No son días de calendario. Los horarios antiguos pueden ser aproximados.</AppText>
        <AppText>General mira cualquier entrenamiento registrado, incluso de otra rutina. Misma rutina usa su identidad histórica, no su nombre; las sesiones libres no se consideran una única rutina.</AppText>
        <AppText>En Misma rutina mostramos otros entrenamientos intermedios. El intervalo no equivale a descanso completo ni confirma qué actividad hiciste fuera de la app.</AppText>
        <AppText>El período y el filtro eligen qué sesiones mirar. Su antecedente puede estar antes del período o ser de otra rutina en General. La referencia de rendimiento sigue siendo la anterior compatible de cada ejercicio.</AppText>
        <AppText muted numeric>{data.coverage.currentTimeExcluded} con inicio actual no utilizable · {data.coverage.excluded.no_previous} sin anterior registrada · {data.coverage.excluded.no_routine} sin rutina identificada · {data.coverage.excluded.invalid_previous} con horario anterior incompleto · {data.coverage.excluded.uncertain_order} con orden incierto · {data.coverage.excluded.overlap} con superposición.</AppText>
        <AppText>Mejoras compara cada ejercicio con su vez anterior. Si no registraste la variante (agarre, banco), se compara igual, como en Comparaciones: un cambio no registrado puede mover el resultado.</AppText>
        <AppText>Energía y fatiga usan solo respuestas previas elegibles. Cada una conserva su cantidad y distribución. Una respuesta posterior o tardía no reemplaza lo que registraste al llegar.</AppText>
        <AppText muted>Las franjas organizan tus datos, no son recomendaciones de recuperación. Carga anterior, sueño, comidas, rutina y paso del tiempo también pueden coincidir con los resultados. Pocos registros no definen un patrón.</AppText>
      </>}
    </ScrollView></AppSheet> : null}
  </>);
}
const styles = StyleSheet.create({ block: { gap: spacing.sm }, controls: { borderRadius: radius.card, paddingHorizontal: spacing.md }, summary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, fact: { flex: 1, minWidth: 140, gap: spacing.xs }, stacked: { flexDirection: 'column' }, sheet: { padding: brandTokens.layout.screenPadding, paddingBottom: spacing.xxl, gap: spacing.md } });
