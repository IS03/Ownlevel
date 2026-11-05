import type { MobileApiClient } from './client';
import { parsePerformanceInsights, PERFORMANCE_INSIGHTS_PATH, type InsightsDaysPage, type InsightsRelationDetail, type InsightsRelations, type InsightsResponse, type InsightsSummary } from '../../../../src/lib/mobile-api/performance-insights-contract';

export * from '../../../../src/lib/mobile-api/performance-insights-contract';

function read<T extends InsightsResponse>(client: MobileApiClient, view: T['view'], query: Record<string, string | undefined>, signal?: AbortSignal) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const search = params.toString();
  // An answer of another view is not this one, however valid it is.
  return client.read<T>({ path: `${PERFORMANCE_INSIGHTS_PATH}${search ? `?${search}` : ''}`, signal, parse: (raw: unknown) => { const parsed = parsePerformanceInsights(raw); return parsed?.view === view ? parsed as T : undefined; } });
}
/** One request when Insights opens: no prefetch, polling or per-exercise reads. Relations and more days are asked for separately. */
export const fetchInsightsSummary = (client: MobileApiClient, signal?: AbortSignal) => read<InsightsSummary>(client, 'summary', {}, signal);
export const fetchInsightsDays = (client: MobileApiClient, before: string, signal?: AbortSignal, limit?: number) => read<InsightsDaysPage>(client, 'days', { view: 'days', before, limit: limit ? String(limit) : undefined }, signal);
export const fetchInsightsRelations = (client: MobileApiClient, signal?: AbortSignal) => read<InsightsRelations>(client, 'relations', { view: 'relations' }, signal);
export const fetchInsightsRelation = (client: MobileApiClient, association: string, signal?: AbortSignal) => read<InsightsRelationDetail>(client, 'relation', { association }, signal);
