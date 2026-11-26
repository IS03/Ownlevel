import { describe, expect, it } from '@jest/globals';
import { defaultNoticePreferences, parseNoticePreferences } from './notice-preferences';
import { BODY_MEASURES, BODY_WEIGHT, bodyFacts, bodyRemindersCategory } from './body-reminders';

const TODAY = '2026-11-25', NOW = Date.parse('2026-11-25T11:00:00Z');
const plan = (reminders: object, facts?: object) => bodyRemindersCategory.plan({ preferences: { ...defaultNoticePreferences, reminders: reminders as never, ...(facts ? { facts } : {}) }, now: NOW, today: TODAY }).map(item => item.id);

describe('Cuerpo reminders (#639)', () => {
  it('weigh-in on the chosen weekdays, not on a day already weighed', () => {
    const weight = { [BODY_WEIGHT]: { enabled: true, hour: 8, minute: 0, days: [3] } };
    expect(plan(weight)).toEqual(['body.weight.2026-11-25']);
    expect(plan(weight, { lastWeightOn: TODAY })).toEqual([]);
  });
  it('measurements only from a known last date (never read: none), every 2 or 4 weeks, on the chosen weekday', () => {
    const measures = { [BODY_MEASURES]: { enabled: true, hour: 9, minute: 0, days: [0], afterDays: 14 } };
    expect(plan(measures)).toEqual([]);
    expect(plan(measures, { lastMeasurementOn: null })).toEqual(['body.measures.2026-11-29']);
    expect(plan(measures, { lastMeasurementOn: '2026-11-20' })).toEqual([]);
    expect(plan(measures, { lastMeasurementOn: '2026-11-10' })).toEqual(['body.measures.2026-11-29']);
  });
  it('facts from a confirmed overview, and kept across a restart', () => {
    const overview = { today: TODAY, current: { date: '2026-11-24', weightKg: 80 }, profileWeightKg: 80, weights: { items: [{ date: '2026-11-24', weightKg: 80 }], nextBefore: null },
      measurements: { items: [], nextBefore: null } } as never;
    expect(bodyFacts(overview)).toEqual({ lastWeightOn: '2026-11-24', lastMeasurementOn: null });
    expect(parseNoticePreferences({ facts: { lastWeightOn: '2026-11-24', lastMeasurementOn: null } }).facts).toEqual({ lastWeightOn: '2026-11-24', lastMeasurementOn: null });
  });
});
