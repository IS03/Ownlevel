import { describe, expect, it } from '@jest/globals';
import { routineOrderAtTop } from './routine-order-list';

describe('routine drag slots', () => {
  it('moves around measured midpoints, including Dynamic Type heights', () => {
    const ids = ['a', 'b', 'c']; const heights = { a: 80, b: 160, c: 100 };
    expect(routineOrderAtTop(ids, heights, 'a', 79)).toEqual(['a', 'b', 'c']);
    expect(routineOrderAtTop(ids, heights, 'a', 81)).toEqual(['b', 'a', 'c']);
    expect(routineOrderAtTop(ids, heights, 'a', 220)).toEqual(['b', 'c', 'a']);
    expect(routineOrderAtTop(ids, heights, 'c', -10)).toEqual(['c', 'a', 'b']);
    expect(ids).toEqual(['a', 'b', 'c']);
  });
  it('keeps all rows before native measurement, bounds moves and rejects unknown handles', () => {
    expect(routineOrderAtTop(['a', 'b'], {}, 'a', 100)).toEqual(['b', 'a']);
    expect(routineOrderAtTop(['a', 'b'], {}, 'b', -100)).toEqual(['b', 'a']);
    expect(routineOrderAtTop(['a', 'b'], {}, 'missing', 100)).toEqual(['a', 'b']);
  });
});
