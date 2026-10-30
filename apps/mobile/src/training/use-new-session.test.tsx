import { act, renderHook } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MobileApiClient } from '@/api/client';
import { invalidateConfirmedReads } from '@/api/confirmed-read-cache';
import type { MobileHomeResponse } from '@/api/home';
import type { HomeResource } from '@/home/home-resource';
import type { RecommendationData } from './new-session-model';
import { useNewSession } from './use-new-session';

const mockLoad = jest.fn<(client: unknown, today: string, signal?: AbortSignal) => Promise<RecommendationData>>();
jest.mock('./new-session-model', () => ({
  ...jest.requireActual<typeof import('./new-session-model')>('./new-session-model'),
  loadRecommendationData: (client: unknown, today: string, signal?: AbortSignal) => mockLoad(client, today, signal),
}));
jest.mock('./new-session-sheet', () => ({ NewSessionSheet: () => null }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: () => undefined } }));

const TODAY = '2026-10-29';
const home = { data: undefined } as unknown as HomeResource<MobileHomeResponse>;
const ok = (): RecommendationData => ({ today: TODAY, sameWeekday: [], recent: [] });
const failed = (): RecommendationData => ({ today: TODAY, sameWeekday: null, recent: null });
const mount = (client: MobileApiClient) => renderHook(() => useNewSession({ client, home, onCreateRoutine: () => undefined, start: () => undefined, today: TODAY }));
const prefetch = async () => { await act(async () => { jest.advanceTimersByTime(1_000); }); };
const open = async (hook: ReturnType<typeof mount>) => { await act(async () => { hook.result.current.open(); }); };

describe('«Nueva sesión» recommendation reads', () => {
  beforeEach(() => { jest.useFakeTimers(); mockLoad.mockReset(); mockLoad.mockResolvedValue(ok()); });

  it('prefetches once; opening again soon without writes does not read', async () => {
    const hook = mount({} as MobileApiClient);
    await prefetch();
    expect(mockLoad).toHaveBeenCalledTimes(1);
    await open(hook); await open(hook);
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });
  it('after a settled write (finish, edit or discard a session) the next opening reads again', async () => {
    const client = {} as MobileApiClient;
    const hook = mount(client);
    await prefetch();
    invalidateConfirmedReads(client, '/api/mobile/v1/training/sessions/s/finish');
    await open(hook);
    expect(mockLoad).toHaveBeenCalledTimes(2);
    await open(hook);
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });
  it('a failed read is retried on the next opening; an old one after five minutes', async () => {
    mockLoad.mockResolvedValueOnce(failed());
    const hook = mount({} as MobileApiClient);
    await prefetch();
    await open(hook);
    expect(mockLoad).toHaveBeenCalledTimes(2);
    await act(async () => { jest.setSystemTime(Date.now() + 5 * 60_000 + 1); });
    await open(hook);
    expect(mockLoad).toHaveBeenCalledTimes(3);
  });
  it('leaving while the read is in flight cancels it; another account never reuses the result', async () => {
    let signal: AbortSignal | undefined;
    mockLoad.mockImplementationOnce((_client, _today, s) => { signal = s; return new Promise(() => undefined); });
    const first = mount({} as MobileApiClient);
    await prefetch();
    first.unmount();
    expect(signal?.aborted).toBe(true);
    const second = mount({} as MobileApiClient);
    await prefetch();
    expect(mockLoad.mock.calls[1][0]).not.toBe(mockLoad.mock.calls[0][0]);
    second.unmount();
  });
});
