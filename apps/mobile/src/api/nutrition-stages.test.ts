import { describe, expect, it, jest } from '@jest/globals';
import type { MobileApiClient } from './client';
import { fetchNutritionStages } from './nutrition-stages';
describe('Read-only stage API for Settings', () => {
  it('uses the authenticated Mobile API client and the strict shared parser, never a product table', async () => {
    const read = jest.fn<MobileApiClient['read']>(),
      request = jest.fn<MobileApiClient['request']>();
    const client = { read, request } as unknown as MobileApiClient;
    const signal = new AbortController().signal;
    await fetchNutritionStages(client, signal);
    const options = read.mock.calls[0][0];
    expect(options).toMatchObject({ path: '/api/mobile/v1/nutrition/stages', signal });
    expect(options).not.toHaveProperty('userId');
    expect(request).not.toHaveBeenCalled();
    const list = {
      today: '2026-10-16',
      listVersion: 0,
      current: null,
      upcoming: [],
      past: [],
      sequences: [],
      suggestions: null,
    };
    expect(options.parse(list)).toEqual(list);
    expect(options.parse({ ...list, unexpected: true })).toBeUndefined();
    expect(options.parse({ ...list, current: {} })).toBeUndefined();
  });
});
