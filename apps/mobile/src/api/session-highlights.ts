import type { MobileApiClient } from './client';
import { parseSessionHighlights } from '../../../../src/lib/mobile-api/training-session-highlights';
export { parseSessionHighlights, isKgWeightMode } from '../../../../src/lib/mobile-api/training-session-highlights';
export type { SessionHighlightsDto, SessionHighlight, SessionHighlightMark } from '../../../../src/lib/mobile-api/training-session-highlights';
export function fetchSessionHighlights(client: MobileApiClient, sessionId: string, signal?: AbortSignal) {
  return client.read({ path: `/api/mobile/v1/training/sessions/${encodeURIComponent(sessionId)}/highlights`, signal,
    parse: raw => { const data = parseSessionHighlights(raw); return data?.sessionId === sessionId ? data : undefined; } });
}
