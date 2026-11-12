import type { ProgressBody, ProgressBodyMetric, ProgressTrainingExercise, ProgressTrainingRecords } from '@/api/progress';
import { formatValue } from '@/progress/progress-format';

import { addIsoDays, formatInteger } from './format';
import type { HomeResource } from './home-resource';

/**
 * Home > Progreso: which notes show, and in what order. Pure and deterministic: the same inputs give the same rows,
 * nothing reads the clock, nothing is random, nothing is fetched. It only looks at the two reads Home already
 * loads (`progressBody` 7 d, `progressRecords` 30 d), so the section changes when that data or the date changes,
 * never while the user reads.
 *
 * Ranking (also in the PR):
 *  1. Freshness: a read only supplies a note when its `today` is Home's `date`; a previous day's rolling period never
 *     passes as today's. Loading -> skeleton; unavailable without current data -> "No pudimos cargarlo." + Reintentar;
 *     unavailable WITH current-day data -> the note + "Sin actualizar · Reintentar" (stale).
 *  2. Two primary rows are always present (stable layout): `records` and `weight`.
 *  3. Their order follows the recency of their evidence (`evidenceDate`): the strictly more recent goes first. Ties,
 *     a missing evidenceDate on either side or a row that is not `ready` keep records first.
 *  4. An optional third row `measure`: the most recently recorded non-weight body measurement (cm) of the same body
 *     read, inside the last 30 days. Ties follow the order of `body.metrics`. No trend, no change. Omitted when the
 *     body read is not `ready` with current-day data (loading, unavailable, stale) or nothing is eligible.
 *  5. At most 3 rows; a row never appears twice.
 */

export type HomeProgressTarget = { kind: 'body'; period: '7'; metric?: string } | { kind: 'training'; period: '7' | '30' }
  | { kind: 'exercise'; period: '30'; exerciseId: string };

export type RowSummary = { title: string; subtitle: string; value?: string; target: HomeProgressTarget };

export type ProgressRowState = 'ready' | 'stale' | 'loading' | 'unavailable';
export type ProgressRowIcon = 'trophy' | 'scale' | 'ruler';
export type ProgressRowModel = {
  id: 'records' | 'weight' | 'measure';
  icon: ProgressRowIcon;
  /** The note's title, or the fixed label ("Récords", "Peso") while loading / unavailable. */
  title: string;
  /** Empty while loading / unavailable. */
  subtitle: string;
  value?: string;
  target: HomeProgressTarget;
  state: ProgressRowState;
  /** Day of the observation behind the note (ordering only, never shown); null when there is none. */
  evidenceDate: string | null;
};

/** The measure row reaches back as far as the Records row does. */
export const MEASURE_WINDOW_DAYS = 30;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const BODY_METRIC_KEY = /^body\.[a-z_]+$/u;
const BODY_TARGET = { kind: 'body', period: '7' } as const;

const shortDate = (date: string) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  .format(new Date(`${date}T12:00:00Z`)).replace('.', '');

const lastRecorded = (date: string, today: string) => date === today ? 'Último registro: hoy' : `Último registro: ${shortDate(date)}`;

/** Last weight and when it was logged (the value only lives here, not in Registrar). */
export function weightSummary(data: ProgressBody): RowSummary {
  const latest = data.metrics.find(metric => metric.key === 'body.weight')?.latest;
  if (!latest) return { title: 'Peso', subtitle: data.excludedSuspect > 0 ? 'Revisá tus registros en Cuerpo' : 'Sin registros', target: BODY_TARGET };
  return { title: 'Peso', value: formatValue(latest.value, 'kg'), target: BODY_TARGET, subtitle: lastRecorded(latest.date, data.today) };
}

function exerciseChange(exercise: ProgressTrainingExercise): string {
  return `${exercise.status === 'improved' ? '↑' : '↓'} ${exercise.name} · ${exercise.signal!.description}`;
}

/** Without a PR: the exercise with a real, comparable signal, the most recently trained first. */
function performanceChange(data: ProgressTrainingRecords): ProgressTrainingExercise | undefined {
  return data.exercises.filter(exercise => exercise.signal && (exercise.status === 'improved' || exercise.status === 'declined'))
    .sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? ''))[0];
}

/** Records of the last 30 days; without records, M7's mode-aware assessment (never a fake PR). */
export function recordsSummary(data: ProgressTrainingRecords): RowSummary {
  const records = data.personalRecords;
  if (records.length) {
    const names = records.slice(0, 2).map(record => record.name).join(', ');
    return {
      title: records.length === 1 ? '1 récord en 30 días' : `${formatInteger(records.length)} récords en 30 días`,
      subtitle: records.length > 2 ? `${names} y ${formatInteger(records.length - 2)} más` : names,
      target: records.length === 1 ? { kind: 'exercise', period: '30', exerciseId: records[0].exerciseId } : { kind: 'training', period: '30' },
    };
  }
  const change = performanceChange(data);
  if (change) return { title: 'Rendimiento en 30 días', subtitle: exerciseChange(change), target: { kind: 'exercise', period: '30', exerciseId: change.id } };
  return {
    title: 'Sin récords en 30 días', target: { kind: 'training', period: '30' },
    subtitle: data.performance.comparable > 0 ? 'Seguí sumando entrenamientos' : 'Faltan entrenamientos comparables',
  };
}

/** A usable day: well-formed and not after Home's today. Anything else is "no evidence", never a guess. */
const evidence = (value: string | null | undefined, today: string): string | null => value && ISO_DATE.test(value) && value <= today ? value : null;

/**
 * Last day the exercises behind the shown records note were trained (a PR happened on or before it): the PR exercises,
 * or the exercise of the performance change. Null when the note has no exercise behind it.
 */
function recordsEvidence(data: ProgressTrainingRecords, today: string): string | null {
  const ids = new Set(data.personalRecords.map(record => record.exerciseId));
  const change = performanceChange(data);
  const backing = data.personalRecords.length ? data.exercises.filter(exercise => ids.has(exercise.id)) : change ? [change] : [];
  const dates = backing.map(exercise => evidence(exercise.lastDate, today)).filter((value): value is string => value !== null);
  return dates.length ? dates.reduce((a, b) => b > a ? b : a) : null;
}

/** Today's snapshot only: a previous day's rolling period never passes as today's. */
function current<T extends { today: string }>(resource: HomeResource<T>, date: string): T | undefined {
  return resource.data?.today === date ? resource.data : undefined;
}

type Primary<T> = { id: 'records' | 'weight'; icon: 'trophy' | 'scale'; label: string; fallback: HomeProgressTarget; summarize: (data: T) => RowSummary; evidenceOf: (data: T, date: string) => string | null };

function primaryRow<T extends { today: string }>(resource: HomeResource<T>, date: string, spec: Primary<T>): ProgressRowModel {
  const { id, icon, label, fallback } = spec;
  const data = current(resource, date);
  if (!data) {
    // A first read, or a ready read of another day that the next refresh replaces, is still loading; a failure is unavailable.
    const waiting = resource.status === 'loading' || (resource.status === 'ready' && !!resource.data);
    return { id, icon, title: label, subtitle: '', target: fallback, state: waiting ? 'loading' : 'unavailable', evidenceDate: null };
  }
  const summary = spec.summarize(data);
  return { id, icon, ...summary, state: resource.status === 'unavailable' ? 'stale' : 'ready', evidenceDate: spec.evidenceOf(data, date) };
}

const RECORDS: Primary<ProgressTrainingRecords> = { id: 'records', icon: 'trophy', label: 'Récords', fallback: { kind: 'training', period: '30' }, summarize: recordsSummary, evidenceOf: (data, date) => recordsEvidence(data, date) };
const WEIGHT: Primary<ProgressBody> = {
  id: 'weight', icon: 'scale', label: 'Peso', fallback: BODY_TARGET, summarize: weightSummary,
  evidenceOf: (data, date) => evidence(data.metrics.find(metric => metric.key === 'body.weight')?.latest?.date, date),
};

function eligibleMeasure(metric: ProgressBodyMetric, date: string, oldest: string): ProgressBodyMetric['latest'] {
  const latest = metric.latest;
  // The server already leaves suspect measurements out of `latest` and of `metrics`, so none can reach here.
  if (metric.key === 'body.weight' || metric.unit !== 'cm' || !BODY_METRIC_KEY.test(metric.key) || !latest) return null;
  if (!Number.isFinite(latest.value) || latest.value <= 0) return null;
  const day = evidence(latest.date, date);
  return day !== null && day >= oldest ? latest : null;
}

function measureRow(body: HomeResource<ProgressBody>, date: string): ProgressRowModel | null {
  const data = current(body, date);
  if (!data || body.status !== 'ready') return null;
  const oldest = addIsoDays(date, -MEASURE_WINDOW_DAYS);
  let best: { metric: ProgressBodyMetric; latest: NonNullable<ProgressBodyMetric['latest']> } | null = null;
  for (const metric of data.metrics) {
    const latest = eligibleMeasure(metric, date, oldest);
    // Strictly newer wins: ties keep the earlier metric in the server's fixed order.
    if (latest && (!best || latest.date > best.latest.date)) best = { metric, latest };
  }
  if (!best) return null;
  return {
    id: 'measure', icon: 'ruler', title: best.metric.label, value: formatValue(best.latest.value, 'cm'), subtitle: lastRecorded(best.latest.date, data.today),
    target: { kind: 'body', period: '7', metric: best.metric.key }, state: 'ready', evidenceDate: best.latest.date,
  };
}

export function selectProgressRows({ body, date, records }: {
  body: HomeResource<ProgressBody>; date: string; records: HomeResource<ProgressTrainingRecords>;
}): ProgressRowModel[] {
  const recordsRow = primaryRow(records, date, RECORDS), weightRow = primaryRow(body, date, WEIGHT);
  const weightFirst = recordsRow.state === 'ready' && weightRow.state === 'ready'
    && recordsRow.evidenceDate !== null && weightRow.evidenceDate !== null && weightRow.evidenceDate > recordsRow.evidenceDate;
  const rows = weightFirst ? [weightRow, recordsRow] : [recordsRow, weightRow];
  const measure = measureRow(body, date);
  return measure ? [...rows, measure] : rows;
}
