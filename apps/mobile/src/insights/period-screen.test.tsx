import { act, fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileApiClient } from '@/api/client';
import { clearConfirmedReads } from '@/api/confirmed-read-cache';
import type { MobileApiReadResult } from '@/api/results';
import { createInsightsSnapshot, insightsPeriodSummary } from '../../../../src/lib/progress/insights-engine/read-model';
import type { InsightsSource } from '../../../../src/lib/progress/insights-engine/types';
import { PeriodScreen } from './period-screen';
import { insightsReturnHref } from './navigation';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }), useFocusEffect: () => undefined, useLocalSearchParams: () => ({}) }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
type ReadOptions = Parameters<MobileApiClient['read']>[0];
const mockRead = jest.fn<(options: ReadOptions) => Promise<MobileApiReadResult<unknown>>>();
const mockClient = { read: mockRead, request: jest.fn() } as unknown as MobileApiClient;
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));

const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const lost = { status: 'unavailable' as const, reason: 'network' as const, meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' as const } };
const id = (group: number, n: number) => `93670000-0000-4000-8${String(group).padStart(3, '0')}-${String(n).padStart(12, '0')}`;
function history(sessions: { date: string; routine: string; reps: number; post?: number }[], meals: string[] = []): InsightsSource {
  const source: InsightsSource = { sessions: [], exercises: [], sets: [], feelings: [], metricDefinitions: [], metricValues: [], meals: [] };
  sessions.forEach((row, n) => {
    (source.sessions as InsightsSource['sessions'][number][]).push({ id: id(2, n), date: row.date, routineId: row.routine, routineName: row.routine, name: null, status: 'completed',
      startedAt: `${row.date}T18:00:00-03:00`, endedAt: `${row.date}T19:00:00-03:00`, performanceLevel: null, painLevel: null, legacyEnergyLevel: null });
    (source.exercises as InsightsSource['exercises'][number][]).push({ id: id(3, n), sessionId: id(2, n), exerciseId: id(1, 1), name: 'Press', implement: 'barra', weightMode: 'Peso total', isCompleted: true, configuration: 'recorded:a' });
    (source.sets as InsightsSource['sets'][number][]).push({ id: id(4, n), sessionExerciseId: id(3, n), actualReps: row.reps, actualLoad: 60, isCompleted: true, completedAt: null });
    if (row.post) (source.feelings as InsightsSource['feelings'][number][]).push({ sessionId: id(2, n), revision: 1, facts: { energyPost: { value: row.post, instrumentVersion: 'energy-fatigue/1', declaredMoment: 'post', declaredAt: null, capturedAt: `${row.date}T19:05:00-03:00`, source: 'mobile' } } });
  });
  meals.forEach((date, n) => (source.meals as InsightsSource['meals'][number][]).push({ id: id(5, n), date, consumedAt: null, consumedAtSource: null, rawInput: null, entryKind: 'meal', sourceType: 'manual', importRunId: null, calories: 2000, proteinG: 120, carbsG: 200, fatG: 60 }));
  return source;
}
const serve = (source: InsightsSource, weights: { date: string; value: number }[] = []) => async (options: ReadOptions) => {
  const body = insightsPeriodSummary(createInsightsSnapshot(source, { today: '2026-11-06', revision: 'r1', method: 2 }), weights);
  const parsed = options.parse(JSON.parse(JSON.stringify(body)));
  if (parsed === undefined) throw Error(`Contract rejected ${options.path}`);
  return { status: 'ok' as const, data: parsed, meta };
};
const open = async () => {
  const view = render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><OwnlevelThemeProvider initialMode="light"><PeriodScreen /></OwnlevelThemeProvider></SafeAreaProvider>);
  await act(async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setTimeout(resolve, 0)); });
  return view;
};
const weights = ['2026-08-03', '2026-08-05', '2026-08-07', '2026-08-10', '2026-08-12', '2026-08-14'].map((date, n) => ({ date, value: n < 3 ? 80 : 79.5 }));
beforeEach(() => { mockPush.mockClear(); mockRead.mockReset(); clearConfirmedReads(mockClient); });

describe('#367 fase 4: resumen de los últimos tres meses', () => {
  it('reads once when it opens and writes the period with its exact dates and figures, facts only', async () => {
    mockRead.mockImplementation(serve(history([{ date: '2026-08-03', routine: 'A', reps: 8, post: 4 }, { date: '2026-08-20', routine: 'A', reps: 9 }, { date: '2026-09-15', routine: 'B', reps: 9, post: 2 }], ['2026-08-03', '2026-08-04']), weights));
    const view = await open();
    expect(mockRead).toHaveBeenCalledTimes(1);
    expect(String(mockRead.mock.calls[0]![0].path)).toContain('view=period');
    expect(view.getByTestId('period-range')).toHaveTextContent('1 ago – 31 oct');
    expect(view.getByText('Agosto, septiembre y octubre. El mes en curso no entra.')).toBeTruthy();
    const written = within(view.getByTestId('period-written'));
    expect(written.getByText('Entrenaste 3 veces en 3 días.')).toBeTruthy();
    expect(written.getByText('Comparación completa: 2 de 3 ejercicios comparables.')).toBeTruthy();
    expect(written.getByText('Registraste comidas en 2 de 92 días. Es lo registrado, no necesariamente todo lo que comiste.')).toBeTruthy();
    expect(written.getByText('Rutinas, una después de otra: A, B.')).toBeTruthy();
    expect(view.queryByText(/explica|porque|por eso|causa|relación entre/i)).toBeNull();
    // Each method on its own row; the end answers in the words of the scale.
    const training = within(view.getByTestId('period-training'));
    expect(training.getByText('Comparación completa')).toBeTruthy(); expect(training.getByText('Con contexto parcial')).toBeTruthy();
    expect(within(view.getByTestId('period-feelings')).getByText('alta 1 · baja 1')).toBeTruthy();
    expect(within(view.getByTestId('period-weight')).getByText('Mediana 79,5 kg')).toBeTruthy();
  });

  it('opens each detail and comes back to the summary from Cuerpo', async () => {
    mockRead.mockImplementation(serve(history([{ date: '2026-08-03', routine: 'A', reps: 8 }]), weights));
    const view = await open();
    fireEvent.press(view.getByRole('button', { name: 'Ver tu peso en Cuerpo, en los mismos tres meses' }));
    const href = mockPush.mock.calls.at(-1)![0] as { pathname: string; params: Record<string, string> };
    expect(href).toMatchObject({ pathname: '/(tabs)/progress/trends/body', params: { from: '2026-08-01', to: '2026-10-31', insightsReturn: '1', insightsSummary: '1' } });
    expect(insightsReturnHref(href.params)).toEqual({ pathname: '/(tabs)/train/insights/period', params: {} });
    fireEvent.press(view.getByRole('button', { name: 'Ver Cómo terminaste, en todo tu historial' }));
    expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/train/insights/feelings');
    fireEvent.press(view.getByRole('button', { name: 'Ver los días en Insights' }));
    expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/train/insights');
  });

  it('says alternating routines alternated, and when no week has enough weigh-ins', async () => {
    mockRead.mockImplementation(serve(history([{ date: '2026-08-03', routine: 'A', reps: 8 }, { date: '2026-08-05', routine: 'B', reps: 8 }, { date: '2026-08-07', routine: 'A', reps: 8 }]), [{ date: '2026-08-04', value: 80 }]));
    const view = await open();
    expect(view.getByText('Alternaste 2 rutinas: A, B.')).toBeTruthy();
    expect(view.getByText('Las rutinas se alternaron: no hay un orden de una a otra.')).toBeTruthy();
    expect(view.getByTestId('period-weight-insufficient')).toBeTruthy();
  });

  it('tells an empty period from a failed read', async () => {
    mockRead.mockImplementation(serve(history([])));
    const empty = await open();
    expect(empty.getByTestId('period-empty')).toBeTruthy();
    empty.unmount(); clearConfirmedReads(mockClient);
    mockRead.mockResolvedValue(lost);
    const failed = await open();
    expect(failed.getByText('Uy, no pudimos leer tus datos')).toBeTruthy();
    expect(failed.queryByTestId('period-empty')).toBeNull();
  });
});
