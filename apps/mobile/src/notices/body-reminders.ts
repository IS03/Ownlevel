import type { BodyOverview } from '@/api/body';
import { cordobaTime } from './close-day';
import type { NoticeFacts, ReminderSetting } from './notice-preferences';
import type { PlannedReminder, ReminderCategory } from './reminder-engine';

/**
 * #639 · Cuerpo. «Pesaje»: on the chosen weekdays at the chosen time, unless a weight was already registered that day.
 * «Medidas»: on the chosen weekday, once 2 or 4 weeks passed since the last measurement. Both decide from what a confirmed
 * Cuerpo reading said (kept on this device): with nothing read yet, no measurement reminder (missing is not zero).
 */
export const BODY_WEIGHT = 'body.weight';
export const BODY_MEASURES = 'body.measures';
export const defaultBodyWeight: ReminderSetting = { enabled: false, hour: 8, minute: 0, days: [1] };
export const defaultBodyMeasures: ReminderSetting = { enabled: false, hour: 9, minute: 0, days: [0], afterDays: 28 };

/** The dates a Cuerpo overview confirms: the latest weight and the latest measurement (null: there is none). */
export function bodyFacts(overview: BodyOverview): NoticeFacts {
  const latest = (dates: string[]) => dates.sort().at(-1) ?? null;
  return { lastWeightOn: latest([...(overview.current ? [overview.current.date] : []), ...overview.weights.items.map(item => item.date)]),
    // Only a full first page tells «none»; a partial read that found nothing says nothing.
    ...(overview.measurements.items.length || !overview.measurements.nextBefore ? { lastMeasurementOn: latest(overview.measurements.items.map(item => item.measuredOn)) } : {}) };
}

const addDays = (date: string, days: number) => { const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + days); return next.toISOString().slice(0, 10); };
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

export const bodyRemindersCategory: ReminderCategory = {
  id: 'body',
  plan: ({ preferences, today }) => {
    const plan: PlannedReminder[] = [];
    const facts = preferences.facts ?? {};
    const weight = preferences.reminders[BODY_WEIGHT];
    if (weight?.enabled && weight.days?.length) for (let offset = 0; offset < 7; offset++) {
      const date = addDays(today, offset);
      if (!weight.days.includes(weekday(date)) || facts.lastWeightOn === date) continue;
      plan.push({ id: `${BODY_WEIGHT}.${date}`, at: cordobaTime(date, weight.hour, weight.minute), title: '¿Te pesás hoy?', path: '/progress/body' });
    }
    const measures = preferences.reminders[BODY_MEASURES];
    if (measures?.enabled && measures.days?.length && facts.lastMeasurementOn !== undefined) {
      const due = facts.lastMeasurementOn === null ? today : addDays(facts.lastMeasurementOn, measures.afterDays ?? 28);
      for (let offset = 0; offset < 7; offset++) {
        const date = addDays(today, offset);
        if (date < due || !measures.days.includes(weekday(date)) || facts.lastMeasurementOn === date) continue;
        plan.push({ id: `${BODY_MEASURES}.${date}`, at: cordobaTime(date, measures.hour, measures.minute), title: '¿Te tomás las medidas?', path: '/progress/body' });
      }
    }
    return plan;
  },
};
