import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMobileApi } from '@/api';
import { AppSheet, AppText, ExampleFrame, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, brandTokens, spacing, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { formatPct } from './comparison-change';
import { MISSING_TEXT, binLabel, measured, ownLabel, phrase, ready, type Horizon } from './own-model';
import { OwnMethod, TramoChart, useOwnPerformance } from './own-parts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIRECTION: Record<string, string> = { up: '↑ más con más', down: '↓ menos con más', flat: '= igual', few: 'pocas sesiones' };

/**
 * One factor in tramos (bocetos/rendimiento-tramos, T2 and T4). With six sessions in every tramo: the chart, the sentence only when
 * the server called the difference clear, and the same comparison per routine. Without them: how many sessions have the value and
 * why the others do not.
 */
export function TramoScreen() {
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const params = useLocalSearchParams();
  const routine = typeof params.routine === 'string' && UUID.test(params.routine) ? params.routine.toLowerCase() : null;
  const horizon: Horizon = params.horizon === 'week' ? 'week' : 'day';
  const key = typeof params.factor === 'string' ? params.factor : null;
  const { state, data, refresh } = useOwnPerformance(client, routine, !!key);
  const [method, setMethod] = useState(false);
  const scroll = (children: React.ReactNode) => <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll} testID="tramo-screen">{children}</ScrollView>;
  if (!key) return scroll(<UnavailableState title="No encontramos este dato" description="Abrilo desde Comparaciones › Cómo llegaste." />);
  if (state.status === 'loading' && !data) return scroll(<View style={styles.block}><SkeletonBlock height={56} /><SkeletonBlock height={210} /><SkeletonBlock height={120} /></View>);
  if (!data) return scroll(<InlineUnavailable message="No pudimos traer este dato." actionLabel="Reintentar" onAction={() => void refresh()} />);
  const factor = data.factors[horizon].find(row => row.key === key);
  if (!factor) return scroll(<UnavailableState title="Este dato ya no está" description="Puede que la métrica se haya archivado." />);
  const metrics = factor.metricId && typeof params.label === 'string' ? [{ id: factor.metricId, name: params.label.replace(/ (ayer|promedio)$/, '') }] : [];
  const label = ownLabel(factor, metrics), said = phrase(factor, metrics), total = measured(data);
  const scope = `${routine ? data.routines.find(row => row.id === routine)?.name ?? 'Rutina' : 'Todas las rutinas'} · ${horizon === 'day' ? 'ese día' : 'la semana anterior'}`;
  const missing = Object.entries(factor.missing).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const lacking = missing.reduce((sum, [, n]) => sum + n, 0);
  const chartLabel = `${label}: ${factor.bins.map(bin => `${binLabel(factor, bin)}, ${bin.mean === null ? 'sin dato suficiente' : formatPct(bin.mean)}, ${bin.n} sesiones`).join('; ')}`;
  return scroll(<>
    {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    <View style={styles.block}>
      <AppText muted variant="footnote" style={styles.kicker} numeric>{`${scope} · ${factor.valid} sesiones`}</AppText>
      <Heading level={1}>{label}</Heading>
    </View>
    {ready(factor) ? <View style={styles.block} testID="tramo-ready">
      <TramoChart factor={factor} sessions={data.sessions} label={chartLabel} />
      {said ? <View style={styles.saidLine}>
        <View style={[styles.pill, { backgroundColor: said.clear ? colors.brandSubtle : colors.surfaceRaised }]}><AppText variant="footnote" style={{ color: said.clear ? colors.primary : colors.textMuted, fontWeight: '600' }} testID="tramo-phrase">{said.text}</AppText></View>
        {factor.difference !== null ? <AppText muted variant="footnote" numeric style={styles.flex}>{said.clear
          ? `diferencia ${formatPct(Math.abs(factor.difference)).replace('+', '')}, más que lo que tus sesiones varían`
          : `la diferencia (${formatPct(Math.abs(factor.difference)).replace('+', '')}) entra en lo que tus sesiones varían`}</AppText> : null}
      </View> : null}
      {factor.byRoutine.length > 1 ? <View style={styles.block} testID="tramo-routines">
        <AppText muted variant="footnote" accessibilityRole="header" style={styles.kicker}>¿Pasa en cada rutina?</AppText>
        {factor.byRoutine.map(row => <View key={row.routineId} style={[styles.tableRow, { borderColor: colors.border }]} accessible accessibilityLabel={`${row.name ?? 'Rutina'}: ${DIRECTION[row.direction]}`}>
          <AppText style={styles.flex}>{row.name ?? 'Rutina'}</AppText>
          <AppText variant={row.direction === 'few' ? 'footnote' : 'headline'} muted={row.direction === 'few'}>{DIRECTION[row.direction]}</AppText>
        </View>)}
      </View> : null}
    </View> : <View style={styles.block} testID="tramo-waiting">
      <AppText accessibilityLabel={`${factor.valid} de ${total} sesiones con este dato`}><AppText variant="heroNumber" numeric>{factor.valid}</AppText><AppText variant="title2" muted numeric> de {total}</AppText></AppText>
      <AppText muted variant="footnote">sesiones con este dato</AppText>
      <AppText>Todavía no sabemos. {factor.bins.length < 2 ? 'Los valores son casi todos iguales: no hay tramos para comparar.' : `Hace falta llegar a ${data.rules.minPerBin} sesiones en cada tramo.`}</AppText>
      {factor.bins.length >= 2 ? <View testID="tramo-bins">
        <AppText muted variant="footnote" accessibilityRole="header" style={styles.kicker}>Sesiones por tramo</AppText>
        {factor.bins.map((bin, index) => <View key={index} style={[styles.tableRow, { borderColor: colors.border }]} accessible accessibilityLabel={`${binLabel(factor, bin)}: ${bin.n} de ${data.rules.minPerBin}`}>
          <AppText style={styles.flex}>{binLabel(factor, bin)}</AppText>
          <AppText variant="headline" numeric muted={bin.n < data.rules.minPerBin}>{bin.n}<AppText muted variant="footnote" numeric>{` de ${data.rules.minPerBin}`}</AppText></AppText>
        </View>)}
      </View> : null}
      {missing.length ? <View testID="tramo-why" style={styles.why}>
        <AppText muted variant="footnote" accessibilityRole="header" style={styles.kicker}>Por qué faltan {lacking}</AppText>
        {missing.map(([reason, n]) => <View key={reason} style={[styles.tableRow, { borderColor: colors.border }]} accessible accessibilityLabel={`${MISSING_TEXT[reason] ?? 'Sin dato'}: ${n}`}>
          <AppText style={styles.flex}>{MISSING_TEXT[reason] ?? 'Sin dato'}</AppText><AppText variant="headline" numeric>{n}</AppText>
        </View>)}
      </View> : null}
      {factor.bins.length < 2 ? <ExampleFrame>
        <View style={styles.example}>{['poco', 'medio', 'mucho'].map(name => <View key={name} style={styles.exampleCell}><AppText muted variant="title2">—</AppText><AppText muted variant="caption">{name}</AppText></View>)}</View>
      </ExampleFrame> : null}
    </View>}
    <View style={styles.method}>
      <AppText muted variant="footnote" style={styles.flex}>Muestra qué coincidió, no por qué.</AppText>
      <Pressable accessibilityRole="button" hitSlop={12} onPress={() => { haptics.selection(); setMethod(true); }} testID="tramo-method-link">
        <AppText variant="footnote" style={{ color: colors.primary, fontWeight: '600' }}>Cómo se calcula</AppText>
      </Pressable>
    </View>
    {method ? <AppSheet onClose={() => setMethod(false)} closeLabel="Cerrar" testID="tramo-method-sheet" style={{ backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.sheet}><AppText variant="title2" accessibilityRole="header">Cómo se calcula</AppText><OwnMethod tramos /></ScrollView>
    </AppSheet> : null}
  </>);
}

const styles = StyleSheet.create({
  scroll: { alignSelf: 'center', flexGrow: 1, gap: spacing.xl, maxWidth: 720, padding: brandTokens.layout.screenPadding, paddingBottom: 120, width: '100%' },
  block: { gap: spacing.sm },
  flex: { flex: 1, flexShrink: 1 },
  kicker: { letterSpacing: 0.8, fontWeight: '600', textTransform: 'uppercase' },
  saidLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  pill: { borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 4 },
  tableRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  why: { marginTop: spacing.sm },
  example: { flexDirection: 'row', gap: spacing.md },
  exampleCell: { flex: 1, alignItems: 'center', gap: 2 },
  method: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sheet: { gap: spacing.md, padding: brandTokens.layout.screenPadding, paddingBottom: spacing.xxl },
});
