import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { influenceDefinitionOf, parseProgressViewsRead, type InfluenceViewDefinition, type ProgressViewsRead } from '@/api/progress-views';
import type { ProgressInfluence } from '@/api/progress-influence';
import type { ProgressQuery } from '@/api/progress';
import { MyViews } from './my-views';
import { PinViewSheet, suggestedViewName } from './pin-view-sheet';
import { ViewsEditScreen } from './views-edit-screen';
import { ProgressRangeProvider } from './progress-range-context';
import { clearConfirmedReads } from '@/api/confirmed-read-cache';

const mockPush = jest.fn();
const mockViews = jest.fn<(c: unknown, q: ProgressQuery) => Promise<unknown>>();
const mockCreate = jest.fn<(c: unknown, input: unknown) => Promise<unknown>>();
const mockDelete = jest.fn<(c: unknown, id: string, version: number) => Promise<unknown>>();
const mockReorder = jest.fn<(c: unknown, input: unknown) => Promise<unknown>>();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: () => undefined, useLocalSearchParams: () => ({}), Stack: { Screen: () => null } }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
jest.mock('@/training/session-native-interactions', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { NativeReorderList: ({ children }: { children: unknown }) => children, NativeReorderItem: ({ children }: { children: unknown }) => children,
    NativeDragHandle: ({ children, ...props }: { children: unknown }) => <View {...props}>{children as never}</View> };
});
const mockClient = { request: jest.fn(), read: jest.fn() };
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
jest.mock('@/api/progress-views', () => ({ ...jest.requireActual<object>('@/api/progress-views'),
  fetchProgressViews: (c: unknown, q: ProgressQuery) => mockViews(c, q),
  createProgressView: (c: unknown, input: unknown) => mockCreate(c, input),
  deleteProgressView: (c: unknown, id: string, version: number) => mockDelete(c, id, version),
  reorderProgressViews: (c: unknown, input: unknown) => mockReorder(c, input),
  viewIntentKey: () => 'key-1' }));

const TODAY = '2026-10-05';
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const ok = <T,>(data: T) => ({ status: 'ok' as const, data, meta });
const period = { preset: 'custom' as const, start: '2026-10-01', end: TODAY, days: 5, previousStart: '2026-09-26', previousEnd: '2026-09-30', bucket: 'day' as const, includesToday: true };
const A = '4357c187-6641-4343-bcae-ea685e3554bc', B = 'cddcae61-5e78-45a8-984d-0283d3367a86';
const explore = { today: TODAY, period, breakdown: 'muscle' as const, days: null, series: false,
  measure: { key: 'training.sets', label: 'Series', unit: 'series', valueType: 'integer' as const, aggregation: 'sum' as const, derived: false },
  current: { value: 230, change: null, coverage: { days: 9, eligible: 15 }, unassigned: 0, series: null,
    groups: [{ key: 'biceps', label: 'Bíceps', value: 46, coverage: { days: 4, eligible: 15 }, series: null }] }, reference: null };
function read(views: 'none' | 'two'): ProgressViewsRead {
  return { today: TODAY, period, listVersion: 3, views: views === 'none' ? [] : [
    { id: A, name: 'Series por músculo', position: 1, version: 1, definition: { measure: 'training.sets', breakdown: 'muscle', days: null, series: false }, result: { status: 'ok', data: explore } },
    { id: B, name: 'Vieja', position: 2, version: 2, definition: { measure: 'metric.cddcae61-5e78-45a8-984d-0283d3367a86', breakdown: null, days: null, series: false }, result: { status: 'unavailable', reason: 'invalid_definition' } },
  ] };
}
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
const wrap = (el: React.ReactElement) => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
  <OwnlevelThemeProvider initialMode="light"><ProgressRangeProvider initialToday={TODAY}>{el}</ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>);

beforeEach(() => { clearConfirmedReads(mockClient as never); jest.clearAllMocks(); mockViews.mockResolvedValue(ok(read('two'))); });

describe('Mis vistas', () => {
  it('the API client opts into influence definitions', () => {
    const api = jest.requireActual<typeof import('@/api/progress-views')>('@/api/progress-views');
    void api.fetchProgressViews(mockClient as never, { period: 'custom', from: period.start, to: period.end });
    expect(mockClient.read).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/mobile/v1/progress/views?period=custom&from=2026-10-01&to=2026-10-05&kinds=influence' }));
  });
  it('shows influence differences or coverage, navigates to the answer, and describes the view in Editar', async () => {
    const definition: InfluenceViewDefinition = { kind: 'influence', measure: 'training.sets', split: 'nutrition.carbs', cut: 'median', lag: 0 };
    const dates = (start: number) => Array.from({ length: 7 }, (_, i) => `2026-09-${String(start + i).padStart(2, '0')}`);
    const p = { ...period, start: '2026-09-01', days: 35, previousStart: '2026-07-28', previousEnd: '2026-08-31', bucket: 'week' as const };
    const data: ProgressInfluence = { today: TODAY, period: p, definition: influenceDefinitionOf(definition),
      measure: { split: { key: 'nutrition.carbs', label: 'Carbohidratos', unit: 'g', valueType: 'decimal' }, outcome: { key: 'training.sets', label: 'Series', unit: 'series', valueType: 'integer' } },
      current: { status: 'ok', pairs: 14, cut: 300, low: { days: dates(1), average: 21 }, high: { days: dates(8), average: 26 }, difference: 5, differencePercent: 5 / 21 * 100, evidence: 'moderate' }, reference: null };
    const payload: ProgressViewsRead = { today: TODAY, period: p, listVersion: 2, views: [
      { id: A, name: 'Mi pregunta', position: 1, version: 1, definition, result: { status: 'ok', kind: 'influence', data } },
      { id: B, name: 'Faltan registros', position: 2, version: 1, definition, result: { status: 'ok', kind: 'influence', data: { ...data, current: { status: 'insufficient', pairs: 6, needed: 14, perGroupNeeded: 5, cut: 300, low: { days: dates(1).slice(0, 3) }, high: { days: dates(8).slice(0, 3) }, missing: 'outcome' } } } },
    ] };
    expect(parseProgressViewsRead(payload)).toBeDefined(); mockViews.mockResolvedValue(ok(payload));
    const view = wrap(<MyViews />); await flush();
    expect(view.getByText('5 series más')).toBeTruthy(); expect(view.getByText('300 g o más: 26 series · el resto: 21 series')).toBeTruthy();
    expect(view.getByText('Todavía no alcanza: 6 de 14 días')).toBeTruthy();
    fireEvent.press(view.getByTestId(`my-view-${A}`));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/influence/answer', params: { split: 'nutrition.carbs', cut: 'median', lag: '0', outcome: 'training.sets' } });
    view.unmount(); const edit = wrap(<ViewsEditScreen />); await flush();
    expect(edit.getAllByText('Qué influye · Carbohidratos → Series')).toHaveLength(2);
  });
  it('fixtures follow the shared contract', () => { expect(parseProgressViewsRead(read('two'))).toBeDefined(); });
  it('shows each view with its value in the shared period; an invalid one says so; tapping opens Explorar with the saved query', async () => {
    const view = wrap(<MyViews />); await flush();
    expect(mockViews).toHaveBeenLastCalledWith(mockClient, { period: 'custom', from: '2026-10-01', to: TODAY });
    expect(view.getByTestId(`my-view-${A}`).props.accessibilityLabel).toBe('Series por músculo: 230 series. El más alto, Bíceps · 46 series');
    expect(view.getByText('Bíceps')).toBeTruthy();
    expect(view.getByTestId(`my-view-${B}`).props.accessibilityLabel).toBe('Vieja. No disponible');
    fireEvent.press(view.getByTestId(`my-view-${A}`));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/explore', params: { measure: 'training.sets', breakdown: 'muscle', view: 'Series por músculo' } });
    fireEvent.press(view.getByTestId('my-views-edit'));
    expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/progress/views');
  });
  it('empty is useful and neutral, and a failed read is never shown as empty', async () => {
    mockViews.mockResolvedValueOnce(ok(read('none')));
    const view = wrap(<MyViews />); await flush();
    expect(view.getByTestId('my-views-empty')).toBeTruthy();
    expect(view.getByText('Explorar tus datos')).toBeTruthy();
    view.unmount(); clearConfirmedReads(mockClient as never); // a later visit, outside the reuse window
    mockViews.mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } });
    const failed = wrap(<MyViews />); await flush();
    expect(failed.queryByTestId('my-views-empty')).toBeNull();
    expect(failed.getByText('No pudimos cargar tus vistas.')).toBeTruthy();
  });
  it('pinning sends the query with one key per intent and shows the server message when there are already 6', async () => {
    expect(suggestedViewName('Proteína', { measure: 'nutrition.protein', breakdown: 'meal_moment', days: 'training', series: false })).toBe('Proteína por momento de la comida · con entrenamiento');
    mockCreate.mockResolvedValueOnce({ status: 'validation', message: 'Ya tenés 6 vistas. Sacá una para fijar otra.', meta });
    const onPinned = jest.fn();
    const view = wrap(<PinViewSheet label="Series" definition={{ measure: 'training.sets', breakdown: 'muscle', days: null, series: false }} preview="230 series" onPinned={onPinned} onClose={jest.fn()} />);
    fireEvent.press(view.getByTestId('pin-view-confirm')); await flush();
    expect(mockCreate).toHaveBeenLastCalledWith(mockClient, { name: 'Series por músculo', definition: { measure: 'training.sets', breakdown: 'muscle', days: null, series: false }, idempotencyKey: 'key-1' });
    expect(view.getByText('Ya tenés 6 vistas. Sacá una para fijar otra.')).toBeTruthy();
    expect(onPinned).not.toHaveBeenCalled();
  });
  it('edit: removing asks first and sends the view version; a conflict re-reads and says why', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { void buttons?.find(b => b.style === 'destructive')?.onPress?.(); });
    mockDelete.mockResolvedValueOnce({ status: 'conflict', code: 'PROGRESS_VIEW_CHANGED', message: 'x', meta });
    mockReorder.mockResolvedValue(ok({ viewIds: [B, A], listVersion: 4 }));
    const view = wrap(<ViewsEditScreen />); await flush();
    fireEvent.press(view.getByTestId(`edit-view-remove-${B}`)); await flush();
    expect(mockDelete).toHaveBeenLastCalledWith(mockClient, B, 2);
    expect(view.getByText('Tus vistas cambiaron en otro dispositivo. Ya ves las últimas.')).toBeTruthy();
    expect(mockViews).toHaveBeenCalledTimes(2);
    fireEvent(view.getByTestId(`edit-view-drag-${A}`), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } }); await flush();
    expect(mockReorder).toHaveBeenLastCalledWith(mockClient, { viewIds: [B, A], expectedListVersion: 3, idempotencyKey: 'key-1' });
  });
});
