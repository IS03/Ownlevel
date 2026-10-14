import { describe, expect, it } from '@jest/globals';
import { bestSetBars, dayTotalsLabel, historyDayLabel, mondayOf, sameMark, weekRangeLabel, weightModeUnit } from './history-model';

describe('history redesign model (HI1–HI4)', () => {
  it('labels days with month and year only when they differ from today', () => {
    expect(historyDayLabel('2026-10-09', '2026-10-13')).toBe('Viernes 9');
    expect(historyDayLabel('2026-09-20', '2026-10-13')).toBe('Domingo 20 de septiembre');
    expect(historyDayLabel('2025-12-31', '2026-10-13')).toBe('Miércoles 31 de diciembre de 2025');
  });
  it('totals a day without inventing unknown durations', () => {
    expect(dayTotalsLabel([{ durationMilliseconds: 60 * 60_000 }, { durationMilliseconds: 36 * 60_000 }])).toBe('2 sesiones · 1 h 36 min');
    expect(dayTotalsLabel([{ durationMilliseconds: null }])).toBe('');
  });
  it('keeps chart gaps as gaps (oldest first, max 8) and adapts units to the weight mode', () => {
    const sessions = Array.from({ length: 10 }, (_, index) => ({ sessionId: `s${index}`, logDate: `2026-10-${String(10 - index).padStart(2, '0')}`,
      mark: index === 2 ? null : index === 3 ? { weightKg: null, reps: 12 } : { weightKg: 50 + index, reps: 10 } }));
    const bars = bestSetBars(sessions);
    expect(bars).toHaveLength(8); expect(bars.at(-1)).toMatchObject({ sessionId: 's0', value: 50 });
    expect(bars.filter(bar => bar.value === null).map(bar => bar.sessionId)).toEqual(['s3', 's2']);
    expect([null, 'Peso total', 'Lingotes (no kg)', 'Tiempo (segundos)', 'Peso corporal'].map(weightModeUnit)).toEqual(['kg', 'kg', 'placas', 's', null]);
  });
  it('compares marks exactly for the Récord badge and builds Monday-first weeks', () => {
    expect(sameMark({ weightKg: 60, reps: 10 }, { weightKg: 60, reps: 10 })).toBe(true);
    expect(sameMark({ weightKg: 60, reps: 10 }, null)).toBe(false);
    expect(mondayOf('2026-10-11')).toBe('2026-10-05'); expect(weekRangeLabel('2026-10-05')).toBe('5 – 11 oct'); expect(weekRangeLabel('2026-09-28')).toBe('28 sept – 4 oct');
  });
});
