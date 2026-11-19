import { useLocalSearchParams, useRouter } from 'expo-router';
import { isNutritionDate } from '@/api/nutrition-day';
import { nutritionSection, type NutritionSection } from './nutrition-sections';
import { Button } from '@/design-system';

export function nutritionChartDayHref(date: string, section: NutritionSection | null = null) {
  return isNutritionDate(date) ? { pathname: '/(tabs)/nutrition' as const, params: { date, fromProgressNutrition: '1', ...(section ? { fromProgressNutritionSection: section } : {}) } } : null;
}
export function ReturnToNutritionChart() {
  const params = useLocalSearchParams(), router = useRouter();
  // Progreso retains the source route, its period/A-B and inspection while the Nutrition tab is open.
  return params.fromProgressNutrition === '1' ? <Button label="Volver al gráfico de Nutrición" variant="secondary"
    onPress={() => { const section = nutritionSection(params.fromProgressNutritionSection); router.navigate(section ? { pathname: '/(tabs)/progress/trends/nutrition', params: { section } } : '/(tabs)/progress/trends/nutrition'); }} /> : null;
}
