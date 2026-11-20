import { describe, expect, it } from '@jest/globals';
import type { ProgressBodyMetric } from '@/api/progress';
import type { NutritionStages } from '@/api/nutrition-stages';
import { bodyInterval, bodyWeekRange, bodyWeekReference, defaultBodyPair, equivalentPerWeek, intervalStages, measuresComparable } from './body-context-model';
const metric = (key: string, rows: [string, number][]) => ({ key, observations: rows.map(([date, value]) => ({ date, value })) }) as ProgressBodyMetric;
describe('body context: observed changes, not inferred tissue or causes', () => {
  it('prefers the widest circumference span over recent weights and never pairs different body fields', () => {
    expect(defaultBodyPair([metric('body.weight', [['2026-11-17', 70], ['2026-11-18', 71]]),
      metric('body.waist', [['2026-09-20', 80], ['2026-10-20', 80], ['2026-11-08', 81]]), metric('body.chest', [['2026-10-20', 95], ['2026-11-08', 96]]),
      metric('body.arm_right', [['2026-11-10', 30]])]))
      .toEqual({ a: '2026-09-20', b: '2026-11-08' });
    expect(defaultBodyPair([metric('body.arm', [['2026-10-20', 30]]), metric('body.arm_right', [['2026-11-08', 31]])])).toBeNull();
  });
  it('falls back to the first and last valid weights of the period, never invalid records', () => {
    expect(defaultBodyPair([metric('body.weight', [['2026-11-01', 70], ['2026-11-03', 70.4], ['2026-11-04', 71], ['2026-11-06', 0], ['2026-11-08', NaN]])]))
      .toEqual({ a: '2026-11-01', b: '2026-11-04' });
    expect(measuresComparable([metric('body.weight', [['2026-11-01', 70], ['2026-11-04', 71]]), metric('body.waist', [['2026-11-08', 81]])])).toBe(false);
    expect(defaultBodyPair([])).toBeNull();
  });
  it('excludes both endpoints, handles leap days and consecutive records without fabricating context', () => {
    expect(bodyInterval('2028-02-28', '2028-03-01')).toEqual({ elapsed: 2, short: true, context: { start: '2028-02-29', end: '2028-02-29' } });
    expect(bodyInterval('2026-12-31', '2027-01-01')).toEqual({ elapsed: 1, short: true, context: null });
    expect(bodyInterval('', '')).toBeNull();
    expect(bodyInterval('2026-11-10', '2026-11-01')).toBeNull();
  });
  it('only offers a descriptive weekly equivalent for at least 21 elapsed days, preserving zero and sign', () => {
    expect(equivalentPerWeek(1, 20)).toBeNull();
    expect(equivalentPerWeek(3, 21)).toBe(1);
    expect(equivalentPerWeek(-1, 28)).toBe(-0.25);
    expect(equivalentPerWeek(0, 28)).toBe(0);
  });
  it('uses full calendar weeks, not nearest-day substitution, and requires 3 valid weights', () => {
    expect(bodyWeekRange('2027-01-01')).toEqual({ start: '2026-12-28', end: '2027-01-03' });
    const weight = metric('body.weight', [['2026-11-02', 70], ['2026-11-04', 72], ['2026-11-06', 71], ['2026-11-08', 0], ['2026-11-09', 99]]);
    expect(bodyWeekReference(weight, '2026-11-05', '2026-11-19')).toMatchObject({ start: '2026-11-02', end: '2026-11-08', median: 71 });
    expect(bodyWeekReference(metric('body.weight', [['2026-11-02', 70], ['2026-11-04', 71]]), '2026-11-05', '2026-11-19')?.median).toBeNull();
    expect(bodyWeekReference(weight, '2026-11-05', '2026-11-06')).toBeNull();
  });
  it('shows historical stages intersecting the interval, respects exclusive ends and does not use current stage retroactively', () => {
    const list = { past: [{ id: 1, name: 'Anterior', startsOn: '2026-10-01', endsOn: '2026-11-01' },
      { id: 2, name: 'Transición', startsOn: '2026-11-01', endsOn: '2026-11-10' }],
      current: { id: 3, name: 'Actual', startsOn: '2026-11-10', endsOn: null } } as unknown as NutritionStages;
    expect(intervalStages(list, { start: '2026-11-01', end: '2026-11-12' })).toEqual([
      { id: 2, name: 'Transición', start: '2026-11-01', end: '2026-11-09' }, { id: 3, name: 'Actual', start: '2026-11-10', end: '2026-11-12' }]);
  });
});
