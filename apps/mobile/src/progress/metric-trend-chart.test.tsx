import { useState } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import type { ProgressMetrics } from '@/api/progress';
import { OwnlevelThemeProvider } from '@/design-system';
import { MetricTrendChart, type MetricPointSelection } from './metric-trend-chart';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

// Entirely synthetic presentation DTOs; no API, session or persistence access.
function fixture(bucket: 'day' | 'week' | 'month' = 'day'): ProgressMetrics {
  const metric = { id: 'synthetic', systemKey: null, name: 'Pasos', unit: 'pasos', valueType: 'integer' as const, isActive: true, currentTarget: 10000 };
  return { today: '2026-11-02', metric, definitions: [metric], summary: null, previous: null, comparison: null,
    period: { preset: 'custom', start: '2026-10-26', end: '2026-11-01', days: 7, previousStart: '2026-10-19', previousEnd: '2026-10-25', bucket, includesToday: false },
    series: [
      { start: '2026-10-26', end: '2026-10-26', value: 0, samples: 1 },
      { start: '2026-10-27', end: '2026-10-27', value: null, samples: 0 },
      { start: '2026-10-28', end: '2026-10-28', value: 11300, samples: 1 },
    ] };
}
const screen = (data: ProgressMetrics, dark = false) => <OwnlevelThemeProvider initialMode={dark ? 'dark' : 'light'}><MetricTrendChart data={data} /></OwnlevelThemeProvider>;

describe('metric bar inspection (#377)', () => {
  it.each([false, true])('selects zero, missing, and exact daily values; another tap deselects (dark=%s)', async dark => {
    const view = render(screen(fixture(), dark)); await act(async () => {});
    const readout = () => view.getByTestId('metric-trend-readout').props.accessibilityLabel;
    const zero = view.getByTestId('metric-trend-chart-2026-10-26-zero');
    fireEvent.press(zero);
    expect(readout()).toBe('26/10/2026, 0 pasos');
    expect(zero.props.accessibilityState.selected).toBe(true);
    fireEvent.press(view.getByTestId('metric-trend-chart-2026-10-27-gap'));
    expect(readout()).toBe('27/10/2026, Sin dato');
    expect(zero.props.accessibilityState.selected).toBe(false);
    const last = view.getByTestId('metric-trend-chart-2026-10-28-mark');
    fireEvent.press(last);
    expect(readout()).toBe('28/10/2026, 11.300 pasos');
    expect(last.props.accessibilityLabel).toContain('11.300 pasos');
    fireEvent.press(last);
    expect(readout()).toMatch(/^Tocá una barra,/);
    expect(last.props.accessibilityState.selected).toBe(false);
  });

  it.each(['week', 'month'] as const)('shows the true %s range, aggregate and sample coverage, including partial buckets', async bucket => {
    const data = fixture(bucket);
    const start = bucket === 'month' ? '2026-10-01' : '2026-10-26';
    const end = bucket === 'month' ? '2026-10-31' : '2026-11-01';
    data.series = [{ start, end, value: 10414, samples: 5 },
      { start: '2026-11-02', end: '2026-11-02', value: 0, samples: 1 }];
    const view = render(screen(data)); await act(async () => {});
    fireEvent.press(view.getByTestId(`metric-trend-chart-${start}-mark`));
    const aggregate = bucket === 'week' ? 'Promedio semanal' : 'Promedio mensual';
    const range = bucket === 'month' ? '01/10/2026 – 31/10/2026' : '26/10/2026 – 01/11/2026';
    expect(view.getByTestId('metric-trend-readout').props.accessibilityLabel).toBe(`${range}, ${aggregate} · 10.414 pasos · 5 días con dato`);
    fireEvent.press(view.getByTestId('metric-trend-chart-2026-11-02-zero'));
    expect(view.getByTestId('metric-trend-readout').props.accessibilityLabel).toBe(`02/11/2026, ${aggregate} · 0 pasos · 1 día con dato`);
  });

  it('drops selection on a new data snapshot even with identical dates and formats duration in its own semantics', async () => {
    const data = fixture();
    const view = render(screen(data)); await act(async () => {});
    fireEvent.press(view.getByTestId('metric-trend-chart-2026-10-28-mark'));
    view.rerender(screen({ ...data }));
    expect(view.getByTestId('metric-trend-readout').props.accessibilityLabel).toMatch(/^Tocá una barra,/);
    const sleep = { ...data, metric: { ...data.metric!, valueType: 'duration' as const, unit: 'min' },
      series: [{ start: '2026-10-28', end: '2026-10-28', value: 450, samples: 1 }] };
    view.rerender(screen(sleep));
    fireEvent.press(view.getByTestId('metric-trend-chart-2026-10-28-mark'));
    expect(view.getByTestId('metric-trend-readout').props.accessibilityLabel).toBe('28/10/2026, 7 h 30 min');
  });

  it('keeps 44 pt targets in long series and preserves null/zero/negative values with a zero target', async () => {
    const data = fixture(); data.metric!.currentTarget = 0;
    data.series = Array.from({ length: 30 }, (_, i) => ({ start: `2026-10-${String(i + 1).padStart(2, '0')}`, end: `2026-10-${String(i + 1).padStart(2, '0')}`, value: i === 0 ? -5 : i === 1 ? 0 : null, samples: i < 2 ? 1 : 0 }));
    const view = render(screen(data)); await act(async () => {});
    expect(StyleSheet.flatten(view.getByTestId('metric-trend-chart').props.style).minWidth).toBeGreaterThanOrEqual(30 * 44);
    for (const button of view.getAllByRole('button')) expect(StyleSheet.flatten(button.props.style).minWidth).toBeGreaterThanOrEqual(44);
    expect(view.getByTestId('metric-trend-chart-target', { includeHiddenElements: true })).toBeTruthy();
    expect(view.getAllByTestId(/-gap$/)).toHaveLength(28);
    fireEvent.press(view.getByTestId('metric-trend-chart-2026-10-01-mark'));
    expect(view.getByTestId('metric-trend-readout').props.accessibilityLabel).toBe('01/10/2026, -5 pasos');
  });
});

function OwnedChart({ data, open }: { data: ProgressMetrics; open: (start: string, end: string) => void }) {
  const [selection, onSelect] = useState<MetricPointSelection>(null);
  return <OwnlevelThemeProvider><MetricTrendChart data={data} inspection={{ selection, onSelect }} onOpen={open} /></OwnlevelThemeProvider>;
}
describe('metric original actions', () => {
  it('inspects a zero or gap locally, opens its exact day explicitly, and reconciles current values', async () => {
    const open = jest.fn<(start: string, end: string) => void>(), data = fixture();
    const view = render(<OwnedChart data={data} open={open} />); await act(async () => {});
    fireEvent.press(view.getByTestId('metric-trend-chart-2026-10-26-zero'));
    expect(open).not.toHaveBeenCalled();
    fireEvent.press(view.getByRole('button', { name: 'Abrir registro diario original' }));
    expect(open).toHaveBeenLastCalledWith('2026-10-26', '2026-10-26');
    view.rerender(<OwnedChart data={{ ...data, series: data.series.map((p, i) => i === 0 ? { ...p, value: 12 } : p) }} open={open} />);
    expect(view.getByTestId('metric-trend-readout').props.accessibilityLabel).toBe('26/10/2026, 12 pasos');
    fireEvent.press(view.getByTestId('metric-trend-chart-2026-10-27-gap'));
    expect(view.getByTestId('metric-trend-readout').props.accessibilityLabel).toBe('27/10/2026, Sin dato');
    fireEvent.press(view.getByRole('button', { name: 'Abrir registro diario original' }));
    expect(open).toHaveBeenLastCalledWith('2026-10-27', '2026-10-27');
  });
  it.each(['week', 'month'] as const)('keeps the true %s interval, sample and today warning instead of attributing the average to its first day', async bucket => {
    const data = fixture(bucket), open = jest.fn<(start: string, end: string) => void>();
    data.series = [{ start: '2026-10-30', end: '2026-11-02', value: 700, samples: 2 }];
    const view = render(<OwnedChart data={data} open={open} />); await act(async () => {});
    fireEvent.press(view.getByTestId('metric-trend-chart-2026-10-30-mark'));
    expect(view.getByTestId('metric-trend-readout').props.accessibilityLabel).toContain('30/10/2026 – 02/11/2026');
    expect(view.getByText(/2 días con dato en esta barra/)).toBeTruthy();
    expect(view.getByText(/Hoy sigue en curso/)).toBeTruthy();
    expect(view.getByText(/Este promedio no es un registro diario/)).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Abrir registro diario original' })).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Recorrer días del intervalo' }));
    expect(open).toHaveBeenCalledWith('2026-10-30', '2026-11-02');
  });
});
