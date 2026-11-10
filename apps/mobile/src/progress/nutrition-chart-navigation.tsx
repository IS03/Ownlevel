import { useLocalSearchParams, useRouter } from 'expo-router';
import { isNutritionDate } from '@/api/nutrition-day';
import { Button } from '@/design-system';

export function nutritionChartDayHref(date: string) {
  return isNutritionDate(date) ? { pathname: '/(tabs)/nutrition' as const, params: { date, fromProgressNutrition: '1' } } : null;
}
export function ReturnToNutritionChart() {
  const params = useLocalSearchParams(), router = useRouter();
  // Progreso retains the source route, its period/A-B and inspection while the Nutrition tab is open.
  return params.fromProgressNutrition === '1' ? <Button label="Volver al gráfico de Nutrición" variant="secondary"
    onPress={() => router.navigate('/(tabs)/progress/trends/nutrition')} /> : null;
}
