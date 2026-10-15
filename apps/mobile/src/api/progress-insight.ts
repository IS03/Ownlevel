import type { MobileApiClient } from './client';
import { parseProgressInsight, type ProgressInsight } from '../../../../src/lib/mobile-api/progress-insight-contract';
import type { InfluenceSuggestedKey } from '../../../../src/lib/mobile-api/progress-influence-contract';

export * from '../../../../src/lib/mobile-api/progress-insight-contract';
const BASE = '/api/mobile/v1/progress/insight';

/** At most one automatic insight over the last 3 months (independent of the period on screen). */
export const fetchProgressInsight = (client: MobileApiClient, signal?: AbortSignal) =>
  client.read<ProgressInsight>({ path: BASE, signal, parse: (raw: unknown) => parseProgressInsight(raw) });
/** "No me interesa": idempotent, safe to retry. */
export const dismissProgressInsight = (client: MobileApiClient, key: InfluenceSuggestedKey) =>
  client.request<{ key: string }>({ method: 'POST', path: `${BASE}/dismiss`, body: { key },
    parse: v => !!v && typeof v === 'object' && (v as { key?: unknown }).key === key ? { key } : undefined });
