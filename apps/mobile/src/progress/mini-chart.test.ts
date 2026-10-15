import { describe, expect, it } from '@jest/globals';
import { sparkGeometry } from './mini-chart';

const pt = (start: string, value: number | null) => ({ start, end: start, value });

describe('sparkGeometry', () => {
  it('bars start at 0: gaps stay gaps, zero is its own mark, heights are proportional', () => {
    const [g] = sparkGeometry([pt('2026-10-01', 50), pt('2026-10-02', null), pt('2026-10-03', 0), pt('2026-10-04', 100)], null, 'bars');
    expect(g.map(m => [m.kind, m.height])).toEqual([['mark', 0.5], ['missing', 0], ['zero', 0], ['mark', 1]]);
  });
  it('a comparison shares the scale and goes in date order, even when it is later than the period', () => {
    const groups = sparkGeometry([pt('2026-09-01', 80)], [pt('2026-10-01', 82)], 'level');
    expect(groups.map(g => g[0].tone)).toEqual(['current', 'reference']);
    expect(groups.map(g => g[0].height)).toEqual([0, 1]);
    const before = sparkGeometry([pt('2026-10-01', 81)], [pt('2026-09-01', 80), pt('2026-09-02', 82)], 'level');
    expect(before.map(g => g[0].tone)).toEqual(['reference', 'current']);
    expect(before[1][0].height).toBe(0.5);
  });
});
