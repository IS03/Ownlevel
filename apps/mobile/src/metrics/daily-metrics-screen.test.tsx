import { act, fireEvent, render, within } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { clearConfirmedReads, invalidateConfirmedReads } from '@/api/confirmed-read-cache';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileNutritionDayResponse } from '@/api/nutrition-day';
import { nutritionFixture } from '@/nutrition/day-fixture.test-helper';
import { DailyMetricsScreen } from './daily-metrics-screen';
import { ProgressHub } from '@/body/progress-hub';

const mockPush = jest.fn();
const mockFetchDay = jest.fn<(client: unknown, date: string) => Promise<unknown>>();
const mockMutate = jest.fn<(client: unknown, intent: unknown) => Promise<unknown>>();
const mockStore = new Map<string, string>();
const mockFocus: (() => void)[] = [];
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
let mockParams: Record<string, string> = {};
const mockSetParams = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ push: mockPush, setParams: mockSetParams }), useFocusEffect: (effect: () => void) => { mockFocus.push(effect); } }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn(), success: jest.fn(), warning: jest.fn() } }));
jest.mock('@/auth', () => ({ useMobileAuth: () => ({ session: { user: { id: 'owner' } } }) }));
const mockClient = { request: jest.fn(), read: jest.fn() };
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
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
const wrap = (element: React.ReactElement) => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
  <OwnlevelThemeProvider initialMode="light">{element}</OwnlevelThemeProvider></SafeAreaProvider>);

beforeEach(() => {
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
});
