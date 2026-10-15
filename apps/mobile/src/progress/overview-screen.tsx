import { useCallback } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchProgressOverview, progressRequestKey, type ProgressDestination, type ProgressOverview } from '@/api/progress';
import { AppIcon, AppText, Button, Heading, IconCircle, InlineUnavailable, PressableSurface, SkeletonBlock, Surface, UnavailableState, spacing, useOwnlevelTheme, type AppIconName } from '@/design-system';
import { ProgressDataLinks } from '@/body/progress-hub';
import { haptics } from '@/platform/haptics';
import { ProgressScroll } from './progress-scroll';
import { useComparisonText, useProgressRange } from './progress-range-context';
import { coverageText, formatValue, lowCoverage, queryParams } from './progress-format';
import { TrainingSummaryCard } from './training-summary';
import { useProgressResource } from './use-progress-resource';

export type ProgressRoute = '/(tabs)/progress/trends/body' | '/(tabs)/progress/trends/metrics' | '/(tabs)/nutrition/reports'
  | '/(tabs)/progress/trends/training' | '/(tabs)/progress/trends/exercise/[id]';
export function destinationRoute(d: ProgressDestination): { pathname: ProgressRoute; extra: Record<string, string> } {
  if (d.kind === 'body') return { pathname: '/(tabs)/progress/trends/body', extra: {} };
  if (d.kind === 'nutrition') return { pathname: '/(tabs)/nutrition/reports', extra: {} };
  if (d.kind === 'training') return { pathname: '/(tabs)/progress/trends/training', extra: {} };
  if (d.kind === 'training_exercise') return { pathname: '/(tabs)/progress/trends/exercise/[id]', extra: { id: d.exerciseId } };
  return { pathname: '/(tabs)/progress/trends/metrics', extra: d.metricId ? { metric: d.metricId } : {} };
}

function Entry({ label, detail, icon, onPress, disabled, testID }: { label: string; detail: string; icon: AppIconName; onPress?: () => void; disabled?: boolean; testID?: string }) {
  const { colors } = useOwnlevelTheme();
  const body = <>
    <IconCircle icon={icon} />
    <View style={styles.flex}><AppText variant="label">{label}</AppText><AppText muted variant="caption">{detail}</AppText></View>
    {disabled ? null : <AppIcon color={colors.textMuted} name="chevronRight" size={16} />}
  </>;
  // Pending entries are visible but not actionable (no partial numbers).
  if (disabled) return <View testID={testID} accessible accessibilityLabel={`${label}. ${detail}`} accessibilityState={{ disabled: true }}><Surface style={{ ...styles.card, opacity: 0.55 }}>{body}</Surface></View>;
  return <View testID={testID}><PressableSurface accessibilityLabel={label} accessibilityHint={detail} onPress={() => { haptics.selection(); onPress?.(); }} style={styles.card}>{body}</PressableSurface></View>;
}

function Content({ data, open }: { data: ProgressOverview; open: (d: ProgressDestination) => void }) {
  const { colors } = useOwnlevelTheme();
  const compare = useComparisonText(), { compareOn } = useProgressRange();
  // Without "Comparar", only findings that don't compare periods (training records and exercise progress).
  const changes = compareOn ? data.changes : data.changes.filter(f => f.domain === 'training');
  const nutrition = data.nutrition.status === 'ok' ? data.nutrition.data : null;
  return <>
    <View style={styles.section} testID="progress-evolution">
      <Heading level={2}>Tu evolución</Heading>
      {data.body.status === 'unavailable' ? <Surface><InlineUnavailable message="No pudimos cargar Cuerpo. El resto del resumen sigue disponible." /></Surface>
        : data.evolution.length ? data.evolution.map(row => <PressableSurface key={row.id} accessibilityLabel={`${row.label}: ${row.value}`} onPress={() => open(row.destination)} style={styles.row}>
          <View style={styles.flex}><AppText variant="label">{row.label}</AppText>{row.detail ? <AppText muted variant="caption">{row.detail}</AppText> : null}</View>
          <AppText variant="label">{row.value}</AppText>
        </PressableSurface>)
        : <Surface><AppText muted>Datos insuficientes: no hay medidas o pesos con al menos 2 registros en este período.</AppText></Surface>}
      {data.body.status === 'ok' && data.body.data.excludedSuspect > 0 ? <AppText muted variant="caption">
        {data.body.data.excludedSuspect} medición sospechosa excluida del análisis.</AppText> : null}
    </View>

    <View style={styles.section} testID="progress-changes">
      <Heading level={2}>Qué cambió</Heading>
      {changes.length ? changes.map(f => <PressableSurface key={f.id} accessibilityLabel={`${f.label}. ${f.description}`} onPress={() => open(f.destination)} style={styles.row}>
        <View style={styles.flex}><AppText variant="label">{f.label}</AppText><AppText muted variant="caption">{f.description}</AppText></View>
      </PressableSurface>) : <Surface><AppText muted>Sin cambios destacados con datos suficientes en este período.</AppText></Surface>}
    </View>

    <View style={styles.section} testID="progress-habits">
      <Heading level={2}>Tus hábitos</Heading>
      {data.training.status === 'ok' ? <View testID="progress-training"><PressableSurface accessibilityLabel="Entrenamiento" onPress={() => open({ kind: 'training' })} style={styles.block}>
        <TrainingSummaryCard summary={data.training.data} compact />
      </PressableSurface></View> : <Surface><InlineUnavailable message="No pudimos cargar Entrenamiento. No significa que no haya datos." /></Surface>}
      {nutrition ? <View testID="progress-nutrition"><PressableSurface accessibilityLabel="Nutrición" onPress={() => open({ kind: 'nutrition' })} style={styles.block}>
        <AppText variant="label">Nutrición</AppText>
        <AppText>{nutrition.averageKcal === null ? 'Sin días completos con calorías' : `${formatValue(nutrition.averageKcal, 'kcal', 'integer')}/día`}</AppText>
        {compare(nutrition.calories, 'kcal', 'integer') ? <AppText muted variant="caption">{compare(nutrition.calories, 'kcal', 'integer')}</AppText> : null}
        <AppText>{nutrition.averageProteinG === null ? 'Proteína sin dato' : `${formatValue(nutrition.averageProteinG, 'g', 'decimal')} proteína/día`}</AppText>
        {compare(nutrition.protein, 'g') ? <AppText muted variant="caption">{compare(nutrition.protein, 'g')}</AppText> : null}
        {nutrition.averageTargetKcal !== null ? <AppText muted variant="caption">Objetivo histórico promedio: {formatValue(nutrition.averageTargetKcal, 'kcal', 'integer')}</AppText> : null}
        {nutrition.accumulatedBalanceKcal !== null ? <AppText muted variant="caption">Balance acumulado: {formatValue(nutrition.accumulatedBalanceKcal, 'kcal', 'integer')}</AppText> : null}
        <AppText muted variant="caption" style={nutrition.registeredDays * 2 < nutrition.days ? { color: colors.text } : undefined}>
          {nutrition.registeredDays} de {nutrition.days} días con registro</AppText>
      </PressableSurface></View> : <Surface><InlineUnavailable message="No pudimos cargar Nutrición. No significa que no haya datos." /></Surface>}
      {data.metrics.status === 'unavailable' ? <Surface><InlineUnavailable message="No pudimos cargar tus métricas. No significa que no haya datos." /></Surface>
        : data.metrics.data.items.map(m => <View key={m.id} testID={`progress-habit-${m.id}`}><PressableSurface accessibilityLabel={m.name} onPress={() => open({ kind: 'metrics', metricId: m.id })} style={styles.block}>
          <View style={styles.rowInline}><AppText variant="label" style={styles.flex}>{m.name}</AppText><AppText>{formatValue(m.average, m.unit, m.valueType)}</AppText></View>
          <AppText muted variant="caption">Promedio por día con dato{compare(m.comparison, m.unit, m.valueType) ? ` · ${compare(m.comparison, m.unit, m.valueType)}` : ''}</AppText>
          <AppText muted={!lowCoverage(m.coverage)} variant="caption" style={lowCoverage(m.coverage) ? { color: colors.text } : undefined}>
            {coverageText(m.coverage)}{lowCoverage(m.coverage) ? ' · cobertura baja' : ''}</AppText>
        </PressableSurface></View>)}
    </View>
  </>;
}

/** Progreso: the analytic overview (M7.1). Training analytics arrive in M7.2. */
export function ProgressOverviewScreen() {
  const router = useRouter();
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const { query, compare } = useProgressRange();
  const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressOverview(c, query, signal, compare), [query, compare]);
  const { state, data, refresh } = useProgressResource(client, progressRequestKey(query, compare), load);
  // The period travels in ProgressRangeProvider; only the Nutrition report (another tab's stack) still takes it by route.
  const go = (pathname: ProgressRoute, extra: Record<string, string> = {}) => router.push({ pathname, params: pathname === '/(tabs)/nutrition/reports' ? { ...queryParams(query), ...extra } : extra });
  const open = (d: ProgressDestination) => { const r = destinationRoute(d); go(r.pathname, r.extra); };
  return <ProgressScroll title="Progreso" testID="progress-overview" refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}>
    {state.status === 'loading' ? <><SkeletonBlock height={96} /><SkeletonBlock height={96} /></>
      : data ? <>
        {state.status !== 'ready' ? <Surface><InlineUnavailable actionLabel="Reintentar" message="No se pudo actualizar. Mostramos la última lectura confirmada de este período." onAction={() => void refresh()} /></Surface> : null}
        <Content data={data} open={open} />
      </> : <UnavailableState title="No pudimos cargar tu progreso" description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente."
        action={<Button label="Reintentar" onPress={() => void refresh()} />} />}

    <View style={styles.section} testID="progress-explore">
      <Heading level={2}>Explorar</Heading>
      <Entry testID="progress-explore-body" label="Tendencias de Cuerpo" detail="Peso y medidas: cambio, tendencia y registros." icon="activity" onPress={() => go('/(tabs)/progress/trends/body')} />
      <Entry testID="progress-explore-nutrition" label="Reportes de Nutrición" detail="Consumo, objetivos históricos y evolución." icon="nutrition" onPress={() => go('/(tabs)/nutrition/reports')} />
      <Entry testID="progress-explore-metrics" label="Tendencias de Métricas" detail="Promedio, mínimo, máximo y cobertura de tus métricas." icon="water" onPress={() => go('/(tabs)/progress/trends/metrics')} />
      <Entry testID="progress-explore-training" label="Tendencias de Entrenamiento" detail="Sesiones, series, duración, rendimiento por ejercicio y PRs." icon="dumbbell" onPress={() => go('/(tabs)/progress/trends/training')} />
    </View>
    <View style={styles.section} testID="progress-review">
      <Heading level={2}>Revisar datos</Heading>
      <ProgressDataLinks />
    </View>
  </ProgressScroll>;
}
const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowInline: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  block: { gap: 4 },
  flex: { flex: 1, gap: 2 },
});
