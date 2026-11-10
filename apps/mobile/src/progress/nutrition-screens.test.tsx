import { act, fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Dimensions, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { parseNutritionReport, type ReportQuery } from '@/api/nutrition-report';
import { parseProgressNutritionTiming, type ProgressNutritionTiming } from '@/api/progress';
import { reportFixture } from '@/nutrition/report-fixture.test-helper';
import { ProgressRangeProvider } from './progress-range-context';
import type { DateRange, ProgressRangeState } from './progress-range';
import { clearConfirmedReads, invalidateConfirmedReads } from '@/api/confirmed-read-cache';
import { NutritionTrendsScreen } from './nutrition-trends-screen';
import { ReturnToNutritionChart } from './nutrition-chart-navigation';
import { MealTimesScreen } from './meal-times-screen';

const TODAY = '2026-10-04',
  mockClient = {},
  mockPush = jest.fn(), mockNavigate = jest.fn();
let mockActiveClient: object | null = mockClient;
let mockParams: Record<string, string> = {};
const mockReport = jest.fn<(client: unknown, q: ReportQuery) => Promise<unknown>>();
const mockTiming = jest.fn<(client: unknown, q: ReportQuery, compare: DateRange | null) => Promise<unknown>>();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate }),
  useFocusEffect: (callback: () => void | (() => void)) => jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockActiveClient }) }));
jest.mock('@/api/nutrition-report', () => ({
  ...jest.requireActual<typeof import('@/api/nutrition-report')>('@/api/nutrition-report'),
  fetchNutritionReport: (c: unknown, q: ReportQuery) => mockReport(c, q),
}));
jest.mock('@/api/progress', () => ({
  ...jest.requireActual<typeof import('@/api/progress')>('@/api/progress'),
  fetchProgressNutritionTiming: (c: unknown, q: ReportQuery, _s: unknown, compare: DateRange | null = null) =>
    mockTiming(c, q, compare),
}));
const rn = jest.requireActual<typeof import('react-native')>('react-native');
const ok = <T,>(data: T) => ({
  status: 'ok' as const,
  data,
  meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' as const },
});
const failure = {
  status: 'unavailable',
  reason: 'network',
  meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' },
};
const query = { period: 'custom' as const, from: '2026-10-01', to: TODAY };
const comparing: ProgressRangeState = { unit: 'month', anchor: TODAY, custom: null, compare: { kind: 'previous' } };
function report(q: ReportQuery = query) {
  const r = reportFixture(q),
    previous = q.from?.startsWith('2026-09');
  r.summary.metrics.calories = {
    value: previous ? 2195 : 2556,
    denominator: r.coverage.completedRegisteredDays,
    partialDays: 0,
  };
  r.summary.metrics.protein = {
    value: previous ? 144 : 156,
    denominator: r.coverage.completedRegisteredDays,
    partialDays: 0,
  };
  if (!previous)
    r.days = r.days.map((d) =>
      d.date === '2026-10-02'
        ? {
            ...d,
            hasNutrition: false,
            mealCount: 0,
            nutrients: Object.fromEntries(
              Object.keys(d.nutrients).map((k) => [k, { value: null, knownMeals: 0, missingMeals: 0, status: 'none' }]),
            ) as typeof d.nutrients,
          }
        : d,
    );
  return r;
}
function timing(q: ReportQuery = query, compare: DateRange | null = null): ProgressNutritionTiming {
  const t = {
    meals: 92,
    mealsWithTime: 86,
    kcal: 10000,
    proteinG: 1000,
    bands: (['morning', 'midday', 'afternoon', 'night'] as const).map((key, i) => ({
      key,
      kcal: [2200, 1200, 2500, 4100][i],
      proteinG: [300, 210, 310, 180][i],
      kcalShare: [0.22, 0.12, 0.25, 0.41][i],
      proteinShare: [0.3, 0.21, 0.31, 0.18][i],
    })),
  };
  return {
    today: TODAY,
    period: {
      preset: q.period,
      start: q.from ?? '2026-10-01',
      end: q.to ?? TODAY,
      days: Math.round((Date.parse(q.to ?? TODAY) - Date.parse(q.from ?? '2026-10-01')) / 86400000) + 1,
      previousStart: compare?.start ?? '2026-09-27',
      previousEnd: compare?.end ?? '2026-09-30',
      bucket: 'day',
      includesToday: q.to === TODAY,
    },
    current: t,
    reference: compare ? t : null,
  };
}
const tree = (el: React.ReactElement, initialState?: ProgressRangeState) => (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 47, left: 0, right: 0, bottom: 34 },
    }}
  >
    <OwnlevelThemeProvider initialMode="light">
      <ProgressRangeProvider initialToday={TODAY} initialState={initialState}>
        {el}
      </ProgressRangeProvider>
    </OwnlevelThemeProvider>
  </SafeAreaProvider>
);
const wrap = (el: React.ReactElement, initialState?: ProgressRangeState) => render(tree(el, initialState));
const flush = () =>
  act(async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
beforeEach(() => {
  mockActiveClient = mockClient;
  clearConfirmedReads(mockClient as never);
  jest.clearAllMocks(); mockReport.mockReset(); mockTiming.mockReset();
  mockParams = {};
  mockReport.mockImplementation(async (_c, q) => ok(report(q)));
  mockTiming.mockImplementation(async (_c, q, compare) => ok(timing(q, compare)));
});

describe('Progress Nutrition', () => {
  it('keeps the «Cuándo comés» row height while consulting, with a result and on failure (#310)', async () => {
    let finish!: (value: unknown) => void;
    mockTiming.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = wrap(<NutritionTrendsScreen />);
    await flush(); // the report is on screen; the timing read is still running
    const subtitle = () => within(view.getByTestId('nutrition-timing-entry')).getAllByText(/./).at(-1)!;
    const reserved = (node: ReturnType<typeof subtitle>) => StyleSheet.flatten(node.props.style).minHeight;
    expect(subtitle().props.children).toBe('Consultando comidas con hora…');
    const loading = reserved(subtitle());
    expect(loading).toBe(2 * 18 * Dimensions.get('window').fontScale); // two footnote lines, scaled
    await act(async () => { finish(ok(timing())); });
    expect(subtitle().props.children).not.toBe('Consultando comidas con hora…');
    expect(reserved(subtitle())).toBe(loading);
  });
  it('shows the current report, real gaps, the preserved detail and navigation, without comparison', async () => {
    expect(parseNutritionReport(report())).toBeDefined();
    expect(parseProgressNutritionTiming(timing())).toBeDefined();
    const view = wrap(<NutritionTrendsScreen />);
    await flush();
    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockReport).toHaveBeenLastCalledWith(mockClient, query);
    expect(within(view.getByTestId('nutrition-progress-summary')).getByText('2.556')).toBeTruthy();
    expect(within(view.getByTestId('nutrition-progress-summary')).getByText('156 g')).toBeTruthy();
    // How many days the averages cover is said once, not under every number.
    expect(within(view.getByTestId('nutrition-progress-summary')).getAllByText(/^Promedio de \d+ días? con dato/)).toHaveLength(1);
    expect(view.queryByText(/gris =|Frente a/)).toBeNull();
    // The legend only names what the chart shows (here: a gap), once.
    expect(view.getByText(/Hueco: sin valor; línea en la base: cero registrado/)).toBeTruthy();
    expect(view.getByTestId('nutrition-chart-current-2026-10-02-gap')).toBeTruthy();
    expect(within(view.getByTestId('nutrition-progress-detail')).getByText('Carbos')).toBeTruthy();
    fireEvent.press(view.getByTestId('nutrition-chart-current-2026-10-01-bar'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(within(view.getByTestId('nutrition-chart-inspection')).getByText('100 kcal')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Abrir día y comidas originales' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/nutrition', params: { date: '2026-10-01', fromProgressNutrition: '1' } });
    fireEvent.press(view.getByTestId('nutrition-timing-entry'));
    expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/progress/trends/meal-times');
    // Day by day opens a compact table; a day without meals says so, never 0 kcal.
    fireEvent.press(within(view.getByTestId('nutrition-progress-daily')).getByRole('button', { name: /Día por día/ }));
    expect(view.getAllByText('sin registro').length).toBeGreaterThan(0);
  });
  it('keeps a shorter reference on its own calendar without padding or pairing positions', async () => {
    const initial: ProgressRangeState = {
      ...comparing,
      compare: { kind: 'custom', range: { start: '2026-09-01', end: '2026-09-02' } },
    };
    mockReport.mockImplementation(async (_c, q) => {
      const r = report(q); r.summary.metrics.protein = { ...r.summary.metrics.protein, value: q.from?.startsWith('2026-09') ? 156.43 : 156.85 }; return ok(r);
    });
    const view = wrap(<NutritionTrendsScreen />, initial);
    await flush();
    expect(mockReport).toHaveBeenCalledWith(mockClient, { period: 'custom', from: '2026-09-01', to: '2026-09-02' });
    expect(view.getByTestId('nutrition-progress-versus', { includeHiddenElements: true }).props.children.join('')).toBe('1–2 sep: 2.195 kcal (↗ 361 kcal) · 156 g (↗ 1 g)');
    expect(view.getByTestId('nutrition-progress-calories').props.accessibilityLabel).toMatch(/^Calorías: 2.556 kcal por día\. .*1–2 sep: 2.195 kcal, diferencia \+361 kcal$/);
    expect(view.getByTestId('nutrition-progress-protein').props.accessibilityLabel).toMatch(/1–2 sep: 156 g, diferencia \+1 g$/);
    expect(view.getByText('Referencia 1–2 sep · Promedio de 1 día con dato')).toBeTruthy();
    expect(view.getByText(/sin emparejar posiciones/)).toBeTruthy();
    fireEvent.press(view.getByRole('radio', { name: 'Comparación' }));
    expect(view.queryByTestId('nutrition-chart-reference-2-gap')).toBeNull();
    expect(within(view.getByTestId('nutrition-chart-series-reference')).getAllByRole('button')).toHaveLength(2);
    expect(view.getByTestId('nutrition-chart-reference-2026-09-01-bar')).toBeTruthy();
  });
  it('keeps A visible when B fails, and never presents a failed A as empty', async () => {
    mockReport.mockImplementation(async (_c, q) => (q.from?.startsWith('2026-09') ? failure : ok(report(q))));
    const view = wrap(<NutritionTrendsScreen />, comparing);
    await flush();
    expect(view.getByText('No pudimos cargar el período de comparación')).toBeTruthy();
    expect(view.getByTestId('nutrition-progress-summary')).toBeTruthy();
    fireEvent.press(view.getByRole('radio', { name: 'Comparación' }));
    expect(view.queryByTestId('nutrition-chart-series-reference')).toBeNull();
    expect(view.queryByRole('button', { name: 'Abrir día y comidas originales' })).toBeNull();
    mockReport.mockImplementation(async (_c, q) => ok(report(q)));
    fireEvent.press(view.getByRole('button', { name: 'Reintentar comparación' })); await flush();
    expect(view.getByTestId('nutrition-chart-reference-2026-09-01-bar')).toBeTruthy();
    view.unmount();
    // A new visit outside the reuse window (a retained reading would be shown, marked by its time).
    clearConfirmedReads(mockClient as never);
    mockReport.mockResolvedValue(failure);
    const failed = wrap(<NutritionTrendsScreen />);
    await flush();
    expect(failed.getByText('No pudimos cargar Nutrición')).toBeTruthy();
    expect(failed.queryByText(/No hay comidas/)).toBeNull();
  });
  it('retains the selected reference and A/B on return, with zero additional reads on inspection', async () => {
    const view = wrap(<><NutritionTrendsScreen /><ReturnToNutritionChart /></>, comparing); await flush();
    const initial = { reports: mockReport.mock.calls.length, timing: mockTiming.mock.calls.length };
    expect(initial).toEqual({ reports: 2, timing: 1 });
    fireEvent.press(view.getByRole('radio', { name: 'Comparación' }));
    fireEvent.press(view.getByTestId('nutrition-chart-reference-2026-09-01-bar'));
    expect(mockPush).not.toHaveBeenCalled();
    fireEvent.press(view.getByRole('button', { name: 'Abrir día y comidas originales' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/nutrition', params: { date: '2026-09-01', fromProgressNutrition: '1' } });
    mockParams = { fromProgressNutrition: '1' };
    view.rerender(tree(<><NutritionTrendsScreen /><ReturnToNutritionChart /></>, comparing)); await flush();
    fireEvent.press(view.getByRole('button', { name: 'Volver al gráfico de Nutrición' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/(tabs)/progress/trends/nutrition');
    expect(view.getByTestId('nutrition-chart-reference-2026-09-01-bar').props.accessibilityState.selected).toBe(true);
    expect(mockReport).toHaveBeenCalledWith(mockClient, { period: 'custom', from: '2026-09-01', to: '2026-09-04' });
    expect({ reports: mockReport.mock.calls.length, timing: mockTiming.mock.calls.length }).toEqual(initial);
    console.info('[QA nutrition chart source reads]', { initial, afterInspectionAndReturn: { reports: mockReport.mock.calls.length, timing: mockTiming.mock.calls.length } });
    fireEvent.press(view.getByTestId('progress-unit-week')); await flush();
    expect(view.queryByRole('button', { name: 'Abrir día y comidas originales' })).toBeNull();
  });
  it('manual refresh rereads both report scopes and retains the selected reference', async () => {
    const view = wrap(<NutritionTrendsScreen />, comparing); await flush();
    fireEvent.press(view.getByRole('radio', { name: 'Comparación' }));
    fireEvent.press(view.getByTestId('nutrition-chart-reference-2026-09-01-bar'));
    const initial = mockReport.mock.calls.length;
    act(() => view.UNSAFE_getByType(RefreshControl).props.onRefresh()); await flush();
    expect(mockReport.mock.calls.length).toBe(initial + 2);
    expect(view.getByTestId('nutrition-chart-reference-2026-09-01-bar').props.accessibilityState.selected).toBe(true);
  });
  it('uses confirmed invalidations after a meal edit/delete, retains an honest error state, and clears another account', async () => {
    const view = wrap(<NutritionTrendsScreen />); await flush();
    fireEvent.press(view.getByTestId('nutrition-chart-current-2026-10-01-bar'));
    const edited = report(); edited.days = edited.days.map(d => d.date === '2026-10-01' ? { ...d, nutrients: { ...d.nutrients, calories: { ...d.nutrients.calories, value: 250 } } } : d);
    let finish!: (value: unknown) => void;
    mockReport.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    act(() => invalidateConfirmedReads(mockClient as never, '/api/mobile/v1/nutrition/days/2026-10-01/meals/fake')); await flush();
    expect(view.getByText('Actualizando el período elegido; mostramos la última lectura confirmada.')).toBeTruthy();
    expect(within(view.getByTestId('nutrition-chart-inspection')).getByText('100 kcal')).toBeTruthy();
    await act(async () => finish(ok(edited))); await flush();
    expect(within(view.getByTestId('nutrition-chart-inspection')).getByText('250 kcal')).toBeTruthy();
    mockReport.mockImplementation(async (_c, q) => { const r = report(q); r.days = r.days.map(d => d.date === '2026-10-01' ? { ...d, mealCount: 0, hasNutrition: false, nutrients: { ...d.nutrients, calories: { value: null, knownMeals: 0, missingMeals: 0, status: 'none' } } } : d); return ok(r); });
    act(() => invalidateConfirmedReads(mockClient as never, '/api/mobile/v1/nutrition/days/2026-10-01/meals/fake')); await flush();
    expect(view.queryByText('250 kcal')).toBeNull();
    expect(view.getByText('Sin registros nutricionales; no equivale a cero.')).toBeTruthy();
    mockReport.mockResolvedValueOnce(failure);
    act(() => view.UNSAFE_getByType(RefreshControl).props.onRefresh()); await flush();
    expect(view.getByText('No se pudo actualizar. Mostramos la última lectura confirmada de este período.')).toBeTruthy();
    expect(view.getByText('Sin registros nutricionales; no equivale a cero.')).toBeTruthy();
    mockActiveClient = {}; mockReport.mockImplementation(async (_c, q) => ok(report(q)));
    view.rerender(tree(<NutritionTrendsScreen />)); await flush();
    expect(view.queryByRole('button', { name: 'Abrir día y comidas originales' })).toBeNull();
    expect(view.getByTestId('nutrition-chart-current-2026-10-01-bar').props.accessibilityState.selected).toBe(false);
    mockActiveClient = null; view.rerender(tree(<NutritionTrendsScreen />)); await flush();
    expect(view.queryByTestId('nutrition-chart-inspection')).toBeNull();
  });
  it('applies an incoming calendar range once, then allows normal period changes', async () => {
    mockParams = { from: '2026-09-28', to: TODAY };
    const view = wrap(<NutritionTrendsScreen />);
    await flush();
    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockReport).toHaveBeenLastCalledWith(mockClient, { period: 'custom', from: '2026-09-28', to: TODAY });
    expect(view.getByTestId('progress-unit-week').props.accessibilityState.selected).toBe(true);
    fireEvent.press(view.getByTestId('progress-unit-month'));
    await flush();
    expect(mockReport).toHaveBeenLastCalledWith(mockClient, { period: 'custom', from: '2026-10-01', to: TODAY });
    mockParams = { from: '2026-09-10', to: '2026-09-12' };
    view.rerender(tree(<NutritionTrendsScreen />));
    await flush();
    expect(mockReport).toHaveBeenLastCalledWith(mockClient, { period: 'custom', from: '2026-09-10', to: '2026-09-12' });
    const calls = mockReport.mock.calls.length;
    fireEvent.press(view.getByTestId('progress-unit-month'));
    await flush();
    // The month read a moment ago is reused (same account, day and range), not requested again.
    expect(mockReport).toHaveBeenCalledTimes(calls);
    expect(view.getByTestId('progress-unit-month').props.accessibilityState.selected).toBe(true);
  });
  it('P1-B3: an absent average reads as «sin dato», context lines span the width and figures stack with large text', async () => {
    const standard = jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
    mockReport.mockImplementation(async (_c, q) => { const r = report(q); r.summary.metrics.protein = { value: null, denominator: 0, partialDays: 0 }; return ok(r); });
    const view = wrap(<NutritionTrendsScreen />); await flush();
    expect(view.getByTestId('nutrition-progress-protein').props.accessibilityLabel).toMatch(/^Proteína: sin dato/);
    expect(within(view.getByTestId('nutrition-progress-protein')).getByText('—')).toBeTruthy();
    const figures = () => StyleSheet.flatten(view.getByTestId('nutrition-progress-figures').props.style).flexDirection;
    fireEvent(view.getByTestId('nutrition-progress-summary'), 'layout', { nativeEvent: { layout: { width: 288, height: 300, x: 0, y: 0 } } });
    expect(figures()).toBe('row');
    view.unmount(); standard.mockRestore();
    const spy = jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1.5 });
    try {
      const large = wrap(<NutritionTrendsScreen />); await flush();
      expect(StyleSheet.flatten(large.getByTestId('nutrition-progress-figures').props.style).flexDirection).toBe('column');
      const value = within(large.getByTestId('nutrition-progress-calories')).getByText('2.556');
      expect(value.props.numberOfLines).toBeUndefined(); expect(value.props.adjustsFontSizeToFit).not.toBe(true);
    } finally { spy.mockRestore(); }
  });
  it('P1-C1: a portada point (average of complete days) never selects a daily bar; it says where the reader came from', async () => {
    mockParams = { point: '2026-10-01~2026-10-02', pointValue: '2000', pointText: '1–2 oct 2026: 2.000 kcal' };
    const view = wrap(<NutritionTrendsScreen />); await flush();
    expect(view.getByTestId('portada-point-note').props.accessibilityLabel).toBe('Desde la portada: 1–2 oct 2026: 2.000 kcal. La portada promedia los días completos de ese intervalo y este gráfico muestra cada día: no hay un dato equivalente para seleccionar.');
    expect(view.queryByText('Abrir día y comidas originales')).toBeNull();
    fireEvent.press(view.getByTestId('nutrition-chart-current-2026-10-01-bar'));
    expect(view.queryByTestId('portada-point-note')).toBeNull(); expect(view.getByText('Abrir día y comidas originales')).toBeTruthy();
    expect(mockReport).toHaveBeenCalledTimes(1);
  });
});

describe('Cuándo comés', () => {
  it('describes the most/least caloric bands, shares and timed coverage, with optional reference lines', async () => {
    const view = wrap(<MealTimesScreen />, comparing);
    await flush();
    expect(view.getByText('De 20 a 5 h comés el 41 % de tus calorías y el 18 % de tu proteína.')).toBeTruthy();
    expect(view.getByText('Al mediodía, el 12 % de tus calorías.')).toBeTruthy();
    expect(view.getByText('86 de 92 comidas con hora · hora de Córdoba')).toBeTruthy();
    expect(view.getAllByText(/1–4 sep: /)).toHaveLength(4);
    expect(view.getByTestId('timing-night')).toBeTruthy();
  });
  it('hides all percentages below ten timed meals; unavailable never becomes a few-data state', async () => {
    const t = timing();
    t.current = { ...t.current, mealsWithTime: 9 };
    mockTiming.mockResolvedValue(ok(t));
    const view = wrap(<MealTimesScreen />);
    await flush();
    expect(view.getByText('Todavía hay pocas comidas con hora para ver un patrón (9).')).toBeTruthy();
    expect(view.queryByTestId('timing-bands')).toBeNull();
    expect(view.queryAllByText(/%/)).toHaveLength(0);
    view.unmount();
    clearConfirmedReads(mockClient as never); // a later visit, outside the reuse window
    mockTiming.mockResolvedValue(failure);
    const failed = wrap(<MealTimesScreen />);
    await flush();
    expect(failed.getByText('No pudimos cargar cuándo comés')).toBeTruthy();
    expect(failed.queryByText(/Todavía hay pocas/)).toBeNull();
  });
});
