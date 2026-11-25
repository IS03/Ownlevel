import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { liveActivityState } from '@/training/live-activity-model';
import { mealActivityState } from '@/nutrition/meal-activity-model';
import { mealDraft } from '@/nutrition/meal-form-model';
import { NoticesSettingsScreen } from '@/settings/notices-screen';
import { noticesSummary } from '@/settings/settings-screen';
import { defaultNoticePreferences, noticePreferences, NoticePreferencesStore, parseNoticePreferences, remindersPaused, resetNoticePreferencesForTests } from './notice-preferences';
import { applyReminders, createReminderSync, planReminders, REMINDER_LIMIT, type PlannedReminder, type ReminderCategory, type ReminderNotifications } from './reminder-engine';
import { NoticesLifetime } from './notices-lifetime';

let mockOwner: string | null = 'owner';
const mockPush = jest.fn();
let mockRespond: ((response: unknown) => void) | null = null;
jest.mock('@/auth', () => ({ useMobileAuth: () => ({ session: mockOwner ? { user: { id: mockOwner } } : null }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: (listener: (response: unknown) => void) => { mockRespond = listener; return { remove: () => { mockRespond = null; } }; },
  getPermissionsAsync: async () => ({ granted: false, canAskAgain: true }),
}));
afterEach(() => { resetNoticePreferencesForTests(); mockOwner = 'owner'; mockPush.mockClear(); });

const memory = () => { const map = new Map<string, string>(); return { map, port: { getItem: async (k: string) => map.get(k) ?? null, setItem: async (k: string, v: string) => { map.set(k, v); } } }; };
const NOW = Date.parse('2026-11-25T15:00:00Z');
const reminder = (id: string, at: number): PlannedReminder => ({ id, at, title: '¿Cerrás el día?', path: '/nutrition' });
const category = (items: PlannedReminder[]): ReminderCategory => ({ id: 'test', plan: () => items });

describe('notice preferences (#639)', () => {
  it('defaults: both activities and names on, nothing paused; damaged values fall back one by one', () => {
    expect(parseNoticePreferences(null)).toEqual(defaultNoticePreferences);
    expect(parseNoticePreferences({ workoutActivity: false, mealActivity: 'x', pausedUntil: 'forever', reminders: { 'close-day': { enabled: true, hour: 21, minute: 30, days: [1, 1, 9] }, bad: { enabled: true, hour: 30, minute: 0 } } }))
      .toEqual({ workoutActivity: false, mealActivity: true, lockDetail: true, pausedUntil: null, reminders: { 'close-day': { enabled: true, hour: 21, minute: 30, days: [1] } } });
  });
  it('a timed pause ends by itself; «sin fecha» lasts until turned off', () => {
    expect(remindersPaused({ ...defaultNoticePreferences, pausedUntil: NOW + 1 }, NOW)).toBe(true);
    expect(remindersPaused({ ...defaultNoticePreferences, pausedUntil: NOW }, NOW)).toBe(false);
    expect(remindersPaused({ ...defaultNoticePreferences, pausedUntil: 'manual' }, NOW)).toBe(true);
  });
  it('per account on this device: changes show at once, are written behind and read back', async () => {
    const { map, port } = memory();
    const store = new NoticePreferencesStore(port, 'a@b'); await store.load();
    await store.update({ workoutActivity: false }); await store.setReminder('close-day', { enabled: true, hour: 21, minute: 0 });
    expect([...map.keys()]).toEqual(['ownlevel.notices.v1.a%40b']);
    const again = new NoticePreferencesStore(port, 'a@b'); await again.load();
    expect(again.getSnapshot().preferences).toMatchObject({ workoutActivity: false, reminders: { 'close-day': { hour: 21 } } });
    const other = new NoticePreferencesStore(port, 'other'); await other.load();
    expect(other.getSnapshot().preferences).toEqual(defaultNoticePreferences);
  });
  it('a failed write keeps the change on screen and says so', async () => {
    const store = new NoticePreferencesStore({ getItem: async () => null, setItem: async () => { throw new Error('disk'); } }, 'owner');
    await store.load(); await store.update({ lockDetail: false });
    expect(store.getSnapshot()).toMatchObject({ preferences: { lockDetail: false }, persistenceFailed: true });
  });
});

describe('local reminder engine (#639)', () => {
  const context = (patch = {}) => ({ preferences: { ...defaultNoticePreferences, ...patch }, now: NOW, today: '2026-11-25' });
  it('plans within seven days, soonest first, once each; past ones and a failing category never break the rest', () => {
    const items = [reminder('b', NOW + 2 * 3600_000), reminder('a', NOW + 3600_000), reminder('a', NOW + 3600_000), reminder('old', NOW - 1), reminder('far', NOW + 8 * 86_400_000)];
    const broken: ReminderCategory = { id: 'broken', plan: () => { throw new Error('x'); } };
    expect(planReminders([category(items), broken], context()).map(item => item.id)).toEqual(['a', 'b']);
  });
  it('paused: nothing while paused, the rest after a timed pause', () => {
    const items = [reminder('in', NOW + 3600_000), reminder('after', NOW + 3 * 86_400_000)];
    expect(planReminders([category(items)], context({ pausedUntil: 'manual' }))).toEqual([]);
    expect(planReminders([category(items)], context({ pausedUntil: NOW + 86_400_000 })).map(item => item.id)).toEqual(['after']);
  });
  it('never more than iOS can keep', () => {
    const items = Array.from({ length: 80 }, (_, i) => reminder(`r${i}`, NOW + (i + 1) * 60_000));
    expect(planReminders([category(items)], context())).toHaveLength(REMINDER_LIMIT);
  });
  function fakeApi(granted = true) {
    const scheduled = new Map<string, { identifier: string; content: { data: Record<string, unknown> } }>();
    const api: ReminderNotifications = {
      getAllScheduledNotificationsAsync: async () => [...scheduled.values()],
      cancelScheduledNotificationAsync: jest.fn(async (id: string) => { scheduled.delete(id); }),
      scheduleNotificationAsync: jest.fn(async (request: Parameters<ReminderNotifications['scheduleNotificationAsync']>[0]) => { scheduled.set(request.identifier, { identifier: request.identifier, content: { data: request.content.data } }); return request.identifier; }),
      getPermissionsAsync: async () => ({ granted }),
    };
    return { api, scheduled };
  }
  it('applies exactly the plan: keeps what is unchanged, replaces what moved, cancels what left; never touches other alerts', async () => {
    const { api, scheduled } = fakeApi();
    scheduled.set('ownlevel.training.rest-end', { identifier: 'ownlevel.training.rest-end', content: { data: {} } });
    await applyReminders([reminder('a', NOW + 1000), reminder('b', NOW + 2000)], api);
    expect([...scheduled.keys()].sort()).toEqual(['ownlevel.reminder.a', 'ownlevel.reminder.b', 'ownlevel.training.rest-end']);
    jest.mocked(api.scheduleNotificationAsync).mockClear();
    await applyReminders([reminder('a', NOW + 1000), reminder('b', NOW + 5000)], api);
    expect(api.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(api.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'ownlevel.reminder.b', trigger: { type: 'date', date: NOW + 5000 },
      content: expect.objectContaining({ title: '¿Cerrás el día?', data: expect.objectContaining({ path: '/nutrition' }) }) }));
    await applyReminders([], api);
    expect([...scheduled.keys()]).toEqual(['ownlevel.training.rest-end']);
  });
  it('without permission it schedules nothing, but still cancels', async () => {
    const { api, scheduled } = fakeApi(false);
    scheduled.set('ownlevel.reminder.x', { identifier: 'ownlevel.reminder.x', content: { data: {} } });
    await applyReminders([reminder('a', NOW + 1000)], api);
    expect(scheduled.size).toBe(0); expect(api.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
  it('only the latest plan is applied', async () => {
    const { api } = fakeApi();
    const sync = createReminderSync(() => api);
    void sync([reminder('first', NOW + 1000)]); await sync([reminder('last', NOW + 1000)]);
    expect(jest.mocked(api.scheduleNotificationAsync).mock.calls.map(([request]) => request.identifier)).toEqual(['ownlevel.reminder.last']);
  });
});

describe('what the Lock Screen shows (#639 «Nombres en el bloqueo»)', () => {
  it('off: generic names, the loads stay', () => {
    const presence = { session: { id: 's', name: 'LEGS', logDate: '2026-11-25' }, timer: null, unavailable: false, recovery: false,
      progress: { completedSets: 1, totalSets: 3, next: { exerciseId: 'e', setId: null, exerciseName: 'SENTADILLA', set: 'Serie 2 de 3', load: '100 kg × 8' } } };
    expect(liveActivityState(presence, null, NOW, false).state?.props).toMatchObject({ sessionName: 'Entrenamiento', next: { exerciseName: '', load: '100 kg × 8' } });
    expect(liveActivityState(presence, null, NOW).state?.props).toMatchObject({ sessionName: 'LEGS', next: { exerciseName: 'SENTADILLA' } });
    const meals = { plate: null, manual: { draft: { ...mealDraft('2026-11-25'), title: 'TOSTADAS', calories: '320' }, savedAt: NOW } };
    expect(mealActivityState(meals, { plate: false, manual: false }, '2026-11-25', NOW, false)?.props).toMatchObject({ title: null, detail: '320 kcal' });
  });
});

describe('Ajustes → Avisos (#639)', () => {
  const screen = (categories: ReminderCategory[] = []) => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
    <OwnlevelThemeProvider initialMode="light"><NoticesSettingsScreen categories={categories} now={() => NOW} /></OwnlevelThemeProvider></SafeAreaProvider>);
  it('turns each activity and the names on the Lock Screen on and off for this account', async () => {
    const view = screen(); await act(async () => {});
    fireEvent(view.getByLabelText('Entrenamiento en curso'), 'valueChange', false);
    fireEvent(view.getByLabelText('Nombres en el bloqueo'), 'valueChange', false);
    expect(noticePreferences('owner').getSnapshot().preferences).toMatchObject({ workoutActivity: false, mealActivity: true, lockDetail: false });
    expect(view.queryByTestId('notices-reminders')).toBeNull();
    expect(noticesSummary(noticePreferences('owner').getSnapshot().preferences, NOW)).toBe('En vivo: comida sin terminar');
  });
  it('with reminders: pause for a day, a week or without date, and turn it back on', async () => {
    const view = screen([category([])]); await act(async () => {});
    fireEvent(view.getByLabelText('Pausar recordatorios'), 'valueChange', true);
    expect(noticePreferences('owner').getSnapshot().preferences.pausedUntil).toBe(NOW + 86_400_000);
    expect(noticesSummary(noticePreferences('owner').getSnapshot().preferences, NOW)).toContain('recordatorios pausados');
    fireEvent(view.getByLabelText('Pausar recordatorios'), 'valueChange', false);
    expect(noticePreferences('owner').getSnapshot().preferences.pausedUntil).toBeNull();
  });
});

describe('reminders follow the account (#639)', () => {
  it('schedules the plan, cancels everything when the account leaves, and a tap opens where it points', async () => {
    const sync = jest.fn(async (_plan: readonly PlannedReminder[]) => undefined);
    const planned = reminder('close-day.2026-11-25', Date.now() + 3600_000);
    const view = render(<NoticesLifetime categories={[category([planned])]} sync={sync} />);
    await waitFor(() => expect(sync).toHaveBeenCalledWith([planned]));
    act(() => mockRespond?.({ notification: { request: { identifier: 'ownlevel.reminder.close-day.2026-11-25', content: { data: { path: '/nutrition' } } } } }));
    expect(mockPush).toHaveBeenCalledWith('/nutrition');
    act(() => mockRespond?.({ notification: { request: { identifier: 'ownlevel.training.rest-end', content: { data: { path: '/nutrition' } } } } }));
    expect(mockPush).toHaveBeenCalledTimes(1);
    mockOwner = null; view.rerender(<NoticesLifetime categories={[category([planned])]} sync={sync} />);
    expect(sync).toHaveBeenLastCalledWith([]);
  });
});
