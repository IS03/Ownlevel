import { afterEach, expect, it, jest } from '@jest/globals';
import { ConfirmedReadCache, READ_REUSE_MS, RETAINED_READ_LIMIT } from './confirmed-read-cache';
import type { MobileApiReadResult } from './results';
const ok = (data: number): MobileApiReadResult<number> => ({ status: 'ok', data, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } });
const deferred = <T,>() => { let resolve!: (v: T) => void; return { promise: new Promise<T>(r => { resolve = r; }), resolve: (v: T) => resolve(v) }; };
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
afterEach(() => { jest.useRealTimers(); });

it('serializes speculative reads, joins an opened target and survives the originating focus cleanup', async () => {
  const cache = new ConfirmedReadCache(Date.now, () => {}), a = deferred<MobileApiReadResult<number>>(), b = deferred<MobileApiReadResult<number>>();
  const loads = [jest.fn(() => a.promise), jest.fn(() => b.promise)];
  const entries = loads.map((load, i) => cache.get('nutrition-day', `${i}`, load));
  const cancel = cache.prefetch(entries); await tick();
  expect(loads[0]).toHaveBeenCalledTimes(1); expect(loads[1]).not.toHaveBeenCalled();
  cancel(); const detach = cache.mount(entries[0]); const opened = cache.ensure(entries[0], 'initial'); await tick();
  a.resolve(ok(1)); await opened; await tick();
  expect(entries[0].resource.getSnapshot()).toMatchObject({ status: 'ready', current: { data: 1 } });
  expect(loads[0]).toHaveBeenCalledTimes(1); expect(loads[1]).not.toHaveBeenCalled(); detach(); cache.clear();
});
it('gives explicit reads priority, ignores aborted late responses and never starts a second background transport', async () => {
  const cache = new ConfirmedReadCache(Date.now, () => {}), stale = deferred<MobileApiReadResult<number>>(); let signal!: AbortSignal;
  const warm = cache.get('nutrition-day', 'a', async s => { signal = s; return stale.promise; });
  const nextLoad = jest.fn(async () => ok(2)), next = cache.get('nutrition-day', 'b', nextLoad);
  cache.prefetch([warm, next]); await tick();
  const navigation = cache.get('nutrition-day', 'c', async () => ok(3)); await cache.ensure(navigation, 'initial');
  expect(signal.aborted).toBe(true); expect(nextLoad).not.toHaveBeenCalled();
  stale.resolve(ok(1)); await tick();
  expect(warm.resource.getSnapshot().status).toBe('loading'); expect(nextLoad).toHaveBeenCalledTimes(1);
  cache.clear();
});
it('reuses fresh data, revalidates stale data visibly and cannot overwrite a post-write reload', async () => {
  jest.useFakeTimers(); const cache = new ConfirmedReadCache(Date.now, () => {}), old = deferred<MobileApiReadResult<number>>();
  const load = jest.fn<(s: AbortSignal) => Promise<MobileApiReadResult<number>>>().mockResolvedValueOnce(ok(1)).mockReturnValueOnce(old.promise).mockResolvedValue(ok(3));
  const entry = cache.get('nutrition-day', 'day', load); await cache.ensure(entry, 'initial');
  cache.prefetch([entry]); await tick(); expect(load).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(READ_REUSE_MS); cache.prefetch([entry]); await tick();
  expect(entry.resource.getSnapshot()).toMatchObject({ status: 'ready', refreshing: true, current: { data: 1 } });
  cache.invalidate(['nutrition']); await cache.reload(entry); old.resolve(ok(2)); await tick();
  expect(entry.resource.getSnapshot()).toMatchObject({ status: 'ready', current: { data: 3 } }); cache.clear();
});
it('does not restart invalidated queued days, retry failures forever, or turn them into empty successful days', async () => {
  const cache = new ConfirmedReadCache(Date.now, () => {}), first = deferred<MobileApiReadResult<number>>();
  const a = cache.get('nutrition-day', 'a', () => first.promise), loadB = jest.fn(async () => ok(2)), b = cache.get('nutrition-day', 'b', loadB);
  cache.prefetch([a, b]); await tick(); cache.invalidate(['metrics']);
  first.resolve(ok(1)); await tick(); expect(loadB).not.toHaveBeenCalled();
  const failure = jest.fn<() => Promise<MobileApiReadResult<number>>>().mockResolvedValue({ status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } });
  const broken = cache.get('nutrition-day', 'broken', failure); cache.prefetch([broken]); await tick();
  expect(broken.resource.getSnapshot().status).toBe('unavailable'); expect(failure).toHaveBeenCalledTimes(1);
  await cache.ensure(broken, 'initial'); expect(failure).toHaveBeenCalledTimes(2); cache.clear();
});
it('retires pending/queued work on logout, retains no access in a new account and stays bounded', async () => {
  const cache = new ConfirmedReadCache(Date.now, () => {}), old = deferred<MobileApiReadResult<number>>(), queued = jest.fn(async () => ok(2));
  const entry = cache.get('nutrition-day', 'owner-a', () => old.promise);
  cache.prefetch([entry, cache.get('nutrition-day', 'queued', queued)]); await tick(); cache.clear(); old.resolve(ok(1)); await tick();
  expect(queued).not.toHaveBeenCalled(); expect(entry.resource.getSnapshot().status).toBe('loading');
  const other = new ConfirmedReadCache(Date.now, () => {}), evictions: string[] = [];
  const bounded = new ConfirmedReadCache(Date.now, m => { if (m.event === 'evict') evictions.push(m.event); });
  for (let i = 0; i < RETAINED_READ_LIMIT + 4; i++) bounded.get('nutrition-day', `${i}`, async () => ok(i));
  expect(evictions).toHaveLength(4); expect(other.get('nutrition-day', 'owner-a', async () => ok(8)).resource.getSnapshot().status).toBe('loading');
  other.clear(); bounded.clear();
});
