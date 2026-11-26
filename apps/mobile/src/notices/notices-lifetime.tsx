import { useRouter } from 'expo-router';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import { useMobileAuth } from '@/auth';
import { homeDay } from '@/home/home-day';
import { useNoticePreferences } from './notice-preferences';
import { observeTodayNutrition } from '@/api/nutrition-day';
import { closeDayStatus, type DayStatus } from './close-day';
import { registeredMoments } from './meal-reminders';
import { trainingStatus, type TrainingStatus } from './training-reminders';
import { observeTraining } from '@/api/training';
import { currentMealMomentBands } from '@/nutrition/moment-bands-store';
import { planReminders, REMINDER_PREFIX, reminderCategories, syncReminders, type ReminderCategory } from './reminder-engine';

type Response = { notification: { request: { identifier: string; content: { data?: Record<string, unknown> | null } } } };
function listenResponses(listener: (response: Response) => void): (() => void) | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const api = require('expo-notifications') as typeof import('expo-notifications');
    const subscription = api.addNotificationResponseReceivedListener(listener as never);
    return () => subscription.remove();
  } catch { return null; }
}

/**
 * #639 · Keeps this account's reminders scheduled as its preferences say: on every change, on returning to the app, and
 * gone when the account leaves (sign-out, another account, deletion). Tapping one opens where it points.
 */
export function NoticesLifetime({ children, categories = reminderCategories, sync = syncReminders }: PropsWithChildren<{
  categories?: readonly ReminderCategory[]; sync?: typeof syncReminders;
}>) {
  const { session } = useMobileAuth();
  const owner = session?.user.id ?? null;
  const { preferences, ready } = useNoticePreferences(owner);
  const router = useRouter();
  // Today's day as the last confirmed reading saw it (also right after a save: the day is read again), per account.
  const [status, setStatus] = useState<{ owner: string; value: DayStatus } | null>(null);
  const todayStatus = status && status.owner === owner ? status.value : null;
  useEffect(() => {
    if (!owner) return;
    return observeTodayNutrition(response => {
      const value = closeDayStatus(response), moments = registeredMoments(response, currentMealMomentBands());
      if (value || moments) setStatus({ owner, value: { date: response.date, closed: value?.closed ?? false, ...(moments ? { moments } : {}) } });
    });
  }, [owner]);
  // What Entrenar's last confirmed reading of this month says (a session today, the last one), per account.
  const [trainingState, setTraining] = useState<{ owner: string; value: TrainingStatus } | null>(null);
  const training = trainingState && trainingState.owner === owner ? trainingState.value : null;
  useEffect(() => {
    if (!owner) return;
    return observeTraining((response, month) => { const value = trainingStatus(response, month, homeDay().today); if (value) setTraining({ owner, value }); });
  }, [owner]);
  useEffect(() => {
    if (!owner || !ready) return;
    const apply = () => { void sync(planReminders(categories, { preferences, now: Date.now(), today: homeDay().today, todayStatus, training })); };
    apply();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') apply(); });
    return () => subscription.remove();
  }, [categories, owner, preferences, ready, sync, todayStatus, training]);
  // No account, no reminders: what the previous one scheduled never reaches the next.
  useEffect(() => () => { void sync([]); }, [owner, sync]);
  useEffect(() => {
    if (!owner) return;
    return listenResponses(response => {
      const { identifier, content } = response.notification.request;
      const path = content.data?.path;
      if (identifier.startsWith(REMINDER_PREFIX) && typeof path === 'string' && path.startsWith('/')) router.push(path as never);
    }) ?? undefined;
  }, [owner, router]);
  return <>{children}</>;
}
