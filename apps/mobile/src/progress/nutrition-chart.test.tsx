import { ChartBar } from './chart-marks';
import { pressFittedMark } from './fitted-chart.test-helper';
import { useState } from 'react';
import { act, fireEvent, render as renderNative, within } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider, radius } from '@/design-system';
import type { NutritionReport } from '@/api/nutrition-report';
import { reportFixture } from '@/nutrition/report-fixture.test-helper';
import { bucketNutritionChartDays } from '../../../../src/lib/nutrition/report-chart-core';
import { ProgressRangeProvider } from './progress-range-context';
import { NutritionChart, type NutritionChartNutrient, type NutritionInspection } from './nutrition-chart';
import { ReturnToNutritionChart, nutritionChartDayHref } from './nutrition-chart-navigation';

const mockNavigate = jest.fn(), onDate = jest.fn();
let mockParams: Record<string, unknown> = {};
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: mockNavigate }), useLocalSearchParams: () => mockParams }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
function Harness({ report, reference }: { report: NutritionReport; reference?: NutritionReport }) {
  const [selection, onSelect] = useState<NutritionInspection>(null);
  const [nutrient, onNutrient] = useState<NutritionChartNutrient>('calories');
  return <><NutritionChart report={report} reference={reference} selection={selection} onSelect={onSelect} onDate={onDate} nutrient={nutrient} onNutrient={onNutrient} /><ReturnToNutritionChart /></>;
}
const tree = (report: NutritionReport, reference?: NutritionReport, mode: 'light' | 'dark' = 'light') => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 700 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}><OwnlevelThemeProvider initialMode={mode}><ProgressRangeProvider initialToday="2026-10-04" initialState={{ unit: 'month', anchor: '2026-10-04', custom: null, compare: reference ? { kind: 'previous' } : { kind: 'none' } }}><Harness report={report} reference={reference} /></ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>;
const daily = () => reportFixture({ period: 'custom', from: '2026-10-01', to: '2026-10-04' });
function long(from = '2026-08-01', to = '2026-10-04') {
  const r = reportFixture({ period: 'custom', from, to });
  r.evolution = bucketNutritionChartDays([...r.days].reverse()).map(b => ({ start: b.start, end: b.end, includesToday: b.includesToday,
    metrics: { ...r.summary.metrics, calories: { value: 100, denominator: b.values.length, partialDays: 0 } } }));
  return r;
}
const render = (...args: Parameters<typeof renderNative>) => {
  const view = renderNative(...args);
  fireEvent.press(view.getByRole('button', { name: 'Detalle del dato' }));
  return view;
};
const flush = () => act(async () => {});

describe('Nutrition chart inspection', () => {
  it('inspects calories, complete date and the actual historical target before opening a day', async () => {
    onDate.mockClear(); const r = daily();
    r.days = r.days.map(d => ({ ...d, targetCalories: d.date === '2026-10-01' ? 1800 : 2400 }));
    const view = render(tree(r)); await flush();
    pressFittedMark(view.getByTestId('nutrition-chart-current-2026-10-01-bar'));
    const readout = within(view.getByTestId('nutrition-chart-inspection'));
    expect(readout.getByText('01/10/2026')).toBeTruthy(); expect(readout.getByText('100 kcal')).toBeTruthy();
    expect(view.getByText('Objetivo registrado de esta fecha: 1.800 kcal.')).toBeTruthy();
    expect(onDate).not.toHaveBeenCalled(); expect(view.queryByTestId('nutrition-progress-target')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: /^Ver comidas de ese día/ })); expect(onDate).toHaveBeenCalledWith('2026-10-01');
    pressFittedMark(view.getByTestId('nutrition-chart-current-2026-10-01-bar'));
    expect(view.queryByRole('button', { name: /^Ver comidas de ese día/ })).toBeNull();
  });
  it('distinguishes no meals, unknown calories, explicit zero, partial sums and today without treating any as another', async () => {
    const r = daily();
    r.days = r.days.map(d => d.date === '2026-10-01' ? { ...d, mealCount: 0, hasNutrition: false, nutrients: { ...d.nutrients, calories: { value: null, knownMeals: 0, missingMeals: 0, status: 'none' } } }
      : d.date === '2026-10-02' ? { ...d, targetCalories: null, nutrients: { ...d.nutrients, calories: { value: null, knownMeals: 0, missingMeals: 1, status: 'unknown' } } }
      : d.date === '2026-10-03' ? { ...d, nutrients: { ...d.nutrients, calories: { value: 0, knownMeals: 1, missingMeals: 0, status: 'complete' } } }
      : { ...d, mealCount: 2, nutrients: { ...d.nutrients, calories: { value: 350, knownMeals: 1, missingMeals: 1, status: 'partial' } } });
    const view = render(tree(r)); await flush();
    pressFittedMark(view.getByTestId('nutrition-chart-current-2026-10-01-gap'));
    expect(view.getByText('Sin registros nutricionales; no equivale a cero.')).toBeTruthy();
    pressFittedMark(view.getByTestId('nutrition-chart-current-2026-10-02-gap'));
    expect(view.getByText('Entradas registradas sin calorías conocidas.')).toBeTruthy();
    expect(view.getByText('Sin objetivo histórico acreditado para esta fecha.')).toBeTruthy();
    pressFittedMark(view.getByTestId('nutrition-chart-current-2026-10-03-bar'));
    expect(view.getByText('0 kcal')).toBeTruthy();
    pressFittedMark(view.getByTestId('nutrition-chart-current-2026-10-04-bar'));
    expect(view.getByText('350 kcal')).toBeTruthy();
    expect(view.getByText(/1 de 2 entradas con calorías conocidas/)).toBeTruthy();
    expect(view.getByText(/Hoy está en curso/)).toBeTruthy();
  });
  it.each([['2026-08-01', 7], ['2025-12-31', 31]] as [string, number][])('uses real block bounds and source denominator, then reuses all daily rows: %s', async (from, blockLength) => {
    onDate.mockClear(); const r = long(from); const first = r.evolution[0];
    // The UI must display the aggregate delivered by the contract, not recompute it from rendered rows.
    first.metrics.calories = { value: 1234, denominator: 3, partialDays: 1 };
    const view = render(tree(r)); await flush();
    pressFittedMark(view.getByTestId(`nutrition-chart-current-${first.start}-bar`));
    expect(view.getByText('1.234 kcal')).toBeTruthy();
    expect(view.getByText(new RegExp(`3 días usados de ${blockLength} días del bloque · 1 con suma parcial`))).toBeTruthy();
    expect(view.queryByRole('button', { name: /^Ver comidas de ese día/ })).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Ver días del bloque' }));
    expect(within(view.getByTestId('nutrition-report-day-rows')).getAllByRole('button')).toHaveLength(blockLength);
    fireEvent.press(within(view.getByTestId('nutrition-report-day-rows')).getAllByRole('button')[0]);
    expect(onDate).toHaveBeenCalledWith(first.end);
  });
  it('keeps a block with no eligible calories unavailable, while exposing its original missing days', async () => {
    const r = long(), first = r.evolution[0];
    first.metrics.calories = { value: null, denominator: 0, partialDays: 0 };
    r.days = r.days.map(d => d.date >= first.start && d.date <= first.end ? { ...d, hasNutrition: false, mealCount: 0, nutrients: { ...d.nutrients, calories: { value: null, knownMeals: 0, missingMeals: 0, status: 'none' } } } : d);
    const view = render(tree(r)); await flush();
    pressFittedMark(view.getByTestId(`nutrition-chart-current-${first.start}-gap`));
    expect(view.getByText('Sin dato')).toBeTruthy();
    expect(view.getByText(/0 días usados de 7 días del bloque/)).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Ver días del bloque' }));
    expect(within(view.getByTestId('nutrition-report-day-rows')).getAllByRole('button')).toHaveLength(7);
    expect(view.queryByText('0 kcal')).toBeNull();
  });
  it('keeps current and reference calendars independent and preserves an open block on return', async () => {
    const r = long(), ref = reportFixture({ period: 'custom', from: '2026-07-01', to: '2026-07-02' });
    const view = render(tree(r, ref)); await flush();
    expect(view.queryByTestId('nutrition-chart-series-reference')).toBeTruthy();
    expect(within(view.getByTestId('nutrition-chart-series-reference')).getAllByTestId(/^nutrition-chart-reference-\d{4}-\d{2}-\d{2}-(bar|gap)$/)).toHaveLength(2);
    expect(view.queryByTestId('nutrition-chart-series-current')).toBeTruthy();
    pressFittedMark(view.getByTestId('nutrition-chart-reference-2026-07-01-bar'));
    expect(within(view.getByTestId('nutrition-chart-inspection')).getByText('01/07/2026')).toBeTruthy();
    const first = r.evolution[0]; pressFittedMark(view.getByTestId(`nutrition-chart-current-${first.start}-bar`));
    fireEvent.press(view.getByRole('button', { name: 'Ver días del bloque' }));
    mockParams = { fromProgressNutrition: '1' };
    view.rerender(tree(r, ref)); await flush();
    fireEvent.press(view.getByRole('button', { name: 'Volver al gráfico de Nutrición' }));
    expect(mockNavigate).toHaveBeenCalledWith('/(tabs)/progress/trends/nutrition');
    expect(view.getByRole('button', { name: 'Ocultar días del bloque' })).toBeTruthy();
    expect(view.getByTestId(`nutrition-chart-current-${first.start}-bar`).props.accessibilityState.selected).toBe(true);
    mockParams = {};
  });
  it('retains the canonical in-course block average, which differs from the period summary population', async () => {
    const r = long(), last = r.evolution.at(-1)!;
    const view = render(tree(r)); await flush();
    pressFittedMark(view.getByTestId(`nutrition-chart-current-${last.start}-bar`));
    expect(view.getByText(/Incluye hoy en curso: este promedio de bloque puede cambiar/)).toBeTruthy();
    expect(view.getAllByText(new RegExp(`${last.metrics.calories.denominator} días usados`)).length).toBeGreaterThan(0);
  });
  it('updates selected data from the latest report, and does not navigate using a removed bucket', async () => {
    const r = daily(); const view = render(tree(r)); await flush();
    pressFittedMark(view.getByTestId('nutrition-chart-current-2026-10-01-bar'));
    const changed = daily(); changed.days = changed.days.map(d => d.date === '2026-10-01' ? { ...d, nutrients: { ...d.nutrients, calories: { ...d.nutrients.calories, value: 250 } } } : d);
    view.rerender(tree(changed));
    expect(within(view.getByTestId('nutrition-chart-inspection')).getByText('250 kcal')).toBeTruthy();
    const shifted = reportFixture({ period: 'custom', from: '2026-10-02', to: '2026-10-04' });
    view.rerender(tree(shifted));
    expect(view.getByText(/El dato seleccionado ya no está disponible/)).toBeTruthy();
    expect(view.queryByRole('button', { name: /^Ver comidas de ese día/ })).toBeNull();
  });
  it.each(['light', 'dark'] as const)('keeps long dates, units, coverage and 44 pt targets at large text in %s mode', async mode => {
    const rn = jest.requireActual<typeof import('react-native')>('react-native');
    const spy = jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ width: 320, height: 700, scale: 3, fontScale: 2 });
    const r = long(); const view = render(tree(r, undefined, mode)); await flush();
    const bars = within(view.getByTestId('nutrition-chart-series-current')).getAllByTestId(/^nutrition-chart-current-\d{4}-\d{2}-\d{2}-(bar|gap)$/);
    expect(StyleSheet.flatten(view.getByTestId('nutrition-chart-current-plot').props.style).minHeight).toBeGreaterThanOrEqual(44);
    pressFittedMark(bars[0]); expect(bars[0].props.accessibilityLabel).toContain('días usados');
    expect(view.getByText(/Promedio diario ·/)).toBeTruthy();
    spy.mockRestore();
  });
  it('validates original dates and never accepts an arbitrary return destination', async () => {
    expect(nutritionChartDayHref('2026-02-30')).toBeNull();
    expect(nutritionChartDayHref('2026-01-01')).toEqual({ pathname: '/(tabs)/nutrition', params: { date: '2026-01-01', fromProgressNutrition: '1' } });
    mockParams = { fromProgressNutrition: ['/settings'], redirect: '/settings' };
    const view = render(tree(daily())); await flush();
    expect(view.queryByRole('button', { name: 'Volver al gráfico de Nutrición' })).toBeNull();
    mockParams = {};
  });
});

describe('#519 · lectura del dato y ayuda', () => {
  it('selects a date on the full-period plot and keeps one accessible 44 pt interaction surface', async () => {
    const view = render(tree(daily())); await flush();
    const bar = view.getByTestId('nutrition-chart-current-2026-10-01-bar');
    pressFittedMark(bar);
    const style = StyleSheet.flatten(view.getByTestId('nutrition-chart-current-2026-10-01-bar').props.style);
    expect(style.borderRadius).toBe(radius.inner);
    expect(StyleSheet.flatten(view.getByTestId('nutrition-chart-current-plot').props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(view.getByLabelText(/^Calorías · Período elegido/).props.accessibilityRole).toBe('adjustable');
  });
  it('puts date, value and coverage first, keeps partial and today next to the datum, and opens the day from a row', async () => {
    onDate.mockClear();
    const r = daily();
    r.days = r.days.map(d => d.date === '2026-10-04' ? { ...d, mealCount: 2, nutrients: { ...d.nutrients, calories: { value: 350, knownMeals: 1, missingMeals: 1, status: 'partial' } } } : d);
    const view = render(tree(r)); await flush();
    pressFittedMark(view.getByTestId('nutrition-chart-current-2026-10-04-bar'));
    expect(view.getByTestId('nutrition-chart-coverage').props.children).toEqual(['Suma parcial: solo calorías conocidas', '.']);
    expect(view.getByTestId('nutrition-chart-today')).toBeTruthy();
    // The general help is closed: what is true of this datum is not in there.
    expect(view.queryByTestId('nutrition-chart-help-body')).toBeNull();
    const open = view.getByRole('button', { name: /^Ver comidas de ese día/ });
    expect(open.props.testID).toBe('nutrition-chart-open-day');
    fireEvent.press(open); expect(onDate).toHaveBeenCalledWith('2026-10-04');
  });
  it('«Cómo leer el gráfico» opens and closes in place, says its state and names A/B only when comparing', async () => {
    const view = render(tree(daily())); await flush();
    const toggle = view.getByRole('button', { name: 'Cómo leer el gráfico' });
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: false });
    fireEvent.press(toggle);
    expect(view.getByRole('button', { name: 'Cómo leer el gráfico' }).props.accessibilityState).toMatchObject({ expanded: true });
    expect(view.getByText(/Hueco: ese día no tiene valor/)).toBeTruthy();
    expect(view.queryByText(/sin emparejar posiciones/)).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Cómo leer el gráfico' }));
    expect(view.queryByTestId('nutrition-chart-help-body')).toBeNull();
  });
});

describe('#519 · selector Calorías / Proteína', () => {
  const protein = () => fireEvent.press(within(view_().getByLabelText('Nutriente del gráfico')).getByRole('radio', { name: 'Proteína' }));
  let view_: () => ReturnType<typeof render>;
  const barHeight = (view: ReturnType<typeof render>, id: string) => view.getByTestId(id).findByType(ChartBar).props.height;
  it('starts on Calorías and switches title, unit, scale, coverage and the historical target on the same selected day', async () => {
    const r = daily();
    r.days = r.days.map(d => d.date === '2026-10-01' ? { ...d, targetCalories: 1800, targetProteinG: null, nutrients: { ...d.nutrients, calories: { ...d.nutrients.calories, value: 2000 }, protein: { ...d.nutrients.protein, value: 50 } } }
      : d.date === '2026-10-02' ? { ...d, targetProteinG: 140, nutrients: { ...d.nutrients, calories: { ...d.nutrients.calories, value: 1000 }, protein: { ...d.nutrients.protein, value: 150 } } } : d);
    const view = render(tree(r)); view_ = () => view; await flush();
    const group = within(view.getByLabelText('Nutriente del gráfico'));
    expect(group.getByRole('radio', { name: 'Calorías' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(view.getByText('Calorías registradas')).toBeTruthy();
    // Calories scale: 2000 is the tallest; protein scale: 150 is.
    expect(barHeight(view, 'nutrition-chart-current-2026-10-01-bar')).toBe(126);
    pressFittedMark(view.getByTestId('nutrition-chart-current-2026-10-01-bar'));
    expect(view.getByText('2.000 kcal')).toBeTruthy(); expect(view.getByText('Objetivo registrado de esta fecha: 1.800 kcal.')).toBeTruthy();
    protein();
    expect(group.getByRole('radio', { name: 'Proteína' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(view.getByText('Proteína registrada')).toBeTruthy(); expect(view.queryByText('Calorías registradas')).toBeNull();
    expect(view.getByLabelText(/^Proteína · Período elegido/).props.accessibilityRole).toBe('adjustable');
    expect(barHeight(view, 'nutrition-chart-current-2026-10-02-bar')).toBe(126);
    expect(barHeight(view, 'nutrition-chart-current-2026-10-01-bar')).toBe(42);
    // Same day stays selected, now read in grams, with protein coverage and its own (absent) target.
    expect(view.getByTestId('nutrition-chart-current-2026-10-01-bar').props.accessibilityState.selected).toBe(true);
    const readout = within(view.getByTestId('nutrition-chart-inspection'));
    expect(readout.getByText('01/10/2026')).toBeTruthy(); expect(readout.getByText('50 g')).toBeTruthy();
    expect(view.getByText('Proteína completa entre las entradas registradas.')).toBeTruthy();
    expect(view.getByText(/1 de 1 entradas con proteína conocida · 0 sin ese dato/)).toBeTruthy();
    expect(view.getByText('Sin objetivo histórico acreditado para esta fecha.')).toBeTruthy();
    pressFittedMark(view.getByTestId('nutrition-chart-current-2026-10-02-bar'));
    expect(view.getByText('Objetivo registrado de esta fecha: 140 g.')).toBeTruthy();
    expect(view.getByTestId('nutrition-chart-current-2026-10-02-bar').props.accessibilityLabel).toMatch(/^02\/10\/2026, 150 g, hoy|^02\/10\/2026, 150 g, 1 de 1 entradas con proteína/);
  });
  it('protein zero stays zero, a missing protein keeps the selection as «Sin dato», partial and today stay next to the datum', async () => {
    const r = daily();
    r.days = r.days.map(d => d.date === '2026-10-01' ? { ...d, nutrients: { ...d.nutrients, protein: { value: 0, knownMeals: 1, missingMeals: 0, status: 'complete' } } }
      : d.date === '2026-10-02' ? { ...d, nutrients: { ...d.nutrients, calories: { value: 600, knownMeals: 1, missingMeals: 0, status: 'complete' }, protein: { value: null, knownMeals: 0, missingMeals: 1, status: 'unknown' } } }
      : d.date === '2026-10-04' ? { ...d, mealCount: 3, nutrients: { ...d.nutrients, calories: { value: 900, knownMeals: 3, missingMeals: 0, status: 'complete' }, protein: { value: 40, knownMeals: 2, missingMeals: 1, status: 'partial' } } } : d);
    const view = render(tree(r)); view_ = () => view; await flush();
    // Selected on calories, where the day has a value; switching keeps the date and says the protein is missing.
    pressFittedMark(view.getByTestId('nutrition-chart-current-2026-10-02-bar'));
    expect(view.getByText('600 kcal')).toBeTruthy();
    protein();
    expect(view.getByTestId('nutrition-chart-current-2026-10-02-gap').props.accessibilityState.selected).toBe(true);
    const readout = within(view.getByTestId('nutrition-chart-inspection'));
    expect(readout.getByText('02/10/2026')).toBeTruthy(); expect(readout.getByText('Sin dato')).toBeTruthy();
    expect(view.getByText('Entradas registradas sin proteína conocida.')).toBeTruthy();
    expect(view.queryByText(/El dato seleccionado ya no está disponible/)).toBeNull();
    expect(readout.queryByText('0 g')).toBeNull();
    pressFittedMark(view.getByTestId('nutrition-chart-current-2026-10-01-bar'));
    expect(readout.getByText('0 g')).toBeTruthy();
    expect(barHeight(view, 'nutrition-chart-current-2026-10-01-bar')).toBe(1);
    pressFittedMark(view.getByTestId('nutrition-chart-current-2026-10-04-bar'));
    expect(readout.getByText('40 g')).toBeTruthy();
    expect(view.getByText('Suma parcial: solo proteína conocida.')).toBeTruthy();
    expect(view.getByText(/2 de 3 entradas con proteína conocida · 1 sin ese dato/)).toBeTruthy();
    expect(view.getByTestId('nutrition-chart-today')).toBeTruthy();
    expect(view.getByTestId('nutrition-chart-current-2026-10-04-bar').props.accessibilityLabel).toContain('suma parcial, hoy en curso');
  });
  it('uses the protein block denominator when it differs from calories, and keeps the open block', async () => {
    const r = long(), first = r.evolution[0];
    first.metrics = { ...first.metrics, calories: { value: 2100, denominator: 6, partialDays: 1 }, protein: { value: 130, denominator: 4, partialDays: 2 } };
    r.days = r.days.map(d => d.date === first.start || d.date === first.end ? { ...d, nutrients: { ...d.nutrients, protein: { value: null, knownMeals: 0, missingMeals: 1, status: 'unknown' } } } : d);
    const view = render(tree(r)); view_ = () => view; await flush();
    pressFittedMark(view.getByTestId(`nutrition-chart-current-${first.start}-bar`));
    expect(view.getByText('2.100 kcal')).toBeTruthy();
    expect(view.getByText(/6 días usados de 7 días del bloque · 1 con suma parcial/)).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Ver días del bloque' }));
    protein();
    expect(view.getByText('130 g')).toBeTruthy();
    expect(view.getByText(/4 días usados de 7 días del bloque · 2 con suma parcial/)).toBeTruthy();
    expect(view.getByText(/2 con proteína desconocida/)).toBeTruthy();
    expect(view.getByRole('button', { name: 'Ocultar días del bloque' })).toBeTruthy();
    expect(view.getByTestId(`nutrition-chart-current-${first.start}-bar`).props.accessibilityLabel).toContain('4 días usados, 2 con suma parcial');
  });
  it('keeps the B side and its selected day when switching, and keeps an accessible full-period plot at large text', async () => {
    const rn = jest.requireActual<typeof import('react-native')>('react-native');
    const spy = jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ width: 320, height: 700, scale: 3, fontScale: 2 });
    const r = long(), ref = reportFixture({ period: 'custom', from: '2026-07-01', to: '2026-07-02' });
    const view = render(tree(r, ref)); view_ = () => view; await flush();
    pressFittedMark(view.getByTestId('nutrition-chart-reference-2026-07-01-bar'));
    protein();
    expect(view.getByTestId('nutrition-chart-reference-plot')).toBeTruthy();
    expect(view.getByTestId('nutrition-chart-reference-2026-07-01-bar').props.accessibilityState.selected).toBe(true);
    expect(within(view.getByTestId('nutrition-chart-inspection')).getByText('100 g')).toBeTruthy();
    expect(view.getByLabelText(/^Proteína · Comparación/).props.accessibilityRole).toBe('adjustable');
    expect(StyleSheet.flatten(view.getByTestId('nutrition-chart-reference-plot').props.style).minHeight).toBeGreaterThanOrEqual(44);
    spy.mockRestore();
  });
  it('protein keeps 0,4 g, a threshold under 0,1 g, a real 0 g and «Sin dato» apart, on screen and in the spoken labels', async () => {
    const r = daily();
    const proteinValue = (value: number | null) => value === null ? { value: null, knownMeals: 0, missingMeals: 1, status: 'unknown' as const } : { value, knownMeals: 1, missingMeals: 0, status: 'complete' as const };
    const by: Record<string, number | null> = { '2026-10-01': 0.4, '2026-10-02': 0, '2026-10-03': null, '2026-10-04': 0.03 };
    r.days = r.days.map(d => ({ ...d, nutrients: { ...d.nutrients, protein: proteinValue(by[d.date] ?? null) } }));
    const view = render(tree(r)); view_ = () => view; await flush();
    protein();
    const bar = (date: string, kind: 'bar' | 'gap') => view.getByTestId(`nutrition-chart-current-${date}-${kind}`);
    const readout = () => within(view.getByTestId('nutrition-chart-inspection'));
    const spokenReadout = () => view.getByTestId('nutrition-chart-inspection').findAll(n => n.props.accessible && n.props.accessibilityLiveRegion === 'polite')[0]!.props.accessibilityLabel as string;
    // 0,4 g: one decimal on screen and spoken, and a bar taller than the zero line.
    expect(bar('2026-10-01', 'bar').props.accessibilityLabel).toMatch(/^01\/10\/2026, 0,4 g, 1 de 1 entradas con proteína/);
    pressFittedMark(bar('2026-10-01', 'bar'));
    expect(readout().getByText('0,4 g')).toBeTruthy(); expect(readout().queryByText('0 g')).toBeNull();
    expect(spokenReadout()).toContain('0,4 g');
    expect(barHeight(view, 'nutrition-chart-current-2026-10-01-bar')).toBeGreaterThanOrEqual(2);
    // A registered zero stays 0 g, drawn as the base line.
    expect(bar('2026-10-02', 'bar').props.accessibilityLabel).toMatch(/^02\/10\/2026, 0 g,/);
    pressFittedMark(bar('2026-10-02', 'bar'));
    expect(readout().getByText('0 g')).toBeTruthy();
    expect(barHeight(view, 'nutrition-chart-current-2026-10-02-bar')).toBe(1);
    // Missing protein: «Sin dato», a gap, never 0.
    pressFittedMark(bar('2026-10-03', 'gap'));
    expect(readout().getByText('Sin dato')).toBeTruthy(); expect(readout().queryByText('0 g')).toBeNull();
    expect(bar('2026-10-03', 'gap').props.accessibilityLabel).toContain('Entradas registradas sin proteína conocida');
    // Positive but below the visible precision: a threshold, never 0.
    pressFittedMark(bar('2026-10-04', 'bar'));
    expect(readout().getByText('< 0,1 g')).toBeTruthy();
    expect(spokenReadout()).toContain('menos de 0,1 g');
    expect(bar('2026-10-04', 'bar').props.accessibilityLabel).toMatch(/^04\/10\/2026, menos de 0,1 g/);
  });
  it('a positive block average that would round to 0 reads as «< 0,1 g», a small one keeps its decimal', async () => {
    const r = long(), [first, second, third] = r.evolution;
    first.metrics = { ...first.metrics, protein: { value: 0.02, denominator: 3, partialDays: 0 } };
    second.metrics = { ...second.metrics, protein: { value: 0.4, denominator: 2, partialDays: 1 } };
    third.metrics = { ...third.metrics, protein: { value: null, denominator: 0, partialDays: 0 } };
    const view = render(tree(r)); view_ = () => view; await flush();
    protein();
    pressFittedMark(view.getByTestId(`nutrition-chart-current-${first.start}-bar`));
    expect(view.getByText('< 0,1 g')).toBeTruthy();
    expect(view.getByTestId(`nutrition-chart-current-${first.start}-bar`).props.accessibilityLabel).toContain('promedio del bloque, menos de 0,1 g');
    expect(barHeight(view, `nutrition-chart-current-${first.start}-bar`)).toBeGreaterThanOrEqual(2);
    pressFittedMark(view.getByTestId(`nutrition-chart-current-${second.start}-bar`));
    expect(view.getByText('0,4 g')).toBeTruthy();
    pressFittedMark(view.getByTestId(`nutrition-chart-current-${third.start}-gap`));
    expect(view.getByText('Sin dato')).toBeTruthy();
    expect(view.queryByText(/Promedio del bloque · 0 g/)).toBeNull();
  });
});


it('keeps partial coverage and today beside the value while supplementary details stay closed', async () => {
  onDate.mockClear();
  const r = daily();
  r.days = r.days.map(d => d.date === '2026-10-04' ? { ...d, mealCount: 2, nutrients: { ...d.nutrients, calories: { value: 350, knownMeals: 1, missingMeals: 1, status: 'partial' } } } : d);
  const view = renderNative(tree(r)); await flush();
  pressFittedMark(view.getByTestId('nutrition-chart-current-2026-10-04-bar'));
  const reading = within(view.getByTestId('nutrition-chart-readout'));
  expect(reading.getByText('350 kcal')).toBeTruthy();
  expect(reading.getByText('Suma parcial · 1 de 2 entradas con dato · Hoy en curso')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Detalle del dato' }).props.accessibilityState.expanded).toBe(false);
  expect(onDate).not.toHaveBeenCalled();
});
it('never replaces a lost reference selection with the current average, and offers an explicit recovery', async () => {
  const r = daily(), reference = daily();
  r.summary.metrics.calories = { value: 7777, denominator: 2, partialDays: 0 };
  const view = renderNative(tree(r, reference)); await flush();
  pressFittedMark(view.getByTestId('nutrition-chart-reference-2026-10-01-bar'));
  view.rerender(tree(r)); await flush();
  expect(within(view.getByTestId('nutrition-chart-readout')).getByText('Sin lectura')).toBeTruthy();
  expect(within(view.getByTestId('nutrition-chart-readout')).queryByText('7.777 kcal')).toBeNull();
  fireEvent.press(view.getByRole('button', { name: 'Quitar selección del gráfico' }));
  expect(within(view.getByTestId('nutrition-chart-readout')).getByText('7.777 kcal')).toBeTruthy();
});
