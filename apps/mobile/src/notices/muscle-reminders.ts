import type { TrainingHistoryExercise } from '@/api/training-history';
import { muscleRecency } from '@/progress/muscle-recency';
import { cordobaTime } from './close-day';
import type { NoticeFacts, ReminderSetting } from './notice-preferences';
import type { PlannedReminder, ReminderCategory } from './reminder-engine';

/**
 * #639 · «Grupos musculares»: for the groups the person chooses, one grouped reminder a day once any of them went 7, 10 or
 * 14 days without sets. From what the last confirmed reading of the recorded exercises said (kept on this device); a
 * group never read says nothing. Neutral: no group names on the Lock Screen.
 */
export const MUSCLES = 'muscles';
export const defaultMuscles: ReminderSetting = { enabled: false, hour: 18, minute: 0, afterDays: 7, groups: [] };
export const muscleFacts = (exercises: readonly TrainingHistoryExercise[]): NoticeFacts =>
  ({ muscles: Object.fromEntries(muscleRecency(exercises).map(row => [row.group, row.lastDate])) });

const addDays = (date: string, days: number) => { const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + days); return next.toISOString().slice(0, 10); };
export const muscleRemindersCategory: ReminderCategory = {
  id: MUSCLES,
  plan: ({ preferences, today }) => {
    const setting = preferences.reminders[MUSCLES], known = preferences.facts?.muscles;
    if (!setting?.enabled || !setting.groups?.length || !known) return [];
    const after = setting.afterDays ?? 7;
    // The first day any chosen, known group is due; never for a group the reading did not include.
    const dues = setting.groups.filter(group => group in known).map(group => known[group] === null ? today : addDays(known[group]!, after));
    if (!dues.length) return [];
    const due = dues.sort()[0]!;
    const plan: PlannedReminder[] = [];
    for (let offset = 0; offset < 7; offset++) {
      const date = addDays(today, offset);
      if (date < due) continue;
      plan.push({ id: `${MUSCLES}.${date}`, at: cordobaTime(date, setting.hour, setting.minute), title: '¿Variás el entreno?',
        body: 'Hay grupos que elegiste que hace días no tienen series.', path: '/progress/muscles' });
    }
    return plan;
  },
};
