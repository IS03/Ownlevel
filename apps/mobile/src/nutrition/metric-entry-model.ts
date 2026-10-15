import type { MobileNutritionDayResponse, NutritionDayMetric } from '@/api/nutrition-day';
import type { DayWriteIntent } from '@/api/nutrition-day-write';
import { buildDayWriteIntent, canWriteDay, dayWriteDraft, metricInputValue, type MetricInput } from './day-write-model';

export type MetricEntryMode = 'add' | 'replace';
export const metricRaw = (value: number | null, duration: boolean): MetricInput => ({
  value: value === null ? '' : String(value).replace('.', ','),
  hours: duration && value !== null ? String(Math.floor(value / 60)) : '0',
  minutes: duration && value !== null ? String(value % 60) : '0',
});
export function findDayMetric(data: MobileNutritionDayResponse, id: string) {
  return data.activity.status === 'ok' ? data.activity.data.metrics.find(m => m.id === id) : undefined;
}
export function canEditDayMetric(data: MobileNutritionDayResponse, metric: NutritionDayMetric) {
  return canWriteDay('metrics', data) && (metric.isActive || (data.date < data.today && metric.value !== null));
}
/** Addition stays in the API's four-decimal domain (0.1 + 0.2 must be 0.3). */
export function metricEntryValue(metric: NutritionDayMetric, mode: MetricEntryMode, raw: MetricInput) {
  const input = metricInputValue(raw, metric.valueType);
  if (input === null || input === undefined || (mode === 'add' && metric.value === null)) return undefined;
  return mode === 'add' ? (Math.round(metric.value! * 10000) + Math.round(input * 10000)) / 10000 : input;
}
export function metricEntryCandidate(data: MobileNutritionDayResponse, id: string, mode: MetricEntryMode, raw: MetricInput) {
  const metric = findDayMetric(data, id);
  if (!metric || !canEditDayMetric(data, metric)) return undefined;
  const value = metricEntryValue(metric, mode, raw);
  if (value === undefined) return undefined;
  const draft = dayWriteDraft('metrics', data);
  draft.metrics[id] = metricRaw(value, metric.valueType === 'duration');
  const built = buildDayWriteIntent(draft, 'metric-preview');
  return { value, valid: !!built.intent, error: built.errors[id] ?? built.errors.form };
}
export type MetricUndo = { before: NutritionDayMetric; after: MobileNutritionDayResponse };
/** A later value/definition seen by the confirmation read cannot authorize undoing this write. */
export function confirmedMetricUndo(intent: DayWriteIntent, baseline: MobileNutritionDayResponse, current: MobileNutritionDayResponse): MetricUndo | null {
  if (intent.operation !== 'metrics' || intent.changes.length !== 1 || current.date !== intent.date || baseline.date !== intent.date) return null;
  const change = intent.changes[0];
  const before = findDayMetric(baseline, change.metricId), after = findDayMetric(current, change.metricId);
  if (!before || !after || after.value !== change.value || before.valueType !== after.valueType || before.unit !== after.unit
    || change.definitionUpdatedAt !== after.definitionUpdatedAt || !canEditDayMetric(current, after)) return null;
  // Restoring an archived metric after clearing it is not supported by the existing write rules.
  if (!after.isActive && after.value === null) return null;
  return { before, after: current };
}
