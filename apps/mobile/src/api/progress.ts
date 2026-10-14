import type { MobileApiClient } from './client';
import {
  parseProgressHabitWeek, parseProgressBody, parseProgressMetrics, parseProgressOverview, parseProgressTraining, parseProgressTrainingExercise, progressQueryString,
  type ProgressPeriod, type ProgressQuery,
} from '../../../../src/lib/mobile-api/progress-contract';

export * from '../../../../src/lib/mobile-api/progress-contract';
const BASE = '/api/mobile/v1/progress';
/** A response belongs to the requested period (a late response for another period is invalid, never shown). */
const samePeriod = (period: ProgressPeriod, query: ProgressQuery) => period.preset === query.period && (query.period !== 'custom' || period.start === query.from);
export const fetchProgressOverview = (client: MobileApiClient, query: ProgressQuery, signal?: AbortSignal) =>
  client.read({ path: `${BASE}?${progressQueryString(query)}`, signal, parse: (raw: unknown) => {
    const data = parseProgressOverview(raw); return data && samePeriod(data.period, query) ? data : undefined;
  } });
export const fetchProgressBody = (client: MobileApiClient, query: ProgressQuery, signal?: AbortSignal) =>
  client.read({ path: `${BASE}/body?${progressQueryString(query)}`, signal, parse: (raw: unknown) => {
    const data = parseProgressBody(raw); return data && samePeriod(data.period, query) ? data : undefined;
  } });
export const fetchProgressMetrics = (client: MobileApiClient, query: ProgressQuery, metricId: string | null, signal?: AbortSignal) =>
  client.read({ path: `${BASE}/metrics?${progressQueryString(query)}${metricId ? `&metric=${encodeURIComponent(metricId)}` : ''}`, signal, parse: (raw: unknown) => {
    const data = parseProgressMetrics(raw);
    if (!data || !samePeriod(data.period, query)) return undefined;
    // A different metric is only valid when the requested one no longer exists.
    if (metricId && data.metric && data.metric.id !== metricId && data.definitions.some(d => d.id === metricId)) return undefined;
    return data;
  } });
export const fetchProgressTraining = (client: MobileApiClient, query: ProgressQuery, signal?: AbortSignal) =>
  client.read({ path: `${BASE}/training?${progressQueryString(query)}`, signal, parse: (raw: unknown) => {
    const data = parseProgressTraining(raw); return data && samePeriod(data.period, query) ? data : undefined;
  } });
export const fetchProgressTrainingExercise = (client: MobileApiClient, query: ProgressQuery, exerciseId: string, signal?: AbortSignal) =>
  client.read({ path: `${BASE}/training/exercises/${encodeURIComponent(exerciseId)}?${progressQueryString(query)}`, signal, parse: (raw: unknown) => {
    const data = parseProgressTrainingExercise(raw);
    return data && samePeriod(data.period, query) && data.exercise.id === exerciseId.toLowerCase() ? data : undefined;
  } });

/** A response from a different calendar week never replaces Home's requested week. */
export const fetchProgressHabitWeek = (client: MobileApiClient, weekStart: string, signal?: AbortSignal) =>
  client.read({ path: `${BASE}/habits`, signal, parse: (raw: unknown) => {
    const data = parseProgressHabitWeek(raw);
    return data?.weekStart === weekStart ? data : undefined;
  } });
