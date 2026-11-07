import type { MobileApiClient } from './client';
import { parsePerformanceInsights, PERFORMANCE_INSIGHTS_PATH, type InsightsDaysPage, type InsightsExerciseEvidence, type InsightsFeelingOutcomes, type InsightsPeriodSummary, type InsightsRelationDetail, type InsightsRelations, type InsightsResponse, type InsightsSummary } from '../../../../src/lib/mobile-api/performance-insights-contract';

export * from '../../../../src/lib/mobile-api/performance-insights-contract';

function read<T extends InsightsResponse>(client: MobileApiClient, view: T['view'], query: Record<string, string | undefined>, signal?: AbortSignal) {
  // Method 2 (#367): declared sleep nights and same-day body weight. Every view of one screen asks for the same family.
  const params = new URLSearchParams({ method: '2' });
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const search = params.toString();
  // An answer of another view is not this one, however valid it is.
  return client.read<T>({ path: `${PERFORMANCE_INSIGHTS_PATH}${search ? `?${search}` : ''}`, signal, parse: (raw: unknown) => { const parsed = parsePerformanceInsights(raw); return parsed?.view === view ? parsed as T : undefined; } });
}
/** One request when Insights opens: no prefetch, polling or per-exercise reads. Relations and more days are asked for separately. */
export const fetchInsightsSummary = (client: MobileApiClient, signal?: AbortSignal) => read<InsightsSummary>(client, 'summary', {}, signal);
export const fetchInsightsDays = (client: MobileApiClient, before: string, signal?: AbortSignal, limit?: number) => read<InsightsDaysPage>(client, 'days', { view: 'days', before, limit: limit ? String(limit) : undefined }, signal);
export const fetchInsightsRelations = (client: MobileApiClient, signal?: AbortSignal) => read<InsightsRelations>(client, 'relations', { view: 'relations' }, signal);
/** The newest pairs of a relation and its numbers, computed from all of them. Every pair only when the person asks. */
export const fetchInsightsRelation = (client: MobileApiClient, association: string, signal?: AbortSignal, pairs?: 'all') => read<InsightsRelationDetail>(client, 'relation', { association, pairs }, signal);
/** The evidence of one comparison, read only when its detail opens: one exercise's history, never one read per row of the screen. */
export const fetchInsightsEvidence = (client: MobileApiClient, selection: { session: string; exercise: string; lane: 'strict' | 'partial' }, signal?: AbortSignal) =>
  read<InsightsExerciseEvidence>(client, 'evidence', { view: 'evidence', session: selection.session, exercise: selection.exercise, lane: selection.lane }, signal);
/** Energy and fatigue at the end, described. Only when its screen opens. */
export const fetchInsightsFeelings = (client: MobileApiClient, signal?: AbortSignal) => read<InsightsFeelingOutcomes>(client, 'feelings', { view: 'feelings' }, signal);
/** The last three whole months, described. Only when its screen opens: never at the end of a session or from another tab. */
export const fetchInsightsPeriod = (client: MobileApiClient, signal?: AbortSignal) => read<InsightsPeriodSummary>(client, 'period', { view: 'period' }, signal);
