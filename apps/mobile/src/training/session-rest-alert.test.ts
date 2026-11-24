import { expect, it, jest } from '@jest/globals';
import * as Notifications from 'expo-notifications';
import { syncRestAlert } from './session-rest-alert';

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
