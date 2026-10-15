import type { MobileApiClient } from './client';
import { progressQueryString, type ProgressQuery } from '../../../../src/lib/mobile-api/progress-contract';
import {
  parseProgressViewMutation, parseProgressViewsRead, type ProgressViewDefinition, type ProgressViewMutation,
} from '../../../../src/lib/mobile-api/progress-views-contract';
import type { ProgressCompareRange } from './progress';

export * from '../../../../src/lib/mobile-api/progress-views-contract';
const BASE = '/api/mobile/v1/progress/views';
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Mis vistas with their results in the shared period (a late response for another period is invalid). */
export const fetchProgressViews = (client: MobileApiClient, query: ProgressQuery, signal?: AbortSignal, compare: ProgressCompareRange = null) =>
  client.read({ path: `${BASE}?${progressQueryString(query)}&kinds=influence${compare ? `&compareFrom=${compare.start}&compareTo=${compare.end}` : ''}`, signal, parse: (raw: unknown) => {
    const data = parseProgressViewsRead(raw);
    return data && data.period.preset === query.period && (query.period !== 'custom' || data.period.start === query.from)
      && (!compare || (data.period.previousStart === compare.start && data.period.previousEnd === compare.end)) ? data : undefined;
  } });

export const createProgressView = (client: MobileApiClient, input: { name: string; definition: ProgressViewDefinition; idempotencyKey: string }) =>
  client.request<ProgressViewMutation>({ method: 'POST', path: BASE, body: input,
    parse: v => { const r = parseProgressViewMutation(v); return r && r.view.name === input.name ? r : undefined; } });
export const renameProgressView = (client: MobileApiClient, id: string, input: { name: string; expectedVersion: number }) =>
  client.request<ProgressViewMutation>({ method: 'PATCH', path: `${BASE}/${encodeURIComponent(id)}`, body: input,
    parse: v => { const r = parseProgressViewMutation(v); return r && r.view.id === id && r.view.name === input.name ? r : undefined; } });
export const deleteProgressView = (client: MobileApiClient, id: string, expectedVersion: number) =>
  client.request<{ listVersion: number }>({ method: 'DELETE', path: `${BASE}/${encodeURIComponent(id)}?expectedVersion=${expectedVersion}`,
    parse: v => record(v) && Number.isSafeInteger(v.listVersion) ? { listVersion: v.listVersion as number } : undefined });
export const reorderProgressViews = (client: MobileApiClient, input: { viewIds: string[]; expectedListVersion: number; idempotencyKey: string }) =>
  client.request<{ viewIds: string[]; listVersion: number }>({ method: 'PUT', path: `${BASE}/order`, body: input,
    parse: v => record(v) && Array.isArray(v.viewIds) && JSON.stringify(v.viewIds) === JSON.stringify(input.viewIds) && Number.isSafeInteger(v.listVersion)
      ? { viewIds: input.viewIds, listVersion: v.listVersion as number } : undefined });
/** One key per user intent; a retry of the same intent reuses it. */
export const viewIntentKey = () => typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `view-${Date.now()}-${Math.random().toString(36).slice(2)}`;
