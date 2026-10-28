import type { MobileApiClient } from './client';
import type { MobileApiReadResult } from './results';
import { ApiResourceController, type ResourceRefreshTrigger } from './resource';

export type ReadFamily = 'overview' | 'body' | 'training' | 'metrics';
type Domain = 'body' | 'training' | 'metrics' | 'nutrition';
type Loader<T> = (signal: AbortSignal) => Promise<MobileApiReadResult<T>>;
export type RetainedRead<T> = {
  resource: ApiResourceController<T>; family: ReadFamily; mounted: number; focused: number; invalidated: boolean;
};
export const READ_REUSE_MS = 30_000;
export const RETAINED_READ_LIMIT = 24;
const domains: Record<ReadFamily, readonly Domain[]> = {
  overview: ['body', 'training', 'metrics', 'nutrition'], body: ['body'], training: ['training'], metrics: ['metrics'],
};
type Measurement = { event: 'reuse' | 'network' | 'join' | 'settled' | 'invalidate' | 'evict'; family: ReadFamily; trigger?: ResourceRefreshTrigger; durationMs?: number; ageMs?: number };
const record = (measurement: Measurement) => { if (__DEV__) console.info('[OWNLEVEL Read Reuse]', measurement); };

/** Retains the existing controllers, not a second copy of their data. Memory only. */
export class ConfirmedReadCache {
  private readonly entries = new Map<string, RetainedRead<unknown>>();
  constructor(private readonly now: () => number = Date.now, private readonly measure = record) {}
  get<T>(family: ReadFamily, key: string, load: Loader<T>): RetainedRead<T> {
    const scopedKey = `${family}|${key}`;
    const existing = this.entries.get(scopedKey);
    if (existing) {
      this.entries.delete(scopedKey); this.entries.set(scopedKey, existing);
      return existing as RetainedRead<T>;
    }
    const entry: RetainedRead<T> = {
      family, mounted: 0, focused: 0, invalidated: true,
      resource: new ApiResourceController(async signal => {
        const started = this.now();
        let result: MobileApiReadResult<T>;
        try { result = await load(signal); }
        catch { result = { status: 'unavailable', reason: 'network', meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' } }; }
        if (!signal.aborted) {
          if (result.status === 'ok') entry.invalidated = false;
          else if (result.status === 'auth_required' || result.status === 'unauthorized' || result.meta.httpStatus === 403) {
            entry.invalidated = true; entry.resource.discardConfirmed();
          }
          this.measure({ event: 'settled', family, durationMs: Math.max(0, this.now() - started) });
        }
        return result;
      }, this.now),
    };
    this.entries.set(scopedKey, entry as RetainedRead<unknown>);
    this.trim(scopedKey);
    return entry;
  }
  ensure<T>(entry: RetainedRead<T>, trigger: ResourceRefreshTrigger): Promise<void> {
    const state = entry.resource.getSnapshot();
    const age = state.status === 'ready' ? Math.max(0, this.now() - state.current.confirmedAt) : Infinity;
    if (trigger === 'initial' && !entry.invalidated && age < READ_REUSE_MS) {
      this.measure({ event: 'reuse', family: entry.family, trigger, ageMs: age }); return Promise.resolve();
    }
    this.measure({ event: entry.resource.isRefreshing() ? 'join' : 'network', family: entry.family, trigger });
    return entry.resource.refresh(trigger);
  }
  mount<T>(entry: RetainedRead<T>) {
    entry.mounted++;
    return () => { entry.mounted--; this.trim(); };
  }
  focus<T>(entry: RetainedRead<T>) {
    entry.focused++;
    return () => { entry.focused--; };
  }
  invalidate(changed: readonly Domain[]) {
    for (const entry of this.entries.values()) {
      if (!domains[entry.family].some(domain => changed.includes(domain))) continue;
      entry.invalidated = true;
      entry.resource.cancelRefresh();
      this.measure({ event: 'invalidate', family: entry.family });
      // Hidden screens retain their old reading; only a focused consumer revalidates now.
      if (entry.focused > 0) void this.ensure(entry, 'manual');
    }
  }
  clear() { this.entries.forEach(entry => entry.resource.dispose()); this.entries.clear(); }
  private trim(protectedKey?: string) {
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= RETAINED_READ_LIMIT) break;
      if (entry.mounted || key === protectedKey) continue;
      entry.resource.dispose(); this.entries.delete(key); this.measure({ event: 'evict', family: entry.family });
    }
  }
}
const scopes = new WeakMap<MobileApiClient, ConfirmedReadCache>();
export function confirmedReads(client: MobileApiClient) {
  let cache = scopes.get(client);
  if (!cache) { cache = new ConfirmedReadCache(); scopes.set(client, cache); }
  return cache;
}
export function clearConfirmedReads(client: MobileApiClient) { scopes.get(client)?.clear(); scopes.delete(client); }

/** Settled writes include ambiguous outcomes. This never retries or confirms the write. */
export function invalidateConfirmedReads(client: MobileApiClient, path: string) {
  const route = path.split('?')[0];
  const changed: Domain[] = /^\/api\/mobile\/v1\/training(?:\/|$)/.test(route) ? ['training']
    : /^\/api\/mobile\/v1\/body(?:\/|$)/.test(route) ? ['body']
    : /^\/api\/mobile\/v1\/profile\/physical$/.test(route) ? ['body', 'nutrition', 'metrics']
    : /^\/api\/mobile\/v1\/nutrition(?:\/|$)/.test(route) ? ['nutrition', 'metrics']
    : /^\/api\/mobile\/v1\/metrics(?:\/|$)/.test(route) ? ['metrics'] : [];
  if (changed.length) scopes.get(client)?.invalidate(changed);
}
