import { describe, expect, it, jest } from '@jest/globals';
import type { NutritionDayMeal } from '@/api/nutrition-day';

import { mealMenu } from './day-content';
import { dayShare } from './meal-detail-sheet';
import { mealDraft, repeatMealDraft } from './meal-form-model';

jest.mock('@/training/routine-context-menu', () => ({ TrainingContextMenu: () => null })); // hoisted by Jest

const meal = (patch: Partial<NutritionDayMeal> = {}): NutritionDayMeal => ({
  id: 'm1', updatedAt: '2026-10-14T12:00:00Z', title: 'CAFÉ', description: 'CON LECHE', calories: 130, proteinG: 15, carbsG: 14.8, fatG: null,
  mealLabel: 'breakfast', consumedAt: '2026-10-14T12:17:00Z', timeKnown: true, sourceType: 'manual', entryKind: 'meal', precision: null, ...patch,
} as NutritionDayMeal);
const actions = { edit: jest.fn(), repeat: jest.fn(), save: jest.fn(), remove: jest.fn() };

describe('meal actions (D1, D2, D4)', () => {
  it('manual meals allow everything', () => {
    expect(Object.values(mealMenu(meal(), actions)).every(Boolean)).toBe(true);
  });
  it('ChatGPT meals only repeat or save (the server blocks edit/delete)', () => {
    const menu = mealMenu(meal({ sourceType: 'chatgpt' }), actions);
    expect([!!menu.edit, !!menu.repeat, !!menu.save, !!menu.remove]).toEqual([false, true, true, false]);
  });
  it('a legacy daily summary offers nothing', () => {
    expect(Object.values(mealMenu(meal({ entryKind: 'legacy_daily_summary' }), actions)).some(Boolean)).toBe(false);
  });
});

describe('"En tu día" share', () => {
  it('is the meal over the known day total', () => {
    expect(dayShare(130, { knownTotal: 2000, missingCount: 0 }, 9)).toBeCloseTo(0.065);
  });
  it('is hidden when the meal or the day sum is unknown or partial (missing ≠ zero)', () => {
    expect(dayShare(null, { knownTotal: 2000, missingCount: 0 }, 9)).toBeNull();
    expect(dayShare(130, { knownTotal: 2000, missingCount: 1 }, 9)).toBeNull();
    expect(dayShare(130, { knownTotal: 0, missingCount: 0 }, 1)).toBeNull();
  });
});

describe('drafts', () => {
  it('an edit keeps the meal moment and known time', () => {
    expect(mealDraft('2026-10-14', meal())).toMatchObject({ mealLabel: 'breakfast', consumedAt: '2026-10-14T12:17:00Z' });
    expect(mealDraft('2026-10-14', meal({ timeKnown: false }))).not.toHaveProperty('consumedAt');
  });
  it('"Repetir" copies the values to the new day without the old time; missing macros stay empty', () => {
    const draft = repeatMealDraft('2026-10-15', meal({ calories: 130.4 }));
    expect(draft).toMatchObject({ title: 'CAFÉ', calories: '130', proteinG: '15', carbsG: '14,8', fatG: '' });
    expect(draft).not.toHaveProperty('consumedAt');
  });
});
