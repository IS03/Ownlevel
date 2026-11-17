import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { useRouter } from 'expo-router';
import type { MobileApiClient } from '@/api/client';
import { fetchRoutineRelation, type InsightsRoutineRelationView, type InsightsSummary, type RelationFactor } from '@/api/performance-insights';
import { AppIcon, AppText, ChipGroup, ExampleFrame, InlineUnavailable, SkeletonBlock, pressedStyle, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { useProgressResource } from '@/progress/use-progress-resource';
import { GROUP_LABEL, factorLabel, factorSummary } from './comparison-change';
import { ChangeBars, MedianPair } from './comparison-parts';
import { InsightRow } from './insight-row';
import type { DayLanes } from './insights-model';
import type { InsightsOrigin } from './navigation';

/** The same read for the view and for a factor's detail: one cache entry per routine. */
export const routineRelationKey = (routine: string) => `performance-insights|routine-relation|${routine}`;
export function useRoutineRelation(client: MobileApiClient | null, routine: string | null) {
  const load = useCallback((c: MobileApiClient, signal: AbortSignal) => fetchRoutineRelation(c, routine!, signal), [routine]);
  return useProgressResource<InsightsRoutineRelationView>(routine ? client : null, routineRelationKey(routine ?? 'none'), load);
}
/** The routine of the newest session read, as the view's first focus. */
export function latestRoutine(days: readonly DayLanes[]) {
  for (const day of days) for (const session of day.strict.sessions) if (session.routineId) return session.routineId.toLowerCase();
  return null;
}
/** Bars and their words: the session's measured change, a gap for one without it. */
export function relationBars(model: InsightsRoutineRelationView) {
  const values = model.sessions.map(session => session.eligible ? session.pct : null);
  const { up, same, down, mixed, load_only: load, not_compared: none } = model.counts;
  const others = [mixed ? `${mixed} ${mixed === 1 ? 'mixta' : 'mixtas'}` : '', load ? `${load} solo peso` : '', none ? `${none} sin comparar` : ''].filter(Boolean);
  return { values, line: `↑ ${up}  = ${same}  ↓ ${down}`, others: others.join(' · '),
    spoken: `${model.sessions.length} sesiones de ${model.routine.name ?? 'esta rutina'}: ${up} subieron, ${same} iguales, ${down} bajaron${others.length ? `, ${others.join(', ')}` : ''}.` };
}
/** The scale of one factor's two medians: every valid value of the routine, so the dots sit where the sessions were. */
function scaleOf(model: InsightsRoutineRelationView, index: number) {
  const values = model.sessions.map(session => session.values[index]).filter((value): value is number => value !== null && value !== undefined);
  return values.length ? { min: Math.min(...values), max: Math.max(...values) } : { min: 0, max: 1 };
}

/**
 * #533 · Relación: one routine at a time. How each session went (its measured change) and how the person arrived at the ones
 * that went up and down. Medians from three sessions per group, factors in a fixed order, and never a cause.
 */
export function RoutineRelationView({ client, days, metrics, router, origin, onStatistics, initialRoutine = null }: { client: MobileApiClient | null; days: readonly DayLanes[]; metrics: InsightsSummary['metrics']; router: ReturnType<typeof useRouter>; origin: InsightsOrigin; onStatistics: () => void; initialRoutine?: string | null }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const routine = chosen ?? initialRoutine?.toLowerCase() ?? latestRoutine(days);
  const { state, data, refresh } = useRoutineRelation(client, routine);
  if (!routine) return <View style={styles.block} testID="relation-no-routine">
    <AppText variant="headline">Todavía sin rutinas</AppText>
    <AppText muted>Relación compara las sesiones de una misma rutina. Cuando entrenes con una, aparece acá.</AppText>
  </View>;
  if (state.status === 'loading' && !data) return <View style={styles.block} testID="relation-loading"><SkeletonBlock height={44} /><SkeletonBlock height={96} /><SkeletonBlock height={220} /></View>;
  if (!data) return <InlineUnavailable message="No pudimos traer la relación de esta rutina." actionLabel="Reintentar" onAction={() => void refresh()} />;
  const bars = relationBars(data);
  const options = data.routines.length ? data.routines.map(row => ({ value: row.id, label: row.name ?? 'Rutina' })) : [{ value: routine, label: data.routine.name ?? 'Rutina' }];
  const short = data.counts.up < data.minimumPerGroup || data.counts.down < data.minimumPerGroup;
  const missing = Math.max(0, data.minimumPerGroup - data.counts.up) + Math.max(0, data.minimumPerGroup - data.counts.down);
  return <View style={styles.block} testID="relation-view">
    {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    {options.length > 1 ? <ChipGroup accessibilityLabel="Elegir rutina" value={routine} options={options} onChange={value => { haptics.selection(); setChosen(value); }} /> : null}
    <AppText muted variant="footnote" numeric>Últimos {data.window.days} días · {data.sessions.length} {data.sessions.length === 1 ? 'sesión' : 'sesiones'} de {data.routine.name ?? 'esta rutina'}</AppText>
    {data.sessions.length ? <>
      <AppText muted variant="footnote">Reps al mismo peso, frente a la sesión anterior</AppText>
      <ChangeBars values={bars.values} selected={bars.values.length - 1} label={bars.spoken} />
      <View style={styles.counts}><AppText numeric>{bars.line}</AppText>{bars.others ? <AppText muted numeric variant="footnote">{bars.others}</AppText> : null}</View>
    </> : <AppText muted>Todavía no hay sesiones de esta rutina en estos días.</AppText>}
    {short && data.sessions.length ? <View style={styles.block} testID="relation-short">
      {/* The real screen with sample marks greyed and labeled, never numbers that look like the person's (IDENTIDAD.md § Estados vacíos). */}
      <ExampleFrame>
        <View style={styles.exampleHeader}><AppText muted variant="headline" style={styles.flex}>Cómo llegaste</AppText><AppText muted variant="caption">● Subió   ○ Bajó</AppText></View>
        {EXAMPLE_ROWS.map(label => <View key={label} style={styles.exampleRow}>
          <AppText muted style={styles.flex}>{label}</AppText>
          <AppText muted numeric>— · —</AppText>
        </View>)}
      </ExampleFrame>
      <AppText variant="title1" numeric>{missing === 1 ? '1 sesión más' : `${missing} sesiones más`}</AppText>
      <AppText muted numeric>Con 3 que suban y 3 que bajen, esta tabla pasa a ser tuya. Hoy: {data.counts.up} {data.counts.up === 1 ? 'subió' : 'subieron'} y {data.counts.down} {data.counts.down === 1 ? 'bajó' : 'bajaron'}.</AppText>
      <AppText muted variant="footnote">Abajo, lo que ya hay.</AppText>
    </View> : null}
    {data.sessions.length ? <FactorTable model={data} metrics={metrics} onOpen={factor => { haptics.selection(); router.push({ pathname: '/(tabs)/train/insights/factor', params: { ...origin, routine, factor: factor.key, label: factorLabel(factor, metrics) } }); }} /> : null}
    <AppText muted variant="caption">Son tus registros: muestran qué coincidió, no qué te hizo subir o bajar. El orden de las filas es siempre el mismo.</AppText>
    <InsightRow label="Relaciones estadísticas" detail="La lista anterior, con todas las relaciones evaluadas" spoken="Ver relaciones estadísticas" onPress={onStatistics} />
  </View>;
}

function FactorTable({ model, metrics, onOpen }: { model: InsightsRoutineRelationView; metrics: InsightsSummary['metrics']; onOpen: (factor: RelationFactor) => void }) {
  const { colors } = useOwnlevelTheme();
  const { fontScale } = useWindowDimensions();
  const reduced = useReduceMotion();
  return <View testID="relation-factors">
    <View style={styles.header}>
      <AppText variant="headline" accessibilityRole="header" style={styles.flex}>Cómo llegaste</AppText>
      <AppText muted numeric variant="caption">● {GROUP_LABEL.up} {model.counts.up}   ○ {GROUP_LABEL.down} {model.counts.down}</AppText>
    </View>
    {model.factors.map((factor, index) => { const label = factorLabel(factor, metrics), scale = scaleOf(model, index), summary = factorSummary(factor);
      return <Pressable key={factor.key} accessibilityRole="button" testID={`relation-factor-${factor.key}`}
        accessibilityLabel={`${label}. Mediana en las que subieron y en las que bajaron: ${summary}. ${factor.valid} de ${model.sessions.length} sesiones con dato. Ver detalle`}
        onPress={() => onOpen(factor)} style={({ pressed }) => [styles.row, { borderColor: colors.border }, pressedStyle(pressed, reduced)]}>
        <View style={styles.flex}>
          <AppText>{label}</AppText>
          <AppText muted numeric variant="footnote">{summary}</AppText>
        </View>
        {fontScale > 1.3 ? null : <MedianPair up={factor.groups.up.median} down={factor.groups.down.median} min={scale.min} max={scale.max} />}
        <AppIcon color={colors.textMuted} name="chevronRight" size={15} />
      </Pressable>; })}
  </View>;
}

const EXAMPLE_ROWS = ['Carbos 3 h antes', 'Última comida', 'Proteína ayer'];
const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  flex: { flex: 1, flexShrink: 1 },
  counts: { gap: 2 },
  exampleHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  exampleRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.xs, flexWrap: 'wrap' },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
});
