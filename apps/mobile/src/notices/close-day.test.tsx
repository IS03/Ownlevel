import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { fetchMobileNutritionDay, observeTodayNutrition, type MobileNutritionDayResponse } from '@/api/nutrition-day';
import type { MobileApiClient } from '@/api/client';
import { nutritionFixture } from '@/nutrition/day-fixture.test-helper';
import { NoticesSettingsScreen } from '@/settings/notices-screen';
import { CLOSE_DAY, closeDayCategory, closeDayStatus, cordobaTime } from './close-day';
import { defaultNoticePreferences, noticePreferences, resetNoticePreferencesForTests } from './notice-preferences';
import { planReminders, reminderCategories, type PlannedReminder } from './reminder-engine';
import { NoticesLifetime } from './notices-lifetime';

const mockRest = jest.fn(async (_request?: boolean) => 'enabled' as const);
jest.mock('@/auth', () => ({ useMobileAuth: () => ({ session: { user: { id: 'owner' } } }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-notifications', () => ({ addNotificationResponseReceivedListener: () => ({ remove: () => undefined }) }));
jest.mock('@/training/session-rest-alert', () => ({ restAlertStatus: (request?: boolean) => mockRest(request) }));
jest.mock('@/training/session-rest-alert-option', () => ({ RestAlertOption: () => null }));
jest.mock('@/home/home-day', () => ({ homeDay: () => ({ today: '2026-11-25', weekStart: '2026-11-24' }) }));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
afterEach(() => { resetNoticePreferencesForTests(); mockRest.mockClear(); });

const TODAY = '2026-11-25', NOW = Date.parse('2026-11-25T15:00:00Z');
const day = (patch: (data: MobileNutritionDayResponse) => void = () => undefined) => { const value = nutritionFixture(TODAY); value.today = TODAY; patch(value); return value; };
const enabled = (patch = {}) => ({ ...defaultNoticePreferences, reminders: { [CLOSE_DAY]: { enabled: true, hour: 21, minute: 30, ...patch } } });

describe('«Cerrar el día» (#639)', () => {
  it('a day is closed with a meal and every active metric registered; a 0 is a value', () => {
    expect(closeDayStatus(day())).toEqual({ date: TODAY, closed: true });
    expect(closeDayStatus(day(value => { if (value.activity.status === 'ok') value.activity.data.metrics[0].value = null; }))).toEqual({ date: TODAY, closed: false });
    expect(closeDayStatus(day(value => { if (value.activity.status === 'ok') value.activity.data.metrics[0] = { ...value.activity.data.metrics[0], value: null, isActive: false }; })))
      .toEqual({ date: TODAY, closed: true });
    expect(closeDayStatus(day(value => { value.nutrition = { status: 'ok', data: { dayState: 'missing', summary: null, context: null, meals: [] } }; }))).toEqual({ date: TODAY, closed: false });
  });
  it('a reading that could not answer never closes the day', () => {
    expect(closeDayStatus(day(value => { value.activity = { status: 'unavailable' } as never; }))).toBeNull();
  });
  it('plans one neutral reminder a day at the chosen time in Córdoba; off, none', () => {
    const plan = closeDayCategory.plan({ preferences: enabled(), now: NOW, today: TODAY });
    expect(plan).toHaveLength(7);
    expect(plan[0]).toEqual({ id: 'close-day.2026-11-25', at: Date.parse('2026-11-26T00:30:00Z'), title: '¿Cerrás el día?', body: 'Revisá tus comidas y métricas de hoy.', path: '/nutrition' });
    expect(plan[6].id).toBe('close-day.2026-12-01');
    expect(cordobaTime(TODAY, 9, 0)).toBe(Date.parse('2026-11-25T12:00:00Z'));
    expect(closeDayCategory.plan({ preferences: defaultNoticePreferences, now: NOW, today: TODAY })).toEqual([]);
  });
  it('today closed with confirmed data: no reminder today, the next days stay; unknown keeps it', () => {
    const ids = (todayStatus: { date: string; closed: boolean } | null) => planReminders([closeDayCategory], { preferences: enabled(), now: NOW, today: TODAY, todayStatus }).map(item => item.id);
    expect(ids({ date: TODAY, closed: true })[0]).toBe('close-day.2026-11-26');
    expect(ids({ date: TODAY, closed: false })[0]).toBe('close-day.2026-11-25');
    expect(ids(null)[0]).toBe('close-day.2026-11-25');
    expect(ids({ date: '2026-11-24', closed: true })[0]).toBe('close-day.2026-11-25');
  });
  it('it is the first reminder category', () => { expect(reminderCategories.map(category => category.id)).toContain(CLOSE_DAY); });
});

describe('today is read again after a save: the reminder follows (#639)', () => {
  it('a full reading of today reaches the reminders; another day never does', async () => {
    const seen: string[] = []; const stop = observeTodayNutrition(data => seen.push(data.date));
    const client = { read: async ({ parse }: { parse: (value: unknown) => unknown }) => ({ status: 'ok', data: parse(JSON.parse(JSON.stringify(day()))) }) } as unknown as MobileApiClient;
    await fetchMobileNutritionDay(client, TODAY);
    const other = { read: async ({ parse }: { parse: (value: unknown) => unknown }) => ({ status: 'ok', data: parse({ ...JSON.parse(JSON.stringify(day())), date: '2026-11-24' }) }) } as unknown as MobileApiClient;
    await fetchMobileNutritionDay(other, '2026-11-24');
    stop(); expect(seen).toEqual([TODAY]);
  });
  it('the lifetime drops today\'s reminder when a reading says the day is closed', async () => {
    // Noon in Córdoba: today's 21:30 is still ahead, whatever the clock running the tests says.
    const clock = jest.spyOn(Date, 'now').mockReturnValue(NOW);
    await noticePreferences('owner').update(enabled());
    const sync = jest.fn(async (_plan: readonly PlannedReminder[]) => undefined);
    render(<NoticesLifetime sync={sync} />);
    await waitFor(() => expect(sync.mock.calls.at(-1)?.[0].map(item => item.id)).toContain('close-day.2026-11-25'));
    const client = { read: async ({ parse }: { parse: (value: unknown) => unknown }) => ({ status: 'ok', data: parse(JSON.parse(JSON.stringify(day()))) }) } as unknown as MobileApiClient;
    await act(async () => { await fetchMobileNutritionDay(client, TODAY); });
    await waitFor(() => expect(sync.mock.calls.at(-1)?.[0].map(item => item.id)).not.toContain('close-day.2026-11-25'));
    clock.mockRestore();
  });
});

describe('Ajustes → Avisos · Cerrar el día (#639)', () => {
  it('off by default; on asks for notifications once and the time moves by half hours', async () => {
    const view = render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <OwnlevelThemeProvider initialMode="light"><NoticesSettingsScreen now={() => NOW} /></OwnlevelThemeProvider></SafeAreaProvider>);
    await act(async () => {});
    expect(view.getByLabelText('Cerrar el día').props.value).toBe(false); expect(view.queryByTestId('close-day-time')).toBeNull();
    await act(async () => { fireEvent(view.getByLabelText('Cerrar el día'), 'valueChange', true); });
    expect(mockRest).toHaveBeenCalledWith(true);
    expect(view.getByTestId('close-day-time').props.children).toBe('21:30');
    fireEvent.press(view.getByLabelText('Hora de Cerrar el día, media hora después'));
    expect(noticePreferences('owner').getSnapshot().preferences.reminders[CLOSE_DAY]).toEqual({ enabled: true, hour: 22, minute: 0 });
  });
});
