import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { InsightsRoutineOrderView, OrderPosition } from '@/api/performance-insights';
import { ORDER_PREFETCH_DELAY_MS, orderHeadline, RoutineOrderHint, RoutineOrderPrefetch, RoutineOrderView } from './routine-order-view';

const ROUTINE = '60000000-0000-4000-8000-000000000900', OTHER = '60000000-0000-4000-8000-000000000901';
const mockRead = jest.fn(), mockPush = jest.fn();
let mockData: InsightsRoutineOrderView | undefined;
let mockStatus = 'ready';
jest.mock('@/progress/use-progress-resource', () => ({ useProgressResource: (client: unknown, key: string) => {
  mockRead(key, client);
  return { data: client ? mockData : undefined, state: { status: client ? mockStatus : 'loading' }, refresh: jest.fn() };
} }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useSegments: () => ['(tabs)', 'train'] }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/training/exercise-segmented', () => {
  const { Pressable, Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ExerciseSegmented: ({ options, onChange }: { options: readonly { value: string; label: string }[]; onChange: (value: string) => void }) => <View>{options.map(option => <Pressable key={option.value} accessibilityRole="button" onPress={() => onChange(option.value)}><Text>{option.label}</Text></Pressable>)}</View> };
});
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));

const position = (n: number, name: string, rate: number | null, target: number | null): OrderPosition => ({
  position: n, sessions: 8, exercises: [{ exerciseId: `60000000-0000-4000-8000-00000000080${n}`, name, sessions: 8 }],
  progress: { compared: rate === null ? 0 : 8, up: rate === null ? 0 : Math.round(rate * 8), same: rate === null ? 0 : 8 - Math.round(rate * 8), down: 0, sessions: rate === null ? 0 : 8, rate, level: rate },
  target: { sets: target === null ? 0 : 16, sessions: target === null ? 0 : 8, reached: target === null ? 0 : Math.round(target * 16), rate: target },
});
function model(overrides: Partial<InsightsRoutineOrderView> = {}): InsightsRoutineOrderView {
  return {
    contractVersion: 'performance-insights/1', methodVersion: 'm', performanceMethodVersion: 'p', sourceRevision: 'r', generatedFor: { today: '2026-11-20' },
    view: 'routine-order', method: 'insights-routine-order/2', window: { start: '2026-08-23', end: '2026-11-20', days: 90 },
    rules: { minChanges: 5, minSessions: 3, minTargetSets: 9, minBaselineRate: 0.1, firstLoss: 0.1, secondGap: 0.15 },
    routine: { id: ROUTINE, name: 'PULL' }, routines: [{ id: ROUTINE, name: 'PULL', sessions: 8 }], sessions: 8,
    positions: [position(1, 'Jalón', 1, 1), position(2, 'Remo', 1, 1), position(3, 'Face pull', 0.5, 0), position(4, 'Curl', 0, null)],
    lenses: { progress: { status: 'ready', baseline: 1, cuts: [{ position: 3, loss: 0.5 }, { position: 4, loss: 1 }] }, target: { status: 'no_cut', baseline: 1, cuts: [] } },
    exercises: [{ exerciseId: '60000000-0000-4000-8000-000000000803', name: 'Face pull', usualPosition: 3,
      sessions: [{ sessionId: 's1', date: '2026-11-10', position: 3, moved: false, direction: 'up', pct: 5, best: { load: 20, reps: 21 } },
        { sessionId: 's2', date: '2026-11-14', position: 2, moved: true, direction: 'same', pct: 0, best: { load: 20, reps: 22 } }],
      compare: { load: 20, groups: [{ position: 2, sessions: 1, reps: 22 }, { position: 3, sessions: 7, reps: 21 }], pct: -4.5455 } }],
    ...overrides,
  } as unknown as InsightsRoutineOrderView;
}
const client = {} as never;
const wrap = (node: React.ReactNode) => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
  <OwnlevelThemeProvider initialMode="light">{node}</OwnlevelThemeProvider></SafeAreaProvider>);
beforeEach(() => { mockData = model(); mockStatus = 'ready'; mockRead.mockClear(); mockPush.mockClear(); });

describe('Comparaciones › Orden', () => {
  it('says the cuts in one sentence, draws the routine in order and marks each cut', () => {
    const view = wrap(<RoutineOrderView client={client} initialRoutine={ROUTINE} routines={[{ value: ROUTINE, label: 'PULL' }, { value: OTHER, label: 'PUSH' }]} />);
    expect(view.getByTestId('order-headline').props.children).toBe('Desde el 3° subís un 50 % menos seguido, y desde el 4°, 100 % menos');
    expect(['order-step-1', 'order-step-2', 'order-step-3', 'order-step-4'].every(id => view.getByTestId(id))).toBe(true);
    expect(view.getByTestId('order-cut-3')).toBeTruthy(); expect(view.getByTestId('order-cut-4')).toBeTruthy();
    // Each row is one button with its own summary; D never went up: a real 0 %, not a missing value.
    expect(view.getByRole('button', { name: /^4°, Curl, subiste 0 de 8 veces/ })).toBeTruthy();
    expect(mockRead).toHaveBeenCalledWith(`performance-insights|routine-order|${ROUTINE}`, client);
  });

  it('switches to the target lens without another read: no cut is named, and no target is «—», never 0 %', () => {
    const view = wrap(<RoutineOrderView client={client} initialRoutine={ROUTINE} routines={[]} />);
    const reads = mockRead.mock.calls.length;
    fireEvent.press(view.getByRole('button', { name: 'Objetivo' }));
    expect(view.getByTestId('order-headline').props.children).toBe('Llegás a tus reps parecido en toda la rutina');
    expect(view.queryByTestId('order-cut-3')).toBeNull();
    expect(view.getByRole('button', { name: /^4°, Curl, sin reps objetivo/ })).toBeTruthy();
    expect(new Set(mockRead.mock.calls.slice(reads).map(([key]) => key))).toEqual(new Set([`performance-insights|routine-order|${ROUTINE}`]));
  });

  it('opens an exercise from its row: where it went, the session where it moved and the comparison at the same load', () => {
    const view = wrap(<RoutineOrderView client={client} initialRoutine={ROUTINE} routines={[]} />);
    fireEvent.press(view.getByRole('button', { name: /^3°, Face pull/ }));
    expect(view.getByTestId('order-exercise-sheet')).toBeTruthy();
    expect(view.getByText('Va 3°')).toBeTruthy();
    expect(view.getByTestId('order-compare')).toBeTruthy();
    expect(view.getByText('−4,5 %')).toBeTruthy();
    expect(view.getByLabelText(/14 nov, 2°, lo moviste/)).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Ver su historial' }));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/train/history/exercise/60000000-0000-4000-8000-000000000803');
  });

  it('with few sessions shows the example in grey under EJEMPLO, never numbers that look like the person', () => {
    mockData = model({ lenses: { progress: { status: 'insufficient', baseline: null, cuts: [] }, target: { status: 'insufficient', baseline: null, cuts: [] } } } as never);
    const view = wrap(<RoutineOrderView client={client} initialRoutine={ROUTINE} routines={[]} />);
    expect(view.getByTestId('order-headline').props.children).toBe('Todavía faltan sesiones para ver dónde baja');
    expect(view.getByLabelText('Ejemplo')).toBeTruthy();
    expect(view.queryByTestId('order-ladder')).toBeNull();
  });

  it('keeps unavailable apart from empty, and loads behind skeletons with the routines already on screen', () => {
    mockData = undefined; mockStatus = 'unavailable';
    const failed = wrap(<RoutineOrderView client={client} initialRoutine={ROUTINE} routines={[{ value: ROUTINE, label: 'PULL' }, { value: OTHER, label: 'PUSH' }]} />);
    expect(failed.getByText(/No significa que no haya datos/)).toBeTruthy();
    failed.unmount();
    mockStatus = 'loading';
    const loading = wrap(<RoutineOrderView client={client} initialRoutine={ROUTINE} routines={[{ value: ROUTINE, label: 'PULL' }, { value: OTHER, label: 'PUSH' }]} />);
    expect(loading.getByTestId('order-loading')).toBeTruthy();
    expect(loading.getByRole('radio', { name: 'PUSH' })).toBeTruthy();
  });

  it('describes the states without a cut in plain words', () => {
    expect(orderHeadline(model({ lenses: { ...model().lenses, progress: { status: 'no_baseline', baseline: 0.05, cuts: [] } } } as never), 'progress'))
      .toBe('Al principio casi no estás subiendo: todavía no hay desde dónde medir una baja');
    expect(orderHeadline(model({ lenses: { ...model().lenses, progress: { status: 'no_cut', baseline: 0.3, cuts: [] } } } as never), 'progress')).toBe('Subís parecido en toda la rutina');
  });

  it('prefetches through the same read the view uses, only after the screen stays open, and nothing without a routine', () => {
    jest.useFakeTimers();
    try {
      wrap(<RoutineOrderPrefetch client={client} routine={ROUTINE} />);
      expect(mockRead).toHaveBeenLastCalledWith('performance-insights|routine-order|none', null);
      act(() => { jest.advanceTimersByTime(ORDER_PREFETCH_DELAY_MS); });
      expect(mockRead).toHaveBeenLastCalledWith(`performance-insights|routine-order|${ROUTINE}`, client);
      wrap(<RoutineOrderPrefetch client={client} routine={null} />);
      act(() => { jest.advanceTimersByTime(ORDER_PREFETCH_DELAY_MS); });
      expect(mockRead).toHaveBeenLastCalledWith('performance-insights|routine-order|none', null);
    } finally { jest.useRealTimers(); }
  });

  it('the routine editor shows one quiet row only when a cut holds, and opens Orden', () => {
    const onOpen = jest.fn();
    const view = wrap(<RoutineOrderHint client={client} routineId={ROUTINE} onOpen={onOpen} />);
    fireEvent.press(view.getByRole('button', { name: 'Desde el 3° subís menos seguido, −50 %' }));
    expect(onOpen).toHaveBeenCalled();
    view.unmount();
    mockData = model({ lenses: { ...model().lenses, progress: { status: 'no_cut', baseline: 1, cuts: [] } } } as never);
    expect(wrap(<RoutineOrderHint client={client} routineId={ROUTINE} onOpen={onOpen} />).queryByTestId('routine-order-hint')).toBeNull();
  });
});
