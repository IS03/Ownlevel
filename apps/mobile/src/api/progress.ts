import type { MobileApiClient } from './client';
import {
  parseProgressHabitWeek, parseProgressBody, parseProgressMetrics, parseProgressOverview, parseProgressTraining, parseProgressTrainingExercise, progressQueryKey, progressQueryString,
  type ProgressPeriod, type ProgressQuery,
} from '../../../../src/lib/mobile-api/progress-contract';

export * from '../../../../src/lib/mobile-api/progress-contract';
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
export const fetchProgressTrainingExercise = (client: MobileApiClient, query: ProgressQuery, exerciseId: string, signal?: AbortSignal, compare: ProgressCompareRange = null) =>
  client.read({ path: `${BASE}/training/exercises/${encodeURIComponent(exerciseId)}?${qs(query, compare)}`, signal, parse: (raw: unknown) => {
    const data = parseProgressTrainingExercise(raw);
    return data && samePeriod(data.period, query, compare) && data.exercise.id === exerciseId.toLowerCase() ? data : undefined;
  } });

/** A response from a different calendar week never replaces Home's requested week. */
export const fetchProgressHabitWeek = (client: MobileApiClient, weekStart: string, signal?: AbortSignal) =>
  client.read({ path: `${BASE}/habits`, signal, parse: (raw: unknown) => {
    const data = parseProgressHabitWeek(raw);
    return data?.weekStart === weekStart ? data : undefined;
  } });
