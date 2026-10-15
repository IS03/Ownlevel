import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchNutritionReport, reportQueryKey, type NutritionReport, type ReportQuery } from '@/api/nutrition-report';
import { fetchProgressNutritionTiming, progressRequestKey } from '@/api/progress';
import {
  AppText,
  Button,
  Heading,
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
import { useProgressRouteRange } from './use-progress-route-range';
import { NutritionChart } from './nutrition-chart';
import { NutritionReportDetails } from './nutrition-report-details';
import { timingHeadline } from './meal-times-model';

function TimingEntry() {
  const { client } = useMobileApi(),
    router = useRouter();
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
      <View style={styles.grow}>
        <Heading level={2}>Cuándo comés</Heading>
        <AppText numeric muted variant="caption">
          {subtitle}
        </AppText>
      </View>
    </ProgressRow>
  );
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
      <View style={styles.primary} testID="nutrition-progress-summary">
        {(['calories', 'protein'] as const).map((key, i) => {
          const stat = report.summary.metrics[key],
            previous = reference?.summary.metrics[key].value;
          return (
            <View key={key} style={styles.grow}>
              <AppText numeric variant="largeTitle">
                {stat.value === null ? '—' : formatValue(stat.value, i === 0 ? null : 'g', 'integer')}
              </AppText>
              <AppText muted variant="caption">
                {i === 0 ? 'kcal por día' : 'proteína por día'}
              </AppText>
              <AppText numeric muted variant="caption">
                {stat.denominator} días con dato{stat.partialDays ? ` · ${stat.partialDays} parciales` : ''}
              </AppText>
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
  const { state, data, refresh } = useProgressResource(client, reportQueryKey(query), load);
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
  const { state, data, refresh } = useProgressResource(client, reportQueryKey(query), load);
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
  primary: { flexDirection: 'row', gap: spacing.lg },
  grow: { flex: 1, gap: spacing.xs },
});
