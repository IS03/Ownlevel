import type { MetricValueType, ProgressComparison, ProgressCoverage, ProgressPreset, ProgressQuery, BodyTrend, BodyConfidence } from '@/api/progress';
import { displayNutritionDate } from '@/nutrition/day-format';

export const PRESET_LABELS: Record<ProgressPreset, string> = { '7': '7 días', '14': '14 días', '30': '30 días', '3m': '3 meses', '6m': '6 meses', '1y': '1 año', custom: 'Personalizado' };
const fmt = (value: number, digits = 1) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits }).format(value);

/** A value in its own semantics. null is "Sin dato", never 0. */
export function formatValue(value: number | null, unit: string | null, valueType: MetricValueType = 'decimal'): string {
  if (value === null) return 'Sin dato';
  if (valueType === 'duration') { const total = Math.round(value); return `${Math.floor(total / 60)} h ${total % 60} min`; }
  return `${fmt(value, valueType === 'integer' ? 0 : 2)}${unit ? ` ${unit}` : ''}`;
}
export function formatDelta(value: number, unit: string | null, valueType: MetricValueType = 'decimal'): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  if (valueType === 'duration') { const total = Math.round(Math.abs(value)); return `${sign}${Math.floor(total / 60)} h ${total % 60} min`; }
  return `${sign}${fmt(Math.abs(value), valueType === 'integer' ? 0 : 2)}${unit ? ` ${unit}` : ''}`;
}
const REASONS: Record<string, string> = {
  current_period_empty: 'sin datos en este período', previous_period_empty: 'el período de comparación no tiene datos',
  insufficient_current_samples: 'pocos datos en este período', insufficient_previous_samples: 'pocos datos en el período de comparación',
  metric_disallows_comparison: 'esta métrica no se compara',
};
/** Current vs the chosen comparison range (Progreso's "Comparar"), honest about missing baselines. */
export function comparisonText(c: ProgressComparison, unit: string | null, valueType: MetricValueType = 'decimal', against = 'el período anterior'): string {
  if (c.status !== 'comparable' || c.deltaAbsolute === null) return `Sin comparación: ${REASONS[c.reason] ?? 'datos insuficientes'}.`;
  if (c.change === 'stable') return `Estable frente a ${against}.`;
  const percent = c.deltaPercent === null ? '' : ` (${c.deltaPercent > 0 ? '+' : ''}${fmt(c.deltaPercent)}%)`;
  return `${formatDelta(c.deltaAbsolute, unit, valueType)}${percent} frente a ${against}.`;
}
export function coverageText(c: ProgressCoverage): string | null {
  if (c.eligible === null) return `${c.registered} registros`;
  return `${c.registered} de ${c.eligible} días con dato`;
}
export const lowCoverage = (c: ProgressCoverage) => c.ratio !== null && c.ratio < 0.5;
export function trendText(trend: BodyTrend, confidence: BodyConfidence): string {
  if (trend === 'unavailable') return 'Datos insuficientes para una tendencia (hacen falta al menos 2 registros).';
  const base = { increased: 'Tendencia en subida', decreased: 'Tendencia en bajada', stable: 'Sin cambios', variable: 'Variable: los registros no van en una sola dirección' }[trend];
  return confidence === 'limited' ? `${base} · sólo 2 registros, confianza limitada.` : `${base}.`;
}
export function periodText(q: { start: string; end: string; preset: ProgressPreset }): string {
  return `${PRESET_LABELS[q.preset]} · ${displayNutritionDate(q.start)} — ${displayNutritionDate(q.end)}`;
}
export function queryParams(q: ProgressQuery): Record<string, string> {
  return q.period === 'custom' && q.from && q.to ? { period: 'custom', from: q.from, to: q.to } : { period: q.period };
}
/** Route params → query (invalid params fall back to the 30-day default). */
export function queryFromParams(p: { period?: string | string[]; from?: string | string[]; to?: string | string[] }, parse: (v: unknown) => ProgressQuery | undefined): ProgressQuery {
  const one = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] : v;
  const period = one(p.period), from = one(p.from), to = one(p.to);
  return parse(period === 'custom' ? { period, from, to } : { period }) ?? { period: '30' };
}
