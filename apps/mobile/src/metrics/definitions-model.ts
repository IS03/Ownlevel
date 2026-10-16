import {
  METRIC_NAME_MAX, METRIC_UNIT_MAX, normalizeMetricDefinitionFields,
  type MetricDefinition, type MetricDefinitionFields, type MetricDefinitionValueType,
} from '@/api/metric-definitions';
import { metricInputValue } from '@/nutrition/day-write-model';

// Form strings for one definition. Missing target stays '' (never 0).
export type DefinitionDraft = { name: string; valueType: MetricDefinitionValueType; unit: string; target: string; hours: string; minutes: string; icon: string | null; quickValue: string; quickHours: string; quickMinutes: string };
export const VALUE_TYPE_LABELS: Record<MetricDefinitionValueType, string> = { integer: 'Número entero', decimal: 'Decimal', duration: 'Duración' };

export function definitionDraft(d: MetricDefinition | null): DefinitionDraft {
  if (!d) return { name: '', valueType: 'integer', unit: '', target: '', hours: '', minutes: '', icon: null, quickValue: '', quickHours: '', quickMinutes: '' };
  const duration = d.valueType === 'duration' && d.target !== null;
  const quick = d.quickValue ?? null;
  return { name: d.name, valueType: d.valueType, unit: d.valueType === 'duration' ? '' : d.unit ?? '', icon: d.icon ?? null,
    quickValue: quick===null || d.valueType==='duration' ? '' : String(quick).replace('.',','),
    quickHours: quick!==null && d.valueType==='duration' ? String(Math.floor(quick/60)) : '', quickMinutes: quick!==null && d.valueType==='duration' ? String(quick%60) : '',
    target: d.target === null || d.valueType === 'duration' ? '' : String(d.target).replace('.', ','),
    hours: duration ? String(Math.floor(d.target! / 60)) : '', minutes: duration ? String(d.target! % 60) : '' };
}
export const draftDirty = (draft: DefinitionDraft, baseline: MetricDefinition | null) =>
  JSON.stringify(draft) !== JSON.stringify(definitionDraft(baseline));

/**
 * Builds the fields the server will accept. System definitions keep their
 * canonical identity (only the target changes); a custom definition with
 * history keeps its type and unit. Errors are keyed by field.
 */
export function validateDefinitionDraft(draft: DefinitionDraft, baseline: MetricDefinition | null): { fields: MetricDefinitionFields } | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const lockedMeaning = !!baseline && !baseline.actions.editMeaning;
  const valueType = lockedMeaning ? baseline!.valueType : draft.valueType;
  const name = baseline && !baseline.actions.editName ? baseline.name : draft.name.trim();
  const unit = lockedMeaning ? baseline!.unit : valueType === 'duration' ? 'min' : draft.unit.trim() || null;
  if (!name) errors.name = 'El nombre es obligatorio.';
  else if ([...name].length > METRIC_NAME_MAX) errors.name = `El nombre no puede superar ${METRIC_NAME_MAX} caracteres.`;
  if (unit && [...unit].length > METRIC_UNIT_MAX) errors.unit = `La unidad no puede superar ${METRIC_UNIT_MAX} caracteres.`;
  const target = metricInputValue({ value: draft.target, hours: draft.hours, minutes: draft.minutes }, valueType);
  if (target === undefined) errors.target = valueType === 'duration' ? 'Ingresá horas y minutos válidos.'
    : valueType === 'integer' ? 'El objetivo debe ser un número entero.' : 'El objetivo debe ser un número válido (hasta 4 decimales).';
  if (Object.keys(errors).length) return { errors };
  const quickValue = metricInputValue({value:draft.quickValue,hours:draft.quickHours,minutes:draft.quickMinutes},valueType);
  if (quickValue === undefined || quickValue === 0) return {errors: {quickValue:'La porción tiene que ser mayor que 0 y respetar cómo registrás la métrica.'}};
  const fields = normalizeMetricDefinitionFields({ name, valueType, unit, target: target ?? null, icon: draft.icon, quickValue });
  return fields ? { fields } : { errors: { form: 'Revisá los datos de la métrica.' } };
}

const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 4 });
export function formatDefinitionAmount(d: Pick<MetricDefinition, 'valueType' | 'unit'>, value: number): string {
  if (d.valueType === 'duration') return `${Math.floor(value / 60)} h ${value % 60} min`;
  return `${number.format(value)}${d.unit ? ` ${d.unit}` : ''}`;
}
export function definitionSummary(d: MetricDefinition): string {
  const kind = d.valueType === 'duration' ? 'Duración (h y min)' : `${VALUE_TYPE_LABELS[d.valueType]}${d.unit ? ` · ${d.unit}` : ''}`;
  return `${kind} · ${d.target === null ? 'Sin objetivo' : `Objetivo ${formatDefinitionAmount(d, d.target)}`}${d.quickValue == null ? '' : ` · toque: + ${quickAmount(d, d.quickValue)}`}`;
}
export function quickAmount(d: Pick<MetricDefinition,'valueType'|'unit'>, value:number): string {
  return d.unit==='L' && value<1 ? `${number.format(Math.round(value*1e7)/1e4)} ml` : formatDefinitionAmount(d,value);
}
export const activeDefinitions = (all: MetricDefinition[]) => all.filter(d => d.isActive);
export const archivedDefinitions = (all: MetricDefinition[]) => all.filter(d => !d.isActive);
export function moveId(ids: string[], id: string, direction: -1 | 1): string[] | null {
  const index = ids.indexOf(id), destination = index + direction;
  if (index < 0 || destination < 0 || destination >= ids.length) return null;
  const next = [...ids];
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}
