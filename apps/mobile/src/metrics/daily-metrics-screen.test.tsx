import { act, fireEvent, render, within } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { clearConfirmedReads, invalidateConfirmedReads } from '@/api/confirmed-read-cache';
import * as ReactNative from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileNutritionDayResponse } from '@/api/nutrition-day';
import { nutritionFixture } from '@/nutrition/day-fixture.test-helper';
import { DailyMetricsScreen } from './daily-metrics-screen';
import { ProgressHub } from '@/body/progress-hub';

const mockPush = jest.fn(), mockBack = jest.fn(), mockReplace = jest.fn();
const mockFetchDay = jest.fn<(client: unknown, date: string) => Promise<unknown>>();
const mockMutate = jest.fn<(client: unknown, intent: unknown) => Promise<unknown>>();
const mockStore = new Map<string, string>();
const mockFocus: (() => void)[] = [];
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
let mockParams: Record<string, string> = {};
const mockSetParams = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ push: mockPush, setParams: mockSetParams, back: mockBack, replace: mockReplace, canGoBack: () => true }), useFocusEffect: (effect: () => void) => { mockFocus.push(effect); } }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn(), success: jest.fn(), warning: jest.fn() } }));
let mockOwner: string | null = 'owner';
jest.mock('@/auth', () => ({ useMobileAuth: () => ({ session: mockOwner ? { user: { id: mockOwner } } : null }) }));
const mockClient = { request: jest.fn(), read: jest.fn() };
let mockActiveClient: typeof mockClient | null;
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockActiveClient }) }));
jest.mock('@/api/nutrition-day', () => ({ ...jest.requireActual<object>('@/api/nutrition-day'), fetchMobileNutritionDay: (c: unknown, d: string) => mockFetchDay(c, d) }));
jest.mock('@/api/nutrition-day-write', () => ({ ...jest.requireActual<object>('@/api/nutrition-day-write'), mutateNutritionDay: (c: unknown, i: unknown) => mockMutate(c, i) }));
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: {
  getItem: async (k: string) => mockStore.get(k) ?? null, setItem: async (k: string, v: string) => { mockStore.set(k, v); }, removeItem: async (k: string) => { mockStore.delete(k); },
} }));

const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const TODAY = '2026-10-02';
const ids = { steps: '41100000-0000-4000-8000-000000000010', sleep: '41100000-0000-4000-8000-000000000011', custom: '41100000-0000-4000-8000-000000000012', archived: '41100000-0000-4000-8000-000000000013' };
function day(date: string, overrides: Partial<Record<keyof typeof ids, number | null>> = {}): MobileNutritionDayResponse {
  const base = nutritionFixture(date);
  const metric = (id: string, label: string, valueType: 'integer' | 'decimal' | 'duration', unit: string | null, value: number | null, target: number | null, isActive = true, systemKey: 'steps' | 'sleep' | null = null) =>
    ({ id, systemKey, label, unit, valueType, target, value, isActive, updatedAt: value === null ? null : `${date}T10:00:00Z`, definitionUpdatedAt: '2026-09-01T12:00:00.123456Z' });
  return { ...base, today: TODAY, activity: { status: 'ok', data: { metrics: [
    metric(ids.steps, 'Pasos', 'integer', 'pasos', 'steps' in overrides ? overrides.steps! : 0, 10000, true, 'steps'),
    metric(ids.sleep, 'Sueño', 'duration', 'min', 'sleep' in overrides ? overrides.sleep! : 485, 480, true, 'sleep'),
    metric(ids.custom, 'Proteína extra', 'decimal', 'g', 'custom' in overrides ? overrides.custom! : null, null),
    ...(date < TODAY ? [metric(ids.archived, 'Mate viejo', 'decimal', 'L', 1.5, null, false)] : []),
  ] } } };
}
const flush = () => act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });
const wrapped = (element: React.ReactElement) => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
  <OwnlevelThemeProvider initialMode="light">{element}</OwnlevelThemeProvider></SafeAreaProvider>;
const wrap = (element: React.ReactElement) => render(wrapped(element));

beforeEach(() => {
  mockOwner = 'owner'; mockActiveClient = mockClient;
  clearConfirmedReads(mockClient as never); jest.clearAllMocks(); mockStore.clear(); mockFocus.length = 0; mockParams = {};
  jest.useFakeTimers({ now: new Date('2026-10-02T15:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  mockFetchDay.mockImplementation(async (_c, d) => ({ status: 'ok', data: day(d), meta }));
  mockMutate.mockImplementation(async (_c, i) => {
    // The real write goes through the API client, which invalidates retained readings when it settles.
    invalidateConfirmedReads(mockClient as never, `/api/mobile/v1/nutrition/days/${(i as { date: string }).date}/metrics`);
    return { status: 'ok', data: { status: 'saved', date: (i as { date: string }).date, operation: 'metrics' }, meta };
  });
});
afterEach(() => { jest.useRealTimers(); });

describe('Progress → Métricas diarias', () => {
  it('Home → Registrar opens today\'s metrics editor once and never reopens it after cancelling', async () => {
    mockParams = { editar: 'metricas' };
    const view = wrap(<DailyMetricsScreen />); await flush();
    expect(view.getByText('Métricas del día')).toBeTruthy();
    expect(mockSetParams).toHaveBeenCalledWith({ editar: undefined });
    fireEvent.press(view.getByRole('button', { name: 'Cancelar' })); await flush();
    expect(view.queryByText('Métricas del día')).toBeNull();
    expect(view.getByRole('button', { name: 'Editar métricas' })).toBeTruthy();
  });
  it('the hub opens the stable Daily Metrics route', () => {
    const view = wrap(<ProgressHub />);
    fireEvent.press(view.getByRole('button', { name: 'Abrir Métricas diarias' }));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/progress/metrics');
  });
  it('shows today by default: explicit zero, duration, missing and current targets', async () => {
    const view = wrap(<DailyMetricsScreen />); await flush();
    expect(mockFetchDay).toHaveBeenLastCalledWith(mockClient, TODAY);
    const steps = within(view.getByTestId(`daily-metric-${ids.steps}`));
    expect(steps.getByText('0 pasos')).toBeTruthy(); expect(steps.getByText(/Objetivo actual: 10\.000 pasos/)).toBeTruthy();
    expect(within(view.getByTestId(`daily-metric-${ids.sleep}`)).getByText('8 h 5 min')).toBeTruthy();
    expect(within(view.getByTestId(`daily-metric-${ids.custom}`)).getByText('Sin dato')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Día siguiente' })).toBeDisabled();
  });
  it('past dates show archived history and stay editable; future dates are read-only', async () => {
    const view = wrap(<DailyMetricsScreen />); await flush();
    fireEvent.press(view.getByRole('button', { name: 'Día anterior' })); await flush();
    expect(mockFetchDay).toHaveBeenLastCalledWith(mockClient, '2026-10-01');
    expect(view.getByText('Mate viejo · archivada')).toBeTruthy(); expect(view.getByRole('button', { name: 'Editar métricas' })).toBeTruthy();
    mockFetchDay.mockImplementation(async (_c, d) => ({ status: 'ok', data: day(d), meta }));
    fireEvent.press(view.getByRole('button', { name: 'Elegir fecha' }));
    fireEvent.changeText(view.getByLabelText('Fecha DD/MM/AAAA'), '05/10/2026');
    fireEvent.press(view.getByRole('button', { name: 'Consultar fecha' })); await flush();
    expect(view.getByTestId('daily-metrics-future')).toBeTruthy(); expect(view.queryByRole('button', { name: 'Editar métricas' })).toBeNull();
  });
  it('edits with the existing editor and re-reads server truth after saving', async () => {
    const view = wrap(<DailyMetricsScreen />); await flush();
    fireEvent.press(view.getByRole('button', { name: 'Editar métricas' }));
    expect(view.getByText('Métricas del día')).toBeTruthy();
    fireEvent.changeText(view.getByLabelText('Proteína extra'), '12,5');
    fireEvent.changeText(view.getByLabelText('Sueño horas'), ''); fireEvent.changeText(view.getByLabelText('Sueño minutos'), '');
    mockFetchDay.mockImplementation(async (_c, d) => ({ status: 'ok', data: day(d, { custom: 12.5, sleep: null }), meta }));
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Guardar cambios' })); }); await flush();
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][1]).toMatchObject({ operation: 'metrics', date: TODAY, changes: expect.arrayContaining([
      expect.objectContaining({ metricId: ids.custom, value: 12.5, expectedUpdatedAt: null }), expect.objectContaining({ metricId: ids.sleep, value: null })]) });
    expect(view.queryByTestId('nutrition-day-write-editor')).toBeNull();
    expect(within(view.getByTestId(`daily-metric-${ids.custom}`)).getByText('12,5 g')).toBeTruthy();
    expect(within(view.getByTestId(`daily-metric-${ids.sleep}`)).getByText('Sin dato')).toBeTruthy();
  });
  it('opens Administrar métricas (reusable /settings/metrics) and reflects definition changes when it regains focus', async () => {
    const view = wrap(<DailyMetricsScreen />); await flush();
    fireEvent.press(view.getByRole('button', { name: 'Administrar métricas' }));
    expect(mockPush).toHaveBeenCalledWith('/settings/metrics');
    // Back from the definitions screen: renamed + reordered on the server.
    mockFetchDay.mockImplementation(async (_c, d) => {
      const base = day(d);
      if (base.activity.status !== 'ok') return { status: 'ok', data: base, meta };
      const [steps, sleep, custom] = base.activity.data.metrics;
      return { status: 'ok', data: { ...base, activity: { status: 'ok', data: { metrics: [{ ...custom, label: 'Proteína' }, steps, { ...sleep, target: 420 }] } } }, meta };
    });
    // The definitions screen saved through the API client before returning here.
    invalidateConfirmedReads(mockClient as never, '/api/mobile/v1/metrics/definitions/order');
    await act(async () => { mockFocus.forEach(effect => effect()); }); await flush();
    const labels = view.getAllByTestId(/^daily-metric-/).map(node => node.props.testID);
    expect(labels).toEqual([`daily-metric-${ids.custom}`, `daily-metric-${ids.steps}`, `daily-metric-${ids.sleep}`]);
    expect(view.getByText('Proteína')).toBeTruthy();
    expect(within(view.getByTestId(`daily-metric-${ids.sleep}`)).getByText(/Objetivo actual: 7 h 0 min/)).toBeTruthy();
  });
  it('entering the screen picks up an intent another surface left pending', async () => {
    const view = wrap(<DailyMetricsScreen />); await flush();
    const intent = { operation: 'metrics', date: TODAY, idempotencyKey: 'nutrition:1', changes: [{ metricId: ids.steps, definitionUpdatedAt: '2026-09-01T12:00:00.123456Z', expectedUpdatedAt: `${TODAY}T10:00:00Z`, value: 500 }] };
    const draft = { kind: 'metrics', baseline: day(TODAY), target: '', expenditure: '',
      metrics: { [ids.steps]: { value: '500', hours: '', minutes: '' }, [ids.sleep]: { value: '485', hours: '8', minutes: '5' }, [ids.custom]: { value: '', hours: '', minutes: '' } } };
    mockStore.set('ownlevel.nutrition.day-write.v1.owner', JSON.stringify({ version: 1, intent, draft }));
    await act(async () => { mockFocus.at(-1)!(); }); await flush();
    expect(view.getByText('Métricas del día')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Comprobar intento guardado' })).toBeTruthy();
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Comprobar intento guardado' })); }); await flush();
    expect(mockMutate).toHaveBeenCalledTimes(1); expect(mockMutate.mock.calls[0][1]).toEqual(intent);
  });
  it('opens the exact past date, highlights by identity and keeps the existing editor for an archived metric', async () => {
    mockParams = { date: '2026-10-01', fromMetricsChart: '1', metricsChartMetric: ids.archived };
    const view = wrap(<DailyMetricsScreen />); await flush();
    expect(mockFetchDay).toHaveBeenCalledTimes(1); expect(mockFetchDay.mock.calls[0][1]).toBe('2026-10-01');
    const row = view.getByTestId(`daily-metric-${ids.archived}`);
    expect(row.props.accessibilityState.selected).toBe(true);
    expect(row.props.accessibilityLabel).toContain('Mate viejo, archivada, 1,5 L');
    expect(view.getAllByText('Métrica del gráfico')).toHaveLength(1);
    expect(view.getByTestId(`daily-metric-${ids.steps}`).props.accessibilityState.selected).toBe(false);
    fireEvent.press(view.getByRole('button', { name: 'Editar métricas' })); await flush();
    expect(view.getByLabelText('Mate viejo')).toBeTruthy();
    expect(mockMutate).not.toHaveBeenCalled();
    fireEvent.press(view.getByRole('button', { name: 'Cancelar' })); await flush();
    fireEvent.press(view.getByRole('button', { name: 'Volver al gráfico de la métrica' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('does not substitute a missing/archived definition with another metric and distinguishes zero from blank', async () => {
    mockParams = { date: TODAY, fromMetricsChart: '1', metricsChartMetric: ids.archived };
    const view = wrap(<DailyMetricsScreen />); await flush();
    expect(view.getByText(/La métrica del gráfico no figura/)).toBeTruthy();
    expect(view.queryByText('Métrica del gráfico')).toBeNull();
    expect(within(view.getByTestId(`daily-metric-${ids.steps}`)).getByText('0 pasos')).toBeTruthy();
    expect(within(view.getByTestId(`daily-metric-${ids.custom}`)).getByText('Sin dato')).toBeTruthy();
    expect(mockMutate).not.toHaveBeenCalled();
  });
  it('browses actual dates in an aggregate interval without turning the average into a daily value', async () => {
    mockParams = { date: '2026-09-28', fromMetricsChart: '1', metricsChartMetric: ids.sleep, metricsChartStart: '2026-09-28', metricsChartEnd: '2026-10-01' };
    const view = wrap(<DailyMetricsScreen />); await flush();
    expect(view.getByText(/Recorrido del intervalo 28\/09\/2026 – 01\/10\/2026/)).toBeTruthy();
    expect(view.getByText(/este día no representa el promedio/)).toBeTruthy();
    expect(view.getByTestId(`daily-metric-${ids.sleep}`).props.accessibilityLabel).toContain('8 h 5 min');
    fireEvent.press(view.getByRole('button', { name: 'Día siguiente' })); await flush();
    expect(mockFetchDay.mock.calls.at(-1)![1]).toBe('2026-09-29');
    expect(view.getByRole('button', { name: 'Volver al gráfico de la métrica' })).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Día anterior' })); await flush();
    fireEvent.press(view.getByRole('button', { name: 'Día anterior' })); await flush();
    expect(view.getByText(/Estás fuera del intervalo del gráfico/)).toBeTruthy();
    expect(mockMutate).not.toHaveBeenCalled();
  });
  it('retains the original identity after definition edits and re-reads current units instead of a name match', async () => {
    mockParams = { date: TODAY, fromMetricsChart: '1', metricsChartMetric: ids.custom };
    const view = wrap(<DailyMetricsScreen />); await flush();
    mockFetchDay.mockImplementation(async (_c, date) => {
      const data = day(date); if (data.activity.status === 'ok') data.activity.data.metrics = data.activity.data.metrics.map(m => ({ ...m, label: 'Mismo nombre', ...(m.id === ids.custom ? { valueType: 'duration' as const, unit: 'min', value: 0 } : {}) }));
      return { status: 'ok', data, meta };
    });
    invalidateConfirmedReads(mockClient as never, '/api/mobile/v1/metrics/definitions');
    await act(async () => { mockFocus.forEach(effect => effect()); }); await flush();
    expect(view.getByTestId(`daily-metric-${ids.custom}`).props.accessibilityLabel).toContain('Mismo nombre, 0 h 0 min');
    expect(view.getAllByText('Métrica del gráfico')).toHaveLength(1);
  });
  it('reading budget: the cold daily original reuses one grouped exact-date read without reading every metric', async () => {
    mockParams = { date: '2026-10-01', fromMetricsChart: '1', metricsChartMetric: ids.steps };
    const view = wrap(<DailyMetricsScreen />); await flush();
    expect(mockFetchDay).toHaveBeenCalledTimes(1); expect(mockMutate).not.toHaveBeenCalled();
    console.info('METRICS_READ_BUDGET', JSON.stringify({ surface: 'daily', initialGroupedReads: mockFetchDay.mock.calls.length, writes: mockMutate.mock.calls.length }));
    view.unmount();
  });

  it('ignores a late original read from the previous account, including on logout', async () => {
    mockParams = { date: TODAY, fromMetricsChart: '1', metricsChartMetric: ids.steps };
    let settle!: (value: unknown) => void;
    mockFetchDay.mockImplementationOnce(() => new Promise(resolve => { settle = resolve; }));
    const view = wrap(<DailyMetricsScreen />); await flush();
    mockOwner = null; mockActiveClient = null;
    view.rerender(wrapped(<DailyMetricsScreen />)); await flush();
    await act(async () => { settle({ status: 'ok', data: day(TODAY, { steps: 999 }), meta }); }); await flush();
    expect(view.queryByText('999 pasos')).toBeNull(); expect(view.queryByTestId(`daily-metric-${ids.steps}`)).toBeNull();
    mockOwner = 'second'; mockActiveClient = { request: jest.fn(), read: jest.fn() };
    mockFetchDay.mockImplementation(async (_c, date) => ({ status: 'ok', data: day(date, { steps: 20 }), meta }));
    view.rerender(wrapped(<DailyMetricsScreen />)); await flush();
    expect(view.getByTestId(`daily-metric-${ids.steps}`).props.accessibilityLabel).toContain('20 pasos');
    expect(view.queryByText('999 pasos')).toBeNull();
  });
  it('keeps the selected original readable with large text and VoiceOver without hiding the editor action', async () => {
    const dimensions = jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width: 320, height: 568, scale: 3, fontScale: 2 });
    mockParams = { date: TODAY, fromMetricsChart: '1', metricsChartMetric: ids.sleep };
    try {
      const view = wrap(<DailyMetricsScreen />); await flush();
      const row = view.getByTestId(`daily-metric-${ids.sleep}`);
      expect(row.props.accessible).toBe(true); expect(row.props.accessibilityLabel).toContain('Sueño, 8 h 5 min');
      expect(view.getByRole('button', { name: 'Editar métricas' })).toBeTruthy();
      expect(view.getByRole('button', { name: 'Volver al gráfico de la métrica' })).toBeTruthy();
      const layout = row.findAll(node => node.props.style && ReactNative.StyleSheet.flatten(node.props.style)?.flexDirection === 'column');
      expect(layout.length).toBeGreaterThan(0);
    } finally { dimensions.mockRestore(); }
  });

});
