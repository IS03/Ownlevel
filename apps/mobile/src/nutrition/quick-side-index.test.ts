import { describe, expect, it } from '@jest/globals';
import { nearestPresent } from './quick-side-index';

const LETTERS = '#ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');

describe('Rápido · índice deslizable', () => {
  it('a letter with meals is itself; an empty one lands on the closest with meals, the next one on a tie', () => {
    const present = new Set(['B', 'C', 'N', 'P']);
    expect(nearestPresent(LETTERS, present, LETTERS.indexOf('C'))).toBe('C');
    expect(nearestPresent(LETTERS, present, LETTERS.indexOf('A'))).toBe('B');
    expect(nearestPresent(LETTERS, present, LETTERS.indexOf('Ñ'))).toBe('N');
    expect(nearestPresent(LETTERS, present, LETTERS.indexOf('O'))).toBe('P');
    expect(nearestPresent(LETTERS, present, LETTERS.indexOf('Z'))).toBe('P');
  });
  it('without meals there is nowhere to jump', () => {
    expect(nearestPresent(LETTERS, new Set(), 3)).toBeNull();
  });
});
