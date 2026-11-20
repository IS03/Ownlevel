import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { OwnlevelThemeProvider } from '@/design-system';
import { ReturnToNutritionChart } from './nutrition-chart-navigation';
import { ReturnToMetricChart, metricOriginalHref } from './metrics-chart-navigation';
let mockParams: Record<string, unknown> = {};
let mockHasBack = false;
const mockNavigate = jest.fn(), mockBack = jest.fn(), mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ navigate: mockNavigate, back: mockBack, replace: mockReplace, canGoBack: () => mockHasBack }) }));
describe('return from a body context to its retained body detail', () => {
  it('returns from foods to Cuerpo, rather than accidentally opening the Nutrition progress chart', () => {
    mockParams = { fromProgressNutrition: '1', fromProgressBody: '1', fromProgressBodyMetric: 'body.waist' };
    const view = render(<OwnlevelThemeProvider><ReturnToNutritionChart /></OwnlevelThemeProvider>);
    fireEvent.press(view.getByRole('button', { name: 'Volver a Cuerpo' }));
    expect(mockNavigate).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/trends/body', params: { metric: 'body.waist' } });
  });
  it('pops metric originals to preserve selection, with a validated cold-link fallback', () => {
    mockParams = { ...metricOriginalHref('c1000000-0000-4000-8000-000000000001', '2026-11-01')!.params, fromProgressBody: '1', fromProgressBodyMetric: 'body.arm_left' };
    const view = render(<OwnlevelThemeProvider><ReturnToMetricChart /></OwnlevelThemeProvider>);
    fireEvent.press(view.getByRole('button', { name: 'Volver a Cuerpo' }));
    expect(mockReplace).toHaveBeenLastCalledWith({ pathname: '/(tabs)/progress/trends/body', params: { metric: 'body.arm_left' } });
    mockHasBack = true; fireEvent.press(view.getByRole('button', { name: 'Volver a Cuerpo' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('does not reflect an arbitrary body destination from route parameters', () => {
    mockParams = { fromProgressBody: '1', fromProgressBodyMetric: '/settings', fromProgressNutrition: '1' };
    const view = render(<OwnlevelThemeProvider><ReturnToNutritionChart /></OwnlevelThemeProvider>);
    expect(view.queryByRole('button', { name: 'Volver a Cuerpo' })).toBeNull();
    expect(view.getByRole('button', { name: 'Volver al gráfico de Nutrición' })).toBeTruthy();
  });
});
