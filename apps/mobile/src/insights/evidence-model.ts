import type { EvidenceSide, ExerciseEvidence, InsightsExerciseEvidence } from '@/api/performance-insights';
import { formatValue } from '@/progress/progress-format';
import { dayLabel, reasonText, type Lane } from './insights-model';
import { validSession } from './navigation';

/** The comparison Insights showed, as it travels in the route: every value is checked, nothing is read as an address. */
export type EvidenceSelection = { session: string; exercise: string; lane: Lane; reference: string | null; result: string; revision: string };
const RESULTS: Record<Lane, string[]> = {
  strict: ['improved', 'observed_stable', 'declined', 'ambiguous_evidence', 'insufficient_comparison'],
  partial: ['higher_record', 'same_record', 'lower_record', 'ambiguous_evidence', 'insufficient_comparison'],
};
export function evidenceSelectionOf(params: Record<string, unknown>): EvidenceSelection | null {
  const { session, exercise, lane, reference, result, revision } = params;
  if (!validSession(session) || !validSession(exercise) || (lane !== 'strict' && lane !== 'partial')) return null;
  if (reference !== 'none' && !validSession(reference)) return null;
  if (typeof result !== 'string' || !RESULTS[lane].includes(result) || typeof revision !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(revision)) return null;
  return { session: session.toLowerCase(), exercise: exercise.toLowerCase(), lane, reference: reference === 'none' ? null : reference.toLowerCase(), result, revision };
}

export const resultOf = (item: ExerciseEvidence) => 'status' in item ? item.status : item.reading;
/**
 * Whether this answer is still the comparison Insights showed. Another read of the same exercise, with the same reference and
 * result, is shown with a notice; another reference or result is never put in place of the one the person tapped.
 */
export function evidenceMatch(data: InsightsExerciseEvidence, selection: EvidenceSelection): 'same' | 'newer' | 'changed' {
  const item = data.item;
  if (!item || data.lane !== selection.lane || (item.reference?.sessionId.toLowerCase() ?? null) !== selection.reference || resultOf(item) !== selection.result) return 'changed';
  return data.sourceRevision === selection.revision ? 'same' : 'newer';
}

type Unit = NonNullable<ExerciseEvidence['context']>['unit'] | undefined;
const number = (value: number | null, unit: string | null = null) => value === null ? 'sin dato' : formatValue(value, unit);
const loadUnit = (unit: Unit) => unit === 'lingotes' ? 'lingotes' : unit === 'kg' ? 'kg' : null;
/** A set in the field and unit it was recorded in. A missing value says so: it is never a zero. */
export function setText(set: EvidenceSide['sets'][number], unit: Unit) {
  if (unit === 'seconds') return number(set.amount, 's');
  if (unit === 'reps') return `${number(set.amount)} reps`;
  return `${number(set.load, loadUnit(unit))} × ${number(set.amount)}`;
}
const amountUnit = (unit: Unit) => unit === 'seconds' ? 's' : 'reps';
const arrow = (delta: number) => delta > 0 ? '↑' : delta < 0 ? '↓' : '=';

/** One signal: the same anchor on both sides, compared in its own unit. Never a percentage, a sum or an estimated maximum. */
export function signalRow(signal: ExerciseEvidence['evidence'][number], unit: Unit) {
  const [label, field] = signal.kind === 'reps_at_load' ? [`Con ${number(signal.anchor, loadUnit(unit))}`, amountUnit(unit)]
    : signal.kind === 'load_at_reps' ? [`A ${number(signal.anchor)} reps`, loadUnit(unit)]
    : signal.kind === 'time' ? ['Tiempo', 's'] : ['Repeticiones', 'reps'];
  const value = `${number(signal.reference)} → ${number(signal.current, field)}`;
  return { key: `${signal.kind}:${signal.anchor ?? ''}`, arrow: arrow(signal.delta), label, value, spoken: `${label}: ${number(signal.reference)} antes, ${number(signal.current, field)} ahora` };
}
/** Why there is no signal, or why the signals do not add up to a result. */
export function evidenceNote(item: ExerciseEvidence, lane: Lane) {
  if (item.reason === 'crossed_signals') return 'Subió por un lado y bajó por otro, así que queda mezclado.';
  if (item.reason === 'unanchored_evidence') return `${item.evidence.length ? 'Algunas series no tienen' : 'No hay'} una carga ni unas repeticiones en común con la referencia. Más carga con menos repeticiones, o al revés, no alcanza para decir que mejoró.`;
  if (!item.reference) return reasonText(lane, item.reason);
  return item.evidence.length ? null : reasonText(lane, item.reason);
}

const RECORD: Record<string, (anchor: number | null, unit: Unit) => string> = {
  load: (_anchor, unit) => `Carga más alta (${loadUnit(unit) ?? 'carga'})`, reps_at_load: (anchor, unit) => `Más reps con ${number(anchor, loadUnit(unit))}`,
  bodyweight_reps: () => 'Más repeticiones', time: () => 'Más tiempo',
};
/** Highest values in this context's history, apart from the result: a new high is not an improvement over the reference. */
export function recordRows(item: ExerciseEvidence, lane: Lane) {
  const unit = item.context?.unit;
  return item.records.filter(fact => fact.isNewHigh).map(fact => {
    const label = (RECORD[fact.kind] ?? (() => 'Récord'))(fact.anchor, unit);
    const field = fact.kind === 'load' ? loadUnit(unit) : fact.kind === 'time' ? 's' : 'reps';
    const value = `${number(fact.previousMaximum)} → ${number(fact.current, field)}`;
    return { key: `${fact.kind}:${fact.anchor ?? ''}`, label, value, spoken: `${label}${lane === 'partial' ? ' con contexto parcial' : ''}: antes ${number(fact.previousMaximum)}, ahora ${number(fact.current, field)}` };
  });
}

const UNIT_WORD: Record<string, string> = { kg: 'Kilos', lingotes: 'Lingotes (no kg)', reps: 'Peso corporal', seconds: 'Tiempo (segundos)' };
export function contextRows(item: ExerciseEvidence) {
  const context = item.context;
  if (!context) return [{ key: 'none', label: 'Contexto', value: 'Sin registrar' }];
  const configuration = context.configuration === null ? 'Sin registrar' : context.configuration === 'not_applicable' ? 'No aplica' : context.configuration.replace(/^recorded:/, '');
  return [
    { key: 'mode', label: 'Modo', value: context.weightMode ?? (context.unit ? UNIT_WORD[context.unit]! : 'Sin registrar') },
    { key: 'implement', label: 'Implemento', value: context.implement ?? 'Sin registrar' },
    { key: 'configuration', label: 'Configuración', value: configuration },
  ];
}

/** Which sets of a side a signal used, and which ones the comparator left out: every set stays listed. */
export function sideRows(side: EvidenceSide, item: ExerciseEvidence, which: 'current' | 'reference') {
  const used = new Set(item.evidence.flatMap(signal => which === 'current' ? signal.currentSetIds : signal.referenceSetIds));
  const excluded = new Set(side.excludedSetIds), unit = item.context?.unit;
  return side.sets.map((set, index) => {
    const note = excluded.has(set.id) ? 'No se cuenta' : !set.completed ? 'Sin completar' : used.has(set.id) ? 'En la comparación' : undefined;
    return { key: set.id, label: `Serie ${index + 1}`, value: setText(set, unit), detail: note, spoken: `Serie ${index + 1}: ${setText(set, unit)}${note ? `. ${note}` : ''}` };
  });
}
export const sideTitle = (side: EvidenceSide, which: 'current' | 'reference') => `${which === 'current' ? 'Esta sesión' : 'Sesión de referencia'}${side.date ? ` · ${dayLabel(side.date)}` : ''}`;
