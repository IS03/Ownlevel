import { act, fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { parseProgressExplore, type ExploreRequest, type ProgressExplore, type ProgressQuery } from '@/api/progress';
import { ExploreScreen } from './explore-screen';
import { exerciseChoices } from './explore-model';
import { ProgressRangeProvider } from './progress-range-context';
import type { DateRange, ProgressRangeState } from './progress-range';

const mockExplore = jest.fn<(c: unknown, q: ProgressQuery, r: ExploreRequest, compare: DateRange | null) => Promise<unknown>>();
const mockPush = jest.fn();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: () => undefined, useLocalSearchParams: () => mockParams, Stack: { Screen: () => null } }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
const mockClient = { request: jest.fn(), read: jest.fn() };
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
jest.mock('@/api/progress', () => ({ ...jest.requireActual<object>('@/api/progress'),
  fetchProgressExplore: (c: unknown, q: ProgressQuery, r: ExploreRequest, _s: unknown, compare: DateRange | null) => mockExplore(c, q, r, compare) }));

const TODAY = '2026-10-05';
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const ok = <T,>(data: T) => ({ status: 'ok' as const, data, meta });
const MONTH = { period: 'custom' as const, from: '2026-10-01', to: TODAY };
const period = { preset: 'custom' as const, start: '2026-10-01', end: TODAY, days: 5, previousStart: '2026-09-01', previousEnd: '2026-09-05', bucket: 'day' as const, includesToday: true };
const day = (d: string, value: number | null) => ({ start: d, end: d, value });
const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'];
function explore(r: ExploreRequest, comparing = false): ProgressExplore {
  const sets = r.measure === 'training.sets';
  const groups = r.breakdown === 'muscle' ? [
    { key: 'piernas', label: 'Piernas', value: 7, coverage: { days: 2, eligible: 5 }, series: r.series ? days.map((d, i) => day(d, [2, 0, 0, 0, 5][i])) : null },
    { key: 'pecho', label: 'Pecho', value: 3, coverage: { days: 1, eligible: 5 }, series: r.series ? days.map((d, i) => day(d, [3, 0, 0, 0, 0][i])) : null },
  ] : r.breakdown === 'meal_moment' ? [
    { key: 'breakfast', label: 'Desayuno', value: 20, coverage: { days: 1, eligible: 2 }, series: null },
    { key: 'snack', label: 'Merienda', value: 0, coverage: { days: 0, eligible: 2 }, series: null },
  ] : [];
  const result = (scale: number) => ({ value: sets ? 10 * scale : 120 * scale, change: null, coverage: { days: 2, eligible: sets ? 5 : 4 }, unassigned: r.breakdown === 'meal_moment' ? 1 : 0, groups,
    series: r.series ? days.map((d, i) => day(d, sets ? [5, null, 0, 0, 5][i] : null)) : null });
  return { today: TODAY, period, breakdown: r.breakdown, days: r.days, series: r.series,
    measure: sets ? { key: 'training.sets', label: 'Series', unit: 'series', valueType: 'integer', aggregation: 'sum', derived: false }
      : { key: 'nutrition.protein', label: 'Proteína', unit: 'g', valueType: 'decimal', aggregation: 'average', derived: false },
    current: result(1), reference: comparing ? result(0.5) : null };
}
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
const wrap = (state?: ProgressRangeState) => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
  <OwnlevelThemeProvider initialMode="light"><ProgressRangeProvider initialToday={TODAY} initialState={state}><ExploreScreen /></ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>);

beforeEach(() => { jest.clearAllMocks(); mockExplore.mockImplementation(async (_c, _q, r, compare) => ok(explore(r, !!compare))); });

describe('Explorar', () => {
  it('fixtures follow the shared contract', () => {
    expect(parseProgressExplore(explore({ measure: 'training.sets', breakdown: 'muscle', days: null, series: true }))).toBeDefined();
    expect(parseProgressExplore(explore({ measure: 'nutrition.protein', breakdown: 'meal_moment', days: null, series: false }, true))).toBeDefined();
  });
  it('starts with ideas and reads nothing until a measure is chosen; an idea reads its measure × breakdown in the shared period', async () => {
    const view = wrap(); await flush();
    expect(mockExplore).not.toHaveBeenCalled();
    expect(view.getByTestId('explore-ideas')).toBeTruthy();
    fireEvent.press(view.getByTestId('explore-idea-training.sets')); await flush();
    expect(mockExplore).toHaveBeenLastCalledWith(mockClient, MONTH, { measure: 'training.sets', breakdown: 'muscle', days: null, series: true }, null);
    expect(view.getByTestId('explore-value').props.children).toBe('10 series');
    fireEvent.press(view.getByTestId('explore-influence'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/influence/build', params: { outcome: 'training.sets', outcomeLabel: 'Series' } });
    expect(view.getByText('Entrenaste 2 de 5 días')).toBeTruthy();
    // In time, one row per group with the same scale; a real 0 is a mark, never a gap.
    expect(view.getByTestId('explore-multiple-piernas')).toBeTruthy();
    fireEvent.press(view.getByText('Total')); await flush();
    expect(mockExplore).toHaveBeenLastCalledWith(mockClient, MONTH, { measure: 'training.sets', breakdown: 'muscle', days: null, series: false }, null);
    expect(view.getByTestId('explore-group-piernas').props.accessibilityLabel).toBe('Piernas: 7 series');
  });
  it('a saved view opens as itself: no second pin until the query changes, and its name is known before the read', async () => {
    mockParams = { measure: 'training.sets', breakdown: 'muscle', view: 'Series por músculo' };
    const view = wrap();
    expect(within(view.getByTestId('explore-field-measure')).getByText('Series')).toBeTruthy();
    await flush();
    expect(view.getByTestId('explore-pinned')).toBeTruthy(); expect(view.getByText('Ya está en Mis vistas')).toBeTruthy();
    expect(view.queryByTestId('explore-pin')).toBeNull();
    fireEvent.press(view.getByText('En el tiempo')); await flush();
    expect(view.getByTestId('explore-pin')).toBeTruthy();
    mockParams = {};
  });
  it('by moment: a missing moment is 0, unassigned meals are told apart, and the comparison names its range', async () => {
    const view = wrap({ unit: 'month', anchor: TODAY, custom: null, compare: { kind: 'previous' } }); await flush();
    fireEvent.press(view.getByTestId('explore-idea-nutrition.protein')); await flush();
    expect(mockExplore).toHaveBeenLastCalledWith(mockClient, MONTH, { measure: 'nutrition.protein', breakdown: 'meal_moment', days: null, series: false }, { start: '2026-09-01', end: '2026-09-05' });
    expect(view.getByTestId('explore-group-snack').props.accessibilityLabel).toBe('Merienda: 0 g. 1–5 sep: 0 g');
    expect(view.getByText('1 comida sin momento no entra en el desglose.')).toBeTruthy();
    expect(within(view.getByTestId('explore-result')).getByTestId('explore-reference').props.children.join('')).toBe('1–5 sep 60 g · ↗ 60 g');
  });
  it('offers the estimated 1RM only for exercises loaded in kg', () => {
    const base = { muscleLabel: 'Pecho', status: 'stable' as const, reason: 'ok', signal: null, isPersonalRecord: false, sets: 9, lastDate: TODAY };
    const choices = exerciseChoices({ exercises: [{ ...base, id: 'a', name: 'Press', weightMode: 'Peso total', sessions: 3 }, { ...base, id: 'b', name: 'Dominadas', weightMode: 'Peso corporal', sessions: 2 },
      { ...base, id: 'c', name: 'Curl', weightMode: 'Peso total', sessions: 0 }] } as never);
    expect(choices.map(c => c.key)).toEqual(['exercise.b.best', 'exercise.a.best', 'exercise.a.e1rm']);
  });
});
