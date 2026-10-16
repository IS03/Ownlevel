import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Animated, Modal, StyleSheet } from 'react-native';
import type { MobileApiClient } from '@/api/client';
import type { MobileApiReadResult } from '@/api/results';
import type { NutritionReport, ReportQuery } from '@/api/nutrition-report';
import { OwnlevelThemeProvider } from '@/design-system';
import { NutritionMonthSheet } from './day-calendar';
import { dayRings, nutritionMonth, nutritionWeek, reportRings, ringFraction } from './day-home-model';
import { NutritionRings, ringLaps } from './day-rings';
import { NutritionDaySummary } from './day-summary';
import { NutritionWeek } from './day-week';
import { nutritionFixture } from './day-fixture.test-helper';
import { reportFixture } from './report-fixture.test-helper';

const mockReport = jest.fn<(client: MobileApiClient, query: ReportQuery, signal?: AbortSignal) => Promise<MobileApiReadResult<NutritionReport>>>();
let mockClient = {} as MobileApiClient;
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
jest.mock('@/api/nutrition-report', () => ({
  ...jest.requireActual<typeof import('@/api/nutrition-report')>('@/api/nutrition-report'), fetchNutritionReport: (client: MobileApiClient, query: ReportQuery, signal?: AbortSignal) => mockReport(client, query, signal),
}));
jest.mock('expo-router', () => ({ useFocusEffect: () => {} }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const ok = (data: NutritionReport): MobileApiReadResult<NutritionReport> => ({ status: 'ok', data, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } });
const failure: MobileApiReadResult<NutritionReport> = { status: 'unavailable', reason: 'network', meta: { durationMs: 1, httpStatus: null, outcome: 'unavailable' } };
const wrap = (children: React.ReactNode) => <OwnlevelThemeProvider initialMode="light">{children}</OwnlevelThemeProvider>;
const readings = { calories: { value: 2030, target: 1900, partial: false }, protein: { value: 142, target: 130, partial: false } };

beforeEach(() => {
  mockReport.mockReset().mockImplementation((_client, query: ReportQuery) => Promise.resolve(ok(reportFixture(query))));
  mockClient = {} as MobileApiClient;
});

describe('Nutrition Home data truth and rings', () => {
  it('keeps missing, zero, partial and absent targets distinct', () => {
    const data = nutritionFixture();
    expect(dayRings(data).protein.value).toBeNull();
    expect(ringFraction(dayRings(data).protein)).toBeNull();
    data.nutrition = { status: 'ok', data: { dayState: 'missing', context: null, summary: null, meals: [] } };
    expect(dayRings(data).calories).toMatchObject({ value: null, target: null });
    expect(ringFraction({ value: 0, target: 1900, partial: false })).toBe(0);
    expect(ringFraction({ value: 100, target: null, partial: false })).toBeNull();
    expect(ringFraction({ value: 100, target: 0, partial: false })).toBeNull();
    expect(ringFraction({ value: -1, target: 1900, partial: false })).toBeNull();
    const partial = nutritionFixture();
    if (partial.nutrition.status === 'ok' && partial.nutrition.data.dayState === 'recorded') {
      partial.nutrition.data.summary.entryCount = 2;
      partial.nutrition.data.summary.proteinG = { knownTotal: 15, missingCount: 1 };
    }
    expect(dayRings(partial).protein).toEqual({ value: 15, target: 140, partial: true });
    const empty = reportFixture().days[0];
    empty.nutrients.calories = { value: null, knownMeals: 0, missingMeals: 0, status: 'none' };
    expect(reportRings(empty).calories.value).toBeNull();
  });
  it('draws rounded excess laps past 100%, including multiple turns', () => {
    expect(ringLaps(0)).toEqual({ base: 0, excess: 0 });
    expect(ringLaps(1)).toEqual({ base: 1, excess: 0 });
    expect(ringLaps(2)).toEqual({ base: 1, excess: 1 });
    expect(ringLaps(2.25)).toEqual({ base: 1, excess: 0.25 });
    const view = render(wrap(<NutritionRings readings={readings} />));
    // An excess lap overlaps the start: it is drawn as a group (arc, end-cap shadow, end cap on top).
    expect(view.getByTestId('nutrition-rings-calories-excess', { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByTestId('nutrition-rings-protein-excess', { includeHiddenElements: true })).toBeTruthy();
  });
  it('never paints progress for an unknown value or missing target', () => {
    const view = render(wrap(<NutritionRings readings={{ calories: { value: null, target: 1900, partial: false }, protein: { value: 15, target: null, partial: false } }} />));
    expect(view.getByTestId('nutrition-rings-calories-unknown', { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryByTestId('nutrition-rings-calories-base', { includeHiddenElements: true })).toBeNull();
    expect(view.queryByTestId('nutrition-rings-protein-base', { includeHiddenElements: true })).toBeNull();
  });
  it('toggles exact remaining values, keeps negative excess and dims macros', () => {
    jest.spyOn(Animated, 'timing').mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
    const data = nutritionFixture();
    if (data.nutrition.status === 'ok' && data.nutrition.data.dayState === 'recorded') {
      data.nutrition.data.summary.calories.knownTotal = 2030;
      data.nutrition.data.context.calorieTarget = 1900;
      data.nutrition.data.summary.proteinG = { knownTotal: 142, missingCount: 0 };
      data.nutrition.data.context.proteinTargetG = 130;
    }
    const view = render(wrap(<NutritionDaySummary data={data} />));
    expect(view.getByTestId('nutrition-summary').props.accessibilityLabel).toContain('2.030 kcal');
    fireEvent.press(view.getByTestId('nutrition-summary'));
    expect(view.getByTestId('nutrition-summary').props.accessibilityLabel).toContain('-130 kcal');
    expect(view.getByTestId('nutrition-summary').props.accessibilityLabel).toContain('-12 g');
    expect(StyleSheet.flatten(view.getByTestId('nutrition-summary-macros').props.style).opacity).toBe(0.55);
    fireEvent.press(view.getByTestId('nutrition-summary'));
    expect(view.getByText('Llevás')).toBeTruthy();
    jest.restoreAllMocks();
  });
  it('uses logical dates across month/year and leap-year boundaries', () => {
    // Rolling window ending today; a date in it keeps the window, an older one becomes its last day.
    expect(nutritionWeek('2026-10-01', '2026-10-03')).toEqual(['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(nutritionWeek('2026-09-20', '2026-10-03').at(-1)).toBe('2026-09-20');
    expect(nutritionMonth('2028-02-14')).toMatchObject({ start: '2028-02-01', end: '2028-02-29', days: 29 });
    expect(nutritionWeek('2027-01-01')[0]).toBe('2026-12-26');
  });
});
describe('Nutrition week and month existing reads', () => {
  it('requests the last seven days ending today and opens the tapped date', async () => {
    const select = jest.fn();
    const view = render(wrap(<NutritionWeek date="2026-10-02" today="2026-10-02" onSelect={select} />));
    await waitFor(() => expect(mockReport).toHaveBeenCalledWith(mockClient, { period: 'custom', from: '2026-09-26', to: '2026-10-02' }, expect.anything()));
    fireEvent.press(view.getByTestId('nutrition-week-2026-10-01'));
    expect(select).toHaveBeenCalledWith('2026-10-01');
  });
  it('hides old week data synchronously and ignores its late response', async () => {
    let finish!: (result: MobileApiReadResult<NutritionReport>) => void;
    mockReport.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const view = render(wrap(<NutritionWeek date="2026-10-02" today="2026-10-10" onSelect={jest.fn()} />));
    view.rerender(wrap(<NutritionWeek date="2026-10-09" today="2026-10-10" onSelect={jest.fn()} />));
    await waitFor(() => expect(view.getByTestId('nutrition-week-2026-10-09').props.accessibilityLabel).toContain('Calorías 100'));
    await act(async () => finish(ok(reportFixture({ period: 'custom', from: '2026-09-28', to: '2026-10-04' }))));
    expect(view.queryByTestId('nutrition-week-2026-10-02')).toBeNull();
  });
  it('does not turn failed week reads into empty days and exposes a retry', async () => {
    mockReport.mockResolvedValueOnce(failure);
    const view = render(wrap(<NutritionWeek date="2026-10-02" today="2026-10-02" onSelect={jest.fn()} />));
    await view.findByText('Semana no disponible.');
    expect(view.getByTestId('nutrition-week-2026-10-01').props.accessibilityLabel).toContain('No disponible');
    fireEvent.press(view.getByText('Reintentar semana'));
    await waitFor(() => expect(view.queryByText('Semana no disponible.')).toBeNull());
  });
  it('refreshes the weekly read on pull-to-refresh and labels stale data', async () => {
    const view = render(wrap(<NutritionWeek date="2026-10-02" today="2026-10-02" refreshRevision={0} onSelect={jest.fn()} />));
    await waitFor(() => expect(view.getByTestId('nutrition-week-2026-10-01').props.accessibilityLabel).toContain('Calorías 100'));
    mockReport.mockResolvedValueOnce(failure);
    view.rerender(wrap(<NutritionWeek date="2026-10-02" today="2026-10-02" refreshRevision={1} onSelect={jest.fn()} />));
    await view.findByText('Semana sin actualizar. Última lectura.');
  });
  it('renders a month with real coverage, future dates disabled and date selection', async () => {
    const select = jest.fn(), close = jest.fn();
    const view = render(wrap(<NutritionMonthSheet date="2026-10-02" today="2026-10-02" onSelect={select} onClose={close} />));
    await waitFor(() => expect(mockReport).toHaveBeenCalledWith(mockClient, { period: 'custom', from: '2026-10-01', to: '2026-10-02' }, expect.anything()));
    expect(await view.findByText('100 kcal · 1 de 1 días')).toBeTruthy();
    expect(view.getByTestId('nutrition-month-2026-10-03').props.accessibilityState.disabled).toBe(true);
    await act(async () => { fireEvent.press(view.getByTestId('nutrition-month-2026-10-01')); });
    // The sheet slides out first; once iOS reports it gone, it closes and selects the day.
    await act(async () => { fireEvent(view.UNSAFE_getByType(Modal), 'dismiss'); });
    expect(select).toHaveBeenCalledWith('2026-10-01'); expect(close).toHaveBeenCalledTimes(1);
  });
  it('a month read once opens with its rings at once and is revalidated in the background', async () => {
    const first = render(wrap(<NutritionMonthSheet date="2026-10-02" today="2026-10-02" onSelect={jest.fn()} onClose={jest.fn()} />));
    expect(await first.findByText('100 kcal · 1 de 1 días')).toBeTruthy();
    first.unmount();
    let finish!: (r: MobileApiReadResult<NutritionReport>) => void;
    mockReport.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const again = render(wrap(<NutritionMonthSheet date="2026-10-02" today="2026-10-02" onSelect={jest.fn()} onClose={jest.fn()} />));
    expect(again.getByText('100 kcal · 1 de 1 días')).toBeTruthy();
    await act(async () => { finish(failure); });
  });
  it('always six rows; the month title opens a month/year picker without future months', async () => {
    const view = render(wrap(<NutritionMonthSheet date="2026-10-02" today="2026-10-02" onSelect={jest.fn()} onClose={jest.fn()} />));
    await waitFor(() => expect(view.getByTestId('nutrition-month-2026-10-31')).toBeTruthy());
    expect(view.getByTestId('nutrition-month').children).toHaveLength(7); // weekdays + six weeks
    fireEvent.press(view.getByTestId('nutrition-month-title'));
    // iOS month/year wheels: a month after today snaps back to today's month.
    fireEvent(view.UNSAFE_getByProps({ label: 'Mes' }), 'selectionChange', 11);
    expect(view.getByTestId('nutrition-month-title').props.accessibilityLabel).toContain('Octubre de 2026');
    fireEvent(view.UNSAFE_getByProps({ label: 'Año' }), 'selectionChange', 2025);
    fireEvent(view.UNSAFE_getByProps({ label: 'Mes' }), 'selectionChange', 5);
    fireEvent.press(view.getByTestId('nutrition-month-title'));
    await waitFor(() => expect(view.getByTestId('nutrition-month-2025-05-01')).toBeTruthy());
    expect(view.queryByText('Volver a hoy')).toBeNull(); expect(view.queryByText('Otra fecha')).toBeNull(); expect(view.queryByText('Cerrar calendario')).toBeNull();
  });
  it('keeps monthly failure explicit and skips future-only reads', async () => {
    mockReport.mockResolvedValueOnce(failure);
    const view = render(wrap(<NutritionMonthSheet date="2026-10-02" today="2026-10-02" onSelect={jest.fn()} onClose={jest.fn()} />));
    await view.findByText('No pudimos cargar este mes.');
    expect(view.getByTestId('nutrition-month-2026-10-01').props.accessibilityLabel).toContain('No disponible');
    fireEvent.press(view.getByLabelText('Mes siguiente'));
    await waitFor(() => expect(view.getByTestId('nutrition-month-2026-11-01')).toBeTruthy());
    // Only past months are read (the one before is read ahead); a future month never is.
    const ranges = mockReport.mock.calls.map(call => (call[1] as ReportQuery).from);
    expect(ranges).not.toContain('2026-11-01'); expect(ranges).toContain('2026-09-01');
  });
});
