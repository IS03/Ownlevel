import { describe, expect, it } from '@jest/globals';
import { nutritionDifference, nutritionValue } from './nutrition-values';

describe('Nutrition chart/detail precision', () => {
  it.each(['g', 'kcal'] as const)('keeps missing and real zero distinct for %s', unit => {
    expect(nutritionValue(null, unit)).toBe('—');
    expect(nutritionValue(0, unit)).toBe(`0 ${unit}`);
  });
  it('keeps sub-gram amounts and a truthful label below the smallest precision', () => {
    expect(nutritionValue(0.4, 'g')).toBe('0,4 g');
    expect(nutritionValue(0.01, 'g')).toBe('< 0,1 g');
    expect(nutritionValue(0.01, 'g', true)).toBe('menos de 0,1 g');
    expect(nutritionValue(0.2, 'kcal')).toBe('< 1 kcal');
  });
  it('does not turn a small nonzero difference into neutrality', () => {
    expect(nutritionDifference(-0.2)).toBe('−< 1 kcal');
    expect(nutritionDifference(0.2)).toBe('+< 1 kcal');
    expect(nutritionDifference(0)).toBe('0 kcal');
    expect(nutritionDifference(null)).toBe('—');
    expect(nutritionDifference(-100)).toBe('−100 kcal');
    expect(nutritionDifference(-0.5)).toBe('−1 kcal');
    expect(nutritionDifference(0.5)).toBe('+1 kcal');
  });
});
