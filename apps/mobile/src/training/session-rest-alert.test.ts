import { expect, it, jest } from '@jest/globals';
import * as Notifications from 'expo-notifications';
import { syncRestAlert, syncSetTargetAlert } from './session-rest-alert';

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => 'ownlevel.training.rest-end'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
}));

it('replaces the pending alert after adjusting the time and cancels it when skipping', async () => {
  const deadline = Date.now() + 60_000;
  await syncRestAlert(deadline);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({ trigger: expect.objectContaining({ date: deadline }) }));
  await syncRestAlert(deadline + 15_000);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenLastCalledWith(expect.objectContaining({ trigger: expect.objectContaining({ date: deadline + 15_000 }) }));
  await syncRestAlert(null);
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(3);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
});

it('#645: schedules «Llegaste a 1:00» for a timed set\'s target and cancels it with the stopwatch', async () => {
  jest.mocked(Notifications.scheduleNotificationAsync).mockClear(); jest.mocked(Notifications.cancelScheduledNotificationAsync).mockClear();
  const at = Date.now() + 60_000;
  await syncSetTargetAlert(at, 60);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'ownlevel.training.set-target',
    content: expect.objectContaining({ title: 'Llegaste a 1:00' }), trigger: expect.objectContaining({ date: at }) }));
  await syncSetTargetAlert(Date.now() + 45_000, 45);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenLastCalledWith(expect.objectContaining({ content: expect.objectContaining({ title: 'Llegaste a 45 s' }) }));
  await syncSetTargetAlert(null, null);
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenLastCalledWith('ownlevel.training.set-target');
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
});
