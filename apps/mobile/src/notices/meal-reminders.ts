import type { MobileNutritionDayResponse, NutritionDayMeal } from '@/api/nutrition-day';
import { mealMomentAtMinute, type MealMoment, type MealMomentBands } from '@/api/nutrition-moment-bands';
import { cordobaTime } from './close-day';
import type { ReminderSetting } from './notice-preferences';
import type { PlannedReminder, ReminderCategory } from './reminder-engine';

/**
 * #639 · «Comida por horario»: one reminder per meal moment the person turns on (Desayuno, Almuerzo, Merienda, Cena), at
 * its time, only on the days that moment has no meal yet. Neutral: it names the moment, never a food.
 */
export const MEAL_MOMENTS: readonly MealMoment[] = ['breakfast', 'lunch', 'snack', 'dinner'];
export const mealReminderId = (moment: MealMoment) => `meal.${moment}`;
export const mealMomentNames: Record<MealMoment, string> = { breakfast: 'Desayuno', lunch: 'Almuerzo', snack: 'Merienda', dinner: 'Cena' };
const question: Record<MealMoment, string> = { breakfast: '¿Registraste el desayuno?', lunch: '¿Registraste el almuerzo?', snack: '¿Registraste la merienda?', dinner: '¿Registraste la cena?' };

/** Half an hour before the moment ends, by the person's own bands: when the meal is usually done. */
export function defaultMealReminder(moment: MealMoment, bands: MealMomentBands): ReminderSetting {
  const end = moment === 'breakfast' ? bands.lunchFrom : moment === 'lunch' ? bands.snackFrom : moment === 'snack' ? bands.dinnerFrom : bands.dinnerUntil;
  const at = Math.max(0, end - 30);
  return { enabled: false, hour: Math.floor(at / 60), minute: at % 60 };
}

/**
 * The moment a meal belongs to: its declared moment, the server's automatic one, or the band of its known time. A meal
 * with no moment and no known time belongs to none (it never closes a moment by guess).
 */
export function mealMomentOf(meal: NutritionDayMeal, bands: MealMomentBands): MealMoment | null {
  const label = meal.mealLabel ?? meal.automaticMealLabel ?? null;
  if (label && label !== 'extra') return label;
  if (label === 'extra' || !meal.timeKnown) return null;
  const at = Date.parse(meal.consumedAt);
  if (!Number.isFinite(at)) return null;
  const local = new Date(at - 3 * 3600_000);
  return mealMomentAtMinute(local.getUTCHours() * 60 + local.getUTCMinutes(), bands) ?? null;
}
/** The moments of the day that already have a meal, from a full reading; null when it could not tell. */
export function registeredMoments(response: MobileNutritionDayResponse, bands: MealMomentBands): MealMoment[] | null {
  if (response.nutrition.status !== 'ok') return null;
  if (response.nutrition.data.dayState !== 'recorded') return [];
  return [...new Set(response.nutrition.data.meals.filter(meal => meal.entryKind === 'meal').map(meal => mealMomentOf(meal, bands)).filter((m): m is MealMoment => !!m))];
}

const addDays = (date: string, days: number) => { const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + days); return next.toISOString().slice(0, 10); };
export const mealRemindersCategory: ReminderCategory = {
  id: 'meal',
  plan: ({ preferences, today, todayStatus }) => {
    const plan: PlannedReminder[] = [];
    for (const moment of MEAL_MOMENTS) {
      const setting = preferences.reminders[mealReminderId(moment)];
      if (!setting?.enabled) continue;
      for (let offset = 0; offset < 7; offset++) {
        const date = addDays(today, offset);
        // That moment of today already has a confirmed meal: nothing to remind.
        if (offset === 0 && todayStatus?.date === date && todayStatus.moments?.includes(moment)) continue;
        plan.push({ id: `${mealReminderId(moment)}.${date}`, at: cordobaTime(date, setting.hour, setting.minute), title: question[moment], path: '/nutrition' });
      }
    }
    return plan;
  },
};
