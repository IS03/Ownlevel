import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { CompareSheet } from './period-sheets';
import { CompareChip } from './period-controls';
import { useEffect } from 'react';
import { Modal } from 'react-native';
import { ProgressRangeProvider, useProgressRange } from './progress-range-context';
import type { ProgressRangeState } from './progress-range';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/platform/haptics', () => ({ haptics: { selection: jest.fn() }, triggerHaptic: jest.fn() }));
const rn = jest.requireActual<typeof import('react-native')>('react-native');
const TODAY = '2026-10-17';
// A (1–17 oct, 17 días) against a custom B of a different length (agosto, 31 días).
const state: ProgressRangeState = { unit: 'month', anchor: TODAY, custom: null, compare: { kind: 'custom', range: { start: '2026-08-01', end: '2026-08-31' } } };
let observed: ReturnType<typeof useProgressRange>;
function Observe() { const value = useProgressRange(); useEffect(() => { observed = value; }, [value]); return null; }
const wrap = (initial = state, proposal?: {start: string; end: string}, onApplied?: () => void) => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
  <OwnlevelThemeProvider initialMode="light"><ProgressRangeProvider initialToday={TODAY} initialState={initial}><CompareSheet proposal={proposal} onApplied={onApplied} onClose={() => undefined} /><Observe /></ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>);

describe('P1-B5 Comparar', () => {
  it('each period says how long it lasts, so A and B of different lengths read as such', () => {
    const dims = jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
    const view = wrap();
    expect(view.getByTestId('compare-cell-a').props.accessibilityLabel).toBe('Período elegido: 1–17 oct, 17 días');
    expect(view.getByTestId('compare-cell-b').props.accessibilityLabel).toBe('Referencia: 1–31 ago, 31 días');
    expect(rn.StyleSheet.flatten(view.getByTestId('compare-ab').props.style).flexDirection).toBe('row');
    for (const label of ['Período anterior', 'Año pasado', 'Personalizado'])
      expect(rn.StyleSheet.flatten(view.getByRole('button', { name: label }).props.style).minHeight).toBeGreaterThanOrEqual(44);
    dims.mockRestore();
  });
  it('stacks A over B with large text instead of squeezing the dates', () => {
    const dims = jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1.6 });
    const view = wrap();
    expect(rn.StyleSheet.flatten(view.getByTestId('compare-ab').props.style).flexDirection).toBe('column');
    expect(view.getByText('17 días')).toBeTruthy(); expect(view.getByText('31 días')).toBeTruthy();
    fireEvent.press(view.getByTestId('compare-cell-b'));
    // Calendar rows grow with the text size: no day number overlaps the next row.
    expect(rn.StyleSheet.flatten(view.getByRole('button', { name: '15 de agosto' }).props.style).height).toBe(40 * 1.6);
    expect(rn.StyleSheet.flatten(view.getByRole('button', { name: 'Mes anterior' }).props.style).minHeight).toBeGreaterThanOrEqual(44);
    dims.mockRestore();
  });
  it('P1-C1: the comparison chip states both lengths when A and B differ, and nothing when they match', () => {
    const chip = (s: ProgressRangeState) => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <OwnlevelThemeProvider initialMode="light"><ProgressRangeProvider initialToday={TODAY} initialState={s}><CompareChip onOpen={() => undefined} /></ProgressRangeProvider></OwnlevelThemeProvider></SafeAreaProvider>);
    const different = chip(state);
    expect(different.getByTestId('progress-compare-lengths', { includeHiddenElements: true }).props.children).toBe('A dura 17 días y B, 31 días: los totales de períodos de distinta duración no son equivalentes.');
    expect(different.getByTestId('progress-compare-chip').props.accessibilityLabel).toBe('Comparando con 1–31 ago. A dura 17 días y B, 31 días: los totales de períodos de distinta duración no son equivalentes. Cambiar');
    const same = chip({ ...state, compare: { kind: 'previous' } });
    expect(same.queryByTestId('progress-compare-lengths', { includeHiddenElements: true })).toBeNull();
  });
});

it('opens compact, initializes the calendar on B, and commits only after the animated dismissal', () => {
  const applied = jest.fn();
  const view = wrap(state, undefined, applied);
  expect(view.queryByTestId('progress-range-calendar')).toBeNull();
  fireEvent.press(view.getByTestId('compare-cell-b'));
  expect(view.getByText('Agosto 2026')).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: '1 de agosto' }));
  expect(view.getByTestId('compare-apply')).toBeDisabled();
  fireEvent.press(view.getByRole('button', { name: '10 de agosto' }));
  const before = observed.state;
  fireEvent.press(view.getByTestId('compare-apply'));
  expect(observed.state).toBe(before); expect(applied).not.toHaveBeenCalled();
  fireEvent(view.UNSAFE_getByType(Modal), 'dismiss');
  expect(observed.compare).toEqual({start: '2026-08-01', end: '2026-08-10'});
  expect(applied).toHaveBeenCalledTimes(1);
});
it('editing A recalculates quick B from the completed draft, preserving calendar semantics when unchanged', () => {
  const initial: ProgressRangeState = {...state, compare: {kind: 'previous'}};
  const view = wrap(initial);
  fireEvent.press(view.getByTestId('compare-cell-b'));
  expect(view.getByText('Septiembre 2026')).toBeTruthy();
  fireEvent.press(view.getByTestId('compare-cell-a'));
  fireEvent.press(view.getByRole('button', {name: '5 de octubre'}));
  fireEvent.press(view.getByRole('button', {name: '10 de octubre'}));
  expect(view.getByTestId('compare-cell-b').props.accessibilityLabel).toBe('Referencia: 29 sep – 4 oct, 6 días');
  fireEvent.press(view.getByRole('button', {name: 'Año pasado'}));
  expect(view.getByTestId('compare-cell-b').props.accessibilityLabel).toBe('Referencia: 5–10 oct 2025, 6 días');
  fireEvent.press(view.getByTestId('compare-apply'));
  fireEvent(view.UNSAFE_getByType(Modal), 'dismiss');
  expect(observed.query).toEqual({period: 'custom', from: '2026-10-05', to: '2026-10-10'});
  expect(observed.compare).toEqual({start: '2025-10-05', end: '2025-10-10'});
});
it('cancel/backdrop leaves A and B untouched, including the proposed range', () => {
  const view = wrap(state, {start: '2026-09-18', end: TODAY});
  const before = observed.state;
  fireEvent.press(view.getByRole('button', {name: 'Año pasado'}));
  fireEvent.press(view.getByLabelText('Cancelar comparación', {includeHiddenElements: true}));
  fireEvent(view.UNSAFE_getByType(Modal), 'dismiss');
  expect(observed.state).toBe(before);
});
it('choosing the previous month keeps its elapsed calendar span, and remove comparison preserves active A', () => {
  const view = wrap({...state, compare: {kind: 'none'}});
  expect(view.getByTestId('compare-cell-b').props.accessibilityLabel).toBe('Referencia: 1–17 sep, 17 días');
  fireEvent.press(view.getByTestId('compare-apply')); fireEvent(view.UNSAFE_getByType(Modal), 'dismiss');
  expect(observed.state.unit).toBe('month'); expect(observed.state.compare).toEqual({kind: 'previous'});
});
