import { suggestedMealLabel } from './meal-timing-model';
import type { NutritionDayMeal } from '../../../../src/lib/mobile-api/nutrition-day-contract';
import { parseManualMealFields, type ManualMealFields } from '@/api/nutrition-meal';
import { inputNutritionDate, parseInputNutritionDate } from './day-format';
export type MealDraft = { mealLabel?: ManualMealFields['mealLabel']; consumedAt?: string; saveToLibrary?: boolean; date: string; title: string; description: string; calories: string; proteinG: string; carbsG: string; fatG: string };
export function mealDraft(date: string, meal?: NutritionDayMeal | null): MealDraft {
  const number = (n: number | null | undefined) => n == null ? '' : String(n).replace('.', ',');
  // An edit shows the meal's own moment and time (only a known time); a new meal starts on today's likely moment.
  const timing: Pick<MealDraft, 'mealLabel' | 'consumedAt'> = meal ? { mealLabel: meal.mealLabel, ...(meal.timeKnown ? { consumedAt: meal.consumedAt } : {}) }
    : (moment => moment ? { mealLabel: moment } : {})(suggestedMealLabel(date));
  return { ...timing, date: inputNutritionDate(date), title: meal?.title ?? '', description: meal?.description ?? '', calories: number(meal?.calories),
    proteinG: number(meal?.proteinG), carbsG: number(meal?.carbsG), fatG: number(meal?.fatG) };
}
/**
 * "Repetir": a new manual meal with the same values on `date` (today by default). Only the values travel:
 * origin and precision stay with the original, and the moment is today's, not the old meal's.
 */
export function repeatMealDraft(date: string, meal: NutritionDayMeal): MealDraft {
  const values = mealDraft(date, meal), moment = suggestedMealLabel(date);
  const { mealLabel: _label, consumedAt: _time, ...rest } = values;
  return { ...(moment ? { mealLabel: moment } : {}), ...rest, calories: meal.calories == null ? '' : String(Math.round(meal.calories)) };
}
export function validateMealDraft(draft: MealDraft): { fields?: ManualMealFields; errors: Partial<Record<keyof MealDraft, string>> } {
  const errors: Partial<Record<keyof MealDraft, string>> = {};
  const date = parseInputNutritionDate(draft.date);
  if (!date) errors.date = 'Ingresá una fecha válida (DD/MM/AAAA).';
  const number = (key: 'calories' | 'proteinG' | 'carbsG' | 'fatG') => {
    const text = draft[key].trim();
    if (!text && key !== 'calories') return null;
    if (!/^\d+(?:[,.]\d{1,2})?$/.test(text)) { errors[key] = 'Ingresá un número válido, con hasta dos decimales.'; return null; }
    const value = Number(text.replace(',', '.'));
    if (key === 'calories' ? !Number.isInteger(value) || value <= 0 || value > 2147483647 : value > (key === 'proteinG' ? 999999.99 : 99999999.99)) {
      errors[key] = key === 'calories' ? 'Las calorías deben ser enteras y mayores a 0.' : 'El valor supera el límite permitido.';
    }
    return value;
  };
  const fields = parseManualMealFields({ date, title: draft.title, description: draft.description, calories: number('calories'),
    proteinG: number('proteinG'), carbsG: number('carbsG'), fatG: number('fatG'), ...('mealLabel' in draft ? { mealLabel: draft.mealLabel } : {}), ...('consumedAt' in draft ? { consumedAt: draft.consumedAt } : {}), ...('saveToLibrary' in draft ? { saveToLibrary: draft.saveToLibrary } : {}) });
  if (draft.saveToLibrary && !(draft.title.trim() || draft.description.trim())) errors.title = 'Poné un nombre para guardarla en tus comidas.';
  return { fields: Object.keys(errors).length ? undefined : fields, errors };
}
export function isMealDraft(value: unknown): value is MealDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).every(k => ['date','title','description','calories','proteinG','carbsG','fatG','mealLabel','consumedAt','saveToLibrary'].includes(k)) && (v.saveToLibrary === undefined || typeof v.saveToLibrary === 'boolean') && (v.mealLabel === undefined || [null,'breakfast','lunch','snack','dinner','extra'].includes(v.mealLabel as string | null)) && (v.consumedAt === undefined || typeof v.consumedAt === 'string') && ['date','title','description','calories','proteinG','carbsG','fatG'].every(k => typeof v[k] === 'string');
}
