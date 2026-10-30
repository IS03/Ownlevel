import type { MobileApiClient } from './client';
import { parseProgressExplore, type ExploreBreakdown, type ExploreDays } from '../../../../src/lib/mobile-api/progress-explore-contract';
import {
  parseProgressNutritionTiming, parseProgressHabitWeek, parseProgressBody, parseProgressMetrics, parseProgressOverview, parseProgressTraining, parseProgressTrainingExercise, parseProgressTrainingRecords, progressQueryKey, progressQueryString,
  type ProgressPeriod, type ProgressQuery,
} from '../../../../src/lib/mobile-api/progress-contract';

export * from '../../../../src/lib/mobile-api/progress-contract';
export * from '../../../../src/lib/mobile-api/progress-explore-contract';
const BASE = '/api/mobile/v1/progress';
/** An explicit comparison range B (server EXPAND). Without it the server keeps its previous equivalent window. */
export type ProgressCompareRange = { start: string; end: string } | null;
const qs = (query: ProgressQuery, compare: ProgressCompareRange = null) =>
  `${progressQueryString(query)}${compare ? `&compareFrom=${compare.start}&compareTo=${compare.end}` : ''}`;
export const progressRequestKey = (query: ProgressQuery, compare: ProgressCompareRange = null) =>
  `${progressQueryKey(query)}${compare ? `|vs:${compare.start}:${compare.end}` : ''}`;
/** A response belongs to the requested period and reference (a late response for another one is invalid, never shown). */
const samePeriod = (period: ProgressPeriod, query: ProgressQuery, compare: ProgressCompareRange = null) =>
  period.preset === query.period && (query.period !== 'custom' || period.start === query.from)
  && (!compare || (period.previousStart === compare.start && period.previousEnd === compare.end));
export { qs as progressQueryParams, samePeriod as progressResponseMatches };
export const fetchProgressOverview = (client: MobileApiClient, query: ProgressQuery, signal?: AbortSignal, compare: ProgressCompareRange = null) =>
  // spark=1: the overview also carries the rows' mini charts (server EXPAND).
  client.read({ path: `${BASE}?${qs(query, compare)}&spark=1&inPeriod=1`, signal, parse: (raw: unknown) => {
    const data = parseProgressOverview(raw); return data && samePeriod(data.period, query, compare) ? data : undefined;
  } });
export const fetchProgressBody = (client: MobileApiClient, query: ProgressQuery, signal?: AbortSignal, compare: ProgressCompareRange = null) =>
  client.read({ path: `${BASE}/body?${qs(query, compare)}`, signal, parse: (raw: unknown) => {
    const data = parseProgressBody(raw); return data && samePeriod(data.period, query, compare) ? data : undefined;
  } });
export const fetchProgressMetrics = (client: MobileApiClient, query: ProgressQuery, metricId: string | null, signal?: AbortSignal, compare: ProgressCompareRange = null) =>
  client.read({ path: `${BASE}/metrics?${qs(query, compare)}${metricId ? `&metric=${encodeURIComponent(metricId)}` : ''}`, signal, parse: (raw: unknown) => {
    const data = parseProgressMetrics(raw);
    if (!data || !samePeriod(data.period, query, compare)) return undefined;
    // A different metric is only valid when the requested one no longer exists.
    if (metricId && data.metric && data.metric.id !== metricId && data.definitions.some(d => d.id === metricId)) return undefined;
    return data;
  } });
export const fetchProgressTraining = (client: MobileApiClient, query: ProgressQuery, signal?: AbortSignal, compare: ProgressCompareRange = null) =>
  client.read({ path: `${BASE}/training?${qs(query, compare)}&inPeriod=1`, signal, parse: (raw: unknown) => {
    const data = parseProgressTraining(raw); return data && samePeriod(data.period, query, compare) ? data : undefined;
  } });
/** Home's records card: the records, exercise performance and comparable count of `/training`, without the rest. */
export const fetchProgressTrainingRecords = (client: MobileApiClient, query: ProgressQuery, signal?: AbortSignal) =>
  client.read({ path: `${BASE}/training/records?${qs(query)}`, signal, parse: (raw: unknown) => {
    const data = parseProgressTrainingRecords(raw); return data && samePeriod(data.period, query) ? data : undefined;
  } });
export const fetchProgressTrainingExercise = (client: MobileApiClient, query: ProgressQuery, exerciseId: string, signal?: AbortSignal, compare: ProgressCompareRange = null) =>
  client.read({ path: `${BASE}/training/exercises/${encodeURIComponent(exerciseId)}?${qs(query, compare)}&charts=1`, signal, parse: (raw: unknown) => {
    const data = parseProgressTrainingExercise(raw);
    return data && samePeriod(data.period, query, compare) && data.exercise.id === exerciseId.toLowerCase() ? data : undefined;
  } });

/** A response from a different calendar week never replaces Home's requested week. */
export const fetchProgressHabitWeek = (client: MobileApiClient, weekStart: string, signal?: AbortSignal) =>
  client.read({ path: `${BASE}/habits`, signal, parse: (raw: unknown) => {
    const data = parseProgressHabitWeek(raw);
    return data?.weekStart === weekStart ? data : undefined;
  } });

export const fetchProgressNutritionTiming = (client: MobileApiClient, query: ProgressQuery, signal?: AbortSignal, compare: ProgressCompareRange = null) =>
  client.read({ path: `${BASE}/nutrition/timing?${qs(query, compare)}`, signal, parse: (raw: unknown) => {
    const data = parseProgressNutritionTiming(raw);
    return data && samePeriod(data.period, query, compare) && (compare ? data.reference !== null : data.reference === null) ? data : undefined;
  } });

/** Explorar (stage 2): measure × optional breakdown × optional day filter, inside the shared period. */
export type ExploreRequest = { measure: string; breakdown: ExploreBreakdown | null; days: ExploreDays | null; series: boolean };
export const exploreRequestKey = (r: ExploreRequest) => `${r.measure}|${r.breakdown ?? ''}|${r.days ?? ''}|${r.series ? 's' : ''}`;
export const fetchProgressExplore = (client: MobileApiClient, query: ProgressQuery, request: ExploreRequest, signal?: AbortSignal, compare: ProgressCompareRange = null) =>
  client.read({ path: `${BASE}/explore?${qs(query, compare)}&measure=${encodeURIComponent(request.measure)}${request.breakdown ? `&breakdown=${request.breakdown}` : ''}${request.days ? `&days=${request.days}` : ''}${request.series ? '&series=1' : ''}`,
    signal, parse: (raw: unknown) => {
      const data = parseProgressExplore(raw);
      // A response for another measure, breakdown or period is invalid, never shown.
      return data && samePeriod(data.period, query, compare) && data.measure.key === request.measure && data.breakdown === request.breakdown
        && data.days === request.days && data.series === request.series && (data.reference !== null) === !!compare ? data : undefined;
    } });
