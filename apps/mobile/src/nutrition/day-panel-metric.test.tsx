import { act, render } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import type { MobileNutritionDayResponse } from '@/api/nutrition-day';
import { NutritionDayPanel } from './day-panel';
import { nutritionFixture } from './day-fixture.test-helper';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
let mockReduced = false;
jest.mock('@/design-system', () => ({ ...jest.requireActual<object>('@/design-system'), useReduceMotion: () => mockReduced }));
jest.mock('@/metrics/presentation-provider', () => ({ useMetricPresentations: () => [] }));

const steps = (value: number | null, target: number | null = 8000): MobileNutritionDayResponse => {
  const data = nutritionFixture();
  if (data.activity.status !== 'ok') throw new Error('fixture');
  data.activity.data.metrics = [{ ...data.activity.data.metrics[0], id: 'steps-1', label: 'Pasos', unit: 'pasos', valueType: 'integer', systemKey: 'steps', value, target, isActive: true }];
  return data;
};
const H = { includeHiddenElements: true };
const panel = (data: MobileNutritionDayResponse, onMetric?: () => void) => <OwnlevelThemeProvider initialMode="dark"><NutritionDayPanel data={data} onDetail={() => undefined} onMetric={onMetric} /></OwnlevelThemeProvider>;
beforeEach(() => { jest.useFakeTimers(); mockReduced = false; });
afterEach(() => { jest.useRealTimers(); });

describe('#510 Pasos in «Tu día»', () => {
  it('has the same structure with and without a reading: the goal is always its own line, so the icon never moves', () => {
    const empty = render(panel(steps(null))), filled = render(panel(steps(12900)));
    expect(empty.getByText('/ 8.000 pasos')).toBeTruthy(); expect(filled.getByText('/ 8.000 pasos')).toBeTruthy();
    expect(empty.getByText('—')).toBeTruthy(); expect(filled.getByText('12.900 pasos')).toBeTruthy();
    const cell = (view: typeof empty) => { let node = view.getByTestId('nutrition-metric-ring-steps-1', H).parent; while (node && StyleSheet.flatten(node.props.style)?.minWidth !== '42%') node = node.parent; return node!; };
    expect(cell(filled).children.length).toBe(cell(empty).children.length);
    expect(StyleSheet.flatten(cell(empty).props.style)).toMatchObject({ alignItems: 'center', minHeight: 44 });
    // Label, value and goal are three lines of one column, with or without a reading.
    const column = (view: typeof empty) => view.getByText('/ 8.000 pasos').parent!.children.length;
    expect(column(filled)).toBe(column(empty));
  });
  it('without a reading the ring shows a solid, visible track (not the dotted one) and no arc', () => {
    const view = render(panel(steps(null)));
    const track = view.getByTestId('nutrition-metric-ring-steps-1-unknown', H);
    expect(track.props.strokeDasharray).toBeUndefined();
    expect(view.queryByTestId('nutrition-metric-ring-steps-1-base', H)).toBeNull();
  });
  it('a first reading after mount fills the ring from empty (past the goal: base full plus the extra lap)', () => {
    const view = render(panel(steps(null)));
    view.rerender(panel(steps(12900)));
    expect(view.queryByTestId('nutrition-metric-ring-steps-1-base', H)).toBeNull(); // starts empty, never the full ring first
    act(() => { jest.advanceTimersByTime(300); });
    expect(view.queryByTestId('nutrition-metric-ring-steps-1-base', H)).toBeTruthy();
    act(() => { jest.advanceTimersByTime(2000); });
    expect(view.getByTestId('nutrition-metric-ring-steps-1-base', H)).toBeTruthy(); expect(view.getByTestId('nutrition-metric-ring-steps-1-excess', H)).toBeTruthy();
    expect(view.getByText('12.900 pasos')).toBeTruthy(); // the text never counts: it shows the confirmed value
  });
  it('opening a day that already has the value draws it at once', () => {
    const view = render(panel(steps(12900)));
    expect(view.getByTestId('nutrition-metric-ring-steps-1-base', H)).toBeTruthy(); expect(view.getByTestId('nutrition-metric-ring-steps-1-excess', H)).toBeTruthy();
  });
  it('Reduce Motion: the ring switches at once', () => {
    mockReduced = true;
    const view = render(panel(steps(null)));
    view.rerender(panel(steps(12900)));
    expect(view.getByTestId('nutrition-metric-ring-steps-1-base', H)).toBeTruthy();
  });
  it('a confirmed zero is a drawn state of its own (full track, no arc), different from no reading; no goal draws no arc', () => {
    const zero = render(panel(steps(0)));
    expect(zero.getByText('0 pasos')).toBeTruthy(); expect(zero.getByTestId('nutrition-metric-ring-steps-1-track', H)).toBeTruthy(); expect(zero.queryByTestId('nutrition-metric-ring-steps-1-base', H)).toBeNull();
    const noGoal = render(panel(steps(5000, null)));
    expect(noGoal.queryByTestId('nutrition-metric-ring-steps-1-base', H)).toBeNull(); expect(noGoal.queryByText(/^\//)).toBeNull();
  });
  describe('a confirmed value back to «Sin dato» (undone first reading)', () => {
    const label = /^Pasos: Sin dato \/ 8\.000 pasos\./, edit = () => undefined;
    it('the text and VoiceOver say «Sin dato» at the confirmation while the ring drains to empty', () => {
      const view = render(panel(steps(12900), edit));
      expect(view.getByTestId('nutrition-metric-ring-steps-1-excess', H)).toBeTruthy();
      expect(view.getByLabelText(/^Pasos: 12\.900 pasos \/ 8\.000 pasos\./)).toBeTruthy();
      view.rerender(panel(steps(null), edit));
      // Already «Sin dato» in the text and the spoken label; the ring still holds the previous drawing for its first frame.
      expect(view.getByText('—')).toBeTruthy(); expect(view.queryByText('12.900 pasos')).toBeNull();
      expect(view.getByLabelText(label)).toBeTruthy();
      expect(view.getByTestId('nutrition-metric-ring-steps-1-base', H)).toBeTruthy();
      act(() => { jest.advanceTimersByTime(250); });
      expect(view.getByTestId('nutrition-metric-ring-steps-1-base', H)).toBeTruthy(); // draining, not gone at once
      expect(view.getByLabelText(label)).toBeTruthy();
      act(() => { jest.advanceTimersByTime(2000); });
      expect(view.queryByTestId('nutrition-metric-ring-steps-1-base', H)).toBeNull();
      expect(view.queryByTestId('nutrition-metric-ring-steps-1-excess', H)).toBeNull();
      // It ends as «no reading» (the solid unknown track), not as a confirmed zero.
      expect(view.getByTestId('nutrition-metric-ring-steps-1-unknown', H)).toBeTruthy();
      expect(view.queryByText('0 pasos')).toBeNull();
    });
    it('Reduce Motion: the ring is empty at once, with the same text and label', () => {
      mockReduced = true;
      const view = render(panel(steps(12900), edit));
      view.rerender(panel(steps(null), edit));
      expect(view.queryByTestId('nutrition-metric-ring-steps-1-base', H)).toBeNull();
      expect(view.getByTestId('nutrition-metric-ring-steps-1-unknown', H)).toBeTruthy();
      expect(view.getByText('—')).toBeTruthy(); expect(view.getByLabelText(label)).toBeTruthy();
    });
    it('without the edit action the value still reads «Sin dato» to VoiceOver, not the dash', () => {
      const view = render(panel(steps(12900)));
      view.rerender(panel(steps(null)));
      expect(view.getByText('—').props.accessibilityLabel).toBe('Sin dato');
    });
    it('the cell keeps its geometry through the change', () => {
      const view = render(panel(steps(12900)));
      const column = () => view.getByText('/ 8.000 pasos').parent!.children.length;
      const before = column();
      view.rerender(panel(steps(null)));
      act(() => { jest.advanceTimersByTime(2000); });
      expect(column()).toBe(before);
    });
  });
});

