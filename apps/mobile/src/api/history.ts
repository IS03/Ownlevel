import type { MobileApiClient } from './client';
import { parseHistoryDay, parseHistoryRange } from '../../../../src/lib/mobile-api/history-contract';
export * from '../../../../src/lib/mobile-api/history-contract';
export function fetchHistoryRange(client: MobileApiClient, range?: { from: string; to: string }, signal?: AbortSignal, background = false) {
  const query = range ? `?${new URLSearchParams(range)}` : '';
  return client.read({ path: `/api/mobile/v1/history/calendar${query}`, signal, ...(background ? { background } : {}), parse: value => {
    const parsed = parseHistoryRange(value);
    return parsed && (!range || (parsed.requestedRange.from === range.from && parsed.requestedRange.to === range.to)) ? parsed : undefined;
  } });
}
export function fetchHistoryDay(client: MobileApiClient, date: string, signal?: AbortSignal) {
  return client.read({ path: `/api/mobile/v1/history/days/${encodeURIComponent(date)}`, signal, parse: value => {
    const parsed = parseHistoryDay(value); return parsed?.date === date ? parsed : undefined;
  } });
}
