import type { MobileApiClient } from './client';
import { parseBodyDay } from '../../../../src/lib/mobile-api/body-day-contract';
import {
  parseBodyMeasurement, parseBodyMeasurementPage, parseBodyMeasurementReceipt, parseBodyOverview, parseBodyWeightPage, parseBodyWeightReceipt, bodyRecord,
  type BodyMeasurementIntent, type BodyWeightIntent,
} from '../../../../src/lib/mobile-api/body-contract';
import { isNutritionDate } from '../../../../src/lib/mobile-api/nutrition-day-contract';
export type { BodyDay } from '../../../../src/lib/mobile-api/body-day-contract';

export * from '../../../../src/lib/mobile-api/body-contract';
const BASE = '/api/mobile/v1/body';
export const fetchBodyMeasurement = (client: MobileApiClient, id: string, signal?: AbortSignal) =>
  client.request({ method: 'GET', path: `${BASE}/measurements/${encodeURIComponent(id)}`, signal,
    parse: v => { const m = parseBodyMeasurement(v); return m?.id === id.toLowerCase() ? m : undefined; } });
export const fetchBodyDay = (client: MobileApiClient, date: string, signal?: AbortSignal) =>
  client.read({ path: `${BASE}/days/${encodeURIComponent(date)}`, signal, parse: v => { const p = parseBodyDay(v); return p?.date === date ? p : undefined; } });
const sectionPage = <T,>(parse: (v: unknown) => T | undefined) => (v: unknown) => {
  if (!bodyRecord(v) || !isNutritionDate(v.today)) return undefined;
  const page = parse({ items: v.items, nextBefore: v.nextBefore });
  return page ? { today: v.today, ...page } : undefined;
};
type BodyListener = (overview: NonNullable<ReturnType<typeof parseBodyOverview>>) => void;
const bodyListeners = new Set<BodyListener>();
/** #639 · Every confirmed Cuerpo overview, as it arrives: the weigh-in and measurement reminders follow it. */
export function observeBody(listener: BodyListener) { bodyListeners.add(listener); return () => { bodyListeners.delete(listener); }; }
export const fetchBodyOverview = (client: MobileApiClient, signal?: AbortSignal) =>
  client.read({ path: BASE, signal, parse: (value: unknown) => {
    const overview = parseBodyOverview(value);
    if (overview) bodyListeners.forEach(listener => { try { listener(overview); } catch { /* a listener never breaks the read */ } });
    return overview;
  } });
export const fetchBodyWeights = (client: MobileApiClient, before: string, signal?: AbortSignal) =>
  client.read({ path: `${BASE}/weights?before=${encodeURIComponent(before)}`, signal, parse: sectionPage(parseBodyWeightPage) });
export const fetchBodyMeasurements = (client: MobileApiClient, before: string, signal?: AbortSignal) =>
  client.read({ path: `${BASE}/measurements?before=${encodeURIComponent(before)}`, signal, parse: sectionPage(parseBodyMeasurementPage) });
export const mutateBodyWeight = (client: MobileApiClient, intent: BodyWeightIntent, signal?: AbortSignal) =>
  client.request({ method: intent.operation === 'set' ? 'PUT' : 'DELETE', path: `${BASE}/weights/${encodeURIComponent(intent.date)}`, body: intent, signal,
    parse: (v: unknown) => { const r = parseBodyWeightReceipt(v); return r && r.operation === intent.operation && r.date === intent.date ? r : undefined; } });
export const mutateBodyMeasurement = (client: MobileApiClient, intent: BodyMeasurementIntent, signal?: AbortSignal) =>
  client.request({ method: intent.operation === 'create' ? 'POST' : intent.operation === 'update' ? 'PUT' : 'DELETE',
    path: intent.measurementId ? `${BASE}/measurements/${encodeURIComponent(intent.measurementId)}` : `${BASE}/measurements`, body: intent, signal,
    parse: (v: unknown) => {
      const r = parseBodyMeasurementReceipt(v);
      return r && r.operation === intent.operation && (!intent.measurementId || r.measurementId === intent.measurementId.toLowerCase()) ? r : undefined;
    } });
