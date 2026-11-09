import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { useCachedRead } from '@/api/use-cached-read';
import { fetchProgressPanorama, type ProgressOverview, type ProgressDestination, type ProgressSpark } from '@/api/progress';
import { AppText, Button, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, spacing, useOwnlevelTheme } from '@/design-system';
import { periodSummaryHref, explorationHref } from '@/insights/navigation';
import { exactPeriodDate, exactPeriodRange } from '@/insights/period-model';
import { addDays } from './progress-range';
import { useProgressRange } from './progress-range-context';
import { ProgressScroll } from './progress-scroll';
import { ProgressReadStatus } from './progress-read-status';
import { PeriodChart } from './period-chart';
import { formatValue, arrowDelta } from './progress-format';
import { destinationRoute } from './progress-destination';
function Preview({ source, kind, spark, unit, mode }: {
    source: ProgressOverview;
    kind: string;
    spark: ProgressSpark | null | undefined;
    unit: string;
    mode: 'bars' | 'dots';
}) {
    const [entry, setEntry] = useState({ source, key: null as string | null });
    if (entry.source !== source)
        setEntry({ source, key: null });
    if (!spark || !spark.current.some(p => p.value !== null))
        return null;
    const points = spark.current.map(p => ({ key: p.start, label: p.start.slice(8), value: p.value, text: `${exactPeriodRange(p)}: ${p.value === null ? 'sin dato' : formatValue(p.value, unit)}` }));
    const selected = points.find(p => p.key === entry.key);
    const meaning = kind === 'training' ? 'Series completadas por intervalo' : kind === 'weight' ? 'Último pesaje de cada intervalo' : 'Promedio de kcal por día utilizado en cada intervalo';
    return <View style={styles.preview}>
   <AppText muted numeric variant="footnote" accessibilityLiveRegion="polite">{meaning}. {selected?.text ?? 'Tocá para ver fecha y valor.'}</AppText>
   <ScrollView horizontal showsHorizontalScrollIndicator={false}><PeriodChart testID={`panorama-chart-${kind}`} points={points} mode={mode} inspection={{ selectedKey: entry.key, onSelect: key => setEntry({ source, key: entry.key === key ? null : key }) }}/></ScrollView>
 </View>;
}
/** Editorial presentation, also used by the isolated visual fixture. No readers or navigation in this component. */
export function ProgressPanorama({ data, onOpen }: {
    data: ProgressOverview;
    onOpen: (d: ProgressDestination) => void;
}) {
    const { colors } = useOwnlevelTheme(), t = data.training.status === 'ok' ? data.training.data : null, n = data.nutrition.status === 'ok' ? data.nutrition.data : null;
    const w = data.panorama?.weight, coverage = data.panorama?.nutrition;
    return <View style={styles.areas} testID="progress-panorama">
   <AppText muted numeric variant="footnote">Últimos {data.period.days} días · {exactPeriodRange(data.period)}{data.period.includesToday ? ' · hoy en curso' : ''}</AppText>
   <View style={[styles.area, { borderColor: colors.border }]} testID="panorama-training">
     <Heading level={2}>Entrenamiento</Heading>
     {!t ? <AppText>No pudimos leer Entrenamiento.</AppText> : <>
       <AppText variant="title1" numeric>{t.sessions} {t.sessions === 1 ? 'sesión' : 'sesiones'} · {t.trainingDays} {t.trainingDays === 1 ? 'día' : 'días'}</AppText>
       <AppText muted numeric>Actividad: {formatValue(t.sets, null, 'integer')} series completadas; no mide rendimiento.</AppText>
       <Preview source={data} kind="training" spark={data.sparks?.training} unit="series" mode="bars"/>
       {data.inPeriod?.comparable === 0 ? <AppText muted>Sin ejercicios comparables entre dos sesiones de esta ventana.</AppText> : data.inPeriod ? <AppText numeric>{data.inPeriod.improved} de {data.inPeriod.comparable} ejercicios con mejora: primera frente a última sesión de esta ventana. No son récords.</AppText> : <AppText muted>La comparación dentro de la ventana no está disponible en esta lectura.</AppText>}
       {!t.sessions ? <AppText muted>Sin sesiones registradas en estas fechas; no describe otros períodos.</AppText> : null}
     </>}
     <Button label="Ver actividad y ejercicios" variant="secondary" onPress={() => onOpen({ kind: 'training' })}/>
   </View>
   <View style={[styles.area, { borderColor: colors.border }]} testID="panorama-body">
     <Heading level={2}>Cuerpo</Heading>
     {data.body.status !== 'ok' ? <AppText>No pudimos leer Cuerpo.</AppText> : w === undefined ? <AppText>La fecha exacta y cobertura de peso no están disponibles en esta versión. Consultá los registros.</AppText> : w?.last ? <>
       <AppText variant="title1" numeric>{formatValue(w.last.value, 'kg')}</AppText><AppText muted numeric>Último pesaje de esta ventana · {exactPeriodDate(w.last.date)} · {w.count} {w.count === 1 ? 'registro válido' : 'registros válidos'}.</AppText>
       {w.count >= 2 && w.first ? <AppText numeric>{arrowDelta(w.last.value - w.first.value, 'kg')} entre {exactPeriodDate(w.first.date)} y {exactPeriodDate(w.last.date)}. Diferencia entre registros, no tendencia.</AppText> : <AppText muted>Un solo registro no permite describir una tendencia.</AppText>}
       <Preview source={data} kind="weight" spark={data.sparks?.weight} unit="kg" mode="dots"/>
     </> : <AppText muted>Sin pesajes válidos en esta ventana. No buscamos ni arrastramos un peso de otra fecha.</AppText>}
     <Button label="Ver peso y medidas" variant="secondary" onPress={() => onOpen({ kind: 'body' })}/>
   </View>
   <View style={[styles.area, { borderColor: colors.border }]} testID="panorama-nutrition">
     <Heading level={2}>Nutrición</Heading>
     {!n ? <AppText>No pudimos leer Nutrición.</AppText> : <>
       <AppText variant="title1" numeric>{n.averageKcal === null ? 'Sin promedio de calorías' : `${formatValue(n.averageKcal, 'kcal')} por día utilizado`}</AppText>
       <AppText muted numeric>{coverage ? `${coverage.caloriesDays} días utilizados para calorías; ${coverage.proteinDays} para proteína.` : 'Los denominadores por nutriente no están disponibles en esta versión.'} {n.registeredDays} de {n.days} días con alimentación registrada; hoy queda fuera del promedio.</AppText>
       <AppText numeric>Proteína registrada: {n.averageProteinG === null ? 'sin promedio' : `${formatValue(n.averageProteinG, 'g')} por día utilizado`}.</AppText>
       {coverage && n.averageTargetKcal !== null ? <AppText muted numeric>Objetivo histórico promedio: {formatValue(n.averageTargetKcal, 'kcal')} en {coverage.targetDays} días con objetivo acreditado; puede usar una población distinta.</AppText> : null}
       <Preview source={data} kind="nutrition" spark={data.sparks?.nutrition} unit="kcal" mode="bars"/>
       <AppText muted>Completo entre registros no confirma toda la ingesta. Sin comidas no significa ayuno; cero registrado y ausencia son distintos.</AppText>
     </>}
     <Button label="Ver alimentación y objetivos" variant="secondary" onPress={() => onOpen({ kind: 'nutrition' })}/>
   </View>
 </View>;
}
function OverviewContent() {
    const { client } = useMobileApi(), router = useRouter(), { today } = useProgressRange();
    const from = addDays(today, -29), query = { period: 'custom' as const, from, to: today };
    const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressPanorama(c, { period: 'custom', from, to: today }, signal), [from, today]);
    const { state, data, refresh } = useCachedRead(client, 'overview', `panorama|${from}|${today}`, load);
    const origin = { fromProgress: '1' as const };
    const open = (d: ProgressDestination) => { const dest = destinationRoute(d); router.push({ pathname: dest.pathname, params: { ...dest.extra, from: query.from, to: query.to } }); };
    return <ProgressScroll root periodControls={false} title="Progreso" testID="progress-overview" refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()}/>}>
   <ProgressReadStatus state={state}/>
   {data ? <>{state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Conservamos la última lectura confirmada." actionLabel="Reintentar" onAction={() => void refresh()}/> : null}<ProgressPanorama data={data} onOpen={open}/></> : state.status === 'loading' ? <SkeletonBlock height={176}/> : <UnavailableState title="No pudimos leer tu progreso" description="Tus registros siguen guardados." action={<Button label="Reintentar" onPress={() => void refresh()}/>}/>}
   <View style={styles.explore}>
     <Heading level={2}>Mirar en contexto</Heading>
     <Button label="Ver contexto y comparación de sesiones" variant="secondary" onPress={() => router.navigate({ pathname: '/(tabs)/train/insights', params: origin })}/>
     <Button label="Últimos tres meses" variant="secondary" onPress={() => router.navigate(periodSummaryHref(today, origin))}/>
     <Button label="Semanas, A/B y coincidencias descriptivas" variant="secondary" onPress={() => router.navigate(explorationHref(today, undefined, undefined, origin))}/>
     <AppText muted>Se leen al abrirlos. Las coincidencias de registros no acreditan una relación ni su causa.</AppText>
     <Button label="Explorar período y A/B" variant="secondary" onPress={() => router.navigate('/(tabs)/progress/period')}/>
     <AppText muted>Ahí siguen Mis vistas, récords y cambios, relaciones, observaciones anteriores y Etapas, con sus métodos y configuración.</AppText>
     <Button label="Métricas personales" variant="secondary" onPress={() => router.push('/(tabs)/progress/trends/metrics')}/>
     <Button label="Recorrido por fecha" variant="secondary" onPress={() => router.navigate('/(tabs)/train/calendar')}/>
   </View>
 </ProgressScroll>;
}
/** Unmount this reading while the tab/route is hidden; confirmed cache restores it synchronously on return. */
export function ProgressOverviewScreen() { const [visible, setVisible] = useState(false); useFocusEffect(useCallback(() => { setVisible(true); return () => setVisible(false); }, [])); return visible ? <OverviewContent /> : null; }
const styles = StyleSheet.create({ areas: { gap: spacing.lg }, area: { gap: spacing.sm, paddingBottom: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth }, preview: { gap: spacing.xs }, explore: { gap: spacing.md, paddingTop: spacing.xl } });
