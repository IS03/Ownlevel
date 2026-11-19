import { fireEvent, render, within } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Dimensions, StyleSheet } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { reportFixture } from '@/nutrition/report-fixture.test-helper';
import { NutritionTopics, NutritionTopicContent } from './nutrition-panorama';
import { nutritionChartDayHref, ReturnToNutritionChart } from './nutrition-chart-navigation';
import { nutritionSection } from './nutrition-sections';
const mockPush = jest.fn(), mockNavigate = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, navigate: mockNavigate }), useLocalSearchParams: () => mockParams }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
const initialWindow = Dimensions.get('window');
afterEach(() => { Dimensions.set({ window: initialWindow, screen: Dimensions.get('screen') }); mockParams = {}; jest.clearAllMocks(); });
const wrap = (children: React.ReactNode, mode: 'light' | 'dark' = 'light') => render(<OwnlevelThemeProvider initialMode={mode}>{children}</OwnlevelThemeProvider>);

describe('Nutrition panorama and destinations', () => {
  it.each(['light', 'dark'] as const)('gives each topic its destination and a subtle raised surface in %s', mode => {
    const compare = jest.fn();
    const view = wrap(<NutritionTopics report={reportFixture()} timing={null} onCompare={compare} />, mode);
    for (const section of ['protein', 'targets', 'macros', 'balance']) {
      const tile = view.getByTestId(`nutrition-topic-${section}`);
      expect(StyleSheet.flatten(tile.props.style).experimental_backgroundImage).toContain('gradient');
      expect(StyleSheet.flatten(tile.props.style).backgroundColor).not.toBe('#FFFFFF');
      fireEvent.press(tile);
      expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/trends/nutrition', params: { section } });
    }
    fireEvent.press(view.getByRole('button', { name: 'Comparar períodos' })); expect(compare).toHaveBeenCalledTimes(1);
    fireEvent.press(view.getByRole('button', { name: 'Etapas y objetivos históricos' })); expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/progress/stages');
  });
  it('filters unknown and partial protein independently; a real zero remains data', () => {
    const report = reportFixture({ period: 'custom', from: '2026-10-01', to: '2026-10-03' });
    report.days = report.days.map((d, i) => ({ ...d, nutrients: { ...d.nutrients, protein: i === 0 ? { value: 0, status: 'complete', knownMeals: 1, missingMeals: 0 } : i === 1 ? { value: null, status: 'unknown', knownMeals: 0, missingMeals: 1 } : { value: 40, status: 'partial', knownMeals: 1, missingMeals: 1 } } }));
    const onDate = jest.fn(), view = wrap(<NutritionTopicContent section="protein" report={report} onDate={onDate} />);
    fireEvent.press(view.getByRole('radio', { name: 'Con dato' }));
    expect(view.getByText('0 g')).toBeTruthy(); expect(view.getByText('40 g')).toBeTruthy();
    fireEvent.press(view.getByRole('radio', { name: 'Sin dato' }));
    expect(view.queryByText('0 g')).toBeNull(); expect(view.queryByText('40 g')).toBeNull();
    const missing = view.getByRole('button', { name: /^02\/10\/2026/ }); fireEvent.press(missing); expect(onDate).toHaveBeenCalledWith('2026-10-02');
    fireEvent.press(view.getByRole('radio', { name: 'Parciales' })); expect(view.getByText('40 g')).toBeTruthy(); expect(view.queryByText('0 g')).toBeNull();
  });
  it('shows the chosen macro using its own day value, without inventing an energy share from different denominators', () => {
    const report = reportFixture(); report.summary.metrics.carbs = { value: 222, denominator: 3, partialDays: 1 };
    const view = wrap(<NutritionTopicContent section="macros" report={report} onDate={jest.fn()} />);
    expect(view.getByText('3 días con dato · 1 parciales')).toBeTruthy();
    fireEvent.press(view.getByRole('radio', { name: 'Grasas' })); expect(view.getAllByText('0 g').length).toBeGreaterThan(0);
    expect(view.queryByText(/% de/)).toBeNull();
  });
  it('bounds a long day history and stacks topic tiles for large text', () => {
    const report = reportFixture({ period: '30' });
    const days = wrap(<NutritionTopicContent section="days" report={report} onDate={jest.fn()} />);
    expect(within(days.getByTestId('nutrition-report-day-rows')).getAllByRole('button')).toHaveLength(20);
    fireEvent.press(days.getByRole('button', { name: 'Ver más días' }));
    expect(within(days.getByTestId('nutrition-report-day-rows')).getAllByRole('button')).toHaveLength(30);
    days.unmount();
    Dimensions.set({ window: { ...initialWindow, fontScale: 2 }, screen: Dimensions.get('screen') });
    const tiles = wrap(<NutritionTopics report={report} timing={null} onCompare={jest.fn()} />);
    expect(StyleSheet.flatten(tiles.getByTestId('nutrition-topic-protein').props.style).width).toBe('100%');
  });
  it('retains an imported summary even when its original meals are not available', () => {
    const report = reportFixture({ period: 'custom', from: '2026-10-01', to: '2026-10-01' });
    report.days = report.days.map(d => ({ ...d, imported: true, mealCount: 0, hasNutrition: true }));
    const view = wrap(<NutritionTopicContent section="days" report={report} onDate={jest.fn()} />);
    const list = within(view.getByTestId('nutrition-report-day-rows'));
    expect(list.getByRole('button', { name: /100 kcal.*registro importado/ })).toBeTruthy();
    expect(list.queryByText('sin registro')).toBeNull();
  });
  it('returns to the originating section and rejects arbitrary sections in incoming links', () => {
    expect(nutritionChartDayHref('2026-10-01', 'protein')?.params).toEqual({ date: '2026-10-01', fromProgressNutrition: '1', fromProgressNutritionSection: 'protein' });
    mockParams = { fromProgressNutrition: '1', fromProgressNutritionSection: 'protein' };
    const view = wrap(<ReturnToNutritionChart />);
    fireEvent.press(view.getByRole('button', { name: 'Volver al gráfico de Nutrición' }));
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/(tabs)/progress/trends/nutrition', params: { section: 'protein' } });
    expect(nutritionSection('/settings')).toBeNull(); expect(nutritionSection(['protein'])).toBeNull(); expect(nutritionSection('__proto__')).toBeNull();
  });
});
