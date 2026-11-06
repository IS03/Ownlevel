import { isNutritionDate } from './nutrition-day-contract';
import { SLEEP_NIGHT_CONVENTION } from '../daily-metrics/sleep-night';
import { mealUuid, mealVersion } from './nutrition-meal-contract';
export type OverrideChange = { action: 'set'; value: number } | { action: 'clear' };
/** sleepNight (#367): sent only by a client that showed which night the value means. Never inferred for an older client. */
export type MetricChange = { metricId: string; definitionUpdatedAt: string; expectedUpdatedAt: string | null; value: number | null; sleepNight?: typeof SLEEP_NIGHT_CONVENTION };
export type DayWriteIntent = { operation: 'metrics'; date: string; idempotencyKey: string; changes: MetricChange[] }
  | { operation: 'context'; date: string; idempotencyKey: string; expectedUpdatedAt: string; changes: { target?: OverrideChange; expenditure?: OverrideChange } };
export type DayWriteReceipt = { status: 'saved'; operation: 'metrics' | 'context'; date: string };
export type DayWriteConflict = { error: 'METRICS_CHANGED' | 'METRIC_UNAVAILABLE' | 'METRIC_FUTURE_DATE' | 'CONTEXT_CHANGED' | 'CONTEXT_UNAVAILABLE' | 'IDEMPOTENCY_KEY_REUSED'; message: string };
export type DayWriteResponse = DayWriteReceipt | DayWriteConflict;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const numeric = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 9999999999.9999 && /^\d+(?:\.\d{1,4})?$/.test(String(v));
function override(v: unknown, max: number): OverrideChange | undefined {
  if (!record(v)) return;
  if (v.action === 'clear' && Object.keys(v).length === 1) return { action: 'clear' };
  if (v.action === 'set' && Object.keys(v).length === 2 && typeof v.value === 'number' && Number.isInteger(v.value) && v.value >= 1 && v.value <= max) return { action: 'set', value: v.value };
}
export function parseDayWriteIntent(v: unknown): DayWriteIntent | undefined {
  if (!record(v) || !isNutritionDate(v.date) || typeof v.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(v.idempotencyKey)) return;
  if (v.operation === 'metrics' && Object.keys(v).length === 4 && Array.isArray(v.changes) && v.changes.length > 0 && v.changes.length <= 100) {
    const changes: MetricChange[] = [];
    for (const c of v.changes) {
      // A declared night needs a value: a cleared one has no night to declare.
      const declares = record(c) && Object.hasOwn(c, 'sleepNight');
      if (!record(c) || Object.keys(c).length !== (declares ? 5 : 4) || !mealUuid(c.metricId) || !mealVersion(c.definitionUpdatedAt)
        || !(c.expectedUpdatedAt === null || mealVersion(c.expectedUpdatedAt)) || !(c.value === null || numeric(c.value))
        || (declares && (c.sleepNight !== SLEEP_NIGHT_CONVENTION || c.value === null))) return;
      changes.push({ metricId: c.metricId.toLowerCase(), definitionUpdatedAt: c.definitionUpdatedAt, expectedUpdatedAt: c.expectedUpdatedAt, value: c.value as number | null, ...(declares ? { sleepNight: SLEEP_NIGHT_CONVENTION } : {}) });
    }
    if (new Set(changes.map(c => c.metricId)).size !== changes.length) return;
    return { operation: 'metrics', date: v.date, idempotencyKey: v.idempotencyKey, changes: changes.sort((a,b) => a.metricId.localeCompare(b.metricId)) };
  }
  if (v.operation === 'context' && Object.keys(v).length === 5 && mealVersion(v.expectedUpdatedAt) && record(v.changes)
    && Object.keys(v.changes).length > 0 && Object.keys(v.changes).every(k => k === 'target' || k === 'expenditure')) {
    const target = v.changes.target === undefined ? undefined : override(v.changes.target, 20000);
    const expenditure = v.changes.expenditure === undefined ? undefined : override(v.changes.expenditure, 50000);
    if ((v.changes.target !== undefined && !target) || (v.changes.expenditure !== undefined && !expenditure)) return;
    return { operation: 'context', date: v.date, idempotencyKey: v.idempotencyKey, expectedUpdatedAt: v.expectedUpdatedAt, changes: { ...(target ? { target } : {}), ...(expenditure ? { expenditure } : {}) } };
  }
}
export function parseDayWriteResponse(v: unknown): DayWriteResponse | undefined {
  if (!record(v)) return;
  if (v.status === 'saved' && ['metrics','context'].includes(String(v.operation)) && isNutritionDate(v.date)) return { status: 'saved', operation: v.operation as DayWriteReceipt['operation'], date: v.date };
  if (['METRICS_CHANGED','METRIC_UNAVAILABLE','METRIC_FUTURE_DATE','CONTEXT_CHANGED','CONTEXT_UNAVAILABLE','IDEMPOTENCY_KEY_REUSED'].includes(String(v.error)) && typeof v.message === 'string') return { error: v.error as DayWriteConflict['error'], message: v.message };
}

/** What the database writer receives: the declaration travels apart, so the idempotency hash and receipts stay those of v1. */
export function splitSleepNights(intent: DayWriteIntent): { intent: DayWriteIntent; sleepNightMetricIds: string[] } {
  if (intent.operation !== 'metrics') return { intent, sleepNightMetricIds: [] };
  return { intent: { ...intent, changes: intent.changes.map(change => { const written = { ...change }; delete written.sleepNight; return written; }) },
    sleepNightMetricIds: intent.changes.filter(change => change.sleepNight).map(change => change.metricId) };
}
