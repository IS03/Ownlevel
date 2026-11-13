import { act, fireEvent, render, renderHook, waitFor, within } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { clearConfirmedReads, confirmedReads, invalidateConfirmedReads } from '@/api/confirmed-read-cache';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { MobileHomeResponse } from '@/api/home';
import { OwnlevelThemeProvider } from '@/design-system';

import { HOME_FOCUS_REFRESH_MS, useHomeResources } from './home-data';
import { HomeScreen } from './home-screen';
import { sharedHomeRead } from './shared-home-read';
import { homeProgressHabits, homeProgressBody, homeProgressRecords, homeProgressTraining } from './home-test-fixtures';

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
  useFocusEffect: (effect: () => void) => {
    jest.requireActual<typeof import('react')>('react').useEffect(() => {
      mockFocusEffects.push(effect);
      return () => { const i = mockFocusEffects.indexOf(effect); if (i >= 0) mockFocusEffects.splice(i, 1); };
    }, [effect]);
  },
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
// /home is read through the shared retained reading (#303 C2), which imports it from its module.
jest.mock('@/api/home', () => ({ ...jest.requireActual<object>('@/api/home'), fetchMobileHome: (...args: unknown[]) => mockFetchHome(...args) }));
jest.mock('@/api/history', () => ({ fetchHistoryDay: (c: unknown, d: string) => mockFetchDay(c, d) }));
jest.mock('@/api/nutrition-report', () => ({ ...jest.requireActual<typeof import('@/api/nutrition-report')>('@/api/nutrition-report'), fetchNutritionReport: (c: unknown, q: unknown) => mockFetchReport(c, q) }));
jest.mock('@/api/training-history', () => ({
  fetchTrainingDay: (client: unknown, date: string) => mockFetchTrainingDay(client, date),
  // The single weekday read, served from the same per-day fixtures: same data, one request.
  fetchTrainingWeekdaySessions: async (client: unknown, date: string, weeks: number) => {
    const dates = Array.from({ length: weeks + 1 }, (_, i) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 7 * i); return d.toISOString().slice(0, 10); });
    const days = await Promise.all(dates.map(day => mockFetchTrainingDay(client, day))) as { status: string; meta: unknown; data: { sessions: { id: string; routineId: string | null; logDate: string }[] } }[];
    const failed = days.find(day => day.status !== 'ok');
    if (failed) return failed;
    const sessions = days.flatMap(day => day.data.sessions.map(({ id, routineId, logDate }) => ({ id, routineId, logDate })));
    return { status: 'ok', meta: days[0]?.meta, data: { date, weeks, sessions } };
  },
  fetchTrainingHistory: (...args: unknown[]) => mockFetchHistory(...args),
}));
jest.mock('@/api/progress', () => ({
  ...jest.requireActual<object>('@/api/progress'),
  fetchProgressHabitWeek: (...args: unknown[]) => mockFetchHabits(...args),
  fetchProgressBody: (...args: unknown[]) => mockFetchProgressBody(...args),
  fetchProgressTraining: (...args: unknown[]) => mockFetchProgressWeek(...args),
  fetchProgressTrainingRecords: (...args: unknown[]) => mockFetchProgressRecords(...args),
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
let blurHome: (() => void) | void;
let appStateListeners: ((state: string) => void)[] = [];
const focus = async () => { act(() => { const cleanups = mockFocusEffects.slice().map(effect => (effect as () => (() => void) | void)()); blurHome = () => cleanups.forEach(cleanup => cleanup?.()); }); await settle(); };
const blur = () => { blurHome?.(); blurHome = undefined; };
/** The app goes to the background and comes back (lock/unlock, app switcher). */
const foreground = async () => {
  const listeners = appStateListeners.map(listener => listener as (state: string) => void);
  act(() => { listeners.forEach(listener => listener('background')); listeners.forEach(listener => listener('active')); });
  await settle();
};
const allFetchers = () => [mockFetchHome, mockFetchDay, mockFetchReport, mockFetchHistory,
  mockFetchHabits, mockFetchProgressBody, mockFetchProgressRecords];

describe('Home screen', () => {
  beforeEach(() => {
    clearConfirmedReads(mockApiClient as never);
    clock = SATURDAY_NIGHT.getTime();
    // The retained readings (the shared /home included) age on the same clock as the screen.
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    mockFocusEffects.length = 0;
    appStateListeners = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListeners.push(listener as (state: string) => void);
      return { remove: () => { appStateListeners = appStateListeners.filter(item => item !== listener); } } as never;
    });
    mockStartSession.mockReset();
    for (const mock of [mockNavigate, mockPush, mockConfigOpen, mockFetchProgressWeek, ...allFetchers()]) mock.mockReset();
    mockFetchHome.mockImplementation(() => ok(homeData()));
    mockFetchDay.mockImplementation(() => ok(historyDay));
    mockFetchReport.mockImplementation(() => ok(report));
    mockFetchHistory.mockImplementation(() => ok({ sessions: [], nextCursor: null }));
    mockFetchHabits.mockImplementation(() => ok(homeProgressHabits()));
    mockFetchProgressBody.mockImplementation(() => ok(homeProgressBody()));
    mockFetchProgressWeek.mockImplementation(() => ok(homeProgressTraining()));
    mockFetchProgressRecords.mockImplementation(() => ok(homeProgressRecords()));
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

  it('returning to the foreground re-reads Home only while it is the visible tab', async () => {
    await renderScreen();
    await focus(); // first focus = initial reads
    for (const fetcher of allFetchers()) expect(fetcher).toHaveBeenCalledTimes(1);
    await foreground();
    for (const fetcher of allFetchers()) expect(fetcher).toHaveBeenCalledTimes(2);
    // Another tab (or the active session) is on screen: unlocking the phone reads nothing for a hidden Home.
    blur();
    await foreground(); await foreground();
    for (const fetcher of allFetchers()) expect(fetcher).toHaveBeenCalledTimes(2);
    // Shown again after the interval: it catches up on focus, the full history included.
    clock += HOME_FOCUS_REFRESH_MS + 1_000;
    await focus();
    for (const fetcher of allFetchers()) expect(fetcher).toHaveBeenCalledTimes(3);
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

  it.each(['focus', 'manual'] as const)('refreshing via %s after a write supersedes a pending pre-write read', async trigger => {
    let finish!: (result: unknown) => void;
    const old = homeData(), fresh = homeData();
    fresh.profile = { status: 'ok', data: { displayName: 'Perfil actualizado' } };
    mockFetchHome.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockImplementation(() => ok(fresh));
    const hook = renderHook(() => useHomeResources(mockApiClient as never, now));
    await settle();
    await focus();
    const signal = mockFetchHome.mock.calls[0][1] as AbortSignal;
    invalidateConfirmedReads(mockApiClient as never, '/api/mobile/v1/nutrition/days/2026-10-10/meals');
    clock += 1_000;
    if (trigger === 'focus') await focus();
    else await act(async () => { hook.result.current.refresh(); });
    await act(async () => { finish({ status: 'ok', data: old, meta }); });
    await settle();
    expect(mockFetchHome).toHaveBeenCalledTimes(2);
    expect(signal.aborted).toBe(true);
    expect(hook.result.current.home.state).toMatchObject({ status: 'ready', current: { data: fresh } });
    hook.unmount();
    clearConfirmedReads(mockApiClient as never);
  });

  describe('selective revalidation by write domain (#303 C1; simulated request counts, not network measurements)', () => {
    const named = () => ({ home: mockFetchHome, today: mockFetchDay, calories: mockFetchReport, habits: mockFetchHabits,
      training: mockFetchHistory, progressBody: mockFetchProgressBody, progressRecords: mockFetchProgressRecords });
    const counts = () => Object.fromEntries(Object.entries(named()).map(([name, fetcher]) => [name, fetcher.mock.calls.length]));
    /** Reads issued between two snapshots, by name. */
    const issued = (before: Record<string, number>) => Object.entries(counts()).filter(([name, n]) => n > before[name]).map(([name]) => name).sort();
    async function focusedHome() {
      await renderScreen();
      await focus(); // first focus = initial reads
      clock += 1_000;
      return counts();
    }

    // Before C1 any settled write re-read all 7 Home reads on the next focus inside the interval.
    it.each([
      ['a meal (Nutrición)', '/api/mobile/v1/nutrition/days/2026-10-10/meals', ['calories', 'habits', 'home', 'today']],
      ['a daily metric value', '/api/mobile/v1/nutrition/days/2026-10-10/metrics', ['calories', 'habits', 'home', 'today']],
      ['a weight (Cuerpo)', '/api/mobile/v1/body/weights/2026-10-10', ['calories', 'home', 'progressBody', 'today']],
      ['a finished session (Entrenar)', '/api/mobile/v1/training/sessions/s/finish', ['calories', 'home', 'progressRecords', 'today', 'training']],
      ['a metric definition (Ajustes)', '/api/mobile/v1/metrics/definitions/m1', ['habits', 'today']],
      ['physical data (body, nutrition and metrics)', '/api/mobile/v1/profile/physical', ['calories', 'habits', 'home', 'progressBody', 'today']],
      ['a Progreso view', '/api/mobile/v1/progress/views/order', []],
      ['an insight dismissal', '/api/mobile/v1/progress/insight/dismiss', []],
      ['an unmapped write (profile): uncertain, so everything', '/api/mobile/v1/profile', ['calories', 'habits', 'home', 'progressBody', 'progressRecords', 'today', 'training']],
    ])('after %s, focus re-reads only the reads of its domains', async (_name, path, expected) => {
      const before = await focusedHome();
      invalidateConfirmedReads(mockApiClient as never, path);
      await focus();
      expect(issued(before)).toEqual(expected);
      for (const name of expected) expect(counts()[name]).toBe(before[name] + 1); // once each, no duplicate
      // Caught up: the next focus inside the interval reads nothing more.
      const after = counts();
      clock += 1_000;
      await focus();
      expect(counts()).toEqual(after);
      // The interval still refreshes everything, measured from the last full refresh.
      clock += HOME_FOCUS_REFRESH_MS;
      await focus();
      expect(issued(after)).toEqual(Object.keys(named()).sort());
    });

    it('a pre-write read of an affected block is dropped; an unaffected read in flight is kept, not repeated', async () => {
      let finishBody!: (result: unknown) => void, finishHistory!: (result: unknown) => void;
      const freshBody = homeProgressBody(), oldBody = homeProgressBody();
      mockFetchProgressBody.mockImplementationOnce(() => new Promise(resolve => { finishBody = resolve; })).mockImplementation(() => ok(freshBody));
      mockFetchHistory.mockImplementationOnce(() => new Promise(resolve => { finishHistory = resolve; }));
      const hook = renderHook(() => useHomeResources(mockApiClient as never, now));
      await settle();
      await focus();
      const bodySignal = mockFetchProgressBody.mock.calls[0][2] as AbortSignal;
      const historySignal = mockFetchHistory.mock.calls[0][2] as AbortSignal;
      invalidateConfirmedReads(mockApiClient as never, '/api/mobile/v1/body/weights/2026-10-10');
      clock += 1_000;
      await focus();
      await act(async () => { finishBody({ status: 'ok', data: oldBody, meta }); finishHistory({ status: 'ok', data: { sessions: [], nextCursor: null }, meta }); });
      await settle();
      expect(mockFetchProgressBody).toHaveBeenCalledTimes(2);
      expect(bodySignal.aborted).toBe(true);
      expect(hook.result.current.progressBody.state).toMatchObject({ status: 'ready', current: { data: freshBody } });
      expect(hook.result.current.progressBody.state.status === 'ready' && hook.result.current.progressBody.state.current.data).not.toBe(oldBody);
      // Training history does not depend on a weight: its read was not cancelled nor issued again.
      expect(mockFetchHistory).toHaveBeenCalledTimes(1);
      expect(historySignal.aborted).toBe(false);
      expect(hook.result.current.training.state.status).toBe('ready');
      hook.unmount();
    });

    it('pull-to-refresh still refreshes every block, after an unrelated write too', async () => {
      const hook = renderHook(() => useHomeResources(mockApiClient as never, now));
      await settle();
      await focus();
      const before = counts();
      invalidateConfirmedReads(mockApiClient as never, '/api/mobile/v1/progress/views/order');
      clock += 1_000;
      await act(async () => { hook.result.current.refresh(); });
      await settle();
      expect(issued(before)).toEqual(Object.keys(named()).sort());
      hook.unmount();
    });

    it('a failed (offline) block recovers on the next write of its domain or on pull-to-refresh, never shown as zero', async () => {
      mockFetchProgressBody.mockImplementationOnce(() => Promise.resolve({ status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } }));
      const hook = renderHook(() => useHomeResources(mockApiClient as never, now));
      await settle();
      await focus();
      expect(hook.result.current.progressBody.state.status).toBe('unavailable');
      // A meal does not touch the body read: it stays in its honest error state (no retry storm, no fake data).
      invalidateConfirmedReads(mockApiClient as never, '/api/mobile/v1/nutrition/days/2026-10-10/meals');
      clock += 1_000;
      await focus();
      expect(mockFetchProgressBody).toHaveBeenCalledTimes(1);
      expect(hook.result.current.progressBody.state.status).toBe('unavailable');
      // A weight does: the block reads again and recovers.
      invalidateConfirmedReads(mockApiClient as never, '/api/mobile/v1/body/weights/2026-10-10');
      clock += 1_000;
      await focus();
      expect(mockFetchProgressBody).toHaveBeenCalledTimes(2);
      expect(hook.result.current.progressBody.state.status).toBe('ready');
      hook.unmount();
    });

    it('a write from Home (daily metric) reloads its blocks now; the habit week it also moved follows on the next focus', async () => {
      const hook = renderHook(() => useHomeResources(mockApiClient as never, now));
      await settle();
      await focus();
      const before = counts();
      invalidateConfirmedReads(mockApiClient as never, '/api/mobile/v1/nutrition/days/2026-10-10/metrics');
      await act(async () => { hook.result.current.invalidate(); });
      await settle();
      expect(issued(before)).toEqual(['calories', 'home', 'today']);
      const afterInvalidate = counts();
      clock += 1_000;
      await focus();
      expect(issued(afterInvalidate)).toEqual(['habits']);
      hook.unmount();
    });

    it('a write of another account never revalidates this one', async () => {
      const otherAccount = {};
      const before = await focusedHome();
      invalidateConfirmedReads(otherAccount as never, '/api/mobile/v1/profile');
      await focus();
      expect(counts()).toEqual(before);
      clearConfirmedReads(otherAccount as never);
    });
  });

  describe('the /home reading shared with Entrenar (#303 C2; simulated request counts)', () => {
    const fromEntrenar = (day = '2026-10-10') => act(async () => {
      await confirmedReads(mockApiClient as never).ensure(sharedHomeRead(mockApiClient as never, day), 'initial');
    });
    it('back from Entrenar after the interval, Inicio reuses the /home it confirmed under 30 s ago; its other reads refresh', async () => {
      await renderScreen();
      await focus(); // first focus = initial reads
      clock += HOME_FOCUS_REFRESH_MS + 5_000;
      await fromEntrenar(); // Entrenar re-read /home (its own window had expired)
      expect(mockFetchHome).toHaveBeenCalledTimes(2);
      clock += 5_000;
      await focus(); // Inicio's interval elapsed: everything refreshes, but /home is 5 s old
      expect(mockFetchHome).toHaveBeenCalledTimes(2); // before C2: 3
      for (const fetcher of [mockFetchDay, mockFetchReport, mockFetchHabits, mockFetchHistory, mockFetchProgressBody, mockFetchProgressRecords]) {
        expect(fetcher).toHaveBeenCalledTimes(2);
      }
    });
    it('a reading Entrenar confirmed before a write of its domains is not reused', async () => {
      await renderScreen();
      await focus();
      clock += HOME_FOCUS_REFRESH_MS + 5_000;
      await fromEntrenar();
      invalidateConfirmedReads(mockApiClient as never, '/api/mobile/v1/nutrition/days/2026-10-10/meals');
      clock += 1_000;
      await focus();
      expect(mockFetchHome).toHaveBeenCalledTimes(3);
    });
    it('Inicio opening after Entrenar shows its /home at once, with no request of its own', async () => {
      await fromEntrenar();
      expect(mockFetchHome).toHaveBeenCalledTimes(1);
      const view = await renderScreen();
      expect(mockFetchHome).toHaveBeenCalledTimes(1); // before C2: 2
      expect(mockFetchDay).toHaveBeenCalledTimes(1);
      expect(view.queryByTestId('home-nutrition-loading')).toBeNull();
    });
    it('pull-to-refresh always reads /home again', async () => {
      const hook = renderHook(() => useHomeResources(mockApiClient as never, now));
      await settle();
      await focus();
      expect(mockFetchHome).toHaveBeenCalledTimes(1);
      await act(async () => { hook.result.current.refresh(); });
      await settle();
      expect(mockFetchHome).toHaveBeenCalledTimes(2);
      hook.unmount();
    });
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

  it('opens the contextual measure note in the body detail of that measure', async () => {
    const body = homeProgressBody();
    const latest = { date: '2026-10-07', value: 90.5, imported: false, provenanceLabel: 'Registro' };
    body.metrics.push({ key: 'body.waist', label: 'Cintura', unit: 'cm', latest, first: latest, last: latest, change: null, referenceChange: null, trend: 'unavailable',
      confidence: 'unavailable', observations: [latest], referenceCount: 0, comparison: { status: 'insufficient_data', reason: 'insufficient_previous_samples' } });
    mockFetchProgressBody.mockImplementation(() => ok(body));
    const view = await renderScreen();
    fireEvent.press(view.getByTestId('home-progress-measure'));
    // The Body route reads `from`/`to` only, never `period`: the link carries the window that contains the record.
    expect(mockPush.mock.calls).toEqual([[{ pathname: '/(tabs)/progress/trends/body', params: { metric: 'body.waist', from: '2026-09-10', to: '2026-10-10' } }]]);
  });

  it('a measure recorded 20 days ago opens its detail with an explicit from/to (the Body route ignores period), and Peso and Récords keep theirs', async () => {
    const body = homeProgressBody();
    const latest = { date: '2026-09-20', value: 90.5, imported: false, provenanceLabel: 'Registro' };
    body.metrics.push({ key: 'body.waist', label: 'Cintura', unit: 'cm', latest, first: latest, last: latest, change: null, referenceChange: null, trend: 'unavailable',
      confidence: 'unavailable', observations: [latest], referenceCount: 0, comparison: { status: 'insufficient_data', reason: 'insufficient_previous_samples' } });
    mockFetchProgressBody.mockImplementation(() => ok(body));
    const view = await renderScreen();
    fireEvent.press(view.getByTestId('home-progress-measure'));
    fireEvent.press(view.getByTestId('home-progress-weight'));
    fireEvent.press(view.getByTestId('home-progress-records'));
    expect(mockPush.mock.calls).toEqual([
      [{ pathname: '/(tabs)/progress/trends/body', params: { metric: 'body.waist', from: '2026-09-10', to: '2026-10-10' } }],
      [{ pathname: '/(tabs)/progress/trends/body', params: { period: '7' } }],
      [{ pathname: '/(tabs)/progress/trends/exercise/[id]', params: { id: 'bench-id', period: '30' } }],
    ]);
    expect(mockPush.mock.calls[0]![0]).not.toHaveProperty('params.period');
    // Navigating asks for nothing: the same reads, once each.
    for (const fetcher of allFetchers()) expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('choosing the Progreso notes asks for nothing new: the same reads, once each, and no network of its own', async () => {
    const body = homeProgressBody();
    const latest = { date: '2026-10-07', value: 90.5, imported: false, provenanceLabel: 'Registro' };
    body.metrics.push({ key: 'body.waist', label: 'Cintura', unit: 'cm', latest, first: latest, last: latest, change: null, referenceChange: null, trend: 'unavailable',
      confidence: 'unavailable', observations: [latest], referenceCount: 0, comparison: { status: 'insufficient_data', reason: 'insufficient_previous_samples' } });
    mockFetchProgressBody.mockImplementation(() => ok(body));
    const originalFetch = globalThis.fetch;
    const rawFetch = jest.fn<typeof fetch>(() => Promise.reject(new Error('Home must not fetch on its own')));
    globalThis.fetch = rawFetch;
    try {
      const view = await renderScreen();
      expect(view.getByTestId('home-progress-measure')).toBeTruthy();
      // Exactly the reads Home already had: body 7 d and records 30 d, once each, and nothing for measures.
      for (const fetcher of allFetchers()) expect(fetcher).toHaveBeenCalledTimes(1);
      expect(mockFetchProgressBody.mock.calls.map(call => call[1])).toEqual([{ period: '7' }]);
      expect(mockFetchProgressRecords.mock.calls.map(call => call[1])).toEqual([{ period: '30' }]);
      expect(mockFetchProgressWeek).not.toHaveBeenCalled();
      // Opening every note navigates only: no read is triggered.
      for (const id of ['records', 'weight', 'measure']) fireEvent.press(view.getByTestId(`home-progress-${id}`));
      await settle();
      for (const fetcher of allFetchers()) expect(fetcher).toHaveBeenCalledTimes(1);
      expect(rawFetch).not.toHaveBeenCalled();
    } finally { globalThis.fetch = originalFetch; }
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
