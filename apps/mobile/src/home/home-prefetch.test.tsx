import { act, renderHook } from '@testing-library/react-native';
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import type { MobileApiClient } from '@/api/client';
import { clearConfirmedReads, invalidateConfirmedReads } from '@/api/confirmed-read-cache';
import { nutritionFixture } from '@/nutrition/day-fixture.test-helper';
import { nutritionWeek } from '@/nutrition/day-home-model';
import { prefetchNutritionDays, prefetchNutritionWeek, useNutritionDayResource } from '@/nutrition/day-resource';
import { prepareHome } from './shared-home-read';
import { useHomeResources } from './home-data';
import { useNutritionReportResource } from '@/nutrition/report-resource';

let mockWarmEnabled = true;
let mockTodayUnavailable = false;
let mockEvents: { name: string; at: number }[] = [];
const mockBase = Date.parse('2026-10-02T15:00:00Z');
const mockOk = (data: unknown) => ({ status: 'ok', data, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } });
function mockRead(name: string, data: unknown) { mockEvents.push({ name, at: Date.now() - mockBase }); return new Promise(resolve => setTimeout(() => resolve(mockOk(data)), 1000)); }
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void | (() => void)) => jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]) }));
jest.mock('@/api/home', () => ({ fetchMobileHome: () => mockRead('home', {}) }));
jest.mock('@/api', () => ({ useApiResource: jest.requireActual<typeof import('@/api/resource')>('@/api/resource').useApiResource, fetchMobileHome: () => mockRead('home', {}) }));
jest.mock('@/api/history', () => ({ fetchHistoryDay: () => mockTodayUnavailable
  ? mockRead('history-day', {}).then(() => ({ status: 'unavailable', reason: 'network', meta: { durationMs: 1000, httpStatus: null, outcome: 'unavailable' } }))
  : mockRead('history-day', {}) }));
jest.mock('@/api/nutrition-report', () => ({ ...jest.requireActual<typeof import('@/api/nutrition-report')>('@/api/nutrition-report'), fetchNutritionReport: () => mockRead('nutrition-report', {}) }));
jest.mock('@/api/progress', () => ({ fetchProgressHabitWeek: () => mockRead('habits', {}), fetchProgressBody: () => mockRead('body', {}), fetchProgressTrainingRecords: () => mockRead('records', {}) }));
jest.mock('@/api/training-history', () => ({ fetchTrainingHistory: () => mockRead('training', { sessions: [], nextCursor: null }) }));
jest.mock('@/nutrition/day-resource', () => ({
  ...jest.requireActual<typeof import('@/nutrition/day-resource')>('@/nutrition/day-resource'),
  prefetchNutritionWeek: (...args: Parameters<typeof import('@/nutrition/day-resource')['prefetchNutritionWeek']>) => mockWarmEnabled
    ? jest.requireActual<typeof import('@/nutrition/day-resource')>('@/nutrition/day-resource').prefetchNutritionWeek(...args) : () => {},
}));
const now = () => new Date(Date.now());
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(mockBase); mockEvents = []; mockWarmEnabled = true; mockTodayUnavailable = false; });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });
const today = '2026-10-02';
const days = nutritionWeek(today);
function clientFor(mode: 'ok' | 'legacy' | 'unavailable' | 'malformed' = 'ok') {
  const read = jest.fn<MobileApiClient['read']>(options => {
    const range = options.path.includes('/days?');
    const date = options.path.split('/').at(-1)!;
    mockEvents.push({ name: range ? 'week' : `day:${date}`, at: Date.now() - mockBase });
    let data: unknown;
    if (range) {
      expect(options.background).toBe(true);
      expect(options.path).toBe('/api/mobile/v1/nutrition/days?from=2026-09-26&to=2026-10-02');
      const fixtures = days.map(nutritionFixture);
      if (mode === 'malformed') fixtures.reverse();
      data = options.parse({ from: days[0], to: today, days: fixtures });
    } else data = nutritionFixture(date);
    const failure = (range && mode === 'legacy' && 404) || ((mode === 'unavailable' || !data) && 503);
    const result = failure ? { status: 'unavailable', reason: 'server', meta: { durationMs: 3000, httpStatus: failure, outcome: 'unavailable' } }
      : mockOk(data);
    return new Promise(resolve => setTimeout(() => resolve(result as never), 3000));
  });
  return { client: { read, request: jest.fn() } as unknown as MobileApiClient, read };
}
const advance = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
it.each(['ready', 'pending', 'unavailable'] as const)('adopts the startup reads from Home when %s, without a duplicate request', async status => {
  const { client } = clientFor();
  mockTodayUnavailable = status === 'unavailable';
  void prepareHome(client, '2026-10-02');
  expect(mockEvents.map(event => event.name)).toEqual(['home', 'history-day']);
  if (status !== 'pending') await advance(1000);
  const home = renderHook(() => useHomeResources(client, now));
  await advance(1000);
  expect(home.result.current.home.state.status).toBe('ready');
  expect(home.result.current.today.state.status).toBe(status === 'unavailable' ? 'unavailable' : 'ready');
  expect(mockEvents.filter(event => ['home', 'history-day'].includes(event.name))).toHaveLength(2);
  home.unmount();
  clearConfirmedReads(client);
});
it('warms the whole visible week in one call after all seven Home reads settle', async () => {
  const { client, read } = clientFor(), home = renderHook(() => useHomeResources(client, now));
  expect(mockEvents).toHaveLength(7); expect(read).not.toHaveBeenCalled();
  await advance(999); expect(read).not.toHaveBeenCalled();
  await advance(1); expect(read).toHaveBeenCalledTimes(1);
  await advance(3000);
  const day = renderHook(({ date }: { date: string }) => useNutritionDayResource(client, date), { initialProps: { date: days[0] } });
  for (const date of days) {
    day.rerender({ date });
    const state = day.result.current.state;
    expect(state.status).toBe('ready');
    if (state.status === 'ready') expect(state.current.data.date).toBe(date);
  }
  const stopAgain = prefetchNutritionWeek(client, today);
  await advance(15_000);
  expect(read).toHaveBeenCalledTimes(1);
  stopAgain(); day.unmount(); home.unmount(); clearConfirmedReads(client);
});
it('restores the two serial neighbour reads on an old deployment (404)', async () => {
  const { client, read } = clientFor('legacy'), home = renderHook(() => useHomeResources(client, now));
  await advance(1000); await advance(3000); await advance(3000); await advance(3000);
  expect(mockEvents.slice(-3)).toEqual([
    { name: 'week', at: 1000 }, { name: 'day:2026-10-02', at: 4000 }, { name: 'day:2026-10-01', at: 7000 },
  ]);
  const yesterday = renderHook(() => useNutritionDayResource(client, '2026-10-01'));
  expect(yesterday.result.current.state.status).toBe('ready');
  expect(read).toHaveBeenCalledTimes(3);
  yesterday.unmount(); home.unmount(); clearConfirmedReads(client);
});
it.each(['unavailable', 'malformed'] as const)('a %s speculative response cannot seed a day or retry in a loop', async mode => {
  const { client, read } = clientFor(mode), home = renderHook(() => useHomeResources(client, now));
  await advance(15_000); expect(read).toHaveBeenCalledTimes(1); expect(home.result.current.home.state.status).toBe('ready');
  const day = renderHook(() => useNutritionDayResource(client, days[0]));
  expect(day.result.current.state.status).toBe('loading');
  await advance(3000);
  expect(day.result.current.state.status).toBe(mode === 'unavailable' ? 'unavailable' : 'ready');
  expect(read).toHaveBeenCalledTimes(2);
  day.unmount(); home.unmount(); clearConfirmedReads(client);
});
it.each([false, true])('invalidates confirmed days and rejects a week overtaken by a write (%s)', async duringRead => {
  const { client, read } = clientFor();
  const stop = prefetchNutritionWeek(client, today);
  await advance(duringRead ? 500 : 3000);
  invalidateConfirmedReads(client, '/api/mobile/v1/nutrition/days/2026-10-02/metrics');
  await advance(3000);
  const day = renderHook(() => useNutritionDayResource(client, today));
  expect(read).toHaveBeenCalledTimes(2);
  expect(mockEvents.at(-1)?.name).toBe('day:2026-10-02');
  await advance(3000);
  expect(day.result.current.state.status).toBe('ready');
  day.unmount(); stop(); clearConfirmedReads(client);
});
it('gives the visible day priority over a running batch and keeps cached results per account', async () => {
  const { client, read } = clientFor();
  const stop = prefetchNutritionWeek(client, today);
  await advance(500);
  const day = renderHook(() => useNutritionDayResource(client, days[0]));
  expect(read.mock.calls[0][0].signal?.aborted).toBe(true);
  expect(read.mock.calls[1][0].background).toBeUndefined();
  await advance(3000);
  expect(day.result.current.state.status).toBe('ready');
  day.unmount(); stop();
  const other = clientFor();
  const next = renderHook(() => useNutritionDayResource(other.client, days[0]));
  expect(next.result.current.state.status).toBe('loading');
  expect(other.read).toHaveBeenCalledTimes(1);
  await advance(3000);
  expect(next.result.current.state.status).toBe('ready');
  next.unmount(); clearConfirmedReads(client); clearConfirmedReads(other.client);
});
it('still shares Home’s report when consumers ask for its same range and rejects invalid adjacent days', async () => {
  const { client, read } = clientFor(), home = renderHook(() => useHomeResources(client, now));
  await advance(4000); home.unmount();
  const week = renderHook(() => useNutritionReportResource(client, { period: 'custom', from: '2026-09-28', to: today }));
  expect(week.result.current.state.status).toBe('ready');
  expect(mockEvents.filter(event => event.name === 'nutrition-report')).toHaveLength(1);
  prefetchNutritionDays(client, ['2026-10-03', 'invalid'], today); await advance(0); expect(read).toHaveBeenCalledTimes(1);
  week.unmount(); clearConfirmedReads(client);
});
