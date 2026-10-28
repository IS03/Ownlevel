import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { clearConfirmedReads, invalidateConfirmedReads } from '@/api/confirmed-read-cache';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { MobileHomeResponse } from '@/api/home';
import { OwnlevelThemeProvider } from '@/design-system';

import { HOME_FOCUS_REFRESH_MS } from './home-data';
import { HomeScreen } from './home-screen';
import { homeProgressHabits, homeProgressBody, homeProgressTraining } from './home-test-fixtures';

// Screen navigation uses the portable control; the UIKit bridge has its own integration suite.
jest.mock('./home-page-control', () => jest.requireActual('./home-page-control.tsx'));

const mockNavigate = jest.fn();
const mockPush = jest.fn();
const mockFocusEffects: (() => void)[] = [];
const mockApiClient = {};
const mockFetchHome = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchDay = jest.fn<(client: unknown, date: string) => Promise<unknown>>();
const mockFetchReport = jest.fn<(client: unknown, query: unknown) => Promise<unknown>>();
const mockFetchHistory = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchTrainingDay = jest.fn<(client: unknown, date: string) => Promise<unknown>>();
const mockFetchHabits = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchProgressBody = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchProgressWeek = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchProgressRecords = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockConfigOpen = jest.fn();
const mockStartSession = jest.fn();
let mockStarterOnSession: ((id: string) => void) | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, push: mockPush }),
  useFocusEffect: (effect: () => void) => { mockFocusEffects.push(effect); },
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@expo/ui', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Host: View, RNHostView: View, BottomSheet: ({ isPresented, children }: { isPresented: boolean; children: React.ReactNode }) => isPresented ? <View testID="mock-sheet">{children}</View> : null };
});
// The SwiftUI sheet (iOS) is native; these tests drive the React Native version, same behavior.
jest.mock('@/training/new-session-sheet', () => ({
  NewSessionSheet: (jest.requireActual('@/training/new-session-sheet-rn') as typeof import('@/training/new-session-sheet-rn')).NewSessionSheetRN,
}));
jest.mock('./home-add-menu', () => {
  const { Pressable, Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { HomeAddMenu: ({ onFood, onManual, onQuick }: import('./home-add-menu.types').HomeAddMenuProps) => (
    <View testID="home-add-menu">
      <Pressable accessibilityRole="button" onPress={onManual}><Text>A mano</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onQuick}><Text>Rápido</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onFood}><Text>Alimento por cantidad</Text></Pressable>
    </View>
  ) };
});
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() } }));
const mockOpenMetric = jest.fn<(id: string) => Promise<void>>();
// The quick metric sheet (same as Nutrición › Tu día) is covered by its own Nutrition tests.
jest.mock('./use-home-metric-entry', () => ({ useHomeMetricEntry: () => ({ open: mockOpenMetric, loading: null, error: null, clearError: () => {}, element: null }) }));
jest.mock('@/auth', () => ({ useMobileAuth: () => ({ session: { user: { id: 'u1', user_metadata: { avatar_url: 'https://lh3.googleusercontent.com/a/p' } } } }) }));
jest.mock('@/nutrition/config-provider', () => ({ useNutritionConfiguration: () => ({ controller: { open: mockConfigOpen } }) }));
jest.mock('@/api', () => ({
  ...jest.requireActual<object>('@/api'),
  fetchMobileHome: (...args: unknown[]) => mockFetchHome(...args),
  useMobileApi: () => ({ client: mockApiClient }),
}));
jest.mock('@/api/history', () => ({ fetchHistoryDay: (c: unknown, d: string) => mockFetchDay(c, d) }));
jest.mock('@/api/nutrition-report', () => ({ fetchNutritionReport: (c: unknown, q: unknown) => mockFetchReport(c, q) }));
jest.mock('@/api/training-history', () => ({
  fetchTrainingDay: (client: unknown, date: string) => mockFetchTrainingDay(client, date),
  fetchTrainingHistory: (...args: unknown[]) => mockFetchHistory(...args),
}));
jest.mock('@/api/progress', () => ({
  ...jest.requireActual<object>('@/api/progress'),
  fetchProgressHabitWeek: (...args: unknown[]) => mockFetchHabits(...args),
  fetchProgressBody: (...args: unknown[]) => mockFetchProgressBody(...args),
  fetchProgressTraining: (c: unknown, q: { period: string }, s: unknown) => q.period === '7'
    ? mockFetchProgressWeek(c, q, s) : mockFetchProgressRecords(c, q, s),
}));
// The real starter (verification, idempotency, conflicts) has its own tests; here it records the request.
jest.mock('@/training/use-session-starter', () => ({
  useSessionStarter: ({ onSession }: { onSession: (id: string) => void }) => {
    mockStarterOnSession = onSession;
    return { element: null, start: (request: unknown) => mockStartSession(request) };
  },
}));

const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const ok = (data: unknown) => Promise.resolve({ status: 'ok', data, meta });
const SATURDAY_NIGHT = new Date('2026-10-11T02:59:00.000Z'); // Sat 10, 23:59 Córdoba

function homeData(): MobileHomeResponse {
  return {
    date: '2026-10-10',
    profile: { status: 'ok', data: { displayName: 'Nacho' } },
    nutrition: { status: 'ok', data: { calories: 1000, calorieTarget: 2000, proteinG: 80, proteinTargetG: 150, mealCount: 2, waterL: null, waterTargetL: null, energyBalanceKcal: null } },
    training: {
      activeSession: { status: 'ok', data: null },
      workoutStartRoutines: { status: 'ok', data: [{ id: 'r1', name: 'Push', color: null, exerciseCount: 6, setCount: 18 }] },
      week: { status: 'ok', data: {
        summary: { weekStart: '2026-10-05', weekEnd: '2026-10-11', sessions: 1, sets: 18, minutes: 55, routines: {}, muscleGroups: {}, trainingDays: ['2026-10-06'] },
        todaySessions: [{ id: 'done-1', name: 'Push', startedAt: '2026-10-10T12:00:00.000Z', endedAt: '2026-10-10T12:55:00.000Z',
          durationMilliseconds: 55 * 60_000, exercisesCompleted: 6, completedSets: 18, status: 'completed' }],
      } },
    },
  };
}

const historyDay = {
  date: '2026-10-10', today: '2026-10-10', discovery: null, training: { status: 'ok', data: { sessions: [] } }, activeSession: { status: 'ok', data: null },
  nutrition: { status: 'unavailable' }, body: { date: '2026-10-10', today: '2026-10-10', weight: { status: 'ok', data: null }, measurement: { status: 'ok', data: null } },
  metrics: { status: 'ok', data: { metrics: [{ id: 'm1', systemKey: 'sleep', label: 'Sueño', unit: 'h', valueType: 'duration', target: null, value: null, isActive: true, updatedAt: null }] } },
};
const report = { today: '2026-10-10', range: { start: '2026-10-05', end: '2026-10-10' },
  summary: { metrics: Object.fromEntries(['calories', 'protein', 'carbs', 'fat'].map(key => [key, { value: null, denominator: 0, partialDays: 0 }])) }, days: [] };

let clock = SATURDAY_NIGHT.getTime();
const now = () => new Date(clock);

async function renderScreen() {
  const view = render(<OwnlevelThemeProvider initialMode="light"><HomeScreen now={now} /></OwnlevelThemeProvider>);
  await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
  return view;
}
// Lets refreshes triggered by an action resolve inside act (no state updates after the test).
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
// The start modal opens after the sheet's dismissal (SHEET_DISMISS_MS).
const afterSheet = () => act(() => new Promise<void>(resolve => { setTimeout(resolve, 400); }));
const focus = async () => { act(() => { mockFocusEffects.at(-1)!(); }); await settle(); };
const allFetchers = () => [mockFetchHome, mockFetchDay, mockFetchReport, mockFetchHistory,
  mockFetchHabits, mockFetchProgressBody, mockFetchProgressRecords];

describe('Home screen', () => {
  beforeEach(() => {
    clock = SATURDAY_NIGHT.getTime();
    mockFocusEffects.length = 0;
    mockStartSession.mockReset();
    for (const mock of [mockNavigate, mockPush, mockConfigOpen, mockFetchProgressWeek, ...allFetchers()]) mock.mockReset();
    mockFetchHome.mockImplementation(() => ok(homeData()));
    mockFetchDay.mockImplementation(() => ok(historyDay));
    mockFetchReport.mockImplementation(() => ok(report));
    mockFetchHistory.mockImplementation(() => ok({ sessions: [], nextCursor: null }));
    mockFetchHabits.mockImplementation(() => ok(homeProgressHabits()));
    mockFetchProgressBody.mockImplementation(() => ok(homeProgressBody()));
    mockFetchProgressWeek.mockImplementation(() => ok(homeProgressTraining()));
    mockFetchProgressRecords.mockImplementation(() => ok(homeProgressTraining('30')));
  });

  it('issues every read in parallel, with the server day semantics for today and Monday', async () => {
    mockFetchHome.mockImplementation(() => new Promise(() => undefined)); // Home never answers.
    const view = await renderScreen();
    for (const fetcher of allFetchers()) expect(fetcher).toHaveBeenCalledTimes(1);
    // The 7-day trainings read is no longer shown on Home, so it is not requested.
    expect(mockFetchProgressWeek).not.toHaveBeenCalled();
    expect(mockFetchDay.mock.calls[0][1]).toBe('2026-10-10');
    expect(mockFetchHabits.mock.calls[0][1]).toBe('2026-10-05');
    expect(mockFetchReport.mock.calls[0][1]).toEqual({ period: 'custom', from: '2026-10-05', to: '2026-10-10' });
    expect(mockFetchProgressBody.mock.calls[0][1]).toEqual({ period: '7' });
    expect(mockFetchProgressRecords.mock.calls[0][1]).toEqual({ period: '30' });
    // Blocks with their own reads render while Home is still loading.
    expect(view.getByTestId('home-register')).toBeTruthy();
    expect(view.getByTestId('home-nutrition-loading')).toBeTruthy();
  });

  it('refreshes on tab focus only after the minimum interval, and always on a new day', async () => {
    await renderScreen();
    await focus(); // first focus = initial reads
    clock += HOME_FOCUS_REFRESH_MS - 1_000;
    await focus();
    expect(mockFetchHome).toHaveBeenCalledTimes(1);

    clock += 2_000;
    await focus();
    expect(mockFetchHome).toHaveBeenCalledTimes(2);
    expect(mockFetchReport).toHaveBeenCalledTimes(2);

    // Midnight in Córdoba (Sunday → Monday would change the week; here Saturday → Sunday).
    clock = Date.parse('2026-10-11T03:00:05.000Z');
    await act(async () => { await Promise.resolve(); });
    await focus();
    expect(mockFetchHome).toHaveBeenCalledTimes(3);
    expect(mockFetchDay.mock.calls.at(-1)![1]).toBe('2026-10-11');
  });

  it('refreshes on focus inside the interval when a write settled in another section since the last refresh', async () => {
    await renderScreen();
    await focus(); // first focus = initial reads
    clock += 1_000;
    await focus();
    expect(mockFetchHome).toHaveBeenCalledTimes(1);
    // A meal registered in Nutrición: the API client counts the settled write for this account.
    invalidateConfirmedReads(mockApiClient as never, '/api/mobile/v1/nutrition/days/2026-10-10/meals');
    clock += 1_000;
    await focus();
    expect(mockFetchHome).toHaveBeenCalledTimes(2); expect(mockFetchReport).toHaveBeenCalledTimes(2);
    clock += 1_000;
    await focus();
    expect(mockFetchHome).toHaveBeenCalledTimes(2);
    clearConfirmedReads(mockApiClient as never);
  });

  it('a read after midnight on Sunday asks for the new week', async () => {
    clock = Date.parse('2026-10-12T02:59:00.000Z'); // Sunday 23:59
    await renderScreen();
    expect(mockFetchHabits.mock.calls[0][1]).toBe('2026-10-05');
    expect(mockFetchReport.mock.calls[0][1]).toEqual({ period: 'custom', from: '2026-10-05', to: '2026-10-11' });
    await focus(); // first focus = initial reads
    clock = Date.parse('2026-10-12T03:00:00.000Z'); // Monday 00:00, seconds later
    await focus();
    expect(mockFetchReport.mock.calls.at(-1)![1]).toEqual({ period: 'custom', from: '2026-10-12', to: '2026-10-12' });
  });

  it('opens Profile/Settings, Progress and the existing Nutrition flows', async () => {
    const view = await renderScreen();
    fireEvent.press(view.getByRole('button', { name: 'Abrir perfil y ajustes' }));
    fireEvent.press(view.getByRole('button', { name: 'Progreso' }));
    const menu = within(view.getByTestId('home-add-menu'));
    fireEvent.press(menu.getByText('A mano'));
    fireEvent.press(menu.getByText('Rápido'));
    fireEvent.press(menu.getByText('Alimento por cantidad'));
    expect(mockPush.mock.calls).toEqual([['/settings']]);
    expect(mockNavigate.mock.calls).toEqual([
      ['/(tabs)/progress'],
      [{ pathname: '/(tabs)/nutrition', params: { add: 'manual' } }],
      [{ pathname: '/(tabs)/nutrition', params: { quick: 'all' } }],
      [{ pathname: '/(tabs)/nutrition', params: { add: 'food' } }],
    ]);
  });

  it('a metric opens the quick sheet right here; Más opens Ajustes › Métricas; weight is not here', async () => {
    const view = await renderScreen();
    const register = within(view.getByTestId('home-register'));
    expect(register.queryByText('Peso')).toBeNull();
    fireEvent.press(register.getByRole('button', { name: 'Sueño, Cargar' }));
    expect(mockOpenMetric).toHaveBeenCalledTimes(1);
    fireEvent.press(register.getByRole('button', { name: 'Más, Métricas' }));
    expect(mockPush.mock.calls).toEqual([['/settings/metrics']]);
  });

  it('a session row opens the finished session; a strip day opens that day; calories per day opens this week\'s report', async () => {
    mockFetchHistory.mockImplementation(() => ok({ sessions: [{ id: 's', routineId: null, routineName: 'Push', routineColor: null, logDate: '2026-10-06',
      startedAt: '2026-10-06T12:00:00.000Z', endedAt: '2026-10-06T13:00:00.000Z', durationMilliseconds: 3_600_000, exercisesCompleted: 6, completedSets: 18, volumeKg: null }], nextCursor: null }));
    const view = await renderScreen();
    fireEvent.press(view.getByRole('button', { name: 'Push. 55 min · 18 series' }));
    fireEvent.press(view.getByTestId('home-week-day-2026-10-06'));
    fireEvent.press(view.getByTestId('home-week-page-1'));
    fireEvent.press(view.getByTestId('home-week-calories'));
    expect(view.getByTestId('home-week-page-2')).toBeTruthy();
    expect(view.queryAllByTestId(/home-week-scroll-/)).toHaveLength(0);
    expect(mockPush.mock.calls).toEqual([
      [{ pathname: '/(tabs)/train/history/[id]', params: { id: 'done-1' } }],
      [{ pathname: '/(tabs)/train/history', params: { date: '2026-10-06' } }],
      [{ pathname: '/(tabs)/progress/trends/nutrition', params: { from: '2026-10-05', to: '2026-10-10' } }],
    ]);
  });

  it('opens the habit metric in Progreso and refreshes the weekly read on a new week', async () => {
    const view = await renderScreen();
    fireEvent.press(view.getByTestId('home-week-page-2'));
    fireEvent.press(view.getByTestId('home-habit-m1'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/progress/trends/metrics', params: { metric: 'm1' } });
    await focus();
    clock = Date.parse('2026-10-12T03:00:05.000Z');
    await focus();
    expect(mockFetchHabits.mock.calls.at(-1)![1]).toBe('2026-10-12');
  });

  it('"Arrancar rutina" opens the new session sheet; the recommended routine starts right away (no chooser) and Home follows the session', async () => {
    const data = homeData();
    if (data.training.week.status === 'ok') data.training.week.data.todaySessions = [];
    mockFetchHome.mockImplementation(() => ok(data));
    // Saturday: Push on the last two Saturdays → recommended.
    const pushOn = (id: string, logDate: string) => ({ id, routineId: 'r1', routineName: 'Push', routineColor: null, logDate,
      startedAt: `${logDate}T12:00:00.000Z`, endedAt: `${logDate}T13:14:00.000Z`, durationMilliseconds: 74 * 60_000, exercisesCompleted: 6, completedSets: 21, volumeKg: null });
    mockFetchHistory.mockImplementation(() => ok({ sessions: [pushOn('a', '2026-10-03'), pushOn('b', '2026-09-26')], nextCursor: null }));
    mockFetchTrainingDay.mockImplementation((_client: unknown, date: string) => ok({ date, sessions: ['2026-10-03', '2026-09-26'].includes(date) ? [pushOn(date, date)] : [],
      summary: { sessionCount: 0, exercisesCompleted: 0, completedSets: 0, durationMilliseconds: null, volumeKg: null } }));
    const view = await renderScreen();
    expect(view.queryByTestId('new-session-start')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Arrancar rutina' }));
    expect(view.getByTestId('new-session-start')).toBeTruthy();
    await waitFor(() => expect(view.getByTestId('new-session-recommended')).toBeTruthy());
    fireEvent.press(view.getByTestId('new-session-recommended'));
    expect(view.queryByTestId('new-session-start')).toBeNull();
    expect(mockStartSession).not.toHaveBeenCalled(); // waits for the sheet to be gone
    await afterSheet();
    expect(mockStartSession).toHaveBeenCalledWith({ routineId: 'r1' });
    expect(mockNavigate).not.toHaveBeenCalled();
    act(() => mockStarterOnSession!('started-1'));
    await settle();
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/train/session/started-1');

    fireEvent.press(view.getByRole('button', { name: 'Arrancar rutina' }));
    fireEvent.press(view.getByTestId('new-session-free'));
    await afterSheet();
    expect(mockStartSession).toHaveBeenLastCalledWith({ free: true });

    // "Elegir rutina" lists every routine with when it was last done; closing never starts anything.
    fireEvent.press(view.getByRole('button', { name: 'Arrancar rutina' }));
    fireEvent.press(view.getByTestId('new-session-choose'));
    expect(view.getByRole('button', { name: 'Push, 6 ejercicios · 18 series, hace 7 días' })).toBeTruthy();
    fireEvent.press(view.getByTestId('new-session-close'));
    await afterSheet();
    expect(mockStartSession).toHaveBeenCalledTimes(2);
  });

  it('"+ Nueva sesión" after a completed session opens the same sheet; without routines it offers creating one', async () => {
    const data = homeData();
    data.training.workoutStartRoutines = { status: 'ok', data: [] };
    mockFetchHome.mockImplementation(() => ok(data));
    const view = await renderScreen();
    fireEvent.press(view.getByRole('button', { name: '+ Nueva sesión' }));
    fireEvent.press(view.getByTestId('new-session-choose'));
    expect(view.getByText('Todavía no tenés rutinas.')).toBeTruthy();
    fireEvent.press(view.getByTestId('new-session-create'));
    await afterSheet();
    expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/train/routines');
    expect(mockStartSession).not.toHaveBeenCalled();
  });

  it('opens each progress detail preserving its period and exercise identity', async () => {
    const view = await renderScreen();
    fireEvent.press(view.getByTestId('home-progress-records'));
    fireEvent.press(view.getByTestId('home-progress-weight'));
    expect(mockPush.mock.calls).toEqual([
      [{ pathname: '/(tabs)/progress/trends/exercise/[id]', params: { id: 'bench-id', period: '30' } }],
      [{ pathname: '/(tabs)/progress/trends/body', params: { period: '7' } }],
    ]);
  });

  it('passes the Google photo from the session to the avatar', async () => {
    const view = await renderScreen();
    expect(view.getByTestId('home-avatar-photo', { includeHiddenElements: true }).props.source).toEqual({ uri: 'https://lh3.googleusercontent.com/a/p' });
  });

  it('without any confirmed Home read, shows the unavailable state with an explicit retry', async () => {
    mockFetchHome.mockImplementation(() => Promise.resolve({ status: 'unavailable', reason: 'network', meta }));
    const view = await renderScreen();
    expect(view.getByTestId('home-unavailable')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Reintentar' }));
    await settle();
    expect(mockFetchHome).toHaveBeenCalledTimes(2);
  });
});
