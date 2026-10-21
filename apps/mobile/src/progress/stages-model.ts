import type { NutritionStages } from '@/api/nutrition-stages';
import type { ProgressStages, ProgressStageSummary } from '@/api/progress-stages';
import { stageNames } from '@/settings/settings-model';
import { arrowDelta, formatValue } from './progress-format';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DAY = 86_400_000;
const epoch = (d: string) => Date.parse(`${d}T12:00:00Z`);
export const shortDay = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const lastDay = (endsOn: string) => new Date(epoch(endsOn) - DAY).toISOString().slice(0, 10);
export const kindLabel = (kind: ProgressStageSummary['kind']) => (kind ? stageNames[kind] : 'Plan');

/** "29 sep → 21 dic", "29 sep → hoy" or "desde 29 sep"; endsOn is exclusive. */
export function stageDates(s: Pick<ProgressStageSummary, 'startsOn' | 'endsOn' | 'status'>) {
  if (s.status === 'current') return s.endsOn ? `${shortDay(s.startsOn)} → ${shortDay(lastDay(s.endsOn))}` : `desde ${shortDay(s.startsOn)}`;
  return `${shortDay(s.startsOn)} → ${shortDay(lastDay(s.endsOn!))}`;
}
const weeks = (days: number) => Math.max(1, Math.round(days / 7));
/** Under a week it is said in days ("3 días"), never rounded up to a week. */
const span = (days: number, short: boolean) => days < 7 ? `${days} ${days === 1 ? 'día' : 'días'}`
  : short ? `${weeks(days)} sem` : `${weeks(days)} ${weeks(days) === 1 ? 'semana' : 'semanas'}`;
/** "semana 3 de 12" for a running stage with an end; otherwise how long it lasted. */
export function stageLength(s: ProgressStageSummary) {
  if (s.status === 'current' && s.plannedDays) return `semana ${Math.min(weeks(s.plannedDays), Math.floor((s.elapsedDays - 1) / 7) + 1)} de ${weeks(s.plannedDays)}`;
  if (s.status === 'current') return span(s.elapsedDays, false);
  return span(s.elapsedDays, true);
}
export const stageProgress = (s: ProgressStageSummary) => (s.status === 'current' && s.plannedDays ? Math.min(1, s.elapsedDays / s.plannedDays) : null);

export type StageRow = { key: string; label: string; value: (s: ProgressStageSummary) => string };
type Sources = ProgressStages['sources'];
const or = (ok: boolean, text: string) => (ok ? text : 'No disponible');
const kcal = (v: number | null) => (v === null ? 'Sin dato' : formatValue(v, null, 'integer'));
/** Rows of the comparison. Missing data says "Sin dato" and an unreadable source "No disponible", never 0. */
export function stageRows(sources: Sources): StageRow[] {
  return [
    { key: 'length', label: 'Duración', value: s => s.status === 'current' && s.plannedDays ? `${weeks(s.elapsedDays)} de ${weeks(s.plannedDays)} sem` : span(s.elapsedDays, true) },
    { key: 'target', label: 'Objetivo', value: s => kcal(s.targetKcal) },
    { key: 'eaten', label: 'Comiste', value: s => or(sources.nutrition === 'ok', kcal(s.eatenKcal)) },
    { key: 'weight', label: 'Peso / sem.', value: s => or(sources.body === 'ok', s.weightPerWeekKg === null ? 'Sin dato' : arrowDelta(s.weightPerWeekKg, 'kg')) },
    { key: 'training', label: 'Entrenos / sem.', value: s => or(sources.training === 'ok', s.trainingDaysPerWeek === null ? 'Sin dato' : formatValue(s.trainingDaysPerWeek, null)) },
    { key: 'meals', label: 'Días con comidas', value: s => or(sources.nutrition === 'ok', `${s.daysWithMeals} de ${s.elapsedDays}`) },
  ];
}

/** Why a cell is empty, in one line (only the reasons that apply). */
export function stageNotes(stages: ProgressStageSummary[]): string[] {
  const notes: string[] = [];
  const current = stages.find(s => s.status === 'current');
  if (current && current.elapsedDays < 28) notes.push(`${current.name} va ${stageLength(current).replace(/^semana /, 'por la semana ')}: sus promedios todavía pueden cambiar.`);
  if (stages.some(s => s.weightPerWeekKg === null && s.weighIns > 0)) notes.push('El peso por semana necesita al menos 3 registros en 10 días.');
  if (stages.some(s => s.status === 'past' && s.daysWithMeals === 0)) notes.push('Donde no registrabas comidas no hay promedio.');
  return notes;
}

/** The progress row: only when there are stages. */
export function stagesRowDetail(list: NutritionStages | null | undefined): string | null {
  if (!list) return null;
  const s = list.current;
  if (s) {
    const name = s.name || kindLabel(s.kind);
    if (!s.endsOn) return `${name} · desde ${shortDay(s.startsOn)}`;
    const planned = Math.round((epoch(s.endsOn) - epoch(s.startsOn)) / DAY), elapsed = Math.round((epoch(list.today) - epoch(s.startsOn)) / DAY) + 1;
    return `${name} · semana ${Math.min(weeks(planned), Math.floor((elapsed - 1) / 7) + 1)} de ${weeks(planned)}`;
  }
  return list.past[0] ? `La última: ${list.past[0].name}` : null;
}

/**
 * How to tell stages apart: the name, plus its dates when another stage shares it
 * ("Recomposición suave · desde 18 oct" next to "Recomposición suave · 29 jul → 17 oct").
 */
export function stageLabel(s: ProgressStageSummary, stages: ProgressStageSummary[]) {
  return stages.some(o => o.id !== s.id && o.name === s.name) ? `${s.name} · ${stageDates(s)}` : s.name;
}

/** Comparison default: the stage before the one you are looking at. */
export const defaultCompare = (stages: ProgressStageSummary[], selected: string) => {
  const i = stages.findIndex(s => s.id === selected);
  return stages[i + 1]?.id ?? stages.find(s => s.id !== selected)?.id ?? null;
};

/** Stage bands for a chart whose points are dates: only stages that touch them (none = no "Etapas" chip). */
export function chartBands(list: NutritionStages | null | undefined, dates: string[]) {
  if (!list || !dates.length) return [];
  const first = dates.reduce((a, b) => (a < b ? a : b)), last = dates.reduce((a, b) => (a > b ? a : b));
  return [...list.past].reverse().concat(list.current ? [list.current] : [])
    .filter(s => s.startsOn <= last && (s.endsOn === null || s.endsOn > first))
    .map(s => ({ id: s.id, start: s.startsOn, end: s.endsOn, label: s.name || kindLabel(s.kind), current: s.status === 'current' }));
}
