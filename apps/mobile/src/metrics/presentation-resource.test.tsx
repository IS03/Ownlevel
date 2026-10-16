import { act, renderHook } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MobileApiClient } from '@/api/client';
import { definition } from './definitions-fixture.test-helper';
import {
  useMetricPresentation,
  rememberMetricPresentation,
  cachedMetricPresentation,
  subscribeMetricDefinitionsChanged,
  metricDefinitionsChanged,
} from './presentation-resource';
const mockRead = jest.fn<MobileApiClient['read']>();
let mockClient = { read: mockRead },
  mockUser = 'owner';
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
jest.mock('@/auth', () => ({
  useMobileAuth: () => ({ session: { user: { id: mockUser } } }),
}));
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
beforeEach(() => {
  jest.clearAllMocks();
  mockClient = { read: mockRead };
  mockUser = 'owner';
});
describe('presentation-only memory cache', () => {
  it('late reads never overwrite a confirmed definition update; cache and invalidation are owner/client scoped', async () => {
    let resolve!: (r: unknown) => void;
    mockRead.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r as typeof resolve;
        }),
    );
    const hook = renderHook(() => useMetricPresentation());
    const newer = definition({ icon: 'book', quickValue: 10 });
    act(() =>
      rememberMetricPresentation(mockClient as unknown as MobileApiClient, 'owner', [
        newer,
      ]),
    );
    await act(async () =>
      resolve({
        status: 'ok',
        data: { definitions: [definition({ icon: 'moon' })] },
        meta,
      }),
    );
    expect(hook.result.current[0].icon).toBe('book');
    expect(
      cachedMetricPresentation(mockClient as unknown as MobileApiClient, 'other'),
    ).toEqual([]);
    expect(cachedMetricPresentation({} as MobileApiClient, 'owner')).toEqual(
      [],
    );
    const changed = jest.fn(),
      unsubscribe = subscribeMetricDefinitionsChanged(
        mockClient as unknown as MobileApiClient,
        'owner',
        changed,
      );
    metricDefinitionsChanged(mockClient as unknown as MobileApiClient, 'other');
    expect(changed).not.toHaveBeenCalled();
    metricDefinitionsChanged(mockClient as unknown as MobileApiClient, 'owner');
    expect(changed).toHaveBeenCalledTimes(1);
    unsubscribe();
    mockRead.mockResolvedValue({
      status: 'unavailable',
      reason: 'network',
      meta: { ...meta, outcome: 'unavailable' },
    } as never);
    mockUser = 'other';
    hook.rerender({});
    expect(hook.result.current).toEqual([]);
  });
});
