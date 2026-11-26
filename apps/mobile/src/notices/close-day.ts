import type { MobileNutritionDayResponse } from '@/api/nutrition-day';
import type { MealMoment } from '@/api/nutrition-moment-bands';
import type { ReminderSetting } from './notice-preferences';
import type { PlannedReminder, ReminderCategory } from './reminder-engine';

/**
 * #639 · «Cerrar el día»: at the chosen time, one neutral reminder on the days that are not closed yet. A day is closed
 * when it has at least one meal and every active metric has a value (a 0 counts: it is a value). Only confirmed data
 * closes it: a reading that could not answer leaves the reminder in place, it never cancels it.
 */
export const CLOSE_DAY = 'close-day';
export const defaultCloseDay: ReminderSetting = { enabled: false, hour: 21, minute: 30 };
/** `moments`: the meal moments that already have a meal (#639 «Comida por horario»). */
export type DayStatus = { date: string; closed: boolean; moments?: MealMoment[] };

/** Whether today is closed, from a full reading of it; null when that reading could not tell. */
export function closeDayStatus(response: MobileNutritionDayResponse): DayStatus | null {
  if (response.nutrition.status !== 'ok' || response.activity.status !== 'ok') return null;
  const meals = response.nutrition.data.dayState === 'recorded' && response.nutrition.data.meals.some(meal => meal.entryKind === 'meal');
  const metrics = response.activity.data.metrics.filter(metric => metric.isActive).every(metric => metric.value !== null);
  return { date: response.date, closed: meals && metrics };
}

const addDays = (date: string, days: number) => { const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + days); return next.toISOString().slice(0, 10); };
const pad = (value: number) => String(value).padStart(2, '0');
/** The chosen time on that day in Córdoba (−03:00, no daylight saving), as the app's days are. */
export const cordobaTime = (date: string, hour: number, minute: number) => Date.parse(`${date}T${pad(hour)}:${pad(minute)}:00-03:00`);

export const closeDayCategory: ReminderCategory = {
  id: CLOSE_DAY,
  plan: ({ preferences, today, todayStatus }) => {
    const setting = preferences.reminders[CLOSE_DAY];
    if (!setting?.enabled) return [];
    const plan: PlannedReminder[] = [];
    for (let offset = 0; offset < 7; offset++) {
      const date = addDays(today, offset);
      // Today, already closed with confirmed data: nothing to remind.
      if (offset === 0 && todayStatus?.date === date && todayStatus.closed) continue;
      plan.push({ id: `${CLOSE_DAY}.${date}`, at: cordobaTime(date, setting.hour, setting.minute), title: '¿Cerrás el día?',
        body: 'Revisá tus comidas y métricas de hoy.', path: '/nutrition' });
    }
    return plan;
  },
};
