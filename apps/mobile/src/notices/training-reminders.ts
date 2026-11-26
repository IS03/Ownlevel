import type { MobileTrainingResponse } from '@/api/training';
import { cordobaTime } from './close-day';
import type { ReminderSetting } from './notice-preferences';
import type { PlannedReminder, ReminderCategory } from './reminder-engine';

/**
 * #639 · Entreno. «Días de entreno»: on the chosen weekdays, at the chosen time, if that day has no session yet (one in
 * progress counts). «Retomar el entreno»: after N days without one. Neutral texts; both open Entrenar.
 */
export const TRAINING_DAYS = 'training.days';
export const TRAINING_RETURN = 'training.return';
export const defaultTrainingDays: ReminderSetting = { enabled: false, hour: 18, minute: 0, days: [1, 3, 5] };
export const defaultTrainingReturn: ReminderSetting = { enabled: false, hour: 19, minute: 0, afterDays: 4 };

/**
 * What this month's reading of Entrenar says about today: a session today, the last day with one, and since when it
 * knows (the month's first day: before it, it cannot tell). Null when the reading could not answer or is of another month.
 */
export type TrainingStatus = { date: string; trainedToday: boolean; lastDate: string | null; knownSince: string };
export function trainingStatus(response: MobileTrainingResponse, month: string, today: string): TrainingStatus | null {
  if (response.calendar.status !== 'ok' || month !== today.slice(0, 7) || response.calendar.data.month !== month) return null;
  const days = response.calendar.data.days.map(day => day.date).filter(date => date <= today).sort();
  const active = response.activeSession.status === 'ok' ? response.activeSession.data : null;
  return { date: today, trainedToday: days.includes(today) || active?.logDate === today, lastDate: days.at(-1) ?? (active?.logDate === today ? today : null),
    knownSince: `${month}-01` };
}

const addDays = (date: string, days: number) => { const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + days); return next.toISOString().slice(0, 10); };
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

export const trainingRemindersCategory: ReminderCategory = {
  id: 'training',
  plan: ({ preferences, today, training }) => {
    const plan: PlannedReminder[] = [];
    const known = training?.date === today ? training : null;
    const days = preferences.reminders[TRAINING_DAYS];
    if (days?.enabled && days.days?.length) for (let offset = 0; offset < 7; offset++) {
      const date = addDays(today, offset);
      if (!days.days.includes(weekday(date)) || (offset === 0 && known?.trainedToday)) continue;
      plan.push({ id: `${TRAINING_DAYS}.${date}`, at: cordobaTime(date, days.hour, days.minute), title: '¿Entrenás hoy?', path: '/train' });
    }
    const back = preferences.reminders[TRAINING_RETURN];
    // Only from a confirmed reading: without one there is no «N days without training» to tell (missing is not zero).
    if (back?.enabled && known) {
      const after = back.afterDays ?? 4;
      // With no session this month, the last one was before it: assume the latest possible day, so it is never early.
      const due = addDays(known.lastDate ?? addDays(known.knownSince, -1), after);
      for (let offset = 0; offset < 7; offset++) {
        const date = addDays(today, offset);
        if (date < due || (offset === 0 && known.trainedToday)) continue;
        plan.push({ id: `${TRAINING_RETURN}.${date}`, at: cordobaTime(date, back.hour, back.minute), title: '¿Volvés a entrenar?', path: '/train' });
      }
    }
    return plan;
  },
};
