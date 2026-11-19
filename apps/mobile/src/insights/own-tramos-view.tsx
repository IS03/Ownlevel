import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { useRouter } from 'expo-router';
import type { MobileApiClient } from '@/api/client';
import type { InsightsSummary, OwnFactor } from '@/api/performance-insights';
import { AppIcon, AppSheet, AppText, Chip, InlineUnavailable, SegmentedControl, SkeletonBlock, brandTokens, pressedStyle, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { InsightRow } from './insight-row';
import type { InsightsOrigin } from './navigation';
import { binLabel, factorsOf, measured, ownLabel, phrase, type Horizon } from './own-model';
import { OwnMethod, TramoBars, useOwnPerformance } from './own-parts';

const HORIZONS = [{ value: 'day', label: 'Ese día' }, { value: 'week', label: 'La semana anterior' }] as const;

/**
 * Cómo llegaste por tramos (bocetos/rendimiento-tramos, T1). All routines by default, one with its chip. Each factor in tramos of
 * the person's own values with their performance against «lo tuyo»; the ones without six sessions in every tramo wait together.
 */
export function OwnTramosView({ client, metrics, router, origin, onStatistics, evaluated, initialRoutine = null }: { client: MobileApiClient | null; metrics: InsightsSummary['metrics']; router: ReturnType<typeof useRouter>; origin: InsightsOrigin; onStatistics: () => void; evaluated?: number; initialRoutine?: string | null }) {
  const [routine, setRoutine] = useState<string | null>(initialRoutine?.toLowerCase() ?? null);
  const [horizon, setHorizon] = useState<Horizon>('day');
  const [sheet, setSheet] = useState<'missing' | 'method' | null>(null);
  const { colors } = useOwnlevelTheme();
  const { state, data, refresh } = useOwnPerformance(client, routine);
  // The chips come from the read of all routines, so they do not change when one is chosen.
  const all = useOwnPerformance(client, null, routine !== null);
  if (state.status === 'loading' && !data) return <View style={styles.block} testID="own-loading"><SkeletonBlock height={36} /><SkeletonBlock height={36} /><SkeletonBlock height={260} /></View>;
  if (!data) return <InlineUnavailable message="No pudimos traer cómo llegaste." actionLabel="Reintentar" onAction={() => void refresh()} />;
  const routines = (routine ? all.data ?? data : data).routines;
  const total = routines.reduce((sum, row) => sum + row.sessions, 0);
  const { ready, waiting } = factorsOf(data, horizon);
  const count = measured(data);
  const clear = ready.filter(factor => phrase(factor, metrics)?.clear), unclear = ready.filter(factor => !phrase(factor, metrics)?.clear);
  const open = (factor: OwnFactor) => { haptics.selection(); setSheet(null);
    router.push({ pathname: '/(tabs)/train/insights/tramo', params: { ...origin, factor: factor.key, horizon, ...(routine ? { routine } : {}), label: ownLabel(factor, metrics) } }); };
  return <View style={styles.block} testID="own-tramos">
    {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    {routines.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel="Elegir rutina" accessibilityRole="radiogroup">
      <Chip label={`Todas · ${total}`} accessibilityLabel={`Todas las rutinas, ${total} sesiones`} selected={routine === null} onPress={() => { haptics.selection(); setRoutine(null); }} />
      {routines.map(option => <Chip key={option.id} label={`${option.name ?? 'Rutina'} · ${option.sessions}`} accessibilityLabel={`${option.name ?? 'Rutina'}, ${option.sessions} ${option.sessions === 1 ? 'sesión' : 'sesiones'}`}
        selected={option.id === routine} onPress={() => { haptics.selection(); setRoutine(option.id); }} />)}
    </ScrollView> : null}
    <SegmentedControl accessibilityLabel="Qué mirar: ese día o la semana anterior" value={horizon} options={HORIZONS} onChange={value => { haptics.selection(); setHorizon(value); }} />
    <AppText muted variant="footnote" numeric testID="own-tramos-line">{count} {count === 1 ? 'sesión' : 'sesiones'} con rendimiento frente a lo tuyo · {horizon === 'day' ? 'lo de ese día' : 'los 7 días anteriores'}</AppText>
    {count === 0 ? <AppText muted>Todavía no hay sesiones con «lo tuyo» armado: hace falta repetir cada ejercicio 3 veces. Cuando las haya, los tramos aparecen acá.</AppText> : null}
    {ready.length ? <View testID="own-tramos-ready">
      {clear.map(factor => <FactorRow key={factor.key} factor={factor} metrics={metrics} onPress={() => open(factor)} />)}
      {/* The rest keep their fixed order under one line, instead of the same «Sin diferencia clara» on every row. */}
      {unclear.length ? <AppText muted variant="footnote" style={clear.length ? styles.kicker : undefined} testID="own-tramos-unclear">
        {clear.length ? 'Sin diferencia clara' : 'Por ahora ningún dato se separa de lo tuyo: tus sesiones rinden parecido en todos los tramos.'}</AppText> : null}
      {unclear.map(factor => <FactorRow key={factor.key} factor={factor} metrics={metrics} quiet onPress={() => open(factor)} />)}
    </View> : null}
    {waiting.length && count ? <InsightRow label={`Todavía sin datos para comparar · ${waiting.length}`} detail={waiting.map(factor => ownLabel(factor, metrics)).join(', ')}
      spoken={`${waiting.length} datos todavía sin datos para comparar: ${waiting.map(factor => ownLabel(factor, metrics)).join(', ')}. Ver por qué`} onPress={() => { haptics.selection(); setSheet('missing'); }} /> : null}
    <View style={styles.method}>
      <AppText muted variant="footnote" style={styles.flex}>Muestra qué coincidió, no por qué.</AppText>
      <Pressable accessibilityRole="button" hitSlop={12} onPress={() => { haptics.selection(); setSheet('method'); }} testID="own-method-link">
        <AppText variant="footnote" style={{ color: colors.primary, fontWeight: '600' }}>Cómo se calcula</AppText>
      </Pressable>
    </View>
    <InsightRow label="Todas las relaciones" detail={evaluated ? `Las ${evaluated} que evaluamos, también las que no dieron nada` : 'Las que evaluamos, también las que no dieron nada'} spoken="Ver todas las relaciones" onPress={onStatistics} />
    {sheet ? <AppSheet onClose={() => setSheet(null)} closeLabel="Cerrar" testID={sheet === 'missing' ? 'own-missing-sheet' : 'own-method-sheet'} style={{ backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.sheet}>
        {sheet === 'missing' ? <>
          <AppText variant="title2" accessibilityRole="header">Todavía sin datos para comparar</AppText>
          <AppText muted>Cada tramo necesita 6 sesiones con el dato. Tocá uno para ver qué falta.</AppText>
          <View>{waiting.map(factor => <InsightRow key={factor.key} label={ownLabel(factor, metrics)} value={`${factor.valid} de ${count}`}
            spoken={`${ownLabel(factor, metrics)}: ${factor.valid} de ${count} sesiones con dato. Ver detalle`} onPress={() => open(factor)} />)}</View>
        </> : <>
          <AppText variant="title2" accessibilityRole="header">Cómo se calcula</AppText>
          <OwnMethod tramos />
        </>}
      </ScrollView>
    </AppSheet> : null}
  </View>;
}

function FactorRow({ factor, metrics, onPress, quiet = false }: { factor: OwnFactor; metrics: InsightsSummary['metrics']; onPress: () => void; quiet?: boolean }) {
  const { colors } = useOwnlevelTheme();
  const { fontScale } = useWindowDimensions();
  const reduced = useReduceMotion();
  const label = ownLabel(factor, metrics), said = phrase(factor, metrics);
  const tramos = factor.bins.map(bin => `${binLabel(factor, bin)}: ${bin.mean === null ? 'sin dato' : `${bin.mean > 0 ? 'más' : bin.mean < 0 ? 'menos' : ''} ${Math.abs(bin.mean).toString().replace('.', ',')} por ciento`}, ${bin.n} sesiones`).join('; ');
  return <Pressable accessibilityRole="button" testID={`own-factor-${factor.key}`} accessibilityLabel={`${label}. ${said?.text ?? ''}. ${tramos}. Ver detalle`}
    onPress={onPress} style={({ pressed }) => [styles.row, { borderColor: colors.border }, pressedStyle(pressed, reduced)]}>
    <View style={styles.flex}>
      <AppText>{label}</AppText>
      {said && !quiet ? <AppText muted={!said.clear} variant="footnote" style={said.clear ? { fontWeight: '600' } : undefined}>{said.text}</AppText> : null}
    </View>
    {fontScale > 1.3 ? null : <TramoBars factor={factor} />}
    <AppIcon color={colors.textMuted} name="chevronRight" size={15} />
  </Pressable>;
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  flex: { flex: 1, flexShrink: 1 },
  chips: { gap: spacing.sm, paddingVertical: 2 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  kicker: { paddingTop: spacing.lg, paddingBottom: spacing.xs, fontWeight: '600' },
  method: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md },
  sheet: { gap: spacing.md, padding: brandTokens.layout.screenPadding, paddingBottom: spacing.xxl },
});
