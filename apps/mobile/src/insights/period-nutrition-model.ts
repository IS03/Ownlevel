import type { InsightsPeriodNutrition } from '@/api/performance-insights';
import { formatValue } from '@/progress/progress-format';
export const PERIOD_NUTRIENTS = [['calories', 'Calorías', 'kcal'], ['proteinG', 'Proteína', 'g'], ['carbsG', 'Carbohidratos', 'g'], ['fatG', 'Grasas', 'g']] as const;
export function periodDayRows(day: InsightsPeriodNutrition['days'][number]) {
  return PERIOD_NUTRIENTS.map(([key, label, unit]) => {
    const n = day[key], known = day.activeMeals - n.missing;
    return { key, label, value: !known ? 'Sin dato' : `${formatValue(n.recorded, unit)}${n.missing ? ' · parcial' : ''}`,
      detail: n.missing ? `${known} de ${day.activeMeals} registros tienen este dato` : `Dato presente en los ${day.activeMeals} registros` };
  });
}
