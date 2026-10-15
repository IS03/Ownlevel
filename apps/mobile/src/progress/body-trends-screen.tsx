import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchProgressBody, progressRequestKey, type ProgressBodyMetric } from '@/api/progress';
import { AppText, Button, Heading, InlineUnavailable, SkeletonBlock, Surface, UnavailableState, spacing, useOwnlevelTheme } from '@/design-system';
import { displayNutritionDate } from '@/nutrition/day-format';
import { ProgressScroll } from './progress-scroll';
import { useProgressRange } from './progress-range-context';
import { formatDelta, formatValue, trendText } from './progress-format';
import { useProgressResource } from './use-progress-resource';
import { ValueBars } from './value-bars';

function Summary({ metric }: { metric: ProgressBodyMetric }) {
  const v = (n: number | null) => formatValue(n, metric.unit);
  const { compareText } = useProgressRange();
  return <Surface style={styles.section} testID="body-trend-summary">
    <Heading level={2}>{metric.label}</Heading>
    {metric.latest ? <AppText>Último registro: {v(metric.latest.value)} · {displayNutritionDate(metric.latest.date)}</AppText> : null}
    {metric.first && metric.last ? <AppText>En el período: {v(metric.first.value)} ({displayNutritionDate(metric.first.date)}) → {v(metric.last.value)} ({displayNutritionDate(metric.last.date)})</AppText>
      : <AppText muted>Sin registros en este período.</AppText>}
    {metric.change !== null ? <AppText variant="label">Cambio: {formatDelta(metric.change, metric.unit)}</AppText> : null}
    <AppText muted variant="caption">{trendText(metric.trend, metric.confidence)}</AppText>
    <AppText muted variant="caption">{metric.observations.length} registros en el período</AppText>
    {compareText ? <AppText muted variant="caption">{metric.referenceChange !== null ? `${compareText}: ${formatDelta(metric.referenceChange, metric.unit)} (${metric.referenceCount} registros)`
      : `${compareText}: datos insuficientes (${metric.referenceCount} registro${metric.referenceCount === 1 ? '' : 's'}).`}</AppText> : null}
  </Surface>;
}

/** Tendencias de Cuerpo (M7.1): real values only; no smoothing, no interpolation, no body fat. */
export function BodyTrendsScreen() {
  const router = useRouter();
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const { query, compare } = useProgressRange();
  const [selected, setSelected] = useState<string | null>(null);
  const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) => fetchProgressBody(c, query, signal, compare), [query, compare]);
  const { state, data, refresh } = useProgressResource(client, progressRequestKey(query, compare), load);
  const metric = data?.metrics.find(m => m.key === selected) ?? data?.metrics[0] ?? null;
  return <ProgressScroll title="Cuerpo" testID="body-trends-screen" refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}>
    {state.status === 'loading' ? <SkeletonBlock height={160} />
      : !data ? <UnavailableState title="No pudimos cargar Cuerpo" description="Tus datos siguen seguros. Revisá la conexión e intentá nuevamente." action={<Button label="Reintentar" onPress={() => void refresh()} />} />
      : <>
        {state.status !== 'ready' ? <Surface><InlineUnavailable actionLabel="Reintentar" message="No se pudo actualizar. Mostramos la última lectura confirmada." onAction={() => void refresh()} /></Surface> : null}
        {data.metrics.length === 0 ? <Surface><AppText muted>Todavía no hay pesos ni medidas registrados con fecha.</AppText></Surface> : <>
          <View style={styles.wrap}>{data.metrics.map(m => <Button key={m.key} label={m.label} variant={m.key === metric?.key ? 'primary' : 'secondary'} onPress={() => setSelected(m.key)} />)}</View>
          {metric ? <>
            <Summary metric={metric} />
            {metric.observations.length ? <Surface style={styles.section}>
              <Heading level={2}>Registros</Heading>
              <AppText muted variant="caption">Valores reales por fecha. Los días sin registro no se completan.</AppText>
              <ValueBars testID="body-trend-chart" bars={metric.observations.map(o => ({ key: o.date, label: displayNutritionDate(o.date), value: o.value,
                text: formatValue(o.value, metric.unit), detail: o.imported ? o.provenanceLabel : undefined,
                accessibilityHint: 'Abre el día en Historial', onPress: () => router.push({ pathname: '/history/day/[date]', params: { date: o.date } }) }))} />
            </Surface> : null}
          </> : null}
        </>}
        {data.excludedSuspect > 0 ? <AppText muted variant="caption">{data.excludedSuspect} medición sospechosa excluida del análisis. Podés corregirla en Cuerpo.</AppText> : null}
      </>}
    <Button label="Abrir Cuerpo" variant="secondary" onPress={() => router.push('/(tabs)/progress/body')} />
  </ProgressScroll>;
}
const styles = StyleSheet.create({ section: { gap: spacing.sm }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm } });
