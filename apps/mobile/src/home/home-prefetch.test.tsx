import { act, renderHook } from '@testing-library/react-native';
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import type { MobileApiClient } from '@/api/client';
import { clearConfirmedReads } from '@/api/confirmed-read-cache';
import { nutritionFixture } from '@/nutrition/day-fixture.test-helper';
import { prefetchNutritionDays, useNutritionDayResource } from '@/nutrition/day-resource';
import { useHomeResources } from './home-data';
import { useNutritionReportResource } from '@/nutrition/report-resource';

let mockWarmEnabled = true;
let mockEvents: { name: string; at: number }[] = [];
const mockBase = Date.parse('2026-10-02T15:00:00Z');
const mockOk = (data: unknown) => ({ status: 'ok', data, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } });
function mockRead(name: string, data: unknown) { mockEvents.push({ name, at: Date.now() - mockBase }); return new Promise(resolve => setTimeout(() => resolve(mockOk(data)), 1000)); }
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void | (() => void)) => jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]) }));
jest.mock('@/api', () => ({ useApiResource: jest.requireActual<typeof import('@/api/resource')>('@/api/resource').useApiResource, fetchMobileHome: () => mockRead('home', {}) }));
jest.mock('@/api/history', () => ({ fetchHistoryDay: () => mockRead('history-day', {}) }));
jest.mock('@/api/nutrition-report', () => ({ ...jest.requireActual<typeof import('@/api/nutrition-report')>('@/api/nutrition-report'), fetchNutritionReport: () => mockRead('nutrition-report', {}) }));
jest.mock('@/api/progress', () => ({ fetchProgressHabitWeek: () => mockRead('habits', {}), fetchProgressBody: () => mockRead('body', {}), fetchProgressTrainingRecords: () => mockRead('records', {}) }));
jest.mock('@/api/training-history', () => ({ fetchTrainingHistory: () => mockRead('training', { sessions: [], nextCursor: null }) }));
jest.mock('@/nutrition/day-resource', () => ({
  ...jest.requireActual<typeof import('@/nutrition/day-resource')>('@/nutrition/day-resource'),
  prefetchNutritionDays: (...args: Parameters<typeof import('@/nutrition/day-resource')['prefetchNutritionDays']>) => mockWarmEnabled
    ? jest.requireActual<typeof import('@/nutrition/day-resource')>('@/nutrition/day-resource').prefetchNutritionDays(...args) : () => {},
}));
const now = () => new Date(Date.now());
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(mockBase); mockEvents = []; mockWarmEnabled = true; });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });
function clientFor(fail = false) {
  const read = jest.fn<MobileApiClient['read']>(options => {
    const date = options.path.split('/').at(-1)!;
    mockEvents.push({ name: `day:${date}`, at: Date.now() - mockBase });
    return new Promise(resolve => setTimeout(() => resolve((fail ? { status: 'unavailable', reason: 'network', meta: { durationMs: 3000, httpStatus: null, outcome: 'unavailable' } } : mockOk(nutritionFixture(date))) as never), 3000));
  });
  return { client: { read, request: jest.fn() } as unknown as MobileApiClient, read };
}
const advance = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
it('prioritizes all seven Home reads and joins yesterday when navigation meets the prefetch in flight', async () => {
  const { client, read } = clientFor(), home = renderHook(() => useHomeResources(client, now));
  expect(mockEvents).toHaveLength(7); expect(read).not.toHaveBeenCalled();
  await advance(1000); expect(read).toHaveBeenCalledTimes(1); expect(home.result.current.home.state.status).toBe('ready');
  await advance(3500); expect(read).toHaveBeenCalledTimes(2);
  home.unmount(); const yesterday = renderHook(() => useNutritionDayResource(client, '2026-10-01'));
  await advance(2500); expect(yesterday.result.current.state.status).toBe('ready'); expect(read).toHaveBeenCalledTimes(2);
  await advance(60_000); expect(read).toHaveBeenCalledTimes(2); // No polling/recursive dates.
  yesterday.unmount(); clearConfirmedReads(client);
});
it('measures the same Home → today → yesterday fixture with and without speculative warming', async () => {
  const results = [];
  for (const warm of [false, true]) {
    mockWarmEnabled = warm; jest.setSystemTime(mockBase); mockEvents = [];
    const { client, read } = clientFor(), home = renderHook(() => useHomeResources(client, now));
    await advance(1000); await advance(3000); await advance(3000); const beforeNavigation = [...mockEvents]; home.unmount();
    const day = renderHook(({ date }: { date: string }) => useNutritionDayResource(client, date), { initialProps: { date: '2026-10-02' } });
    const todayImmediate = day.result.current.state.status; await advance(3000);
    const beforeYesterday = read.mock.calls.length; day.rerender({ date: '2026-10-01' });
    const yesterdayImmediate = day.result.current.state.status; await advance(3000);
    const measurement = { warm, homeRequests: beforeNavigation.filter(e => !e.name.startsWith('day:')).length,
      fullDaysPrepared: beforeNavigation.filter(e => e.name.startsWith('day:')), todayImmediate, yesterdayImmediate,
      todayContentMs: todayImmediate === 'ready' ? 0 : 3000, yesterdayContentMs: yesterdayImmediate === 'ready' ? 0 : 3000,
      requestsOnYesterday: read.mock.calls.length - beforeYesterday, totalRequests: mockEvents.length };
    results.push(measurement); expect(day.result.current.state.status).toBe('ready'); day.unmount(); clearConfirmedReads(client); jest.clearAllTimers();
  }
  expect(results.map(r => r.totalRequests)).toEqual([9, 9]); expect(results.map(r => r.requestsOnYesterday)).toEqual([1, 0]);
  expect(results.map(r => r.yesterdayContentMs)).toEqual([3000, 0]); expect(results[1].fullDaysPrepared.map(e => e.at)).toEqual([1000, 4000]);
  console.info('[OWNLEVEL prefetch fixture]', JSON.stringify(results));
});
it('keeps speculative failures out of Home state and does not retry them in a loop', async () => {
  const { client, read } = clientFor(true), home = renderHook(() => useHomeResources(client, now));
  await advance(1000); await advance(6000); await advance(60_000); expect(read).toHaveBeenCalledTimes(2); expect(home.result.current.home.state.status).toBe('ready');
  const opened = renderHook(() => useNutritionDayResource(client, '2026-10-01'));
  await advance(3000); expect(opened.result.current.state.status).toBe('unavailable');
  expect(read).toHaveBeenCalledTimes(3); opened.unmount(); home.unmount(); clearConfirmedReads(client);
});
it('shares Home’s weekly report with Nutrition and bounds adjacent day requests without a cascade', async () => {
  const { client, read } = clientFor(), home = renderHook(() => useHomeResources(client, now));
  await advance(1000); await advance(3000); await advance(3000); home.unmount();
  const week = renderHook(() => useNutritionReportResource(client, { period: 'custom', from: '2026-09-28', to: '2026-10-02' }));
  expect(week.result.current.state.status).toBe('ready'); expect(mockEvents.filter(e => e.name === 'nutrition-report')).toHaveLength(1);
  prefetchNutritionDays(client, ['2026-10-03', 'invalid'], '2026-10-02'); await advance(0); expect(read).toHaveBeenCalledTimes(2);
  prefetchNutritionDays(client, ['2026-09-30', '2026-10-01'], '2026-10-02'); await advance(3000); await advance(60_000);
  expect(read).toHaveBeenCalledTimes(3); expect(mockEvents.filter(e => e.name === 'day:2026-09-29')).toHaveLength(0);
  week.unmount(); clearConfirmedReads(client);
});
