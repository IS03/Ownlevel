import { act, renderHook } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { MobileApiClient } from '@/api/client';
import type { MobileApiReadResult } from '@/api/results';
import type { NutritionReport } from '@/api/nutrition-report';
import { clearConfirmedReads, invalidateConfirmedReads } from '@/api/confirmed-read-cache';
import { prefetchNutritionReport, useNutritionReportResource } from './report-resource';
import { reportFixture } from './report-fixture.test-helper';
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void | (() => void)) => jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]) }));
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const ok = (today = '2026-10-04') => ({ status: 'ok', data: { ...reportFixture(), today }, meta }) as MobileApiReadResult<NutritionReport>;
const clients: MobileApiClient[] = [];
const pending = () => {
  let resolve!: (result: MobileApiReadResult<NutritionReport>) => void;
  const read = jest.fn<MobileApiClient['read']>().mockImplementationOnce(() => new Promise(r => { resolve = r as typeof resolve; }));
  const client = { read, request: jest.fn() } as unknown as MobileApiClient; clients.push(client);
  return { read, client, resolve: (result: MobileApiReadResult<NutritionReport>) => resolve(result) };
};
afterEach(() => { clients.splice(0).forEach(clearConfirmedReads); });
describe('Settled nutrition writes invalidate shared report readings', () => {
  it('an old prefetch cannot answer a screen after a settled write', async () => {
    const { read, client, resolve } = pending();
    prefetchNutritionReport(client, { period: '7' });
    invalidateConfirmedReads(client, '/api/mobile/v1/nutrition/config');
    resolve(ok('2026-10-01'));
    await act(async () => {});
    read.mockResolvedValue(ok('2026-10-05') as never);
    const hook = renderHook(() => useNutritionReportResource(client, { period: '7' }));
    await act(async () => {});
    expect(read).toHaveBeenCalledTimes(2);
    const state = hook.result.current.state;
    expect(state.status === 'ready' && state.current.data.today).toBe('2026-10-05');
    hook.unmount();
  });
  it('a focused report supersedes its in-flight read instead of accepting pre-write data', async () => {
    const { read, client, resolve } = pending();
    const hook = renderHook(() => useNutritionReportResource(client, { period: '7' }));
    read.mockResolvedValue(ok('2026-10-05') as never);
    await act(async () => invalidateConfirmedReads(client, '/api/mobile/v1/nutrition/days/2026-10-04/meals'));
    resolve(ok('2026-10-01'));
    await act(async () => {});
    const state = hook.result.current.state;
    expect(state.status === 'ready' && state.current.data.today).toBe('2026-10-05');
    hook.unmount();
  });
  it('shares one reading between Nutrición and Progreso for the same account, day and range', async () => {
    const { read, client, resolve } = pending();
    const week = renderHook(() => useNutritionReportResource(client, { period: 'custom', from: '2026-09-28', to: '2026-10-04' }));
    const progress = renderHook(() => useNutritionReportResource(client, { period: 'custom', from: '2026-09-28', to: '2026-10-04' }));
    await act(async () => resolve(ok()));
    expect(read).toHaveBeenCalledTimes(1);
    expect(progress.result.current.state.status).toBe('ready'); expect(week.result.current.state.status).toBe('ready');
    week.unmount(); progress.unmount();
  });
  it('a meal preview (read-only POST) keeps the reading and its reuse', async () => {
    const { read, client, resolve } = pending();
    const hook = renderHook(() => useNutritionReportResource(client, { period: '7' }));
    await act(async () => resolve(ok()));
    invalidateConfirmedReads(client, '/api/mobile/v1/nutrition/days/2026-10-04/meal-preview');
    hook.unmount();
    const again = renderHook(() => useNutritionReportResource(client, { period: '7' }));
    expect(again.result.current.state.status).toBe('ready'); expect(read).toHaveBeenCalledTimes(1);
    again.unmount();
  });
});
