import { useSyncExternalStore } from 'react';
import { writeAccountRecord } from '@/platform/account-local-data';

/**
 * #639 · «Avisos y actividades en vivo»: what this device shows, per account. Local only: the reminders are scheduled
 * by this iPhone (the personal signing team has no push), so their preferences live with it.
 *
 * - `workoutActivity` / `mealActivity`: the Live Activities of a workout in progress and of a meal left unfinished.
 * - `lockDetail`: names of routines, exercises and meals on the Lock Screen and in the Dynamic Island. Off, they read
 *   generic («Entrenamiento», «Comida»). Reminder texts are always neutral, whatever this says.
 * - `pausedUntil`: reminders paused until that moment (epoch ms); `'manual'` until they are turned back on.
 * - `reminders`: each category's own settings, added one by one (#639, step 6).
 */
/** `days`: weekdays (0 Sunday … 6 Saturday) a reminder runs on; `afterDays`: days without the thing before it reminds. */
export type ReminderSetting = { enabled: boolean; hour: number; minute: number; days?: number[]; afterDays?: number };
export type NoticePreferences = {
  workoutActivity: boolean; mealActivity: boolean; lockDetail: boolean;
  pausedUntil: number | 'manual' | null;
  reminders: Record<string, ReminderSetting>;
};
export const defaultNoticePreferences: NoticePreferences = { workoutActivity: true, mealActivity: true, lockDetail: true, pausedUntil: null, reminders: {} };

const bool = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback;
function reminder(value: unknown): ReminderSetting | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const hour = v.hour, minute = v.minute, days = v.days, after = v.afterDays;
  if (typeof v.enabled !== 'boolean' || !Number.isInteger(hour) || (hour as number) < 0 || (hour as number) > 23
    || !Number.isInteger(minute) || (minute as number) < 0 || (minute as number) > 59) return null;
  const validDays = Array.isArray(days) ? days.filter(day => Number.isInteger(day) && day >= 0 && day <= 6) as number[] : undefined;
  const afterDays = Number.isInteger(after) && (after as number) >= 1 && (after as number) <= 30 ? after as number : undefined;
  return { enabled: v.enabled, hour: hour as number, minute: minute as number, ...(validDays ? { days: [...new Set(validDays)].sort() } : {}), ...(afterDays ? { afterDays } : {}) };
}
export function parseNoticePreferences(value: unknown): NoticePreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaultNoticePreferences;
  const v = value as Record<string, unknown>;
  const paused = v.pausedUntil === 'manual' || (typeof v.pausedUntil === 'number' && Number.isFinite(v.pausedUntil)) ? v.pausedUntil as number | 'manual' : null;
  const reminders: Record<string, ReminderSetting> = {};
  if (v.reminders && typeof v.reminders === 'object') for (const [key, item] of Object.entries(v.reminders as Record<string, unknown>)) {
    const parsed = reminder(item); if (parsed) reminders[key] = parsed;
  }
  return { workoutActivity: bool(v.workoutActivity, true), mealActivity: bool(v.mealActivity, true), lockDetail: bool(v.lockDetail, true), pausedUntil: paused, reminders };
}
/** Reminders are paused now (a timed pause that ended reads as not paused). */
export const remindersPaused = (preferences: NoticePreferences, now = Date.now()) =>
  preferences.pausedUntil === 'manual' || (typeof preferences.pausedUntil === 'number' && preferences.pausedUntil > now);

type Port = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> };
type Snapshot = { preferences: NoticePreferences; ready: boolean; persistenceFailed: boolean };

/** One account's preferences on this device: read once, changed at once on screen, written behind. */
export class NoticePreferencesStore {
  private snapshot: Snapshot = { preferences: defaultNoticePreferences, ready: false, persistenceFailed: false };
  private listeners = new Set<() => void>();
  private writes: Promise<unknown> = Promise.resolve();
  readonly key: string;
  constructor(private port: Port, userId: string) { this.key = `ownlevel.notices.v1.${encodeURIComponent(userId)}`; }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(next: Snapshot) { this.snapshot = next; this.listeners.forEach(listener => listener()); }
  async load() {
    try {
      const raw = await this.port.getItem(this.key);
      // A change made while reading wins over what was stored.
      if (!this.snapshot.ready) this.publish({ preferences: raw === null ? defaultNoticePreferences : parseNoticePreferences(JSON.parse(raw)), ready: true, persistenceFailed: false });
    } catch { if (!this.snapshot.ready) this.publish({ ...this.snapshot, ready: true }); }
  }
  update(patch: Partial<NoticePreferences>) {
    const preferences = { ...this.snapshot.preferences, ...patch };
    this.publish({ preferences, ready: true, persistenceFailed: false });
    this.writes = this.writes.catch(() => undefined).then(() => writeAccountRecord(this.port, this.key, JSON.stringify(preferences)))
      .catch(() => { if (this.snapshot.preferences === preferences) this.publish({ ...this.snapshot, persistenceFailed: true }); });
    return this.writes;
  }
  setReminder(id: string, setting: ReminderSetting) { return this.update({ reminders: { ...this.snapshot.preferences.reminders, [id]: setting } }); }
}

const stores = new Map<string, NoticePreferencesStore>();
/** The device storage, resolved on first use; without it (a test, a broken install) preferences live in memory. */
function devicePort(): Port {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('@react-native-async-storage/async-storage') as typeof import('@react-native-async-storage/async-storage')).default;
  } catch {
    const memory = new Map<string, string>();
    return { getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => { memory.set(key, value); } };
  }
}
/** The store of an account on this device (one per account, loaded on first use). */
export function noticePreferences(owner: string, port: Port = devicePort()) {
  let store = stores.get(owner);
  if (!store) { store = new NoticePreferencesStore(port, owner); stores.set(owner, store); void store.load(); }
  return store;
}
const signedOut: Snapshot = { preferences: defaultNoticePreferences, ready: false, persistenceFailed: false };
const noop = () => () => undefined;
export function useNoticePreferences(owner: string | null | undefined) {
  const store = owner ? noticePreferences(owner) : null;
  const snapshot = useSyncExternalStore(store?.subscribe ?? noop, store?.getSnapshot ?? (() => signedOut), store?.getSnapshot ?? (() => signedOut));
  return { ...snapshot, store };
}
/** Test-only. */
export function resetNoticePreferencesForTests() { stores.clear(); }
