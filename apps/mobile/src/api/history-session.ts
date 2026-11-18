import type { MobileApiClient } from './client';
import { fetchSessionDetail, type SessionDetailDto } from './active-session';
import { confirmedReads, READ_REUSE_MS, settledWritesFor } from './confirmed-read-cache';
import { fetchSessionSummary, type SessionSummaryLoader } from './session-summary';
import { trainingFeelingsApi } from './training-feelings';
import type { MobileApiRequestResult } from './results';
import type { FeelingsPort } from '../../../../src/lib/mobile-api/training-feelings-journal';

export type SessionPresentation = {
  detail: SessionDetailDto;
  summary?: Awaited<ReturnType<SessionSummaryLoader>>;
  feelings?: Awaited<ReturnType<FeelingsPort['read']>>;
};
export type SessionPresentationSources = {
  detail: (signal?: AbortSignal) => Promise<MobileApiRequestResult<SessionDetailDto>>;
  summary?: SessionSummaryLoader;
  feelings?: FeelingsPort['read'];
};
const unavailable = () => ({ status: 'unavailable' as const, reason: 'network' as const,
  meta: { durationMs: 0, httpStatus: null, outcome: 'unavailable' as const } });
const safe = <T,>(read: () => Promise<T>) => Promise.resolve().then(read).catch(unavailable);
const denied = (result: { status: string } | undefined) =>
  result && (result.status === 'auth_required' || result.status === 'unauthorized' || ('meta' in result && (result.meta as { httpStatus?: number }).httpStatus === 403));

/** One presentation, three independent reads in parallel. Optional failures stay explicit, never empty answers. */
export async function loadSessionPresentation(api: SessionPresentationSources, signal?: AbortSignal): Promise<MobileApiRequestResult<SessionPresentation>> {
  const [detail, summary, feelings] = await Promise.all([
    safe(() => api.detail(signal)), api.summary ? safe(() => api.summary!(signal)) : undefined,
    api.feelings ? safe(() => api.feelings!()) : undefined,
  ]);
  if (detail.status !== 'ok') return detail.status === 'conflict' ? { ...detail, data: undefined } : detail;
  // An authorization failure on any part must retire the whole protected presentation.
  if (denied(summary) || denied(feelings)) return { status: 'unauthorized', meta: { durationMs: 0, httpStatus: 403, outcome: 'unauthorized' } };
  return { ...detail, data: { detail: detail.data, summary, feelings } };
}
function entryFor(client: MobileApiClient, id: string) {
  return confirmedReads(client).get<SessionPresentation>('training', `history-session|${id}`, async signal => {
    const result = await loadSessionPresentation({ detail: signal => fetchSessionDetail(client, id, signal),
      summary: signal => fetchSessionSummary(client, id, signal), feelings: trainingFeelingsApi(client, id).read }, signal);
    if (result.status === 'ok' || result.status === 'auth_required' || result.status === 'unauthorized' || result.status === 'unavailable') return result;
    // Retained reads use the common read envelope. Keep 404 in metadata so the route can restore its distinct state.
    return { status: 'unavailable', reason: 'server', meta: result.meta };
  });
}
/** Account-scoped, bounded existing cache; settled training writes invalidate it before the next focus. */
export async function readHistorySession(client: MobileApiClient, id: string): Promise<MobileApiRequestResult<SessionPresentation>> {
  const cache = confirmedReads(client), entry = entryFor(client, id);
  const revision = settledWritesFor(client, ['training']);
  const previous = entry.resource.getSnapshot();
  const incomplete = previous.status === 'ready' && ((previous.current.data.summary && previous.current.data.summary.status !== 'ok') || (previous.current.data.feelings && previous.current.data.feelings.status !== 'ok'));
  if (incomplete && !entry.resource.isRefreshing()) await cache.reload(entry); else await cache.ensure(entry, 'initial');
  if (revision !== settledWritesFor(client, ['training'])) return unavailable();
  const state = entry.resource.getSnapshot();
  if (state.status === 'loading') return unavailable();
  if (state.result.meta.httpStatus === 404) return { status: 'not_found', message: 'Sesión no disponible', meta: state.result.meta };
  return state.result;
}
export function peekHistorySession(client: MobileApiClient, id: string) {
  const entry = entryFor(client, id), state = entry.resource.getSnapshot();
  return !entry.invalidated && state.status === 'ready' && Date.now() - state.current.confirmedAt < READ_REUSE_MS ? state.current.data : undefined;
}
