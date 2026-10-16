import { describe, expect, it } from '@jest/globals';

import { brandTokens } from '@/design-system';
import * as shared from '../../../../packages/brand/src/tokens';

describe('Shared brand tokens in Mobile', () => {
  it('resolves the same shared module Web uses (no Mobile copy of the values)', () => {
    expect(brandTokens.palette).toBe(shared.palette);
    expect(brandTokens.palette.dark.accent).toBe('#C9B68A');
    expect(brandTokens.palette.light.accent).toBe('#705F36');
    expect(brandTokens.radius.card).toBe(20);
  });
});
