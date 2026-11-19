import { fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileApiClient } from '@/api/client';
import { clearConfirmedReads } from '@/api/confirmed-read-cache';
import type { MobileApiReadResult } from '@/api/results';
import { createInsightsSnapshot, insightsOwnPerformance, insightsSummary } from '../../../../src/lib/progress/insights-engine/read-model';
import type { InsightsSource } from '../../../../src/lib/progress/insights-engine/types';
import { InsightsScreen } from './insights-screen';
import { OwnScreen } from './own-screen';
import { TramoScreen } from './tramo-screen';
import { binLabel, exerciseLine, phrase } from './own-model';

/** «Rendimiento frente a lo tuyo» and Cómo llegaste por tramos. Fictitious data only, built by the real engine. */
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockPush = jest.fn(), mockSetParams = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, setParams: mockSetParams, back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: () => true }),
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
type ReadOptions = Parameters<MobileApiClient['read']>[0];
const mockRead = jest.fn<(options: ReadOptions) => Promise<MobileApiReadResult<unknown>>>();
const mockClient = { read: mockRead, request: jest.fn() } as unknown as MobileApiClient;
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));

const id = (n: number) => `70100000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ROUTINE = id(900), PRESS = id(800), DIPS = id(801), SLEEP = id(700);
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** Thirty sessions every three days: five to build «lo tuyo», then sleep in three levels, with more reps the nights with more sleep. */
function source(): InsightsSource {
  const levels = [300, 420, 540];
  const sessions: InsightsSource['sessions'][number][] = [], exercises: InsightsSource['exercises'][number][] = [], sets: InsightsSource['sets'][number][] = [], metricValues: InsightsSource['metricValues'][number][] = [];
  for (let index = 0; index < 30; index++) {
    const date = shift('2026-08-21', index * 3), sessionId = id(index + 1), sleep = levels[index % 3]!, reps = index < 5 ? 10 : 10 + levels.indexOf(sleep);
    sessions.push({ id: sessionId, date, routineId: ROUTINE, routineName: 'ESPALDA', name: null, status: 'completed', startedAt: `${date}T19:00:00-03:00`, endedAt: `${date}T20:00:00-03:00`, performanceLevel: null, painLevel: null, legacyEnergyLevel: null, dayWeightKg: null });
    for (const [key, exerciseId, load] of [['p', PRESS, 50], ['d', DIPS, null]] as const) {
      exercises.push({ id: `${sessionId}-${key}`, sessionId, exerciseId, name: key === 'p' ? 'Remo' : 'Fondos', implement: key === 'p' ? 'maquina' : null, weightMode: key === 'p' ? 'Peso total' : null, isCompleted: true, configuration: 'recorded:prueba' });
      sets.push({ id: `${sessionId}-${key}-1`, sessionExerciseId: `${sessionId}-${key}`, actualReps: reps, actualLoad: load, isCompleted: true, completedAt: `${date}T19:10:00-03:00` });
    }
    metricValues.push({ metricId: SLEEP, date, value: sleep, sleepNight: 'declared' });
  }
  return { sessions, exercises, sets, meals: [], feelings: [], metricValues, metricDefinitions: [{ id: SLEEP, name: 'Sueño', unit: 'min', valueType: 'decimal', archived: false, systemKey: 'sleep', order: 1 }] };
}
const snapshot = () => createInsightsSnapshot(source(), { today: '2026-11-17', method: 2, revision: 'r1' });
function answer(options: ReadOptions): Promise<MobileApiReadResult<unknown>> {
  const query = new URLSearchParams(options.path.split('?')[1]);
  const body = query.get('view') === 'own' ? insightsOwnPerformance(snapshot(), query.get('routine')) : insightsSummary(snapshot());
  const data = options.parse ? options.parse(JSON.parse(JSON.stringify(body))) : body;
  return Promise.resolve(data ? { status: 'ok', data, meta } as MobileApiReadResult<unknown> : { status: 'error', kind: 'contract', meta } as unknown as MobileApiReadResult<unknown>);
}
const screen = (node: React.ReactElement) => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}><OwnlevelThemeProvider>{node}</OwnlevelThemeProvider></SafeAreaProvider>);
const ownReads = () => mockRead.mock.calls.map(([options]) => options.path).filter(path => path.includes('view=own'));

beforeEach(() => { mockRead.mockReset(); mockRead.mockImplementation(answer); mockPush.mockReset(); mockSetParams.mockReset(); mockParams = {}; clearConfirmedReads(mockClient); });

describe('palabras de lo tuyo', () => {
  it('says each exercise against its own level, and when it is still being built', () => {
    expect(exerciseLine({ exerciseId: 'a', name: 'Remo', kind: 'load', today: { load: 60, reps: 10 }, base: { load: 55, reps: 11 }, bases: 5, pct: 3.2 })).toBe('60 kg × 10 · lo tuyo: 55 kg × 11');
    expect(exerciseLine({ exerciseId: 'a', name: 'Fondos', kind: 'reps', today: { load: null, reps: 12 }, base: { load: null, reps: 12 }, bases: 4, pct: 0 })).toBe('12 reps · igual que lo tuyo');
    expect(exerciseLine({ exerciseId: 'a', name: 'Remo', kind: 'load', today: { load: 7.5, reps: 20 }, base: null, bases: 2, pct: null })).toBe('7,5 kg × 20 · lo tuyo se arma con 3 veces (van 2)');
  });
});

describe('pantallas', () => {
  it('Sesiones leads with «frente a lo tuyo» from the summary, one read on open, and the exercises only when asked', async () => {
    const view = screen(<InsightsScreen />);
    const hero = await view.findByTestId('comparisons-own-hero');
    expect(within(hero).getByText(/^[+−]?[\d,]+ %$/)).toBeTruthy();
    expect(view.getByTestId('comparisons-previous-line')).toBeTruthy();
    expect(ownReads()).toEqual([]);
    fireEvent.press(view.getByTestId('comparisons-own-open'));
    const sheet = await view.findByTestId('comparisons-own-exercises');
    expect(within(sheet).getByText('Remo')).toBeTruthy();
    expect(ownReads()).toHaveLength(1);
  });
  it('Cómo llegaste shows each factor in tramos, says «más» only when clear, and keeps the ones without data together', async () => {
    mockParams = { view: 'relation' };
    const view = screen(<InsightsScreen />);
    const sleep = await view.findByTestId('own-factor-sleep_night_before');
    expect(within(sleep).getByText('Más sueño, más rendimiento')).toBeTruthy();
    // The clear one leads; the rest share one «Sin diferencia clara» line instead of repeating it on every row.
    expect(view.queryAllByText('Sin diferencia clara').length).toBeLessThanOrEqual(1);
    expect(view.getByRole('button', { name: /^\d+ datos todavía sin datos para comparar: .*Carbos 3 h antes/ })).toBeTruthy();
    fireEvent.press(sleep);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/train/insights/tramo', params: expect.objectContaining({ factor: 'sleep_night_before', horizon: 'day' }) });
    // The week before: sleep recorded every three days never reaches four nights, so it waits with the rest.
    fireEvent.press(view.getByRole('radio', { name: 'La semana anterior' }));
    expect(view.queryByTestId('own-factor-sleep_week')).toBeNull();
    expect(view.getByRole('button', { name: /todavía sin datos para comparar: .*Sueño promedio/ })).toBeTruthy();
  });
  it('a factor in tramos shows its chart and the same comparison per routine; one without data says how many and why', async () => {
    mockParams = { factor: 'sleep_night_before', horizon: 'day' };
    const ready = screen(<TramoScreen />);
    expect(await ready.findByTestId('tramo-ready')).toBeTruthy();
    expect(ready.getByTestId('tramo-phrase').props.children).toBe('Más sueño, más rendimiento');
    ready.unmount();
    mockParams = { factor: 'carbs_pre_3h', horizon: 'day' };
    const waiting = screen(<TramoScreen />);
    expect(await waiting.findByTestId('tramo-waiting')).toBeTruthy();
    expect(within(waiting.getByTestId('tramo-why')).getByText('Sin comidas con hora en esas 3 h')).toBeTruthy();
  });
  it('Tu rendimiento shows twelve weeks over «lo tuyo» and each routine', async () => {
    const view = screen(<OwnScreen />);
    expect(await view.findByTestId('own-week-bars')).toBeTruthy();
    expect(view.getByTestId('own-routines')).toBeTruthy();
    expect(view.getByText(/^ESPALDA · 30 sesiones$/)).toBeTruthy();
  });
});

describe('tramos en palabras', () => {
  it('names numeric tramos in their unit and keeps a category word', () => {
    const model = insightsOwnPerformance(snapshot(), null);
    const sleep = model.factors.day.find(row => row.key === 'sleep_night_before')!;
    expect(sleep.bins.map(bin => binLabel(sleep, bin))).toEqual(['menos de 7 h', '7 h a 9 h', '9 h o más']);
    expect(phrase(sleep, [])).toEqual({ text: 'Más sueño, más rendimiento', clear: true });
    const hour = model.factors.day.find(row => row.key === 'training_hour')!;
    expect(hour.bins.map(bin => binLabel(hour, bin))).toEqual(['mañana', 'tarde', 'noche']);
  });
});
