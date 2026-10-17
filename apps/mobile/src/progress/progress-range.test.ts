import { describe, expect, it } from '@jest/globals';
import { compareRange, currentProgressRange, initialProgressRange, isCurrentProgressRange, periodHeading, progressRange, rangeTitle, rangeShortLabel, shiftLabel, shiftProgressRange, shortRange, stepProgressRange, type ProgressRangeState } from './progress-range';

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
describe('periodHeading', () => {
  it('names the period the way you would say it', () => {
    expect(periodHeading(at({ unit: 'month', anchor: '2026-09-10' }), TODAY)).toBe('Tu septiembre');
    expect(periodHeading(at({ unit: 'week' }), TODAY)).toBe('Tu semana');
    expect(periodHeading(at({ unit: '3m' }), TODAY)).toBe('Tus 3 meses');
    expect(periodHeading(at({ unit: 'year', anchor: '2025-06-01' }), TODAY)).toBe('Tu 2025');
    expect(periodHeading(at({ unit: 'custom', custom: { start: '2026-10-01', end: '2026-10-03' } }), TODAY)).toBe('Tu período');
  });
});

describe('Personalizado · anterior / siguiente / volver a hoy', () => {
  it('names the step after the unit and moves a custom range by its own length, never past today', () => {
    expect(shiftLabel('week', -1)).toBe('Semana anterior');
    expect(shiftLabel('3m', -1)).toBe('3 meses anteriores');
    expect(shiftLabel('6m', 1)).toBe('6 meses siguientes');
    const custom = at({ unit: 'custom', custom: { start: '2026-10-06', end: '2026-10-10' } });
    expect(shiftProgressRange(custom, -1, TODAY)?.custom).toEqual({ start: '2026-10-01', end: '2026-10-05' });
    expect(shiftProgressRange(custom, 1, TODAY)?.custom).toEqual({ start: '2026-10-11', end: '2026-10-15' });
    expect(shiftProgressRange(at({ unit: 'custom', custom: { start: '2026-10-11', end: '2026-10-15' } }), 1, TODAY)).toBeNull();
    expect(shiftProgressRange(at({ unit: 'month' }), 1, TODAY)).toBeNull();
  });
  it('knows when you are away from today and brings the same unit back', () => {
    const september = shiftProgressRange(at({ unit: 'month' }), -1, TODAY)!;
    expect(isCurrentProgressRange(september, TODAY)).toBe(false);
    expect(progressRange(currentProgressRange(september, TODAY), TODAY)).toEqual({ start: '2026-10-01', end: TODAY });
    expect(currentProgressRange(at({ unit: 'custom', custom: { start: '2026-01-01', end: '2026-01-31' } }), TODAY).unit).toBe('month');
  });
});

describe('the collapsed bar names the period', () => {
  it('this one, the previous one, an older one by its name, and a custom range by its dates', () => {
    expect(rangeShortLabel(at({ unit: 'month' }), TODAY)).toBe('Este mes');
    expect(rangeShortLabel(shiftProgressRange(at({ unit: 'week' }), -1, TODAY)!, TODAY)).toBe('Semana anterior');
    expect(rangeShortLabel(at({ unit: 'month', anchor: '2026-08-10' }), TODAY)).toBe('Agosto 2026');
    expect(rangeShortLabel(at({ unit: 'custom', custom: { start: '2026-09-16', end: TODAY } }), TODAY)).toBe('16 sep – 15 oct');
  });
});
