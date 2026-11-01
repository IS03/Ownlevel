import type { MealTiming as Timing } from '../../../../src/lib/mobile-api/nutrition-meal-contract';
import type { NutritionDayMeal } from '../../../../src/lib/mobile-api/nutrition-day-contract';
export const mealMoments = { breakfast: 'Desayuno', lunch: 'Almuerzo', snack: 'Merienda', dinner: 'Cena', extra: 'Extra' };
export function automaticMealMoment(label: keyof typeof mealMoments) {
  return mealMoments[label];
}
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
/** A confirmed read for display only. It never becomes part of the editable draft or mutation intent. */
export type MealTimingReference = Pick<NutritionDayMeal, 'consumedAt' | 'timeKnown' | 'timeSource' | 'automaticMealLabel'> & { date: string };
export function mealTimingPresentation(date: string, value: Timing, reference?: MealTimingReference) {
  const source = reference?.date === date ? reference : undefined;
  const approximate = !value.consumedAt && source?.timeSource === 'registration' && !source.timeKnown;
  const instant = value.consumedAt ?? (approximate ? source?.consumedAt : undefined);
  const parsed = instant ? Date.parse(instant) : NaN;
  const clock = Number.isFinite(parsed) ? new Date(parsed - 10800000).toISOString().slice(11, 16) : undefined;
  const automatic = !value.mealLabel && source?.automaticMealLabel;
  const unchangedTime = !value.consumedAt || value.consumedAt === source?.consumedAt;
  return { clock, approximate: !!approximate && !!clock,
    moment: value.mealLabel ? mealMoments[value.mealLabel]
      : automatic ? mealMoments[unchangedTime || !clock ? automatic : (mealLabelAt(new Date(instant!)) ?? 'extra')] : 'Sin momento' };
}
export type MealTimingProps = { date: string; value: Timing; reference?: MealTimingReference; disabled: boolean; onChange: (mealLabel: Timing['mealLabel'], consumedAt?: string) => void };
