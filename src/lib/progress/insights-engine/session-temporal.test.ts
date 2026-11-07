import { describe, expect, it } from 'vitest';
import { sessionTemporalDay } from './session-temporal';
import { periodDetailsFixture } from './period-details-fixture';
import { createInsightsSnapshot, insightsSummary } from './read-model';
import { parsePerformanceInsights } from '../../mobile-api/performance-insights-contract';
import type { InsightsSource } from './types';

const id = (n: number) => `93670423-0000-4000-8000-${String(n).padStart(12,'0')}`;
export function temporalFixture(): InsightsSource {
  const source = periodDetailsFixture(), s = source.sessions[0]!;
  const sessions = [{ ...s, id: id(1), date: '2026-12-31', startedAt: '2026-12-31T23:00:00-03:00', endedAt: '2026-12-31T23:30:00-03:00' },
    { ...s, id: id(2), date: '2026-12-31', startedAt: '2026-12-31T23:45:00-03:00', endedAt: '2027-01-01T00:30:00-03:00' }];
  const meal = (n: number, date: string, at: string | null, source = 'user_declared', values = { calories: 100, proteinG: 10 as number | null, carbsG: 20 as number | null, fatG: 0 as number | null }) =>
    ({ ...periodDetailsFixture().meals[0]!, id: id(100+n), date, consumedAt: at, consumedAtSource: source, entryKind: 'meal', ...values });
  return { ...source, sessions, exercises: [], sets: [], feelings: [], meals: [
    meal(1,'2026-12-31','2026-12-31T22:00:00-03:00'),
    meal(2,'2026-12-31','2026-12-31T23:30:00-03:00','user_declared',{ calories: 0,proteinG: 0,carbsG: 0,fatG: 0 }),
    meal(3,'2027-01-01','2027-01-01T00:45:00-03:00','user_declared',{ calories: 100,proteinG: null,carbsG: 20,fatG: null }),
    meal(4,'2027-01-01','2027-01-01T02:30:00-03:00'), // exact upper boundary: outside first window
    meal(5,'2027-01-01',null), meal(6,'2026-12-31','2026-12-31T23:40:00-03:00','registration_now'),
    meal(7,'2026-12-31','2026-12-31T23:50:00-03:00','default_clock'),
  ] };
}
describe('session-temporal/1: descriptive clocks, existing pre context and posterior facts', () => {
  it('handles midnight, half-open bounds, overlap and independent missing nutrients without exclusivity', () => {
    const body = sessionTemporalDay(temporalFixture(),'2026-12-31','2027-01-01T08:00:00Z','r1'), [a,b] = body.sessions;
    expect(a!.durationMinutes).toBe(30); expect(b!.durationMinutes).toBe(45);
    expect(a!.post).toMatchObject({ knownMeals: 2, uncertainMeals: 3, provisional: false, overlaps: [id(2)], nutrients: { calories: { recorded: 100, missing: 0 },proteinG: { recorded: 0,missing: 1 },fatG: { recorded: 0,missing: 1 } } });
    expect(b!.post!.knownMeals).toBe(2); expect(a!.post!.evidence.rows.some(m => m.id===id(103))).toBe(true); expect(b!.post!.evidence.rows.some(m => m.id===id(103))).toBe(true);
    expect(a!.post!.evidence.rows.some(m => m.id===id(104))).toBe(false);
    expect(parsePerformanceInsights(body)).toEqual(body);
  });
  it('marks an open window provisional and never includes future meals at the read cutoff', () => {
    const body = sessionTemporalDay(temporalFixture(),'2026-12-31','2027-01-01T03:00:00Z','r1');
    expect(body.sessions[0]!.post).toMatchObject({ provisional: true, knownMeals: 1, nutrients: { calories: { recorded: 0, missing: 0 } } });
    expect(body.sessions[1]!.timingState).toBe('invalid_time'); // end still in the future
    expect(parsePerformanceInsights(body)).toEqual(body);
  });
  it('reuses the published pre values including the legacy carbohydrate unknown scope', () => {
    const source = temporalFixture(), first = source.sessions[0]!;
    const altered = { ...source, sessions: [{ ...first, startedAt: '2027-01-01T01:00:00-03:00',endedAt:'2027-01-01T02:00:00-03:00', date:'2027-01-01' }],
      meals: source.meals.filter(m => m.id === id(101)).concat([{ ...source.meals[0]!,id:id(500),date:'2026-12-31',consumedAt:null }]) };
    const temporal = sessionTemporalDay(altered,'2027-01-01','2027-01-02T10:00:00Z','r1').sessions[0]!;
    const original = insightsSummary(createInsightsSnapshot(altered,{today:'2027-01-02',method:2})).facts.days[0]!.sessions[0]!.context;
    expect(temporal.before.carbsPre3h).toEqual(original.carbsPre3h); expect(temporal.before.preStart).toEqual(original.preStart);
    expect(temporal.before.carbsPre3h.state).toBe('recorded'); expect(temporal.before.preStart.proteinG.state).toBe('untimed_meal_in_scope');
  });
  it('keeps empty, missing final, invalid chronology, true zero duration and capped evidence distinct', () => {
    const source=temporalFixture(); expect(sessionTemporalDay(source,'2026-11-01','2027-01-02T10:00:00Z','r1').sessions).toEqual([]);
    for (const endedAt of [null,'2026-12-31T22:00:00-03:00']) { const s={...source,sessions:[{...source.sessions[0]!,endedAt}]}; expect(sessionTemporalDay(s,'2026-12-31','2027-01-02T10:00:00Z','r1').sessions[0]!.post).toBeNull(); }
    const s={...source,sessions:[{...source.sessions[0]!,endedAt:source.sessions[0]!.startedAt}],meals:Array.from({length:1001},(_,i)=>({...source.meals[1]!,id:id(1000+i)}))};
    const body=sessionTemporalDay(s,'2026-12-31','2027-01-02T10:00:00Z','r1'); expect(body.sessions[0]!.durationMinutes).toBe(0);
    expect(body.sessions[0]!.post!.evidence).toMatchObject({total:1001,omitted:981}); expect(body.sessions[0]!.post!.evidence.rows).toHaveLength(20);
    expect(parsePerformanceInsights(body)).toEqual(body); expect(parsePerformanceInsights({...body,associations:'exploratory'})).toBeUndefined();
    const corrupt=structuredClone(body); corrupt.sessions[0]!.post!.nutrients.calories.missing=1002; expect(parsePerformanceInsights(corrupt)).toBeUndefined();
  });
});
