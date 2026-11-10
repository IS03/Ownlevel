import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { useCachedRead } from '@/api/use-cached-read';
import { fetchProgressFindings, type ProgressEditorialFinding, type ProgressOverview, type ProgressDestination, type ProgressSpark } from '@/api/progress';
import { AppIcon, AppText, Button, Heading, InlineUnavailable, ListRow, SkeletonBlock, UnavailableState, brandTokens, pressedStyle, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { periodSummaryHref, explorationHref } from '@/insights/navigation';
import { exactPeriodDate, exactPeriodRange } from '@/insights/period-model';
import { addDays, progressStateForRange } from './progress-range';
import { InsightRow } from '@/insights/insight-row';
import { ProgressFindings } from './progress-findings';
import { useProgressRange } from './progress-range-context';
import { ProgressScroll } from './progress-scroll';
import { ProgressReadStatus } from './progress-read-status';
import { PeriodChart } from './period-chart';
import { formatValue } from './progress-format';
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
    const meaning = kind === 'training' ? 'Actividad · series por intervalo' : kind === 'weight' ? 'Peso · último por intervalo' : 'Calorías · promedio por día utilizado';
    // The selected range can wrap with Dynamic Type: reserve its intrinsic height, without moving the plot.
    const reserve = [meaning, ...points.map(p => p.text)].reduce((a, b) => b.length > a.length ? b : a, '');
    return <View style={styles.preview}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <PeriodChart compact testID={`panorama-chart-${kind}`} points={points} mode={mode}
          inspection={{ selectedKey: entry.key, onSelect: key => setEntry({ source, key: entry.key === key ? null : key }) }} />
      </ScrollView>
      <View>
        <AppText numeric variant="caption" style={styles.reserve} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{reserve}</AppText>
        <View style={styles.readout} accessible accessibilityLabel={selected?.text ?? meaning} accessibilityLiveRegion="polite">
          <AppText muted numeric variant="caption">{selected?.text ?? meaning}</AppText>
        </View>
      </View>
    </View>;
}

function AreaLink({ title, value, action, onPress }: { title: string; value: string; action: string; onPress: () => void }) {
    const { colors } = useOwnlevelTheme(), reduced = useReduceMotion(), { fontScale } = useWindowDimensions();
    return <Pressable accessibilityRole="button" accessibilityLabel={action} accessibilityHint={`${title}: ${value}. Abre el detalle de esta ventana.`}
      onPress={onPress} style={({ pressed }) => [styles.areaLink, pressedStyle(pressed, reduced)]}>
      <View style={[styles.areaHeader, fontScale > 1.3 && styles.stacked]}>
        <Heading level={2} style={styles.areaTitle}>{title}</Heading>
        <AppText numeric variant="title2" style={[styles.primary, fontScale > 1.3 && styles.stackedPrimary]}>{value}</AppText>
      </View>
      <AppIcon name="chevronRight" color={colors.textMuted} size={17} />
    </Pressable>;
}

/** Compact editorial projection of the same confirmed DTO. Full methods/targets remain in the existing details. */
export function ProgressPanorama({ data, onOpen }: { data: ProgressOverview; onOpen: (d: ProgressDestination) => void }) {
    const { colors } = useOwnlevelTheme();
    const t = data.training.status === 'ok' ? data.training.data : null, n = data.nutrition.status === 'ok' ? data.nutrition.data : null;
    const w = data.panorama?.weight, coverage = data.panorama?.nutrition;
    const comparable = t && t.sessions > 0 && data.inPeriod && data.inPeriod.comparable > 0 ? data.inPeriod : null;
    return <View style={styles.areas} testID="progress-panorama">
      <AppText muted numeric variant="caption">Últimos {data.period.days} días · {exactPeriodRange(data.period)}{data.period.includesToday ? ' · hoy en curso' : ''}</AppText>
      <View style={[styles.area, { borderColor: colors.border }]} testID="panorama-training">
        <AreaLink title="Entrenamiento" value={!t ? 'No disponible' : comparable ? `${comparable.improved} de ${comparable.comparable}` : `${t.sessions} ${t.sessions === 1 ? 'sesión' : 'sesiones'}`}
          action="Ver actividad y ejercicios" onPress={() => onOpen({ kind: 'training' })} />
        {!t ? <AppText muted>No pudimos leer Entrenamiento.</AppText> : <>
          <AppText muted numeric variant="caption">{comparable ? 'Ejercicios con mejora · primera frente a última sesión' : !t.sessions ? 'Sin sesiones registradas en esta ventana.' : data.inPeriod == null ? 'Comparación no disponible en esta lectura.' : 'Sin ejercicios comparables entre dos sesiones de esta ventana.'}</AppText>
          {t.sessions ? <AppText muted numeric variant="caption">{t.sessions} {t.sessions === 1 ? 'sesión' : 'sesiones'} · {t.trainingDays} {t.trainingDays === 1 ? 'día entrenado' : 'días entrenados'} · {t.sets} {t.sets === 1 ? 'serie' : 'series'}</AppText> : null}
          <Preview source={data} kind="training" spark={data.sparks?.training} unit="series" mode="bars" />
        </>}
      </View>
      <View style={[styles.area, { borderColor: colors.border }]} testID="panorama-body">
        <AreaLink title="Cuerpo" value={data.body.status !== 'ok' ? 'No disponible' : w?.last ? formatValue(w.last.value, 'kg') : w === undefined ? 'Sin lectura' : 'Sin pesajes'}
          action="Ver peso y medidas" onPress={() => onOpen({ kind: 'body' })} />
        {data.body.status !== 'ok' ? <AppText muted>No pudimos leer Cuerpo.</AppText> : w === undefined ? <AppText muted variant="caption">La fecha exacta y cobertura de peso no están disponibles en esta versión.</AppText> : w?.last ? <>
          <AppText muted numeric variant="caption">Último de la ventana · {exactPeriodDate(w.last.date)} · {w.count} {w.count === 1 ? 'registro válido' : 'registros válidos'}</AppText>
          {w.count === 1 ? <AppText muted variant="caption">Un solo registro no permite describir una tendencia.</AppText> : null}
          <Preview source={data} kind="weight" spark={data.sparks?.weight} unit="kg" mode="dots" />
        </> : <AppText muted variant="caption">Sin pesajes válidos en esta ventana.</AppText>}
      </View>
      <View style={[styles.area, { borderColor: colors.border }]} testID="panorama-nutrition">
        <AreaLink title="Nutrición" value={!n ? 'No disponible' : n.averageKcal === null ? 'Sin promedio' : `${formatValue(n.averageKcal, 'kcal')}/día`}
          action="Ver alimentación y objetivos" onPress={() => onOpen({ kind: 'nutrition' })} />
        {!n ? <AppText muted>No pudimos leer Nutrición.</AppText> : <>
          <AppText muted numeric variant="caption">{coverage ? `${coverage.caloriesDays} días utilizados` : 'Días utilizados no disponibles'} · {n.registeredDays} de {n.days} días con alimentación registrada</AppText>
          <AppText muted numeric variant="caption">Proteína: {n.averageProteinG === null ? 'sin promedio' : `${formatValue(n.averageProteinG, 'g')}/día`}{coverage ? ` · ${coverage.proteinDays} días utilizados` : ''}</AppText>
          <Preview source={data} kind="nutrition" spark={data.sparks?.nutrition} unit="kcal" mode="bars" />
        </>}
      </View>
    </View>;
}

function ExplorationLinks({ today, contextOpen, onToggle }: { today: string; contextOpen: boolean; onToggle: () => void }) {
    const router = useRouter();
    const origin = { fromProgress: '1' as const };
    return <View style={styles.explore}>
      <Heading level={2}>Seguir explorando</Heading>
      <ListRow title="Métricas personales" onPress={() => router.push('/(tabs)/progress/trends/metrics')} />
      <ListRow title="Períodos y A/B" subtitle="Mis vistas, Etapas y lo que se movió junto" accessibilityLabel="Explorar período y A/B" onPress={() => router.navigate('/(tabs)/progress/period')} />
      <ListRow title="Recorrido por fecha" subtitle="Entrenamiento, Cuerpo, Nutrición y Métricas" onPress={() => router.navigate('/history/calendar')} />
      <InsightRow label="Contexto y relaciones" detail="Sesiones, semanas, relaciones y qué influye" spoken="Contexto y relaciones" expanded={contextOpen} onPress={onToggle} />
      {contextOpen ? <View testID="panorama-context-links">
        <ListRow title="Sesiones" subtitle="Contexto y comparación" accessibilityLabel="Ver contexto y comparación de sesiones" onPress={() => router.navigate({ pathname: '/(tabs)/train/insights', params: origin })} />
        <ListRow title="Últimos tres meses" onPress={() => router.navigate(periodSummaryHref(today, origin))} />
        <ListRow title="Semanas y coincidencias" subtitle="Comparación A/B de los registros" accessibilityLabel="Semanas, A/B y coincidencias descriptivas" onPress={() => router.navigate(explorationHref(today, undefined, undefined, origin))} />
        {/* Both read only when opened: discovering them adds no request to this screen. */}
        <ListRow title="Lo que se movió junto" subtitle="Comida y resultados frente al período anterior equivalente" testID="panorama-connections-link"
          accessibilityLabel="Lo que se movió junto: comida y resultados frente al período anterior equivalente" onPress={() => router.navigate('/(tabs)/progress/period')} />
        <ListRow title="Qué influye" subtitle="Preguntas que comparan tus días entre sí" testID="panorama-influence-link"
          accessibilityLabel="Qué influye: preguntas que comparan tus días entre sí" onPress={() => router.navigate('/(tabs)/progress/influence')} />
        <AppText muted variant="caption">Se leen al abrirlos. Las coincidencias de registros no acreditan una relación ni su causa.</AppText>
      </View> : null}
    </View>;
}

function OverviewContent({selected, onSelect, contextOpen, onContextToggle}: {selected: string | null; onSelect: (id: string | null) => void; contextOpen: boolean; onContextToggle: () => void}) {
    const { client } = useMobileApi(), router = useRouter(), { today, state: rangeState, setState } = useProgressRange();
    const from = addDays(today, -29), query = { period: 'custom' as const, from, to: today };
    const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressFindings(c, { period: 'custom', from, to: today }, signal), [from, today]);
    const { state, data, refresh } = useCachedRead(client, 'overview', `panorama|${from}|${today}`, load);
    const open = (d: ProgressDestination, finding?: ProgressEditorialFinding) => {
        // Training/exercise details also use the shared range; set it before mounting their reader.
        const next = progressStateForRange(query.from, query.to, rangeState, today);
        if (next) setState({...next, compare: finding?.method === 'progress-nutrition'
          ? {kind: 'custom', range: {start: finding.reference.start!, end: finding.reference.end}} : {kind: 'none'}});
        const dest = destinationRoute(d);
        router.push({pathname: dest.pathname, params: {...dest.extra, from: query.from, to: query.to}});
    };
    return <ProgressScroll root periodControls={false} title="Progreso" testID="progress-overview" refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()}/>}>
   <ProgressReadStatus state={state}/>
   {data ? <>{state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Conservamos la última lectura confirmada." actionLabel="Reintentar" onAction={() => void refresh()}/> : null}<ProgressPanorama data={data} onOpen={open}/><ProgressFindings items={data.findings} sourcesUnavailable={data.training.status !== 'ok' || data.nutrition.status !== 'ok'} selected={selected} onSelect={onSelect} onOpen={item => open(item.destination, item)}/></> : state.status === 'loading' ? <SkeletonBlock height={176}/> : <UnavailableState title="No pudimos leer tu progreso" description="Tus registros siguen guardados." action={<Button label="Reintentar" onPress={() => void refresh()}/>}/>}
   <ExplorationLinks today={today} contextOpen={contextOpen} onToggle={onContextToggle}/>
 </ProgressScroll>;
}
/** Unmount this reading while the tab/route is hidden; confirmed cache restores it synchronously on return. */
export function ProgressOverviewScreen() {
    const {client} = useMobileApi();
    const [visible, setVisible] = useState(false);
    // Only local disclosure state survives the trip. Readings stay in the existing account-scoped cache.
    const [selection, setSelection] = useState<{client: typeof client; id: string | null; contextOpen: boolean}>({client, id: null, contextOpen: false});
    if (selection.client !== client) setSelection({client, id: null, contextOpen: false});
    useFocusEffect(useCallback(() => {setVisible(true); return () => setVisible(false);}, []));
    return visible ? <OverviewContent selected={selection.client === client ? selection.id : null}
      contextOpen={selection.client === client && selection.contextOpen}
      onSelect={id => setSelection(s => ({client, id, contextOpen: s.client === client && s.contextOpen}))}
      onContextToggle={() => setSelection(s => ({client, id: s.client === client ? s.id : null, contextOpen: s.client !== client || !s.contextOpen}))}/> : null;
}
const styles = StyleSheet.create({
    areas: { gap: spacing.md },
    area: { gap: spacing.xs, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
    areaLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: brandTokens.layout.minTouch },
    areaHeader: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
    areaTitle: { flex: 1 },
    primary: { flexShrink: 1, textAlign: 'right' },
    stacked: { flexDirection: 'column', alignItems: 'flex-start' },
    stackedPrimary: { textAlign: 'left' },
    preview: { gap: spacing.xs },
    reserve: { opacity: 0 },
    readout: { position: 'absolute', top: 0, left: 0, right: 0 },
    explore: { gap: spacing.xs, paddingTop: spacing.md },
});
