import type { NutritionTiming, TimingBandKey } from '@/api/progress';
import type { AppIconName } from '@/design-system';

export const TIMING_META: Record<
  TimingBandKey,
  { name: string; hours: string; icon: AppIconName; sentence: string; least: string }
> = {
  morning: { name: 'Mañana', hours: '5–11', icon: 'sunrise', sentence: 'De 5 a 11 h', least: 'A la mañana' },
  midday: { name: 'Mediodía', hours: '11–15', icon: 'sun', sentence: 'De 11 a 15 h', least: 'Al mediodía' },
  afternoon: { name: 'Tarde', hours: '15–20', icon: 'sunset', sentence: 'De 15 a 20 h', least: 'A la tarde' },
  night: { name: 'Noche', hours: '20–5', icon: 'moon', sentence: 'De 20 a 5 h', least: 'De noche' },
};
export const shareText = (share: number | null) =>
  // A no-break space, so "39 %" never splits across lines.
  share === null ? '—' : `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(share * 100)}\u00A0%`;
export const fewTimedMeals = (n: number) => `Todavía hay pocas comidas con hora para ver un patrón (${n}).`;
export function timingHeadline(timing: NutritionTiming) {
  if (timing.mealsWithTime < 10) return { text: fewTimedMeals(timing.mealsWithTime), icon: null, least: null };
  if (timing.kcal === 0)
    return { text: 'Sin calorías conocidas en las comidas con hora de este período.', icon: null, least: null };
  const sorted = [...timing.bands].sort((a, b) => b.kcal - a.kcal),
    top = sorted[0],
    bottom = sorted.at(-1)!;
  return {
    text: `${TIMING_META[top.key].sentence} comés el ${shareText(top.kcalShare)} de tus calorías${top.proteinShare === null ? '.'
      : shareText(top.proteinShare) === shareText(top.kcalShare) ? ' y de tu proteína.' : ` y el ${shareText(top.proteinShare)} de tu proteína.`}`,
    icon: TIMING_META[top.key].icon,
    least: `${TIMING_META[bottom.key].least}, el ${shareText(bottom.kcalShare)} de tus calorías.`,
  };
}
