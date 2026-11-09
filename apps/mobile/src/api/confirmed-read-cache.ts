import type { MobileApiClient } from './client';
import type { MobileApiReadResult } from './results';
import { ApiResourceController, type ResourceRefreshTrigger } from './resource';

export type ReadFamily = 'overview' | 'body' | 'training' | 'metrics' | 'nutrition-report' | 'nutrition-day' | 'progress-extra';
type Domain = 'body' | 'training' | 'metrics' | 'nutrition' | 'views' | 'insight';
type Loader<T> = (signal: AbortSignal, background?: boolean) => Promise<MobileApiReadResult<T>>;
export type RetainedRead<T> = {
  resource: ApiResourceController<T>; family: ReadFamily; mounted: number; focused: number; invalidated: boolean;
  /** Write count when the latest read was started by that write's invalidation; -1 for any other read. */
  readEpoch: number;
  background?: boolean;
};
export const READ_REUSE_MS = 30_000;
export const RETAINED_READ_LIMIT = 40;
const domains: Record<ReadFamily, readonly Domain[]> = {
  overview: ['body', 'training', 'metrics', 'nutrition'], body: ['body'], training: ['training'], metrics: ['metrics'],
  // Day targets follow training days and energy follows weight/physical data, not only nutrition writes. The day
  // also lists the configured daily metrics, so definition changes invalidate it.
  'nutrition-report': ['nutrition', 'body', 'training'], 'nutrition-day': ['nutrition', 'body', 'training', 'metrics'],
  // Views, connections, insight, Explorar, meal times, stages, influence and exercise detail: any data domain moves them.
  'progress-extra': ['body', 'training', 'metrics', 'nutrition', 'views', 'insight'],
};
/** The day scope keeps a relative period ("today", "last 7 days") from crossing midnight in Córdoba. */
export const scopedReadKey = (key: string, day: string) => `${day}|${key}`;
type Measurement = { event: 'reuse' | 'network' | 'join' | 'settled' | 'invalidate' | 'evict'; family: ReadFamily; trigger?: ResourceRefreshTrigger; durationMs?: number; ageMs?: number };
const record = (measurement: Measurement) => { if (__DEV__) console.info('[OWNLEVEL Read Reuse]', measurement); };

/** Retains the existing controllers, not a second copy of their data. Memory only. */
export class ConfirmedReadCache {
  private readonly entries = new Map<string, RetainedRead<unknown>>();
  private writes = 0;
  private invalidating = false;
  private retired = false;
  private readonly foreground = new Map<RetainedRead<unknown>, Promise<void>>();
  private queued: { entry: RetainedRead<unknown>; owner: symbol }[] = [];
  private warming: { entry: RetainedRead<unknown>; owner: symbol; promoted: boolean } | null = null;
  constructor(private readonly now: () => number = () => Date.now(), private readonly measure = record) {}
  get<T>(family: ReadFamily, key: string, load: Loader<T>): RetainedRead<T> {
    const scopedKey = `${family}|${key}`;
    const existing = this.entries.get(scopedKey);
    if (existing) {
      this.entries.delete(scopedKey); this.entries.set(scopedKey, existing);
      return existing as RetainedRead<T>;
    }
    const entry: RetainedRead<T> = {
      family, mounted: 0, focused: 0, invalidated: true, readEpoch: -1,
      resource: new ApiResourceController(async signal => {
        const started = this.now();
        entry.readEpoch = this.invalidating ? this.writes : -1;
        let result: MobileApiReadResult<T>;
        try { result = await load(signal, entry.background); }
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
  ensure<T>(entry: RetainedRead<T>, trigger: ResourceRefreshTrigger, background = false): Promise<void> {
    if (this.retired) return Promise.resolve();
    const state = entry.resource.getSnapshot();
    const age = state.status === 'ready' ? Math.max(0, this.now() - state.current.confirmedAt) : Infinity;
    if (trigger === 'initial' && !entry.invalidated && age < READ_REUSE_MS) {
      this.measure({ event: 'reuse', family: entry.family, trigger, ageMs: age }); return Promise.resolve();
    }
    if (!background) this.prioritize(entry);
    this.measure({ event: entry.resource.isRefreshing() ? 'join' : 'network', family: entry.family, trigger });
    entry.background = background;
    const pending = entry.resource.refresh(trigger);
    if (!background) this.track(entry, pending);
    return pending;
  }
  /**
   * After a confirmed write: join only the read the client started when that write settled; any other in-flight read
   * may predate the write, so it is dropped and read again.
   */
  reload<T>(entry: RetainedRead<T>): Promise<void> {
    if (this.retired) return Promise.resolve();
    this.prioritize(entry); entry.background = false;
    entry.invalidated = true;
    if (entry.resource.isRefreshing() && entry.readEpoch === this.writes) return this.ensure(entry, 'manual');
    this.measure({ event: 'network', family: entry.family, trigger: 'manual' });
    const pending = entry.resource.reload('manual'); this.track(entry, pending); return pending;
  }
  /** One low-priority read at a time, using the SAME retained controllers. No recursive discovery or own data store. */
  prefetch<T>(entries: readonly RetainedRead<T>[]): () => void {
    const owner = Symbol('prefetch');
    if (this.retired) return () => {};
    for (const value of entries.slice(0, 3)) {
      const entry = value as RetainedRead<unknown>;
      if (this.warming?.entry !== entry && !this.queued.some(job => job.entry === entry)) this.queued.push({ entry, owner });
    }
    void Promise.resolve().then(() => this.pump());
    return () => {
      this.queued = this.queued.filter(job => job.owner !== owner);
      void Promise.resolve().then(() => {
        if (this.warming?.owner === owner && !this.warming.promoted && !this.warming.entry.mounted && !this.warming.entry.focused) this.warming.entry.resource.cancelRefresh();
      });
    };
  }
  private prioritize<T>(value: RetainedRead<T>) {
    const entry = value as RetainedRead<unknown>;
    this.queued = this.queued.filter(job => job.entry !== entry);
    if (this.warming?.entry === entry) this.warming.promoted = true;
    else this.warming?.entry.resource.cancelRefresh();
  }
  private track<T>(value: RetainedRead<T>, pending: Promise<void>) {
    const entry = value as RetainedRead<unknown>;
    this.foreground.set(entry, pending);
    void pending.finally(() => { if (this.foreground.get(entry) === pending) this.foreground.delete(entry); this.pump(); });
  }
  private pump() {
    if (this.retired || this.warming || this.foreground.size) return;
    while (this.queued.length) {
      const job = this.queued.shift()!, { entry } = job;
      if (![...this.entries.values()].includes(entry) || entry.resource.isRefreshing()) continue;
      const state = entry.resource.getSnapshot();
      if (state.status === 'ready' && !entry.invalidated && this.now() - state.current.confirmedAt < READ_REUSE_MS) continue;
      const active = { ...job, promoted: false }; this.warming = active;
      void this.ensure(entry, 'initial', true).finally(() => {
        entry.background = false;
        if (this.warming === active) this.warming = null;
        this.pump();
      });
      return;
    }
  }
  mount<T>(entry: RetainedRead<T>) {
    entry.mounted++;
    return () => {
      entry.mounted--; this.trim();
      // A first load nobody waits for anymore (fast date/period changes) is cancelled, as before retention. Deferred:
      // an effect replay remounts the same entry before this runs.
      void Promise.resolve().then(() => { if (!entry.mounted && entry.resource.getSnapshot().status === 'loading') entry.resource.cancelRefresh(); });
    };
  }
  focus<T>(entry: RetainedRead<T>) {
    entry.focused++;
    return () => { entry.focused--; };
  }
  invalidate(changed: readonly Domain[]) {
    this.writes++;
    // A write owns recovery. Do not restart a cancelled prefetch from an older navigation batch.
    this.queued = this.queued.filter(job => !domains[job.entry.family].some(domain => changed.includes(domain)));
    for (const entry of this.entries.values()) {
      if (!domains[entry.family].some(domain => changed.includes(domain))) continue;
      entry.invalidated = true;
      entry.resource.cancelRefresh();
      this.measure({ event: 'invalidate', family: entry.family });
      // Hidden screens retain their old reading; only a focused consumer revalidates now.
      if (entry.focused > 0) {
        this.invalidating = true;
        try { void this.ensure(entry, 'manual'); } finally { this.invalidating = false; }
      }
    }
  }
  /** Settled writes through this account's client so far (any domain): screens with their own reads compare it on focus. */
  settledWrites() { return this.writes; }
  clear() { this.retired = true; this.queued = []; this.entries.forEach(entry => entry.resource.dispose()); this.entries.clear(); }
  private trim(protectedKey?: string) {
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= RETAINED_READ_LIMIT) break;
      if (entry.mounted || key === protectedKey || this.warming?.entry === entry || this.foreground.has(entry)) continue;
      entry.resource.dispose(); this.entries.delete(key); this.measure({ event: 'evict', family: entry.family });
      this.queued = this.queued.filter(job => job.entry !== entry);
    }
  }
}
const scopes = new WeakMap<MobileApiClient, ConfirmedReadCache>();
export function confirmedReads(client: MobileApiClient) {
  let cache = scopes.get(client);
  if (!cache) { cache = new ConfirmedReadCache(); scopes.set(client, cache); }
  return cache;
}
/** 0 until the first settled write of this account. */
export function settledWrites(client: MobileApiClient | null) { return client ? scopes.get(client)?.settledWrites() ?? 0 : 0; }
export function clearConfirmedReads(client: MobileApiClient) { scopes.get(client)?.clear(); scopes.delete(client); }

/** Settled writes include ambiguous outcomes. This never retries or confirms the write. */
export function invalidateConfirmedReads(client: MobileApiClient, path: string) {
  const route = path.split('?')[0];
  // A meal preview is a POST that only computes: it changes nothing a retained read shows.
  if (/^\/api\/mobile\/v1\/nutrition\/days\/[^/]+\/meal-preview$/.test(route)) return;
  const changed: Domain[] = /^\/api\/mobile\/v1\/training(?:\/|$)/.test(route) ? ['training']
    : /^\/api\/mobile\/v1\/body(?:\/|$)/.test(route) ? ['body']
    : /^\/api\/mobile\/v1\/profile\/physical$/.test(route) ? ['body', 'nutrition', 'metrics']
    : /^\/api\/mobile\/v1\/nutrition(?:\/|$)/.test(route) ? ['nutrition', 'metrics']
    : /^\/api\/mobile\/v1\/metrics(?:\/|$)/.test(route) ? ['metrics']
    : /^\/api\/mobile\/v1\/progress\/views(?:\/|$)/.test(route) ? ['views']
    : /^\/api\/mobile\/v1\/progress\/insight(?:\/|$)/.test(route) ? ['insight'] : [];
  // Every settled write counts, mapped or not: reload() must never join a read that predates it.
  confirmedReads(client).invalidate(changed);
}
