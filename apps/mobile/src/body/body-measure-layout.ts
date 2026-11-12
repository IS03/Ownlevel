import { BODY_MEASUREMENT_FIELDS, type BodyMeasurement, type BodyMeasurementField } from '@/api/body';
import { parseInputNutritionDate } from '@/nutrition/day-format';
import { formatBodyDate, formatCm } from './body-model';

// Pure presentation + derivation for the guided measurement editor (#470). It only reads what the controller
// already loaded (`state.read.measurements`); no I/O, no mutation, nothing is ever pre-filled or persisted.

export type MeasureKey = 'waist' | 'abdomen' | 'chest' | 'hip' | 'arm' | 'thigh' | 'calf';
export type RegionKey = 'trunk' | 'arms' | 'legs';
export type Measure = { key: MeasureKey; label: string; region: RegionKey; fields: readonly BodyMeasurementField[] };
export type Region = { key: RegionKey; label: string };

/** Canonical order: concatenating `fields` gives exactly BODY_MEASUREMENT_FIELDS. Each side stays an independent field. */
export const MEASURES: readonly Measure[] = [
  { key: 'waist', label: 'Cintura', region: 'trunk', fields: ['waistCm'] },
  { key: 'abdomen', label: 'Abdomen', region: 'trunk', fields: ['abdomenCm'] },
  { key: 'chest', label: 'Pecho', region: 'trunk', fields: ['chestCm'] },
  { key: 'hip', label: 'Cadera', region: 'trunk', fields: ['hipCm'] },
  { key: 'arm', label: 'Brazo', region: 'arms', fields: ['armRightCm', 'armLeftCm'] },
  { key: 'thigh', label: 'Muslo', region: 'legs', fields: ['thighRightCm', 'thighLeftCm'] },
  { key: 'calf', label: 'Pantorrilla', region: 'legs', fields: ['calfRightCm', 'calfLeftCm'] },
];
export const REGIONS: readonly Region[] = [
  { key: 'trunk', label: 'Tronco' },
  { key: 'arms', label: 'Brazos' },
  { key: 'legs', label: 'Piernas' },
];

export type MeasureReference = { value: number; date: string };
/** Why there is no habitual list: nothing is ever guessed. `invalid_date` also covers an empty or future date. */
export type HabitReason = 'first_use' | 'insufficient' | 'incomplete' | 'none_recurring' | 'invalid_date';
export type MeasurementLayout = {
  habitual: BodyMeasurementField[];
  references: Partial<Record<BodyMeasurementField, MeasureReference>>;
  /** null when habits exist or when the mode never shows them (edit). */
  reason: HabitReason | null;
};
export type MeasurementLayoutInput = {
  /** state.read.measurements: a contiguous newest-first prefix of the user's measurements. */
  history: readonly BodyMeasurement[];
  /** state.read.measurementsCursor !== null: older pages exist that are NOT loaded. */
  hasMore: boolean;
  /** The draft's date as DD/MM/AAAA (as typed) or already YYYY-MM-DD. Invalid, empty or future → nothing. */
  selectedDate: string;
  /** Edit mode: the record being edited never feeds its own references. */
  editedId?: string | null;
  mode: 'create' | 'edit';
  /** The server's "today" (YYYY-MM-DD); a later selected date yields nothing. */
  today?: string;
};

const HABIT_WINDOW = 4;
const HABIT_MIN_ROWS = 3;
const HABIT_SHARE_NUM = 3, HABIT_SHARE_DEN = 4; // a field is habitual when present in at least 75 % of the window rows

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** Accepts the draft format (DD/MM/AAAA) or ISO; anything else is undefined. */
export function selectedIsoDate(text: string): string | undefined {
  const raw = text.trim();
  if (ISO.test(raw)) return parseInputNutritionDate(raw.split('-').reverse().join('/'));
  return parseInputNutritionDate(raw);
}

const EMPTY = (reason: HabitReason | null): MeasurementLayout => ({ habitual: [], references: {}, reason });
const byNewest = (a: BodyMeasurement, b: BodyMeasurement) => (a.measuredOn < b.measuredOn ? 1 : a.measuredOn > b.measuredOn ? -1 : 0);

export function buildMeasurementLayout({ history, hasMore, selectedDate, editedId = null, mode, today }: MeasurementLayoutInput): MeasurementLayout {
  const date = selectedIsoDate(selectedDate);
  if (!date || (today && date > today)) return EMPTY(mode === 'create' ? 'invalid_date' : null);
  const reason = (r: HabitReason) => (mode === 'create' ? r : null);

  // The edited record may sit outside the contiguous prefix (server truth is appended), so it never decides completeness.
  const rows = history.filter(m => m.id !== editedId);
  const oldest = rows.reduce<string | undefined>((min, m) => (min === undefined || m.measuredOn < min ? m.measuredOn : min), undefined);
  // Older pages exist and the selected date reaches into them (or beyond the oldest loaded row): what came before is unknown.
  if (hasMore && (oldest === undefined || date <= oldest)) return EMPTY(reason('incomplete'));

  // Only verified rows strictly before the selected date: suspect rows never count, same day or later never counts.
  const eligible = rows.filter(m => m.qualityStatus === 'verified' && m.measuredOn < date).sort(byNewest);

  const references: MeasurementLayout['references'] = {};
  for (const field of BODY_MEASUREMENT_FIELDS) {
    const row = eligible.find(m => m[field] !== null); // each value belongs to its own field; legacy armCm/thighCm are never used
    if (row) references[field] = { value: row[field] as number, date: row.measuredOn };
  }
  if (mode === 'edit') return { habitual: [], references, reason: null };

  // Habits: the latest verified, NOT imported rows.
  const recent = eligible.filter(m => !m.imported).slice(0, HABIT_WINDOW);
  if (recent.length < HABIT_WINDOW && hasMore) return { habitual: [], references, reason: 'incomplete' };
  if (recent.length < HABIT_MIN_ROWS) return { habitual: [], references, reason: history.length === 0 && !hasMore ? 'first_use' : 'insufficient' };
  const needed = Math.ceil((recent.length * HABIT_SHARE_NUM) / HABIT_SHARE_DEN);
  const habitual = BODY_MEASUREMENT_FIELDS.filter(field => recent.filter(m => m[field] !== null).length >= needed);
  return { habitual, references, reason: habitual.length ? null : 'none_recurring' };
}

/** "Anterior: 82 cm · 3 oct 2026" */
export const referenceText = (reference: MeasureReference) => `Anterior: ${formatCm(reference.value)} · ${formatBodyDate(reference.date)}`;

export type PlannedMeasure = { measure: Measure; fields: BodyMeasurementField[] };
export type PlannedRegion = { region: Region; measures: PlannedMeasure[] };
const groupByMeasure = (fields: readonly BodyMeasurementField[]): PlannedMeasure[] =>
  MEASURES.map(measure => ({ measure, fields: measure.fields.filter(f => fields.includes(f)) })).filter(m => m.fields.length);

/** The "habitual" section: the habitual fields grouped by measure, canonical order. */
export const habitualPlan = (habitual: readonly BodyMeasurementField[]): PlannedMeasure[] => groupByMeasure(habitual);

/**
 * Regions with the fields NOT already shown as habitual (nothing renders twice). A bilateral pair may be split across the
 * habitual section and its region; each side stays independent and no value is ever copied between sides.
 */
export function regionPlan(habitual: readonly BodyMeasurementField[]): PlannedRegion[] {
  return REGIONS.map(region => ({
    region,
    measures: MEASURES.filter(m => m.region === region.key)
      .map(measure => ({ measure, fields: measure.fields.filter(f => !habitual.includes(f)) })).filter(m => m.fields.length),
  })).filter(r => r.measures.length);
}
