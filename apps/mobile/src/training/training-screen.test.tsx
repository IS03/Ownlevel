import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { clearConfirmedReads, invalidateConfirmedReads } from '@/api/confirmed-read-cache';
import { Alert, RefreshControl } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { MobileHomeResponse } from '@/api/home';
import type { TrainingHistorySession } from '@/api/training-history';
import { OwnlevelThemeProvider } from '@/design-system';
import { TrainingScreen } from './training-screen';

const mockHome = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockTraining = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockHistory = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockRoutines = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockStart = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockTrainingDay = jest.fn<(client: unknown, date: string) => Promise<unknown>>();
const mockPush = jest.fn(); const mockReplace = jest.fn(); const mockHaptic = jest.fn();
const mockClient = {};
const mockFocus: (() => void)[] = [];
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const routineId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const active = { id: sessionId, routineId, name: 'PUSH', logDate: '2026-10-07', startedAt: '2026-10-07T12:00:00Z' };
const now = () => new Date('2026-10-07T18:00:00Z');

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@expo/ui', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Host: View, RNHostView: View, BottomSheet: ({ isPresented, children }: { isPresented: boolean; children: React.ReactNode }) => isPresented ? <View>{children}</View> : null };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }), useFocusEffect: (effect: () => void) => { mockFocus.push(effect); } }));
jest.mock('@/api/home', () => ({ fetchMobileHome: (...args: unknown[]) => mockHome(...args) }));
jest.mock('@/api/training', () => ({ fetchMobileTraining: (...args: unknown[]) => mockTraining(...args) }));
jest.mock('@/api/training-history', () => ({
  fetchTrainingDay: (client: unknown, date: string) => mockTrainingDay(client, date),
  fetchTrainingHistory: (...args: unknown[]) => mockHistory(...args),
}));
jest.mock('@/api', () => ({
  useMobileApi: () => ({ client: mockClient }),
  useApiResource: (jest.requireActual('@/api/resource') as typeof import('@/api/resource')).useApiResource,
  fetchMobileTraining: (...args: unknown[]) => mockTraining(...args),
  fetchMobileTrainingRoutines: (...args: unknown[]) => mockRoutines(...args),
  startMobileTrainingSession: (...args: unknown[]) => mockStart(...args),
}));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: () => mockHaptic() } }));
// The SwiftUI calendar (iOS 26) is native; these tests drive the React Native version, same behavior.
// The anchored native confirmation (iOS) has its own platform file; here it renders its choice.
jest.mock('./start-confirm', () => ({
  StartConfirm: ({ onCancel, onConfirm, open, routineName }: { onCancel: () => void; onConfirm: () => void; open: boolean; routineName: string }) => {
    const { Pressable, Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
    return open ? <View><Pressable accessibilityRole="button" onPress={onConfirm}><Text>Empezar {routineName}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onCancel}><Text>Cancelar</Text></Pressable></View> : null;
  },
}));
jest.mock('./new-session-sheet', () => ({
  NewSessionSheet: (jest.requireActual('./new-session-sheet-rn') as typeof import('./new-session-sheet-rn')).NewSessionSheetRN,
}));
jest.mock('./training-week-calendar', () => ({
  TrainingWeekCalendar: (jest.requireActual('./training-week-calendar-rn') as typeof import('./training-week-calendar-rn')).TrainingWeekCalendarRN,
}));

const ok = <T,>(data: T) => ({ status: 'ok', data, meta });
type AlertButton = { text?: string; onPress?: () => void };
const lastAlert = () => {
  const call = (Alert.alert as unknown as jest.Mock).mock.calls.at(-1) as [string, string | undefined, AlertButton[]] | undefined;
  return call ? { buttons: call[2], title: call[0] } : null;
};
const pressAlert = (label: string) => act(() => { lastAlert()!.buttons.find(button => button.text === label)!.onPress?.(); });
async function play(view: ReturnType<typeof renderScreen>, name = 'PUSH') {
  await waitFor(() => expect(view.getByRole('button', { name: `Iniciar ${name}` })).toBeTruthy());
  fireEvent.press(view.getByRole('button', { name: `Iniciar ${name}` }));
  expect(mockStart).not.toHaveBeenCalled(); // ▶ only asks
  fireEvent.press(view.getByRole('button', { name: `Empezar ${name}` }));
}
const session = (id: string, date: string, name = 'PUSH', minutes = 74, hour = 12): TrainingHistorySession => ({
  id, routineId, routineName: name, routineColor: 'blue', logDate: date, startedAt: `${date}T${String(hour).padStart(2, '0')}:00:00Z`, endedAt: `${date}T13:00:00Z`,
  durationMilliseconds: minutes * 60_000, exercisesCompleted: 8, completedSets: 21, volumeKg: null,
});
function home(): MobileHomeResponse {
  return { date: '2026-10-07', profile: { status: 'unavailable' }, nutrition: { status: 'unavailable' }, training: {
    activeSession: { status: 'ok', data: null }, week: { status: 'unavailable' },
    workoutStartRoutines: { status: 'ok', data: [
      { id: routineId, name: 'PUSH', color: 'blue', exerciseCount: 8, setCount: 24 },
      { id: 'r2', name: 'PULL', color: null, exerciseCount: 10, setCount: 26 },
      { id: 'r3', name: 'LEGS', color: 'green', exerciseCount: 8, setCount: 24 },
      { id: 'r4', name: 'ABS', color: 'violet', exerciseCount: 4, setCount: 12 },
    ] },
  } };
}
function renderScreen() {
  return render(<SafeAreaProvider initialMetrics={{ frame: { height: 844, width: 390, x: 0, y: 0 }, insets: { top: 47, bottom: 34, left: 0, right: 0 } }}>
    <OwnlevelThemeProvider initialMode="light"><TrainingScreen now={now} /></OwnlevelThemeProvider>
  </SafeAreaProvider>);
}
describe('Training native hub', () => {
  beforeEach(() => {
    mockFocus.length = 0;
    [mockHome, mockTraining, mockHistory, mockRoutines, mockStart, mockPush, mockReplace, mockHaptic, mockTrainingDay].forEach(mock => mock.mockReset());
    mockTrainingDay.mockImplementation(async (_client, date) => ok({ date, sessions: [], summary: { sessionCount: 0, exercisesCompleted: 0, completedSets: 0, durationMilliseconds: null, volumeKg: null } }));
    mockHome.mockResolvedValue(ok(home()));
    mockTraining.mockImplementation(async (_client, month) => ok({ activeSession: { status: 'ok', data: null }, calendar: { status: 'ok', data: { month, days: month === '2026-10' ? [
      { date: '2026-10-05', colors: ['blue', 'rose'] }, { date: '2026-10-07', colors: ['blue'] },
    ] : [] } } }));
    mockHistory.mockResolvedValue(ok({ sessions: [session('today', '2026-10-07'), session('monday', '2026-10-05', 'PULL')], nextCursor: null }));
    mockRoutines.mockResolvedValue(ok({ routines: { status: 'ok', data: [{ id: routineId, name: 'PUSH', color: 'blue', order: 1, isActive: true, exerciseCount: 8, setCount: 24 }] }, initialPlan: { status: 'ok', data: { imported: true, routinesFound: 1 } } }));
    mockStart.mockResolvedValue({ status: 'ok', data: { status: 'started', session: active }, meta });
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });
  it('coming back re-reads only expired reads, or everything after a settled write', async () => {
    const view = renderScreen(); await waitFor(() => expect(view.getByRole('button', { name: 'Iniciar LEGS' })).toBeTruthy());
    const reads = () => mockHome.mock.calls.length + mockTraining.mock.calls.length + mockHistory.mock.calls.length;
    const initial = reads();
    await act(async () => { mockFocus.at(-1)!(); });
    expect(reads()).toBe(initial); // back from Rutinas/Historial a moment later: nothing re-read
    invalidateConfirmedReads(mockClient as never, '/api/mobile/v1/training/sessions/s/finish');
    await act(async () => { mockFocus.at(-1)!(); });
    expect(mockHome.mock.calls.length).toBe(2); expect(mockHistory.mock.calls.length).toBe(2);
    const afterWrite = reads(), start = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(start + 31_000);
    await act(async () => { mockFocus.at(-1)!(); });
    expect(reads()).toBe(afterWrite + 4); // home, the two distinct months and the week: the window expired
    jest.mocked(Date.now).mockRestore(); clearConfirmedReads(mockClient as never);
  });
  it('returning after a write drops an older pending hub read even if its response arrives last', async () => {
    let finish!: (result: unknown) => void;
    const old = home(), fresh = home();
    if (fresh.training.workoutStartRoutines.status === 'ok') fresh.training.workoutStartRoutines.data[0].name = 'ACTUALIZADA';
    mockHome.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(ok(fresh));
    const view = renderScreen();
    await act(async () => { mockFocus.at(-1)!(); });
    const signal = mockHome.mock.calls[0][1] as AbortSignal;
    invalidateConfirmedReads(mockClient as never, '/api/mobile/v1/training/sessions/s/finish');
    await act(async () => { mockFocus.at(-1)!(); });
    await act(async () => { finish(ok(old)); });
    expect(mockHome).toHaveBeenCalledTimes(2);
    expect(signal.aborted).toBe(true);
    expect(view.getByRole('button', { name: 'Iniciar ACTUALIZADA' })).toBeTruthy();
    clearConfirmedReads(mockClient as never);
  });
  it('shows skeleton then manual first three routines, without recency reads', async () => {
    const view = renderScreen(); expect(view.getByTestId('training-loading')).toBeTruthy();
    await waitFor(() => expect(view.getByRole('button', { name: 'Iniciar LEGS' })).toBeTruthy());
    expect(view.getAllByRole('button').filter(node => node.props.accessibilityLabel?.startsWith('Iniciar ')).map(node => node.props.accessibilityLabel)).toEqual(['Iniciar PUSH', 'Iniciar PULL', 'Iniciar LEGS']);
    expect(view.queryByRole('button', { name: 'Iniciar ABS' })).toBeNull();
    expect(mockTraining.mock.calls.map(call => call[1]).sort()).toEqual(['2026-09', '2026-10']);
    expect(mockHistory).toHaveBeenCalledTimes(1); expect(mockStart).not.toHaveBeenCalled();
  });
  it('pinned week: no title or month row; trained days filled, today with its halo; tapping it expands the month in place, the backdrop closes it', async () => {
    const view = renderScreen(); await waitFor(() => expect(view.getByTestId('training-today-single')).toBeTruthy());
    expect(view.queryByRole('header', { name: 'Entrenar' })).toBeNull();
    expect(view.queryByText(/días entrenados/)).toBeNull();
    expect(view.getByTestId('training-day-filled-2026-10-05')).toBeTruthy();
    expect(view.getByTestId('training-day-filled-2026-10-07')).toBeTruthy();
    expect(view.getByTestId('training-day-halo-2026-10-07')).toBeTruthy();
    expect(view.queryByTestId('training-day-filled-2026-10-06')).toBeNull();
    fireEvent.press(view.getByTestId('training-week-strip'));
    const month = within(view.getByTestId('training-month-calendar'));
    expect(month.getByRole('header', { name: 'Octubre 2026' })).toBeTruthy();
    expect(month.queryByText(/días entrenados/)).toBeNull();
    expect(view.getByTestId('training-week-day-2026-10-05')).toBeTruthy(); // the strip stays on top
    expect(mockPush).not.toHaveBeenCalled();
    fireEvent.press(view.getByTestId('training-calendar-backdrop'));
    expect(view.queryByTestId('training-month-calendar')).toBeNull();
    fireEvent.press(view.getByTestId('training-week-strip'));
    fireEvent.press(view.getByTestId('training-week-strip')); // tapping the strip again closes it too
    expect(view.queryByTestId('training-month-calendar')).toBeNull();
    expect(mockHistory).toHaveBeenCalledTimes(1);
  });
  it('one session today: "Hecho" with its detail; Ver sesión opens it; Entrenar otra vez opens the start flow; library and routine rows route as before', async () => {
    const view = renderScreen(); await waitFor(() => expect(view.getByTestId('training-today-single')).toBeTruthy());
    expect(view.getByText('Miércoles 7 de octubre')).toBeTruthy();
    expect(view.getByTestId('training-done-chip')).toBeTruthy();
    expect(view.getByText('74 min · 21 series · 8 ejercicios')).toBeTruthy();
    fireEvent.press(view.getByTestId('training-view-session')); expect(mockPush).toHaveBeenCalledWith('/(tabs)/train/history/today');
    for (const [label, route] of [['Rutinas', 'routines'], ['Ejercicios', 'exercises'], ['Historial', 'history']]) {
      fireEvent.press(view.getByRole('button', { name: `Abrir ${label}` })); expect(mockPush).toHaveBeenCalledWith(`/(tabs)/train/${route}`);
    }
    fireEvent.press(view.getByRole('button', { name: 'PUSH, 8 ejercicios, hoy' })); expect(mockPush).toHaveBeenCalledWith(`/(tabs)/train/routines/${routineId}`);
    expect(mockStart).not.toHaveBeenCalled();
    // "Entrenar otra vez" opens the new session sheet; a free session starts once it is gone.
    fireEvent.press(view.getByRole('button', { name: 'Entrenar otra vez' }));
    expect(view.getByTestId('new-session-start')).toBeTruthy();
    fireEvent.press(view.getByTestId('new-session-free'));
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(mockStart.mock.calls[0]?.[1]).toMatchObject({ routineId: null });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(`/(tabs)/train/session/${sessionId}`));
  });
  it('several sessions today: the longest is the main one, the rest under "También hoy", more than three link to the day', async () => {
    mockHistory.mockResolvedValue(ok({ sessions: [session('abs', '2026-10-07', 'ABS', 14, 9), session('today', '2026-10-07', 'PUSH', 81, 12),
      session('arms', '2026-10-07', 'BRAZOS', 31, 15), session('core', '2026-10-07', 'CORE', 10, 16), session('walk', '2026-10-07', 'CAMINATA', 20, 17)], nextCursor: null }));
    const view = renderScreen(); await waitFor(() => expect(view.getByTestId('training-today-multiple')).toBeTruthy());
    expect(view.getByRole('header', { name: 'PUSH' })).toBeTruthy();
    expect(view.getByText('También hoy')).toBeTruthy();
    expect(['training-other-arms', 'training-other-walk', 'training-other-abs'].map(id => view.getByTestId(id).props.accessibilityLabel))
      .toEqual(['BRAZOS, 31 min · 21 series', 'CAMINATA, 20 min · 21 series', 'ABS, 14 min · 21 series']);
    expect(view.queryByTestId('training-other-core')).toBeNull();
    fireEvent.press(view.getByTestId('training-other-abs')); expect(mockPush).toHaveBeenCalledWith('/(tabs)/train/history/abs');
    fireEvent.press(view.getByRole('button', { name: 'Ver las 1 restantes' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/history', params: { date: '2026-10-07' } });
  });
  it('nothing finished today: date, weekday and "Nueva sesión", which opens the start flow', async () => {
    mockHistory.mockResolvedValue(ok({ sessions: [session('monday', '2026-10-05', 'PULL')], nextCursor: null }));
    const view = renderScreen(); await waitFor(() => expect(view.getByTestId('training-today-empty')).toBeTruthy());
    expect(view.getByText('7 de octubre')).toBeTruthy(); expect(view.getByRole('header', { name: 'Miércoles' })).toBeTruthy();
    expect(view.getByText('Elegí una rutina o entrená libre')).toBeTruthy();
    expect(view.queryByTestId('training-done-chip')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Nueva sesión' }));
    // Not enough Wednesdays: no recommendation, only the two other options.
    await waitFor(() => expect(view.queryByTestId('new-session-recommended')).toBeNull());
    fireEvent.press(view.getByTestId('new-session-choose'));
    expect(view.getByTestId('new-session-routines')).toBeTruthy();
    fireEvent.press(view.getByTestId('new-session-back'));
    fireEvent.press(view.getByTestId('new-session-choose'));
    fireEvent.press(view.getByRole('button', { name: /^PUSH, 8 ejercicios · 24 series/ }));
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(mockStart.mock.calls[0]?.[1]).toMatchObject({ routineId });
  });
  it('recommends the routine most often done on this weekday in the last 12 weeks', async () => {
    mockHistory.mockResolvedValue(ok({ sessions: [session('monday', '2026-10-05', 'PULL')], nextCursor: null }));
    mockTrainingDay.mockImplementation(async (_client, date) => ok({ date, sessions: ['2026-09-30', '2026-09-23'].includes(date) ? [session(`w-${date}`, date)] : [],
      summary: { sessionCount: 0, exercisesCompleted: 0, completedSets: 0, durationMilliseconds: null, volumeKg: null } }));
    const view = renderScreen(); await waitFor(() => expect(view.getByTestId('training-today-empty')).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Nueva sesión' }));
    await waitFor(() => expect(view.getByTestId('new-session-recommended')).toBeTruthy());
    expect(view.getByTestId('new-session-recommended').props.accessibilityLabel).toBe('Recomendada para miércoles: PUSH. Más repetida. 8 ejercicios · 24 series');
    fireEvent.press(view.getByTestId('new-session-close'));
    expect(view.queryByTestId('new-session-start')).toBeNull();
    expect(mockStart).not.toHaveBeenCalled();
  });
  it('preserves cached content after failed refresh without claiming false zeros', async () => {
    const view = renderScreen(); await waitFor(() => expect(view.getByTestId('training-today-single')).toBeTruthy());
    const failure = { status: 'unavailable', reason: 'network', meta };
    mockHome.mockResolvedValue(failure); mockTraining.mockResolvedValue(failure); mockHistory.mockResolvedValue(failure);
    await act(async () => fireEvent(view.UNSAFE_getByType(RefreshControl), 'refresh'));
    await waitFor(() => expect(view.getByTestId('training-stale')).toBeTruthy());
    expect(view.getByTestId('training-today-single')).toBeTruthy(); expect(view.queryByTestId('training-today-empty')).toBeNull();
  });
  it('distinguishes unavailable from empty and keeps the normal free-session flow', async () => {
    mockHistory.mockResolvedValue({ status: 'unavailable', reason: 'network', meta });
    const view = renderScreen(); await waitFor(() => expect(view.getByText('No pudimos cargar tus sesiones de hoy.')).toBeTruthy());
    expect(view.queryByTestId('training-today-empty')).toBeNull(); expect(view.queryByText('Elegí una rutina o entrená libre')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Nueva sesión' }));
    await waitFor(() => expect(view.queryByTestId('new-session-recommended')).toBeNull());
    expect(view.getByTestId('new-session-free')).toBeTruthy(); expect(mockStart).not.toHaveBeenCalled();
  });
  it('▶ asks first, then starts once with the shared idempotent flow and no chooser', async () => {
    const view = renderScreen();
    await waitFor(() => expect(view.getByRole('button', { name: 'Iniciar PUSH' })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Iniciar PUSH' }));
    fireEvent.press(view.getByRole('button', { name: 'Cancelar' }));
    expect(view.queryByRole('button', { name: 'Empezar PUSH' })).toBeNull();
    await play(view);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(`/(tabs)/train/session/${sessionId}`));
    expect(mockStart).toHaveBeenCalledTimes(1); expect(mockStart.mock.calls[0]?.[1]).toMatchObject({ routineId, idempotencyKey: expect.any(String) });
    expect(view.queryByRole('radio')).toBeNull(); // the old chooser never shows
  });
  it('an existing active session is offered to continue, with no write', async () => {
    mockTraining.mockImplementation(async (_client, month) => ok({ activeSession: { status: 'ok', data: active }, calendar: { status: 'ok', data: { month, days: [] } } }));
    const view = renderScreen(); await play(view);
    await waitFor(() => expect(lastAlert()?.title).toBe('Ya tenés una sesión en curso')); expect(mockStart).not.toHaveBeenCalled();
    pressAlert('Continuar'); expect(mockReplace).toHaveBeenCalledWith(`/(tabs)/train/session/${sessionId}`);
  });
  it('handles ACTIVE_SESSION_EXISTS from play with the continue choice, no retry', async () => {
    mockStart.mockResolvedValue({ status: 'conflict', code: 'ACTIVE_SESSION_EXISTS', data: { status: 'active', code: 'ACTIVE_SESSION_EXISTS', session: active }, message: 'active', meta });
    const view = renderScreen(); await play(view);
    await waitFor(() => expect(lastAlert()?.title).toBe('Ya tenés una sesión en curso')); expect(mockStart).toHaveBeenCalledTimes(1); expect(mockReplace).not.toHaveBeenCalled();
  });
  it('requires explicit retry after an ambiguous play result, retaining its key', async () => {
    mockStart.mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta });
    const view = renderScreen(); await play(view);
    await waitFor(() => expect(lastAlert()?.title).toBe('No pudimos iniciar el entrenamiento')); expect(mockStart).toHaveBeenCalledTimes(1);
    pressAlert('Reintentar');
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(2)); expect(mockStart.mock.calls[1]?.[1]).toEqual(mockStart.mock.calls[0]?.[1]);
  });
  it('renders a resolved empty month/week honestly and offers routine creation', async () => {
    const data = home(); data.training.workoutStartRoutines = { status: 'ok', data: [] };
    mockHome.mockResolvedValue(ok(data));
    mockTraining.mockImplementation(async (_client, month) => ok({ activeSession: { status: 'ok', data: null }, calendar: { status: 'ok', data: { month, days: [] } } }));
    mockHistory.mockResolvedValue(ok({ sessions: [], nextCursor: null }));
    const view = renderScreen(); await waitFor(() => expect(view.getByTestId('training-today-empty')).toBeTruthy());
    expect(view.queryByRole('button', { name: 'Iniciar PUSH' })).toBeNull();
    expect(view.queryAllByTestId(/training-day-filled-/)).toHaveLength(0);
    fireEvent.press(view.getByRole('button', { name: 'Creá tu primera rutina' })); expect(mockPush).toHaveBeenCalledWith('/(tabs)/train/routines');
    fireEvent.press(view.getByTestId('training-week-strip'));
    const month = within(view.getByTestId('training-month-calendar'));
    expect(month.queryAllByTestId(/training-month-dot-/)).toHaveLength(0);
  });
  it('keeps a missing month unavailable rather than displaying zeros', async () => {
    const failure = { status: 'unavailable', reason: 'network', meta };
    mockTraining.mockResolvedValue(failure); mockHistory.mockResolvedValue(failure);
    const view = renderScreen(); await waitFor(() => expect(view.getByTestId('training-stale')).toBeTruthy());
    expect(view.getByTestId('training-week-day-2026-10-05').props.accessibilityLabel).toBe('Lunes 5, actividad no disponible');
    fireEvent.press(view.getByTestId('training-week-strip'));
    const month = within(view.getByTestId('training-month-calendar'));
    expect(month.queryByText(/^\d+ días entrenados/)).toBeNull(); expect(month.getByText('No pudimos cargar los días entrenados de este mes.')).toBeTruthy();
  });
  it('month: navigates with cached monthly reads (always six weeks, no footer); a past day closes the calendar and opens History; future days are inert', async () => {
    const view = renderScreen(); await waitFor(() => expect(view.getByRole('button', { name: 'Iniciar PUSH' })).toBeTruthy());
    fireEvent.press(view.getByTestId('training-week-strip'));
    const month = () => within(view.getByTestId('training-month-calendar'));
    expect(month().getAllByTestId(/training-month-dot-/)).toHaveLength(2);
    expect(month().getByTestId('training-month-day-2026-10-20').props.accessibilityRole).toBeUndefined();
    fireEvent.press(month().getByRole('button', { name: 'Mes anterior' }));
    expect(month().getByText('Septiembre 2026')).toBeTruthy();
    fireEvent.press(month().getByRole('button', { name: 'Mes siguiente' }));
    expect(mockTraining).toHaveBeenCalledTimes(2); expect(mockHistory).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.press(month().getByRole('button', { name: 'Mes siguiente' })));
    expect(month().getByText('Noviembre 2026')).toBeTruthy(); expect(mockTraining).toHaveBeenCalledTimes(3); expect(mockHistory).toHaveBeenCalledTimes(1);
    fireEvent.press(month().getByRole('button', { name: 'Mes anterior' }));
    expect(month().getByText('Octubre 2026')).toBeTruthy();
    expect(month().queryByText('Ir a hoy')).toBeNull();
    fireEvent.press(month().getByTestId('training-month-day-2026-10-05'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/history', params: { date: '2026-10-05' } });
    expect(view.queryByTestId('training-month-calendar')).toBeNull();
  });
  it('continues the shared active hero without duplicating it among completed sessions', async () => {
    const data = home(); data.training.activeSession = { status: 'ok', data: { ...active, exercisesCompleted: 2, totalExercises: 8, completedSets: 6, totalSets: 24, progressPercent: 25 } };
    mockHome.mockResolvedValue(ok(data));
    const view = renderScreen(); await waitFor(() => expect(view.getByTestId('training-active-session')).toBeTruthy());
    expect(view.queryByTestId(`training-other-${sessionId}`)).toBeNull();
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Volver' })));
    expect(mockPush).toHaveBeenCalledWith(`/(tabs)/train/session/${sessionId}`); expect(mockStart).not.toHaveBeenCalled();
  });
  it('does not start when the active-session read cannot be verified', async () => {
    const view = renderScreen(); await waitFor(() => expect(view.getByRole('button', { name: 'Iniciar PUSH' })).toBeTruthy());
    mockTraining.mockResolvedValue({ status: 'unavailable', reason: 'network', meta });
    await play(view);
    await waitFor(() => expect(lastAlert()?.title).toBe('No pudimos verificar tu sesión')); expect(mockStart).not.toHaveBeenCalled();
  });
});
