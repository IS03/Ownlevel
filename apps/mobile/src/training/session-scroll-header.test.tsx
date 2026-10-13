import { act, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Text, View } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { advanceSessionHeader, INITIAL_SESSION_HEADER, SessionScrollHeader } from './session-scroll-header';

describe('session scroll header', () => {
  it('hides on descent, returns after a small accumulated ascent anywhere, then hides on descent', () => {
    let state = advanceSessionHeader(INITIAL_SESSION_HEADER, 100, 100);
    expect(state).toMatchObject({ compact: false, controls: true });
    state = advanceSessionHeader(state, 140, 100); expect(state).toMatchObject({ compact: true, controls: false });
    state = advanceSessionHeader(state, 900, 100);
    for (const y of [898, 896, 894]) { state = advanceSessionHeader(state, y, 100); expect(state.controls).toBe(false); }
    state = advanceSessionHeader(state, 892, 100); expect(state.controls).toBe(true);
    state = advanceSessionHeader(state, 894, 100); expect(state.controls).toBe(true);
    state = advanceSessionHeader(state, 900, 100); expect(state.controls).toBe(false);
    expect(advanceSessionHeader(state, 20, 100)).toMatchObject({ compact: false, controls: true });
  });
  it('ignores top/bottom overscroll and the rebound rather than interpreting it as an ascent', () => {
    let state = advanceSessionHeader(INITIAL_SESSION_HEADER, 500, 100, 500);
    for (const y of [510, 530, 550, 540, 520, 501, 500]) {
      state = advanceSessionHeader(state, y, 100, 500); expect(state.controls).toBe(false); expect(state.y).toBe(500);
    }
    expect(advanceSessionHeader(state, 492, 100, 500).controls).toBe(true);
    expect(advanceSessionHeader(state, -40, 100, 500)).toMatchObject({ compact: false, controls: true, y: 0 });
  });
  it('always renders elapsed time in the compact bar, including with its controls hidden', async () => {
    const props = { title: 'PUSH', clock: <Text>11 min · 3/24 series</Text>, compact: true, controls: false, pinned: false, disabled: false, top: 47, completed: 3, total: 24, onBack: jest.fn(), onCancel: jest.fn(), onFinish: jest.fn(), onHeight: jest.fn() };
    const wrap = (pinned: boolean, dark = false) => <View><OwnlevelThemeProvider key={dark ? 'dark' : 'light'} initialMode={dark ? 'dark' : 'light'}><SessionScrollHeader {...props} pinned={pinned} /></OwnlevelThemeProvider></View>;
    const view = render(wrap(false)); await act(async () => {});
    expect(view.getByText('11 min · 3/24 series')).toBeVisible();
    expect(view.getByTestId('session-header-actions', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
    expect(view.queryByLabelText('Finalizar entrenamiento')).toBeNull();
    expect(view.getByRole('progressbar').props.accessibilityValue).toEqual({ min: 0, max: 24, now: 3 });
    view.rerender(wrap(true, true)); await act(async () => {});
    expect(view.getByLabelText('Finalizar entrenamiento')).toBeVisible(); expect(view.getByText('11 min · 3/24 series')).toBeVisible();
  });
  it('keeps controls fixed without a slide/scale when Reduce Motion is enabled', async () => {
    const reduce = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const view = render(<OwnlevelThemeProvider><SessionScrollHeader title="PUSH" clock={<Text>11 min</Text>} compact controls={false} pinned={false} disabled={false} top={47} completed={3} total={24} onBack={jest.fn()} onCancel={jest.fn()} onFinish={jest.fn()} onHeight={jest.fn()} /></OwnlevelThemeProvider>);
    await act(async () => {}); expect(view.getByLabelText('Finalizar entrenamiento')).toBeVisible(); expect(view.getByText('11 min')).toBeVisible();
    reduce.mockRestore();
  });
});
