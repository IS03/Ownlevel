import { render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { CompareSheet } from './period-sheets';
import { ProgressRangeProvider } from './progress-range-context';
import type { ProgressRangeState } from './progress-range';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
const rn = jest.requireActual<typeof import('react-native')>('react-native');
const TODAY = '2026-10-17';
// A (1–17 oct, 17 días) against a custom B of a different length (agosto, 31 días).
const state: ProgressRangeState = { unit: 'month', anchor: TODAY, custom: null, compare: { kind: 'custom', range: { start: '2026-08-01', end: '2026-08-31' } } };
const wrap = () => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
  <OwnlevelThemeProvider initialMode="light"><ProgressRangeProvider initialToday={TODAY} initialState={state}><CompareSheet onClose={() => undefined} /></ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>);

describe('P1-B5 Comparar', () => {
  it('each period says how long it lasts, so A and B of different lengths read as such', () => {
    const dims = jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
    const view = wrap();
    expect(view.getByTestId('compare-cell-a').props.accessibilityLabel).toBe('Tu período: 1–17 oct, 17 días');
    expect(view.getByTestId('compare-cell-b').props.accessibilityLabel).toBe('Comparar con: 1–31 ago, 31 días');
    expect(rn.StyleSheet.flatten(view.getByTestId('compare-ab').props.style).flexDirection).toBe('row');
    for (const label of ['Período anterior', 'Año pasado', 'Sin comparar'])
      expect(rn.StyleSheet.flatten(view.getByRole('button', { name: label }).props.style).minHeight).toBeGreaterThanOrEqual(44);
    dims.mockRestore();
  });
  it('stacks A over B with large text instead of squeezing the dates', () => {
    const dims = jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1.6 });
    const view = wrap();
    expect(rn.StyleSheet.flatten(view.getByTestId('compare-ab').props.style).flexDirection).toBe('column');
    expect(view.getByText('17 días')).toBeTruthy(); expect(view.getByText('31 días')).toBeTruthy();
    // Calendar rows grow with the text size: no day number overlaps the next row.
    expect(rn.StyleSheet.flatten(view.getByRole('button', { name: '15 de agosto' }).props.style).height).toBe(40 * 1.6);
    expect(rn.StyleSheet.flatten(view.getByRole('button', { name: 'Mes anterior' }).props.style).minHeight).toBeGreaterThanOrEqual(44);
    dims.mockRestore();
  });
});
