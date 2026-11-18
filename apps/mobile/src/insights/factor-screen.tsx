import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { AppText, ExampleFrame, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, brandTokens, spacing, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { GROUP_LABEL, factorLabel, factorSentence, factorValue, formatPct } from './comparison-change';
import { FactorScatter } from './comparison-parts';
import { InsightRow } from './insight-row';
import { dayLabel } from './insights-model';
import { progressOriginParams } from './navigation';
import { comparable, useRoutineRelation } from './routine-relation-view';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Why a session has no value, as a row of the table. Kept short: the count says how many. */
const MISSING: Record<string, string> = {
  no_registered_meal: 'Sin comidas con hora en esas 3 h', untimed_meal_in_scope: 'Comidas sin hora', unverified_meal_time_in_scope: 'Comidas con hora aproximada',
  no_start_time: 'Sesión sin hora de inicio', partial_macro: 'Una comida sin ese dato', no_explicit_meal_in_12h: 'Sin comidas con hora en las 12 h previas',
  no_meals: 'Sin comidas ese día', partial_sum: 'Una comida sin ese dato', not_recorded: 'Sin registrar', night_undeclared: 'Sin la noche declarada',
  night_declaration_outdated: 'Editado sin volver a declarar la noche', unavailable: 'No disponible', late: 'Respondida tarde', unknown_time: 'Sin saber cuándo se respondió',
  other_instrument: 'Con otra escala', unreadable: 'No se pudo leer',
};
/** Reasons a time on the meals in Nutrición would fix. */
const MEAL_TIME = new Set(['untimed_meal_in_scope', 'unverified_meal_time_in_scope']);

/**
 * #533 · One factor of one routine (bocetos/relacion-clara, idea A). With three sessions in each group: the three medians, a point
 * per session with labelled axes and every session listed, newest first. Without them: how many sessions have the value, why the
 * others do not, and the sessions that do. The session chosen in Cómo llegaste arrives marked.
 */
export function FactorScreen() {
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const routine = typeof params.routine === 'string' && UUID.test(params.routine) ? params.routine.toLowerCase() : null;
  const key = typeof params.factor === 'string' ? params.factor : null;
  const { state, data, refresh } = useRoutineRelation(client, routine);
  const [selectedId, setSelectedId] = useState<string | null>(typeof params.pick === 'string' && UUID.test(params.pick) ? params.pick.toLowerCase() : null);
  // A tapped point marks its session in the list and brings it into view.
  const scrollRef = useRef<ScrollView>(null), listTop = useRef(0), rowTops = useRef(new Map<string, number>());
  const scroll = (children: React.ReactNode) => <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll} testID="factor-screen">{children}</ScrollView>;
  if (!routine || !key) return scroll(<UnavailableState title="No encontramos este dato" description="Abrilo desde Comparaciones › Cómo llegaste." />);
  if (state.status === 'loading' && !data) return scroll(<View style={styles.block}><SkeletonBlock height={56} /><SkeletonBlock height={180} /><SkeletonBlock height={160} /></View>);
  if (!data) return scroll(<InlineUnavailable message="No pudimos traer este dato." actionLabel="Reintentar" onAction={() => void refresh()} />);
  const index = data.factors.findIndex(row => row.key === key);
  const factor = data.factors[index];
  if (!factor) return scroll(<UnavailableState title="Este dato ya no está" description="Puede que la métrica se haya archivado." />);
  // A metric's name comes from the screen that opened this one; the routine's read does not carry names.
  const label = factor.metricId && typeof params.label === 'string' && params.label ? params.label : factorLabel(factor, []), sentence = factorSentence(factor, label);
  const total = data.sessions.length, ready = comparable(factor);
  const rows = data.sessions.map(session => ({ session, value: session.values[index] ?? null })).filter(row => row.value !== null);
  const plotted = rows.filter(row => row.session.pct !== null);
  const points = plotted.map(row => ({ x: row.value!, y: row.session.pct!, group: row.session.group === 'up' || row.session.group === 'same' || row.session.group === 'down' ? row.session.group : 'other' as const }));
  const selectedPoint = plotted.findIndex(row => row.session.sessionId === selectedId);
  const select = (point: number) => {
    const id = plotted[point]!.session.sessionId;
    haptics.selection(); setSelectedId(id);
    const top = rowTops.current.get(id);
    if (top !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, listTop.current + top - 120), animated: true });
  };
  const missing = Object.entries(factor.missing).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]);
  const lacking = missing.reduce((sum, [, count]) => sum + count, 0);
  const group = (name: 'up' | 'same' | 'down') => factor.groups[name];
  const medianText = (stat: typeof factor.groups.up) => stat.median === null ? '—' : factorValue(factor, stat.median);
  const withValue = (name: 'up' | 'down') => rows.filter(row => row.session.group === name).length;
  return scroll(<>
    {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    <View style={styles.block}>
      <AppText muted variant="footnote" style={styles.kicker}>{data.routine.name ?? 'Rutina'} · últimos {data.window.days} días</AppText>
      <Heading level={1}>{label}</Heading>
    </View>
    {ready ? <View style={styles.block}>
      <View accessible accessibilityLabel={sentence ?? undefined} style={styles.pair} testID="factor-medians">
        {(['up', 'down', 'same'] as const).map(name => <View key={name} style={name === 'same' ? styles.pairSame : styles.pairCell}>
          <AppText muted variant="caption" numeric>{name === 'up' ? '●' : name === 'down' ? '○' : '='} {name === 'up' ? 'Subieron' : name === 'down' ? 'Bajaron' : 'Igual'} · {group(name).valid}</AppText>
          <AppText variant={name === 'same' ? 'headline' : 'title1'} numeric muted={name === 'same'}>{medianText(group(name))}</AppText>
        </View>)}
      </View>
      <AppText muted variant="footnote" numeric>Mediana de cada grupo · {factor.valid} de {total} sesiones con dato</AppText>
      {points.length ? <FactorScatter points={points} selected={selectedPoint >= 0 ? selectedPoint : undefined} onSelect={select} axis={`${label.toLowerCase()}`}
        formatX={value => factorValue(factor, value)} medians={{ up: factor.groups.up.median, down: factor.groups.down.median }}
        label={`${points.length} sesiones: ${label} contra el cambio de cada sesión. ${sentence ?? ''}`} /> : null}
      {points.length ? <AppText muted variant="caption" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">● subió · ○ bajó · gris claro: igual · borde dorado: mixta · rayas: medianas</AppText> : null}
    </View> : <View style={styles.block} testID="factor-not-ready">
      <AppText accessibilityLabel={`${factor.valid} de ${total} sesiones con este dato`}><AppText variant="heroNumber" numeric>{factor.valid}</AppText><AppText variant="title2" muted numeric> de {total}</AppText></AppText>
      <AppText muted variant="footnote">sesiones con este dato</AppText>
      <AppText numeric>Para comparar hacen falta 3 que suban y 3 que bajen. Con dato hay {withValue('up')} {withValue('up') === 1 ? 'que subió' : 'que subieron'} y {withValue('down')} {withValue('down') === 1 ? 'que bajó' : 'que bajaron'}.</AppText>
      {missing.length ? <View style={styles.why} testID="factor-why">
        <AppText muted variant="footnote" accessibilityRole="header" style={styles.kicker}>Por qué faltan {lacking}</AppText>
        {missing.map(([reason, count]) => <View key={reason} accessible accessibilityLabel={`${MISSING[reason] ?? 'Sin dato'}: ${count}`} style={[styles.whyRow, { borderColor: colors.border }]}>
          <AppText style={styles.flex}>{MISSING[reason] ?? 'Sin dato'}</AppText><AppText variant="headline" numeric>{count}</AppText>
        </View>)}
        {missing.some(([reason]) => MEAL_TIME.has(reason)) ? <AppText muted variant="footnote" testID="factor-meal-time">Si les ponés la hora a esas comidas en Nutrición, estas sesiones suman.</AppText> : null}
      </View> : null}
      <ExampleFrame>
        <View style={styles.pair}>
          {['● Subieron', '○ Bajaron', '= Igual'].map(name => <View key={name} style={styles.pairCell}><AppText muted variant="caption">{name}</AppText><AppText muted variant="title2">—</AppText></View>)}
        </View>
      </ExampleFrame>
    </View>}
    {rows.length ? <View onLayout={event => { listTop.current = event.nativeEvent.layout.y; }}>
      <AppText muted variant="footnote" accessibilityRole="header" style={[styles.section, styles.kicker]}>{ready ? 'Sesiones' : 'Sesiones con dato'}</AppText>
      {[...rows].reverse().map(({ session, value }) => <View key={session.sessionId} testID={`factor-session-${session.sessionId}`} accessibilityState={{ selected: session.sessionId === selectedId }}
        onLayout={event => { rowTops.current.set(session.sessionId, event.nativeEvent.layout.y); }}
        style={session.sessionId === selectedId ? [styles.selected, { backgroundColor: colors.brandSubtle }] : undefined}><InsightRow label={dayLabel(session.date)} detail={factorValue(factor, value!)}
        value={session.pct === null ? GROUP_LABEL[session.group] : `${GROUP_LABEL[session.group]} · ${formatPct(session.pct)}`}
        spoken={`${dayLabel(session.date)}: ${label} ${factorValue(factor, value!)}, ${GROUP_LABEL[session.group]}${session.pct === null ? '' : ` ${formatPct(session.pct)}`}. Ver la sesión`}
        onPress={() => router.push({ pathname: '/(tabs)/train/insights', params: { ...progressOriginParams(params), session: session.sessionId, date: session.date } })} /></View>)}
    </View> : null}
    <AppText muted variant="caption">Muestra qué coincidió, no por qué.</AppText>
  </>);
}

const styles = StyleSheet.create({
  scroll: { alignSelf: 'center', flexGrow: 1, gap: spacing.xl, maxWidth: 720, padding: brandTokens.layout.screenPadding, paddingBottom: 120, width: '100%' },
  block: { gap: spacing.sm },
  flex: { flex: 1, flexShrink: 1 },
  kicker: { letterSpacing: 0.8, fontWeight: '600', textTransform: 'uppercase' },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  pairCell: { flexGrow: 1, flexBasis: 90, gap: 1 },
  pairSame: { flexGrow: 0.8, flexBasis: 70, gap: 1, justifyContent: 'flex-end' },
  why: { gap: 0, marginTop: spacing.sm },
  whyRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  section: { paddingBottom: spacing.xs },
  selected: { borderRadius: brandTokens.radius.inner, paddingHorizontal: spacing.sm, marginHorizontal: -spacing.sm },
});
