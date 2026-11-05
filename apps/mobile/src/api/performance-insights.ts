import type { MobileApiClient } from './client';
import { parsePerformanceInsights, PERFORMANCE_INSIGHTS_PATH, type InsightsReadModel } from '../../../../src/lib/mobile-api/performance-insights-contract';

export * from '../../../../src/lib/mobile-api/performance-insights-contract';

/** One request when Insights opens: no prefetch, polling or per-exercise reads. Pages only the facts it returns. */
export function fetchPerformanceInsights(client: MobileApiClient, query: { before?: string; limit?: number; association?: string } = {}, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (query.before) params.set('before', query.before);
  if (query.limit) params.set('limit', String(query.limit));
  if (query.association) params.set('association', query.association);
  const search = params.toString();
  return client.read<InsightsReadModel>({ path: `${PERFORMANCE_INSIGHTS_PATH}${search ? `?${search}` : ''}`, signal, parse: (raw: unknown) => parsePerformanceInsights(raw) });
}
