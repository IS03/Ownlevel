import { palette } from '@/design-system/brand';
import type { LiveActivityColors } from '@/training/live-activity-model';
import type { UnfinishedMeals } from './unfinished-meal-storage';
import { parseInputNutritionDate } from './day-format';

/** #645 · «Comida sin terminar» on the Lock Screen and the Dynamic Island. Only what the draft holds: no made-up kcal. */
export type MealActivityProps = {
  kind: 'plate' | 'manual';
  title: string | null;
  detail: string | null;
  day: string;
  /** When it stops being offered: eight hours after it was left. */
  until: number;
  colors: LiveActivityColors;
};
export type MealActivityState = { sessionId: string; props: MealActivityProps };
export const MEAL_DISCARD = 'meal:discard';
export const MEAL_ACTIVITY_MS = 8 * 3600_000;
const colors: LiveActivityColors = { background: palette.dark.bg, text: palette.dark.text, muted: palette.dark.textMuted, accent: palette.dark.accent };

const dayLabel = (date: string, today: string) => {
  if (date === today) return 'Hoy';
  const previous = new Date(`${today}T12:00:00Z`); previous.setUTCDate(previous.getUTCDate() - 1);
  if (date === previous.toISOString().slice(0, 10)) return 'Ayer';
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00Z`));
};

/**
 * The most recently left meal, unless its own sheet is open (it is being finished) or it was left more than eight hours
 * ago (it stays in the app, the activity goes).
 */
export function mealActivityState(meals: UnfinishedMeals, open: { plate: boolean; manual: boolean }, today: string, now: number, names = true): MealActivityState | null {
  const plate = meals.plate && !open.plate ? meals.plate : null, manual = meals.manual && !open.manual ? meals.manual : null;
  const latest = plate && (!manual || plate.savedAt >= manual.savedAt) ? { kind: 'plate' as const, ...plate } : manual ? { kind: 'manual' as const, ...manual } : null;
  if (!latest || now - latest.savedAt >= MEAL_ACTIVITY_MS) return null;
  let detail: string | null = null;
  if (latest.kind === 'plate') {
    const count = latest.draft.items.length;
    detail = `${count} ${count === 1 ? 'elemento' : 'elementos'} en el plato`;
  } else {
    const calories = latest.draft.calories.trim();
    detail = /^\d+$/.test(calories) && Number(calories) > 0 ? `${new Intl.NumberFormat('es-AR').format(Number(calories))} kcal` : null;
  }
  // Off (#639 «Nombres en el bloqueo»): no meal name on the Lock Screen.
  const title = names ? latest.draft.title.trim() || null : null;
  // A manual draft keeps its date as typed (dd/mm/aaaa); the plate's is already a calendar date.
  const date = latest.kind === 'manual' ? parseInputNutritionDate(latest.draft.date) ?? today : latest.draft.date;
  return { sessionId: `${latest.kind}:${latest.savedAt}`, props: { kind: latest.kind, title, detail, day: dayLabel(date, today),
    until: latest.savedAt + MEAL_ACTIVITY_MS, colors } };
}
