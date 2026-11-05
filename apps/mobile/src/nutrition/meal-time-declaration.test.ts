import { describe, expect, it } from '@jest/globals';
import { isMealDraft, mealDraft, repeatMealDraft, validateMealDraft } from './meal-form-model';
import { parseQuickDraft, quickDraft, selectionFromDraft } from './quick-model';
import type { NutritionDayMeal } from '@/api/nutrition-day';
import type { QuickOption } from '@/api/nutrition-quick';

const DATE = '2026-10-14', TIME = `${DATE}T13:00:00-03:00`;
const meal = { id: '93670000-0000-4000-8000-00000000000a', updatedAt: '2026-10-14T12:17:00Z', title: 'A', description: null, calories: 500, proteinG: 30, carbsG: 60, fatG: 10,
  mealLabel: 'lunch', consumedAt: '2026-10-14T16:00:00.000Z', timeKnown: true, timeSource: 'explicit', automaticMealLabel: null, sourceType: 'manual', entryKind: 'meal', precision: null } as unknown as NutritionDayMeal;
const option = { source: { kind: 'saved', id: '93670000-0000-4000-8000-00000000000b', version: 'a'.repeat(64) }, name: 'H', description: null, templateType: 'manual', items: [], useCount: null, lastUsedDate: null, calories: 400, proteinG: 20, carbsG: 50, fatG: 10 } as QuickOption;

describe('una hora solo se declara cuando la persona la elige', () => {
  it('opening an edit resends the known time without declaring it', () => {
    const draft = mealDraft(DATE, meal);
    expect(draft).toMatchObject({ consumedAt: meal.consumedAt });
    expect(draft).not.toHaveProperty('consumedAtSource');
    expect(validateMealDraft(draft).fields).not.toHaveProperty('consumedAtSource');
  });
  it('sends the declaration of a chosen time, even with the same value', () => {
    const draft = { ...mealDraft(DATE, meal), consumedAtSource: 'user_declared' as const };
    expect(validateMealDraft(draft).fields).toMatchObject({ consumedAt: meal.consumedAt, consumedAtSource: 'user_declared' });
    expect(isMealDraft(draft)).toBe(true);
  });
  it('rejects a stored draft whose declaration has no time, and keeps accepting an old one', () => {
    expect(isMealDraft({ ...mealDraft(DATE), consumedAtSource: 'user_declared' })).toBe(false);
    expect(isMealDraft({ ...mealDraft(DATE, meal), consumedAtSource: 'default_clock' })).toBe(false);
    expect(isMealDraft(mealDraft(DATE, meal))).toBe(true);
  });
  it('repeating a meal carries neither its time nor its declaration', () => {
    const draft = repeatMealDraft(DATE, meal);
    expect(draft).not.toHaveProperty('consumedAt'); expect(draft).not.toHaveProperty('consumedAtSource');
  });
  it('travels through the quick draft and survives its storage', () => {
    const draft = { ...quickDraft(DATE, option), consumedAt: TIME, consumedAtSource: 'user_declared' as const };
    expect(selectionFromDraft(draft).selection).toMatchObject({ consumedAtSource: 'user_declared' });
    expect(parseQuickDraft(JSON.parse(JSON.stringify(draft)))).toMatchObject({ consumedAtSource: 'user_declared' });
    expect(selectionFromDraft({ ...quickDraft(DATE, option), consumedAt: TIME }).selection).not.toHaveProperty('consumedAtSource');
  });
});
