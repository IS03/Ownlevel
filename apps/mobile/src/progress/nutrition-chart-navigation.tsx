import { useLocalSearchParams, useRouter } from 'expo-router';
import { isNutritionDate } from '@/api/nutrition-day';
import { nutritionSection, type NutritionSection } from './nutrition-sections';
import { Button } from '@/design-system';
import { isBodyChartMetric } from './body-chart-navigation';

export function nutritionChartDayHref(date: string, section: NutritionSection | null = null) {
  return isNutritionDate(date) ? { pathname: '/(tabs)/nutrition' as const, params: { date, fromProgressNutrition: '1', ...(section ? { fromProgressNutritionSection: section } : {}) } } : null;
}
export function ReturnToNutritionChart() {
  const params = useLocalSearchParams(), router = useRouter();
  if (params.fromProgressBody === '1' && isBodyChartMetric(params.fromProgressBodyMetric)) return <Button label="Volver a Cuerpo" variant="secondary" onPress={() => router.navigate({ pathname: '/(tabs)/progress/trends/body', params: { metric: params.fromProgressBodyMetric as string } })} />;
  // Progreso retains the source route, its period/A-B and inspection while the Nutrition tab is open.
  return params.fromProgressNutrition === '1' ? <Button label="Volver al gráfico de Nutrición" variant="secondary"
    onPress={() => { const section = nutritionSection(params.fromProgressNutritionSection); router.navigate(section ? { pathname: '/(tabs)/progress/trends/nutrition', params: { section } } : '/(tabs)/progress/trends/nutrition'); }} /> : null;
}
