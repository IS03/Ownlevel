import { describe, expect, it } from '@jest/globals';
import { suggestedMealLabel } from './meal-timing-model';

// Argentina is UTC−3 all year: 12:00Z is 09:00 local.
const at = (iso: string) => new Date(iso);
describe('suggestedMealLabel', () => {
  it('suggests today by the local clock', () => {
    expect(suggestedMealLabel('2026-10-15', at('2026-10-15T12:00:00Z'))).toBe('breakfast');
    expect(suggestedMealLabel('2026-10-15', at('2026-10-15T16:00:00Z'))).toBe('lunch');
    expect(suggestedMealLabel('2026-10-15', at('2026-10-15T20:00:00Z'))).toBe('snack');
    expect(suggestedMealLabel('2026-10-15', at('2026-10-15T23:30:00Z'))).toBe('dinner');
  });
  it('does not guess late at night or for another day', () => {
    expect(suggestedMealLabel('2026-10-15', at('2026-10-15T03:19:00Z'))).toBeUndefined(); // 00:19 local
    expect(suggestedMealLabel('2026-10-14', at('2026-10-15T15:00:00Z'))).toBeUndefined();
  });
});
