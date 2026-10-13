import type { ReactElement } from 'react';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { SessionDetailDto } from '@/api/active-session';
import type { MobileApiResultMeta } from '@/api/results';
import type { TrainingHistorySession } from '@/api/training-history';
import { OwnlevelThemeProvider } from '@/design-system';
import { testDetail } from './active-session-test-fixtures';
import { CompletedSessionScreen, type CompletedSessionApi } from './history-session-screen';
import { SessionCorrectionScreen } from './session-correction-screen';
import { ExerciseHistoryScreen } from './exercise-history-screen';
import { HistoryScreen } from './history-screen';
import { TrainingDayScreen } from './training-day-screen';
import { TrainingCalendarScreen } from './training-calendar-screen';

const mockPush = jest.fn(), mockReplace = jest.fn(), mockBack = jest.fn(), mockSetOptions = jest.fn();
const mockParams: { current: Record<string, string> } = { current: {} };
const mockFetchDetail = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCorrect = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockHistory = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockExerciseHistory = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockExercises = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockDay = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockTraining = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSuccess = jest.fn();
const mockClient = { request: jest.fn(), read: jest.fn() };
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: () => true }),
  useNavigation: () => ({ setOptions: mockSetOptions, dispatch: jest.fn() }),
  useLocalSearchParams: () => mockParams.current, useFocusEffect: () => undefined,
}));
jest.mock('expo-router/build/react-navigation/core/usePreventRemove', () => ({ usePreventRemove: () => undefined }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn(), success: () => mockSuccess(), warning: jest.fn() }, triggerHaptic: () => mockSuccess() }));
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }),
  fetchMobileTraining: (...args: unknown[]) => mockTraining(...args) }));
jest.mock('@/api/active-session', () => ({ ...jest.requireActual<object>('@/api/active-session'), fetchSessionDetail: (...args: unknown[]) => mockFetchDetail(...args) }));
jest.mock('@/api/training-history', () => ({ ...jest.requireActual<object>('@/api/training-history'),
  fetchTrainingExerciseHistory: (...args: unknown[]) => mockExerciseHistory(...args),
  correctSession: (...args: unknown[]) => mockCorrect(...args), fetchTrainingHistory: (...args: unknown[]) => mockHistory(...args),
  fetchTrainingHistoryExercises: (...args: unknown[]) => mockExercises(...args), fetchTrainingDay: (...args: unknown[]) => mockDay(...args) }));

const meta: MobileApiResultMeta = { durationMs: 1, httpStatus: 200, outcome: 'ok' };
const ok = <T,>(data: T) => ({ status: 'ok' as const, data, meta });
const lost = { status: 'unavailable' as const, reason: 'network' as const, meta: { ...meta, httpStatus: null, outcome: 'unavailable' as const } };
const flush = () => act(async () => { for (let index = 0; index < 10; index++) await Promise.resolve(); });
function wrap(element: ReactElement) {
  return render(<GestureHandlerRootView><SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
    <OwnlevelThemeProvider initialMode="light">{element}</OwnlevelThemeProvider></SafeAreaProvider></GestureHandlerRootView>);
}
function completedDetail(): SessionDetailDto {
  const detail = testDetail();
  detail.session = { ...detail.session, status: 'completed', endedAt: '2026-09-30T13:05:00.000000+00:00' };
  detail.exercises[0].payload.sets[0].isCompleted = true;
  return detail;
}
const row = (id: string, logDate: string): TrainingHistorySession => ({ id, routineId: null, routineName: `R-${id.slice(-1)}`, routineColor: 'violet',
  logDate, startedAt: `${logDate}T12:00:00Z`, endedAt: `${logDate}T13:00:00Z`, durationMilliseconds: 3_600_000, exercisesCompleted: 2, completedSets: 6, volumeKg: 1200 });
const ID = (n: number) => `34300000-0000-4000-8000-00000000000${n}`;

beforeEach(() => {
  jest.clearAllMocks(); jest.restoreAllMocks(); mockParams.current = {};
});

describe('completed session: correct + discard (M3.4-3)', () => {
  function api(discard: CompletedSessionApi['discard']): CompletedSessionApi {
    return { detail: jest.fn<CompletedSessionApi['detail']>().mockResolvedValue(ok(completedDetail())), discard };
  }
  it('confirms, replays an unconfirmed discard with the same key, and leaves only after server confirmation', async () => {
    const discard = jest.fn<CompletedSessionApi['discard']>().mockResolvedValueOnce(lost)
      .mockResolvedValueOnce(ok({ status: 'discarded', sessionId: ID(1), sessionUpdatedAt: '2026-10-01T00:00:00Z' }));
    const alert = jest.spyOn(Alert, 'alert');
    const view = wrap(<CompletedSessionScreen api={api(discard)} sessionId={ID(1)} initialDetail={completedDetail()} onHome={jest.fn()} />);
    await flush();
    fireEvent.press(view.getByRole('button', { name: 'Eliminar sesión' }));
    expect(alert).toHaveBeenCalledWith('¿Eliminar esta sesión?', expect.stringContaining('dejará de aparecer en historial'), expect.any(Array));
    expect(discard).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => { buttons.find(button => button.text === 'Eliminar sesión')?.onPress?.(); });
    await flush();
    expect(view.getByText(/No pudimos confirmar si la sesión se eliminó/)).toBeTruthy(); expect(mockBack).not.toHaveBeenCalled();
    fireEvent.press(view.getByRole('button', { name: 'Reintentar eliminación' }));
    await flush();
    expect(discard).toHaveBeenCalledTimes(2); expect(discard.mock.calls[1][0]).toBe(discard.mock.calls[0][0]);
    expect(mockSuccess).not.toHaveBeenCalled(); expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('treats an already-discarded session as done, and routes correction and exercise history', async () => {
    const discard = jest.fn<CompletedSessionApi['discard']>().mockResolvedValue({ status: 'conflict', code: 'SESSION_DISCARDED', message: 'x', meta });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find(button => button.style === 'destructive')?.onPress?.(); });
    const detail = completedDetail();
    const view = wrap(<CompletedSessionScreen api={api(discard)} sessionId={ID(1)} initialDetail={detail} onHome={jest.fn()} />);
    await flush();
    fireEvent.press(view.getByRole('button', { name: 'Corregir sesión' }));
    expect(mockPush).toHaveBeenCalledWith(`/(tabs)/train/correct/${ID(1)}`);
    fireEvent.press(view.getByRole('button', { name: 'Ver historial de PRESS' }));
    expect(mockPush).toHaveBeenCalledWith(`/(tabs)/train/history/exercise/${detail.exercises[0].exerciseId}`);
    fireEvent.press(view.getByRole('button', { name: 'Eliminar sesión' }));
    await flush();
    expect(alert).toHaveBeenCalled(); expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('shows a discarded session without correction or discard actions', async () => {
    const detail = completedDetail(); detail.session.status = 'discarded';
    const view = wrap(<CompletedSessionScreen api={{ detail: jest.fn<CompletedSessionApi['detail']>().mockResolvedValue(ok(detail)), discard: jest.fn<CompletedSessionApi['discard']>() }}
      sessionId={ID(1)} initialDetail={detail} onHome={jest.fn()} />);
    await flush();
    expect(view.getByTestId('discarded-session')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Corregir sesión' })).toBeNull(); expect(view.queryByRole('button', { name: 'Eliminar sesión' })).toBeNull();
    expect(mockSetOptions).toHaveBeenLastCalledWith({ title: 'Sesión eliminada' });
  });
});

describe('historical correction screen', () => {
  beforeEach(() => { mockParams.current = { id: ID(1) }; });
  it('saves only after an edit, with CAS versions, then returns to the re-read session', async () => {
    const detail = completedDetail();
    mockFetchDetail.mockResolvedValue(ok(detail));
    mockCorrect.mockResolvedValue(ok({}));
    const raf = jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => { callback(0); return 0; });
    const view = wrap(<SessionCorrectionScreen />);
    await flush();
    expect(view.getByRole('button', { name: 'Guardar corrección' })).toBeDisabled();
    fireEvent.changeText(view.getByLabelText('Peso serie 1 de PRESS'), '45,5');
    fireEvent.press(view.getByRole('button', { name: 'Guardar corrección' }));
    await flush();
    expect(mockCorrect).toHaveBeenCalledTimes(1);
    const [, sessionId, input] = mockCorrect.mock.calls[0] as [unknown, string, { expectedSessionUpdatedAt: string; exercises: { expectedUpdatedAt: string; sets: { actualWeightKg: number | null }[] }[] }];
    expect(sessionId).toBe(detail.session.id); expect(input.expectedSessionUpdatedAt).toBe(detail.session.updatedAt);
    expect(input.exercises[0].expectedUpdatedAt).toBe(detail.exercises[0].updatedAt); expect(input.exercises[0].sets[0].actualWeightKg).toBe(45.5);
    expect(mockSuccess).not.toHaveBeenCalled(); expect(mockBack).toHaveBeenCalledTimes(1);
    raf.mockRestore();
  });
  it('keeps an unknown outcome explicit and replays the identical request; a CAS conflict asks to reload server truth', async () => {
    mockFetchDetail.mockResolvedValue(ok(completedDetail()));
    mockCorrect.mockResolvedValueOnce(lost).mockResolvedValueOnce({ status: 'conflict', code: 'SESSION_CHANGED', message: 'x', meta });
    const view = wrap(<SessionCorrectionScreen />);
    await flush();
    fireEvent.changeText(view.getByLabelText('Reps serie 1 de PRESS'), '9');
    fireEvent.press(view.getByRole('button', { name: 'Guardar corrección' }));
    await flush();
    expect(view.getByText(/No pudimos confirmar si la corrección se guardó/)).toBeTruthy();
    expect(view.getByLabelText('Reps serie 1 de PRESS').props.editable).toBe(false);
    fireEvent.press(view.getByRole('button', { name: 'Reintentar' }));
    await flush();
    expect(mockCorrect.mock.calls[1][2]).toEqual(mockCorrect.mock.calls[0][2]);
    expect(view.getByText(/La sesión cambió desde que abriste la corrección/)).toBeTruthy(); expect(mockBack).not.toHaveBeenCalled();
    fireEvent.press(view.getByRole('button', { name: 'Recargar datos' }));
    await flush();
    expect(mockFetchDetail).toHaveBeenCalledTimes(2);
    expect(view.getByRole('button', { name: 'Guardar corrección' })).toBeDisabled();
  });
  it('rejects invalid values locally without sending', async () => {
    mockFetchDetail.mockResolvedValue(ok(completedDetail()));
    const view = wrap(<SessionCorrectionScreen />);
    await flush();
    fireEvent.changeText(view.getByLabelText('Reps serie 1 de PRESS'), '8,5');
    fireEvent.press(view.getByRole('button', { name: 'Guardar corrección' }));
    expect(view.getByText(/reps de la serie 1 de PRESS/)).toBeTruthy(); expect(mockCorrect).not.toHaveBeenCalled();
  });
  it('refuses to correct a session that is not completed', async () => {
    const detail = completedDetail(); detail.session.status = 'discarded';
    mockFetchDetail.mockResolvedValue(ok(detail));
    const view = wrap(<SessionCorrectionScreen />);
    await flush();
    expect(view.getByText('No se puede corregir')).toBeTruthy(); expect(view.queryByRole('button', { name: 'Guardar corrección' })).toBeNull();
  });
});

describe('history, day and calendar navigation', () => {
  it('groups sessions by day, appends the next page with the cursor and opens a session', async () => {
    mockHistory.mockResolvedValueOnce(ok({ sessions: [row(ID(1), '2026-10-02'), row(ID(2), '2026-10-01')], nextCursor: 'next_1' }))
      .mockResolvedValueOnce(ok({ sessions: [row(ID(2), '2026-10-01'), row(ID(3), '2026-09-20')], nextCursor: null }));
    const view = wrap(<HistoryScreen />);
    await flush();
    expect(view.getByText('Viernes, 2 de octubre')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Ver más' }));
    await flush();
    expect(mockHistory).toHaveBeenLastCalledWith(expect.anything(), 'next_1');
    expect(view.getAllByTestId(/history-session-/)).toHaveLength(3); expect(view.queryByRole('button', { name: 'Ver más' })).toBeNull();
    fireEvent.press(view.getByTestId(`history-session-${ID(3)}`));
    expect(mockPush).toHaveBeenCalledWith(`/(tabs)/train/history/${ID(3)}`);
  });
  it('distinguishes an empty history from an unavailable read', async () => {
    mockHistory.mockResolvedValueOnce(ok({ sessions: [], nextCursor: null }));
    const empty = wrap(<HistoryScreen />);
    await flush();
    expect(empty.getByText('Todavía no hay sesiones')).toBeTruthy();
    empty.unmount();
    mockHistory.mockResolvedValueOnce(lost);
    const unavailable = wrap(<HistoryScreen />);
    await flush();
    expect(unavailable.getByTestId('history-sessions-unavailable')).toBeTruthy(); expect(unavailable.queryByText('Todavía no hay sesiones')).toBeNull();
  });
  it('searches recorded exercises and opens an exercise history', async () => {
    mockHistory.mockResolvedValue(ok({ sessions: [], nextCursor: null }));
    mockExercises.mockResolvedValue(ok([
      { id: ID(4), name: 'Press banca', muscleGroup: 'pecho', muscleLabel: null, implement: 'barra', weightMode: null, lastDate: '2026-10-01', sessions: 3, lastMark: { weightKg: 60, reps: 5 }, bestMark: null },
      { id: ID(5), name: 'Remo', muscleGroup: 'espalda', muscleLabel: null, implement: null, weightMode: null, lastDate: '2026-09-01', sessions: 1, lastMark: null, bestMark: null },
    ]));
    const view = wrap(<HistoryScreen />);
    await flush();
    fireEvent.press(view.getByRole('tab', { name: 'Ejercicios' }));
    await flush();
    expect(within(view.getByTestId(`history-exercise-${ID(4)}`)).getByText(/60 kg × 5/)).toBeTruthy();
    fireEvent.changeText(view.getByLabelText('Buscar ejercicio'), 'ESPALDA');
    expect(view.queryByTestId(`history-exercise-${ID(4)}`)).toBeNull();
    fireEvent.press(view.getByTestId(`history-exercise-${ID(5)}`));
    expect(mockPush).toHaveBeenCalledWith(`/(tabs)/train/history/exercise/${ID(5)}`);
  });
  it('shows a day summary or an explicit empty day', async () => {
    mockParams.current = { date: '2026-10-01' };
    mockDay.mockResolvedValueOnce(ok({ date: '2026-10-01', sessions: [row(ID(1), '2026-10-01')],
      summary: { sessionCount: 1, exercisesCompleted: 2, completedSets: 6, durationMilliseconds: null, volumeKg: null } }));
    const view = wrap(<TrainingDayScreen />);
    await flush();
    const summary = within(view.getByTestId('training-day-summary'));
    expect(summary.getByText('1 entrenamiento')).toBeTruthy(); expect(summary.getAllByText('—')).toHaveLength(2);
    expect(mockSetOptions).toHaveBeenCalledWith({ title: 'Jueves, 1 de octubre' });
    fireEvent.press(view.getByTestId(`history-session-${ID(1)}`));
    expect(mockPush).toHaveBeenCalledWith(`/(tabs)/train/history/${ID(1)}`);
    view.unmount();
    mockDay.mockResolvedValueOnce(ok({ date: '2026-10-01', sessions: [], summary: { sessionCount: 0, exercisesCompleted: 0, completedSets: 0, durationMilliseconds: null, volumeKg: null } }));
    const empty = wrap(<TrainingDayScreen />);
    await flush();
    expect(empty.getByText('No hay entrenamientos terminados este día.')).toBeTruthy();
  });
  it('navigates months and opens any day from the calendar', async () => {
    const training = (month: string) => ok({ activeSession: { status: 'ok', data: null }, calendar: { status: 'ok', data: { month, days: [{ date: `${month}-03`, colors: ['violet'] }] } } });
    mockTraining.mockImplementation(async (...args: unknown[]) => training(args[1] as string));
    const view = wrap(<TrainingCalendarScreen now={() => new Date(2026, 9, 2, 12)} />);
    await flush();
    expect(mockTraining).toHaveBeenLastCalledWith(expect.anything(), '2026-10', expect.anything());
    fireEvent.press(view.getByRole('button', { name: 'Mes anterior' }));
    await flush();
    expect(mockTraining).toHaveBeenLastCalledWith(expect.anything(), '2026-09', expect.anything());
    await waitFor(() => expect(view.getByText('Septiembre de 2026')).toBeTruthy());
    fireEvent.press(view.getByTestId('training-calendar-day-2026-09-03'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/train/day/2026-09-03');
  });
});


describe('exercise history routine scope', () => {
  it('starts in the origin routine, switches server scope, and keeps unavailable distinct from empty', async () => {
    mockParams.current = { id: ID(3), routineId: ID(1) };
    const data = { exercise: { id: ID(3), name: 'PRESS', muscleGroup: null, muscleLabel: null, implement: null, weightMode: null },
      latest: null, best: null, sessions: [], hasMore: false, routines: [{ id: ID(1), name: 'PUSH' }, { id: ID(2), name: 'PULL' }] };
    mockExerciseHistory.mockImplementation(async (...args) => args[4] === ID(2) ? lost : ok(data));
    const view = wrap(<ExerciseHistoryScreen />); await flush();
    expect(view.getByText('Todavía no lo hiciste en PUSH')).toBeTruthy();
    expect(mockExerciseHistory).toHaveBeenLastCalledWith(mockClient, ID(3), 20, expect.anything(), ID(1));
    fireEvent.press(view.getByRole('radio', { name: 'Todas' })); await flush();
    expect(mockExerciseHistory).toHaveBeenLastCalledWith(mockClient, ID(3), 20, expect.anything(), null);
    expect(view.getByText('Todavía no lo hiciste')).toBeTruthy();
    fireEvent.press(view.getByRole('radio', { name: 'PULL' })); await flush();
    expect(view.queryByText('Todavía no lo hiciste')).toBeNull();
    expect(view.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    expect(view.getByRole('radio', { name: 'Todas' })).toBeTruthy();
  });
});
