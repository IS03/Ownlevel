import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';

import type { NutritionReport } from '@/api/nutrition-report';
import { OwnlevelThemeProvider } from '@/design-system';

import type { HomeResource } from './home-resource';
import { HomeWeek, weekCalories } from './home-week';

jest.mock('./home-page-control', () => jest.requireActual('./home-page-control.tsx'));
jest.mock('expo-glass-effect', () => ({ isGlassEffectAPIAvailable: () => false, isLiquidGlassAvailable: () => false }));
jest.mock('@/design-system', () => ({ ...jest.requireActual<object>('@/design-system'), useReduceMotion: () => true }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const today = '2026-10-07', weekStart = '2026-10-05';
const row = (date: string, value: number | null, target = 2000) => ({ date, hasNutrition: value !== null, targetCalories: target,
  nutrients: { calories: { value, status: value === null ? 'none' : 'complete' } } });
const report = { today, range: { start: weekStart, end: today }, days: [row(weekStart, 0), row('2026-10-06', null), row(today, 1000, 2500)],
  summary: { metrics: { calories: { value: 0, denominator: 1, partialDays: 0 }, protein: { value: null, denominator: 0, partialDays: 0 },
    carbs: { value: 0, denominator: 1, partialDays: 0 }, fat: { value: null, denominator: 0, partialDays: 0 } } },
} as unknown as NutritionReport;
const ready = (data: NutritionReport): HomeResource<NutritionReport> => ({ data, status: 'ready', confirmedAt: 1 });

function week(resource = ready(report), theme: 'light' | 'dark' = 'light') {
  const onOpenCalories = jest.fn();
  const view = render(<OwnlevelThemeProvider initialMode={theme}><HomeWeek calories={resource}
    habits={{ data: undefined, status: 'loading', confirmedAt: null }} onOpenHabit={() => undefined} onMetrics={() => undefined}
    onOpenCalories={onOpenCalories} onOpenDay={() => undefined} onProgress={() => undefined} today={today} weekStart={weekStart}
    training={{ data: undefined, status: 'loading', confirmedAt: null }} week={undefined} /></OwnlevelThemeProvider>);
  fireEvent.press(view.getByTestId('home-week-page-1'));
  return { ...view, onOpenCalories };
}

describe('weekly nutrition', () => {
  it.each(['light', 'dark'] as const)('keeps missing, zero, today and future distinct in %s', theme => {
    const view = week(ready(report), theme);
    expect(weekCalories(report, [weekStart, '2026-10-06']).map(day => day.value)).toEqual([0, null]);
    expect(view.getByTestId(`home-week-calorie-${weekStart}-zero`)).toBeTruthy();
    expect(view.queryByTestId(`home-week-calorie-${weekStart}-fill`)).toBeNull();
    expect(view.queryByTestId('home-week-calorie-2026-10-06-fill')).toBeNull();
    expect(StyleSheet.flatten(view.getByTestId('home-week-calorie-2026-10-06').props.style).borderWidth).toBe(1);
    expect(StyleSheet.flatten(view.getByTestId(`home-week-calorie-${today}-fill`).props.style)).toMatchObject({ height: '40%', top: '60%', backgroundColor: theme === 'light' ? '#705F36' : '#C9B68A' });
    expect(view.getByTestId('home-week-calories').props.accessibilityLabel).toContain('hoy en curso, no incluido en el promedio');
    expect(view.getByLabelText('Jueves. Por venir')).toBeTruthy();
    expect(view.queryByTestId('home-week-calorie-2026-10-08-target')).toBeNull();
    expect(view.getByText('1 de 7 días')).toBeTruthy();
    expect(view.getByLabelText('Grasas: —. Promedio de 0 de 7 días con datos')).toBeTruthy();
    fireEvent.press(view.getByTestId('home-week-calories'));
    expect(view.onOpenCalories).toHaveBeenCalledTimes(1);
  });

  it('preserves variable daily goals and zero-based proportions without minimum bars', () => {
    const view = week(ready({ ...report, days: [row(weekStart, 1, 1000), row('2026-10-06', 2000, 2000)] } as NutritionReport));
    expect(StyleSheet.flatten(view.getByTestId(`home-week-calorie-${weekStart}-fill`).props.style).height).toBe('0.05%');
    expect(StyleSheet.flatten(view.getByTestId(`home-week-calorie-${weekStart}-target`).props.style).top).toBe('50%');
    expect(StyleSheet.flatten(view.getByTestId('home-week-calorie-2026-10-06-target').props.style).top).toBe('0%');
  });

  it('an empty week has no invented bars or averages', () => {
    const view = week(ready({ ...report, days: [], summary: { ...report.summary, metrics: { ...report.summary.metrics, calories: { value: null, denominator: 0, partialDays: 0 } } } }));
    expect(view.getByText('0 de 7 días')).toBeTruthy();
    expect(view.queryAllByTestId(/home-week-calorie-.*-(fill|zero)$/)).toHaveLength(0);
  });

  it('loading, unavailable, stale and wrong-range reports retain distinct states', () => {
    const loading = week({ data: undefined, status: 'loading', confirmedAt: null });
    expect(loading.getByTestId('home-week-nutrition-loading')).toBeTruthy();
    loading.unmount();
    const failed = week({ data: undefined, status: 'unavailable', confirmedAt: null });
    expect(failed.getByText('No pudimos cargar Nutrición de esta semana.')).toBeTruthy();
    failed.unmount();
    const stale = week({ data: report, status: 'unavailable', confirmedAt: 1 });
    expect(stale.getByText('Sin actualizar · Última lectura disponible')).toBeTruthy();
    stale.unmount();
    const wrongRange = week(ready({ ...report, range: { ...report.range, end: '2026-10-06' } }));
    expect(wrongRange.getByText('No pudimos cargar Nutrición de esta semana.')).toBeTruthy();
  });
});
