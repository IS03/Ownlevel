import { useLocalSearchParams, useRouter } from 'expo-router';
import { isNutritionDate } from '@/api/nutrition-day';
import { Button } from '@/design-system';

export const isChartMetricId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export function metricsChartOrigin(params: Record<string, unknown>) {
  if (params.fromMetricsChart !== '1' || !isChartMetricId(params.metricsChartMetric)) return null;
  const start = params.metricsChartStart, end = params.metricsChartEnd;
  if (start === undefined && end === undefined) return { metricId: params.metricsChartMetric, interval: null };
  if (!isNutritionDate(start) || !isNutritionDate(end) || start > end || (Date.parse(end) - Date.parse(start)) / 86400000 >= 31) return null;
  return { metricId: params.metricsChartMetric, interval: { start, end } };
}
export function metricOriginalHref(metricId: string, start: string, end: string = start, asInterval = start !== end) {
  const params = { date: start, fromMetricsChart: '1', metricsChartMetric: metricId,
    ...(asInterval ? { metricsChartStart: start, metricsChartEnd: end } : {}) };
  return isNutritionDate(start) && metricsChartOrigin(params) ? { pathname: '/(tabs)/progress/metrics' as const, params } : null;
}
export function ReturnToMetricChart() {
  const origin = metricsChartOrigin(useLocalSearchParams()), router = useRouter();
  return origin ? <Button label="Volver al gráfico de la métrica" variant="secondary" onPress={() => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/(tabs)/progress/trends/metrics', params: { metric: origin.metricId } });
  }} /> : null;
}
