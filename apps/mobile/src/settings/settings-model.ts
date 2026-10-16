import type { NutritionStages, StageKind } from '@/api/nutrition-stages';
import type { ConfigDraft } from '@/nutrition/config-model';
import type { EnergyConfig } from '@/api/nutrition-config';
import { ACTIVITY_FACTORS } from '../../../../src/lib/nutrition/plan-v2-core';
export const stageNames: Record<StageKind, string> = {
  maintenance: 'Mantenimiento',
  deficit: 'Déficit',
  surplus: 'Superávit',
  recomposition: 'Recomposición',
  custom: 'Plan propio',
};
export const activities = [
  {
    value: 'low',
    label: 'Poco movimiento',
    detail: 'Trabajo sentado, poco caminar',
  },
  {
    value: 'moderate',
    label: 'Algo de movimiento',
    detail: 'De pie o caminando parte del día',
  },
  {
    value: 'high',
    label: 'Mucho movimiento',
    detail: 'Trabajo físico o todo el día en movimiento',
  },
] as const;
export const sexes = [
  { value: 'male', label: 'Hombre' },
  { value: 'female', label: 'Mujer' },
  { value: 'other', label: 'Otro' },
] as const;
const epoch = (date: string) => Date.parse(`${date}T12:00:00Z`);
export const shortDate = (date: string) =>
  `${Number(date.slice(8, 10))} ${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(date.slice(5, 7)) - 1]}`;
export const previousDate = (date: string) =>
  new Date(epoch(date) - 86400000).toISOString().slice(0, 10);
export function stageProgress(stage: NonNullable<NutritionStages['current']>, today: string) {
  if (!stage.endsOn) return null;
  const days = Math.max(1, Math.round((epoch(stage.endsOn) - epoch(stage.startsOn)) / 86400000));
  const elapsed = Math.max(0, Math.round((epoch(today) - epoch(stage.startsOn)) / 86400000));
  const weeks = Math.ceil(days / 7);
  return {
    weeks,
    week: Math.min(weeks, Math.floor(elapsed / 7) + 1),
    progress: Math.min(1, elapsed / days),
  };
}
export function stageHeadline(name: string | null, list: NutritionStages | null) {
  const greeting = name ? `Hola, ${name}.` : 'Hola.';
  const stage = list?.current;
  if (!stage || !list) return { text: greeting, progress: null };
  const prefix = name ? `${name}, ` : '';
  const kind = stage.kind ? stageNames[stage.kind].toLocaleLowerCase('es-AR') : 'plan';
  if (!stage.endsOn)
    return {
      text: `${prefix}tu ${stage.kind && stage.kind !== 'custom' ? 'plan de ' : ''}${kind} rige desde el ${shortDate(stage.startsOn)}.`,
      progress: null,
    };
  const { week, weeks, progress } = stageProgress(stage, list.today)!;
  return {
    text: `${prefix}vas por la semana ${week} de ${weeks} de tu ${kind}.`,
    progress,
  };
}
/** Preview only, using the day engine's factors. Confirmed configuration always wins. */
export function estimatedEnergy(
  config: EnergyConfig | null,
  draft: ConfigDraft | null,
): number | null {
  if (!config) return null;
  if (!draft) return config.usedBaseKcal;
  if (draft.baseExpenditureMode === 'custom') {
    const n = Number(draft.customBaseExpenditureKcal?.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const factor = ACTIVITY_FACTORS[draft.activityLevel as keyof typeof ACTIVITY_FACTORS];
  return config.bmrKcal !== null && factor ? Math.round(config.bmrKcal * factor) : null;
}
