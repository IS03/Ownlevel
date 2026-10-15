import { act, fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { parseProgressTraining, parseProgressTrainingExercise, type ProgressComparison, type ProgressQuery, type ProgressTraining, type ProgressTrainingExerciseDetail } from '@/api/progress';
import { TrainingTrendsScreen } from './training-trends-screen';
import { ExerciseTrendsScreen } from './exercise-trends-screen';
import { ProgressRangeProvider } from './progress-range-context';
import type { DateRange, ProgressRangeState } from './progress-range';

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
const mockTraining = jest.fn<(c: unknown, q: ProgressQuery, compare: DateRange | null) => Promise<unknown>>();
const mockExercise = jest.fn<(c: unknown, q: ProgressQuery, id: string, compare: DateRange | null) => Promise<unknown>>();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: () => undefined, useLocalSearchParams: () => mockParams, Stack: { Screen: () => null } }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn(), success: jest.fn(), warning: jest.fn() }, triggerHaptic: jest.fn() }));
const mockClient = { request: jest.fn(), read: jest.fn() };
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
jest.mock('@/api/progress', () => ({ ...jest.requireActual<object>('@/api/progress'),
  fetchProgressTraining: (c: unknown, q: ProgressQuery, _s: unknown, compare: DateRange | null) => mockTraining(c, q, compare),
  fetchProgressTrainingExercise: (c: unknown, q: ProgressQuery, id: string, _s: unknown, compare: DateRange | null) => mockExercise(c, q, id, compare) }));

const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const ok = <T,>(data: T) => ({ status: 'ok' as const, data, meta });
const TODAY = '2026-10-05';
const period = (preset: ProgressQuery['period'] = '30') => ({ preset, start: '2026-09-06', end: TODAY, days: 30, previousStart: '2026-08-07', previousEnd: '2026-09-05', bucket: 'week' as const, includesToday: true });
const cmp = (over: Partial<ProgressComparison> = {}): ProgressComparison => ({ status: 'comparable', reason: 'eligible', current: 2, previous: 1, deltaAbsolute: 1, deltaPercent: 100, change: 'increased', ...over });
const ex = { bench: 'e1000000-0000-4000-8000-000000000001', cable: 'e1000000-0000-4000-8000-000000000005', dips: 'e1000000-0000-4000-8000-000000000007', old: 'e1000000-0000-4000-8000-000000000008' };
function training(preset: ProgressQuery['period'] = '30', empty = false): ProgressTraining {
  const empties = { sessions: 0, sets: 0, minutes: 0 };
  return { today: TODAY, period: period(preset),
    summary: { sessions: empty ? 0 : 3, trainingDays: empty ? 0 : 2, sets: empty ? 0 : 12, minutes: empty ? 0 : 150, sessionsPerWeek: empty ? 0 : 0.7,
      comparisons: { sessions: empty ? cmp({ status: 'insufficient_data', reason: 'current_period_empty', current: 0, previous: 0, deltaAbsolute: null, deltaPercent: null, change: 'insufficient_data' }) : cmp({ current: 3, previous: 1, deltaAbsolute: 2, deltaPercent: 200 }),
        trainingDays: cmp(), sets: cmp({ current: 12, previous: 4, deltaAbsolute: 8, deltaPercent: 200 }), minutes: cmp({ current: 150, previous: 60, deltaAbsolute: 90, deltaPercent: 150 }), setsPerSession: cmp({ change: 'stable' }) },
      performance: empty ? { improved: 0, stable: 0, declined: 0, comparable: 0, insufficient: 0, headline: 'No hay suficiente historial comparable' } : { improved: 1, stable: 0, declined: 0, comparable: 1, insufficient: 2, headline: '1 de 1 ejercicios mejoraron' } },
    series: empty ? [{ start: '2026-09-06', end: '2026-09-12', ...empties }] : [{ start: '2026-09-06', end: '2026-09-12', sessions: 1, sets: 4, minutes: 50 }, { start: '2026-09-13', end: TODAY, sessions: 2, sets: 8, minutes: 100 }],
    inPeriod: empty ? { improved: 0, stable: 0, declined: 0, insufficient: 0, exercises: [] } : { improved: 1, stable: 0, declined: 0, insufficient: 1, exercises: [
      { id: ex.bench, status: 'improved', reason: 'comparable', sessions: 3, firstDate: '2026-09-20', lastDate: '2026-10-04', signal: { kind: 'more_load_same_reps', description: '+5 kg manteniendo 5 reps', currentValue: 80, referenceValue: 75, contextValue: 5 } },
      { id: ex.cable, status: 'insufficient_data', reason: 'unsupported_weight_mode', sessions: 2, firstDate: '2026-09-21', lastDate: '2026-10-01', signal: null },
    ] },
    exercises: empty ? [] : [
      { id: ex.bench, name: 'Press banca', muscleLabel: 'Pecho', weightMode: 'Peso total', status: 'improved', reason: 'comparable', isPersonalRecord: true,
        signal: { kind: 'new_best_weight', description: 'Nuevo mejor peso: 80 kg × 5', currentValue: 80, referenceValue: 75, contextValue: 5 }, sessions: 3, sets: 9, lastDate: '2026-10-04' },
      { id: ex.cable, name: 'Remo máquina', muscleLabel: 'Espalda', weightMode: 'Carga manual', status: 'insufficient_data', reason: 'unsupported_weight_mode', isPersonalRecord: false, signal: null, sessions: 2, sets: 3, lastDate: '2026-10-01' },
      { id: ex.old, name: 'Curl', muscleLabel: 'Bíceps', weightMode: 'Por mancuerna', status: 'insufficient_data', reason: 'not_trained_in_primary', isPersonalRecord: false, signal: null, sessions: 0, sets: 0, lastDate: null },
    ],
    personalRecords: empty ? [] : [{ exerciseId: ex.bench, name: 'Press banca', description: 'Nuevo mejor peso: 80 kg × 5' }],
    feelings: empty ? [] : [{ key: 'energy', label: 'Energía', average: 3.8, scaleMaximum: 5, registered: 1, eligible: 3, ratio: 1 / 3 }],
    muscles: empty ? [] : [{ key: 'pecho', label: 'Pecho', sets: 9, sessions: 3, exercises: 1 }],
    routines: empty ? [] : [{ id: '__free__', name: 'Sesión libre', sessions: 3, sets: 12, minutes: 150 }] };
}
function exercise(id: string): ProgressTrainingExerciseDetail {
  const unsupported = id === ex.cable;
  return { today: TODAY, period: period(), exercise: { id, name: unsupported ? 'Remo máquina' : 'Press banca', muscleLabel: 'Pecho', weightMode: unsupported ? 'Carga manual' : 'Peso total' },
    performance: unsupported ? { status: 'insufficient_data', reason: 'unsupported_weight_mode', signal: null, isPersonalRecord: false, primarySamples: 3, referenceSamples: 2 }
      : { status: 'improved', reason: 'comparable', signal: { kind: 'new_best_weight', description: 'Nuevo mejor peso: 80 kg × 5', currentValue: 80, referenceValue: 75, contextValue: 5 }, isPersonalRecord: true, primarySamples: 9, referenceSamples: 3 },
    comparisons: { sessions: cmp(), sets: cmp() },
    marks: unsupported ? [] : [{ kind: 'best_load', label: 'Mejor peso', value: 80, unit: 'kg', context: '5 reps', date: '2026-10-04' }],
    chart: unsupported ? null : { kind: 'load', unit: 'kg', points: [{ date: '2026-09-20', sessionId: 's-1', value: 75, context: 6 }, { date: '2026-10-04', sessionId: 's-2', value: 80, context: 5 }] },
    sessions: [{ sessionId: 's-2', date: '2026-10-04', routineName: 'Torso', sets: [{ reps: 5, weightKg: 80 }] }] };
}
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
const MONTH = { period: 'custom' as const, from: '2026-10-01', to: TODAY };
const comparing: ProgressRangeState = { unit: 'month', anchor: TODAY, custom: null, compare: { kind: 'previous' } };
const wrap = (el: React.ReactElement, initialState?: ProgressRangeState) => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
  <OwnlevelThemeProvider initialMode="light"><ProgressRangeProvider initialToday={TODAY} initialState={initialState}>{el}</ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>);
const listeners: ((s: string) => void)[] = [];

beforeEach(() => {
  jest.clearAllMocks(); mockParams = {}; listeners.length = 0;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, l) => { listeners.push(l as (s: string) => void); return { remove: jest.fn() } as never; });
  mockTraining.mockImplementation(async (_c, q) => ok(training(q.period)));
  mockExercise.mockImplementation(async (_c, _q, id) => ok(exercise(id)));
});

describe('Training Trends', () => {
  it('fixtures follow the contract', () => {
    expect(parseProgressTraining(training())).toBeDefined(); expect(parseProgressTraining(training('30', true))).toBeDefined();
    expect(parseProgressTrainingExercise(exercise(ex.bench))).toBeDefined(); expect(parseProgressTrainingExercise(exercise(ex.cable))).toBeDefined();
  });
  it('shows the flat summary, chart and breakdown segments, first/last performance, records and feeling coverage', async () => {
    const view = wrap(<TrainingTrendsScreen />); await flush();
    expect(view.getByTestId('training-summary')).toHaveTextContent('2 días · 3 sesiones · 12 series · 2 h 30 min');
    expect(view.getByText('La duración va del inicio al fin de cada sesión e incluye descansos.')).toBeTruthy();
    expect(view.getByText('Series por semana · esta semana en curso')).toBeTruthy();
    expect(view.getByText('1 ejercicio mejoró en octubre')).toBeTruthy();
    expect(within(view.getByTestId(`training-exercise-${ex.bench}`)).getByText('Mejoró · 75 → 80 · +5 kg manteniendo 5 reps')).toBeTruthy();
    expect(within(view.getByTestId(`training-exercise-${ex.cable}`)).getByText('Este modo de carga no tiene una comparación confiable.')).toBeTruthy();
    expect(view.queryByText(/Frente a/)).toBeNull(); expect(view.queryByText(/Sólo en el período de comparación/)).toBeNull();
    expect(within(view.getByTestId('training-prs')).getByText('Nuevo mejor peso: 80 kg × 5')).toBeTruthy();
    expect(view.getByText('Energía 3,8/5')).toBeTruthy(); expect(view.getByText('1 de 3 sesiones con registro · pocas sesiones con registro')).toBeTruthy();
    expect(view.queryByText(/volumen/i)).toBeNull();
    fireEvent.press(view.getByRole('radio', { name: 'Sesiones' })); expect(view.getByText('Sesiones por semana · esta semana en curso')).toBeTruthy();
    fireEvent.press(view.getByRole('radio', { name: 'Duración' })); expect(view.getByText('Duración por semana · esta semana en curso')).toBeTruthy();
    fireEvent.press(view.getByRole('radio', { name: 'Rutina' })); expect(view.getByText('Sesión libre')).toBeTruthy(); expect(view.getByText('3 sesiones')).toBeTruthy();
    fireEvent.press(view.getByRole('radio', { name: 'Ejercicio' })); fireEvent.press(view.getByTestId(`training-breakdown-${ex.bench}`));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/trends/exercise/[id]', params: { id: ex.bench } });
    fireEvent.press(view.getByTestId(`training-exercise-${ex.bench}`)); expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/trends/exercise/[id]', params: { id: ex.bench } });
    fireEvent.press(view.getByRole('button', { name: 'Abrir historial de entrenamiento' })); expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/train/history');
  });
  it('comparison adds the chosen reference to the summary and each performance row, without changing the in-period result', async () => {
    const view = wrap(<TrainingTrendsScreen />, comparing); await flush();
    expect(mockTraining).toHaveBeenLastCalledWith(mockClient, MONTH, { start: '2026-09-01', end: '2026-09-05' });
    expect(view.getByTestId('training-summary')).toHaveTextContent(/12 series · 1–5 sep 4 · ↗ 8/);
    expect(view.getByText('1 ejercicio mejoró en octubre')).toBeTruthy(); expect(view.getByText('Frente a 1–5 sep: Mejoró · Nuevo mejor peso: 80 kg × 5')).toBeTruthy();
    expect(view.getByText('Sólo en el período de comparación: Curl')).toBeTruthy();
  });
  it('expands all breakdown rows, groups single sessions and keeps zero day marks and dense chart values accessible', async () => {
    const t = training();
    t.muscles = Array.from({ length: 7 }, (_, i) => ({ key: `m${i}`, label: `Grupo ${i}`, sets: i + 1, sessions: 1, exercises: 1 }));
    t.exercises.push({ ...t.exercises[1], id: ex.dips, name: 'Fondos', sessions: 1 });
    t.series = Array.from({ length: 10 }, (_, i) => ({ start: `2026-09-${String(i + 1).padStart(2, '0')}`, end: `2026-09-${String(i + 1).padStart(2, '0')}`, sets: i === 1 ? 0 : 12, sessions: i === 1 ? 0 : 1, minutes: 10 }));
    t.period.bucket = 'day'; mockTraining.mockResolvedValue(ok(t));
    const view = wrap(<TrainingTrendsScreen />); await flush();
    expect(view.queryByText('Grupo 0')).toBeNull(); fireEvent.press(view.getByText('Ver todos (7)')); expect(view.getByText('Grupo 0')).toBeTruthy();
    expect(view.getByText('Con una sola sesión: Fondos')).toBeTruthy(); expect(view.getByTestId('training-bar-2026-09-02-zero')).toBeTruthy();
    expect(within(view.getByTestId('training-chart')).queryByText('12')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: '1 sep, 12 series' })); expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/history/day/[date]', params: { date: '2026-09-01' } });
  });
  it('no training in the period is a real empty state (no averages at 0); period changes ignore late responses; foreground re-reads', async () => {
    let release!: (v: unknown) => void;
    mockTraining.mockImplementationOnce(() => new Promise(r => { release = r; }));
    const view = wrap(<TrainingTrendsScreen />); await flush();
    mockTraining.mockImplementation(async (_c, q) => ok(training(q.period, true)));
    fireEvent.press(view.getByTestId('progress-unit-week')); await flush();
    expect(mockTraining).toHaveBeenLastCalledWith(mockClient, { period: 'custom', from: '2026-10-05', to: TODAY }, null);
    expect(view.queryByText(/frente a/)).toBeNull(); expect(view.queryByText(/Sólo en el período anterior/)).toBeNull();
    await act(async () => { release(ok(training('30'))); }); await flush();
    expect(view.queryByText('Press banca · PR')).toBeNull();
    expect(view.getByText('Sin entrenamientos en este período.')).toBeTruthy();
    expect(view.getByText('Sin sensaciones registradas en este período.')).toBeTruthy();
    expect(view.getByText('Sin récords nuevos en este período.')).toBeTruthy();
    const calls = mockTraining.mock.calls.length;
    await act(async () => { listeners.at(-1)!('background'); listeners.at(-1)!('active'); }); await flush();
    expect(mockTraining.mock.calls.length).toBe(calls + 1);
  });
});

describe('Exercise analytics', () => {
  it('shows performance, all-time marks, a mode-compatible chart and opens the session / exercise history', async () => {
    mockParams = { id: ex.bench };
    const view = wrap(<ExerciseTrendsScreen />); await flush();
    expect(mockExercise).toHaveBeenLastCalledWith(mockClient, MONTH, ex.bench, null);
    expect(within(view.getByTestId('exercise-trend-summary')).getByText('Mejoró · Récord en el período')).toBeTruthy();
    expect(within(view.getByTestId('exercise-trend-marks')).getByText(/Mejor peso: 80 kg · 5 reps/)).toBeTruthy();
    expect(view.getByText('Mejor carga por sesión')).toBeTruthy();
    fireEvent.press(within(view.getByTestId('exercise-trend-chart')).getByRole('button', { name: /80 kg × 5 reps/ }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/train/history/[id]', params: { id: 's-2' } });
    fireEvent.press(view.getByRole('button', { name: 'Abrir historial del ejercicio' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/train/history/exercise/[id]', params: { id: ex.bench } });
  });
  it('an unsupported weight mode has no chart and no fabricated comparison', async () => {
    mockParams = { id: ex.cable };
    const view = wrap(<ExerciseTrendsScreen />); await flush();
    expect(view.getByText('Este modo de carga no tiene una métrica de rendimiento comparable. Revisá las sesiones abajo.')).toBeTruthy();
    expect(view.getByText('Este modo de carga no tiene una comparación confiable.')).toBeTruthy();
    expect(view.queryByTestId('exercise-trend-chart')).toBeNull();
  });
  it('a 404 is an explicit "no records" state', async () => {
    mockParams = { id: ex.dips };
    mockExercise.mockResolvedValue({ status: 'unavailable', reason: 'http_error', meta: { durationMs: 1, httpStatus: 404, outcome: 'unavailable' } });
    const view = wrap(<ExerciseTrendsScreen />); await flush();
    expect(view.getByText('No hay registros completados de este ejercicio.')).toBeTruthy();
  });
});
