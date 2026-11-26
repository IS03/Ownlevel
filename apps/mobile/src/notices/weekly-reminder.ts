import { cordobaTime } from './close-day';
import type { ReminderSetting } from './notice-preferences';
import type { PlannedReminder, ReminderCategory } from './reminder-engine';

/** #639 · «Resumen semanal»: on the chosen weekday and time, «Tu semana», opening Progreso. Neutral: no numbers on the Lock Screen. */
export const WEEKLY = 'weekly';
export const defaultWeekly: ReminderSetting = { enabled: false, hour: 20, minute: 0, days: [0] };
const addDays = (date: string, days: number) => { const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + days); return next.toISOString().slice(0, 10); };

export const weeklyReminderCategory: ReminderCategory = {
  id: WEEKLY,
  plan: ({ preferences, today }) => {
    const setting = preferences.reminders[WEEKLY];
    if (!setting?.enabled || !setting.days?.length) return [];
    const plan: PlannedReminder[] = [];
    for (let offset = 0; offset < 7; offset++) {
      const date = addDays(today, offset);
      if (!setting.days.includes(new Date(`${date}T12:00:00Z`).getUTCDay())) continue;
      plan.push({ id: `${WEEKLY}.${date}`, at: cordobaTime(date, setting.hour, setting.minute), title: 'Tu semana', body: 'Mirá cómo te fue estos siete días.', path: '/progress' });
    }
    return plan;
  },
};
