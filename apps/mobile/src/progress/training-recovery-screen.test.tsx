import { beforeEach, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { MobileApiClient } from '@/api/client';
import type { ProgressQuery } from '@/api/progress';
import type { MobileApiReadResult } from '@/api/results';
import type { ProgressTrainingRecovery, RecoverySelection } from '@/api/training-recovery';
import { clearConfirmedReads } from '@/api/confirmed-read-cache';
import { OwnlevelThemeProvider } from '@/design-system';
import { ProgressRangeProvider } from './progress-range-context';
import { TrainingRecoveryScreen } from './training-recovery-screen';
import { recoveryFixture, recoveryFixtureId, RECOVERY_TODAY } from './training-recovery.test-helper';

const mockPush = jest.fn(), mockRead = jest.fn<(query: ProgressQuery, selection: RecoverySelection) => Promise<MobileApiReadResult<ProgressTrainingRecovery>>>();
const mockClient = {} as MobileApiClient;
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }), Stack: { Screen: () => null }, useFocusEffect: (callback: () => void | (() => void)) => { jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]); } }));
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() } }));
jest.mock('@/training/exercise-segmented', () => jest.requireActual('@/training/exercise-segmented.tsx'));
jest.mock('@/api/training-recovery', () => ({ ...jest.requireActual<object>('@/api/training-recovery'), fetchTrainingRecovery: (_client: MobileApiClient, query: ProgressQuery, selection: RecoverySelection) => mockRead(query, selection) }));
const flush = () => act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });
const show = () => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}><OwnlevelThemeProvider initialMode="dark"><ProgressRangeProvider initialToday={RECOVERY_TODAY} initialState={{ unit: 'custom', anchor: RECOVERY_TODAY, custom: { start: '2026-08-01', end: RECOVERY_TODAY }, compare: { kind: 'none' } }}><TrainingRecoveryScreen /></ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>);
const ok = (data: ProgressTrainingRecovery): MobileApiReadResult<ProgressTrainingRecovery> => ({ status: 'ok', data, meta: { httpStatus: 200, durationMs: 1, outcome: 'ok' } });
beforeEach(() => { jest.clearAllMocks(); clearConfirmedReads(mockClient); mockRead.mockImplementation(async (_q, selection) => ok(recoveryFixture(selection))); });

it('switches from any session to the same routine and keeps intervening workouts explicit', async () => {
  const v = show(); await flush(); expect(mockRead).toHaveBeenCalledTimes(1);
  fireEvent.press(v.getByRole('radio', { name: 'Misma rutina' })); await flush();
  expect(mockRead.mock.calls.at(-1)![1].scope).toBe('routine');
  expect(v.getByText('1 entrenamiento registrado en el medio.')).toBeTruthy();
  fireEvent.press(v.getByTestId('recovery-previous-' + recoveryFixtureId(12)));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/progress/training-session/[id]', params: { id: recoveryFixtureId(10) } });
});
it('changes energy/fatigue presentation locally and inspects a group without clearing the chart', async () => {
  const v = show(); await flush();
  fireEvent.press(v.getByRole('radio', { name: 'Fatiga' })); expect(mockRead).toHaveBeenCalledTimes(1);
  let finish!: (value: MobileApiReadResult<ProgressTrainingRecovery>) => void;
  mockRead.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.press(v.getByTestId('recovery-bin-0')); await flush();
  expect(v.getByTestId('recovery-chart')).toBeTruthy(); expect(v.getByText('Actualizando sesiones…')).toBeTruthy();
  await act(async () => { finish(ok(recoveryFixture({ scope: 'all', routine: null, bin: 0, offset: 0 }))); }); await flush();
  expect(v.queryByText('Actualizando sesiones…')).toBeNull();
  fireEvent.press(v.getByTestId('recovery-session-' + recoveryFixtureId(12)));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/progress/training-session/[id]', params: { id: recoveryFixtureId(12) } });
});
it('filters the current routine, retaining the selected general predecessor scope', async () => {
  const v = show(); await flush(); fireEvent.press(v.getByTestId('recovery-routine'));
  fireEvent.press(v.getByTestId('recovery-routine-' + recoveryFixtureId(700))); await flush();
  expect(mockRead.mock.calls.at(-1)![1]).toEqual({ scope: 'all', routine: recoveryFixtureId(700), bin: null, offset: 0 });
});
it('keeps an unavailable source distinct from no interval and offers retry', async () => {
  mockRead.mockResolvedValue({ status: 'unavailable', reason: 'network', meta: { httpStatus: 503, durationMs: 1, outcome: 'unavailable' } });
  const v = show(); await flush(); expect(v.getByText('No pudimos traer los intervalos entre sesiones.')).toBeTruthy();
  expect(v.queryByText('0 de 0 sesiones con intervalo utilizable')).toBeNull();
  fireEvent.press(v.getByText('Reintentar')); await flush(); expect(mockRead).toHaveBeenCalledTimes(2);
});
