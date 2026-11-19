import { act, fireEvent, render, within } from '@testing-library/react-native';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { Modal, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileApiClient } from '@/api/client';
import type { ProgressComparison } from '@/api/progress';
import { clearConfirmedReads } from '@/api/confirmed-read-cache';
import { PeriodComparisonScreen } from './comparison-screen';
import { comparisonGeometry } from './comparison-chart';
import { panoramaFixture, PANORAMA_TODAY } from './panorama-fixture.test-helper';
import { ProgressRangeProvider, useProgressRange } from './progress-range-context';
import { addDays } from './progress-range';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
const mockPush = jest.fn(), mockBack = jest.fn();
let mockFocused = true;
const mockLife = new Set<{focus: () => void; blur: () => void}>();
jest.mock('expo-router', () => ({ Stack: {Screen: () => null}, useRouter: () => ({push: mockPush, back: mockBack}),
  useFocusEffect: (cb: () => void | (() => void)) => { jest.requireActual<{useEffect: typeof useEffect}>('react').useEffect(() => {
    let release: void | (() => void);
    const life = {focus: () => {release = cb();}, blur: () => {release?.(); release = undefined;}};
    mockLife.add(life); if (mockFocused) life.focus();
    return () => {life.blur(); mockLife.delete(life);};
  }, [cb]);} }));
const read = jest.fn<MobileApiClient['read']>();
let mockClient = {read} as unknown as MobileApiClient;
jest.mock('@/api', () => ({useMobileApi: () => ({client: mockClient})}));
const cmp = (current: number, previous: number): ProgressComparison => ({status: 'comparable', reason: 'eligible', current, previous, deltaAbsolute: current - previous, deltaPercent: previous ? (current - previous) / previous * 100 : null, change: current > previous ? 'increased' : current < previous ? 'decreased' : 'stable'});
function fixture() {
  const data = panoramaFixture();
  if (data.training.status === 'ok') data.training.data.comparisons = {sessions: cmp(8, 6), sets: cmp(96, 80), minutes: cmp(400, 350), trainingDays: cmp(7, 6), setsPerSession: cmp(12, 13)};
  if (data.nutrition.status === 'ok') {data.nutrition.data.calories = cmp(2190, 2100); data.nutrition.data.protein = cmp(127, 120);}
  for (const key of ['training', 'weight', 'nutrition'] as const) {
    const spark = data.sparks![key]!;
    spark.reference = spark.current.map(p => ({...p, start: addDays(p.start, -30), end: addDays(p.end, -30)}));
  }
  data.sparks!.weight!.referenceLast = 80;
  data.metrics = {status: 'ok', data: {items: [{id: 'steps', name: 'Pasos', unit: 'pasos', valueType: 'integer', average: 8000, coverage: {registered: 10, eligible: 29, ratio: 10/29}, comparison: cmp(8000, 7000)},
    {id: 'sleep', name: 'Sueño', unit: 'min', valueType: 'duration', average: 400, coverage: {registered: 2, eligible: 29, ratio: 2/29}, comparison: { ...cmp(400, 0), status: 'insufficient_data', previous: null, deltaAbsolute: null, deltaPercent: null, reason: 'previous_period_empty', change: 'insufficient_data'}}]}};
  return data;
}
let payload = fixture(), range: ReturnType<typeof useProgressRange>;
function Observe() { const value = useProgressRange(); useEffect(() => { range = value; }, [value]); return null; }
const initial = {unit: 'custom' as const, anchor: PANORAMA_TODAY, custom: {start: '2026-10-11', end: PANORAMA_TODAY}, compare: {kind: 'previous' as const}};
const tree = () => <SafeAreaProvider initialMetrics={{frame: {x: 0,y: 0,width: 390,height: 844},insets: {top: 0,left: 0,right: 0,bottom: 0}}}><OwnlevelThemeProvider initialMode="dark"><ProgressRangeProvider initialState={initial} initialToday={PANORAMA_TODAY}><PeriodComparisonScreen /><Observe /></ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>;
beforeEach(() => {
  mockPush.mockReset(); mockBack.mockReset(); mockFocused = true; mockLife.clear(); read.mockReset(); mockClient = {read} as unknown as MobileApiClient; clearConfirmedReads(mockClient); payload = fixture();
  read.mockImplementation(async o => ({status: 'ok', data: o.parse(structuredClone(payload)), meta: {durationMs: 1, httpStatus: 200, outcome: 'ok'}}) as never);
});
it('one grouped read supplies the entire comparison; filtering and point inspection add no reads', async () => {
  const view = render(tree()); await view.findByTestId('period-comparison-content');
  expect(read).toHaveBeenCalledTimes(1);
  expect(read.mock.calls[0][0].path).toContain('compareFrom=2026-09-11&compareTo=2026-10-10');
  expect(view.queryByText('Mis vistas')).toBeNull(); expect(view.queryByText('Más para mirar')).toBeNull();
  fireEvent.press(view.getByRole('radio', {name: 'Nutrición'}));
  expect(view.queryByTestId('comparison-training')).toBeNull(); expect(view.getByTestId('comparison-nutrition')).toBeTruthy();
  const chart = within(view.getByTestId('comparison-nutrition-chart'));
  fireEvent.press(chart.getByTestId('comparison-nutrition-chart-current-2026-10-19-zero'));
  expect(chart.getByText('0 kcal')).toBeTruthy();
  fireEvent.press(chart.getByTestId('comparison-nutrition-chart-current-2026-10-26-missing'));
  expect(chart.getByText('Sin dato')).toBeTruthy();
  expect(read).toHaveBeenCalledTimes(1); expect(mockPush).not.toHaveBeenCalled();
});
it('detail navigation retains A/B, filter and inspected interval on return without re-reading', async () => {
  const view = render(tree()); await view.findByTestId('period-comparison-content');
  fireEvent.press(view.getByRole('radio', {name: 'Cuerpo'}));
  fireEvent.press(view.getByTestId('comparison-weight-chart-current-2026-11-02-mark'));
  fireEvent.press(view.getByRole('button', {name: 'Ver peso y medidas'}));
  expect(mockPush).toHaveBeenLastCalledWith({pathname: '/(tabs)/progress/trends/body', params: {}});
  const a = range.query, b = range.compare;
  const mainScroll = view.UNSAFE_getAllByType(ScrollView).find(s => s.props.contentOffset);
  fireEvent(mainScroll!, 'scrollEndDrag', { nativeEvent: { contentOffset: { x: 0, y: 420 } } });
  await act(async () => {mockFocused = false; [...mockLife].forEach(l => l.blur());});
  await act(async () => {mockFocused = true; [...mockLife].forEach(l => l.focus());});
  expect(view.getByRole('radio', {name: 'Cuerpo'}).props.accessibilityState.checked).toBe(true);
  expect(within(view.getByTestId('comparison-weight-chart')).getByText('79,8 kg')).toBeTruthy();
  expect([range.query, range.compare]).toEqual([a,b]); expect(read).toHaveBeenCalledTimes(1);
  expect(view.UNSAFE_getAllByType(ScrollView).find(s => s.props.contentOffset)?.props.contentOffset).toEqual({x: 0, y: 420});
});
it('failed refresh preserves the confirmed inspection; unavailability is never shown as zero', async () => {
  const view = render(tree()); await view.findByTestId('period-comparison-content');
  fireEvent.press(view.getByRole('radio', {name: 'Nutrición'}));
  fireEvent.press(view.getByTestId('comparison-nutrition-chart-current-2026-10-19-zero'));
  read.mockImplementationOnce(async () => ({status: 'unavailable', reason: 'network', meta: {durationMs: 1, httpStatus: null, outcome: 'unavailable'}}) as never);
  await act(async () => {view.UNSAFE_getByType(RefreshControl).props.onRefresh();});
  expect(view.getByText('No pudimos actualizar. Conservamos la última lectura confirmada de estos períodos.')).toBeTruthy();
  expect(within(view.getByTestId('comparison-nutrition-chart')).getByText('0 kcal')).toBeTruthy();
});
it('groups unavailable comparisons, exposes their existing detail, and uses no invented reference denominator', async () => {
  payload.body = {status: 'unavailable'};
  const view = render(tree()); await view.findByTestId('period-comparison-content');
  expect(within(view.getByTestId('comparison-body')).getByText('No pudimos leer Cuerpo.')).toBeTruthy();
  expect(view.queryByTestId('comparison-weight-chart')).toBeNull();
  fireEvent.press(view.getByTestId('comparison-missing-toggle'));
  expect(view.getByText('Cuerpo: lectura no disponible.')).toBeTruthy();
  expect(view.getByText('Sueño: Sin comparación: el período de comparación no tiene datos.')).toBeTruthy();
  fireEvent.press(view.getByRole('button', {name: 'Ver sueño'}));
  expect(mockPush).toHaveBeenLastCalledWith({pathname: '/(tabs)/progress/trends/metrics', params: {metric: 'sleep'}});
});
it('cancel editing preserves the reading; clearing comparison adds no unneeded overview read', async () => {
  const view = render(tree()); await view.findByTestId('period-comparison-content');
  const before = range.state;
  fireEvent.press(view.getByTestId('comparison-edit-dates'));
  fireEvent.press(view.getByRole('button', {name: 'Año pasado'}));
  fireEvent.press(view.getByRole('button', {name: 'Cerrar sin cambiar'}));
  fireEvent(view.UNSAFE_getByType(Modal), 'dismiss');
  expect(range.state).toBe(before); expect(read).toHaveBeenCalledTimes(1);
  fireEvent.press(view.getByRole('button', {name: 'Quitar comparación'}));
  expect(view.queryByTestId('period-comparison-content')).toBeNull();
  expect(view.getByRole('button', {name: 'Elegir períodos'})).toBeTruthy(); expect(read).toHaveBeenCalledTimes(1);
});
it('an account change clears the selected topic and inspected point', async () => {
  const view = render(tree()); await view.findByTestId('period-comparison-content');
  fireEvent.press(view.getByRole('radio', {name: 'Cuerpo'}));
  fireEvent.press(view.getByTestId('comparison-weight-chart-current-2026-11-02-mark'));
  mockClient = {read} as unknown as MobileApiClient;
  view.rerender(tree()); await act(async () => {});
  expect(view.getByRole('radio', {name: 'Resumen'}).props.accessibilityState.checked).toBe(true);
  expect(view.getByTestId('comparison-weight-chart-current-2026-11-02-mark').props.accessibilityState.selected).toBe(false);
});
it('chart geometry shares the value scale without converting nulls into zero or joining gaps', () => {
  const point = (value: number | null) => ({start: '2026-10-01', end: '2026-10-01', value});
  const spark = {current: [point(0),point(null),point(20)], reference: [point(10)]};
  const bars = comparisonGeometry(spark, 'bars'); expect([bars.low, bars.high, bars.position(10)]).toEqual([0,20,0.5]);
  const dots = comparisonGeometry({current: [point(70)],reference: [point(70)]}, 'dots'); expect(dots.position(70)).toBe(0.5);
});
it('inspected chart targets retain the minimum native touch width', async () => {
  const view = render(tree()); await view.findByTestId('period-comparison-content');
  expect(StyleSheet.flatten(view.getByTestId('comparison-training-chart-current-2026-10-11-zero').props.style).width).toBeGreaterThanOrEqual(44);
});
it('a limited comparator retains a known current value and scopes missing-data explanations to the selected topic', async () => {
  if (payload.nutrition.status === 'ok') payload.nutrition.data.calories = {...cmp(0,0), status: 'insufficient_data', reason: 'previous_period_empty', current: null, previous: null, deltaAbsolute: null, deltaPercent: null, change: 'insufficient_data'};
  const view = render(tree()); await view.findByTestId('period-comparison-content');
  fireEvent.press(view.getByRole('radio', {name: 'Nutrición'}));
  expect(within(view.getByTestId('comparison-nutrition')).getByText('2.190 kcal')).toBeTruthy();
  fireEvent.press(view.getByTestId('comparison-missing-toggle'));
  expect(view.getByText('Calorías: Sin comparación: el período de comparación no tiene datos.')).toBeTruthy();
  expect(view.queryByText('Sueño: Sin comparación: el período de comparación no tiene datos.')).toBeNull();
});
it('respects the server stability classification instead of deriving a new progress signal locally', async () => {
  if (payload.training.status === 'ok') payload.training.data.comparisons.sets.change = 'stable';
  const view = render(tree()); await view.findByTestId('period-comparison-content');
  expect(within(view.getByTestId('comparison-training')).getByText('Estable frente a la referencia')).toBeTruthy();
  expect(within(view.getByTestId('comparison-training')).queryByText('↗ 16 series')).toBeNull();
});
