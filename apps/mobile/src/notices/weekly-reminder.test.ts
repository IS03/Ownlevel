import { describe, expect, it } from '@jest/globals';
import { defaultNoticePreferences } from './notice-preferences';
import { WEEKLY, weeklyReminderCategory } from './weekly-reminder';

describe('«Resumen semanal» (#639)', () => {
  it('on the chosen weekday at the chosen time, neutral, opening Progreso; off, none', () => {
    const plan = (setting?: object) => weeklyReminderCategory.plan({ preferences: { ...defaultNoticePreferences, reminders: setting ? { [WEEKLY]: setting as never } : {} },
      now: Date.parse('2026-11-25T15:00:00Z'), today: '2026-11-25' });
    expect(plan({ enabled: true, hour: 20, minute: 0, days: [0] })).toEqual([{ id: 'weekly.2026-11-29', at: Date.parse('2026-11-29T23:00:00Z'), title: 'Tu semana',
      body: 'Mirá cómo te fue estos siete días.', path: '/progress' }]);
    expect(plan()).toEqual([]);
    expect(plan({ enabled: true, hour: 20, minute: 0, days: [] })).toEqual([]);
  });
});
