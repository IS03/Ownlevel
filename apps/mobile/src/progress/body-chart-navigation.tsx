import { useLocalSearchParams, useRouter } from 'expo-router';
import { BODY_MEASUREMENT_LABELS } from '@/api/body';
import { isNutritionDate } from '@/api/nutrition-day';
import { Button } from '@/design-system';

// Includes bilateral and legacy fields already supported by Body; no arbitrary redirect or metric name.
const measures = new Set(['body.weight', ...Object.keys(BODY_MEASUREMENT_LABELS).map(field =>
  `body.${field.replace(/Cm$/, '').replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)}`)]);
export const isBodyChartMetric = (value: unknown): value is string => typeof value === 'string' && measures.has(value);
export function bodyChartReturnHref(params: Record<string, unknown>) {
  if (params.bodyChartReturn !== '1' || (params.bodyChartMetric !== '' && !isBodyChartMetric(params.bodyChartMetric))) return null;
  return { pathname: '/(tabs)/progress/trends/body' as const, params: { metric: params.bodyChartMetric as string } };
}
export function bodyObservationHref(date: string, metric: string | null) {
  if (!isNutritionDate(date) || (metric !== null && !isBodyChartMetric(metric))) return null;
  return { pathname: '/(tabs)/progress/body' as const, params: { date, bodyChartReturn: '1', bodyChartMetric: metric ?? '' } };
}
export function ReturnToBodyChart() {
  const router = useRouter(), href = bodyChartReturnHref(useLocalSearchParams());
  // This detail is pushed on the same Progreso stack: pop to retain the exact route, including Insights origin.
  return href ? <Button label="Volver al gráfico de Cuerpo" variant="secondary" onPress={() => {
    if (router.canGoBack()) router.back(); else router.replace(href);
  }} /> : null;
}
