import { describe, expect, it } from '@jest/globals';
import type { DayFact } from '@/api/performance-insights';
import { hoursText, sessionRows } from './insights-model';

type Session = DayFact['sessions'][number];
const base = (preStart?: Session['context']['preStart']): Session => ({
  sessionId: 's1', name: null, routineId: null, routineName: null, startedAt: '2029-03-02T10:00:00.000Z', endedAt: '2029-03-02T11:00:00.000Z',
  counts: { improved: 0, observedStable: 0, declined: 0, ambiguous: 0, insufficient: 0, total: 0, comparable: 0, coverage: null }, exercises: [],
  context: { feelings: {}, legacy: { energyLevel: null, performanceLevel: null, painLevel: null }, carbsPre3h: { value: 60, state: 'recorded' }, ...(preStart ? { preStart } : {}) },
});
const value = (rows: ReturnType<typeof sessionRows>, key: string) => rows.find(row => row.key === key);

describe('#367 fase 2: contexto de alimentación de la sesión', () => {
  it('shows protein, recorded calories and the last explicit meal as separate rows, in their units', () => {
    const rows = sessionRows(base({ proteinG: { value: 25, state: 'recorded' }, calories: { value: 0, state: 'recorded' },
      lastExplicitMeal: { hours: 2.5, state: 'recorded', untimedInScope: false, unverifiedInScope: false } }));
    expect(value(rows, 'protein')?.value).toBe('25 g');
    expect(value(rows, 'calories')?.value).toBe('0 kcal');
    expect(value(rows, 'last-meal')).toMatchObject({ value: 'Hace 2 h 30 min', detail: 'La última registrada con hora, no necesariamente la última que comiste' });
  });
  it('says why a value is missing, and never fills it: no zero, no 12 h, no fasting', () => {
    const rows = sessionRows(base({ proteinG: { value: null, state: 'untimed_meal_in_scope' }, calories: { value: null, state: 'partial_macro' },
      lastExplicitMeal: { hours: null, state: 'no_explicit_meal_in_12h', untimedInScope: true, unverifiedInScope: false } }));
    expect(value(rows, 'protein')?.value).toBe('Comidas sin hora');
    expect(value(rows, 'calories')?.value).toBe('Alguna comida sin ese dato');
    expect(value(rows, 'last-meal')).toMatchObject({ value: 'Ninguna con hora en las 12 h previas', detail: 'Hay comidas sin hora que podrían ser posteriores' });
    const fresh = rows.filter(row => ['protein', 'calories', 'last-meal'].includes(row.key)).map(row => row.value).join(' ');
    expect(fresh).not.toMatch(/ayuno|0 g|0 kcal|Hace 12 h/);
  });
  it('keeps the old rows alone when an older server does not send them', () => {
    const rows = sessionRows(base());
    expect(rows.map(row => row.key)).toEqual(['feelings', 'carbs']);
  });
  it('writes durations in hours and minutes, never as decimals', () => {
    expect([hoursText(0.75), hoursText(3), hoursText(11.99)]).toEqual(['45 min', '3 h', '11 h 59 min']);
  });
});
