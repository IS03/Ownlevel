import { clearConfirmedReads, invalidateConfirmedReads } from '@/api/confirmed-read-cache';
import type { MobileApiClient } from '@/api/client';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AppState, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { parseProgressBody, parseProgressMetrics, parseProgressOverview, type ProgressBody, type ProgressComparison, type ProgressMetrics, type ProgressOverview, type ProgressQuery } from '@/api/progress';
import { ProgressPeriodOverviewScreen as ProgressOverviewScreen } from './overview-screen';
import { BodyTrendsScreen } from './body-trends-screen';
import { ReturnToBodyChart, bodyChartReturnHref, bodyObservationHref } from './body-chart-navigation';
import { ReturnToMetricChart } from './metrics-chart-navigation';
import { MetricsTrendsScreen } from './metrics-trends-screen';
import { NutritionReportsRoute } from '@/nutrition/report-route';
import { ProgressRangeProvider } from './progress-range-context';
import type { DateRange, ProgressRangeState } from './progress-range';

const mockPush = jest.fn(), mockNavigate = jest.fn(), mockBack = jest.fn(), mockReplace = jest.fn();
let mockCanGoBack = true, mockOwner = 'owner';
let mockActiveClient: MobileApiClient | null;
let mockBodyApis: ReturnType<typeof import('@/body/body-fixture.test-helper')['fakeApi']>[] = [];
let mockParams: Record<string, string> = {};
const mockOverview = jest.fn<(c: unknown, q: ProgressQuery, compare: DateRange | null) => Promise<unknown>>();
const mockBody = jest.fn<(c: unknown, q: ProgressQuery, compare: DateRange | null) => Promise<unknown>>();
const mockMetrics = jest.fn<(c: unknown, q: ProgressQuery, id: string | null, compare: DateRange | null) => Promise<unknown>>();
const mockReport = jest.fn<(c: unknown, q: unknown) => Promise<unknown>>();
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, navigate: mockNavigate, back: mockBack, replace: mockReplace, canGoBack: () => mockCanGoBack }), useFocusEffect: (callback: () => void | (() => void)) => { jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]); }, useLocalSearchParams: () => mockParams, Stack: { Screen: () => null } }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn(), success: jest.fn(), warning: jest.fn() }, triggerHaptic: jest.fn() }));
const mockClient = { request: jest.fn(), read: jest.fn() } as unknown as MobileApiClient;
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockActiveClient }) }));
jest.mock('@/auth', () => ({ useMobileAuth: () => ({ session: { user: { id: mockOwner } } }) }));
// Cuerpo's records and sheets run on the real BodyController over a fake Body API (no network, no storage).
let mockBodyWeights: { date: string; weightKg: number }[] | null = null;
jest.mock('@/body/use-body-controller', () => {
  const { useMemo, useEffect, useSyncExternalStore } = jest.requireActual<typeof import('react')>('react');
  const { BodyController } = jest.requireActual<typeof import('@/body/body-controller')>('@/body/body-controller');
  const fx = jest.requireActual<typeof import('@/body/body-fixture.test-helper')>('@/body/body-fixture.test-helper');
  const { BodyIntentRepository } = jest.requireActual<typeof import('@/body/body-storage')>('@/body/body-storage');
  const empty = new BodyController(fx.fakeApi(), fx.repository(fx.memoryStorage().port)).getSnapshot();
  const noSubscribe = () => () => undefined, emptySnapshot = () => empty;
  return { useBodyController: (client: MobileApiClient | null, owner: string) => {
    const controller = useMemo(() => {
      if (!client) return null;
      const api = fx.fakeApi(mockBodyWeights ? fx.overview({}, mockBodyWeights) : undefined); mockBodyApis.push(api);
      return new BodyController(api, new BodyIntentRepository(fx.memoryStorage().port, owner), () => 'body:1');
    }, [client, owner]);
    useEffect(() => { if (controller) void controller.initialize(); return () => controller?.dispose(); }, [controller]);
    const state = useSyncExternalStore(controller?.subscribe ?? noSubscribe, controller?.getSnapshot ?? emptySnapshot, controller?.getSnapshot ?? emptySnapshot);
    return controller ? { controller, state } : null;
  } };
});
jest.mock('@/api/progress', () => ({ ...jest.requireActual<object>('@/api/progress'),
  fetchProgressOverview: (c: unknown, q: ProgressQuery, _s: unknown, compare: DateRange | null) => mockOverview(c, q, compare),
  fetchProgressBody: (c: unknown, q: ProgressQuery, _s: unknown, compare: DateRange | null) => mockBody(c, q, compare),
  fetchProgressMetrics: (c: unknown, q: ProgressQuery, id: string | null, _s: unknown, compare: DateRange | null) => mockMetrics(c, q, id, compare) }));
// Mis vistas has its own tests (my-views.test.tsx); here it is an empty list.
jest.mock('@/api/progress-views', () => ({ ...jest.requireActual<object>('@/api/progress-views'),
  fetchProgressViews: async () => ({ status: 'ok', meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' },
    data: { today: '2026-10-05', listVersion: 0, views: [], period: { preset: 'custom', start: '2026-10-01', end: '2026-10-05', days: 5, previousStart: '2026-09-26', previousEnd: '2026-09-30', bucket: 'day', includesToday: true } } }) }));
// The automatic insight has its own tests (insight-row.test.tsx); here there is none.
jest.mock('@/api/progress-insight', () => ({ ...jest.requireActual<object>('@/api/progress-insight'),
  fetchProgressInsight: async () => ({ status: 'ok', meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' }, data: { today: '2026-10-05', insight: null } }) }));
jest.mock('@/api/nutrition-report', () => ({ ...jest.requireActual<object>('@/api/nutrition-report'), fetchNutritionReport: (c: unknown, q: unknown) => mockReport(c, q) }));
// Connections owns its resource; its loading, comparison and retry behavior is covered in connections.test.tsx.
jest.mock('@/api/progress-connections', () => ({ ...jest.requireActual<object>('@/api/progress-connections'),
  fetchProgressConnections: async () => ({ status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } }) }));

const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const ok = <T,>(data: T) => ({ status: 'ok' as const, data, meta });
const rnActual = jest.requireActual<typeof import('react-native')>('react-native');
const lost = { status: 'unavailable' as const, reason: 'network' as const, meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' as const } };
const TODAY = '2026-10-05';
const period = (preset: ProgressQuery['period'] = '30', start = '2026-09-06', days = 30) => ({ preset, start, end: TODAY, days, previousStart: '2026-08-07', previousEnd: '2026-09-05', bucket: 'week' as const, includesToday: true });
const cmp = (over: Partial<ProgressComparison> = {}): ProgressComparison => ({ status: 'comparable', reason: 'eligible', current: 2200, previous: 2000, deltaAbsolute: 200, deltaPercent: 10, change: 'increased', ...over });
const ids = { steps: 'c1000000-0000-4000-8000-000000000001', sleep: 'c1000000-0000-4000-8000-000000000002', custom: 'c1000000-0000-4000-8000-000000000003' };
export function trainingSummary() {
  const c = cmp({ current: 12, previous: 9, deltaAbsolute: 3, deltaPercent: 33.3 });
  return { sessions: 12, trainingDays: 11, sets: 180, minutes: 840, sessionsPerWeek: 2.8,
    comparisons: { sessions: c, trainingDays: cmp({ current: 11, previous: 9, deltaAbsolute: 2, deltaPercent: 22.2 }), sets: cmp({ current: 180, previous: 150, deltaAbsolute: 30, deltaPercent: 20 }),
      minutes: cmp({ current: 840, previous: 600, deltaAbsolute: 240, deltaPercent: 40 }), setsPerSession: cmp({ change: 'stable' }) },
    performance: { improved: 4, stable: 3, declined: 1, comparable: 8, insufficient: 2, headline: '4 de 8 ejercicios mejoraron' } };
}
function overview(over: Partial<ProgressOverview> = {}, preset: ProgressQuery['period'] = '30'): ProgressOverview {
  return { today: TODAY, period: period(preset), training: { status: 'ok', data: trainingSummary() },
    evolution: [{ id: 'body.weight', label: 'Peso', value: '80,5 kg', detail: '−1,5 kg en el período', destination: { kind: 'body' } }],
    changes: [{ id: 'activity:steps', domain: 'metrics', label: 'Pasos', description: 'Subió frente al período anterior.', destination: { kind: 'metrics', metricId: ids.steps } }],
    nutrition: { status: 'ok', data: { averageKcal: 2200, averageProteinG: 130, averageTargetKcal: 2100, averageTargetProteinG: 140, accumulatedBalanceKcal: -3000,
      registeredDays: 10, completedDays: 10, days: 30, calories: cmp(), protein: cmp({ current: 130, previous: 120, deltaAbsolute: 10, deltaPercent: 8.3 }),
      balance: cmp({ deltaPercent: null, change: 'stable' }) } },
    metrics: { status: 'ok', data: { items: [
      { id: ids.steps, name: 'Pasos', unit: 'pasos', valueType: 'integer', average: 9000, coverage: { registered: 28, eligible: 29, ratio: 28 / 29 }, comparison: cmp({ current: 9000, previous: 6000, deltaAbsolute: 3000, deltaPercent: 50 }) },
      { id: ids.sleep, name: 'Sueño', unit: 'min', valueType: 'duration', average: 450, coverage: { registered: 5, eligible: 29, ratio: 5 / 29 }, comparison: cmp({ status: 'insufficient_data', reason: 'previous_period_empty', previous: null, deltaAbsolute: null, deltaPercent: null, change: 'insufficient_data' }) },
    ] } },
    body: { status: 'ok', data: { excludedSuspect: 1, trackedMetrics: 1 } }, sparks: sparks(), ...over };
}
const pt = (day: string, value: number | null) => ({ start: day, end: day, value });
function sparks(comparing = false): NonNullable<ProgressOverview['sparks']> {
  const ref = (values: (number | null)[]) => comparing ? values.map((v, i) => pt(`2026-09-0${i + 1}`, v)) : null;
  return {
    weight: { current: [pt('2026-10-01', 82), pt('2026-10-02', null), pt('2026-10-03', 80.5)], reference: ref([83, null, 83]), first: 82, last: 80.5, referenceLast: comparing ? 83 : null },
    training: { current: [pt('2026-10-01', 40), pt('2026-10-02', 0), pt('2026-10-03', 60)], reference: ref([50, 50, 50]) },
    nutrition: { current: [pt('2026-10-01', 2100), pt('2026-10-02', null), pt('2026-10-03', 2300)], reference: ref([2000, 2000, null]) },
  };
}
const obs = (date: string, value: number, imported = false) => ({ date, value, imported, provenanceLabel: imported ? 'Importado · sheet' : 'Registro de peso' });
function body(): ProgressBody {
  return { today: TODAY, period: period(), excludedSuspect: 1, metrics: [
    { key: 'body.weight', label: 'Peso', unit: 'kg', latest: obs('2026-10-01', 80.5), first: obs('2026-09-10', 82), last: obs('2026-10-01', 80.5), change: -1.5, referenceChange: null,
      trend: 'decreased', confidence: 'supported', observations: [obs('2026-09-10', 82), obs('2026-09-20', 81, true), obs('2026-10-01', 80.5)], referenceCount: 1, comparison: { status: 'insufficient_data', reason: 'previous_period_empty' } },
    { key: 'body.waist', label: 'Cintura', unit: 'cm', latest: obs('2026-09-15', 88), first: obs('2026-09-15', 88), last: obs('2026-09-15', 88), change: null, referenceChange: null,
      trend: 'unavailable', confidence: 'unavailable', observations: [obs('2026-09-15', 88)], referenceCount: 0, comparison: { status: 'insufficient_data', reason: 'insufficient_current_samples' } },
  ] };
}
const defs = [
  { id: ids.steps, systemKey: 'steps', name: 'Pasos', unit: 'pasos', valueType: 'integer' as const, isActive: true, currentTarget: 10000 },
  { id: ids.sleep, systemKey: 'sleep', name: 'Sueño', unit: 'min', valueType: 'duration' as const, isActive: true, currentTarget: 480 },
  { id: ids.custom, systemKey: null, name: 'Mate viejo', unit: 'L', valueType: 'decimal' as const, isActive: false, currentTarget: null },
];
function metrics(id: string | null): ProgressMetrics {
  const metric = defs.find(d => d.id === id) ?? defs[0];
  return { today: TODAY, period: { ...period('7', '2026-09-29', 7), bucket: 'day', previousStart: '2026-09-22', previousEnd: '2026-09-28' }, definitions: defs, metric,
    summary: { average: metric.id === ids.sleep ? 450 : 0, median: 0, minimum: 0, maximum: 0, registeredDays: 2, eligibleDays: 6, coverageRatio: 2 / 6, trendDelta: 0, trendPercentDelta: null },
    previous: { average: 0, registeredDays: 3, eligibleDays: 7 }, comparison: cmp({ current: 0, previous: 0, deltaAbsolute: 0, deltaPercent: null, change: 'stable' }),
    series: ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((d, i) => ({ start: d, end: d, value: i % 3 === 0 ? 0 : null, samples: i % 3 === 0 ? 1 : 0 })) };
}
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
const MONTH = { period: 'custom' as const, from: '2026-10-01', to: TODAY };
const comparing: ProgressRangeState = { unit: 'month', anchor: TODAY, custom: null, compare: { kind: 'previous' } };
const wrapped = (el: React.ReactElement, initialState?: ProgressRangeState) => (<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
  <OwnlevelThemeProvider initialMode="light"><ProgressRangeProvider initialToday={TODAY} initialState={initialState}>{el}</ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>);
const wrap = (el: React.ReactElement, initialState?: ProgressRangeState) => render(wrapped(el, initialState));

const listeners: ((s: string) => void)[] = [];
beforeEach(() => {
  mockActiveClient = mockClient; mockOwner = 'owner'; mockBodyApis = []; mockCanGoBack = true;
  clearConfirmedReads(mockClient);
  jest.clearAllMocks(); mockBody.mockReset(); mockParams = {}; listeners.length = 0; mockBodyWeights = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, l) => { listeners.push(l as (s: string) => void); return { remove: jest.fn() } as never; });
  mockOverview.mockImplementation(async (_c, q) => ok(overview({}, q.period)));
  mockBody.mockImplementation(async () => ok(body()));
  mockMetrics.mockImplementation(async (_c, _q, id) => ok(metrics(id)));
});

describe('Progress fixtures follow the shared contract', () => {
  it('overview, body and metrics fixtures are valid contract payloads', () => {
    expect(parseProgressOverview(overview())).toBeDefined(); expect(parseProgressBody(body())).toBeDefined(); expect(parseProgressMetrics(metrics(ids.sleep))).toBeDefined();
  });
});

describe('Progress Overview', () => {
  it('reopens the confirmed overview without another main request or a fresh synchronization timestamp', async () => {
    const first = wrap(<ProgressOverviewScreen />); await flush();
    const timestamp = first.getByText(/^Lectura de las /).props.children;
    expect(mockOverview).toHaveBeenCalledTimes(1); first.unmount();
    const second = wrap(<ProgressOverviewScreen />);
    expect(second.getByText('Tu octubre')).toBeTruthy();
    expect(second.getByText(/^Lectura de las /).props.children).toEqual(timestamp);
    expect(mockOverview).toHaveBeenCalledTimes(1); await flush(); second.unmount();
  });
  const row = (view: ReturnType<typeof wrap>, id: string) => view.getByTestId(`progress-area-${id}`).props.accessibilityLabel as string;
  it('"Tu octubre" without comparing: progress inside the period, mini charts with real gaps, no Explorar or Revisar datos', async () => {
    const view = wrap(<ProgressOverviewScreen />); await flush();
    expect(mockOverview).toHaveBeenLastCalledWith(mockClient, MONTH, null);
    expect(view.getByTestId('progress-period-caption').props.accessibilityLabel).toBe('Octubre 2026, del 1 al 5 · en curso');
    expect(view.getByText('Tu octubre')).toBeTruthy();
    expect(row(view, 'body')).toBe('Peso. 82 → 80,5 kg · ↘ 1,5 kg');
    expect(row(view, 'training')).toBe('Entrenamiento. 11 días · 180 series');
    expect(row(view, 'nutrition')).toBe('Nutrición. 2.200 / 2.100 kcal por día · 10 de 30 días');
    expect(row(view, 'metrics')).toBe('Métricas. Pasos 9.000 · Sueño 7 h 30 min');
    // missing != zero: a bucket without data is a gap; zero sets is a real (faint) mark.
    expect(view.getByTestId('progress-spark-nutrition-current-2026-10-02-missing', { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByTestId('progress-spark-training-current-2026-10-02-zero', { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryByTestId(/progress-spark-training-reference/, { includeHiddenElements: true })).toBeNull();
    // Sin comparar: Areas hides comparison; Connections independently keeps its previous-period reference.
    expect(within(view.getByTestId('progress-areas')).queryByText(/frente a/i)).toBeNull(); expect(view.queryByTestId('progress-compare-chip')).toBeNull();
    expect(view.getByText('Sin récords ni cambios destacados en este período.')).toBeTruthy();
    for (const gone of ['Explorar', 'Revisar datos']) expect(view.queryByText(gone)).toBeNull();
    fireEvent.press(view.getByTestId('progress-area-training'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/trends/training', params: {} });
    fireEvent.press(view.getByTestId('progress-influence'));
    expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/progress/influence');
  });
  it('records and in-period improvements show without comparison; period comparisons stay opt-in', async () => {
    mockOverview.mockImplementation(async () => ok(overview({ inPeriod: { improved: 3, comparable: 5 }, changes: [
      { id: 'pr', domain: 'training', label: 'Aductores', description: 'Nuevo mejor peso: 29 kg × 20', destination: { kind: 'training_exercise', exerciseId: 'e1' } },
      { id: 'activity:steps', domain: 'metrics', label: 'Pasos', description: 'Subió frente al período anterior.', destination: { kind: 'metrics', metricId: ids.steps } }] })));
    const view = wrap(<ProgressOverviewScreen />); await flush();
    const highlights = within(view.getByTestId('progress-highlights'));
    expect(highlights.getByText('Aductores')).toBeTruthy(); expect(highlights.queryByText('Pasos')).toBeNull();
    expect(highlights.queryByText('4 de 8 ejercicios mejoraron')).toBeNull();
    expect(highlights.getByText('3 ejercicios mejoraron en octubre')).toBeTruthy();
    fireEvent.press(highlights.getByRole('button', { name: '3 ejercicios mejoraron en octubre. De su primera a su última sesión del período' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/trends/training', params: {} });
    fireEvent.press(highlights.getByRole('button', { name: 'Aductores. Nuevo mejor peso: 29 kg × 20' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/trends/exercise/[id]', params: { id: 'e1' } });
  });
  it('with a comparison: B goes to the server, each row adds its value and a neutral arrow, grey bars appear, and the chip clears it', async () => {
    mockOverview.mockImplementation(async (_c, _q, compare) => ok(overview({ sparks: sparks(!!compare) })));
    const view = wrap(<ProgressOverviewScreen />, comparing); await flush();
    expect(mockOverview).toHaveBeenLastCalledWith(mockClient, MONTH, { start: '2026-09-01', end: '2026-09-05' });
    expect(within(view.getByTestId('progress-compare-chip')).getByText('vs. 1–5 sep')).toBeTruthy();
    expect(row(view, 'body')).toBe('Peso. 80,5 kg · 1–5 sep 83 · ↘ 2,5 kg');
    expect(row(view, 'training')).toBe('Entrenamiento. 180 series · 1–5 sep 150 · ↗ 30');
    expect(row(view, 'nutrition')).toBe('Nutrición. 2.200 kcal · 1–5 sep 2.000 · ↗ 200 · 10 de 30 días');
    expect(row(view, 'metrics')).toBe('Métricas. Pasos 9.000 · 1–5 sep 6.000');
    expect(view.getByTestId('progress-spark-training-reference-2026-09-01-mark', { includeHiddenElements: true })).toBeTruthy();
    const highlights = within(view.getByTestId('progress-highlights'));
    expect(highlights.getByText('Subió frente al período anterior.')).toBeTruthy();
    expect(highlights.getByText('4 de 8 ejercicios mejoraron')).toBeTruthy(); expect(highlights.getByText('Frente a 1–5 sep')).toBeTruthy();
    fireEvent.press(view.getByTestId('progress-compare-clear')); await flush();
    expect(mockOverview).toHaveBeenLastCalledWith(mockClient, MONTH, null);
    expect(view.queryByText(/1–5 sep/)).toBeNull();
    expect(row(view, 'training')).toBe('Entrenamiento. 11 días · 180 series');
  });
  it('the period strip and the caption (VoiceOver steps) re-read; a late response for another period is never shown', async () => {
    let release!: (v: unknown) => void;
    mockOverview.mockImplementationOnce(() => new Promise(r => { release = r; }));
    const view = wrap(<ProgressOverviewScreen />); await flush();
    fireEvent.press(view.getByTestId('progress-unit-week')); await flush();
    expect(mockOverview).toHaveBeenLastCalledWith(mockClient, { period: 'custom', from: '2026-10-05', to: TODAY }, null);
    expect(view.getByText('Tu semana')).toBeTruthy();
    await act(async () => { release(ok(overview({ changes: [{ id: 'stale', domain: 'training', label: 'Viejo', description: 'x', destination: { kind: 'training' } }] }))); }); await flush();
    expect(view.queryByText('Viejo')).toBeNull();
    fireEvent.press(view.getByTestId('progress-unit-month')); await flush();
    fireEvent(view.getByTestId('progress-period-caption'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } }); await flush();
    expect(mockOverview).toHaveBeenLastCalledWith(mockClient, { period: 'custom', from: '2026-09-01', to: '2026-09-30' }, null);
    expect(view.getByTestId('progress-period-caption').props.accessibilityLabel).toBe('Septiembre 2026, 30 días');
    expect(view.getByText('Tu septiembre')).toBeTruthy();
    // Away from today, one tap brings the same unit back to the current period.
    fireEvent.press(view.getByTestId('progress-period-today')); await flush();
    expect(view.getByText('Tu octubre')).toBeTruthy(); expect(view.queryByTestId('progress-period-today')).toBeNull();
    fireEvent.press(view.getByTestId('progress-unit-year')); await flush();
    expect(mockOverview).toHaveBeenLastCalledWith(mockClient, { period: 'custom', from: '2026-01-01', to: TODAY }, null);
    expect(view.getByText('Tu 2026')).toBeTruthy();
  });
  it('Personalizado steps the unit you are on: previous and next month, then back to today', async () => {
    const view = wrap(<ProgressOverviewScreen />); await flush();
    fireEvent.press(view.getByTestId('progress-unit-custom'));
    expect(view.queryByText('Mes siguiente')).toBeNull();
    fireEvent.press(view.getByText('Mes anterior')); await flush();
    expect(mockOverview).toHaveBeenLastCalledWith(mockClient, { period: 'custom', from: '2026-09-01', to: '2026-09-30' }, null);
    expect(view.getByTestId('progress-unit-month').props.accessibilityState.selected).toBe(true);
    fireEvent.press(view.getByTestId('progress-unit-custom'));
    fireEvent.press(view.getByText('Mes siguiente')); await flush();
    expect(view.getByText('Tu octubre')).toBeTruthy();
    expect(mockOverview).toHaveBeenCalledTimes(2); // October was already confirmed before visiting September.
  });
  it('Personalizado opens the calendar: first day, last day, Listo', async () => {
    const view = wrap(<ProgressOverviewScreen />); await flush();
    fireEvent.press(view.getByTestId('progress-unit-custom'));
    fireEvent.press(view.getByRole('button', { name: '1 de octubre' }));
    expect(view.getByRole('button', { name: 'Listo' }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(view.getByRole('button', { name: '3 de octubre' }));
    fireEvent.press(view.getByRole('button', { name: 'Listo' })); await flush();
    expect(mockOverview).toHaveBeenLastCalledWith(mockClient, { period: 'custom', from: '2026-10-01', to: '2026-10-03' }, null);
    expect(view.getByText('Tu período')).toBeTruthy();
  });
  it('an unavailable domain is explicit (never zero or empty); rows open their detail with the shared period', async () => {
    mockOverview.mockImplementation(async () => ok(overview({ nutrition: { status: 'unavailable' }, body: { status: 'unavailable' }, training: { status: 'unavailable' },
      sparks: { weight: null, training: null, nutrition: null } })));
    const view = wrap(<ProgressOverviewScreen />); await flush();
    expect(row(view, 'nutrition')).toBe('Nutrición. No pudimos cargar Nutrición.');
    expect(row(view, 'body')).toBe('Peso. No pudimos cargar Cuerpo.');
    expect(row(view, 'training')).toBe('Entrenamiento. No pudimos cargar Entrenamiento.');
    expect(view.queryByText(/0 kcal/)).toBeNull(); expect(view.queryByTestId(/progress-spark/, { includeHiddenElements: true })).toBeNull();
    fireEvent.press(view.getByTestId('progress-area-metrics'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/trends/metrics', params: { metric: ids.steps } });
    // The Nutrition report lives in another tab's stack: it still receives the chosen range.
    fireEvent.press(view.getByTestId('progress-area-nutrition'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/trends/nutrition', params: {} });
  });
  it('a failed first read is an error state (not empty); foreground re-reads; a failed refresh keeps the confirmed read marked stale', async () => {
    mockOverview.mockResolvedValueOnce(lost);
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    const view = wrap(<ProgressOverviewScreen />); await flush();
    expect(view.getByText('No pudimos cargar tu progreso')).toBeTruthy();
    await act(async () => { listeners.forEach(l => l('background')); listeners.forEach(l => l('active')); }); await flush();
    expect(view.getByText('82 → 80,5 kg · ↘ 1,5 kg')).toBeTruthy();
    mockOverview.mockResolvedValueOnce(lost);
    await act(async () => { listeners.forEach(l => l('background')); listeners.forEach(l => l('active')); }); await flush();
    expect(view.getByText('82 → 80,5 kg · ↘ 1,5 kg')).toBeTruthy();
    expect(view.getByText('No se pudo actualizar. Mostramos la última lectura confirmada de este período.')).toBeTruthy();
  });
});

describe('Body Trends', () => {
  it('values inside the period, a dot per real record (imported flagged), the other measures as rows', async () => {
    const view = wrap(<BodyTrendsScreen />); await flush();
    expect(mockBody).toHaveBeenLastCalledWith(mockClient, MONTH, null);
    const summary = within(view.getByTestId('body-trend-summary'));
    expect(summary.getByText('80,5 kg')).toBeTruthy(); expect(summary.getByText('último registro · 1 oct')).toBeTruthy();
    expect(summary.getByText('↘ 1,5 kg')).toBeTruthy(); expect(summary.getByText('en octubre · desde 82 kg el 10 sep')).toBeTruthy();
    // Only the canonical supported trend is named; no new inference is computed by the screen.
    expect(summary.getByText(/Tendencia en bajada/)).toBeTruthy(); expect(summary.queryByText(/Un punto por registro/)).toBeNull();
    expect(summary.getByText(/1 medición sospechosa excluida; podés corregirla en Cuerpo\./)).toBeTruthy();
    expect(summary.queryByText(/sin cambio medible/)).toBeNull(); // only while comparing
    fireEvent.press(within(view.getByTestId('body-trend-chart')).getByRole('button', { name: '20 sep 2026, 81 kg · Importado · sheet' }));
    expect(mockPush).not.toHaveBeenCalled();
    expect(within(view.getByTestId('body-point-inspection')).getByText('Peso · 81 kg')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Ver registro original' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/body', params: { date: '2026-09-20', bodyChartReturn: '1', bodyChartMetric: '' } });
    // Each measure opens on its own screen, so Back returns to the weight.
    fireEvent.press(view.getByRole('button', { name: 'Cintura. 88 cm · un solo registro' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/trends/body', params: { metric: 'body.waist' } });
    // The records to correct sit right under the weight, and one floating "+" loads a new one here.
    expect(within(view.getByTestId('body-trend-records')).getByLabelText('Peso del 4 oct 2026: 80,5 kg')).toBeTruthy();
    fireEvent.press(view.getByTestId('body-add-menu'));
    fireEvent.press(view.getByTestId('body-add-measurement')); await flush();
    expect(view.getByTestId('body-measurement-sheet')).toBeTruthy();
  });
  it('a measure on its own screen: one record remains inspectable without pretending it has a trend', async () => {
    mockParams = { metric: 'body.waist' };
    const view = wrap(<BodyTrendsScreen />); await flush();
    const summary = within(view.getByTestId('body-trend-summary'));
    expect(summary.getByText('88 cm')).toBeTruthy(); expect(summary.queryByText('hacen falta 2 registros')).toBeNull();
    expect(summary.getByText('Un solo registro en octubre. Con dos o más vas a ver cómo cambió.')).toBeTruthy();
    expect(view.getByTestId('body-trend-chart')).toBeTruthy(); expect(view.queryByTestId('body-trend-others')).toBeNull();
    fireEvent.press(view.getByTestId('body-trend-widen')); await flush();
    expect(mockBody).toHaveBeenLastCalledWith(mockClient, expect.objectContaining({ period: 'custom' }), null);
    expect(view.queryByText('Un solo registro en octubre. Con dos o más vas a ver cómo cambió.')).toBeNull();
  });
  it('keeps measure, A/B, source selection and context on return, and inspection adds no read', async () => {
    mockParams = { metric: 'body.waist' };
    const view = wrap(<><BodyTrendsScreen /><ReturnToBodyChart /></>, comparing); await flush();
    const initial = { progress: mockBody.mock.calls.length, records: mockBodyApis[0].overview.mock.calls.length };
    expect(initial).toEqual({ progress: 1, records: 1 });
    fireEvent.press(view.getByTestId('body-trend-chart-2026-09-15-mark'));
    const readout = within(view.getByTestId('body-point-inspection'));
    expect(readout.getByText('15 sep 2026')).toBeTruthy(); expect(readout.getByText('Cintura · 88 cm')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
    fireEvent.press(view.getByRole('button', { name: 'Ver registro original' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/progress/body', params: { date: '2026-09-15', bodyChartReturn: '1', bodyChartMetric: 'body.waist' } });
    // As with useLocalSearchParams in a retained stack, the source route keeps its metric.
    mockParams = { metric: 'body.waist', date: '2026-09-15', bodyChartReturn: '1', bodyChartMetric: 'body.waist' };
    view.rerender(wrapped(<><BodyTrendsScreen /><ReturnToBodyChart /></>, comparing));
    fireEvent.press(view.getByRole('button', { name: 'Volver al gráfico de Cuerpo' }));
    expect(mockBack).toHaveBeenCalledTimes(1); expect(mockReplace).not.toHaveBeenCalled();
    expect(view.getByTestId('body-trend-chart-2026-09-15-mark').props.accessibilityState.selected).toBe(true);
    expect(view.getByText('Cintura · 88 cm')).toBeTruthy();
    expect(mockBody).toHaveBeenLastCalledWith(mockClient, MONTH, { start: '2026-09-01', end: '2026-09-05' });
    expect({ progress: mockBody.mock.calls.length, records: mockBodyApis[0].overview.mock.calls.length }).toEqual(initial);
    fireEvent.press(view.getByTestId('body-trend-chart-2026-09-15-mark'));
    expect(view.queryByRole('button', { name: 'Ver registro original' })).toBeNull();
  });
  it('updates the selected value after a confirmed invalidation, and removes navigation to deleted or moved sources', async () => {
    const view = wrap(<BodyTrendsScreen />); await flush();
    fireEvent.press(view.getByTestId('body-trend-chart-2026-09-20-mark'));
    const edited = body(); edited.metrics[0].observations[1] = obs('2026-09-20', 81.25, true);
    mockBody.mockResolvedValue(ok(edited));
    act(() => invalidateConfirmedReads(mockClient, '/api/mobile/v1/body/weights/2026-09-20')); await flush();
    expect(within(view.getByTestId('body-point-inspection')).getByText('Peso · 81,25 kg')).toBeTruthy();
    expect(view.queryByText('Peso · 81 kg')).toBeNull();
    const removed = body(); removed.metrics[0].observations.splice(1, 1);
    mockBody.mockResolvedValue(ok(removed));
    act(() => invalidateConfirmedReads(mockClient, '/api/mobile/v1/body/weights/2026-09-20')); await flush();
    expect(view.getByText(/El registro seleccionado ya no está disponible/)).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Ver registro original' })).toBeNull();
    expect(view.queryByTestId('body-trend-chart-2026-09-20-mark')).toBeNull();
  });
  it('retains a confirmed selection with an honest refresh error, then resets it for another period or account', async () => {
    const view = wrap(<BodyTrendsScreen />); await flush();
    fireEvent.press(view.getByTestId('body-trend-chart-2026-09-20-mark'));
    mockBody.mockResolvedValueOnce(lost);
    act(() => view.UNSAFE_getByType(RefreshControl).props.onRefresh()); await flush();
    expect(view.getByText('No se pudo actualizar. Mostramos la última lectura confirmada.')).toBeTruthy();
    expect(view.getByText('Peso · 81 kg')).toBeTruthy();
    fireEvent.press(view.getByTestId('progress-unit-week')); await flush();
    expect(view.queryByRole('button', { name: 'Ver registro original' })).toBeNull();
    fireEvent.press(view.getByTestId('body-trend-chart-2026-09-20-mark'));
    mockOwner = 'different-owner'; mockActiveClient = {} as MobileApiClient;
    const next = body(); next.metrics[0].observations = [obs('2026-10-01', 70)]; next.metrics[0].last = next.metrics[0].first = obs('2026-10-01', 70); next.metrics[0].change = null; next.metrics[0].trend = 'unavailable';
    mockBody.mockResolvedValue(ok(next));
    view.rerender(wrapped(<BodyTrendsScreen />)); await flush();
    expect(view.queryByRole('button', { name: 'Ver registro original' })).toBeNull();
    expect(view.queryByText('Peso · 81 kg')).toBeNull();
    expect(view.queryByTestId('body-trend-chart-2026-09-20-mark')).toBeNull();
    mockActiveClient = null;
    view.rerender(wrapped(<BodyTrendsScreen />)); await flush();
    expect(view.queryByTestId('body-point-inspection')).toBeNull();
  });
  it('shows a real zero as an invalid gap that can be inspected, without a contaminated change or trend', async () => {
    const invalid = body(); const m = invalid.metrics[0]; m.observations = [obs('2026-10-02', 0)]; m.first = m.last = m.observations[0]; m.change = null; m.trend = 'unavailable';
    mockBody.mockResolvedValue(ok(invalid));
    const view = wrap(<BodyTrendsScreen />); await flush();
    expect(view.getByTestId('body-invalid-summary')).toBeTruthy();
    expect(view.queryByTestId('body-trend-chart-2026-10-02-mark')).toBeNull();
    fireEvent.press(view.getByTestId('body-trend-chart-2026-10-02-gap'));
    expect(view.getByText('Peso · 0 kg')).toBeTruthy();
    expect(view.getByText(/Registro no válido como peso corporal/)).toBeTruthy();
    expect(view.getByRole('button', { name: 'Ver registro original' })).toBeTruthy();
  });
  it('does not show an older summary using 0 kg as a baseline even if its point list already excluded zero', async () => {
    const old = body(); old.metrics[0].first = obs('2026-09-10', 0); old.metrics[0].change = 80.5;
    expect(parseProgressBody(old)).toBeDefined();
    mockBody.mockResolvedValue(ok(old));
    const view = wrap(<BodyTrendsScreen />); await flush();
    expect(view.getByTestId('body-invalid-summary')).toBeTruthy();
    expect(view.queryByText('↗ 80,5 kg')).toBeNull();
    expect(view.queryByText(/Tendencia en bajada/)).toBeNull();
    expect(view.queryByText(/desde 0 kg/)).toBeNull();
    fireEvent.press(view.getByTestId('body-trend-chart-2026-10-01-mark'));
    expect(view.getByText('Peso · 80,5 kg')).toBeTruthy();
  });
  it('distinguishes two observations from supported trends and never fabricates reference points', async () => {
    const data = body(); const m = data.metrics[0]; m.observations = [m.observations[0], m.observations[2]]; m.confidence = 'limited'; m.referenceCount = 4; m.referenceChange = 0;
    mockBody.mockResolvedValue(ok(data));
    const view = wrap(<BodyTrendsScreen />, comparing); await flush();
    expect(view.getByText('Dos registros: muestran una diferencia, todavía con evidencia limitada.')).toBeTruthy();
    expect(view.queryByText(/Tendencia en bajada/)).toBeNull();
    expect(view.getByText(/4 registros en la referencia/)).toBeTruthy();
    expect(within(view.getByTestId('body-trend-chart')).getAllByRole('button')).toHaveLength(2);
    const reference = within(view.getByTestId('body-reference-summary'));
    expect(reference.getByText('Comparación · 1–5 sep')).toBeTruthy(); expect(reference.getByText('= 0 kg')).toBeTruthy();
    expect(view.getByTestId('body-reference-summary').props.accessibilityLabel).toBe('Comparación con 1–5 sep: sin cambio, 4 registros. El gráfico muestra solo el período elegido.');
  });
  it('distinguishes empty valid observations, invalid stored records and an unavailable read', async () => {
    mockBodyWeights = [{ date: '2026-10-02', weightKg: 0 }];
    mockBody.mockResolvedValue(ok({ ...body(), metrics: [] }));
    const view = wrap(<BodyTrendsScreen />); await flush();
    expect(view.getByText(/No hay pesos ni medidas válidos/)).toBeTruthy();
    expect(view.getByLabelText('Peso del 2 oct 2026: 0 kg. No cuenta: no es un peso')).toBeTruthy();
    expect(view.queryByTestId('body-trend-chart')).toBeNull();
    view.unmount(); clearConfirmedReads(mockClient);
    mockBody.mockResolvedValue(lost);
    const failed = wrap(<BodyTrendsScreen />); await flush();
    expect(failed.getByText('No pudimos cargar Cuerpo')).toBeTruthy();
    expect(failed.queryByText(/No hay pesos ni medidas válidos/)).toBeNull();
  });
  it('keeps dates across a year boundary and the exact custom period and A/B when opening an imported source', async () => {
    const data = body(), m = data.metrics[0];
    m.observations = [obs('2025-12-31', 80, true), obs('2026-01-02', 81)]; m.first = m.observations[0]; m.last = m.latest = m.observations[1]; m.change = 1; m.confidence = 'limited'; m.trend = 'increased';
    data.period = { ...data.period, preset: 'custom', start: '2025-12-30', end: '2026-01-03', days: 5, previousStart: '2025-12-20', previousEnd: '2025-12-24' };
    mockBody.mockResolvedValue(ok(data)); mockParams = { metric: 'body.weight' };
    const selected: ProgressRangeState = { unit: 'custom', anchor: TODAY, custom: { start: '2025-12-30', end: '2026-01-03' }, compare: { kind: 'custom', range: { start: '2025-12-20', end: '2025-12-24' } } };
    const view = wrap(<BodyTrendsScreen />, selected); await flush();
    fireEvent.press(view.getByTestId('body-trend-chart-2025-12-31-mark'));
    expect(view.getByText('Peso · 80 kg')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Ver registro original' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/progress/body', params: { date: '2025-12-31', bodyChartReturn: '1', bodyChartMetric: 'body.weight' } });
    expect(mockBody).toHaveBeenLastCalledWith(mockClient, { period: 'custom', from: '2025-12-30', to: '2026-01-03' }, { start: '2025-12-20', end: '2025-12-24' });
  });
  it('does not replace a missing selected measurement with another metric', async () => {
    const data = body(); data.metrics = [data.metrics[0]];
    mockParams = { metric: 'body.waist' }; mockBody.mockResolvedValue(ok(data));
    const view = wrap(<BodyTrendsScreen />); await flush();
    expect(view.getByText('Esta medida no está disponible en esta lectura.')).toBeTruthy();
    expect(view.queryByTestId('body-trend-chart')).toBeNull();
    expect(view.queryByText('Peso · 80,5 kg')).toBeNull();
  });
  it('does not reuse a selected date across different measures when the root default changes after a write', async () => {
    const first = body(); first.metrics = [first.metrics[1]];
    mockBody.mockResolvedValue(ok(first));
    const view = wrap(<BodyTrendsScreen />); await flush();
    fireEvent.press(view.getByTestId('body-trend-chart-2026-09-15-mark'));
    expect(view.getByText('Cintura · 88 cm')).toBeTruthy();
    const next = body(); next.metrics[0].observations.splice(1, 0, obs('2026-09-15', 85));
    mockBody.mockResolvedValue(ok(next));
    act(() => invalidateConfirmedReads(mockClient, '/api/mobile/v1/body/weights/2026-09-15')); await flush();
    expect(view.getByTestId('body-trend-chart-2026-09-15-mark').props.accessibilityState.selected).toBe(false);
    expect(view.queryByRole('button', { name: 'Ver registro original' })).toBeNull();
    expect(view.queryByText('Cintura · 88 cm')).toBeNull();
  });
  it('preserves complete dates, origin labels and touch targets with large text', async () => {
    const rn = jest.requireActual<typeof import('react-native')>('react-native');
    const dimensions = jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ width: 320, height: 700, scale: 3, fontScale: 2 });
    const view = wrap(<BodyTrendsScreen />); await flush();
    const chart = within(view.getByTestId('body-trend-chart'));
    for (const point of chart.getAllByRole('button')) expect(rn.StyleSheet.flatten(point.props.style).minWidth).toBeGreaterThanOrEqual(44);
    fireEvent.press(chart.getByRole('button', { name: '20 sep 2026, 81 kg · Importado · sheet' }));
    expect(view.getByTestId('body-trend-chart-2026-09-20-mark').props.accessibilityState.selected).toBe(true);
    expect(view.getByText('Peso · 81 kg')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Ver registro original' })).toBeTruthy();
    dimensions.mockRestore();
  });
  it('rejects malformed return parameters and uses a fixed fallback only without a previous route', () => {
    for (const metric of [undefined, ['/settings'], '/settings', 'body.unknown']) expect(bodyChartReturnHref({ bodyChartReturn: '1', bodyChartMetric: metric })).toBeNull();
    expect(bodyObservationHref('2026-02-30', 'body.weight')).toBeNull();
    expect(bodyObservationHref('2026-10-02', 'body.arm')).toMatchObject({ params: { bodyChartMetric: 'body.arm' } });
    mockCanGoBack = false; mockParams = { bodyChartReturn: '1', bodyChartMetric: 'body.calf_left' };
    const view = wrap(<ReturnToBodyChart />);
    fireEvent.press(view.getByRole('button', { name: 'Volver al gráfico de Cuerpo' }));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(tabs)/progress/trends/body', params: { metric: 'body.calf_left' } });
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('opened from Insights (#367): the weight on the month of that day before the first read, its limit and a way back', async () => {
    mockParams = { metric: 'body.weight', from: '2026-09-01', to: '2026-09-30', insightsReturn: '1', insightsDate: '2026-09-15', insightsSession: '93670000-0000-4000-8000-000000000b02' };
    const view = wrap(<BodyTrendsScreen />); await flush();
    expect(mockBody.mock.calls.length).toBeGreaterThan(0);
    for (const call of mockBody.mock.calls) expect(call[1]).toEqual({ period: 'custom', from: '2026-09-01', to: '2026-09-30' });
    expect(view.getByTestId('body-from-insights').props.children).toBe('El peso de un día no dice si te pesaste antes o después de entrenar.');
    fireEvent.press(view.getByRole('button', { name: 'Volver a Insights' }));
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/(tabs)/train/insights', params: { date: '2026-09-15', session: '93670000-0000-4000-8000-000000000b02' } });
  });
  it('without Insights there is no way back and no limit note', async () => {
    const view = wrap(<BodyTrendsScreen />); await flush();
    expect(view.queryByRole('button', { name: 'Volver a Insights' })).toBeNull();
    expect(view.queryByTestId('body-from-insights')).toBeNull();
  });
  it('a stored 0 kg is named with its date, never dropped or re-computed here', async () => {
    // Legacy response: preserve the original zero for inspection, but do not display its contaminated aggregates.
    mockBody.mockImplementation(async () => { const data = body(); const weight = data.metrics[0]!; weight.observations = [...weight.observations, obs('2026-10-02', 0)]; return ok(data); });
    const view = wrap(<BodyTrendsScreen />); await flush();
    expect(view.getByTestId('body-trend-zero')).toBeTruthy();
    expect(within(view.getByTestId('body-trend-zero')).getByText(/El pesaje del 2 oct está en 0 kg: no es un peso corporal válido/)).toBeTruthy();
    expect(within(view.getByTestId('body-trend-summary')).queryByText('↘ 1,5 kg')).toBeNull();
    expect(view.getByTestId('body-invalid-summary')).toBeTruthy();
    view.unmount(); clearConfirmedReads(mockClient);
    mockBody.mockImplementation(async () => ok(body()));
    const clean = wrap(<BodyTrendsScreen />); await flush();
    expect(clean.queryByTestId('body-trend-zero')).toBeNull();
  });
  it('a server that leaves 0 kg out: the record of the period says it does not count, and never measures a change (#367)', async () => {
    mockBodyWeights = [{ date: '2026-10-04', weightKg: 80.5 }, { date: '2026-10-02', weightKg: 0 }, { date: '2026-10-01', weightKg: 81 }];
    const view = wrap(<BodyTrendsScreen />); await flush();
    expect(within(view.getByTestId('body-trend-zero')).getByText(/El pesaje del 2 oct está en 0 kg: no es un peso, así que no cuenta en el gráfico ni en el cambio/)).toBeTruthy();
    const records = within(view.getByTestId('body-trend-records'));
    expect(records.getByLabelText('Peso del 2 oct 2026: 0 kg. No cuenta: no es un peso')).toBeTruthy();
    // 80,5 against 81, never against the 0 kg in between.
    expect(records.getByText('No cuenta: no es un peso')).toBeTruthy();
    expect(records.getByText('↘ 0,5 kg')).toBeTruthy();
    expect(records.queryByText('↗ 80,5 kg')).toBeNull();
  });
  it('keeps the comparison chosen on the hub', async () => {
    const view = wrap(<BodyTrendsScreen />, comparing); await flush();
    expect(mockBody).toHaveBeenLastCalledWith(mockClient, MONTH, { start: '2026-09-01', end: '2026-09-05' });
    const reference = within(view.getByTestId('body-reference-summary'));
    expect(reference.getByText('Comparación · 1–5 sep')).toBeTruthy(); expect(reference.getByText('Sin cambio medible')).toBeTruthy();
    expect(reference.getByText(/^1 registro en la referencia\./)).toBeTruthy();
  });
  it('P1-B3: figures stack by measured width, stay whole and are spoken in words', async () => {
    const dims = jest.spyOn(rnActual, 'useWindowDimensions').mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
    const view = wrap(<BodyTrendsScreen />); await flush();
    const figures = () => StyleSheet.flatten(view.getByTestId('body-trend-figures').props.style).flexDirection;
    fireEvent(view.getByTestId('body-trend-summary'), 'layout', { nativeEvent: { layout: { width: 358, height: 400, x: 0, y: 0 } } });
    expect(figures()).toBe('row');
    const summary = within(view.getByTestId('body-trend-summary'));
    expect(summary.getByLabelText('Último registro: 80,5 kg, 1 oct')).toBeTruthy();
    expect(summary.getByLabelText('Cambio en octubre: bajó 1,5 kg, desde 82 kg el 10 sep')).toBeTruthy();
    const value = summary.getByText('80,5 kg');
    expect(value.props.numberOfLines).toBeUndefined(); expect(value.props.adjustsFontSizeToFit).not.toBe(true);
    const long = body(); const weight = long.metrics[0];
    weight.last = { ...weight.last!, value: 111.8 }; weight.observations = weight.observations.map(o => o.date === weight.last!.date ? { ...o, value: 111.8 } : o); weight.change = -12.2;
    mockBody.mockResolvedValue(ok(long)); act(() => view.UNSAFE_getByType(RefreshControl).props.onRefresh()); await flush();
    fireEvent(view.getByTestId('body-trend-summary'), 'layout', { nativeEvent: { layout: { width: 288, height: 400, x: 0, y: 0 } } });
    expect(figures()).toBe('column'); expect(within(view.getByTestId('body-trend-summary')).getByText('↘ 12,2 kg')).toBeTruthy();
    dims.mockRestore();
  });
  it('P1-C1: a portada point selects the same weighing (last of its interval, same value); otherwise nothing and says so', async () => {
    mockParams = { point: '2026-09-14~2026-09-20', pointValue: '81', pointText: '14–20 sep 2026: 81 kg' };
    const view = wrap(<BodyTrendsScreen />); await flush();
    expect(view.getByTestId('body-trend-chart-2026-09-20-mark').props.accessibilityState).toEqual({ selected: true });
    expect(within(view.getByTestId('body-point-inspection')).getByText('Ver registro original')).toBeTruthy();
    expect(view.getByTestId('portada-point-note').props.accessibilityLabel).toMatch(/Seleccionado en el gráfico/);
    fireEvent.press(view.getByTestId('body-trend-chart-2026-09-10-mark'));
    expect(view.queryByTestId('portada-point-note')).toBeNull();
    view.unmount();
    mockParams = { point: '2026-09-14~2026-09-20', pointValue: '80', pointText: '14–20 sep 2026: 80 kg' };
    const other = wrap(<BodyTrendsScreen />); await flush();
    expect(other.getByTestId('body-trend-chart-2026-09-20-mark').props.accessibilityState).toEqual({ selected: false });
    expect(other.queryByText('Ver registro original')).toBeNull();
    expect(other.getByTestId('portada-point-note').props.accessibilityLabel).toMatch(/no seleccionamos otro en su lugar/);
  });
});

describe('Metrics Trends', () => {
  it('opened from Insights: the chosen metric, the month of that day before the first read, and a way back', async () => {
    mockParams = { metric: ids.steps, from: '2026-09-01', to: '2026-09-30', insightsReturn: '1', insightsFamily: 'metric', insightsDate: '2026-09-15' };
    const view = wrap(<MetricsTrendsScreen />); await flush();
    expect(mockMetrics.mock.calls.every(call => call[2] === ids.steps)).toBe(true);
    expect(mockMetrics.mock.calls.length).toBeGreaterThan(0);
    for (const call of mockMetrics.mock.calls) expect(JSON.stringify(call[1])).toContain('2026-09');
    fireEvent.press(view.getByRole('button', { name: 'Volver a Insights' }));
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/(tabs)/train/insights', params: { family: 'metric', date: '2026-09-15' } });
  });
  it('shows no way back unless it came from Insights, and a new link chooses its metric on a mounted route', async () => {
    mockParams = { metric: ids.steps };
    const view = wrap(<MetricsTrendsScreen />); await flush();
    expect(view.queryByRole('button', { name: 'Volver a Insights' })).toBeNull();
    mockParams = { metric: 'otra-metrica' };
    view.rerender(wrapped(<MetricsTrendsScreen />)); await flush();
    expect(mockMetrics.mock.calls.at(-1)![2]).toBe('otra-metrica');
  });
  it('one metric at a time: average, target, coverage and inspectable zero vs gaps without navigation', async () => {
    mockParams = { metric: ids.steps };
    const view = wrap(<MetricsTrendsScreen />); await flush();
    expect(mockMetrics).toHaveBeenLastCalledWith(mockClient, MONTH, ids.steps, null);
    const summary = within(view.getByTestId('metric-trend-summary'));
    expect(summary.getByText('0 pasos')).toBeTruthy();
    expect(summary.getByText('promedio por día con dato')).toBeTruthy(); expect(summary.getByText('objetivo actual 10.000 pasos')).toBeTruthy();
    expect(summary.getByText('2 de 6')).toBeTruthy(); expect(summary.getByText('días con dato · pocos para un promedio')).toBeTruthy();
    expect(view.queryByTestId('metric-trend-comparison')).toBeNull();
    expect(view.getAllByTestId(/^metric-trend-chart-.*-gap$/)).toHaveLength(4);
    expect(view.getAllByTestId(/^metric-trend-chart-.*-zero$/)).toHaveLength(2);
    fireEvent.press(view.getByRole('button', { name: '29 sep, 29/09/2026, 0 pasos' }));
    expect(view.getByTestId('metric-trend-readout').props.accessibilityLabel).toBe('29/09/2026, 0 pasos');
    expect(mockPush).not.toHaveBeenCalled();
    // The legend says the target is the current one, and names the gaps the chart has.
    const legend = within(view.getByTestId('metric-trend-legend'));
    expect(legend.getByText('objetivo actual 10.000 pasos')).toBeTruthy(); expect(legend.getByText('hueco: sin dato')).toBeTruthy();
    expect(within(view.getByTestId('metric-trend-stats')).getByText('Mediana')).toBeTruthy();
    fireEvent.press(view.getByRole('radio', { name: 'Sueño' })); await flush();
    expect(view.getByTestId('metric-trend-readout').props.accessibilityLabel).toMatch(/^Tocá una barra,/);
    expect(mockMetrics).toHaveBeenLastCalledWith(mockClient, MONTH, ids.sleep, null);
    expect(within(view.getByTestId('metric-trend-summary')).getByText('7 h 30 min')).toBeTruthy();
    // Archived metrics wait behind one chip.
    expect(view.queryByRole('radio', { name: 'Mate viejo, archivada' })).toBeNull();
    fireEvent.press(view.getByTestId('metric-archived-toggle'));
    expect(view.getByRole('radio', { name: 'Mate viejo, archivada' })).toBeTruthy();
    // Progreso › Métricas is for looking; loading or correcting lives in Inicio and Nutrición.
    expect(view.queryByText('Cargar o corregir')).toBeNull();
  });
  it('compares with the chosen range when Comparar is on', async () => {
    mockParams = { metric: ids.steps };
    const view = wrap(<MetricsTrendsScreen />, comparing); await flush();
    expect(within(view.getByTestId('metric-trend-summary')).getByText('1–5 sep 0 pasos · sin cambio')).toBeTruthy();
    expect(view.getByText('1–5 sep 3 de 7')).toBeTruthy();
  });
  it('retains confirmed inspection through a failed refresh, but clears it when changing period', async () => {
    mockParams = { metric: ids.steps };
    const view = wrap(<MetricsTrendsScreen />); await flush();
    const select = () => fireEvent.press(view.getByTestId('metric-trend-chart-2026-09-29-zero'));
    const readout = () => view.getByTestId('metric-trend-readout').props.accessibilityLabel;
    select(); expect(readout()).toBe('29/09/2026, 0 pasos');
    let settle!: (result: unknown) => void;
    mockMetrics.mockImplementationOnce(() => new Promise(resolve => { settle = resolve; }));
    act(() => { view.UNSAFE_getByType(RefreshControl).props.onRefresh?.(); });
    expect(readout()).toBe('29/09/2026, 0 pasos');
    await act(async () => { settle(lost); }); await flush();
    expect(readout()).toBe('29/09/2026, 0 pasos');
    fireEvent(view.getByTestId('progress-period-caption'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } }); await flush();
    expect(readout()).toMatch(/^Tocá una barra,/);
    expect(mockPush).not.toHaveBeenCalled();
  });
  it('opens the exact day only on the explicit action and keeps A/B and selection on native return', async () => {
    mockParams = { metric: ids.steps };
    const view = wrap(<><MetricsTrendsScreen /><ReturnToMetricChart /></>, comparing); await flush();
    const calls = mockMetrics.mock.calls.length;
    fireEvent.press(view.getByTestId('metric-trend-chart-2026-09-29-zero'));
    expect(mockMetrics).toHaveBeenCalledTimes(calls); expect(mockPush).not.toHaveBeenCalled();
    fireEvent.press(view.getByRole('button', { name: 'Abrir registro diario original' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/metrics', params: {
      date: '2026-09-29', fromMetricsChart: '1', metricsChartMetric: ids.steps,
    } });
    mockParams = { metric: ids.steps, fromMetricsChart: '1', metricsChartMetric: ids.steps };
    view.rerender(wrapped(<><MetricsTrendsScreen /><ReturnToMetricChart /></>, comparing)); await flush();
    fireEvent.press(view.getByRole('button', { name: 'Volver al gráfico de la métrica' }));
    expect(mockBack).toHaveBeenCalledTimes(1); expect(mockReplace).not.toHaveBeenCalled();
    expect(view.getByTestId('metric-trend-readout').props.accessibilityLabel).toBe('29/09/2026, 0 pasos');
    expect(mockMetrics).toHaveBeenCalledTimes(calls);
    expect(mockMetrics.mock.calls.at(-1)).toEqual([mockClient, MONTH, ids.steps, { start: '2026-09-01', end: '2026-09-05' }]);
  });
  it('reconciles an edited/deleted point from the existing invalidation without losing a valid selection', async () => {
    mockParams = { metric: ids.steps };
    const view = wrap(<MetricsTrendsScreen />); await flush();
    fireEvent.press(view.getByTestId('metric-trend-chart-2026-09-29-zero'));
    const latest = metrics(ids.steps); latest.series[0] = { ...latest.series[0], value: 150, samples: 1 };
    mockMetrics.mockResolvedValueOnce(ok(latest));
    invalidateConfirmedReads(mockClient, '/api/mobile/v1/nutrition/days/2026-09-29/metrics'); await flush();
    expect(view.getByTestId('metric-trend-readout').props.accessibilityLabel).toBe('29/09/2026, 150 pasos');
    mockMetrics.mockResolvedValueOnce(ok({ ...latest, series: latest.series.map((p, i) => i === 0 ? { ...p, value: null, samples: 0 } : p) }));
    invalidateConfirmedReads(mockClient, '/api/mobile/v1/nutrition/days/2026-09-29/metrics'); await flush();
    expect(view.getByTestId('metric-trend-readout').props.accessibilityLabel).toBe('29/09/2026, Sin dato');
    expect(view.getByRole('button', { name: 'Abrir registro diario original' })).toBeTruthy();
    mockMetrics.mockResolvedValueOnce(ok({ ...latest, series: latest.series.slice(1) }));
    invalidateConfirmedReads(mockClient, '/api/mobile/v1/nutrition/days/2026-09-29/metrics'); await flush();
    expect(view.queryByTestId('metric-trend-original')).toBeNull();
  });
  it('drops selected semantics when a definition changes, and never reuses them in another account', async () => {
    mockParams = { metric: ids.steps };
    const view = wrap(<MetricsTrendsScreen />); await flush();
    fireEvent.press(view.getByTestId('metric-trend-chart-2026-09-29-zero'));
    const latest = metrics(ids.steps); latest.metric = { ...latest.metric!, name: 'Duración nueva', valueType: 'duration', unit: 'min' };
    mockMetrics.mockResolvedValueOnce(ok(latest));
    invalidateConfirmedReads(mockClient, '/api/mobile/v1/metrics/definitions'); await flush();
    expect(view.queryByTestId('metric-trend-original')).toBeNull();
    fireEvent.press(view.getByTestId('metric-trend-chart-2026-09-29-zero'));
    expect(view.getByTestId('metric-trend-readout').props.accessibilityLabel).toContain('0 h 0 min');
    mockActiveClient = null; mockOwner = 'anonymous';
    view.rerender(wrapped(<MetricsTrendsScreen />)); await flush();
    expect(view.queryByTestId('metric-trend-original')).toBeNull();
    mockActiveClient = { request: jest.fn(), read: jest.fn() } as unknown as MobileApiClient; mockOwner = 'other';
    view.rerender(wrapped(<MetricsTrendsScreen />)); await flush();
    expect(view.queryByTestId('metric-trend-original')).toBeNull();
    expect(mockMetrics.mock.calls.at(-1)![0]).toBe(mockActiveClient);
  });
  it('keeps archived definitions available, respects their units, and names the real A/B insufficiency', async () => {
    mockParams = { metric: ids.custom };
    mockMetrics.mockImplementation(async (_c, _q, id) => {
      const data = metrics(id); data.comparison = cmp({ status: 'insufficient_data', reason: 'insufficient_current_samples', deltaAbsolute: null, deltaPercent: null, change: 'insufficient_data' });
      return ok(data);
    });
    const view = wrap(<MetricsTrendsScreen />, comparing); await flush();
    expect(view.getByRole('radio', { name: 'Mate viejo, archivada' }).props.accessibilityState.selected).toBe(true);
    expect(view.getByTestId('metric-trend-comparison-reason')).toBeTruthy();
    fireEvent.press(view.getByTestId('metric-trend-chart-2026-09-29-zero'));
    expect(view.getByTestId('metric-trend-readout').props.accessibilityLabel).toBe('29/09/2026, 0 L');
    fireEvent.press(view.getByRole('button', { name: 'Abrir registro diario original' }));
    expect(mockPush.mock.calls.at(-1)![0]).toMatchObject({ params: { metricsChartMetric: ids.custom } });
  });

  it('reading budget: selecting and clearing points adds no requests to the one grouped trend read', async () => {
    mockParams = { metric: ids.steps };
    const view = wrap(<MetricsTrendsScreen />); await flush();
    expect(mockMetrics).toHaveBeenCalledTimes(1);
    fireEvent.press(view.getByTestId('metric-trend-chart-2026-09-29-zero'));
    fireEvent.press(view.getByTestId('metric-trend-chart-2026-09-30-gap'));
    fireEvent.press(view.getByTestId('metric-trend-chart-2026-09-30-gap'));
    expect(mockMetrics).toHaveBeenCalledTimes(1);
    expect(mockOverview).not.toHaveBeenCalled(); expect(mockPush).not.toHaveBeenCalled();
    console.info('METRICS_READ_BUDGET', JSON.stringify({ surface: 'trend', initialGroupedReads: 1, additionalReadsForThreeTaps: mockMetrics.mock.calls.length - 1 }));
  });

  it('P1-B3: 44 pt chip targets, an archived disclosure button and stats that stack by measured width', async () => {
    const dims = jest.spyOn(rnActual, 'useWindowDimensions').mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
    const view = wrap(<MetricsTrendsScreen />); await flush();
    const chip = view.getByRole('radio', { name: 'Pasos' });
    expect(StyleSheet.flatten(chip.props.style).minHeight).toBeGreaterThanOrEqual(44);
    const toggle = view.getByTestId('metric-archived-toggle');
    expect(toggle.props.accessibilityRole).toBe('button'); expect(toggle.props.accessibilityState).toEqual({ expanded: false });
    fireEvent.press(toggle); expect(view.getByTestId('metric-archived-toggle').props.accessibilityState).toEqual({ expanded: true });
    const stats = () => StyleSheet.flatten(view.getByTestId('metric-trend-stats').props.style).flexDirection;
    fireEvent(view.getByTestId('metric-trend-summary'), 'layout', { nativeEvent: { layout: { width: 398, height: 200, x: 0, y: 0 } } });
    expect(stats()).toBe('row');
    fireEvent(view.getByTestId('metric-trend-summary'), 'layout', { nativeEvent: { layout: { width: 200, height: 200, x: 0, y: 0 } } });
    expect(stats()).toBe('column'); expect(mockMetrics).toHaveBeenCalledTimes(1);
    dims.mockRestore();
  });
});

describe('Nutrition Reports route', () => {
  it('reuses the Reports component with the period chosen in Progress', async () => {
    mockParams = { period: '30' };
    mockReport.mockResolvedValue(lost);
    const view = wrap(<NutritionReportsRoute />); await flush();
    expect(mockReport).toHaveBeenLastCalledWith(mockClient, { period: '30' });
    expect(view.getByTestId('nutrition-report-screen')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Cerrar reporte' })).toBeNull();
  });
});
