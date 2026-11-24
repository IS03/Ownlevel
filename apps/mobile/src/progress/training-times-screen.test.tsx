import { beforeEach, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { MobileApiClient } from '@/api/client';
import type { ProgressQuery } from '@/api/progress';
import type { ProgressTrainingTimes, TrainingTimeSelection } from '@/api/training-times';
import type { MobileApiReadResult } from '@/api/results';
import { clearConfirmedReads } from '@/api/confirmed-read-cache';
import { OwnlevelThemeProvider } from '@/design-system';
import { ProgressRangeProvider } from './progress-range-context';
import { TrainingTimesScreen } from './training-times-screen';
import { timesFixture, TIMES_TODAY } from './training-times.test-helper';

const mockPush = jest.fn(), mockRead = jest.fn<(query: ProgressQuery, selection: TrainingTimeSelection) => Promise<MobileApiReadResult<ProgressTrainingTimes>>>();
const mockClient = {} as MobileApiClient;
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }), Stack: { Screen: () => null },
  useFocusEffect: (callback: () => void | (() => void)) => { jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]); } }));
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() } }));
jest.mock('@/api/training-times', () => ({ ...jest.requireActual<object>('@/api/training-times'),
  fetchTrainingTimes: (_client: MobileApiClient, query: ProgressQuery, selection: TrainingTimeSelection) => mockRead(query, selection) }));

const flush = () => act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });
const show = () => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
  <OwnlevelThemeProvider initialMode="dark"><ProgressRangeProvider initialToday={TIMES_TODAY} initialState={{ unit: 'custom', anchor: TIMES_TODAY, custom: { start: '2026-08-01', end: TIMES_TODAY }, compare: { kind: 'none' } }}>
    <TrainingTimesScreen />
  </ProgressRangeProvider></OwnlevelThemeProvider>
</SafeAreaProvider>);
beforeEach(() => {
  jest.clearAllMocks(); clearConfirmedReads(mockClient);
  mockRead.mockImplementation(async (_q, selection) => ({ status: 'ok', data: timesFixture(selection), meta: { httpStatus: 200, durationMs: 1, outcome: 'ok' } }));
});

it('opens once, inspects a real bin and opens the original in the same Progress stack', async () => {
  const v = show(); await flush(); expect(mockRead).toHaveBeenCalledTimes(1);
  expect(v.getByText(/12 de 12 sesiones con inicio utilizable/)).toBeTruthy();
  fireEvent.press(v.getByTestId('training-time-bin-4')); await flush();
  expect(mockRead.mock.calls.at(-1)![1].bin).toBe(4);
  const row = timesFixture({ routine: null, execution: null, bin: 4, offset: 0 }).page.rows[0]!;
  fireEvent.press(v.getByTestId(`training-time-session-${row.id}`));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/progress/training-session/[id]', params: { id: row.id } });
});
it('changes display metrics locally, shows energy coverage and requires one execution for loads', async () => {
  const v = show(); await flush();
  fireEvent.press(v.getByTestId('training-time-metric')); fireEvent.press(v.getByTestId('training-time-choose-energy')); await flush();
  expect(mockRead).toHaveBeenCalledTimes(1); expect(v.getByTestId('training-time-energy-distribution')).toBeTruthy();
  fireEvent.press(v.getByTestId('training-time-metric')); fireEvent.press(v.getByTestId('training-time-choose-load')); await flush();
  expect(v.getByTestId('training-times-execution-sheet')).toBeTruthy();
  expect(v.queryByText('Las sesiones detrás')).toBeNull();
  const execution = timesFixture().executions[0]!;
  fireEvent.press(v.getByTestId(`training-time-exercise-${execution.exerciseId}`)); await flush();
  expect(mockRead.mock.calls.at(-1)![1].execution).toBe(execution.key);
  expect(v.getByText('Las sesiones detrás')).toBeTruthy();
});
it('filters routines and clears the narrower selections together', async () => {
  const v = show(); await flush();
  fireEvent.press(v.getByTestId('training-time-routine'));
  const routine = timesFixture().routines[0]!;
  fireEvent.press(v.getByTestId(`training-time-routine-${routine.id}`)); await flush();
  expect(mockRead.mock.calls.at(-1)![1]).toEqual({ routine: routine.id, execution: null, bin: null, offset: 0 });
});
it('keeps the chart while another bin loads and never shows the preceding bin’s session page', async () => {
  const v = show(); await flush();
  let finish!: (value: MobileApiReadResult<ProgressTrainingTimes>) => void;
  mockRead.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.press(v.getByTestId('training-time-bin-4')); await flush();
  expect(v.getByTestId('training-times-chart')).toBeTruthy();
  expect(v.getByText('Actualizando sesiones…')).toBeTruthy();
  const data = timesFixture({ routine: null, execution: null, bin: 4, offset: 0 });
  await act(async () => { finish({ status: 'ok', data, meta: { httpStatus: 200, durationMs: 1, outcome: 'ok' } }); });
  await flush(); expect(v.queryByText('Actualizando sesiones…')).toBeNull();
  expect(v.getByTestId(`training-time-session-${data.page.rows[0]!.id}`)).toBeTruthy();
});
it('keeps source failures distinct from no workouts and allows retry', async () => {
  mockRead.mockResolvedValue({ status: 'unavailable', reason: 'network', meta: { httpStatus: 503, durationMs: 1, outcome: 'unavailable' } });
  const v = show(); await flush();
  expect(v.getByText('No pudimos traer tus horarios.')).toBeTruthy();
  expect(v.queryByText('0 sesiones')).toBeNull();
  fireEvent.press(v.getByText('Reintentar')); await flush(); expect(mockRead).toHaveBeenCalledTimes(2);
});

it('shows the selected context and changes presentation without another read', async () => {
  mockRead.mockImplementation(async (_q, selection) => {
    const data = timesFixture(selection);
    for (const group of [data.total, ...data.bins, ...data.bands]) group.comparisonContext = { complete: 0, partial: group.performance.improved };
    return { status: 'ok', data, meta: { httpStatus: 200, durationMs: 1, outcome: 'ok' } };
  });
  const view = show(); await flush();
  fireEvent.press(view.getByTestId('training-time-metric')); fireEvent.press(view.getByTestId('training-time-choose-improvements')); await flush();
  expect(view.getByText('0 con contexto completo · 12 parciales')).toBeTruthy();
  expect(mockRead).toHaveBeenCalledTimes(1);
  fireEvent.press(view.getByTestId('training-time-bin-4')); await flush();
  expect(view.getByText('0 con contexto completo · 6 parciales')).toBeTruthy();
  expect(mockRead).toHaveBeenCalledTimes(2);
});
