import { act, fireEvent, render } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Keyboard, Modal, Pressable, StyleSheet, Text } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { makeMutable, withTiming } from 'react-native-reanimated';
import { AppSheet, useAppSheetDismiss } from './app-sheet';
import { OwnlevelThemeProvider } from './theme';

let mockReduced = false;
jest.mock('./motion', () => ({ useReduceMotion: () => mockReduced }));

function Close() {
  const dismiss = useAppSheetDismiss();
  return <Pressable accessibilityRole="button" accessibilityLabel="Cerrar métrica" onPress={() => dismiss()}><Text>Cerrar</Text></Pressable>;
}
function open(props: Partial<React.ComponentProps<typeof AppSheet>> = {}) {
  const onClose = jest.fn();
  const view = render(<OwnlevelThemeProvider initialMode="light"><AppSheet testID="metric" closeLabel="Cerrar carga" onClose={onClose} dismissKeyboardOnClose {...props}><Close /></AppSheet></OwnlevelThemeProvider>);
  fireEvent(view.getByTestId('metric'), 'layout', { nativeEvent: { layout: { height: 600 } } });
  return { view, onClose };
}
afterEach(() => { jest.restoreAllMocks(); mockReduced = false; });

describe('keyboard and sheet leave together', () => {
  it.each(['Cerrar métrica', 'Cerrar carga'])('dismisses the keyboard immediately from %s, before the exit timing, without waiting for Modal removal', label => {
    const keyboard = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const { view, onClose } = open();
    jest.mocked(withTiming).mockClear();
    fireEvent.press(view.getByLabelText(label, { includeHiddenElements: true }));
    expect(keyboard).toHaveBeenCalledTimes(1);
    expect(keyboard.mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(withTiming).mock.invocationCallOrder[0]);
    expect(onClose).not.toHaveBeenCalled();
    expect(StyleSheet.flatten(view.getByTestId('metric').props.style).height).toBe(600);
    // Native keyboard shrink must not update the exit's measured height.
    fireEvent(view.getByTestId('metric'), 'layout', { nativeEvent: { layout: { height: 280 } } });
    expect(StyleSheet.flatten(view.getByTestId('metric').props.style).height).toBe(600);
    fireEvent.press(view.getByLabelText(label, { includeHiddenElements: true }));
    expect(keyboard).toHaveBeenCalledTimes(1);
  });
  it('dismisses on a committed downward swipe, not on a short/cancelled drag', () => {
    const keyboard = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    open();
    const pan = getByGestureTestId('metric-pan');
    act(() => fireGestureHandler(pan, [{ state: State.BEGAN }, { state: State.ACTIVE, translationY: 20 }, { state: State.END, translationY: 20, velocityY: 0 }]));
    expect(keyboard).not.toHaveBeenCalled();
    act(() => fireGestureHandler(pan, [{ state: State.BEGAN }, { state: State.ACTIVE, translationY: 200 }, { state: State.END, translationY: 200, velocityY: 0 }]));
    expect(keyboard).toHaveBeenCalledTimes(1);
  });
  it('does not dismiss while saving, or before a discard confirmation is accepted', () => {
    const keyboard = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const beforeDismiss = jest.fn<(proceed: () => void) => void>();
    const { view } = open({ beforeDismiss });
    fireEvent.press(view.getByRole('button', { name: 'Cerrar métrica' }));
    expect(keyboard).not.toHaveBeenCalled();
    act(() => beforeDismiss.mock.calls[0][0]());
    expect(keyboard).toHaveBeenCalledTimes(1);
    view.unmount(); keyboard.mockClear();
    const locked = open({ locked: true });
    fireEvent.press(locked.view.getByRole('button', { name: 'Cerrar métrica' }));
    expect(keyboard).not.toHaveBeenCalled();
  });
  it('still dismisses immediately with Reduce Motion, with no slide', () => {
    mockReduced = true;
    const keyboard = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const { view } = open();
    jest.mocked(withTiming).mockClear();
    fireEvent.press(view.getByRole('button', { name: 'Cerrar métrica' }));
    expect(keyboard).toHaveBeenCalledTimes(1);
    expect(jest.mocked(withTiming).mock.calls.map(([target]) => target)).toEqual([0]);
  });
  it('leaves unrelated sheets unchanged unless they opt in', () => {
    const keyboard = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const { view } = open({ dismissKeyboardOnClose: false, style: { height: 480 } });
    fireEvent.press(view.getByRole('button', { name: 'Cerrar métrica' }));
    expect(keyboard).not.toHaveBeenCalled();
    expect(StyleSheet.flatten(view.getByTestId('metric').props.style).height).toBe(480);
  });
  it('follows keyboard frames by translation, without growing/freezing content or restarting entry', () => {
    const height = makeMutable(0), onClose = jest.fn(), onShow = jest.fn();
    const tree = () => <OwnlevelThemeProvider initialMode="light"><AppSheet testID="follow" closeLabel="Cerrar" onClose={onClose}
      dismissKeyboardOnClose keyboardHeight={height} keyboardInset={26} onShow={onShow}><Close /></AppSheet></OwnlevelThemeProvider>;
    const view = render(tree());
    fireEvent(view.UNSAFE_getByType(Modal), 'show');
    expect(onShow).not.toHaveBeenCalled();
    fireEvent(view.getByTestId('follow'), 'layout', { nativeEvent: { layout: { height: 300 } } });
    fireEvent(view.UNSAFE_getByType(Modal), 'show');
    expect(onShow).toHaveBeenCalledTimes(1);
    jest.mocked(withTiming).mockClear();
    for (const frame of [0, 30, 80, 160, 240, 340]) {
      height.set(frame); view.rerender(tree());
      const style = StyleSheet.flatten(view.getByTestId('follow').props.style);
      expect(style.height).toBeUndefined();
      expect(style.transform[0].translateY).toBe(0 - Math.max(0, frame - 26));
    }
    expect(withTiming).not.toHaveBeenCalled();
    jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    fireEvent.press(view.getByLabelText('Cerrar métrica'));
    for (const frame of [340, 240, 160, 80, 30, 0]) {
      height.set(frame); view.rerender(tree());
      const style = StyleSheet.flatten(view.getByTestId('follow').props.style);
      expect(style.height).toBeUndefined();
      expect(style.transform[0].translateY).toBe(300 - Math.max(0, frame - 26));
    }
  });
});
