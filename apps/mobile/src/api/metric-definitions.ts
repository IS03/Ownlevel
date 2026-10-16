import type { MobileApiClient } from './client';
import {
  parseMetricDefinitionReceipt, parseMetricDefinitions, parseMetricOrderReceipt,
  type MetricDefinitionIntent, type MetricOrderIntent,
} from '../../../../src/lib/mobile-api/metric-definitions-contract';

export * from '../../../../src/lib/mobile-api/metric-definitions-contract';
const BASE = '/api/mobile/v1/metrics/definitions';
export const fetchMetricDefinitions = (client: MobileApiClient, signal?: AbortSignal) =>
  client.read({ path: `${BASE}?presentation=1`, signal, parse: parseMetricDefinitions });
export const mutateMetricDefinition = (client: MobileApiClient, intent: MetricDefinitionIntent, signal?: AbortSignal) =>
  client.request({ method: intent.operation === 'create' ? 'POST' : intent.operation === 'delete' ? 'DELETE' : 'PUT',
    path: intent.metricId ? `${BASE}/${encodeURIComponent(intent.metricId)}` : BASE, body: intent, signal,
    parse: (v: unknown) => {
      const r = parseMetricDefinitionReceipt(v);
      return r && r.operation === intent.operation && (!intent.metricId || r.metricId === intent.metricId.toLowerCase()) ? r : undefined;
    } });
export const reorderMetricDefinitions = (client: MobileApiClient, intent: MetricOrderIntent, signal?: AbortSignal) =>
  client.request({ method: 'PUT', path: `${BASE}/order`, body: intent, signal,
    parse: (v: unknown) => {
      const r = parseMetricOrderReceipt(v);
      return r && r.metricIds.join() === intent.metricIds.map(x => x.toLowerCase()).join() ? r : undefined;
    } });
