import type { ExploreBreakdown, ExploreDays, ExploreRequest, ProgressBody, ProgressExplore, ProgressMetrics, ProgressTraining } from '@/api/progress';
import { normalizeWeightMode, weightModeStrategy } from '../../../../src/lib/mobile-api/weight-modes';

export const BREAKDOWN_LABELS: Record<ExploreBreakdown, string> = {
  routine: 'Rutina', muscle: 'Músculo', exercise: 'Ejercicio', weekday: 'Día de la semana', meal_moment: 'Momento de la comida', time_band: 'Franja horaria',
};
export const DAYS_LABELS: Record<ExploreDays, string> = { training: 'Con entrenamiento', rest: 'Sin entrenamiento', work: 'De trabajo', off: 'Sin trabajo' };

export type ExploreChoice = { key: string; label: string; detail: string };
export type ExploreGroupOfChoices = { title: string; choices: ExploreChoice[] };

/** Fixed measures; metrics, body measures and exercises come from the user's own reads. */
export const STATIC_MEASURES: ExploreGroupOfChoices[] = [
  { title: 'Entrenamiento', choices: [
    { key: 'training.sets', label: 'Series', detail: 'por rutina, músculo, ejercicio o día' },
    { key: 'training.sessions', label: 'Sesiones', detail: 'por rutina, músculo, ejercicio o día' },
    { key: 'training.minutes', label: 'Duración', detail: 'min · incluye descansos' },
  ] },
  { title: 'Nutrición', choices: [
    { key: 'nutrition.kcal', label: 'Calorías', detail: 'kcal · por momento, franja o día' },
    { key: 'nutrition.protein', label: 'Proteína', detail: 'g · por momento, franja o día' },
    { key: 'nutrition.carbs', label: 'Carbohidratos', detail: 'g · por momento, franja o día' },
    { key: 'nutrition.fat', label: 'Grasas', detail: 'g · por momento, franja o día' },
  ] },
];

export function metricChoices(data: ProgressMetrics): ExploreChoice[] {
  return data.definitions.map(d => ({ key: `metric.${d.id}`, label: `${d.name}${d.isActive ? '' : ' · archivada'}`, detail: `${d.unit ?? 'sin unidad'} · promedio por día con dato` }));
}
export function bodyChoices(data: ProgressBody): ExploreChoice[] {
  return data.metrics.map(m => ({ key: m.key, label: m.label, detail: `${m.unit} · un punto por registro` }));
}
/** Exercises trained in the period; the estimated 1RM only where the weight mode is in kg. */
export function exerciseChoices(data: ProgressTraining): ExploreChoice[] {
  return data.exercises.filter(e => e.sessions > 0).sort((a, b) => a.name.localeCompare(b.name, 'es-AR')).flatMap(e => [
    { key: `exercise.${e.id}.best`, label: `${e.name} · mejor serie`, detail: `${e.sessions} ${e.sessions === 1 ? 'sesión' : 'sesiones'}` },
    ...(weightModeStrategy(normalizeWeightMode(e.weightMode)) === 'load_reps' ? [{ key: `exercise.${e.id}.e1rm`, label: `${e.name} · 1RM estimado`, detail: 'kg · estimado con Epley (1 a 12 reps)' }] : []),
  ]);
}

/** Ready-made starting points (S2), all with fixed measures. */
export const IDEAS: { icon: 'dumbbell' | 'calendar' | 'nutrition' | 'clock'; title: string; detail: string; request: ExploreRequest; label: string }[] = [
  { icon: 'dumbbell', title: 'Series por músculo', detail: 'Qué grupos trabajaste más, semana a semana', label: 'Series', request: { measure: 'training.sets', breakdown: 'muscle', days: null, series: true } },
  { icon: 'calendar', title: 'Calorías por día de la semana', detail: 'Cómo cambian de lunes a domingo', label: 'Calorías', request: { measure: 'nutrition.kcal', breakdown: 'weekday', days: null, series: false } },
  { icon: 'nutrition', title: 'Proteína por momento', detail: 'Desayuno, almuerzo, merienda, cena y extras', label: 'Proteína', request: { measure: 'nutrition.protein', breakdown: 'meal_moment', days: null, series: false } },
  { icon: 'clock', title: 'Duración por rutina', detail: 'Cuánto tiempo le dedicaste a cada una', label: 'Duración', request: { measure: 'training.minutes', breakdown: 'routine', days: null, series: false } },
];

/** What the big number means. */
export function aggregationText(e: ProgressExplore): string {
  const a = e.measure.aggregation;
  return a === 'sum' ? 'en el período' : a === 'average' ? 'promedio por día con dato' : a === 'latest' ? 'último registro' : 'mejor sesión del período';
}
/** Coverage in words: days that counted out of the eligible ones. */
export function coverageLine(e: ProgressExplore, c: { days: number; eligible: number }): string {
  const a = e.measure.aggregation;
  if (a === 'sum') return `Entrenaste ${c.days} de ${c.eligible} días`;
  if (a === 'average') return `${c.days} de ${c.eligible} días con dato`;
  return `${c.days} ${a === 'latest' ? (c.days === 1 ? 'registro' : 'registros') : (c.days === 1 ? 'sesión' : 'sesiones')}`;
}
