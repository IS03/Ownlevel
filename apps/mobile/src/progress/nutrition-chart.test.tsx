import { useState } from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { NutritionReport } from '@/api/nutrition-report';
import { reportFixture } from '@/nutrition/report-fixture.test-helper';
import { bucketNutritionChartDays } from '../../../../src/lib/nutrition/report-chart-core';
import { ProgressRangeProvider } from './progress-range-context';
import { NutritionChart, type NutritionInspection } from './nutrition-chart';
import { ReturnToNutritionChart, nutritionChartDayHref } from './nutrition-chart-navigation';

const mockNavigate = jest.fn(), onDate = jest.fn();
let mockParams: Record<string, unknown> = {};
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: mockNavigate }), useLocalSearchParams: () => mockParams }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
function Harness({ report, reference }: { report: NutritionReport; reference?: NutritionReport }) {
  const [selection, onSelect] = useState<NutritionInspection>(null);
  return <><NutritionChart report={report} reference={reference} selection={selection} onSelect={onSelect} onDate={onDate} /><ReturnToNutritionChart /></>;
}
const tree = (report: NutritionReport, reference?: NutritionReport, mode: 'light' | 'dark' = 'light') => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 700 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}><OwnlevelThemeProvider initialMode={mode}><ProgressRangeProvider initialToday="2026-10-04" initialState={{ unit: 'month', anchor: '2026-10-04', custom: null, compare: reference ? { kind: 'previous' } : { kind: 'none' } }}><Harness report={report} reference={reference} /></ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>;
const daily = () => reportFixture({ period: 'custom', from: '2026-10-01', to: '2026-10-04' });
function long(from = '2026-08-01', to = '2026-10-04') {
  const r = reportFixture({ period: 'custom', from, to });
  r.evolution = bucketNutritionChartDays([...r.days].reverse()).map(b => ({ start: b.start, end: b.end, includesToday: b.includesToday,
    metrics: { ...r.summary.metrics, calories: { value: 100, denominator: b.values.length, partialDays: 0 } } }));
  return r;
}
const flush = () => act(async () => {});

describe('Nutrition chart inspection', () => {
  it('inspects calories, complete date and the actual historical target before opening a day', async () => {
    onDate.mockClear(); const r = daily();
    r.days = r.days.map(d => ({ ...d, targetCalories: d.date === '2026-10-01' ? 1800 : 2400 }));
    const view = render(tree(r)); await flush();
    fireEvent.press(view.getByTestId('nutrition-chart-current-2026-10-01-bar'));
    const readout = within(view.getByTestId('nutrition-chart-inspection'));
    expect(readout.getByText('01/10/2026')).toBeTruthy(); expect(readout.getByText('100 kcal')).toBeTruthy();
    expect(readout.getByText('Objetivo registrado de esta fecha: 1.800 kcal.')).toBeTruthy();
    expect(onDate).not.toHaveBeenCalled(); expect(view.queryByTestId('nutrition-progress-target')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Abrir día y comidas originales' })); expect(onDate).toHaveBeenCalledWith('2026-10-01');
    fireEvent.press(view.getByTestId('nutrition-chart-current-2026-10-01-bar'));
    expect(view.queryByRole('button', { name: 'Abrir día y comidas originales' })).toBeNull();
  });
  it('distinguishes no meals, unknown calories, explicit zero, partial sums and today without treating any as another', async () => {
    const r = daily();
    r.days = r.days.map(d => d.date === '2026-10-01' ? { ...d, mealCount: 0, hasNutrition: false, nutrients: { ...d.nutrients, calories: { value: null, knownMeals: 0, missingMeals: 0, status: 'none' } } }
      : d.date === '2026-10-02' ? { ...d, targetCalories: null, nutrients: { ...d.nutrients, calories: { value: null, knownMeals: 0, missingMeals: 1, status: 'unknown' } } }
      : d.date === '2026-10-03' ? { ...d, nutrients: { ...d.nutrients, calories: { value: 0, knownMeals: 1, missingMeals: 0, status: 'complete' } } }
      : { ...d, mealCount: 2, nutrients: { ...d.nutrients, calories: { value: 350, knownMeals: 1, missingMeals: 1, status: 'partial' } } });
    const view = render(tree(r)); await flush();
    fireEvent.press(view.getByTestId('nutrition-chart-current-2026-10-01-gap'));
    expect(view.getByText('Sin registros nutricionales; no equivale a cero.')).toBeTruthy();
    fireEvent.press(view.getByTestId('nutrition-chart-current-2026-10-02-gap'));
    expect(view.getByText('Entradas registradas sin calorías conocidas.')).toBeTruthy();
    expect(view.getByText('Sin objetivo histórico acreditado para esta fecha.')).toBeTruthy();
    fireEvent.press(view.getByTestId('nutrition-chart-current-2026-10-03-bar'));
    expect(view.getByText('0 kcal')).toBeTruthy();
    fireEvent.press(view.getByTestId('nutrition-chart-current-2026-10-04-bar'));
    expect(view.getByText('350 kcal')).toBeTruthy();
    expect(view.getByText(/1 de 2 entradas con calorías conocidas/)).toBeTruthy();
    expect(view.getByText(/Hoy está en curso/)).toBeTruthy();
  });
  it.each([['2026-08-01', 7], ['2025-12-31', 31]] as [string, number][])('uses real block bounds and source denominator, then reuses all daily rows: %s', async (from, blockLength) => {
    onDate.mockClear(); const r = long(from); const first = r.evolution[0];
    // The UI must display the aggregate delivered by the contract, not recompute it from rendered rows.
    first.metrics.calories = { value: 1234, denominator: 3, partialDays: 1 };
    const view = render(tree(r)); await flush();
    fireEvent.press(view.getByTestId(`nutrition-chart-current-${first.start}-bar`));
    expect(view.getByText('Promedio del bloque · 1.234 kcal por día con dato')).toBeTruthy();
    expect(view.getByText(new RegExp(`3 días usados de ${blockLength} días del bloque · 1 con suma parcial`))).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Abrir día y comidas originales' })).toBeNull();
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
    fireEvent.press(view.getByTestId(`nutrition-chart-current-${first.start}-gap`));
    expect(view.getByText('Sin valor de calorías')).toBeTruthy();
    expect(view.getByText(/0 días usados de 7 días del bloque/)).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Ver días del bloque' }));
    expect(within(view.getByTestId('nutrition-report-day-rows')).getAllByRole('button')).toHaveLength(7);
    expect(view.queryByText('0 kcal')).toBeNull();
  });
  it('keeps current and reference calendars independent and preserves an open block on return', async () => {
    const r = long(), ref = reportFixture({ period: 'custom', from: '2026-07-01', to: '2026-07-02' });
    const view = render(tree(r, ref)); await flush();
    expect(view.queryByTestId('nutrition-chart-series-reference')).toBeNull();
    fireEvent.press(view.getByRole('radio', { name: 'Comparación' }));
    expect(within(view.getByTestId('nutrition-chart-series-reference')).getAllByRole('button')).toHaveLength(2);
    expect(view.queryByTestId('nutrition-chart-series-current')).toBeNull();
    fireEvent.press(view.getByTestId('nutrition-chart-reference-2026-07-01-bar'));
    expect(within(view.getByTestId('nutrition-chart-inspection')).getByText('01/07/2026')).toBeTruthy();
    fireEvent.press(view.getByRole('radio', { name: 'Período elegido' }));
    const first = r.evolution[0]; fireEvent.press(view.getByTestId(`nutrition-chart-current-${first.start}-bar`));
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
    fireEvent.press(view.getByTestId(`nutrition-chart-current-${last.start}-bar`));
    expect(view.getByText(/Incluye hoy en curso: este promedio de bloque puede cambiar/)).toBeTruthy();
    expect(view.getByText(new RegExp(`${last.metrics.calories.denominator} días usados`))).toBeTruthy();
  });
  it('updates selected data from the latest report, and does not navigate using a removed bucket', async () => {
    const r = daily(); const view = render(tree(r)); await flush();
    fireEvent.press(view.getByTestId('nutrition-chart-current-2026-10-01-bar'));
    const changed = daily(); changed.days = changed.days.map(d => d.date === '2026-10-01' ? { ...d, nutrients: { ...d.nutrients, calories: { ...d.nutrients.calories, value: 250 } } } : d);
    view.rerender(tree(changed));
    expect(within(view.getByTestId('nutrition-chart-inspection')).getByText('250 kcal')).toBeTruthy();
    const shifted = reportFixture({ period: 'custom', from: '2026-10-02', to: '2026-10-04' });
    view.rerender(tree(shifted));
    expect(view.getByText(/El dato seleccionado ya no está disponible/)).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Abrir día y comidas originales' })).toBeNull();
  });
  it.each(['light', 'dark'] as const)('keeps long dates, units, coverage and 44 pt targets at large text in %s mode', async mode => {
    const rn = jest.requireActual<typeof import('react-native')>('react-native');
    const spy = jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ width: 320, height: 700, scale: 3, fontScale: 2 });
    const r = long(); const view = render(tree(r, undefined, mode)); await flush();
    const bars = within(view.getByTestId('nutrition-chart-series-current')).getAllByRole('button');
    for (const bar of bars) expect(StyleSheet.flatten(bar.props.style).minWidth).toBeGreaterThanOrEqual(44);
    fireEvent.press(bars[0]); expect(bars[0].props.accessibilityLabel).toContain('días usados');
    expect(view.getByText(/Promedio del bloque/)).toBeTruthy();
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
