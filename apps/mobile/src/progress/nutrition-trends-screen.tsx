import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
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
  useOwnlevelTheme,
} from '@/design-system';
import { ProgressScroll } from './progress-scroll';
import { useProgressRange } from './progress-range-context';
import { PRESET_LABELS, arrowDelta, formatValue } from './progress-format';
import { ProgressRow } from './progress-row';
import { useProgressResource } from './use-progress-resource';
import { useCachedRead } from '@/api/use-cached-read';
import { useProgressRouteRange } from './use-progress-route-range';
import { NutritionChart } from './nutrition-chart';
import { NutritionReportDetails } from './nutrition-report-details';
import { timingHeadline } from './meal-times-model';

function TimingEntry() {
  const { client } = useMobileApi(),
    router = useRouter(),
    { colors } = useOwnlevelTheme();
  const { query } = useProgressRange();
  const load = useCallback(
    (c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressNutritionTiming(c, query, signal),
    [query],
  );
  const { state, data } = useProgressResource(client, progressRequestKey(query), load);
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
        <AppText numeric muted variant="footnote">
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
function ReportContent({ report, reference }: { report: NutritionReport; reference?: NutritionReport }) {
  const router = useRouter();
  const { compareOn, compareText } = useProgressRange();
  return (
    <>
      {report.status === 'partial' ? <AppText muted>Reporte con cobertura parcial</AppText> : null}
      {report.range.preset !== report.range.requested.period ? (
        <AppText>Mostrando {PRESET_LABELS[report.range.preset]}.</AppText>
      ) : null}
      {report.range.notice ? <AppText accessibilityRole="alert">{report.range.notice}</AppText> : null}
      {report.status === 'empty' ? (
        <AppText muted>
          No hay comidas ni resúmenes históricos en este período. Los días sin registro no se cuentan como cero.
        </AppText>
      ) : null}
      <View style={styles.section} testID="nutrition-progress-summary">
        <View style={styles.primary}>
          {(['calories', 'protein'] as const).map((key, i) => {
            const stat = report.summary.metrics[key],
              previous = reference?.summary.metrics[key].value,
              target = report.summary.metrics[i === 0 ? 'targetCalories' : 'targetProtein'].value;
            return (
              <View key={key} style={styles.grow}>
                <AppText numeric variant="largeTitle">
                  {stat.value === null ? '—' : formatValue(stat.value, i === 0 ? null : 'g', 'integer')}
                </AppText>
                <AppText muted variant="caption">{i === 0 ? 'kcal por día' : 'proteína por día'}</AppText>
                {target !== null ? (
                  <AppText muted numeric variant="caption">objetivo {formatValue(target, i === 0 ? null : 'g', 'integer')}</AppText>
                ) : null}
                {compareOn && reference ? (
                  <AppText numeric variant="caption">
                    {compareText}{' '}
                    {previous === null || previous === undefined ? 'sin dato' : formatValue(previous, null, 'integer')}
                    {stat.value !== null && previous !== null && previous !== undefined
                      ? ` · ${arrowDelta(Math.round(stat.value) - Math.round(previous), null, 'integer')}`
                      : ''}
                  </AppText>
                ) : null}
              </View>
            );
          })}
        </View>
        <AppText muted numeric variant="caption">
          {daysText(report)}
        </AppText>
      </View>
      <NutritionChart report={report} reference={reference} />
      <TimingEntry />
      <NutritionReportDetails
        report={report}
        onDate={(date) => router.push({ pathname: '/(tabs)/nutrition', params: { date } })}
      />
    </>
  );
}
function ComparedReport({ report, query }: { report: NutritionReport; query: ReportQuery }) {
  const { client } = useMobileApi();
  const load = useCallback(
    (c: NonNullable<typeof client>, signal: AbortSignal) => fetchNutritionReport(c, query, signal),
    [query],
  );
  const { state, data, refresh } = useCachedRead(client, 'nutrition-report', reportQueryKey(query), load);
  return (
    <>
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
      <ReportContent report={report} reference={data} />
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
              key={referenceRevision}
              report={data}
              query={{ period: 'custom', from: compare.start, to: compare.end }}
            />
          ) : (
            <ReportContent report={data} />
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
  grow: { flex: 1, gap: spacing.xs },
});
