import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import type { MobileApiClient } from './client';
import type { MobileApiReadResult } from './results';
import { ConfirmedReadCache, confirmedReads, clearConfirmedReads, invalidateConfirmedReads, READ_REUSE_MS, RETAINED_READ_LIMIT } from './confirmed-read-cache';

const ok = <T,>(data: T): MobileApiReadResult<T> => ({ status: 'ok', data, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } });
const lost = { status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } } as const;
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const pool = () => new ConfirmedReadCache(Date.now, () => {});
beforeEach(() => { jest.useFakeTimers(); }); afterEach(() => { jest.useRealTimers(); });

it('retains the same controller and confirmation time inside the focus window, then revalidates without hiding data', async () => {
  const cache = pool(), load = jest.fn<(s: AbortSignal) => Promise<MobileApiReadResult<number>>>().mockResolvedValue(ok(0));
  const entry = cache.get('body', '30', load); expect(entry.resource.getSnapshot().status).toBe('loading');
  await cache.ensure(entry, 'initial'); const confirmed = entry.resource.getSnapshot();
  await jest.advanceTimersByTimeAsync(READ_REUSE_MS - 1);
  expect(cache.get('body', '30', load)).toBe(entry); await cache.ensure(entry, 'initial');
  expect(entry.resource.getSnapshot()).toBe(confirmed); expect(load).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  const next = deferred<MobileApiReadResult<number>>(); load.mockReturnValueOnce(next.promise);
  const refreshing = cache.ensure(entry, 'initial');
  expect(entry.resource.getSnapshot()).toMatchObject({ status: 'ready', refreshing: true, current: { data: 0 } });
  next.resolve(ok(2)); await refreshing; expect(entry.resource.getSnapshot()).toMatchObject({ current: { data: 2 } }); cache.clear();
});
it('deduplicates concurrent reads, while manual and foreground refresh bypass the window', async () => {
  const cache = pool(), pending = deferred<MobileApiReadResult<number>>(), load = jest.fn<(s: AbortSignal) => Promise<MobileApiReadResult<number>>>().mockReturnValueOnce(pending.promise).mockResolvedValue(ok(2));
  const a = cache.get('training', '30', load), b = cache.get('training', '30', load);
  const first = cache.ensure(a, 'initial'); expect(cache.ensure(b, 'initial')).toBe(first);
  expect(load).toHaveBeenCalledTimes(1); pending.resolve(ok(1)); await first;
  await cache.ensure(a, 'manual'); await cache.ensure(b, 'foreground'); expect(load).toHaveBeenCalledTimes(3); cache.clear();
});
it('separates resource families and complete query keys, including missing versus zero', async () => {
  const cache = pool();
  const body = cache.get('body', '30|none', async () => ok(null));
  const training = cache.get('training', '30|none', async () => ok(0));
  const compared = cache.get('body', '30|previous', async () => ok(12));
  await Promise.all([cache.ensure(body, 'initial'), cache.ensure(training, 'initial'), cache.ensure(compared, 'initial')]);
  expect(body.resource.getSnapshot()).toMatchObject({ current: { data: null } });
  expect(training.resource.getSnapshot()).toMatchObject({ current: { data: 0 } });
  expect(compared.resource.getSnapshot()).toMatchObject({ current: { data: 12 } }); cache.clear();
});
it('keeps failure distinct from empty and retains the timestamp of a previously confirmed read', async () => {
  const cache = pool(), load = jest.fn<(s: AbortSignal) => Promise<MobileApiReadResult<unknown>>>().mockResolvedValueOnce(lost).mockResolvedValueOnce(ok([])).mockRejectedValueOnce(new Error('network'));
  const entry = cache.get('metrics', '30', load);
  await cache.ensure(entry, 'initial'); expect(entry.resource.getSnapshot().status).toBe('unavailable');
  await cache.ensure(entry, 'initial'); const state = entry.resource.getSnapshot();
  await jest.advanceTimersByTimeAsync(1000); await cache.ensure(entry, 'manual');
  expect(entry.resource.getSnapshot()).toMatchObject({ status: 'unavailable', previous: state.status === 'ready' ? state.current : undefined }); cache.clear();
});
it.each(['auth_required', 'unauthorized', 'forbidden'] as const)('drops protected previous data after an explicit %s denial', async denial => {
  const cache = pool(), load = jest.fn<(s: AbortSignal) => Promise<MobileApiReadResult<number>>>().mockResolvedValueOnce(ok(5));
  const entry = cache.get('body', '30', load); await cache.ensure(entry, 'initial');
  load.mockResolvedValueOnce(denial === 'forbidden' ? { ...lost, meta: { ...lost.meta, httpStatus: 403 } } : { status: denial, meta: { durationMs: 1, httpStatus: 401, outcome: denial } });
  await cache.ensure(entry, 'manual'); expect(entry.resource.getSnapshot()).not.toHaveProperty('previous.data');
  load.mockResolvedValueOnce(lost); await cache.ensure(entry, 'manual');
  expect(entry.resource.getSnapshot()).not.toHaveProperty('previous.data'); cache.clear();
});
it('invalidates only dependent families after a write in another section and does not fetch hidden screens', async () => {
  const client = {} as MobileApiClient, cache = confirmedReads(client);
  const loads = ['overview', 'training', 'body', 'metrics'].map(() => jest.fn<(s: AbortSignal) => Promise<MobileApiReadResult<number>>>().mockResolvedValue(ok(1)));
  const entries = (['overview', 'training', 'body', 'metrics'] as const).map((family, i) => cache.get(family, '30', loads[i]));
  await Promise.all(entries.map(entry => cache.ensure(entry, 'initial')));
  invalidateConfirmedReads(client, '/api/mobile/v1/training/sessions/fixture/finish');
  expect(entries.map(entry => entry.invalidated)).toEqual([true, true, false, false]);
  loads.forEach(load => expect(load).toHaveBeenCalledTimes(1));
  await Promise.all(entries.map(entry => cache.ensure(entry, 'initial')));
  expect(loads.map(load => load.mock.calls.length)).toEqual([2, 2, 1, 1]);
  invalidateConfirmedReads(client, '/api/mobile/v1/profile/physical');
  expect(entries.map(entry => entry.invalidated)).toEqual([true, false, true, true]); clearConfirmedReads(client);
});
it('ignores a late pre-write response even if the transport ignores abort', async () => {
  const cache = pool(), old = deferred<MobileApiReadResult<number>>(), next = deferred<MobileApiReadResult<number>>();
  const load = jest.fn<(s: AbortSignal) => Promise<MobileApiReadResult<number>>>().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const entry = cache.get('body', '30', load); entry.focused = 1;
  const previous = cache.ensure(entry, 'initial'); cache.invalidate(['body']);
  const current = cache.ensure(entry, 'manual'); expect(load).toHaveBeenCalledTimes(2);
  next.resolve(ok(22)); await current; old.resolve(ok(11)); await previous;
  expect(entry.resource.getSnapshot()).toMatchObject({ current: { data: 22 } }); expect(entry.invalidated).toBe(false); cache.clear();
});
it('isolates users, clears retained and pending reads on logout, and never revives an old scope', async () => {
  const a = {} as MobileApiClient, b = {} as MobileApiClient, pending = deferred<MobileApiReadResult<number>>();
  const old = confirmedReads(a).get('body', '30', () => pending.promise), beforeLogout = confirmedReads(a).ensure(old, 'initial');
  expect(confirmedReads(b).get('body', '30', async () => ok(2)).resource.getSnapshot().status).toBe('loading');
  clearConfirmedReads(a);
  const fresh = confirmedReads(a).get('body', '30', async () => ok(3)); await confirmedReads(a).ensure(fresh, 'initial');
  pending.resolve(ok(1)); await beforeLogout;
  expect(fresh.resource.getSnapshot()).toMatchObject({ current: { data: 3 } }); clearConfirmedReads(a); clearConfirmedReads(b);
});
it('bounds retained history without evicting an observed controller or leaking query/payload data into telemetry', async () => {
  const events: unknown[] = [], cache = new ConfirmedReadCache(Date.now, event => events.push(event));
  const first = cache.get('body', 'private-key', async () => ok('private-payload')), detach = cache.mount(first);
  await cache.ensure(first, 'initial');
  const unused = cache.get('body', 'unused', async () => ok(0));
  for (let i = 0; i < RETAINED_READ_LIMIT; i++) cache.get('body', String(i), async () => ok(i));
  expect(cache.get('body', 'private-key', async () => ok(9))).toBe(first);
  expect(cache.get('body', 'unused', async () => ok(0))).not.toBe(unused);
  expect(JSON.stringify(events)).not.toContain('private'); detach(); cache.clear();
});
it('publishes only the last read after consecutive invalidations, whatever order earlier reads settle in', async () => {
  const cache = pool(), reads = [0, 1, 2, 3].map(() => deferred<MobileApiReadResult<number>>());
  const load = jest.fn<(s: AbortSignal) => Promise<MobileApiReadResult<number>>>();
  reads.forEach(read => load.mockReturnValueOnce(read.promise));
  const entry = cache.get('overview', '30', load); entry.focused = 1;
  const first = cache.ensure(entry, 'initial');
  cache.invalidate(['body']); cache.invalidate(['training']); cache.invalidate(['nutrition']);
  expect(load).toHaveBeenCalledTimes(4); expect(load.mock.calls.slice(0, 3).every(([signal]) => signal.aborted)).toBe(true);
  reads[3].resolve(ok(4)); await entry.resource.refresh('manual');
  reads[2].resolve(ok(3)); reads[0].resolve(ok(1)); reads[1].resolve(ok(2)); await first; await Promise.resolve();
  expect(entry.resource.getSnapshot()).toMatchObject({ status: 'ready', refreshing: false, current: { data: 4 } }); expect(entry.invalidated).toBe(false);
  cache.clear();
});
it('never leaves a hidden first load stuck after an invalidation: the next focus reads again', async () => {
  const cache = pool(), first = deferred<MobileApiReadResult<number>>();
  const load = jest.fn<(s: AbortSignal) => Promise<MobileApiReadResult<number>>>().mockReturnValueOnce(first.promise).mockResolvedValueOnce(ok(2));
  const entry = cache.get('body', '30', load); const unmount = cache.mount(entry);
  void cache.ensure(entry, 'initial'); cache.invalidate(['body']);
  expect(load).toHaveBeenCalledTimes(1); expect(entry.resource.getSnapshot().status).toBe('loading');
  first.resolve(ok(1)); await Promise.resolve(); expect(entry.invalidated).toBe(true);
  await cache.ensure(entry, 'initial');
  expect(load).toHaveBeenCalledTimes(2); expect(entry.resource.getSnapshot()).toMatchObject({ status: 'ready', current: { data: 2 } });
  unmount(); cache.clear();
});
it.each([
  ['/api/mobile/v1/training/sessions/s/exercises/e?routineAdditions=1', [true, true, false, false]],
  ['/api/mobile/v1/training/sessions/s/finish?routineAdditions=1', [true, true, false, false]],
  ['/api/mobile/v1/training/sessions/s/correction', [true, true, false, false]],
  ['/api/mobile/v1/training/sessions/s/discard', [true, true, false, false]],
  ['/api/mobile/v1/training/routines/r/template', [true, true, false, false]],
  ['/api/mobile/v1/training/exercises/x', [true, true, false, false]],
  ['/api/mobile/v1/body/weights/2026-10-27', [true, false, true, false]],
  ['/api/mobile/v1/body/measurements/m', [true, false, true, false]],
  ['/api/mobile/v1/profile/physical', [true, false, true, true]],
  ['/api/mobile/v1/nutrition/days/2026-10-27/metrics', [true, false, false, true]],
  ['/api/mobile/v1/nutrition/days/2026-10-27/context', [true, false, false, true]],
  ['/api/mobile/v1/nutrition/days/2026-10-27/meals/m', [true, false, false, true]],
  ['/api/mobile/v1/nutrition/days/2026-10-27/meal-registrations', [true, false, false, true]],
  ['/api/mobile/v1/nutrition/config', [true, false, false, true]],
  ['/api/mobile/v1/nutrition/stages?targets=2', [true, false, false, true]],
  ['/api/mobile/v1/metrics/definitions/order', [true, false, false, true]],
  ['/api/mobile/v1/progress/views/v?expectedVersion=1', [false, false, false, false]],
  ['/api/mobile/v1/progress/insight/dismiss', [false, false, false, false]],
  ['/api/mobile/v1/profile', [false, false, false, false]],
] as [string, boolean[]][])('maps the real write route %s to the Progress reads that depend on it', async (path, expected) => {
  const client = {} as MobileApiClient, cache = confirmedReads(client);
  const entries = (['overview', 'training', 'body', 'metrics'] as const).map(family => cache.get(family, '30', async () => ok(1)));
  await Promise.all(entries.map(entry => cache.ensure(entry, 'initial')));
  invalidateConfirmedReads(client, path);
  expect(entries.map(entry => entry.invalidated)).toEqual(expected); clearConfirmedReads(client);
});
it('after a write, reload joins the read the invalidation started instead of issuing a second one', async () => {
  const client = {} as MobileApiClient, cache = confirmedReads(client), next = deferred<MobileApiReadResult<number>>();
  const load = jest.fn<(s: AbortSignal) => Promise<MobileApiReadResult<number>>>().mockResolvedValueOnce(ok(1)).mockReturnValueOnce(next.promise);
  const entry = cache.get('nutrition-day', '2026-10-04', load); entry.focused = 1;
  await cache.ensure(entry, 'initial');
  invalidateConfirmedReads(client, '/api/mobile/v1/nutrition/days/2026-10-04/meals');
  const reloaded = cache.reload(entry);
  expect(load).toHaveBeenCalledTimes(2); expect(load.mock.calls[1][0].aborted).toBe(false);
  next.resolve(ok(2)); await reloaded;
  expect(entry.resource.getSnapshot()).toMatchObject({ current: { data: 2 } }); clearConfirmedReads(client);
});
it('reload drops an in-flight read that the write did not start, even without a client notification', async () => {
  const cache = pool(), old = deferred<MobileApiReadResult<number>>();
  const load = jest.fn<(s: AbortSignal) => Promise<MobileApiReadResult<number>>>().mockResolvedValueOnce(ok(1)).mockReturnValueOnce(old.promise).mockResolvedValueOnce(ok(3));
  const entry = cache.get('nutrition-day', '2026-10-04', load);
  await cache.ensure(entry, 'initial'); void cache.ensure(entry, 'manual');
  await cache.reload(entry); old.resolve(ok(2)); await Promise.resolve();
  expect(load).toHaveBeenCalledTimes(3); expect(load.mock.calls[1][0].aborted).toBe(true);
  expect(entry.resource.getSnapshot()).toMatchObject({ current: { data: 3 } }); cache.clear();
});
it('cancels an abandoned first load (fast date changes) but not one an effect replay remounts', async () => {
  const cache = pool(), first = deferred<MobileApiReadResult<number>>(), second = deferred<MobileApiReadResult<number>>();
  const load = jest.fn<(s: AbortSignal) => Promise<MobileApiReadResult<number>>>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const replayed = cache.get('nutrition-day', 'a', load), abandoned = cache.get('nutrition-day', 'b', load);
  const detachA = cache.mount(replayed); void cache.ensure(replayed, 'initial'); detachA(); const again = cache.mount(replayed);
  const detachB = cache.mount(abandoned); void cache.ensure(abandoned, 'initial'); detachB();
  await Promise.resolve();
  expect(load.mock.calls[0][0].aborted).toBe(false); expect(load.mock.calls[1][0].aborted).toBe(true);
  second.resolve(ok(9)); first.resolve(ok(1)); await Promise.resolve(); await Promise.resolve();
  expect(abandoned.resource.getSnapshot().status).toBe('loading'); expect(replayed.resource.getSnapshot()).toMatchObject({ current: { data: 1 } });
  again(); cache.clear();
});
it.each([
  ['/api/mobile/v1/nutrition/days/2026-10-04/meals/m', [true, true]],
  ['/api/mobile/v1/training/sessions/s/finish?routineAdditions=1', [true, true]],
  ['/api/mobile/v1/body/weights/2026-10-04', [true, true]],
  ['/api/mobile/v1/profile/physical', [true, true]],
  ['/api/mobile/v1/metrics/definitions/order', [false, true]],
  ['/api/mobile/v1/nutrition/days/2026-10-04/meal-preview', [false, false]],
  ['/api/mobile/v1/progress/views/v', [false, false]],
] as [string, boolean[]][])('maps %s to the Nutrition report and day readings that depend on it', async (path, expected) => {
  const client = {} as MobileApiClient, cache = confirmedReads(client);
  const entries = (['nutrition-report', 'nutrition-day'] as const).map(family => cache.get(family, '2026-10-04', async () => ok(1)));
  await Promise.all(entries.map(entry => cache.ensure(entry, 'initial')));
  invalidateConfirmedReads(client, path);
  expect(entries.map(entry => entry.invalidated)).toEqual(expected); clearConfirmedReads(client);
});
it.each([
  ['/api/mobile/v1/progress/views/v?expectedVersion=1', [true, false]],
  ['/api/mobile/v1/progress/views/order', [true, false]],
  ['/api/mobile/v1/progress/insight/dismiss', [true, false]],
  ['/api/mobile/v1/nutrition/stages?targets=2', [true, true]],
  ['/api/mobile/v1/training/routines/r/template', [true, true]],
  ['/api/mobile/v1/profile', [false, false]],
] as [string, boolean[]][])('maps %s to the other Progress readings (views, insight, connections…) and the overview', async (path, expected) => {
  const client = {} as MobileApiClient, cache = confirmedReads(client);
  const entries = (['progress-extra', 'overview'] as const).map(family => cache.get(family, '30', async () => ok(1)));
  await Promise.all(entries.map(entry => cache.ensure(entry, 'initial')));
  invalidateConfirmedReads(client, path);
  expect(entries.map(entry => entry.invalidated)).toEqual(expected); clearConfirmedReads(client);
});
