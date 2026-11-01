import { describe, expect, it } from '@jest/globals';
import { mealLabelAt, mealTimingPresentation, suggestedMealLabel } from './meal-timing-model';

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
describe('confirmed timing in an editable form (#308)', () => {
  const reference = { date: '2026-10-15', consumedAt: '2026-10-15T23:15:00.123456Z', timeKnown: false,
    timeSource: 'registration' as const, automaticMealLabel: 'dinner' as const };
  it('shows the server automatic values without adding them to the draft', () => {
    const draft = { mealLabel: null };
    expect(mealTimingPresentation(reference.date, draft, reference)).toEqual({ clock: '20:15', approximate: true, moment: 'Cena' });
    expect(draft).toEqual({ mealLabel: null });
  });
  it('keeps unknown same-day times unknown and never carries a reference to another day', () => {
    expect(mealTimingPresentation(reference.date, { mealLabel: null }, { ...reference, timeSource: 'unknown', automaticMealLabel: null }))
      .toEqual({ clock: undefined, approximate: false, moment: 'Sin momento' });
    expect(mealTimingPresentation('2026-10-16', { mealLabel: null }, reference))
      .toEqual({ clock: undefined, approximate: false, moment: 'Sin momento' });
  });
  it('lets explicit edits win and leaves a changed time for the server to classify', () => {
    expect(mealTimingPresentation(reference.date, { mealLabel: 'lunch' }, reference).moment).toBe('Almuerzo');
    expect(mealTimingPresentation(reference.date, { mealLabel: null, consumedAt: '2026-10-15T13:00:00-03:00' }, reference))
      .toEqual({ clock: '13:00', approximate: false, moment: 'Almuerzo' });
  });
});
describe('mealLabelAt (#308)', () => {
  it('classifies a registration instant by the Argentina clock, with no band late at night', () => {
    expect(mealLabelAt(at('2026-10-15T16:42:00Z'))).toBe('lunch'); // 13:42 local
    expect(mealLabelAt(at('2026-10-15T23:00:00Z'))).toBe('dinner'); // 20:00 local
    expect(mealLabelAt(at('2026-10-16T02:30:00Z'))).toBeUndefined(); // 23:30 local
  });
});
