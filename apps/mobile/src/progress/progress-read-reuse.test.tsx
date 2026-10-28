import { act, renderHook } from '@testing-library/react-native';
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { StrictMode, type PropsWithChildren } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { MobileApiClient } from '@/api/client';
import type { MobileApiReadResult } from '@/api/results';
import { useCachedProgressResource } from './use-cached-progress-resource';
import { READ_REUSE_MS, invalidateConfirmedReads } from '@/api/confirmed-read-cache';

const mockFocus = new Set<{ focus: () => void; blur: () => void }>();
const mockState = new Set<(state: AppStateStatus) => void>();
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void | (() => void)) => {
  jest.requireActual<typeof import('react')>('react').useEffect(() => {
    let release: void | (() => void), active = false;
    const lifetime = { focus: () => { if (!active) { active = true; release = callback(); } }, blur: () => { if (active) { active = false; release?.(); } } };
    mockFocus.add(lifetime); lifetime.focus();
    return () => { lifetime.blur(); mockFocus.delete(lifetime); };
  }, [callback]);
} }));
const ok = (value: number): MobileApiReadResult<number> => ({ status: 'ok', data: value, meta: { durationMs: 3000, httpStatus: 200, outcome: 'ok' } });
beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { mockState.add(listener); return { remove: () => { mockState.delete(listener); } }; });
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
const tick = () => act(async () => {});
it('reuses a visited period synchronously instead of waiting for the same three-second read again', async () => {
  const client = {} as MobileApiClient;
  const load = jest.fn<(_client: MobileApiClient, signal: AbortSignal) => Promise<MobileApiReadResult<number>>>()
    .mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(ok(12)), 3000)));
  const first = renderHook(() => useCachedProgressResource(client, 'overview', '30', load));
  expect(first.result.current.state.status).toBe('loading');
  await act(async () => { await jest.advanceTimersByTimeAsync(3000); }); first.unmount();
  const second = renderHook(() => useCachedProgressResource(client, 'overview', '30', load));
  const immediate = second.result.current.state.status;
  await act(async () => { await jest.advanceTimersByTimeAsync(3000); });
  console.info('[QA progress controlled]', { networkMs: 3000, repeatImmediate: immediate, requests: load.mock.calls.length });
  expect(immediate).toBe('ready'); expect(load).toHaveBeenCalledTimes(1); second.unmount();
});
it('shares one concurrent read for the same scope', async () => {
  const client = {} as MobileApiClient;
  const load = jest.fn<(_client: MobileApiClient, signal: AbortSignal) => Promise<MobileApiReadResult<number>>>().mockResolvedValue(ok(0));
  const a = renderHook(() => useCachedProgressResource(client, 'overview', '30', load)), b = renderHook(() => useCachedProgressResource(client, 'overview', '30', load));
  await act(async () => {}); expect(load).toHaveBeenCalledTimes(1); a.unmount(); b.unmount();
});
it('shows the expired reading with its original timestamp while a new response is pending, and forces manual refresh', async () => {
  const client = {} as MobileApiClient;
  const load = jest.fn<(_c: MobileApiClient, s: AbortSignal) => Promise<MobileApiReadResult<number>>>().mockResolvedValue(ok(4));
  const first = renderHook(() => useCachedProgressResource(client, 'body', '30', load)); await tick();
  const confirmed = first.result.current.state; first.unmount(); await jest.advanceTimersByTimeAsync(READ_REUSE_MS);
  let finish!: (result: MobileApiReadResult<number>) => void; load.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const next = renderHook(() => useCachedProgressResource(client, 'body', '30', load));
  expect(next.result.current.state).toMatchObject({ status: 'ready', refreshing: true, current: confirmed.status === 'ready' ? confirmed.current : undefined });
  expect(next.result.current.data).toBe(4); expect(load).toHaveBeenCalledTimes(2);
  await act(async () => { finish(ok(5)); }); expect(next.result.current.data).toBe(5);
  await act(async () => { await next.result.current.refresh(); }); expect(load).toHaveBeenCalledTimes(3); next.unmount();
});
it('switches periods synchronously, reuses the correct key on return and keeps its loader scoped to that key', async () => {
  const client = {} as MobileApiClient;
  const view = renderHook(({ period }: { period: string }) => useCachedProgressResource(client, 'metrics', period, async () => ok(Number(period))), { initialProps: { period: '30' } });
  await tick(); expect(view.result.current.data).toBe(30);
  view.rerender({ period: '7' }); expect(view.result.current.data).toBeUndefined(); await tick(); expect(view.result.current.data).toBe(7);
  view.rerender({ period: '30' }); expect(view.result.current.data).toBe(30);
  await act(async () => { await view.result.current.refresh(); }); expect(view.result.current.data).toBe(30); view.unmount();
});
it('isolates a replacement client immediately and ignores the former account response', async () => {
  const a = {} as MobileApiClient, b = {} as MobileApiClient;
  let finish!: (result: MobileApiReadResult<number>) => void;
  const load = (c: MobileApiClient) => c === a ? new Promise<MobileApiReadResult<number>>(resolve => { finish = resolve; }) : Promise.resolve(ok(2));
  const view = renderHook(({ client }: { client: MobileApiClient }) => useCachedProgressResource(client, 'body', '30', load), { initialProps: { client: a } });
  view.rerender({ client: b }); expect(view.result.current.data).toBeUndefined(); await tick();
  await act(async () => { finish(ok(1)); }); expect(view.result.current.data).toBe(2); view.unmount();
});
it('revalidates the focused screen on foreground, skips hidden reads, and refreshes expired data on focus', async () => {
  const client = {} as MobileApiClient, load = jest.fn<(_c: MobileApiClient, s: AbortSignal) => Promise<MobileApiReadResult<number>>>().mockResolvedValue(ok(1));
  const view = renderHook(() => useCachedProgressResource(client, 'training', '30', load)); await tick();
  await act(async () => { mockState.forEach(f => f('background')); mockState.forEach(f => f('active')); });
  expect(load).toHaveBeenCalledTimes(2);
  act(() => mockFocus.forEach(f => f.blur()));
  await act(async () => { mockState.forEach(f => f('background')); mockState.forEach(f => f('active')); }); expect(load).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(READ_REUSE_MS);
  await act(async () => { mockFocus.forEach(f => f.focus()); }); expect(load).toHaveBeenCalledTimes(3); view.unmount();
});
it('refreshes a focused dependency after a write in another section without overwriting a newer result', async () => {
  const client = {} as MobileApiClient, load = jest.fn<(_c: MobileApiClient, s: AbortSignal) => Promise<MobileApiReadResult<number>>>().mockResolvedValue(ok(1));
  const view = renderHook(() => useCachedProgressResource(client, 'overview', '30', load)); await tick();
  load.mockResolvedValueOnce(ok(2));
  await act(async () => invalidateConfirmedReads(client, '/api/mobile/v1/nutrition/days/fixture/metrics'));
  expect(view.result.current.data).toBe(2); expect(load).toHaveBeenCalledTimes(2); view.unmount();
});
it('changes the Córdoba day scope on foreground instead of reusing a previous-day relative period', async () => {
  jest.setSystemTime(new Date('2026-10-28T02:59:00Z'));
  const client = {} as MobileApiClient, load = jest.fn<(_c: MobileApiClient, s: AbortSignal) => Promise<MobileApiReadResult<number>>>().mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(2));
  const view = renderHook(() => useCachedProgressResource(client, 'body', '7', load)); await tick();
  jest.setSystemTime(new Date('2026-10-28T03:01:00Z'));
  await act(async () => { mockState.forEach(f => f('background')); mockState.forEach(f => f('active')); });
  expect(view.result.current.data).toBe(2); expect(load).toHaveBeenCalledTimes(2); view.unmount();
});
it('survives effect replay without disposing the retained controller or duplicating the request', async () => {
  const client = {} as MobileApiClient, load = jest.fn<(_c: MobileApiClient, s: AbortSignal) => Promise<MobileApiReadResult<number>>>().mockResolvedValue(ok(8));
  const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
  const view = renderHook(() => useCachedProgressResource(client, 'body', '30', load), { wrapper });
  await tick(); expect(view.result.current.data).toBe(8); expect(load).toHaveBeenCalledTimes(1); view.unmount();
});
