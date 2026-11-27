import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import type { ProgressBodyMetric } from '@/api/progress';
import { reportFixture } from '@/nutrition/report-fixture.test-helper';
import { BodyIntervalContext, BodyTimelineContext, WeeklyWeightReference } from './body-context';
import { pressFittedMark } from './fitted-chart.test-helper';
const mockPush = jest.fn(), mockRead = jest.fn();
const mockClient = {};
let mockUnavailable = false;
const mockTraining = { summary: { sessions: 1, sets: 1, minutes: 50 }, muscles: [{ key: 'back', label: 'Espalda', sets: 1 }] };
let mockReport = reportFixture({ period: 'custom', from: '2026-10-01', to: '2026-10-03' });
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
jest.mock('@/stages/stages-provider', () => ({ useNutritionStages: () => null }));
jest.mock('./use-progress-resource', () => ({ useProgressResource: (_c: unknown, key: string, load: unknown) => {
  mockRead(key, load);
  const data = mockUnavailable ? undefined : key.includes('nutrition') ? mockReport : key.includes('training') ? mockTraining : key.includes('choices') ? { definitions: [] } : undefined;
  return { data, state: { status: mockUnavailable ? 'unavailable' : 'ready' }, refresh: jest.fn() };
} }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useLocalSearchParams: () => ({}) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
const metric = { key: 'body.waist', label: 'Cintura', unit: 'cm', observations: [{ date: '2026-10-01', value: 80 }] } as ProgressBodyMetric;
const range = { start: '2026-10-01', end: '2026-10-03' };
const wrap = (node: React.ReactNode) => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}><OwnlevelThemeProvider initialMode="dark">{node}</OwnlevelThemeProvider></SafeAreaProvider>);
beforeEach(() => { mockUnavailable = false; mockRead.mockClear(); mockReport = reportFixture({ period: 'custom', from: range.start, to: range.end }); });
describe('Cuerpo interval and timeline context', () => {
  it('does not request context when endpoint exclusion leaves no days, or a timeline is closed', () => {
    const view = wrap(<BodyIntervalContext range={null} />);
    expect(view.getByText('No hay días intermedios para resumir contexto.')).toBeTruthy();
    expect(mockRead).not.toHaveBeenCalled();
    view.unmount(); wrap(<BodyTimelineContext range={range} metric={metric} selectedDate={null} onSelect={jest.fn()} />);
    expect(mockRead).not.toHaveBeenCalled();
  });
  it('shows each nutrient denominator and partial sums beside the numbers', () => {
    mockReport.summary.metrics.calories = { value: 2400, denominator: 2, partialDays: 1 };
    mockReport.summary.metrics.protein = { value: 0, denominator: 1, partialDays: 0 };
    const view = wrap(<BodyIntervalContext range={range} />);
    expect(view.getByText('2.400 kcal')).toBeTruthy(); expect(view.getByText('0 g')).toBeTruthy();
    expect(view.getByText(/Días con dato de 2 cerrados · Calorías: 2 \(1 parcial\) · Proteína: 1/)).toBeTruthy();
    expect(mockRead.mock.calls[0][0]).toBe('body-context-nutrition|2026-10-01|2026-10-03');
  });
  it('preserves unavailable instead of claiming empty meals or zero intake', () => {
    mockUnavailable = true;
    const view = wrap(<BodyIntervalContext range={range} />);
    expect(view.getAllByText(/No significa que no haya registros/).length).toBeGreaterThan(0);
    expect(view.queryByText('0 kcal')).toBeNull();
  });
  it('aligns selection without borrowing a body record and returns food inspection to Cuerpo', async () => {
    const selected = jest.fn();
    const view = wrap(<BodyTimelineContext range={range} metric={metric} selectedDate="2026-10-02" onSelect={selected} />);
    fireEvent.press(view.getByRole('button', { name: 'Ver junto a…' }));
    expect(view.getByText(/sin registro corporal en esta fecha/)).toBeTruthy();
    const count = mockRead.mock.calls.length;
    pressFittedMark(view.getByTestId('body-context-chart-2026-10-01-bar'));
    expect(selected).toHaveBeenCalledWith('2026-10-01');
    expect(mockRead.mock.calls.length).toBe(count);
    fireEvent.press(view.getByRole('button', { name: 'Ver comidas de esa fecha' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/nutrition', params: { date: '2026-10-02', fromProgressNutrition: '1', fromProgressBody: '1', fromProgressBodyMetric: 'body.waist' } });
    await act(async () => {});
  });
  it('keeps missing nutrient values as gaps in the timeline', () => {
    mockReport.days = mockReport.days.map(d => d.date === '2026-10-02' ? { ...d, nutrients: { ...d.nutrients, calories: { value: null, knownMeals: 0, missingMeals: 1, status: 'unknown' } } } : d);
    const view = wrap(<BodyTimelineContext range={range} metric={metric} selectedDate="2026-10-02" onSelect={jest.fn()} />);
    fireEvent.press(view.getByRole('button', { name: 'Ver junto a…' }));
    expect(view.getByTestId('body-context-chart-2026-10-02-gap')).toBeTruthy();
    expect(view.getByText('Sin dato de este nutriente en esta fecha')).toBeTruthy();
  });
  it('labels today as in progress instead of implying a closed day', () => {
    mockReport.days = mockReport.days.map(d => ({ ...d, isToday: d.date === '2026-10-03' }));
    const view = wrap(<BodyTimelineContext range={range} metric={metric} selectedDate="2026-10-03" onSelect={jest.fn()} />);
    fireEvent.press(view.getByRole('button', { name: 'Ver junto a…' }));
    expect(view.getByText('Hoy en curso; no entra en el promedio.')).toBeTruthy();
  });
  it('groups training in one honest summary: plurals, one group per exercise, no jump to Entrenar', () => {
    const view = wrap(<BodyIntervalContext range={range} />);
    fireEvent.press(view.getByRole('button', { name: 'Mirar, Alimentación' }));
    fireEvent.press(view.getByRole('button', { name: /Entrenamiento/ }));
    expect(view.getByRole('button', { name: 'Mirar, Entrenamiento' })).toBeTruthy();
    expect(mockRead.mock.calls.some(([key]) => String(key).startsWith('body-context-training|2026-10-01|2026-10-03'))).toBe(true);
    expect(view.getByText(/1 sesión · 1 serie/)).toBeTruthy();
    expect(view.getByText('1 serie')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Ver sesiones en el historial' })).toBeNull();
  });
  it('does not read ineligible weekly references, nor replace exact weights by default', () => {
    const view = wrap(<WeeklyWeightReference a="2026-11-16" b="2026-11-18" today="2026-11-19" />);
    expect(mockRead).not.toHaveBeenCalled();
    fireEvent.press(view.getByRole('button', { name: 'Peso semanal de referencia' }));
    expect(view.getByText(/dos semanas distintas, completas y cerradas/)).toBeTruthy();
    expect(mockRead).not.toHaveBeenCalled();
  });
});
