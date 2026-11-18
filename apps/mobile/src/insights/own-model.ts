import type { InsightsOwnView, OwnBin, OwnFactor, OwnSession, OwnSet } from '@/api/performance-insights';
import { factorLabel, factorValue, formatPct } from './comparison-change';

/**
 * «Rendimiento frente a lo tuyo» and its tramos (bocetos/rendimiento-tramos). Only words and shapes: every number is the server's
 * (view=own). A tramo without six sessions has no mean, a factor says «más/menos» only when the server called it clear, and
 * nothing here says why it happened.
 */
export type Horizon = 'day' | 'week';
const integer = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

const LABEL: Record<string, string> = {
  training_hour: 'Hora del entreno', days_since_previous: 'Días desde la anterior', sleep_week: 'Sueño promedio',
  calories_week_target: 'Kcal frente al objetivo', calories_week: 'Kcal promedio', protein_week: 'Proteína promedio', volume_week: 'Series de la semana',
};
/** The noun of «Más sueño, más rendimiento». */
const NOUN: Record<string, string> = {
  carbs_pre_3h: 'carbos antes', last_meal_hours: 'tiempo desde la última comida', calories_day: 'kcal ese día', protein_previous_day: 'proteína',
  calories_previous_day: 'kcal', sleep_night_before: 'sueño', energy_pre: 'energía', sleep_week: 'sueño', calories_week_target: 'kcal frente al objetivo',
  calories_week: 'kcal', protein_week: 'proteína', volume_week: 'series',
};
type Metrics = readonly { id: string; name: string }[];
export function ownLabel(factor: Pick<OwnFactor, 'key' | 'metricId'>, metrics: Metrics) {
  if (LABEL[factor.key]) return LABEL[factor.key]!;
  if (factor.key.startsWith('metric_week:')) return `${metrics.find(metric => metric.id === factor.metricId)?.name ?? 'Métrica'} promedio`;
  return factorLabel(factor, metrics);
}
function noun(factor: Pick<OwnFactor, 'key' | 'metricId'>, metrics: Metrics) {
  return NOUN[factor.key] ?? (metrics.find(metric => metric.id === factor.metricId)?.name ?? 'esto').toLocaleLowerCase('es-AR');
}
export const ownValue = (factor: Pick<OwnFactor, 'key' | 'unit'>, value: number) =>
  factor.key === 'volume_week' ? `${integer.format(value)} series` : factor.key === 'training_hour' ? `${integer.format(value)} h` : factor.key === 'days_since_previous' ? `${integer.format(value)} días` : factorValue(factor, value);

/** «menos de 6 h 30» · «6 h 30 a 7 h 30» · «7 h 30 o más»; a category keeps its own word. */
export function binLabel(factor: Pick<OwnFactor, 'key' | 'unit'>, bin: OwnBin) {
  if (bin.label) return bin.label;
  if (bin.from === null && bin.to !== null) return `menos de ${ownValue(factor, bin.to)}`;
  if (bin.to === null && bin.from !== null) return `${ownValue(factor, bin.from)} o más`;
  if (bin.from !== null && bin.to !== null) return `${ownValue(factor, bin.from)} a ${ownValue(factor, bin.to)}`;
  return 'todas';
}
/** A factor reads as tramos only with two or more of them, each with its mean (six sessions). */
export const ready = (factor: OwnFactor) => factor.bins.length >= 2 && factor.bins.every(bin => bin.mean !== null);
/** The short sentence of a factor: only what the server called clear; otherwise that there is no clear difference. */
export function phrase(factor: OwnFactor, metrics: Metrics): { text: string; clear: boolean } | null {
  if (!ready(factor) || factor.difference === null) return null;
  if (!factor.clear) return { text: 'Sin diferencia clara', clear: false };
  if (factor.kind === 'category') {
    const best = factor.difference > 0 ? factor.bins.at(-1)! : factor.bins[0]!;
    return { text: `${capitalize(best.label ?? '')}, más rendimiento`, clear: true };
  }
  return { text: `Más ${noun(factor, metrics)}, ${factor.difference > 0 ? 'más' : 'menos'} rendimiento`, clear: true };
}
const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase('es-AR') + text.slice(1);

/** The factors of one horizon: ready ones in their fixed order, then the ones still waiting. */
export function factorsOf(model: InsightsOwnView, horizon: Horizon) {
  const list = model.factors[horizon];
  return { ready: list.filter(ready), waiting: list.filter(factor => !ready(factor)) };
}
export const measured = (model: InsightsOwnView) => model.sessions.filter(session => session.pct !== null).length;

/** «60 kg × 10» · «12 reps». */
export const setText = (set: OwnSet) => set.load === null ? `${integer.format(set.reps)} reps` : `${decimal.format(set.load)} kg × ${integer.format(set.reps)}`;
/** One exercise of the session: today and «lo tuyo», or why it has none yet. */
export function exerciseLine(exercise: OwnSession['exercises'][number]) {
  if (!exercise.base) return `${setText(exercise.today)} · lo tuyo se arma con 3 veces (van ${exercise.bases})`;
  if (exercise.pct === 0) return `${setText(exercise.today)} · igual que lo tuyo`;
  return `${setText(exercise.today)} · lo tuyo: ${setText(exercise.base)}`;
}
export const ownSpoken = (pct: number) => pct === 0 ? 'igual a lo tuyo' : `${formatPct(pct).replace('−', 'menos ').replace('+', 'más ')} frente a lo tuyo`;

/** Why sessions with a measure have no value for a factor, as rows of the table. */
export const MISSING_TEXT: Record<string, string> = {
  no_registered_meal: 'Sin comidas con hora en esas 3 h', untimed_meal_in_scope: 'Comidas sin hora', unverified_meal_time_in_scope: 'Comidas con hora aproximada',
  no_start_time: 'Sesión sin hora de inicio', partial_macro: 'Una comida sin ese dato', no_explicit_meal_in_12h: 'Sin comidas con hora en las 12 h previas',
  no_meals: 'Sin comidas ese día', partial_sum: 'Una comida sin ese dato', not_recorded: 'Sin registrar', night_undeclared: 'Sin la noche declarada',
  night_declaration_outdated: 'Editado sin volver a declarar la noche', unavailable: 'No disponible', late: 'Respondida tarde', unknown_time: 'Sin saber cuándo se respondió',
  other_instrument: 'Con otra escala', unreadable: 'No se pudo leer', few_days: 'Menos de 4 días con dato esa semana', first_of_routine: 'Primera sesión de la rutina',
};
