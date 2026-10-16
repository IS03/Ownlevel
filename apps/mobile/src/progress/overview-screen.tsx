import { useCallback, type ReactNode } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchProgressOverview, progressRequestKey, type ProgressDestination, type ProgressOverview } from '@/api/progress';
import { AppIcon, AppText, Button, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, spacing, useOwnlevelTheme, type AppIconName } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { MiniChart } from './mini-chart';
import { InsightRow } from './insight-row';
import { MyViews } from './my-views';
import { ProgressScroll } from './progress-scroll';
import { ProgressRow } from './progress-row';
import { useProgressRange } from './progress-range-context';
import { periodHeading } from './progress-range';
import { arrowDelta, formatValue } from './progress-format';
import { useProgressResource } from './use-progress-resource';
import { useNutritionStages } from '@/stages/stages-provider';
import { stagesRowDetail } from './stages-model';

export type ProgressRoute = '/(tabs)/progress/trends/body' | '/(tabs)/progress/trends/metrics' | '/(tabs)/progress/trends/nutrition'
  | '/(tabs)/progress/trends/training' | '/(tabs)/progress/trends/exercise/[id]';
export function destinationRoute(d: ProgressDestination): { pathname: ProgressRoute; extra: Record<string, string> } {
  if (d.kind === 'body') return { pathname: '/(tabs)/progress/trends/body', extra: {} };
  if (d.kind === 'nutrition') return { pathname: '/(tabs)/progress/trends/nutrition', extra: {} };
  if (d.kind === 'training') return { pathname: '/(tabs)/progress/trends/training', extra: {} };
  if (d.kind === 'training_exercise') return { pathname: '/(tabs)/progress/trends/exercise/[id]', extra: { id: d.exerciseId } };
  return { pathname: '/(tabs)/progress/trends/metrics', extra: d.metricId ? { metric: d.metricId } : {} };
}

const kg = (v: number) => formatValue(v, null);
const kcal = (v: number) => formatValue(v, null, 'integer');

/** Flat row (E5 style): icon, title, one line of detail, the mini chart and a chevron. */
function AreaRow({ icon, title, detail, chart, divider, onPress, testID }: {
  icon: AppIconName; title: string; detail: string; chart?: ReactNode; divider: boolean; onPress: () => void; testID: string;
}) {
  const { colors } = useOwnlevelTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`} testID={testID}
    onPress={() => { haptics.selection(); onPress(); }} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
    {divider ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
    <AppIcon name={icon} color={colors.textMuted} size={20} />
    <View style={styles.text}>
      <AppText variant="headline">{title}</AppText>
      <AppText muted numeric variant="footnote">{detail}</AppText>
    </View>
    {chart}
    <AppIcon name="chevronRight" color={colors.textMuted} size={15} />
  </Pressable>;
}

/** "Tu octubre": what happened inside the period; the comparison only adds its value and an arrow. */
function Areas({ data, open }: { data: ProgressOverview; open: (d: ProgressDestination) => void }) {
  const { compareText } = useProgressRange();
  const sparks = data.sparks;
  const vs = compareText ? `${compareText} ` : '';

  const w = sparks?.weight ?? null;
  const weight = data.body.status === 'unavailable' ? 'No pudimos cargar Cuerpo.'
    : !w ? 'Sin pesos registrados'
    : w.last === null ? `Sin pesos en este período${compareText && w.referenceLast !== null ? ` · ${vs}${kg(w.referenceLast)} kg` : ''}`
    : compareText ? `${kg(w.last)} kg · ${w.referenceLast === null ? `${vs}sin pesos` : `${vs}${kg(w.referenceLast)} · ${arrowDelta(w.last - w.referenceLast, null)}`}`
    : w.first === null || w.first === w.last && w.current.filter(p => p.value !== null).length < 2 ? `${kg(w.last)} kg · un solo registro`
    : `${kg(w.first)} → ${kg(w.last)} kg · ${arrowDelta(w.last - w.first, null)}`;

  const t = data.training.status === 'ok' ? data.training.data : null;
  const sets = t?.comparisons.sets;
  const training = !t ? 'No pudimos cargar Entrenamiento.'
    : compareText && sets ? `${kcal(t.sets)} series · ${sets.previous === null ? `${vs}sin datos` : `${vs}${kcal(sets.previous)} · ${arrowDelta(t.sets - sets.previous, null, 'integer')}`}`
    : `${t.trainingDays} ${t.trainingDays === 1 ? 'día' : 'días'} · ${kcal(t.sets)} series`;

  const n = data.nutrition.status === 'ok' ? data.nutrition.data : null;
  const lowLog = n && n.registeredDays * 2 < n.days ? ` · ${n.registeredDays} de ${n.days} días` : '';
  const nutrition = !n ? 'No pudimos cargar Nutrición.'
    : n.averageKcal === null ? 'Sin días completos con calorías'
    : compareText ? `${kcal(n.averageKcal)} kcal · ${n.calories.previous === null ? `${vs}sin datos` : `${vs}${kcal(n.calories.previous)} · ${arrowDelta(n.averageKcal - n.calories.previous, null, 'integer')}`}${lowLog}`
    : `${kcal(n.averageKcal)} kcal por día${n.averageTargetKcal !== null ? ` · objetivo ${kcal(n.averageTargetKcal)}` : ''}${lowLog}`;

  const m = data.metrics.status === 'ok' ? data.metrics.data.items : null;
  const metrics = !m ? 'No pudimos cargar tus métricas.'
    : !m.length ? 'Sin métricas con datos en este período'
    : compareText ? `${m[0].name} ${formatValue(m[0].average, m[0].unit, m[0].valueType)} · ${vs}${m[0].comparison.previous === null ? 'sin datos' : formatValue(m[0].comparison.previous, m[0].unit, m[0].valueType)}`
    : m.map(x => `${x.name} ${formatValue(x.average, x.unit, x.valueType)}`).join(' · ');

  return <View style={styles.section} testID="progress-areas">
    <AreaRow testID="progress-area-body" icon="scale" title="Peso" detail={weight} divider={false} onPress={() => open({ kind: 'body' })}
      chart={w ? <MiniChart testID="progress-spark-weight" mode="level" current={w.current} reference={w.reference} /> : null} />
    <AreaRow testID="progress-area-training" icon="dumbbell" title="Entrenamiento" detail={training} divider onPress={() => open({ kind: 'training' })}
      chart={sparks?.training ? <MiniChart testID="progress-spark-training" mode="bars" current={sparks.training.current} reference={sparks.training.reference} /> : null} />
    <AreaRow testID="progress-area-nutrition" icon="nutrition" title="Nutrición" detail={nutrition} divider onPress={() => open({ kind: 'nutrition' })}
      chart={sparks?.nutrition ? <MiniChart testID="progress-spark-nutrition" mode="bars" current={sparks.nutrition.current} reference={sparks.nutrition.reference} /> : null} />
    <AreaRow testID="progress-area-metrics" icon="water" title="Métricas" detail={metrics} divider onPress={() => open({ kind: 'metrics', metricId: m?.[0]?.id ?? null })} />
  </View>;
}

/** "Lo destacado": records and exercise progress inside the period; with a comparison, also what changed against it. */
function Highlights({ data, open }: { data: ProgressOverview; open: (d: ProgressDestination) => void }) {
  const { colors } = useOwnlevelTheme();
  const { compareOn, compareText } = useProgressRange();
  const findings = compareOn ? data.changes : data.changes.filter(f => f.domain === 'training');
  const perf = compareOn && data.training.status === 'ok' && data.training.data.performance.comparable > 0 ? data.training.data.performance : null;
  const rows = [
    ...findings.map(f => ({ key: f.id, icon: (f.domain === 'training' ? 'trophy' : 'progress') as AppIconName, title: f.label, detail: f.description, to: f.destination })),
    ...(!compareOn && data.training.status === 'ok' && data.inPeriod && data.inPeriod.improved > 0 ? [{ key: 'in-period', icon: 'progress' as AppIconName, title: `${data.inPeriod.improved} ${data.inPeriod.improved === 1 ? 'ejercicio mejoró' : 'ejercicios mejoraron'}`, detail: 'Entre su primera y su última sesión del período', to: { kind: 'training' } as ProgressDestination }] : []),
    ...(perf ? [{ key: 'performance', icon: 'progress' as AppIconName, title: perf.headline, detail: `Frente a ${compareText}`, to: { kind: 'training' } as ProgressDestination }] : []),
  ];
  return <View style={styles.section} testID="progress-highlights">
    <Heading level={2}>Lo destacado</Heading>
    <InsightRow />
    {rows.length ? rows.map((r, i) => <Pressable key={r.key} accessibilityRole="button" accessibilityLabel={`${r.title}. ${r.detail}`}
      onPress={() => { haptics.selection(); open(r.to); }} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
      <AppIcon name={r.icon} color={r.icon === 'trophy' ? colors.primary : colors.textMuted} size={20} />
      <View style={styles.text}><AppText variant="headline">{r.title}</AppText><AppText muted numeric variant="footnote">{r.detail}</AppText></View>
      <AppIcon name="chevronRight" color={colors.textMuted} size={15} />
    </Pressable>) : <AppText muted>Sin récords ni cambios destacados en este período.</AppText>}
  </View>;
}

/** Progreso: the period at a glance (R1/R2). Detail lives one tap away in each row. */
export function ProgressOverviewScreen() {
  const router = useRouter();
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const { query, compare, state, today } = useProgressRange();
  // The stage is shown only if you want it: one row, never mixed into the period.
  const stagesDetail = stagesRowDetail(useNutritionStages()?.state.list) ?? 'Tus planes, uno al lado del otro';
  const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressOverview(c, query, signal, compare), [query, compare]);
  const { state: status, data, refresh } = useProgressResource(client, progressRequestKey(query, compare), load);
  // Every destination shares the period in ProgressRangeProvider.
  const open = (d: ProgressDestination) => {
    const { pathname, extra } = destinationRoute(d);
    router.push({ pathname, params: extra });
  };
  return <ProgressScroll title="Progreso" testID="progress-overview" refreshControl={<RefreshControl refreshing={status.status === 'ready' && status.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}>
    <MyViews />
    {status.status === 'loading' ? <><SkeletonBlock height={240} /><SkeletonBlock height={96} /></>
      : data ? <>
        {status.status !== 'ready' ? <InlineUnavailable actionLabel="Reintentar" message="No se pudo actualizar. Mostramos la última lectura confirmada de este período." onAction={() => void refresh()} /> : null}
        <View style={styles.section}>
          <Heading level={2}>{periodHeading(state, today)}</Heading>
          <Areas data={data} open={open} />
        </View>
        <Highlights data={data} open={open} />
      </> : <UnavailableState title="No pudimos cargar tu progreso" description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente."
        action={<Button label="Reintentar" onPress={() => void refresh()} />} />}
    <ProgressRow testID="progress-stages" label={`Tus etapas. ${stagesDetail}`} onPress={() => router.push('/(tabs)/progress/stages')}>
      <AppIcon name="calendar" color={colors.textMuted} size={20} />
      <View style={styles.text}><AppText variant="headline">Tus etapas</AppText><AppText muted numeric variant="footnote">{stagesDetail}</AppText></View>
    </ProgressRow>
    <ProgressRow testID="progress-influence" label="Qué influye. Preguntas sobre tus días" onPress={() => router.push('/(tabs)/progress/influence')}>
      <AppIcon name="sparkles" color={colors.textMuted} size={20} />
      <View style={styles.text}><AppText variant="headline">Qué influye</AppText><AppText muted variant="footnote">Preguntas sobre tus días</AppText></View>
    </ProgressRow>
  </ProgressScroll>;
}
const styles = StyleSheet.create({
  section: { gap: spacing.xs },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  divider: { position: 'absolute', top: 0, left: 32, right: 0, height: StyleSheet.hairlineWidth },
  text: { flex: 1, gap: 2 },
});
