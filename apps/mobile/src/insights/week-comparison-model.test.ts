import { describe, it, expect } from '@jest/globals';
import { periodDetailsFixture } from '../../../../src/lib/progress/insights-engine/period-details-fixture';
import { periodExploration } from '../../../../src/lib/progress/insights-engine/week-exploration';
import { nextWeekIndex, selectedWeeks, weeklyNutrient, differentCoverage, weeklyResults, weightComparison, weekComparisonSummary } from './week-comparison-model';

const data = () => periodExploration(periodDetailsFixture(), [], '2027-01-02', '2026-11-07', 'r1', 2);
describe('weekly comparison over the existing projection', () => {
  it('defaults by calendar, keeps distinct choices and never replaces an invalid explicit week', () => {
    const d = data(), i = d.weeks.findIndex(w => w.start === '2026-08-10');
    expect(selectedWeeks(d, '2026-08-10')).toEqual({ a: i - 1, b: i });
    expect(selectedWeeks(d, d.weeks[0]!.start)).toEqual({ a: 0, b: 1 });
    expect(selectedWeeks(d, undefined, '2026-08-10', '2026-08-10')).toBeNull();
    expect(selectedWeeks(d, undefined, '2025-01-01', '2026-08-10')).toBeNull();
    expect(nextWeekIndex(d.weeks.length, i - 1, i, 1)).toBe(i + 1);
    expect(nextWeekIndex(d.weeks.length, 0, 1, -1)).toBeNull();
  });
  it('uses known-day denominators, retaining zero, partial, wholly unknown and unrecorded independently', () => {
    const d = data(), w = d.weeks.find(w => w.start === '2026-08-10')!, empty = d.weeks.find(w => w.start === '2026-08-03')!;
    expect(weeklyNutrient(w, 'calories')).toEqual({ total: 100, mean: 50, knownDays: 2, days: 7, complete: 2, partial: 0, unknown: 1, unrecorded: 4, records: 3, missing: 1 });
    expect(weeklyNutrient(w, 'proteinG')).toMatchObject({ total: 0, mean: 0, complete: 1, partial: 1, unknown: 1, unrecorded: 4, missing: 2 });
    expect(weeklyNutrient(empty, 'calories')).toMatchObject({ total: null, mean: null, knownDays: 0, unrecorded: 7 });
    expect(differentCoverage(weeklyNutrient(w, 'calories'), weeklyNutrient(empty, 'calories'))).toBe(true);
    expect(weekComparisonSummary(empty, w).some(s => s.includes('cobertura') && s.includes('difiere'))).toBe(true);
  });
  it('leaves each comparator in its own lane, without adding their denominators', () => {
    const d = data(), w = d.weeks.find(w => w.start === '2026-08-03')!;
    const strict = weeklyResults(w, 'strict'), partial = weeklyResults(w, 'partial');
    expect(strict.total).toBe(7); expect(partial.total).toBe(7);
    expect(strict.insufficient).toBe(7); expect(partial.insufficient).toBe(7);
  });
  it('distinguishes insufficient weight from a computed zero, including year changes and nonconsecutive weeks', () => {
    const weights = ['2025-12-29', '2025-12-31', '2026-01-02', '2026-01-12', '2026-01-14', '2026-01-16'].map(date => ({ date, value: 80 }));
    const d = periodExploration(periodDetailsFixture(), weights, '2026-02-03', '2026-02-03', 'r1', 2);
    const a = d.weeks.find(w => w.start === '2025-12-29')!, b = d.weeks.find(w => w.start === '2026-01-12')!;
    expect(weightComparison(a, b)).toEqual({ a: 80, b: 80, difference: 0, weeksApart: 2 });
    const lower = { ...b, weight: { ...b.weight!, median: 79, weighIns: b.weight!.weighIns.map(w => ({ ...w, value: 79 })) } };
    expect(weightComparison(a, lower).difference).toBe(-1);
    expect(weightComparison(lower, a).difference).toBe(1);
    const short = { ...b, weight: { ...b.weight!, median: null, weighIns: b.weight!.weighIns.slice(0, 2) } };
    expect(weightComparison(a, short).difference).toBeNull();
    expect(weightComparison(d.weeks[0]!, b).difference).toBeNull();
    expect(weekComparisonSummary(a, b).join(' ')).toContain('B − A: 0 kg');
    expect(weekComparisonSummary(a, short).join(' ')).toContain('falta al menos una mediana');
  });
});
