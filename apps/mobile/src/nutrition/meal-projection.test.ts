import { describe, expect, it } from '@jest/globals';
import type { MobileNutritionDayResponse } from '@/api/nutrition-day';
import { nutritionFixture } from './day-fixture.test-helper';
import { momentMeals, projectionLines } from './meal-projection';

/** Synthetic day only: one 200 kcal meal with unknown protein, targets 1.800 kcal and 140 g. */
const meal = { calories: 90, proteinG: 1.1, carbsG: 23, fatG: 0.3 };
const missing: MobileNutritionDayResponse = { ...nutritionFixture(), nutrition: { status: 'ok', data: { dayState: 'missing', summary: null, context: null, meals: [] } } };

describe('«Así queda tu día»', () => {
  it('adds the meal to what the day already has, against its target; an unknown day total stays unknown (missing ≠ zero)', () => {
    const lines = projectionLines(nutritionFixture(), meal);
    expect(lines.calories).toEqual({ before: 200, after: 290, target: 1800, partial: false });
    expect(lines.protein).toMatchObject({ before: null, after: null, target: 140 });
    expect(projectionLines(nutritionFixture(), { ...meal, calories: null }).calories.after).toBeNull();
  });
  it('a day with nothing recorded ends with exactly this meal, with no invented target', () => {
    expect(projectionLines(missing, meal).calories).toEqual({ before: 0, after: 90, target: null, partial: false });
  });
  it('lists what is already in that moment: declared, or the server reading of the time', () => {
    const day = nutritionFixture(), data = day.nutrition.status === 'ok' && day.nutrition.data.dayState === 'recorded' ? day.nutrition.data : null;
    const base = data!.meals[0]!;
    const withMeals: MobileNutritionDayResponse = { ...day, nutrition: { status: 'ok', data: { ...data!, meals: [
      { ...base, id: 'a', mealLabel: 'breakfast' }, { ...base, id: 'b', mealLabel: null, automaticMealLabel: 'breakfast' }, { ...base, id: 'c', mealLabel: 'lunch' }] } } };
    expect(momentMeals(withMeals, 'breakfast').map(m => m.id)).toEqual(['a', 'b']);
    expect(momentMeals(withMeals, undefined)).toEqual([]);
    expect(momentMeals(missing, 'breakfast')).toEqual([]);
  });
});
