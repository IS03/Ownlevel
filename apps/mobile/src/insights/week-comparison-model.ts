import type { PeriodExploration } from '@/api/performance-insights';
import { mondayOf } from '../../../../src/lib/progress/body-evolution/weekly';
import { formatValue } from '@/progress/progress-format';
import { PERIOD_NUTRIENTS } from './period-nutrition-model';
import { postsText } from './feelings-model';

export type ExplorationWeek = PeriodExploration['weeks'][number];
export type Nutrient = typeof PERIOD_NUTRIENTS[number][0];
export type WeekSide = 'A' | 'B';

/** Calendar only, never chosen by a result. Explicit invalid selections stay invalid. */
export function selectedWeeks(data: PeriodExploration, week: string | undefined, a?: string, b?: string) {
  const current = week ? data.weeks.findIndex(w => w.start === week) : data.weeks.length - 1;
  if (a === undefined && b === undefined) {
    if (current < 0 || data.weeks.length < 2) return null;
    return current === 0 ? { a: 0, b: 1 } : { a: current - 1, b: current };
  }
  const left = data.weeks.findIndex(w => w.start === a), right = data.weeks.findIndex(w => w.start === b);
  return left < 0 || right < 0 || left === right ? null : { a: left, b: right };
}
export function nextWeekIndex(size: number, current: number, other: number, direction: -1 | 1) {
  let next = current + direction;
  if (next === other) next += direction;
  return next >= 0 && next < size ? next : null;
}

/** See the delivery contract: known sum / days with at least one known record, independent per nutrient. */
export function weeklyNutrient(week: ExplorationWeek, key: Nutrient) {
  let total = 0, complete = 0, partial = 0, unknown = 0, unrecorded = 0, records = 0, missing = 0;
  for (const day of week.days) {
    const n = day.nutrition;
    if (!n) { unrecorded++; continue; }
    const known = n.activeMeals - n[key].missing;
    records += known; missing += n[key].missing;
    if (!known) unknown++;
    else { total += n[key].recorded; if (n[key].missing) partial++; else complete++; }
  }
  const knownDays = complete + partial;
  return { total: knownDays ? total : null, mean: knownDays ? total / knownDays : null, knownDays, days: week.days.length,
    complete, partial, unknown, unrecorded, records, missing };
}
export const nutrientCoverage = (n: ReturnType<typeof weeklyNutrient>) =>
  `${n.knownDays} de ${n.days} días con dato: ${n.complete} completos, ${n.partial} parciales, ${n.unknown} sin dato; ${n.unrecorded} sin comidas. ${n.records} registros con dato, ${n.missing} sin este nutriente.`;
export function differentCoverage(a: ReturnType<typeof weeklyNutrient>, b: ReturnType<typeof weeklyNutrient>) {
  return (['days', 'complete', 'partial', 'unknown', 'unrecorded', 'records', 'missing'] as const).some(k => a[k] !== b[k]);
}
export function weeklyTraining(week: ExplorationWeek) {
  return { sessions: week.days.reduce((n, d) => n + (d.training?.sessions ?? 0), 0), days: week.days.filter(d => d.training?.sessions).length };
}
export function weeklyResults(week: ExplorationWeek, lane: 'strict' | 'partial') {
  const sum = (key: string) => week.days.reduce((n, d) => n + Number(((lane === 'strict' ? d.training?.counts : d.partial?.counts) as unknown as Record<string, number> | undefined)?.[key] ?? 0), 0);
  return { total: sum('total'), comparable: sum('comparable'), up: sum(lane === 'strict' ? 'improved' : 'higher'),
    same: sum(lane === 'strict' ? 'observedStable' : 'same'), down: sum(lane === 'strict' ? 'declined' : 'lower'), ambiguous: sum('ambiguous'), insufficient: sum('insufficient') };
}
export function weightComparison(a: ExplorationWeek, b: ExplorationWeek) {
  const median = (w: ExplorationWeek) => w.wholeWeek ? w.weight?.median ?? null : null;
  const left = median(a), right = median(b);
  return { a: left, b: right, difference: left === null || right === null ? null : right - left,
    weeksApart: Math.abs(Date.parse(`${mondayOf(b.start)}T12:00:00Z`) - Date.parse(`${mondayOf(a.start)}T12:00:00Z`)) / 604_800_000 };
}
export function postValues(week: ExplorationWeek, kind: 'energy' | 'fatigue') {
  const feeling = week.feelings.find(f => f.kind === kind)!;
  const values = [...feeling.priorNotComparable.posts];
  for (const row of feeling.byPrior) row.posts.forEach((n, i) => { values[i]! += n; });
  return { feeling, values };
}

/** Independent sentences about displayed facts, never a relationship between domains. */
export function weekComparisonSummary(a: ExplorationWeek, b: ExplorationWeek) {
  const ta = weeklyTraining(a), tb = weeklyTraining(b), na = weeklyNutrient(a, 'calories'), nb = weeklyNutrient(b, 'calories'), weight = weightComparison(a, b);
  const lines = [
    `Sesiones registradas: A ${ta.sessions} en ${ta.days} días; B ${tb.sessions} en ${tb.days} días.`,
    `Calorías registradas por día con dato: A ${formatValue(na.mean, 'kcal')} (${na.knownDays}/${na.days} días); B ${formatValue(nb.mean, 'kcal')} (${nb.knownDays}/${nb.days} días).`,
  ];
  if (PERIOD_NUTRIENTS.some(([key]) => differentCoverage(weeklyNutrient(a, key), weeklyNutrient(b, key)))) lines.push('La cobertura de alimentación difiere entre A y B; las cantidades no prueban que comiste más o menos. Consultá los completos, parciales y faltantes de cada nutriente.');
  lines.push(weight.difference === null ? 'No se calcula una diferencia de peso: falta al menos una mediana semanal elegible.'
    : `Medianas de peso corporal: A ${formatValue(weight.a, 'kg')}; B ${formatValue(weight.b, 'kg')}. Diferencia B − A: ${formatValue(weight.difference, 'kg')}; separación de ${weight.weeksApart} semanas de calendario.`);
  for (const kind of ['energy', 'fatigue'] as const) {
    const x = postValues(a, kind), y = postValues(b, kind);
    lines.push(`${kind === 'energy' ? 'Energía' : 'Fatiga'} al terminar: A ${postsText(kind, x.values) || 'sin respuestas elegibles'} (${x.feeling.capture.atFinish}/${x.feeling.sessions.completed} sesiones); B ${postsText(kind, y.values) || 'sin respuestas elegibles'} (${y.feeling.capture.atFinish}/${y.feeling.sessions.completed} sesiones).`);
  }
  return lines;
}
