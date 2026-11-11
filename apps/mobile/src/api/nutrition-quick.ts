import type { MobileApiClient } from './client';
import { parseQuickOptions, parseQuickPinsConflict, parseQuickPinsSnapshot, parseQuickPreview, parseQuickResponse, sameQuickSelection, type QuickSelection, type QuickIntent,
  type QuickPinsConflict, type QuickPinsSnapshot, type QuickPinsWrite } from '../../../../src/lib/mobile-api/nutrition-quick-contract';
export * from '../../../../src/lib/mobile-api/nutrition-quick-contract';
export function fetchQuickOptions(client: MobileApiClient, signal?: AbortSignal) {
  return client.read({ path: '/api/mobile/v1/nutrition/quick-options', signal, parse: parseQuickOptions });
}
export function previewQuickMeal(client: MobileApiClient, selection: QuickSelection, signal?: AbortSignal) {
  return client.request({ method: 'POST', path: `/api/mobile/v1/nutrition/days/${selection.date}/meal-preview`, body: selection, signal,
    parse: v => { const p = parseQuickPreview(v); return p && sameQuickSelection(p.selection, selection) ? p : undefined; } });
}
export function confirmQuickMeal(client: MobileApiClient, intent: QuickIntent, signal?: AbortSignal) {
  return client.request({ method: 'POST', path: `/api/mobile/v1/nutrition/days/${intent.date}/meal-registrations`, body: intent, signal,
    parse: v => { const r = parseQuickResponse(v); return !r || 'error' in r ? r : r.date === intent.date && r.operation === intent.operation ? r : undefined; } });
}
/**
 * #479: the whole ordered list of pins against the revision last read. A 409 carries the server's truth in `data`
 * (`current`, or null when the server could not read it). An unknown outcome is `unavailable`: replay the same body.
 */
export function putQuickPins(client: MobileApiClient, write: QuickPinsWrite, signal?: AbortSignal) {
  return client.request<QuickPinsSnapshot | QuickPinsConflict>({ method: 'PUT', path: '/api/mobile/v1/nutrition/quick-pins', body: write, signal,
    parse: v => {
      const conflict = parseQuickPinsConflict(v); if (conflict) return conflict;
      const receipt = parseQuickPinsSnapshot(v);
      // A receipt is the list that was asked for, in that order, at or after the expected revision (a replay included).
      return receipt && receipt.items.map(i => i.id).join() === write.savedMealIds.join() && receipt.revision >= write.expectedRevision ? receipt : undefined;
    } });
}
