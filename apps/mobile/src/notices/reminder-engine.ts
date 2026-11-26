import { Platform } from 'react-native';
import { remindersPaused, type NoticePreferences } from './notice-preferences';
import { closeDayCategory, type DayStatus } from './close-day';
import { mealRemindersCategory } from './meal-reminders';
import { trainingRemindersCategory, type TrainingStatus } from './training-reminders';
import { bodyRemindersCategory } from './body-reminders';

/**
 * #639 · Local reminders. This iPhone schedules them (no push on a personal signing team) and takes back any it learns is
 * no longer needed: on opening the app, after a confirmed save and when iOS grants a background refresh. A category
 * plans what it wants for the next days from its own setting and the confirmed data it has; the engine only applies the
 * plan: what is not planned is cancelled, what is new is scheduled, paused reminders are never scheduled.
 */
export const REMINDER_PREFIX = 'ownlevel.reminder.';
export const REMINDER_HORIZON_DAYS = 7;
/** iOS keeps at most 64 pending local notifications per app; the workout alerts need a couple of them. */
export const REMINDER_LIMIT = 48;
export type PlannedReminder = {
  /** Stable per category and moment (e.g. «close-day.2026-11-25»): the same reminder is never scheduled twice. */
  id: string;
  at: number;
  /** Neutral: never a name, a weight or a meal on the Lock Screen. */
  title: string;
  body?: string;
  /** Where tapping it opens (an app path, e.g. «/nutrition»). */
  path: string;
};
/** `todayStatus`: today's day closed or not, from the last confirmed reading of it (null: not known). */
export type ReminderContext = { preferences: NoticePreferences; now: number; today: string; todayStatus?: DayStatus | null; training?: TrainingStatus | null };
export type ReminderCategory = { id: string; plan: (context: ReminderContext) => PlannedReminder[] };

/** The reminders to have scheduled now: the categories' plans, within the horizon, unpaused, soonest first. */
export function planReminders(categories: readonly ReminderCategory[], context: ReminderContext): PlannedReminder[] {
  const end = context.now + REMINDER_HORIZON_DAYS * 86_400_000;
  const planned = categories.flatMap(category => {
    try { return category.plan(context); } catch { return []; } // one category's failure never cancels the others' plans
    // A timed pause drops only what falls inside it; «hasta que los reactive» drops everything.
  }).filter(item => item.at > context.now && item.at <= end && !remindersPaused(context.preferences, item.at));
  const unique = new Map(planned.map(item => [item.id, item]));
  return [...unique.values()].sort((a, b) => a.at - b.at).slice(0, REMINDER_LIMIT);
}

type Scheduled = { identifier: string; content?: { data?: Record<string, unknown> | null } };
export type ReminderNotifications = {
  getAllScheduledNotificationsAsync(): Promise<Scheduled[]>;
  cancelScheduledNotificationAsync(identifier: string): Promise<void>;
  scheduleNotificationAsync(request: { identifier: string; content: { title: string; body?: string; sound?: 'default'; data: Record<string, unknown> };
    trigger: { type: 'date'; date: number } }): Promise<string>;
  getPermissionsAsync(): Promise<{ granted: boolean }>;
};
const fingerprint = (item: PlannedReminder) => `${item.at}|${item.title}|${item.body ?? ''}|${item.path}`;

/** Makes the scheduled reminders exactly the plan. Only touches this app's reminders, never the workout alerts. */
export async function applyReminders(plan: readonly PlannedReminder[], api: ReminderNotifications) {
  const scheduled = (await api.getAllScheduledNotificationsAsync()).filter(item => item.identifier.startsWith(REMINDER_PREFIX));
  const wanted = new Map(plan.map(item => [`${REMINDER_PREFIX}${item.id}`, item]));
  for (const item of scheduled) {
    const next = wanted.get(item.identifier);
    if (next && item.content?.data?.fingerprint === fingerprint(next)) wanted.delete(item.identifier);
    else await api.cancelScheduledNotificationAsync(item.identifier);
  }
  if (!wanted.size || !(await api.getPermissionsAsync()).granted) return;
  for (const [identifier, item] of wanted) {
    await api.scheduleNotificationAsync({ identifier, content: { title: item.title, ...(item.body ? { body: item.body } : {}), sound: 'default',
      data: { path: item.path, fingerprint: fingerprint(item) } }, trigger: { type: 'date', date: item.at } });
  }
}

function nativeNotifications(): ReminderNotifications | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const api = require('expo-notifications') as typeof import('expo-notifications');
  return {
    getAllScheduledNotificationsAsync: () => api.getAllScheduledNotificationsAsync(),
    cancelScheduledNotificationAsync: identifier => api.cancelScheduledNotificationAsync(identifier),
    scheduleNotificationAsync: request => api.scheduleNotificationAsync({ ...request,
      trigger: { type: api.SchedulableTriggerInputTypes.DATE, date: request.trigger.date } }),
    getPermissionsAsync: () => api.getPermissionsAsync(),
  };
}

/** Queued: only the latest plan is applied, one application at a time. */
export function createReminderSync(resolve: () => ReminderNotifications | null = nativeNotifications) {
  let revision = 0;
  let queue: Promise<void> = Promise.resolve();
  return function syncReminders(plan: readonly PlannedReminder[]) {
    const mine = ++revision;
    queue = queue.then(async () => {
      if (mine !== revision) return;
      const api = resolve();
      if (api) await applyReminders(plan, api);
    }).catch(() => {
      // Reminders never block the app: the next sync applies the plan again.
    });
    return queue;
  };
}
export const syncReminders = createReminderSync();
/** Every category added so far (#639, step 6 adds them one by one). */
export const reminderCategories: ReminderCategory[] = [closeDayCategory, mealRemindersCategory, trainingRemindersCategory, bodyRemindersCategory];
