import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { AppText, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, brandTokens, spacing, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { GROUP_LABEL, factorLabel, factorSentence, factorValue, formatPct } from './comparison-change';
import { FactorScatter } from './comparison-parts';
import { InsightRow } from './insight-row';
import { dayLabel } from './insights-model';
import { progressOriginParams } from './navigation';
import { useRoutineRelation } from './routine-relation-view';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING: Record<string, string> = {
  no_registered_meal: 'sin comidas con hora en esas 3 h', untimed_meal_in_scope: 'con comidas sin hora', unverified_meal_time_in_scope: 'con una hora sin confirmar',
  no_start_time: 'sin hora de inicio', partial_macro: 'con una comida sin ese dato', no_explicit_meal_in_12h: 'sin comidas con hora en las 12 h previas',
  no_meals: 'sin comidas ese día', partial_sum: 'con una comida sin ese dato', not_recorded: 'sin registrar', night_undeclared: 'sin la noche declarada',
  night_declaration_outdated: 'editado sin volver a declarar la noche', unavailable: 'no disponible', late: 'respondida tarde', unknown_time: 'sin saber cuándo se respondió',
  other_instrument: 'con otra escala', unreadable: 'que no pudimos leer',
};

/**
 * #533 · One factor of one routine: a point per session (the factor across, the session's change up), the medians of the groups
 * and every session listed, newest first. The sentence only appears with three or more sessions in each group.
 */
export function FactorScreen() {
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const routine = typeof params.routine === 'string' && UUID.test(params.routine) ? params.routine.toLowerCase() : null;
  const key = typeof params.factor === 'string' ? params.factor : null;
  const { state, data, refresh } = useRoutineRelation(client, routine);
  const [selected, setSelected] = useState<number | undefined>(undefined);
  const scroll = (children: React.ReactNode) => <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll} testID="factor-screen">{children}</ScrollView>;
  if (!routine || !key) return scroll(<UnavailableState title="No encontramos este dato" description="Abrilo desde Comparaciones › Relación." />);
  if (state.status === 'loading' && !data) return scroll(<View style={styles.block}><SkeletonBlock height={56} /><SkeletonBlock height={180} /><SkeletonBlock height={160} /></View>);
  if (!data) return scroll(<InlineUnavailable message="No pudimos traer este dato." actionLabel="Reintentar" onAction={() => void refresh()} />);
  const index = data.factors.findIndex(row => row.key === key);
  const factor = data.factors[index];
  if (!factor) return scroll(<UnavailableState title="Este dato ya no está" description="Puede que la métrica se haya archivado." />);
  // A metric's name comes from the screen that opened this one; the routine's read does not carry names.
  const label = factor.metricId && typeof params.label === 'string' && params.label ? params.label : factorLabel(factor, []), sentence = factorSentence(factor, label);
  const rows = data.sessions.map(session => ({ session, value: session.values[index] ?? null })).filter(row => row.value !== null);
  const points = rows.filter(row => row.session.pct !== null).map(row => ({ x: row.value!, y: row.session.pct!, group: row.session.group === 'up' || row.session.group === 'same' || row.session.group === 'down' ? row.session.group : 'other' as const }));
  const missing = Object.entries(factor.missing).filter(([, count]) => count > 0).map(([reason, count]) => `${count} ${MISSING[reason] ?? 'sin dato'}`);
  const median = (stat: typeof factor.groups.up) => stat.median === null ? (stat.valid ? `faltan datos (${stat.valid})` : 'sin datos') : factorValue(factor, stat.median);
  return scroll(<>
    {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    <View style={styles.block}>
      <AppText muted variant="footnote">{data.routine.name ?? 'Rutina'} · últimos {data.window.days} días</AppText>
      <Heading level={1}>{label}</Heading>
      {sentence ? <AppText testID="factor-sentence">{sentence}</AppText> : <AppText muted testID="factor-no-sentence">Hacen falta 3 sesiones que suban y 3 que bajen con este dato para comparar sus medianas.</AppText>}
    </View>
    {points.length ? <FactorScatter points={points} selected={selected} onSelect={value => { haptics.selection(); setSelected(value); }}
      label={`${points.length} sesiones: ${label} contra el cambio de cada sesión. ${sentence ?? ''}`} /> : null}
    <View style={styles.block}>
      <View accessible style={styles.medians}>
        <AppText numeric>● {GROUP_LABEL.up} · {median(factor.groups.up)}</AppText>
        <AppText numeric>○ {GROUP_LABEL.down} · {median(factor.groups.down)}</AppText>
        <AppText muted numeric variant="footnote">= {GROUP_LABEL.same} · {median(factor.groups.same)}</AppText>
      </View>
      <AppText muted variant="footnote" numeric>{factor.valid} de {data.sessions.length} sesiones con dato{missing.length ? `. Faltan: ${missing.join(', ')}.` : '.'}</AppText>
    </View>
    <View>
      <AppText muted variant="footnote" accessibilityRole="header" style={styles.section}>Sesiones</AppText>
      {[...rows].reverse().map(({ session, value }) => <InsightRow key={session.sessionId} label={dayLabel(session.date)} detail={factorValue(factor, value!)}
        value={session.pct === null ? GROUP_LABEL[session.group] : `${GROUP_LABEL[session.group]} · ${formatPct(session.pct)}`}
        spoken={`${dayLabel(session.date)}: ${label} ${factorValue(factor, value!)}, ${GROUP_LABEL[session.group]}${session.pct === null ? '' : ` ${formatPct(session.pct)}`}. Ver la sesión`}
        onPress={() => router.push({ pathname: '/(tabs)/train/insights', params: { ...progressOriginParams(params), session: session.sessionId, date: session.date } })} />)}
    </View>
    <AppText muted variant="caption">Son tus registros: muestran qué coincidió, no qué te hizo subir o bajar.</AppText>
  </>);
}

const styles = StyleSheet.create({
  scroll: { alignSelf: 'center', flexGrow: 1, gap: spacing.xl, maxWidth: 720, padding: brandTokens.layout.screenPadding, paddingBottom: 120, width: '100%' },
  block: { gap: spacing.sm },
  medians: { gap: 2 },
  section: { paddingBottom: spacing.xs },
});
