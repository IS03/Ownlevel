import { describe, expect, it } from '@jest/globals';
import { insideProgress } from './insights-router';

describe('Comparaciones inside Progreso', () => {
  it('moves only Comparaciones routes to Progreso, keeping their params, and leaves the rest alone', () => {
    expect(insideProgress({ pathname: '/(tabs)/train/insights/period', params: { asOf: '2026-11-19', fromProgress: '1' } }, true))
      .toEqual({ pathname: '/(tabs)/progress/insights/period', params: { asOf: '2026-11-19', fromProgress: '1' } });
    expect(insideProgress('/(tabs)/train/insights', true)).toBe('/(tabs)/progress/insights');
    expect(insideProgress('/(tabs)/train/insights-old', true)).toBe('/(tabs)/train/insights-old');
    expect(insideProgress('/history/calendar', true)).toBe('/history/calendar');
    expect(insideProgress({ pathname: '/(tabs)/train/insights/tramo' }, false)).toEqual({ pathname: '/(tabs)/train/insights/tramo' });
  });
});
