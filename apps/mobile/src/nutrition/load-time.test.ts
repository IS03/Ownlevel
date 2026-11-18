import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { loadTime } from './meal-timing-model';
import { mealDraft, validateMealDraft } from './meal-form-model';
import { quickDraft, selectionFromDraft } from './quick-model';
import type { QuickOption } from '@/api/nutrition-quick';

// 16:48 in Córdoba (UTC−3) on 17/11.
const now = new Date('2026-11-17T19:48:30Z');
const option = { source: { kind: 'saved', id: '41200000-0000-4000-8000-000000000001', version: 'a'.repeat(64) }, name: 'BANANA', description: null,
  templateType: 'manual', calories: 125, proteinG: 1.5, carbsG: 31, fatG: 0.4, items: [], useCount: null, lastUsedDate: null } as unknown as QuickOption;
afterEach(() => { jest.useRealTimers(); });

describe('a new meal of today keeps its load time as a real time', () => {
  it('today: the Córdoba clock at load; another day: no time (the person picks it)', () => {
    expect(loadTime('2026-11-17', now)).toBe('2026-11-17T16:48:00-03:00');
    expect(loadTime('2026-11-16', now)).toBeUndefined();
    // Just after local midnight it is already the next day.
    expect(loadTime('2026-11-18', new Date('2026-11-18T03:05:00Z'))).toBe('2026-11-18T00:05:00-03:00');
  });
  it('Rápido and manual drafts carry it, and it reaches what is sent (preview and save use the same selection)', () => {
    jest.useFakeTimers({ now, doNotFake: ['nextTick', 'setImmediate'] });
    const quick = selectionFromDraft(quickDraft('2026-11-17', option)).selection;
    // Declared: the load time is the person's own statement («I load when I eat»), so Comparaciones counts it.
    expect(quick).toMatchObject({ consumedAt: '2026-11-17T19:48:00.000Z', consumedAtSource: 'user_declared' });
    const manual = mealDraft('2026-11-17');
    expect(manual.consumedAt).toBe('2026-11-17T16:48:00-03:00');
    expect(validateMealDraft({ ...manual, calories: '100' }).fields).toMatchObject({ consumedAt: '2026-11-17T19:48:00.000Z', consumedAtSource: 'user_declared' });
    expect(quickDraft('2026-11-10', option)).not.toHaveProperty('consumedAt');
    expect(mealDraft('2026-11-10')).not.toHaveProperty('consumedAt');
  });
});
