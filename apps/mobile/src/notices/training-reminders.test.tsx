import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { fetchMobileTraining, observeTraining, type MobileTrainingResponse } from '@/api/training';
import type { MobileApiClient } from '@/api/client';
import { NoticesSettingsScreen } from '@/settings/notices-screen';
import { defaultNoticePreferences, noticePreferences, resetNoticePreferencesForTests, type ReminderSetting } from './notice-preferences';
import { planReminders } from './reminder-engine';
import { TRAINING_DAYS, TRAINING_RETURN, trainingRemindersCategory, trainingStatus } from './training-reminders';

jest.mock('@/auth', () => ({ useMobileAuth: () => ({ session: { user: { id: 'owner' } } }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/training/session-rest-alert', () => ({ restAlertStatus: async () => 'enabled' }));
jest.mock('@/training/session-rest-alert-option', () => ({ RestAlertOption: () => null }));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
afterEach(() => { resetNoticePreferencesForTests(); });

// Wednesday 25/11/2026, 12:00 in Córdoba.
const TODAY = '2026-11-25', NOW = Date.parse('2026-11-25T15:00:00Z');
const response = (dates: string[], active: string | null = null): MobileTrainingResponse => ({
  activeSession: { status: 'ok', data: active ? { id: '11111111-1111-4111-8111-111111111111', name: 'LEGS', logDate: active } : null },
  calendar: { status: 'ok', data: { month: '2026-11', days: dates.map(date => ({ date, colors: [] })) } },
});
const plan = (reminders: Record<string, ReminderSetting>, training = trainingStatus(response([]), '2026-11', TODAY)) =>
  planReminders([trainingRemindersCategory], { preferences: { ...defaultNoticePreferences, reminders }, now: NOW, today: TODAY, training });

describe('training status (#639)', () => {
  it('a session today (finished or in progress) and the last one, from this month\'s confirmed reading', () => {
    expect(trainingStatus(response(['2026-11-20', '2026-11-23']), '2026-11', TODAY)).toEqual({ date: TODAY, trainedToday: false, lastDate: '2026-11-23', knownSince: '2026-11-01' });
    expect(trainingStatus(response(['2026-11-20'], TODAY), '2026-11', TODAY)).toMatchObject({ trainedToday: true });
    expect(trainingStatus(response(['2026-11-25']), '2026-11', TODAY)).toMatchObject({ trainedToday: true, lastDate: TODAY });
    // Another month (history) or a reading that could not answer: nothing to tell.
    expect(trainingStatus(response([]), '2026-10', TODAY)).toBeNull();
    expect(trainingStatus({ ...response([]), calendar: { status: 'unavailable' } } as never, '2026-11', TODAY)).toBeNull();
  });
  it('every confirmed Entrenar reading reaches the reminders', async () => {
    const seen: string[] = []; const stop = observeTraining((_data, month) => seen.push(month));
    const client = { read: async ({ parse }: { parse: (value: unknown) => unknown }) => ({ status: 'ok', data: parse(JSON.parse(JSON.stringify(response([])))) }) } as unknown as MobileApiClient;
    await fetchMobileTraining(client, '2026-11'); stop();
    expect(seen).toEqual(['2026-11']);
  });
});

describe('«Días de entreno» and «Retomar el entreno» (#639)', () => {
  it('only the chosen weekdays, at the chosen time; today dropped once trained', () => {
    const days = { [TRAINING_DAYS]: { enabled: true, hour: 18, minute: 0, days: [1, 3, 5] } };
    expect(plan(days).map(item => item.id)).toEqual(['training.days.2026-11-25', 'training.days.2026-11-27', 'training.days.2026-11-30']);
    expect(plan(days)[0]).toEqual({ id: 'training.days.2026-11-25', at: Date.parse('2026-11-25T21:00:00Z'), title: '¿Entrenás hoy?', path: '/train' });
    expect(plan(days, trainingStatus(response([TODAY]), '2026-11', TODAY))[0].id).toBe('training.days.2026-11-27');
    expect(plan({ [TRAINING_DAYS]: { enabled: true, hour: 18, minute: 0, days: [] } })).toEqual([]);
  });
  it('after N days without training, from the last confirmed session; never early, never without data', () => {
    const back = { [TRAINING_RETURN]: { enabled: true, hour: 19, minute: 0, afterDays: 4 } };
    // Last on 23/11: due 27/11.
    expect(plan(back, trainingStatus(response(['2026-11-23']), '2026-11', TODAY)).map(item => item.id)[0]).toBe('training.return.2026-11-27');
    // Last on 20/11: due 24/11, so today and the next days.
    expect(plan(back, trainingStatus(response(['2026-11-20']), '2026-11', TODAY))[0]).toEqual({ id: 'training.return.2026-11-25', at: Date.parse('2026-11-25T22:00:00Z'),
      title: '¿Volvés a entrenar?', path: '/train' });
    // Nothing this month: the last one could be 31/10 at the latest, so due 04/11 → today.
    expect(plan(back)[0].id).toBe('training.return.2026-11-25');
    // A session today: not today.
    expect(plan(back, trainingStatus(response(['2026-11-20'], TODAY), '2026-11', TODAY)).map(item => item.id)).not.toContain('training.return.2026-11-25');
    // No confirmed reading: no reminder (missing is not zero).
    expect(plan(back, null)).toEqual([]);
  });
});

describe('Ajustes → Avisos · Entreno (#639)', () => {
  it('weekdays as chips and the days without training as a choice', async () => {
    const view = render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <OwnlevelThemeProvider initialMode="light"><NoticesSettingsScreen now={() => NOW} /></OwnlevelThemeProvider></SafeAreaProvider>);
    await act(async () => {});
    await act(async () => { fireEvent(view.getByLabelText('Días de entreno'), 'valueChange', true); });
    fireEvent.press(view.getByLabelText('martes'));
    expect(noticePreferences('owner').getSnapshot().preferences.reminders[TRAINING_DAYS]).toEqual({ enabled: true, hour: 18, minute: 0, days: [1, 2, 3, 5] });
    fireEvent.press(view.getByLabelText('lunes'));
    expect(noticePreferences('owner').getSnapshot().preferences.reminders[TRAINING_DAYS]?.days).toEqual([2, 3, 5]);
    await act(async () => { fireEvent(view.getByLabelText('Retomar el entreno'), 'valueChange', true); });
    expect(view.getByText('Si pasan 4 días sin entrenar.')).toBeTruthy();
  });
});
