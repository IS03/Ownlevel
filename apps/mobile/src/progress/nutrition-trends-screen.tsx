import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchNutritionReport, reportQueryKey, type NutritionReport, type ReportQuery } from '@/api/nutrition-report';
import { fetchProgressNutritionTiming, progressRequestKey } from '@/api/progress';
import {
  AppIcon,
  AppText,
  Button,
  InlineUnavailable,
  SkeletonBlock,
  UnavailableState,
  spacing,
  typography,
  useOwnlevelTheme,
} from '@/design-system';
import { ProgressScroll } from './progress-scroll';
import { useProgressRange } from './progress-range-context';
import { PRESET_LABELS, arrowDelta, formatDelta, formatValue } from './progress-format';
import { ProgressRow } from './progress-row';
import { useProgressResource } from './use-progress-resource';
import { useCachedRead } from '@/api/use-cached-read';
import { useProgressRouteRange } from './use-progress-route-range';
import { NutritionChart, type NutritionInspection } from './nutrition-chart';
import { NutritionReportDetails } from './nutrition-report-details';
import { inputNutritionDate } from '@/nutrition/day-format';
import { nutritionChartDayHref } from './nutrition-chart-navigation';
import { timingHeadline } from './meal-times-model';
import { figuresFitInRow, useMeasuredWidth } from './figure-layout';

function TimingEntry() {
  const { client } = useMobileApi(),
    router = useRouter(),
    { colors } = useOwnlevelTheme();
  const { query } = useProgressRange();
  const load = useCallback(
    (c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressNutritionTiming(c, query, signal),
    [query],
  );
  const { state, data } = useProgressResource(client, `timing|${progressRequestKey(query)}`, load);
  // Two lines reserved (scaled with Dynamic Type): consulting, error and the usual result keep the row's height.
  const { fontScale } = useWindowDimensions();
  const subtitle = data
    ? timingHeadline(data.current).text
    : state.status === 'loading'
      ? 'Consultando comidas con hora…'
      : 'No pudimos consultar cuándo comés.';
  return (
    <ProgressRow
      testID="nutrition-timing-entry"
      label={`Cuándo comés, ${subtitle}`}
      onPress={() => router.push('/(tabs)/progress/trends/meal-times')}
    >
      <AppIcon name="clock" color={colors.textMuted} size={20} />
      <View style={styles.grow}>
        <AppText variant="headline">Cuándo comés</AppText>
        <AppText numeric muted variant="footnote" style={{ minHeight: 2 * typography.footnote.lineHeight * fontScale }}>
          {subtitle}
        </AppText>
      </View>
    </ProgressRow>
  );
}
/** One line for both numbers: how many days the averages cover, never repeated per number. */
function daysText(report: NutritionReport) {
  const c = report.summary.metrics.calories, p = report.summary.metrics.protein;
  const days = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;
  const partial = c.partialDays ? ` · ${days(c.partialDays)} con suma parcial` : '';
  const protein = p.denominator !== c.denominator ? ` (proteína: ${days(p.denominator)})` : '';
  return `Promedio de ${days(c.denominator)} con dato${protein}${partial}${report.days.some((d) => d.isToday) ? ', sin contar hoy' : ''}`;
}
type InspectionProps = { selection: NutritionInspection; onSelect: (next: NutritionInspection) => void };
function ReportContent({ report, reference, selection, onSelect }: { report: NutritionReport; reference?: NutritionReport } & InspectionProps) {
  const router = useRouter();
  const { compareOn, compareText } = useProgressRange();
  const openDate = (date: string) => { const href = nutritionChartDayHref(date); if (href) router.push(href); };
  const { width, fontScale, onLayout } = useMeasuredWidth();
  const figures = (['calories', 'protein'] as const).map((key, i) => {
    const stat = report.summary.metrics[key], unit = i === 0 ? 'kcal' : 'g';
    const previous = reference?.summary.metrics[key].value;
    const targetStat = report.summary.metrics[i === 0 ? 'targetCalories' : 'targetProtein'];
    const value = stat.value === null ? null : formatValue(stat.value, i === 0 ? null : 'g', 'integer');
    const target = targetStat.value === null ? null : `${formatValue(targetStat.value, unit, 'integer')} (${targetStat.denominator} ${targetStat.denominator === 1 ? 'día' : 'días'})`;
    // The reference value keeps its unit; the difference is between the two rounded daily averages, as before.
    const versus = compareOn && reference ? previous === null || previous === undefined ? 'sin dato'
      : `${formatValue(previous, unit, 'integer')}${stat.value !== null ? ` (${arrowDelta(Math.round(stat.value) - Math.round(previous), unit, 'integer')})` : ''}` : null;
    const spokenVersus = compareOn && reference ? previous === null || previous === undefined ? 'sin dato'
      : `${formatValue(previous, unit, 'integer')}${stat.value !== null ? `, diferencia ${formatDelta(Math.round(stat.value) - Math.round(previous), unit, 'integer')}` : ''}` : null;
    const name = i === 0 ? 'Calorías' : 'Proteína';
    const label = `${name}: ${value === null ? 'sin dato' : `${formatValue(stat.value, unit, 'integer')} por día`}${target ? `. Objetivo histórico promedio ${target}` : ''}${spokenVersus ? `. ${compareText}: ${spokenVersus}` : ''}`;
    return { key, value, caption: i === 0 ? 'kcal por día' : 'proteína por día', target, versus, label };
  });
  const stacked = !figuresFitInRow({ texts: figures.map(f => f.value ?? '—'), width, fontScale, variant: 'largeTitle' });
  // Target and A/B read across the full width under both figures, each value with its own unit.
  const targets = figures.filter(f => f.target).map(f => f.target).join(' · ');
  const versus = compareOn && reference ? figures.map(f => f.versus).join(' · ') : null;
  return (
    <>
      {report.status === 'partial' ? <AppText muted>Reporte con cobertura parcial</AppText> : null}
      {report.range.preset !== report.range.requested.period ? (
        <AppText>Mostrando {PRESET_LABELS[report.range.preset]}.</AppText>
      ) : null}
      {report.range.notice ? <AppText accessibilityRole="alert">{report.range.notice}</AppText> : null}
      {report.status === 'empty' ? (
        <AppText muted>
          {report.days.some(d => d.mealCount > 0) ? 'Hay entradas registradas sin valores nutricionales utilizables.' : 'No hay comidas ni resúmenes históricos en este período. Los días sin registro no se cuentan como cero.'}
        </AppText>
      ) : null}
      <View style={styles.section} testID="nutrition-progress-summary" onLayout={onLayout}>
        <View testID="nutrition-progress-figures" style={[styles.primary, stacked && styles.stacked]}>
          {figures.map(f => (
            <View key={f.key} testID={`nutrition-progress-${f.key}`} style={styles.grow} accessible accessibilityLabel={f.label}>
              <AppText numeric variant="largeTitle">{f.value ?? '—'}</AppText>
              <AppText muted variant="footnote">{f.caption}</AppText>
            </View>
          ))}
        </View>
        {/* Already part of each figure's spoken label: hidden from VoiceOver so it is not read twice. */}
        <View style={styles.context} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {targets ? <AppText muted numeric variant="footnote">Objetivo histórico promedio: {targets}</AppText> : null}
          {versus ? <AppText numeric variant="footnote" testID="nutrition-progress-versus">{compareText}: {versus}</AppText> : null}
        </View>
        <AppText muted numeric variant="footnote">
          {daysText(report)}
        </AppText>
        {compareOn && reference ? <AppText muted numeric variant="footnote">Referencia {compareText} · {daysText(reference)}</AppText> : null}
      </View>
      <NutritionChart report={report} reference={reference} selection={selection} onSelect={onSelect} onDate={openDate} />
      <AppText muted numeric variant="caption">Detalle y horarios del período elegido · {inputNutritionDate(report.range.start)} – {inputNutritionDate(report.range.end)}</AppText>
      <TimingEntry />
      <NutritionReportDetails
        report={report}
        onDate={openDate}
      />
    </>
  );
}
function ComparedReport({ report, query, selection, onSelect, refreshRevision }: { report: NutritionReport; query: ReportQuery; refreshRevision: number } & InspectionProps) {
  const { client } = useMobileApi();
  const load = useCallback(
    (c: NonNullable<typeof client>, signal: AbortSignal) => fetchNutritionReport(c, query, signal),
    [query],
  );
  const { state, data, refresh } = useCachedRead(client, 'nutrition-report', reportQueryKey(query), load);
  const seenRefresh = useRef(refreshRevision);
  useEffect(() => {
    if (seenRefresh.current === refreshRevision) return;
    seenRefresh.current = refreshRevision;
    void refresh();
  }, [refreshRevision, refresh]);
  return (
    <>
      {state.status === 'ready' && state.refreshing ? <AppText muted variant="caption" accessibilityLiveRegion="polite">Actualizando la comparación; mostramos la última lectura confirmada.</AppText> : null}
      {state.status === 'loading' ? (
        <AppText muted variant="caption">
          Cargando el período de comparación…
        </AppText>
      ) : state.status !== 'ready' ? (
        <InlineUnavailable
          message="No pudimos cargar el período de comparación"
          actionLabel="Reintentar comparación"
          onAction={() => void refresh()}
        />
      ) : null}
      <ReportContent report={report} reference={data} selection={selection} onSelect={onSelect} />
    </>
  );
}
function NutritionReportResource() {
  const { client } = useMobileApi(),
    { colors } = useOwnlevelTheme();
  const { query, compare } = useProgressRange();
  const load = useCallback(
    (c: NonNullable<typeof client>, signal: AbortSignal) => fetchNutritionReport(c, query, signal),
    [query],
  );
  const { state, data, refresh } = useCachedRead(client, 'nutrition-report', reportQueryKey(query), load);
  const scope = `${reportQueryKey(query)}|${compare?.start ?? ''}|${compare?.end ?? ''}`;
  const [saved, setSaved] = useState({ client, scope, selection: null as NutritionInspection });
  const currentScope = saved.client === client && saved.scope === scope;
  const selection = currentScope ? saved.selection : null;
  if (!currentScope) setSaved({ client, scope, selection: null });
  const onSelect = (selection: NutritionInspection) => setSaved({ client, scope, selection });
  const [referenceRevision, setReferenceRevision] = useState(0);
  const refreshAll = () => {
    void refresh();
    setReferenceRevision((v) => v + 1);
  };
  return (
    <ProgressScroll
      title="Nutrición"
      testID="nutrition-trends-screen"
      refreshControl={
        <RefreshControl
          refreshing={state.status === 'ready' && state.refreshing}
          onRefresh={refreshAll}
          tintColor={colors.primary}
        />
      }
    >
      {state.status === 'ready' && state.refreshing ? <AppText muted variant="caption" accessibilityLiveRegion="polite">Actualizando el período elegido; mostramos la última lectura confirmada.</AppText> : null}
      {state.status === 'loading' ? (
        <SkeletonBlock height={240} />
      ) : data ? (
        <>
          {state.status !== 'ready' ? (
            <InlineUnavailable
              message="No se pudo actualizar. Mostramos la última lectura confirmada de este período."
              actionLabel="Reintentar"
              onAction={() => void refresh()}
            />
          ) : null}
          {compare ? (
            <ComparedReport
              refreshRevision={referenceRevision}
              report={data}
              selection={selection} onSelect={onSelect}
              query={{ period: 'custom', from: compare.start, to: compare.end }}
            />
          ) : (
            <ReportContent report={data} selection={selection} onSelect={onSelect} />
          )}
        </>
      ) : (
        <UnavailableState
          title="No pudimos cargar Nutrición"
          description="Revisá la conexión e intentá nuevamente."
          action={<Button label="Reintentar" onPress={() => void refresh()} />}
        />
      )}
    </ProgressScroll>
  );
}
export function NutritionTrendsScreen() {
  const applied = useProgressRouteRange();
  return applied ? <NutritionReportResource /> : <SkeletonBlock height={200} />;
}
const styles = StyleSheet.create({
  section: { gap: spacing.xs },
  primary: { flexDirection: 'row', gap: spacing.lg },
  stacked: { flexDirection: 'column' },
  context: { gap: spacing.xs },
  grow: { flex: 1, gap: spacing.xs },
});
