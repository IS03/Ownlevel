import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { metricOriginalHref, metricsChartOrigin, ReturnToMetricChart } from './metrics-chart-navigation';
let mockParams: Record<string, unknown> = {};
let mockHasBack = false;
const mockBack = jest.fn(), mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: () => mockHasBack }) }));
const id = 'c1000000-0000-4000-8000-000000000001';
describe('metric chart original navigation', () => {
  it('validates UUID, calendar dates, ordered interval and arrays before offering a link', () => {
    expect(metricOriginalHref(id, '2026-02-30')).toBeNull();
    expect(metricOriginalHref('pasos', '2026-10-01')).toBeNull();
    expect(metricOriginalHref(id, '2026-10-10', '2026-10-01')).toBeNull();
    expect(metricOriginalHref(id, '2026-10-01', '2026-11-01')).toBeNull();
    expect(metricsChartOrigin({ fromMetricsChart: ['1'], metricsChartMetric: id })).toBeNull();
    expect(metricsChartOrigin({ fromMetricsChart: '1', metricsChartMetric: [id] })).toBeNull();
    expect(metricsChartOrigin({ fromMetricsChart: '1', metricsChartMetric: id, metricsChartStart: '2026-10-01' })).toBeNull();
    expect(metricOriginalHref(id, '2026-12-31', '2027-01-02')?.params).toMatchObject({ date: '2026-12-31', metricsChartEnd: '2027-01-02' });
    expect(metricOriginalHref(id, '2026-10-01', '2026-10-01', true)?.params).toMatchObject({ metricsChartStart: '2026-10-01', metricsChartEnd: '2026-10-01' });
  });
  it('uses the retained stack; a cold link has a fixed fallback without reflecting an arbitrary return route', () => {
    mockParams = { ...metricOriginalHref(id, '2026-10-01')!.params, returnTo: '/untrusted' };
    const view = render(<OwnlevelThemeProvider><ReturnToMetricChart /></OwnlevelThemeProvider>);
    fireEvent.press(view.getByRole('button', { name: 'Volver al gráfico de la métrica' }));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(tabs)/progress/trends/metrics', params: { metric: id } });
    mockHasBack = true;
    fireEvent.press(view.getByRole('button', { name: 'Volver al gráfico de la métrica' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
    mockParams = {}; view.rerender(<OwnlevelThemeProvider><ReturnToMetricChart /></OwnlevelThemeProvider>);
    expect(view.queryByRole('button')).toBeNull();
  });
});
