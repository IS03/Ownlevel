import { Platform } from 'react-native';

const identifier = 'ownlevel.training.rest-end';
const channel = 'training-rest';
let deadline: number | null = null;
let revision = 0;
let queue: Promise<void> = Promise.resolve();

function notifications(): typeof import('expo-notifications') {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') throw new Error('Rest notifications need a native device');
  // Resolve native modules only when used, so an older development build can still open the workout.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications');
}

export async function restAlertStatus(request = false) {
  const api = notifications();
  if (request && Platform.OS === 'android') {
    await api.setNotificationChannelAsync(channel, { name: 'Descanso entre series', importance: api.AndroidImportance.HIGH });
  }
  const status = request ? await api.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true } }) : await api.getPermissionsAsync();
  if (request) syncRestAlert(deadline, true);
  return status.granted ? 'enabled' : status.canAskAgain ? 'available' : 'settings';
}

const stopwatchIdentifier = 'ownlevel.training.set-target';
let target: number | null = null;
let targetRevision = 0;
/**
 * #645 · «Llegaste a 1:00»: a timed set reaching its planned seconds, also with the screen locked. Same permission as the
 * rest alert; one scheduled at a time, replaced or cancelled with the stopwatch.
 */
export function syncSetTargetAlert(at: number | null, seconds: number | null) {
  if (target === at) return queue;
  target = at;
  const current = ++targetRevision;
  queue = queue.then(async () => {
    if (current !== targetRevision) return;
    const api = notifications();
    await api.cancelScheduledNotificationAsync(stopwatchIdentifier);
    if (current !== targetRevision || at === null || seconds === null || at <= Date.now()) return;
    const status = await api.getPermissionsAsync();
    if (current !== targetRevision || !status.granted || at <= Date.now()) return;
    const label = seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : `${seconds} s`;
    await api.scheduleNotificationAsync({
      identifier: stopwatchIdentifier,
      content: { title: `Llegaste a ${label}`, sound: 'default' },
      trigger: { type: api.SchedulableTriggerInputTypes.DATE, date: at, ...(Platform.OS === 'android' ? { channelId: channel } : {}) },
    });
  }).catch(() => {
    // The stopwatch works without permission or when the system scheduler is unavailable.
  });
  return queue;
}

export function syncRestAlert(endAt: number | null, refresh = false) {
  if (deadline === endAt && !refresh) return queue;
  deadline = endAt;
  const current = ++revision;
  queue = queue.then(async () => {
    if (current !== revision) return;
    const api = notifications();
    await api.cancelScheduledNotificationAsync(identifier);
    if (current !== revision || endAt === null || endAt <= Date.now()) return;
    const status = await api.getPermissionsAsync();
    if (current !== revision || !status.granted || endAt <= Date.now()) return;
    // Expo's default foreground policy suppresses presentation. The app's observer owns the live haptic.
    await api.scheduleNotificationAsync({
      identifier,
      content: { title: 'Descanso terminado', sound: 'default' },
      trigger: { type: api.SchedulableTriggerInputTypes.DATE, date: endAt, ...(Platform.OS === 'android' ? { channelId: channel } : {}) },
    });
  }).catch(() => {
    // The clock works without permission or when the system scheduler is unavailable.
  });
  return queue;
}
