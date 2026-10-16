import { act, renderHook } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import type { MobileApiClient } from '@/api/client';
import type { MobileApiReadResult } from '@/api/results';
import type { NutritionReport } from '@/api/nutrition-report';
import {
  prefetchNutritionReport,
  invalidateNutritionReports,
  useNutritionReportResource,
} from './report-resource';
import { reportFixture } from './report-fixture.test-helper';
jest.mock('expo-router', () => ({ useFocusEffect: () => {} }));
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
describe('Plan confirmations invalidate report caches', () => {
  it('an old prefetch cannot refill the cache after a confirmed plan change', async () => {
    let resolve!: (result: MobileApiReadResult<NutritionReport>) => void;
    const read = jest.fn<MobileApiClient['read']>().mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r as typeof resolve;
        }),
    );
    const client = { read, request: jest.fn() } as unknown as MobileApiClient;
    prefetchNutritionReport(client, { period: '7' });
    invalidateNutritionReports(client);
    resolve({ status: 'ok', data: reportFixture(), meta });
    await act(async () => {});
    read.mockResolvedValue({
      status: 'ok',
      data: { ...reportFixture(), today: '2026-10-05' },
      meta,
    } as never);
    const hook = renderHook(() => useNutritionReportResource(client, { period: '7' }));
    expect(hook.result.current.state.status).toBe('loading');
    await act(async () => {});
    expect(read).toHaveBeenCalledTimes(2);
    expect(hook.result.current.state.status).toBe('ready');
    hook.unmount();
  });
  it('live reports supersede their in-flight read instead of accepting pre-write data', async () => {
    let resolve!: (result: MobileApiReadResult<NutritionReport>) => void;
    const read = jest.fn<MobileApiClient['read']>().mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r as typeof resolve;
        }),
    );
    const client = { read, request: jest.fn() } as unknown as MobileApiClient;
    const hook = renderHook(() => useNutritionReportResource(client, { period: '7' }));
    read.mockResolvedValue({
      status: 'ok',
      data: { ...reportFixture(), today: '2026-10-05' },
      meta,
    } as never);
    await act(async () => invalidateNutritionReports(client));
    resolve({ status: 'ok', data: reportFixture(), meta });
    await act(async () => {});
    const state = hook.result.current.state;
    expect(state.status === 'ready' && state.current.data.today).toBe('2026-10-05');
    hook.unmount();
  });
});
