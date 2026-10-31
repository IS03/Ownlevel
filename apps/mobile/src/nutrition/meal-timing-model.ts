import type { MealTiming as Timing } from '../../../../src/lib/mobile-api/nutrition-meal-contract';
export const mealMoments = { breakfast: 'Desayuno', lunch: 'Almuerzo', snack: 'Merienda', dinner: 'Cena', extra: 'Extra' };
/**
 * Today's moment from the Argentina clock (the nutrition day's zone), so a new meal starts on the
 * likely moment. Past days and late night get no guess: the user picks, or it stays without one.
 */
export function suggestedMealLabel(date: string, now = new Date()): Timing['mealLabel'] | undefined {
  const today = new Date(now.getTime() - 3 * 3600000).toISOString().slice(0, 10);
  return date === today ? mealLabelAt(now) : undefined;
}
/** The moment band an Argentina clock time falls in; late night has none. A suggestion, never a declared type. */
export function mealLabelAt(instant: Date): Timing['mealLabel'] | undefined {
  const hour = new Date(instant.getTime() - 3 * 3600000).getUTCHours();
  return hour >= 5 && hour < 11 ? 'breakfast' : hour >= 11 && hour < 15 ? 'lunch' : hour >= 15 && hour < 19 ? 'snack' : hour >= 19 && hour < 23 ? 'dinner' : undefined;
}
export type MealTimingProps = { date: string; value: Timing; disabled: boolean; onChange: (mealLabel: Timing['mealLabel'], consumedAt?: string) => void };
