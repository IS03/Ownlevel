import { describe, expect, it } from '@jest/globals';
import { WEIGHT_FIELD_PADDING, WEIGHT_REFERENCE_TEXT, estimateWeightFieldWidth, weightFieldWidth } from './weight-field-width';

describe('weight field width', () => {
  it('the reference is the widest valid weight', () => {
    expect(WEIGHT_REFERENCE_TEXT).toBe('999,99');
  });
  it('estimates six characters from the font only (5 digits x 0.7 em + comma x 0.4 em) plus padding', () => {
    expect(estimateWeightFieldWidth(56, 1)).toBe(Math.ceil(3.9 * 56) + WEIGHT_FIELD_PADDING);
    expect(estimateWeightFieldWidth(56, 2)).toBeGreaterThan(estimateWeightFieldWidth(56, 1));
  });
  it('uses the measurement taken at the current scale, never one from another scale', () => {
    expect(weightFieldWidth(56, 1, { fontScale: 1, width: 200 })).toBe(200 + WEIGHT_FIELD_PADDING);
    expect(weightFieldWidth(56, 2, { fontScale: 1, width: 200 })).toBe(estimateWeightFieldWidth(56, 2));
    expect(weightFieldWidth(56, 1, null)).toBe(estimateWeightFieldWidth(56, 1));
  });
  it('rejects an implausibly small measurement', () => {
    expect(weightFieldWidth(56, 1, { fontScale: 1, width: 3 })).toBeGreaterThan(5 * 0.5 * 56);
  });
});
