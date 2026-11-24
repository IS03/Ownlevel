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
