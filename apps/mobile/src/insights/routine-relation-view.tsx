import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { useRouter } from 'expo-router';
import type { MobileApiClient } from '@/api/client';
import { fetchRoutineRelation, type InsightsRoutineRelationView, type InsightsSummary, type RelationFactor } from '@/api/performance-insights';
import { AppIcon, AppSheet, AppText, Chip, ExampleFrame, InlineUnavailable, SkeletonBlock, brandTokens, pressedStyle, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { useProgressResource } from '@/progress/use-progress-resource';
import { GROUP_LABEL, factorLabel, factorValue, formatPct } from './comparison-change';
import { ChangeBars, FactorStrip, shortDate, type ChangeBar } from './comparison-parts';
import { InsightRow } from './insight-row';
import { dayLabel, type DayLanes } from './insights-model';
import { progressOriginParams, type InsightsOrigin } from './navigation';

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
type Session = InsightsRoutineRelationView['sessions'][number];
const sessionValue = (session: Session) => session.pct === null ? GROUP_LABEL[session.group] : `${GROUP_LABEL[session.group]} · ${formatPct(session.pct)}`;
/** Bars and their words: the session's measured change, a gap for one without it, hollow when mixed. */
export function relationBars(model: InsightsRoutineRelationView) {
  const bars: ChangeBar[] = model.sessions.map(session => ({ value: session.eligible ? session.pct : null, hollow: session.group === 'mixed',
    spoken: `${dayLabel(session.date)}: ${sessionValue(session)}` }));
  const { up, same, down, mixed, load_only: load, not_compared: none } = model.counts;
  const others = [mixed ? `${mixed} ${mixed === 1 ? 'mixta' : 'mixtas'}` : '', load ? `${load} solo peso` : '', none ? `${none} sin comparar` : ''].filter(Boolean);
  return { bars, counts: [{ mark: '↑', n: up, word: up === 1 ? 'subió' : 'subieron' }, { mark: '=', n: same, word: 'igual' }, { mark: '↓', n: down, word: down === 1 ? 'bajó' : 'bajaron' }], others: others.join(' · '),
    spoken: `${model.sessions.length} sesiones de ${model.routine.name ?? 'esta rutina'}: ${up} subieron, ${same} iguales, ${down} bajaron${others.length ? `, ${others.join(', ')}` : ''}.` };
}
/** A factor reads as a comparison only with both medians: three sessions with a value that went up and three that went down. */
export const comparable = (factor: RelationFactor) => factor.groups.up.median !== null && factor.groups.down.median !== null;
const valuesOf = (model: InsightsRoutineRelationView, index: number) =>
  model.sessions.map(session => session.values[index]).filter((value): value is number => value !== null && value !== undefined);

/**
 * #533 · Cómo llegaste (bocetos/relacion-clara, idea A): one routine at a time. Each session's measured change as a bar that can be
 * chosen, then how the person arrived: for each factor the medians of the sessions that went up and down, and the chosen session's
 * own value. Medians from three sessions per group, factors in a fixed order, the ones without enough data together, never a cause.
 */
export function RoutineRelationView({ client, days, metrics, router, origin, onStatistics, evaluated, initialRoutine = null }: { client: MobileApiClient | null; days: readonly DayLanes[]; metrics: InsightsSummary['metrics']; router: ReturnType<typeof useRouter>; origin: InsightsOrigin; onStatistics: () => void; evaluated?: number; initialRoutine?: string | null }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ routine: string; sessionId: string } | null>(null);
  const [sheet, setSheet] = useState<'missing' | 'method' | null>(null);
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const routine = chosen ?? initialRoutine?.toLowerCase() ?? latestRoutine(days);
  const { state, data, refresh } = useRoutineRelation(client, routine);
  if (!routine) return <View style={styles.block} testID="relation-no-routine">
    <AppText variant="headline">Todavía sin rutinas</AppText>
    <AppText muted>Cómo llegaste compara las sesiones de una misma rutina. Cuando entrenes con una, aparece acá.</AppText>
  </View>;
  if (state.status === 'loading' && !data) return <View style={styles.block} testID="relation-loading"><SkeletonBlock height={44} /><SkeletonBlock height={96} /><SkeletonBlock height={220} /></View>;
  if (!data) return <InlineUnavailable message="No pudimos traer cómo llegaste a esta rutina." actionLabel="Reintentar" onAction={() => void refresh()} />;
  const bars = relationBars(data), sessions = data.sessions;
  const options = data.routines.length ? data.routines.map(row => ({ value: row.id, label: row.name ?? 'Rutina', sessions: row.sessions })) : [{ value: routine, label: data.routine.name ?? 'Rutina', sessions: sessions.length }];
  const short = data.counts.up < data.minimumPerGroup || data.counts.down < data.minimumPerGroup;
  const missing = Math.max(0, data.minimumPerGroup - data.counts.up) + Math.max(0, data.minimumPerGroup - data.counts.down);
  // The newest session until one is tapped; a tap in another routine does not carry over.
  const found = picked?.routine === routine ? sessions.findIndex(session => session.sessionId === picked.sessionId) : -1;
  const pickIndex = found >= 0 ? found : sessions.length - 1;
  const pick = sessions.length ? sessions[pickIndex] : undefined;
  const open = (factor: RelationFactor) => { haptics.selection(); setSheet(null);
    router.push({ pathname: '/(tabs)/train/insights/factor', params: { ...origin, routine, factor: factor.key, label: factorLabel(factor, metrics), ...(pick ? { pick: pick.sessionId } : {}) } }); };
  const waiting = data.factors.filter(factor => !comparable(factor));
  return <View style={styles.block} testID="relation-view">
    {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    {options.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel="Elegir rutina" accessibilityRole="radiogroup">
      {options.map(option => <Chip key={option.value} label={`${option.label} · ${option.sessions}`} accessibilityLabel={`${option.label}, ${option.sessions} ${option.sessions === 1 ? 'sesión' : 'sesiones'}`}
        selected={option.value === routine} onPress={() => { haptics.selection(); setChosen(option.value); }} />)}
    </ScrollView> : null}
    <AppText muted variant="footnote" numeric testID="relation-summary-line">{sessions.length
      ? `${sessions.length} ${sessions.length === 1 ? 'sesión' : 'sesiones'} · ${shortDate(sessions[0]!.date)} al ${shortDate(sessions.at(-1)!.date)} · reps al mismo peso`
      : `Últimos ${data.window.days} días`}</AppText>
    {sessions.length ? <>
      <ChangeBars bars={bars.bars} selected={pickIndex} label={bars.spoken} first={shortDate(sessions[0]!.date)} last={shortDate(sessions.at(-1)!.date)}
        onSelect={index => setPicked({ routine, sessionId: sessions[index]!.sessionId })} />
      <View accessible accessibilityLabel={bars.spoken} style={styles.counts}>
        {bars.counts.map(count => <AppText key={count.mark} variant="headline" numeric>{count.mark} {count.n} <AppText muted variant="footnote">{count.word}</AppText></AppText>)}
        {bars.others ? <AppText muted numeric variant="footnote">{bars.others}</AppText> : null}
      </View>
      {pick ? <Pressable accessibilityRole="button" testID="relation-pick" onPress={() => { haptics.selection(); router.push({ pathname: '/(tabs)/train/insights', params: { ...progressOriginParams(origin), session: pick.sessionId, date: pick.date } }); }}
        accessibilityLabel={`${dayLabel(pick.date)}: ${sessionValue(pick)}${pick.total ? `, ${pick.eligible} de ${pick.total} ejercicios comparados` : ''}. Ver sesión`}
        style={({ pressed }) => [styles.pick, { backgroundColor: colors.brandSubtle }, pressedStyle(pressed, reduced)]}>
        <View style={styles.flex}>
          <AppText variant="headline">{dayLabel(pick.date)}</AppText>
          {pick.total ? <AppText muted variant="footnote" numeric>{pick.eligible} de {pick.total} ejercicios comparados</AppText> : null}
        </View>
        <View style={styles.pickRight}>
          <AppText variant="headline" numeric style={{ color: colors.primary }}>{sessionValue(pick)}</AppText>
          <AppText variant="footnote" style={{ color: colors.primary }}>Ver sesión ›</AppText>
        </View>
      </Pressable> : null}
    </> : <AppText muted>Todavía no hay sesiones de esta rutina en estos días.</AppText>}
    {short && sessions.length ? <View style={styles.block} testID="relation-short">
      {/* The real screen with sample marks greyed and labeled, never numbers that look like the person's (IDENTIDAD.md § Estados vacíos). */}
      <ExampleFrame>
        <View style={styles.exampleHeader}><AppText muted variant="headline" style={styles.flex}>Cómo llegaste</AppText><AppText muted variant="caption">● subieron   ○ bajaron</AppText></View>
        {EXAMPLE_ROWS.map(label => <View key={label} style={styles.exampleRow}>
          <AppText muted style={styles.flex}>{label}</AppText>
          <AppText muted numeric>● — · ○ —</AppText>
        </View>)}
      </ExampleFrame>
      <AppText variant="title1" numeric>{missing === 1 ? '1 sesión más' : `${missing} sesiones más`}</AppText>
      <AppText muted numeric>Con 3 que suban y 3 que bajen, esta tabla pasa a ser tuya. Hoy: {data.counts.up} {data.counts.up === 1 ? 'subió' : 'subieron'} y {data.counts.down} {data.counts.down === 1 ? 'bajó' : 'bajaron'}.</AppText>
    </View> : null}
    {sessions.length ? <FactorTable model={data} metrics={metrics} pick={pickIndex} onOpen={open} /> : null}
    {sessions.length && waiting.length ? <InsightRow label={`Todavía sin datos para comparar · ${waiting.length}`} detail={waiting.map(factor => factorLabel(factor, metrics)).join(', ')}
      spoken={`${waiting.length} datos todavía sin datos para comparar: ${waiting.map(factor => factorLabel(factor, metrics)).join(', ')}. Ver por qué`} onPress={() => { haptics.selection(); setSheet('missing'); }} /> : null}
    <View style={styles.method}>
      <AppText muted variant="footnote" style={styles.flex}>Muestra qué coincidió, no por qué.</AppText>
      <Pressable accessibilityRole="button" hitSlop={12} onPress={() => { haptics.selection(); setSheet('method'); }} testID="relation-method-link">
        <AppText variant="footnote" style={{ color: colors.primary, fontWeight: '600' }}>Cómo se calcula</AppText>
      </Pressable>
    </View>
    <InsightRow label="Todas las relaciones" detail={evaluated ? `Las ${evaluated} que evaluamos, también las que no dieron nada` : 'Las que evaluamos, también las que no dieron nada'} spoken="Ver todas las relaciones" onPress={onStatistics} />
    {sheet ? <AppSheet onClose={() => setSheet(null)} closeLabel="Cerrar" testID={sheet === 'missing' ? 'relation-missing-sheet' : 'relation-method-sheet'} style={{ backgroundColor: colors.background }}>
      <View style={styles.sheet}>
        {sheet === 'missing' ? <>
          <AppText variant="title2" accessibilityRole="header">Todavía sin datos para comparar</AppText>
          <AppText muted>Hacen falta 3 sesiones que suban y 3 que bajen con el dato. Tocá uno para ver qué falta.</AppText>
          <View>{waiting.map(factor => <InsightRow key={factor.key} label={factorLabel(factor, metrics)} value={`${factor.valid} de ${sessions.length}`}
            spoken={`${factorLabel(factor, metrics)}: ${factor.valid} de ${sessions.length} sesiones con dato. Ver detalle`} onPress={() => open(factor)} />)}</View>
        </> : <>
          <AppText variant="title2" accessibilityRole="header">Cómo se calcula</AppText>
          <AppText>Tomamos las sesiones de esta rutina de los últimos {data.window.days} días. Cada una subió, quedó igual o bajó según las reps al mismo peso frente a la vez anterior.</AppText>
          <AppText>Para cada dato mostramos la mediana de las sesiones que subieron (●) y la de las que bajaron (○). Solo con 3 sesiones con ese dato en cada grupo.</AppText>
          <AppText muted>Las mixtas, las que solo cambiaron el peso y las que no se pudieron comparar no cuentan en ningún grupo. El orden de los datos es siempre el mismo.</AppText>
        </>}
      </View>
    </AppSheet> : null}
  </View>;
}

function FactorTable({ model, metrics, pick, onOpen }: { model: InsightsRoutineRelationView; metrics: InsightsSummary['metrics']; pick: number; onOpen: (factor: RelationFactor) => void }) {
  const { colors } = useOwnlevelTheme();
  const { fontScale } = useWindowDimensions();
  const reduced = useReduceMotion();
  const rows = model.factors.map((factor, index) => ({ factor, index })).filter(row => comparable(row.factor));
  if (!rows.length) return null;
  return <View testID="relation-factors">
    <View style={styles.header}>
      <AppText variant="headline" accessibilityRole="header" style={styles.flex}>Cómo llegaste</AppText>
      <AppText muted variant="caption">● subieron   ○ bajaron   <AppText variant="caption" style={{ color: colors.primary }}>│ esa vez</AppText></AppText>
    </View>
    {rows.map(({ factor, index }) => {
      const label = factorLabel(factor, metrics), up = factor.groups.up.median!, down = factor.groups.down.median!;
      const own = model.sessions[pick]?.values[index] ?? null;
      return <Pressable key={factor.key} accessibilityRole="button" testID={`relation-factor-${factor.key}`}
        accessibilityLabel={`${label}${own !== null ? `, esa vez ${factorValue(factor, own)}` : ''}. Mediana en las que subieron ${factorValue(factor, up)} y en las que bajaron ${factorValue(factor, down)}. ${factor.valid} de ${model.sessions.length} sesiones con dato. Ver detalle`}
        onPress={() => onOpen(factor)} style={({ pressed }) => [styles.row, { borderColor: colors.border }, pressedStyle(pressed, reduced)]}>
        <View style={styles.flex}>
          <AppText>{label}{own !== null ? <AppText numeric style={{ color: colors.primary, fontWeight: '700' }}>  {factorValue(factor, own)}</AppText> : null}</AppText>
          <AppText muted numeric variant="footnote"><AppText numeric variant="footnote">● {factorValue(factor, up)}</AppText> · ○ {factorValue(factor, down)}</AppText>
        </View>
        {fontScale > 1.3 ? null : <FactorStrip values={valuesOf(model, index)} up={up} down={down} pick={own} />}
        <AppIcon color={colors.textMuted} name="chevronRight" size={15} />
      </Pressable>; })}
  </View>;
}

const EXAMPLE_ROWS = ['Kcal del día', 'Proteína ayer', 'Sueño de la noche'];
const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  flex: { flex: 1, flexShrink: 1 },
  chips: { gap: spacing.sm, paddingVertical: 2 },
  counts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: spacing.md, rowGap: 2 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: brandTokens.radius.inner, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 44 },
  pickRight: { alignItems: 'flex-end', gap: 1 },
  exampleHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  exampleRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.xs, flexWrap: 'wrap' },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  method: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md },
  sheet: { gap: spacing.md, padding: brandTokens.layout.screenPadding, paddingBottom: spacing.xxl },
});
