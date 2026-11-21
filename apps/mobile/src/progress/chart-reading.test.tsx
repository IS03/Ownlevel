import { act, fireEvent, render } from '@testing-library/react-native';
import { expect, it, jest } from '@jest/globals';
import { StyleSheet, View } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { ChartReadout, type ChartReading } from './chart-reading';
import { ComparisonChart } from './comparison-chart';
import { ChartBar } from './chart-marks';
import { FittedChart } from './fitted-chart';
import type { ProgressSpark } from '@/api/progress';
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() } }));
const readings: ChartReading[] = [
  { title: 'Período completo', value: '2,07 L', detail: 'Promedio diario · 29 días con dato' },
  { title: '5–11 nov', value: '1,93 L', detail: 'Promedio semanal · 7 días con dato' },
];
it('reserves the largest real reading, keeps measuring copies hidden and clears explicitly', async () => {
  const clear = jest.fn();
  const tree = (selected: boolean) => <OwnlevelThemeProvider><ChartReadout reading={readings[selected ? 1 : 0]} candidates={readings} testID="readout" onClear={selected ? clear : undefined} /></OwnlevelThemeProvider>;
  const view = render(tree(false)); await act(async () => {});
  const measurements = view.UNSAFE_getAllByType(View).filter(node => node.props.onLayout && StyleSheet.flatten(node.props.style)?.position === 'absolute');
  measurements.forEach((node, i) => fireEvent(node, 'layout', { nativeEvent: { layout: { height: 100 + i * 20 } } }));
  const reserved = () => StyleSheet.flatten(view.getByTestId('readout-reserve').props.style).minHeight;
  const before = reserved();
  expect(before).toBeGreaterThanOrEqual(120);
  expect(view.queryByText('1,93 L')).toBeNull();
  view.rerender(tree(true));
  expect(reserved()).toBe(before);
  expect(view.getByText('1,93 L')).toBeTruthy();
  expect(view.queryByText('2,07 L')).toBeNull();
  fireEvent.press(view.getByRole('button', { name: 'Quitar selección del gráfico' }));
  expect(clear).toHaveBeenCalledTimes(1);
});
it('scrubs real points after a hold, ignores repeated coordinates, and does not toggle again on release', () => {
  const selected = jest.fn();
  const view = render(<OwnlevelThemeProvider><FittedChart mode="bars" selectedKey={null} onSelect={selected} testID="scrub"
    range={{ start: '2026-11-01', end: '2026-11-03' }} points={[1, 2, 3].map(n => ({ key: `${n}`, start: `2026-11-0${n}`, end: `2026-11-0${n}`, value: n, text: `${n} L` }))} /></OwnlevelThemeProvider>);
  const plot = view.getByTestId('scrub-plot');
  fireEvent(plot, 'pressIn'); fireEvent(plot, 'longPress', { nativeEvent: { locationX: 16 } });
  fireEvent(plot, 'touchMove', { nativeEvent: { locationX: 150 } }); fireEvent(plot, 'touchMove', { nativeEvent: { locationX: 150 } });
  fireEvent(plot, 'pressOut'); fireEvent.press(plot, { nativeEvent: { locationX: 150 } });
  expect(selected.mock.calls).toEqual([['1'], ['2']]);
});
it('draws signed comparison bars from the shared zero baseline', () => {
  const range = { start: '2026-11-01', end: '2026-11-01' };
  const spark = { current: [{ ...range, value: 10 }], reference: [{ ...range, value: -10 }] } as ProgressSpark;
  const view = render(<OwnlevelThemeProvider><ComparisonChart spark={spark} current={range} reference={range} mode="bars" unit="series" testID="comparison" selection={null} onSelect={jest.fn()} /></OwnlevelThemeProvider>);
  const bars = view.UNSAFE_getAllByType(ChartBar);
  expect(bars[0].props.height).toBeGreaterThan(0);
  expect(bars[0].props.height).toBe(bars[1].props.height);
  expect(bars[0].props.negative).toBe(true); expect(bars[1].props.negative).toBe(false);
});
