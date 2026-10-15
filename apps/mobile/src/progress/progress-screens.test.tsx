import { act, fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { parseProgressBody, parseProgressMetrics, parseProgressOverview, type ProgressBody, type ProgressComparison, type ProgressMetrics, type ProgressOverview, type ProgressQuery } from '@/api/progress';
import { ProgressOverviewScreen } from './overview-screen';
import { BodyTrendsScreen } from './body-trends-screen';
import { MetricsTrendsScreen } from './metrics-trends-screen';
import { NutritionReportsRoute } from '@/nutrition/report-route';
import { ProgressRangeProvider } from './progress-range-context';
import type { DateRange, ProgressRangeState } from './progress-range';

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
const mockOverview = jest.fn<(c: unknown, q: ProgressQuery, compare: DateRange | null) => Promise<unknown>>();
const mockBody = jest.fn<(c: unknown, q: ProgressQuery, compare: DateRange | null) => Promise<unknown>>();
const mockMetrics = jest.fn<(c: unknown, q: ProgressQuery, id: string | null, compare: DateRange | null) => Promise<unknown>>();
const mockReport = jest.fn<(c: unknown, q: unknown) => Promise<unknown>>();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: () => undefined, useLocalSearchParams: () => mockParams, Stack: { Screen: () => null } }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn(), success: jest.fn(), warning: jest.fn() }, triggerHaptic: jest.fn() }));
const mockClient = { request: jest.fn(), read: jest.fn() };
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
jest.mock('@/api/progress', () => ({ ...jest.requireActual<object>('@/api/progress'),
  fetchProgressOverview: (c: unknown, q: ProgressQuery, _s: unknown, compare: DateRange | null) => mockOverview(c, q, compare),
  fetchProgressBody: (c: unknown, q: ProgressQuery, _s: unknown, compare: DateRange | null) => mockBody(c, q, compare),
  fetchProgressMetrics: (c: unknown, q: ProgressQuery, id: string | null, _s: unknown, compare: DateRange | null) => mockMetrics(c, q, id, compare) }));
jest.mock('@/api/nutrition-report', () => ({ ...jest.requireActual<object>('@/api/nutrition-report'), fetchNutritionReport: (c: unknown, q: unknown) => mockReport(c, q) }));

const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const ok = <T,>(data: T) => ({ status: 'ok' as const, data, meta });
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
const wrap = (el: React.ReactElement, initialState?: ProgressRangeState) => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
  <OwnlevelThemeProvider initialMode="light"><ProgressRangeProvider initialToday={TODAY} initialState={initialState}>{el}</ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>);

const listeners: ((s: string) => void)[] = [];
beforeEach(() => {
  jest.clearAllMocks(); mockParams = {}; listeners.length = 0;
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
  const row = (view: ReturnType<typeof wrap>, id: string) => view.getByTestId(`progress-area-${id}`).props.accessibilityLabel as string;
  it('"Tu octubre" without comparing: progress inside the period, mini charts with real gaps, no Explorar or Revisar datos', async () => {
    const view = wrap(<ProgressOverviewScreen />); await flush();
    expect(mockOverview).toHaveBeenLastCalledWith(mockClient, MONTH, null);
    expect(view.getByTestId('progress-period-stepper').props.accessibilityLabel).toBe('Octubre 2026, del 1 al 5 · en curso');
    expect(view.getByText('Tu octubre')).toBeTruthy();
    expect(row(view, 'body')).toBe('Peso. 82 → 80,5 kg · ↘ 1,5');
    expect(row(view, 'training')).toBe('Entrenamiento. 11 días · 180 series');
    expect(row(view, 'nutrition')).toBe('Nutrición. 2.200 kcal por día · objetivo 2.100 · 10 de 30 días');
    expect(row(view, 'metrics')).toBe('Métricas. Pasos 9.000 pasos · Sueño 7 h 30 min');
    // missing != zero: a bucket without data is a gap; zero sets is a real (faint) mark.
    expect(view.getByTestId('progress-spark-nutrition-current-2026-10-02-missing', { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByTestId('progress-spark-training-current-2026-10-02-zero', { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryByTestId(/progress-spark-training-reference/, { includeHiddenElements: true })).toBeNull();
    // Sin comparar: no comparison anywhere; findings that compare periods wait for "Comparar".
    expect(view.queryByText(/frente a/i)).toBeNull(); expect(view.queryByTestId('progress-compare-chip')).toBeNull();
    expect(view.getByText('Sin récords ni cambios destacados en este período.')).toBeTruthy();
    for (const gone of ['Explorar', 'Revisar datos']) expect(view.queryByText(gone)).toBeNull();
    fireEvent.press(view.getByTestId('progress-area-training'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/trends/training', params: {} });
  });
  it('records and in-period improvements show without comparison; period comparisons stay opt-in', async () => {
    mockOverview.mockImplementation(async () => ok(overview({ inPeriod: { improved: 3, comparable: 5 }, changes: [
      { id: 'pr', domain: 'training', label: 'Aductores', description: 'Nuevo mejor peso: 29 kg × 20', destination: { kind: 'training_exercise', exerciseId: 'e1' } },
      { id: 'activity:steps', domain: 'metrics', label: 'Pasos', description: 'Subió frente al período anterior.', destination: { kind: 'metrics', metricId: ids.steps } }] })));
    const view = wrap(<ProgressOverviewScreen />); await flush();
    const highlights = within(view.getByTestId('progress-highlights'));
    expect(highlights.getByText('Aductores')).toBeTruthy(); expect(highlights.queryByText('Pasos')).toBeNull();
    expect(highlights.queryByText('4 de 8 ejercicios mejoraron')).toBeNull();
    expect(highlights.getByText('3 ejercicios mejoraron')).toBeTruthy();
    fireEvent.press(highlights.getByRole('button', { name: '3 ejercicios mejoraron. Entre su primera y su última sesión del período' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/trends/training', params: {} });
    fireEvent.press(highlights.getByRole('button', { name: 'Aductores. Nuevo mejor peso: 29 kg × 20' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/trends/exercise/[id]', params: { id: 'e1' } });
  });
  it('with a comparison: B goes to the server, each row adds its value and a neutral arrow, grey bars appear, and the chip clears it', async () => {
    mockOverview.mockImplementation(async (_c, _q, compare) => ok(overview({ sparks: sparks(!!compare) })));
    const view = wrap(<ProgressOverviewScreen />, comparing); await flush();
    expect(mockOverview).toHaveBeenLastCalledWith(mockClient, MONTH, { start: '2026-09-01', end: '2026-09-05' });
    expect(within(view.getByTestId('progress-compare-chip')).getByText('vs. 1–5 sep')).toBeTruthy();
    expect(row(view, 'body')).toBe('Peso. 80,5 kg · 1–5 sep 83 · ↘ 2,5');
    expect(row(view, 'training')).toBe('Entrenamiento. 180 series · 1–5 sep 150 · ↗ 30');
    expect(row(view, 'nutrition')).toBe('Nutrición. 2.200 kcal · 1–5 sep 2.000 · ↗ 200 · 10 de 30 días');
    expect(row(view, 'metrics')).toBe('Métricas. Pasos 9.000 pasos · 1–5 sep 6.000 pasos');
    expect(view.getByTestId('progress-spark-training-reference-2026-09-01-mark', { includeHiddenElements: true })).toBeTruthy();
    const highlights = within(view.getByTestId('progress-highlights'));
    expect(highlights.getByText('Subió frente al período anterior.')).toBeTruthy();
    expect(highlights.getByText('4 de 8 ejercicios mejoraron')).toBeTruthy(); expect(highlights.getByText('Frente a 1–5 sep')).toBeTruthy();
    fireEvent.press(view.getByTestId('progress-compare-clear')); await flush();
    expect(mockOverview).toHaveBeenLastCalledWith(mockClient, MONTH, null);
    expect(view.queryByText(/1–5 sep/)).toBeNull();
    expect(row(view, 'training')).toBe('Entrenamiento. 11 días · 180 series');
  });
  it('the period bar and the stepper re-read; a late response for another period is never shown', async () => {
    let release!: (v: unknown) => void;
    mockOverview.mockImplementationOnce(() => new Promise(r => { release = r; }));
    const view = wrap(<ProgressOverviewScreen />); await flush();
    fireEvent.press(view.getByTestId('progress-unit-week')); await flush();
    expect(mockOverview).toHaveBeenLastCalledWith(mockClient, { period: 'custom', from: '2026-10-05', to: TODAY }, null);
    expect(view.getByText('Tu semana')).toBeTruthy();
    await act(async () => { release(ok(overview({ changes: [{ id: 'stale', domain: 'training', label: 'Viejo', description: 'x', destination: { kind: 'training' } }] }))); }); await flush();
    expect(view.queryByText('Viejo')).toBeNull();
    fireEvent.press(view.getByTestId('progress-unit-month')); await flush();
    fireEvent(view.getByTestId('progress-period-stepper'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } }); await flush();
    expect(mockOverview).toHaveBeenLastCalledWith(mockClient, { period: 'custom', from: '2026-09-01', to: '2026-09-30' }, null);
    expect(view.getByTestId('progress-period-stepper').props.accessibilityLabel).toBe('Septiembre 2026, 30 días');
    expect(view.getByText('Tu septiembre')).toBeTruthy();
    fireEvent.press(view.getByTestId('progress-unit-year')); await flush();
    expect(mockOverview).toHaveBeenLastCalledWith(mockClient, { period: 'custom', from: '2026-01-01', to: TODAY }, null);
    expect(view.getByText('Tu 2026')).toBeTruthy();
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
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/nutrition/reports', params: { period: 'custom', from: '2026-10-01', to: TODAY } });
  });
  it('a failed first read is an error state (not empty); foreground re-reads; a failed refresh keeps the confirmed read marked stale', async () => {
    mockOverview.mockResolvedValueOnce(lost);
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    const view = wrap(<ProgressOverviewScreen />); await flush();
    expect(view.getByText('No pudimos cargar tu progreso')).toBeTruthy();
    await act(async () => { listeners.at(-1)!('background'); listeners.at(-1)!('active'); }); await flush();
    expect(view.getByText('82 → 80,5 kg · ↘ 1,5')).toBeTruthy();
    mockOverview.mockResolvedValueOnce(lost);
    await act(async () => { listeners.at(-1)!('background'); listeners.at(-1)!('active'); }); await flush();
    expect(view.getByText('82 → 80,5 kg · ↘ 1,5')).toBeTruthy();
    expect(view.getByText('No se pudo actualizar. Mostramos la última lectura confirmada de este período.')).toBeTruthy();
  });
});

describe('Body Trends', () => {
  it('uses the shared period, shows real points (imported flagged), trend, and sparse metrics as insufficient', async () => {
    const view = wrap(<BodyTrendsScreen />); await flush();
    expect(mockBody).toHaveBeenLastCalledWith(mockClient, MONTH, null);
    const summary = within(view.getByTestId('body-trend-summary'));
    expect(summary.getByText('Cambio: −1,5 kg')).toBeTruthy(); expect(summary.getByText('Tendencia en bajada.')).toBeTruthy();
    expect(summary.queryByText(/datos insuficientes \(1 registro\)/)).toBeNull(); // only while comparing
    expect(within(view.getByTestId('body-trend-chart')).getByText('81 kg · Importado · sheet')).toBeTruthy();
    fireEvent.press(within(view.getByTestId('body-trend-chart')).getByRole('button', { name: /20 de septiembre de 2026: 81 kg/ }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/history/day/[date]', params: { date: '2026-09-20' } });
    fireEvent.press(view.getByRole('button', { name: 'Cintura' }));
    expect(view.getByText(/Datos insuficientes para una tendencia/)).toBeTruthy();
    expect(view.queryByText(/Cambio:/)).toBeNull();
    expect(view.getByText('1 medición sospechosa excluida del análisis. Podés corregirla en Cuerpo.')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Abrir Cuerpo' }));
    expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/progress/body');
  });
  it('keeps the comparison chosen on the hub', async () => {
    const view = wrap(<BodyTrendsScreen />, comparing); await flush();
    expect(mockBody).toHaveBeenLastCalledWith(mockClient, MONTH, { start: '2026-09-01', end: '2026-09-05' });
    expect(within(view.getByTestId('body-trend-summary')).getByText('1–5 sep: datos insuficientes (1 registro).')).toBeTruthy();
  });
});

describe('Metrics Trends', () => {
  it('selects a metric, labels the target as current, shows explicit zero, gaps and low coverage, and opens a day', async () => {
    mockParams = { metric: ids.steps };
    const view = wrap(<MetricsTrendsScreen />); await flush();
    expect(mockMetrics).toHaveBeenLastCalledWith(mockClient, MONTH, ids.steps, null);
    const summary = within(view.getByTestId('metric-trend-summary'));
    expect(summary.getByText('Promedio: 0 pasos')).toBeTruthy();
    expect(summary.getByText('Objetivo actual: 10.000 pasos (no hay objetivos históricos por período)')).toBeTruthy();
    expect(summary.getByText('2 de 6 días con dato · cobertura baja')).toBeTruthy();
    expect(view.queryByTestId('metric-trend-comparison')).toBeNull();
    const chart = within(view.getByTestId('metric-trend-chart'));
    expect(chart.getAllByText('Sin dato')).toHaveLength(4);
    fireEvent.press(chart.getByRole('button', { name: /29 de septiembre de 2026: 0 pasos/ }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/history/day/[date]', params: { date: '2026-09-29' } });
    fireEvent.press(view.getByRole('button', { name: 'Sueño' })); await flush();
    expect(mockMetrics).toHaveBeenLastCalledWith(mockClient, MONTH, ids.sleep, null);
    expect(within(view.getByTestId('metric-trend-summary')).getByText('Promedio: 7 h 30 min')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Mate viejo · archivada' })).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Abrir Métricas diarias' }));
    expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/progress/metrics');
  });
  it('compares with the chosen range when Comparar is on', async () => {
    mockParams = { metric: ids.steps };
    const view = wrap(<MetricsTrendsScreen />, comparing); await flush();
    expect(within(view.getByTestId('metric-trend-comparison')).getByText('Estable frente a 1–5 sep.')).toBeTruthy();
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
