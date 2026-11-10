import { describe, expect, it } from '@jest/globals';
import { figuresFitInRow } from './figure-layout';

describe('figuresFitInRow', () => {
  it('keeps two short figures side by side in a standard iPhone container', () => {
    expect(figuresFitInRow({ texts: ['80,5 kg', '↘ 1,5 kg'], width: 358, fontScale: 1, variant: 'largeTitle' })).toBe(true);
  });
  it('stacks long figures in a 320 pt container instead of splitting value and unit', () => {
    expect(figuresFitInRow({ texts: ['111,8 kg', '↘ 12,2 kg'], width: 288, fontScale: 1, variant: 'largeTitle' })).toBe(false);
    expect(figuresFitInRow({ texts: ['0 pasos', '151.130 pasos', '112.853 pasos'], width: 288, fontScale: 1, variant: 'headline' })).toBe(false);
  });
  it('always stacks with large Dynamic Type, whatever the width', () => {
    expect(figuresFitInRow({ texts: ['1', '2'], width: 2000, fontScale: 1.35, variant: 'largeTitle' })).toBe(false);
  });
  it('grows the estimate with the text size before reaching the large-text threshold', () => {
    const at = (fontScale: number) => figuresFitInRow({ texts: ['2.087', '141 g'], width: 260, fontScale, variant: 'largeTitle' });
    expect(at(1)).toBe(true); expect(at(1.3)).toBe(false);
  });
});
