import { clearConfirmedReads, invalidateConfirmedReads } from '@/api/confirmed-read-cache';
import type { MobileApiClient } from '@/api/client';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AppState, RefreshControl } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { parseProgressTraining, parseProgressTrainingExercise, type ProgressQuery, type ProgressExerciseCharts } from '@/api/progress';
import { TrainingTrendsScreen, signalLine } from './training-trends-screen';
import { ExerciseTrendsScreen } from './exercise-trends-screen';
import { ReturnToExerciseChart, exerciseChartReturnHref } from './exercise-navigation';
import { ProgressRangeProvider } from './progress-range-context';
import { TODAY, cmp, ex, exercise, training } from './training-fixture.test-helper';
import type { DateRange, ProgressRangeState } from './progress-range';

const mockPush = jest.fn(), mockNavigate = jest.fn();
let mockParams: Record<string, string> = {};
const mockTraining = jest.fn<(c: unknown, q: ProgressQuery, compare: DateRange | null) => Promise<unknown>>();
const mockExercise = jest.fn<(c: unknown, q: ProgressQuery, id: string, compare: DateRange | null) => Promise<unknown>>();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, navigate: mockNavigate }), useFocusEffect: (callback: () => void | (() => void)) => { jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]); }, useLocalSearchParams: () => mockParams, Stack: { Screen: () => null } }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn(), success: jest.fn(), warning: jest.fn() }, triggerHaptic: jest.fn() }));
let mockCurrentClient: MobileApiClient | null;
const mockClient = { request: jest.fn(), read: jest.fn() } as unknown as MobileApiClient;
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockCurrentClient }) }));
// The native (SwiftUI) segmented control renders nothing in Jest: test with the brand fallback it mirrors.
jest.mock('@/training/exercise-segmented', () => jest.requireActual('@/training/exercise-segmented.tsx'));
jest.mock('@/api/progress', () => ({ ...jest.requireActual<object>('@/api/progress'),
  fetchProgressTraining: (c: unknown, q: ProgressQuery, _s: unknown, compare: DateRange | null) => mockTraining(c, q, compare),
  fetchProgressTrainingExercise: (c: unknown, q: ProgressQuery, id: string, _s: unknown, compare: DateRange | null) => mockExercise(c, q, id, compare) }));

const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const ok = <T,>(data: T) => ({ status: 'ok' as const, data, meta });
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
const MONTH = { period: 'custom' as const, from: '2026-10-01', to: TODAY };
const comparing: ProgressRangeState = { unit: 'month', anchor: TODAY, custom: null, compare: { kind: 'previous' } };
const wrap = (el: React.ReactElement, initialState?: ProgressRangeState) => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
  <OwnlevelThemeProvider initialMode="light"><ProgressRangeProvider initialToday={TODAY} initialState={initialState}>{el}</ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>);
const listeners: ((s: string) => void)[] = [];
const openChart = (view: ReturnType<typeof render>) => { if (!view.queryByTestId('training-chart')) fireEvent.press(view.getByText('Actividad en el tiempo')); };
const changeTrainingPeriod = async (view: ReturnType<typeof render>) => {
  fireEvent.press(view.getByTestId('training-period-picker'));
  fireEvent.press(view.getByText('Últimos 7 días')); await flush();
};

beforeEach(() => {
  mockCurrentClient = mockClient;
  clearConfirmedReads(mockClient);
  jest.clearAllMocks(); mockExercise.mockReset(); mockParams = {}; listeners.length = 0;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, l) => { listeners.push(l as (s: string) => void); return { remove: jest.fn() } as never; });
  mockTraining.mockImplementation(async (_c, q) => ok(training(q.period)));
  mockExercise.mockImplementation(async (_c, _q, id) => ok(exercise(id)));
});

describe('signalLine', () => {
  const sig = (kind: string, description: string, referenceValue: number | null = 9, currentValue: number | null = 10) => ({ kind, description, referenceValue, currentValue, contextValue: null });
  it('writes before → after with its unit, and keeps the server sentence for anything else', () => {
    expect(signalLine(sig('more_reps_same_load', '+1 reps con 60 kg'))).toBe('9 → 10 reps con 60 kg');
    expect(signalLine(sig('more_load_same_reps', '+1 lingotes manteniendo 20 reps'))).toBe('9 → 10 lingotes, a 20 reps');
    expect(signalLine(sig('fewer_reps_bodyweight', '−2 reps con peso corporal', 12, 10))).toBe('12 → 10 reps con peso corporal');
    expect(signalLine(sig('more_time', '+15 s en el mejor registro', 30, 45))).toBe('30 → 45 s en el mejor registro');
    expect(signalLine(sig('stable', 'Sin cambio claro'))).toBeNull();
    expect(signalLine(sig('new_rep_record', 'Nuevo récord de reps: 12 con 40 kg'))).toBe('Nuevo récord de reps: 12 con 40 kg');
    expect(signalLine(sig('more_time', '+15 s en el mejor registro', null, 45))).toBe('+15 s en el mejor registro');
  });
});

describe('Training Trends', () => {
  const routineFixture = (durations: (number | null)[]) => {
    const t = training();
    t.exercises = [{ ...t.exercises[0], status: 'stable' as const, signal: null, isPersonalRecord: false }];
    t.inPeriod = { improved: 0, stable: 1, declined: 0, insufficient: 0, exercises: [{ ...t.inPeriod!.exercises[0], status: 'stable', signal: null }] };
    t.story = { routines: durations.map((averageMinutes, i) => ({ id: `r${i}`, name: `Rutina ${i}`, sessions: 1, previousSessions: 1, sets: 4, minutes: averageMinutes ?? 0, averageMinutes, averageExercises: 1, lastDate: TODAY, exerciseIds: [ex.bench], improved: 0, stable: 1, declined: 0, insufficient: 0 })), muscles: [] };
    return t;
  };
  it('never declares a unique longest routine when durations tie, or leaves the review empty', async () => {
    mockTraining.mockResolvedValue(ok(routineFixture([60, 60, 40])));
    const view = wrap(<TrainingTrendsScreen />); await flush();
    expect(view.getByText('Rutina 0 y Rutina 1 comparten la mayor duración media')).toBeTruthy();
    expect(view.queryByText('Rutina 0 es la que más dura')).toBeNull();
    view.unmount(); clearConfirmedReads(mockClient);
    mockTraining.mockResolvedValue(ok(routineFixture([60, 60, 60])));
    const same = wrap(<TrainingTrendsScreen />); await flush();
    expect(same.getByText('Podés seguir explorando las rutinas y ejercicios de arriba para revisar tus registros.')).toBeTruthy();
  });
  it('keeps missing duration distinct from zero and out of duration highlights', async () => {
    const t = routineFixture([null, 40, 30]);
    expect(parseProgressTraining(t)).toBeDefined();
    mockTraining.mockResolvedValue(ok(t));
    const view = wrap(<TrainingTrendsScreen />); await flush();
    expect(view.getByText('duración incompleta')).toBeTruthy();
    fireEvent.press(view.getByRole('radio', { name: 'Más tiempo' }));
    fireEvent.press(view.getByTestId('training-routine-r0'));
    expect(within(view.getByTestId('training-routine-detail-r0')).getByText('Sin dato')).toBeTruthy();
    expect(view.queryByText('Rutina 0 es la que más dura')).toBeNull();
  });
  it('shows a graph for daily and dense windows, and gives one complete VoiceOver label per statistic', async () => {
    const t = training(); t.series[0].sessions = 8; t.period.bucket = 'week';
    mockTraining.mockResolvedValue(ok(t));
    const view = wrap(<TrainingTrendsScreen />); await flush();
    expect(view.getByTestId('training-chart')).toBeTruthy();
    expect(view.getByLabelText('series: 12')).toBeTruthy();
    view.unmount(); clearConfirmedReads(mockClient);
    t.period.bucket = 'day'; t.series[0].sessions = 1;
    mockTraining.mockResolvedValue(ok({ ...t }));
    const daily = wrap(<TrainingTrendsScreen />); await flush();
    expect(daily.getByLabelText('Sesiones por día')).toBeTruthy();
  });
  it('explicitly identifies an unavailable expanded routine detail without inventing its metrics', async () => {
    const view = wrap(<TrainingTrendsScreen />); await flush();
    expect(view.getByText('El detalle ampliado por rutina no está disponible en esta lectura. Podés consultar las sesiones y los ejercicios.')).toBeTruthy();
    expect(view.queryByRole('radio', { name: 'Más ejercicios' })).toBeNull();
    expect(view.queryByRole('radio', { name: 'Más tiempo' })).toBeNull();
  });
  it('retires unavailable routine sorting after a refresh without turning absent averages into zero', async () => {
    mockTraining.mockResolvedValue(ok(routineFixture([60, 40, 30])));
    const view = wrap(<TrainingTrendsScreen />); await flush();
    fireEvent.press(view.getByRole('radio', { name: 'Más tiempo' }));
    mockTraining.mockResolvedValue(ok(training()));
    act(() => view.UNSAFE_getByType(RefreshControl).props.onRefresh()); await flush();
    expect(view.queryByRole('radio', { name: 'Más tiempo' })).toBeNull();
    expect(within(view.getByTestId('training-routine-__free__')).getByText('3 veces')).toBeTruthy();
    fireEvent.press(view.getByTestId('training-routine-__free__'));
    expect(within(view.getByTestId('training-routine-detail-__free__')).getByText('Sin dato')).toBeTruthy();
  });
  it('preserves reference-only exercise navigation and does not invent why a first/last result is absent', async () => {
    const t = training(); t.inPeriod!.exercises = []; t.inPeriod!.improved = 0; t.inPeriod!.insufficient = 0;
    mockTraining.mockResolvedValue(ok(t));
    const view = wrap(<TrainingTrendsScreen />, comparing); await flush();
    expect(view.getAllByText('No hay dos sesiones con datos suficientes para comparar.').length).toBeGreaterThan(0);
    fireEvent.press(view.getByText('Sólo en la referencia (1)'));
    fireEvent.press(view.getByRole('button', { name: 'Curl' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/trends/exercise/[id]', params: { id: ex.old } });
    expect(mockTraining).toHaveBeenCalledTimes(1);
  });
  it('labels years in historical first/last evidence and the reference', async () => {
    const t = training(); t.period.start = '2025-12-20'; t.period.days = Math.round((Date.parse(TODAY) - Date.parse(t.period.start)) / 86_400_000) + 1; t.period.previousStart = '2025-09-01'; t.period.previousEnd = '2025-09-05';
    t.inPeriod!.exercises[0].firstDate = '2025-12-20';
    mockTraining.mockResolvedValue(ok(t));
    const view = wrap(<TrainingTrendsScreen />, comparing); await flush();
    expect(view.getByText('Referencia: 1–5 sep 2025 · 5 días')).toBeTruthy();
    expect(view.getByText('20 dic 2025 → 4 oct')).toBeTruthy();
  });
  it('fixtures follow the contract', () => {
    expect(parseProgressTraining(training())).toBeDefined(); expect(parseProgressTraining(training('30', true))).toBeDefined();
    expect(parseProgressTrainingExercise(exercise(ex.bench))).toBeDefined(); expect(parseProgressTrainingExercise(exercise(ex.cable))).toBeDefined();
  });
  it('opens records and feelings, inspects activity and preserves original navigation without new reads', async () => {
    const view = wrap(<TrainingTrendsScreen />); await flush();
    expect(view.getByText('Tus rutinas')).toBeTruthy(); expect(view.getByText('Dónde progresaste')).toBeTruthy();
    expect(view.getByText('2 días entrenados · frecuencia normalizada a 7 días')).toBeTruthy();
    expect(within(view.getByTestId(`training-exercise-${ex.bench}`)).getByText('75 → 80 kg, a 5 reps')).toBeTruthy();
    fireEvent.press(view.getByTestId('training-performance-insufficient_data'));
    expect(within(view.getByTestId(`training-exercise-${ex.cable}`)).getByText('Este modo de carga no tiene una comparación confiable.')).toBeTruthy();
    fireEvent.press(view.getByText('Récords')); expect(view.getByText('Press banca · Nuevo mejor peso: 80 kg × 5')).toBeTruthy();
    fireEvent.press(view.getByText('Cómo te sentiste')); expect(view.getByText('3,8 de 5')).toBeTruthy();
    expect(view.getByText('1 de 3 sesiones · pocas con registro')).toBeTruthy();
    openChart(view); fireEvent.press(view.getByRole('radio', { name: 'Sesiones' }));
    expect(view.getByText('Sesiones por semana · esta semana en curso')).toBeTruthy();
    const reads = mockTraining.mock.calls.length;
    fireEvent.press(view.getByRole('button', { name: 'Ver el historial de entrenamientos' })); expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/train/history');
    fireEvent.press(view.getByRole('button', { name: 'Ver Comparaciones: cada sesión frente a la anterior' }));
    expect(mockNavigate).toHaveBeenLastCalledWith({ pathname: '/(tabs)/train/insights', params: { fromProgress: 'training' } });
    expect(mockTraining.mock.calls.length).toBe(reads);
  });
  it('keeps the chosen A/B reference separate from first/last results', async () => {
    const view = wrap(<TrainingTrendsScreen />, comparing); await flush();
    expect(mockTraining).toHaveBeenLastCalledWith(mockClient, MONTH, { start: '2026-09-01', end: '2026-09-05' });
    expect(view.getByText('Frente a 1–5 sep: Nuevo mejor peso: 80 kg × 5')).toBeTruthy();
    expect(view.getByTestId('training-performance-improved').props.accessibilityState).toMatchObject({ selected: true });
  });
  it('sorts and opens routine evidence and muscle history locally; absent routines need comparison on', async () => {
    const t = training();
    t.story = { routines: [
      { id: 'push', name: 'PUSH', sessions: 2, previousSessions: 1, sets: 8, minutes: 80, averageMinutes: 40, averageExercises: 2, lastDate: TODAY, exerciseIds: [ex.bench], improved: 1, stable: 0, declined: 0, insufficient: 0 },
      { id: 'pull', name: 'PULL', sessions: 1, previousSessions: 2, sets: 4, minutes: 70, averageMinutes: 70, averageExercises: 3, lastDate: TODAY, exerciseIds: [ex.cable], improved: 0, stable: 0, declined: 0, insufficient: 1 },
      { id: 'upper', name: 'Upper', sessions: 0, previousSessions: 2, sets: 0, minutes: 0, averageMinutes: null, averageExercises: null, lastDate: null, exerciseIds: [], improved: 0, stable: 0, declined: 0, insufficient: 0 },
    ], muscles: [{ key: 'pecho', label: 'Pecho', sets: 9, previousSets: 4, sessions: 3, exerciseIds: [ex.bench] }] };
    expect(parseProgressTraining(t)).toBeDefined();
    mockTraining.mockResolvedValue(ok(t));
    const view = wrap(<TrainingTrendsScreen />, comparing); await flush();
    fireEvent.press(view.getByRole('radio', { name: 'Más tiempo' }));
    const routines = within(view.getByTestId('training-routines'));
    expect(routines.getAllByTestId(/^training-routine-/)[0].props.testID).toBe('training-routine-pull');
    fireEvent.press(view.getByTestId('training-routine-pull'));
    expect(view.getByText('Sin ejercicios comparables dentro de esta rutina.')).toBeTruthy();
    expect(routines.getByText('Upper')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Pecho: 9 series, 3 sesiones; antes 4 series' }));
    fireEvent.press(within(view.getByTestId('training-breakdown')).getByRole('button', { name: 'Press banca' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/trends/exercise/[id]', params: { id: ex.bench } });
    expect(mockTraining).toHaveBeenCalledTimes(1);
  });
  it('no training in the period is a real empty state (no averages at 0); period changes ignore late responses; foreground re-reads', async () => {
    let release!: (v: unknown) => void;
    mockTraining.mockImplementationOnce(() => new Promise(r => { release = r; }));
    const view = wrap(<TrainingTrendsScreen />); await flush();
    mockTraining.mockImplementation(async (_c, q) => ok(training(q.period, true)));
    await changeTrainingPeriod(view);
    expect(mockTraining).toHaveBeenLastCalledWith(mockClient, { period: 'custom', from: '2026-09-29', to: TODAY }, null);
    expect(view.queryByText(/frente a/)).toBeNull(); expect(view.queryByText(/Sólo en el período anterior/)).toBeNull();
    await act(async () => { release(ok(training('30'))); }); await flush();
    expect(view.queryByText('Press banca · PR')).toBeNull();
    expect(view.getByText('Sin entrenamientos en este período.')).toBeTruthy();
    fireEvent.press(view.getByText('Cómo te sentiste')); expect(view.getByText('Sin sensaciones registradas en este período.')).toBeTruthy();
    fireEvent.press(view.getByText('Récords')); expect(view.getByText('Sin récords nuevos en este período.')).toBeTruthy();
    const calls = mockTraining.mock.calls.length;
    await act(async () => { listeners.at(-1)!('background'); listeners.at(-1)!('active'); }); await flush();
    expect(mockTraining.mock.calls.length).toBe(calls + 1);
  });
});

describe('Exercise analytics', () => {
  it('shows the estimate, internal change and gaps; changes measures and opens sessions / exercise history', async () => {
    mockParams = { id: ex.bench };
    const view = wrap(<ExerciseTrendsScreen />); await flush();
    expect(mockExercise).toHaveBeenLastCalledWith(mockClient, MONTH, ex.bench, null);
    expect(view.getByTestId('exercise-estimated-chip')).toHaveTextContent('estimado');
    expect(view.getByText('de 60 kg × 10 · 4 oct')).toBeTruthy();
    const change = within(view.getByTestId('exercise-trend-change'));
    expect(change.getByText('↗ 8 kg')).toBeTruthy(); expect(change.getByText('en octubre · desde 72 kg')).toBeTruthy();
    expect(view.queryByText(/Frente a|frente a/)).toBeNull(); expect(view.queryByTestId('exercise-performance-comparison')).toBeNull();
    expect(view.getByTestId('exercise-gap-current-s-gap')).toBeTruthy(); expect(view.queryByTestId('exercise-point-current-s-gap')).toBeNull();
    fireEvent.press(within(view.getByTestId('exercise-trend-chart')).getByRole('button', { name: '4 de octubre de 2026, 1RM estimado, 80 kg, período elegido' }));
    expect(mockPush).not.toHaveBeenCalled();
    expect(within(view.getByTestId('exercise-point-inspection')).getByText('1RM estimado · 80 kg')).toBeTruthy();
    expect(mockExercise).toHaveBeenCalledTimes(1);
    fireEvent.press(view.getByRole('button', { name: 'Ver sesión y series originales' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/train/history/[id]', params: { id: 's-2', fromProgressExercise: ex.bench } });
    expect(within(view.getByTestId('exercise-session-s-2')).getByText('60 kg × 10 reps · 1RM est. 80 kg')).toBeTruthy();
    fireEvent.press(view.getByTestId('exercise-session-s-2')); expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/train/history/[id]', params: { id: 's-2', fromProgressExercise: ex.bench } });
    expect(within(view.getByTestId('exercise-trend-marks')).getByText('Mejor peso')).toBeTruthy();
    fireEvent.press(view.getByRole('radio', { name: 'Mejor serie' })); expect(view.queryByTestId('exercise-estimated-chip')).toBeNull(); expect(view.getByTestId('exercise-point-current-s-gap')).toBeTruthy();
    fireEvent.press(view.getByRole('radio', { name: 'Volumen' })); expect(view.getByText('Volumen por sesión · kg × reps')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Ver el historial del ejercicio' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/train/history/exercise/[id]', params: { id: ex.bench } });
  });
  it('inspects a missing measure and an explicit zero without navigating or fetching; measure changes keep the session', async () => {
    mockParams = { id: ex.bench };
    const data = exercise(ex.bench);
    data.charts!.measures.find(m => m.key === 'volume')!.points[1].value = 0;
    mockExercise.mockResolvedValue(ok(data));
    const view = wrap(<ExerciseTrendsScreen />); await flush();
    fireEvent.press(view.getByTestId('exercise-gap-current-s-gap'));
    let readout = within(view.getByTestId('exercise-point-inspection'));
    expect(readout.getByText('1RM estimado · Sin dato')).toBeTruthy();
    expect(readout.getByText(/No equivale a cero/)).toBeTruthy();
    fireEvent.press(view.getByRole('radio', { name: 'Volumen' }));
    readout = within(view.getByTestId('exercise-point-inspection'));
    expect(readout.getByText('Volumen · 0 kg × reps')).toBeTruthy();
    expect(readout.getByText(/Actividad registrada; no mide fuerza/)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled(); expect(mockExercise).toHaveBeenCalledTimes(1);
    fireEvent.press(view.getByTestId('exercise-point-current-s-gap'));
    expect(view.queryByRole('button', { name: 'Ver sesión y series originales' })).toBeNull();
  });
  it('round-trips through the existing session route and keeps measure, point, period and A/B without another chart read', async () => {
    const data = exercise(ex.bench);
    data.charts!.measures.forEach(m => { m.reference = [{ date: '2026-09-05', sessionId: 'ref-last', value: 74, best: { reps: 10, weightKg: 55.5 } }]; });
    mockExercise.mockResolvedValue(ok(data));
    mockParams = { id: ex.bench };
    const view = wrap(<><ExerciseTrendsScreen /><ReturnToExerciseChart /></>, comparing); await flush();
    fireEvent.press(view.getByRole('radio', { name: 'Mejor serie' }));
    fireEvent.press(view.getByTestId('exercise-point-reference-ref-last'));
    expect(within(view.getByTestId('exercise-point-inspection')).getByText('Mejor serie · 74 kg × 10 reps')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Ver sesión y series originales' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/train/history/[id]', params: { id: 'ref-last', fromProgressExercise: ex.bench } });
    mockParams = { id: ex.bench, fromProgressExercise: ex.bench };
    view.rerender(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}><OwnlevelThemeProvider initialMode="light"><ProgressRangeProvider initialToday={TODAY} initialState={comparing}><ExerciseTrendsScreen /><ReturnToExerciseChart /></ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>);
    fireEvent.press(view.getByRole('button', { name: 'Volver al gráfico del ejercicio' }));
    expect(mockNavigate).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/trends/exercise/[id]', params: { id: ex.bench } });
    expect(view.getByRole('radio', { name: 'Mejor serie' }).props.accessibilityState.checked).toBe(true);
    expect(view.getByTestId('exercise-point-reference-ref-last').props.accessibilityState.selected).toBe(true);
    expect(mockExercise).toHaveBeenCalledTimes(1);
    expect(mockExercise).toHaveBeenLastCalledWith(mockClient, MONTH, ex.bench, { start: '2026-09-01', end: '2026-09-05' });
    expect(within(view.getByTestId('exercise-point-inspection')).getByText(/Período de comparación · 1 de septiembre de 2026 – 5 de septiembre de 2026/)).toBeTruthy();
  });
  it('accepts only the closed, validated exercise return route', () => {
    for (const fromProgressExercise of [undefined, ['bad'], '/settings', 'https://example.test', 'not-an-id']) expect(exerciseChartReturnHref({ fromProgressExercise })).toBeNull();
    expect(exerciseChartReturnHref({ fromProgressExercise: ex.bench, redirect: '/settings' })).toEqual({ pathname: '/(tabs)/progress/trends/exercise/[id]', params: { id: ex.bench } });
  });
  it('keeps the confirmed inspection during refresh/error, then removes a deleted source and resets on account change', async () => {
    mockParams = { id: ex.bench };
    const view = wrap(<ExerciseTrendsScreen />); await flush();
    fireEvent.press(view.getByTestId('exercise-point-current-s-2'));
    let finish: (result: unknown) => void = () => undefined;
    mockExercise.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    act(() => view.UNSAFE_getByType(RefreshControl).props.onRefresh()); await flush();
    expect(within(view.getByTestId('exercise-point-inspection')).getByText('1RM estimado · 80 kg')).toBeTruthy();
    await act(async () => finish({ status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } })); await flush();
    expect(view.getByText('No se pudo actualizar. Mostramos la última lectura confirmada.')).toBeTruthy();
    expect(within(view.getByTestId('exercise-point-inspection')).getByText('1RM estimado · 80 kg')).toBeTruthy();
    const updated = exercise(ex.bench);
    updated.sessions = updated.sessions.filter(s => s.sessionId !== 's-2');
    updated.charts!.measures.forEach(m => { m.points = m.points.filter(p => p.sessionId !== 's-2'); });
    mockExercise.mockResolvedValue(ok(updated));
    await act(async () => invalidateConfirmedReads(mockClient, '/api/mobile/v1/training/sessions/s-2/correct')); await flush();
    expect(view.getByText(/La sesión seleccionada ya no está/)).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Ver sesión y series originales' })).toBeNull();
    mockCurrentClient = null;
    view.rerender(<SafeAreaProvider><OwnlevelThemeProvider initialMode="light"><ProgressRangeProvider initialToday={TODAY}><ExerciseTrendsScreen /></ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>); await flush();
    expect(view.queryByTestId('exercise-point-inspection')).toBeNull();
    expect(view.queryByText('Press banca')).toBeNull();
  });
  it('retains session access with an older response and distinguishes an initial read error from an empty exercise', async () => {
    mockParams = { id: ex.bench };
    mockExercise.mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } });
    const older = exercise(ex.bench); delete older.charts;
    mockExercise.mockResolvedValue(ok(older));
    const view = wrap(<ExerciseTrendsScreen />); await flush();
    expect(view.getByText('No pudimos cargar el ejercicio')).toBeTruthy();
    expect(view.queryByText('Sin sesiones de este ejercicio en este período.')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Reintentar' })); await flush();
    expect(view.getByText('No pudimos consultar las medidas del ejercicio.')).toBeTruthy();
    expect(view.queryByTestId('exercise-trend-chart')).toBeNull();
    fireEvent.press(view.getByTestId('exercise-session-s-2'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/train/history/[id]', params: { id: 's-2', fromProgressExercise: ex.bench } });
  });
  it('clears inspection when the range changes and does not reuse the previous account selection', async () => {
    mockParams = { id: ex.bench };
    const view = wrap(<ExerciseTrendsScreen />); await flush();
    fireEvent.press(view.getByRole('radio', { name: 'Volumen' }));
    fireEvent.press(view.getByTestId('exercise-point-current-s-2'));
    fireEvent.press(view.getByTestId('progress-unit-week')); await flush();
    expect(view.queryByRole('button', { name: 'Ver sesión y series originales' })).toBeNull();
    expect(view.getByRole('radio', { name: '1RM estimado' }).props.accessibilityState.checked).toBe(true);
    expect(mockExercise).toHaveBeenCalledTimes(2);
    fireEvent.press(view.getByTestId('exercise-point-current-s-2'));
    mockCurrentClient = { request: jest.fn(), read: jest.fn() } as unknown as MobileApiClient;
    const other = exercise(ex.bench); other.exercise.name = 'Ejercicio de otra cuenta';
    mockExercise.mockResolvedValue(ok(other));
    view.rerender(<SafeAreaProvider><OwnlevelThemeProvider initialMode="light"><ProgressRangeProvider initialToday={TODAY}><ExerciseTrendsScreen /></ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>); await flush();
    expect(view.getByText('Ejercicio de otra cuenta')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Ver sesión y series originales' })).toBeNull();
    expect(view.queryByText('Press banca')).toBeNull();
    expect(mockExercise).toHaveBeenLastCalledWith(mockCurrentClient, expect.anything(), ex.bench, null);
  });
  it('provides a scrollable chart with selected state and a wrapping readout at large text sizes', async () => {
    const rn = jest.requireActual<typeof import('react-native')>('react-native');
    jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ width: 320, height: 700, scale: 3, fontScale: 2 });
    mockParams = { id: ex.bench };
    const data = exercise(ex.bench); data.exercise.name = 'Press banca con un nombre largo conservado en el detalle';
    mockExercise.mockResolvedValue(ok(data));
    const view = wrap(<ExerciseTrendsScreen />); await flush();
    const point = view.getByTestId('exercise-point-current-s-2');
    expect(point.props.accessibilityState.selected).toBe(false);
    fireEvent.press(point);
    expect(view.getByTestId('exercise-point-current-s-2').props.accessibilityState.selected).toBe(true);
    expect(within(view.getByTestId('exercise-point-inspection')).getByText('4 de octubre de 2026')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Ver sesión y series originales' })).toBeTruthy();
    expect(view.getByTestId('exercise-trend-chart').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: 336, minHeight: 208 })]));
    jest.restoreAllMocks();
  });
  it('uses the latest reference session only while comparing, and keeps performance and sample comparisons opt-in', async () => {
    mockParams = { id: ex.bench }; const data = exercise(ex.bench);
    data.charts!.measures.forEach(m => { m.reference = [{ date: '2026-09-01', sessionId: 'ref-old', value: 70, best: { reps: 10, weightKg: 52.5 } }, { date: '2026-09-05', sessionId: 'ref-last', value: 74, best: { reps: 10, weightKg: 55.5 } }]; });
    mockExercise.mockResolvedValue(ok(data)); const view = wrap(<ExerciseTrendsScreen />, comparing); await flush();
    const change = within(view.getByTestId('exercise-trend-change'));
    expect(change.getByText('↗ 6 kg')).toBeTruthy(); expect(change.getByText('frente a 1–5 sep · 74 kg')).toBeTruthy();
    expect(view.queryByText(/en octubre · desde/)).toBeNull(); expect(view.getByText('Frente a 1–5 sep: Mejoró · +4 kg manteniendo 10 reps')).toBeTruthy();
    expect(view.getByTestId('exercise-point-reference-ref-last')).toBeTruthy();
    view.unmount();
    data.charts!.measures.filter(m => !m.derived).forEach(m => { m.reference!.push({ date: '2026-09-05', sessionId: 'ref-missing', value: 55, best: { reps: 15, weightKg: 55 } }); });
    const missing = wrap(<ExerciseTrendsScreen />, comparing); await flush();
    expect(missing.getByText(/Sin comparación: 1–5 sep sin valor comparable/)).toBeTruthy();
    expect(missing.getByTestId('exercise-gap-reference-ref-missing')).toBeTruthy();
  });
  it.each([
    ['unit_reps', ['Mejor serie', 'Volumen']], ['bodyweight_reps', ['Mejor serie', 'Repeticiones totales']], ['time', ['Mejor tiempo', 'Tiempo total']],
  ] as [ProgressExerciseCharts['strategy'], string[]][])('%s offers its mode measures, without an estimated 1RM', async (strategy, labels) => {
    mockParams = { id: ex.bench }; mockExercise.mockResolvedValue(ok(exercise(ex.bench, strategy)));
    const view = wrap(<ExerciseTrendsScreen />); await flush();
    for (const label of labels) expect(view.getByRole('radio', { name: label })).toBeTruthy();
    expect(view.queryByRole('radio', { name: '1RM estimado' })).toBeNull(); expect(view.queryByTestId('exercise-estimated-chip')).toBeNull();
  });
  it('keeps missing latest values distinct from zero, and shows the one-session and empty states', async () => {
    mockParams = { id: ex.bench }; const data = exercise(ex.bench);
    data.charts!.measures[0].points = data.charts!.measures[0].points.slice(0, 1);
    mockExercise.mockResolvedValue(ok(data)); const view = wrap(<ExerciseTrendsScreen />); await flush();
    expect(view.getByText('—')).toBeTruthy(); expect(view.getByText('Una sola sesión: todavía no hay tendencia.')).toBeTruthy();
    expect(view.getByTestId('exercise-gap-current-s-2')).toBeTruthy();
    data.sessions = []; data.charts!.measures.forEach(m => { m.points = []; });
    mockExercise.mockResolvedValue(ok({ ...data })); fireEvent.press(view.getByTestId('progress-unit-week')); await flush();
    expect(view.getByText('Sin sesiones de este ejercicio en este período.')).toBeTruthy();
  });
  it('an unsupported weight mode has no chart and no fabricated comparison', async () => {
    mockParams = { id: ex.cable };
    const view = wrap(<ExerciseTrendsScreen />); await flush();
    expect(view.getByText('Este modo de carga no tiene una métrica de rendimiento comparable. Revisá las sesiones abajo.')).toBeTruthy();
    expect(view.queryByTestId('exercise-performance-comparison')).toBeNull(); expect(view.queryByTestId('exercise-trend-chart')).toBeNull();
  });
  it('a 404 is an explicit "no records" state', async () => {
    mockParams = { id: ex.dips };
    mockExercise.mockResolvedValue({ status: 'unavailable', reason: 'http_error', meta: { durationMs: 1, httpStatus: 404, outcome: 'unavailable' } });
    const view = wrap(<ExerciseTrendsScreen />); await flush();
    expect(view.getByText('No hay registros completados de este ejercicio.')).toBeTruthy();
  });
});

const rn = jest.requireActual<typeof import('react-native')>('react-native');
describe('P1-B2 accessible activity and temporal buckets', () => {
  it('reading budget: one grouped training response, no reads for local measure/breakdown changes', async () => {
    const payload = training('custom');
    const read = jest.fn<(args: { path: string; parse: (raw: unknown) => unknown }) => Promise<unknown>>().mockImplementation(async args => {
      const data = args.parse(payload); return data ? ok(data) : { status: 'unavailable', reason: 'invalid_response', meta };
    });
    mockCurrentClient = { read } as unknown as MobileApiClient;
    mockTraining.mockImplementation((client, query, compare) => jest.requireActual<typeof import('@/api/progress')>('@/api/progress').fetchProgressTraining(client as MobileApiClient, query, undefined, compare));
    const view = wrap(<TrainingTrendsScreen />, { unit: 'custom', anchor: TODAY, custom: { start: payload.period.start, end: TODAY }, compare: { kind: 'none' } });
    await flush(); openChart(view); expect(read).toHaveBeenCalledTimes(1); expect(view.getByTestId('training-summary')).toBeTruthy();
    expect(read.mock.calls[0][0].path).toBe('/api/mobile/v1/progress/training?period=custom&from=2026-09-06&to=2026-10-05&inPeriod=1&story=2');
    fireEvent.press(view.getByTestId('training-bucket-2026-09-06')); expect(view.getByTestId('training-bucket-inspection')).toBeTruthy();
    fireEvent.press(view.getByRole('radio', { name: 'Duración' }));
    fireEvent.press(view.getByTestId('training-routine-__free__'));
    fireEvent.press(view.getByTestId(`training-exercise-${ex.bench}`));
    expect(read).toHaveBeenCalledTimes(1);
  });
  it.each([{ width: 320, fontScale: 1 }, { width: 430, fontScale: 1 }, { width: 320, fontScale: 2 }])('retains full values and scaling at $width / scale $fontScale', async dimensions => {
    const spy = jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ ...dimensions, height: 844, scale: 3 });
    try {
      const t = training(); t.summary.sets = 123456; t.summary.minutes = 123456;
      mockTraining.mockResolvedValue(ok(t)); const view = wrap(<TrainingTrendsScreen />, comparing); await flush();
      const summary = within(view.getByTestId('training-summary'));
      for (const value of ['123.456', '2057 h 36 min']) {
        const text = summary.getByText(value); expect(text.props.numberOfLines).toBeUndefined();
        expect(text.props.adjustsFontSizeToFit).not.toBe(true); expect(text.props.allowFontScaling).not.toBe(false);
        expect(rn.StyleSheet.flatten(text.props.style).fontVariant).toContain('tabular-nums');
      }
    } finally { spy.mockRestore(); }
  });
  it('a single session stays unassessed instead of becoming stable or declined', async () => {
    const t = training(); t.summary.sessions = 1; t.summary.trainingDays = 1; t.exercises = [{ ...t.exercises[0], sessions: 1 }];
    t.inPeriod = { improved: 0, stable: 0, declined: 0, insufficient: 0, exercises: [] };
    mockTraining.mockResolvedValue(ok(t)); const view = wrap(<TrainingTrendsScreen />); await flush();
    expect(view.getByTestId('training-performance-insufficient_data').props.accessibilityState).toMatchObject({ selected: true });
    expect(view.getByText('Una sola sesión; todavía sin comparación.')).toBeTruthy();
    expect(view.queryByText('Se mantuvo.')).toBeNull();
  });
  it.each([1, 2])('keeps many daily buckets scrollable with 44pt targets and full dates at scale %i', async fontScale => {
    const spy = jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ width: 320, height: 844, scale: 3, fontScale });
    try {
      const t = training(); t.period.bucket = 'day';
      t.series = Array.from({ length: 28 }, (_, i) => { const date = `2026-09-${String(i + 1).padStart(2, '0')}`; return { start: date, end: date, sets: i === 1 ? 0 : 12, sessions: i === 1 ? 0 : 1, minutes: 50 }; });
      mockTraining.mockResolvedValue(ok(t)); const view = wrap(<TrainingTrendsScreen />); await flush(); openChart(view);
      const chart = view.getByTestId('training-chart'); expect(rn.StyleSheet.flatten(chart.props.style).width).toBeGreaterThanOrEqual(28 * 64 * fontScale);
      expect(view.getAllByTestId(/^training-bucket-2026/)).toHaveLength(28);
      const zero = view.getByTestId('training-bucket-2026-09-02'); expect(rn.StyleSheet.flatten(zero.props.style).minWidth).toBeGreaterThanOrEqual(44);
      fireEvent.press(zero); expect(within(view.getByTestId('training-bucket-inspection')).getByText('0 series')).toBeTruthy();
      expect(view.queryByRole('button', { name: 'Ver día y sesiones originales' })).toBeNull();
      fireEvent.press(view.getByTestId('training-bucket-2026-09-28'));
      expect(within(view.getByTestId('training-bucket-inspection')).getByText('28 de septiembre de 2026')).toBeTruthy();
      expect(mockPush).not.toHaveBeenCalled(); expect(mockTraining).toHaveBeenCalledTimes(1);
      fireEvent.press(view.getByRole('button', { name: 'Ver día y sesiones originales' }));
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/history/day/[date]', params: { date: '2026-09-28' } });
    } finally { spy.mockRestore(); }
  });
  it.each(['week', 'month'] as const)('inspects full %s intervals without attributing the total to their first day', async bucket => {
    const t = training(); t.period.bucket = bucket;
    t.series = [{ start: '2025-12-29', end: '2026-01-04', sessions: 2, sets: 24, minutes: 120 }, { start: TODAY, end: TODAY, sessions: 1, sets: 8, minutes: 40 }];
    mockTraining.mockResolvedValue(ok(t)); const view = wrap(<TrainingTrendsScreen />); await flush(); openChart(view);
    fireEvent.press(view.getByTestId('training-bucket-2025-12-29'));
    const readout = within(view.getByTestId('training-bucket-inspection'));
    expect(readout.getByText('29 de diciembre de 2025 – 4 de enero de 2026')).toBeTruthy(); expect(readout.getByText('24 series')).toBeTruthy();
    expect(readout.getByText('Total del intervalo; no corresponde a un único día.')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Ver día y sesiones originales' })).toBeNull();
    fireEvent.press(view.getByTestId(`training-bucket-${TODAY}`));
    expect(within(view.getByTestId('training-bucket-inspection')).getByText('1 sesión · período en curso')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Ver día y sesiones originales' })).toBeNull();
    expect(mockPush).not.toHaveBeenCalled(); expect(mockTraining).toHaveBeenCalledTimes(1);
  });
  it('does not fill omitted intervals or convert null from an incompatible response into a zero', async () => {
    const t = training(); t.period.bucket = 'day';
    t.series = [{ start: '2026-09-01', end: '2026-09-01', sets: 4, sessions: 1, minutes: 20 }, { start: '2026-09-03', end: '2026-09-03', sets: 8, sessions: 2, minutes: 40 }];
    mockTraining.mockResolvedValue(ok(t)); const view = wrap(<TrainingTrendsScreen />); await flush(); openChart(view);
    expect(view.queryByTestId('training-bucket-2026-09-02')).toBeNull();
    expect(parseProgressTraining({ ...t, series: [{ ...t.series[0], sets: null }] })).toBeUndefined();
  });
  it('retains the bucket through a local measure change and return; refresh/error update only its confirmed source', async () => {
    const view = wrap(<TrainingTrendsScreen />); await flush(); openChart(view);
    fireEvent.press(view.getByTestId('training-bucket-2026-09-06'));
    fireEvent.press(view.getByRole('radio', { name: 'Duración' }));
    expect(within(view.getByTestId('training-bucket-inspection')).getByText('0 h 50 min')).toBeTruthy();
    fireEvent.press(view.getByTestId(`training-exercise-${ex.bench}`));
    expect(mockTraining).toHaveBeenCalledTimes(1);
    const t = training(); t.series[0].minutes = 65;
    mockTraining.mockResolvedValue(ok(t)); act(() => view.UNSAFE_getByType(RefreshControl).props.onRefresh()); await flush(); openChart(view);
    expect(within(view.getByTestId('training-bucket-inspection')).getByText('1 h 5 min')).toBeTruthy();
    mockTraining.mockResolvedValue({ status: 'unavailable', reason: 'network', meta: { ...meta, outcome: 'unavailable' } });
    act(() => view.UNSAFE_getByType(RefreshControl).props.onRefresh()); await flush(); openChart(view);
    expect(within(view.getByTestId('training-bucket-inspection')).getByText('1 h 5 min')).toBeTruthy();
    expect(view.getByText('No se pudo actualizar. Mostramos la última lectura confirmada.')).toBeTruthy();
    const changed = training(); changed.series = changed.series.slice(1); mockTraining.mockResolvedValue(ok(changed));
    act(() => view.UNSAFE_getByType(RefreshControl).props.onRefresh()); await flush(); openChart(view);
    expect(view.queryByTestId('training-bucket-inspection')).toBeNull(); expect(view.getByText('El intervalo seleccionado ya no está disponible.')).toBeTruthy();
    mockCurrentClient = null;
    view.rerender(<SafeAreaProvider><OwnlevelThemeProvider><ProgressRangeProvider initialToday={TODAY}><TrainingTrendsScreen /></ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>); await flush();
    expect(view.queryByTestId('training-bucket-inspection')).toBeNull(); expect(view.queryByText('Press banca')).toBeNull();
  });
  it('resets activity inspection when the requested period changes', async () => {
    const view = wrap(<TrainingTrendsScreen />); await flush(); openChart(view); fireEvent.press(view.getByTestId('training-bucket-2026-09-06'));
    await changeTrainingPeriod(view); openChart(view);
    expect(view.queryByTestId('training-bucket-inspection')).toBeNull(); expect(mockTraining).toHaveBeenCalledTimes(2);
  });
  it('filters mixed performance without changing classifications or fetching', async () => {
    const t = training();
    for (const [id, name, status] of [[ex.dips, 'Fondos', 'stable'], ['another-id', 'Curl', 'declined']] as const) {
      t.exercises.push({ ...t.exercises[0], id, name, status, isPersonalRecord: false });
      t.inPeriod!.exercises.push({ ...t.inPeriod!.exercises[0], id, status, signal: status === 'stable' ? null : { kind: 'fewer_reps_same_load', description: '−1 reps con 60 kg', currentValue: 9, referenceValue: 10, contextValue: 60 } });
    }
    mockTraining.mockResolvedValue(ok(t)); const view = wrap(<TrainingTrendsScreen />, comparing); await flush();
    fireEvent.press(view.getByTestId('training-performance-stable')); expect(view.getByText('Se mantuvo.')).toBeTruthy();
    fireEvent.press(view.getByTestId('training-performance-declined')); expect(view.getByText('10 → 9 reps con 60 kg')).toBeTruthy();
    fireEvent.press(view.getByTestId('training-performance-insufficient_data')); expect(view.getAllByText('Este modo de carga no tiene una comparación confiable.').length).toBeGreaterThan(0);
    expect(mockTraining).toHaveBeenCalledTimes(1);
  });
  it('uses the canonical insufficiency of an A/B comparison even if a previous count is present', async () => {
    const t = training();
    t.summary.comparisons.sets = cmp({ status: 'insufficient_data', reason: 'insufficient_previous_samples', previous: 4, deltaAbsolute: null, deltaPercent: null, change: 'insufficient_data' });
    mockTraining.mockResolvedValue(ok(t)); const view = wrap(<TrainingTrendsScreen />, comparing); await flush(); openChart(view);
    const row = within(view.getByTestId('training-summary'));
    expect(row.getByText('Sin comparación: pocos datos en el período de comparación.')).toBeTruthy();
    expect(row.queryByText(/8 series|200%/)).toBeNull();
  });

  it('P1-C1: a portada point selects only the same sets bucket; another value or interval selects nothing and says so', async () => {
    mockParams = { point: '2026-09-06~2026-09-12', pointValue: '4', pointText: '6–12 sep 2026: 4 series' };
    const view = wrap(<TrainingTrendsScreen />); await flush(); openChart(view);
    expect(within(view.getByTestId('training-bucket-inspection')).getByText('4 series')).toBeTruthy();
    expect(view.getByTestId('portada-point-note').props.accessibilityLabel).toBe('Desde la portada: 6–12 sep 2026: 4 series. Seleccionado en el gráfico.');
    // The reader's own choice retires the portada context; the chart keeps working as before.
    fireEvent.press(view.getByTestId('training-bucket-2026-09-13'));
    expect(view.queryByTestId('portada-point-note')).toBeNull(); expect(within(view.getByTestId('training-bucket-inspection')).getByText('8 series')).toBeTruthy();
    view.unmount();
    for (const point of [{ point: '2026-09-06~2026-09-12', pointValue: '5' }, { point: '2026-09-06~2026-09-08', pointValue: '4' }]) {
      mockParams = { ...point, pointText: 'Intervalo de la portada' };
      const other = wrap(<TrainingTrendsScreen />); await flush();
      expect(other.queryByTestId('training-bucket-inspection')).toBeNull();
      expect(other.getByTestId('portada-point-note').props.accessibilityLabel).toMatch(/no seleccionamos otro en su lugar/);
      other.unmount();
    }
    expect(mockTraining).toHaveBeenCalledTimes(1); // the confirmed read is reused; matching the point is local
  });
  it('P1-C1: the portada point is retired by a period change or another account', async () => {
    mockParams = { point: '2026-09-06~2026-09-12', pointValue: '4', pointText: '6–12 sep 2026: 4 series' };
    const view = wrap(<TrainingTrendsScreen />); await flush(); openChart(view);
    expect(view.getByTestId('training-bucket-inspection')).toBeTruthy();
    await changeTrainingPeriod(view); openChart(view);
    expect(view.queryByTestId('training-bucket-inspection')).toBeNull(); expect(view.queryByTestId('portada-point-note')).toBeNull();
    view.unmount();
    const again = wrap(<TrainingTrendsScreen />); await flush(); expect(again.getByTestId('training-bucket-inspection')).toBeTruthy();
    mockCurrentClient = { request: jest.fn(), read: jest.fn() } as unknown as MobileApiClient;
    again.rerender(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}><OwnlevelThemeProvider initialMode="light"><ProgressRangeProvider initialToday={TODAY}><TrainingTrendsScreen /></ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>); await flush();
    expect(again.queryByTestId('training-bucket-inspection')).toBeNull(); expect(again.queryByTestId('portada-point-note')).toBeNull();
  });
});
