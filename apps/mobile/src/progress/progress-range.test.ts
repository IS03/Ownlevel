import { describe, expect, it } from '@jest/globals';
import { compareRange, initialProgressRange, progressRange, rangeTitle, shortRange, stepProgressRange, type ProgressRangeState } from './progress-range';

const TODAY = '2026-10-15';
const at = (patch: Partial<ProgressRangeState>): ProgressRangeState => ({ ...initialProgressRange(TODAY), ...patch });

describe('Progreso calendar ranges', () => {
  it('month, week, quarters and year are calendar ranges clipped to today', () => {
    expect(progressRange(at({ unit: 'month' }), TODAY)).toEqual({ start: '2026-10-01', end: TODAY });
    expect(progressRange(at({ unit: 'week' }), TODAY)).toEqual({ start: '2026-10-12', end: TODAY });
    expect(progressRange(at({ unit: '3m' }), TODAY)).toEqual({ start: '2026-08-01', end: TODAY });
    expect(progressRange(at({ unit: 'year' }), TODAY)).toEqual({ start: '2026-01-01', end: TODAY });
    expect(progressRange(at({ unit: 'month', anchor: '2026-02-10' }), TODAY)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
  it('steps by unit and never into a range that starts after today', () => {
    expect(stepProgressRange(at({ unit: 'month' }), -1, TODAY)?.anchor).toBe('2026-09-15');
    expect(stepProgressRange(at({ unit: 'month' }), 1, TODAY)).toBeNull();
    expect(stepProgressRange(at({ unit: 'month', anchor: '2026-03-31' }), -1, TODAY)?.anchor).toBe('2026-02-28');
    expect(stepProgressRange(at({ unit: 'custom', custom: { start: '2026-10-01', end: '2026-10-05' } }), -1, TODAY)).toBeNull();
  });
});

describe('Comparison is opt-in and calendar-aware', () => {
  it('none by default', () => {
    expect(compareRange(initialProgressRange(TODAY), TODAY)).toBeNull();
  });
  it('a month in progress compares with the same days of the previous month', () => {
    expect(compareRange(at({ compare: { kind: 'previous' } }), TODAY)).toEqual({ start: '2026-09-01', end: '2026-09-15' });
    expect(compareRange(at({ compare: { kind: 'last_year' } }), TODAY)).toEqual({ start: '2025-10-01', end: '2025-10-15' });
  });
  it('a finished month compares with the whole previous month, whatever its length', () => {
    expect(compareRange(at({ anchor: '2026-08-10', compare: { kind: 'previous' } }), TODAY)).toEqual({ start: '2026-07-01', end: '2026-07-31' });
    expect(compareRange(at({ anchor: '2026-03-10', compare: { kind: 'previous' } }), TODAY)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
  it('custom ranges compare with the preceding window of equal length, or the explicit range', () => {
    const custom = { start: '2026-10-05', end: '2026-10-09' };
    expect(compareRange(at({ unit: 'custom', custom, compare: { kind: 'previous' } }), TODAY)).toEqual({ start: '2026-09-30', end: '2026-10-04' });
    expect(compareRange(at({ compare: { kind: 'custom', range: { start: '2026-03-01', end: '2026-03-31' } } }), TODAY)).toEqual({ start: '2026-03-01', end: '2026-03-31' });
  });
});

describe('Labels', () => {
  it('reads like the sketches', () => {
    expect(rangeTitle(at({}), TODAY)).toEqual({ title: 'Octubre 2026', subtitle: 'del 1 al 15 · en curso' });
    expect(rangeTitle(at({ anchor: '2026-09-02' }), TODAY)).toEqual({ title: 'Septiembre 2026', subtitle: '30 días' });
    expect(shortRange({ start: '2026-09-01', end: '2026-09-15' }, TODAY)).toBe('1–15 sep');
    expect(shortRange({ start: '2026-09-28', end: '2026-10-04' }, TODAY)).toBe('28 sep – 4 oct');
    expect(shortRange({ start: '2025-12-20', end: '2026-01-05' }, TODAY)).toBe('20 dic 2025 – 5 ene 2026');
  });
});
