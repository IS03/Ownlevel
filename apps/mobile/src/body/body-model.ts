import {
  BODY_MEASUREMENT_FIELDS, BODY_MEASUREMENT_LABELS, BODY_MEASUREMENT_MAX_CM, BODY_WEIGHT_MAX_KG,
  type BodyMeasurement, type BodyMeasurementField, type BodyMeasurementFields, type BodyWeightEntry,
} from '@/api/body';
import { inputNutritionDate, parseInputNutritionDate } from '@/nutrition/day-format';

// Presentation + validation for Body. Only formats server truth: a missing value
// is shown as missing ("—"), never as 0. No energy or BMR math happens here.
const kgFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
export const formatKg = (value: number | null) => value === null ? '—' : `${kgFormatter.format(value)} kg`;
export const formatCm = (value: number | null) => value === null ? '—' : `${kgFormatter.format(value)} cm`;
// Deterministic across Hermes/ICU builds (no locale-dependent "de").
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function formatBodyDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}
export const toInputDate = inputNutritionDate;
const decimalText = (value: number | null) => value === null ? '' : String(value).replace('.', ',');

export type WeightDraft = { date: string; weight: string };
export type MeasurementDraft = Record<BodyMeasurementField, string> & { date: string; condition: string; notes: string };

export function weightDraft(date: string, weightKg: number | null): WeightDraft {
  return { date: inputNutritionDate(date), weight: decimalText(weightKg) };
}
export function measurementDraft(measurement: BodyMeasurement | null, today: string): MeasurementDraft {
  const draft = { date: inputNutritionDate(measurement?.measuredOn ?? today), condition: measurement?.condition ?? '', notes: measurement?.notes ?? '' } as MeasurementDraft;
  for (const field of BODY_MEASUREMENT_FIELDS) draft[field] = decimalText(measurement?.[field] ?? null);
  return draft;
}

function parseDecimal(text: string, max: number, label: string, allowZero: boolean): { value: number | null } | { error: string } {
  const raw = text.trim();
  if (!raw) return { value: null };
  if (!/^\d+([.,]\d+)?$/.test(raw)) return { error: `${label} no es un número válido.` };
  const value = Number(raw.replace(',', '.'));
  if (!Number.isFinite(value) || value > max || (allowZero ? value < 0 : value <= 0)) {
    return { error: allowZero ? `${label} debe estar entre 0 y ${String(max).replace('.', ',')}.` : `${label} debe ser mayor a 0 y hasta ${max}.` };
  }
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) return { error: `${label} puede tener como máximo dos decimales.` };
  return { value };
}
function parseDate(text: string, today: string): { date: string } | { error: string } {
  const date = parseInputNutritionDate(text.trim());
  if (!date) return { error: 'Ingresá una fecha válida (DD/MM/AAAA).' };
  // UX guard only: the server rejects future dates against its own Córdoba day.
  if (date > today) return { error: 'No se puede registrar en una fecha futura.' };
  return { date };
}

export function validateWeightDraft(draft: WeightDraft, today: string): { date: string; weightKg: number } | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const date = parseDate(draft.date, today);
  if ('error' in date) errors.date = date.error;
  const weight = parseDecimal(draft.weight, BODY_WEIGHT_MAX_KG, 'El peso', true);
  if ('error' in weight) errors.weight = weight.error;
  else if (weight.value === null) errors.weight = 'El peso es obligatorio.';
  if (Object.keys(errors).length || 'error' in date || 'error' in weight || weight.value === null) return { errors };
  return { date: date.date, weightKg: weight.value };
}

/** legacyValues: an edited row keeps arm_cm/thigh_cm, which also satisfy "at least one". */
export function validateMeasurementDraft(draft: MeasurementDraft, today: string, legacyValues = false):
  { fields: BodyMeasurementFields } | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const date = parseDate(draft.date, today);
  if ('error' in date) errors.date = date.error;
  const values = {} as Record<BodyMeasurementField, number | null>;
  for (const field of BODY_MEASUREMENT_FIELDS) {
    const parsed = parseDecimal(draft[field], BODY_MEASUREMENT_MAX_CM, BODY_MEASUREMENT_LABELS[field], false);
    if ('error' in parsed) errors[field] = parsed.error; else values[field] = parsed.value;
  }
  const condition = draft.condition.trim(), notes = draft.notes.trim();
  if (condition.length > 2000) errors.condition = 'La condición es demasiado larga.';
  if (notes.length > 2000) errors.notes = 'Las notas son demasiado largas.';
  if (!Object.keys(errors).length && !legacyValues && BODY_MEASUREMENT_FIELDS.every(field => values[field] === null)) {
    errors.form = 'Registrá al menos una medida corporal.';
  }
  if (Object.keys(errors).length || 'error' in date) return { errors };
  return { fields: { measuredOn: date.date, ...values, condition: condition || null, notes: notes || null } };
}

/** Recorded measurement values in display order, legacy fields only when present. */
export function measurementValues(measurement: BodyMeasurement) {
  const fields = [...BODY_MEASUREMENT_FIELDS, 'armCm', 'thighCm'] as const;
  return fields.filter(field => measurement[field] !== null)
    .map(field => ({ field, label: BODY_MEASUREMENT_LABELS[field], value: formatCm(measurement[field]) }));
}
/** `short` is the one word a history row has room for; `text` the full sentence. The import source id stays internal. */
export type QualityBadge = { tone: 'warning' | 'muted'; text: string; short: string };
export function measurementBadges(measurement: BodyMeasurement): QualityBadge[] {
  const badges: QualityBadge[] = [];
  if (measurement.qualityStatus === 'suspect') badges.push({ tone: 'warning', short: 'Sospechosa', text: `Sospechosa · excluida del análisis${measurement.qualityNote ? `: ${measurement.qualityNote}` : ''}` });
  if (measurement.imported) badges.push({ tone: 'muted', short: 'Importada', text: 'Importada' });
  return badges;
}

/**
 * Pages are contiguous newest-first. Inside the loaded range a missing date is a
 * known absence; older than the oldest loaded entry (with more pages) is unknown.
 */
export function weightAt(entries: readonly BodyWeightEntry[], hasMore: boolean, date: string): { known: true; weightKg: number | null } | { known: false } {
  const found = entries.find(entry => entry.date === date);
  if (found) return { known: true, weightKg: found.weightKg };
  const oldest = entries.at(-1)?.date;
  return !hasMore || (oldest !== undefined && date > oldest) ? { known: true, weightKg: null } : { known: false };
}
export function mergeByKey<T>(current: readonly T[], next: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set(current.map(key));
  return [...current, ...next.filter(item => !seen.has(key(item)))];
}
