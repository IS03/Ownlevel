import type { MobileApiClient } from './client';
import type { MobileApiReadResult } from './results';
import { parseSessionSummary, type SessionSummaryDto } from '../../../../src/lib/mobile-api/training-session-summary';
export { loadCompared, parseSessionSummary } from '../../../../src/lib/mobile-api/training-session-summary';
export type { SessionComparisonStatus, SessionExerciseComparison, SessionPreviousSet, SessionSummaryDto } from '../../../../src/lib/mobile-api/training-session-summary';

export type SessionSummaryLoader = (signal?: AbortSignal) => Promise<MobileApiReadResult<SessionSummaryDto>>;
export function fetchSessionSummary(client: MobileApiClient, sessionId: string, signal?: AbortSignal) {
  return client.read({ path: `/api/mobile/v1/training/sessions/${encodeURIComponent(sessionId)}/summary`, signal,
    parse: raw => { const data = parseSessionSummary(raw); return data?.sessionId === sessionId ? data : undefined; } });
}

// Prefetch: the read starts on the tap (or while the save animation plays) and the screen reuses it. Only confirmed
// reads stay, for a short while; a failure is never cached, and a correction forgets the session.
const FRESH_MS = 2 * 60_000;
type Entry = { at: number; read: Promise<MobileApiReadResult<SessionSummaryDto>> };
const cache = new WeakMap<MobileApiClient, Map<string, Entry>>();
function entries(client: MobileApiClient) {
  let map = cache.get(client);
  if (!map) { map = new Map(); cache.set(client, map); }
  return map;
}
export function prefetchSessionSummary(client: MobileApiClient, sessionId: string, now = Date.now()) {
  const map = entries(client), hit = map.get(sessionId);
  if (hit && now - hit.at < FRESH_MS) return hit.read;
  const entry: Entry = { at: now, read: Promise.resolve().then(() => fetchSessionSummary(client, sessionId)) };
  map.set(sessionId, entry);
  void entry.read.then(result => { if (result?.status !== 'ok' && map.get(sessionId) === entry) map.delete(sessionId); },
    () => { if (map.get(sessionId) === entry) map.delete(sessionId); });
  return entry.read;
}
/** Reads through the prefetch. The shared read is not aborted when one screen leaves; that screen just ignores it. */
export function readSessionSummary(client: MobileApiClient, sessionId: string) { return prefetchSessionSummary(client, sessionId); }
export function forgetSessionSummary(client: MobileApiClient, sessionId: string) { cache.get(client)?.delete(sessionId); }
