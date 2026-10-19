import { act, fireEvent, render } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Keyboard, Modal, Pressable, StyleSheet, Text } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { withTiming } from 'react-native-reanimated';
import { AppSheet, useAppSheetDismiss } from './app-sheet';
import { KeyboardSheetMotion } from './keyboard-sheet-motion';
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
  fireEvent(view.UNSAFE_getByType(Modal), 'show');
  return { view, onClose };
}
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); mockReduced = false; });

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
  it('still opens sheets without a keyboard as soon as they are measured', () => {
    const tree = () => <OwnlevelThemeProvider initialMode="light"><AppSheet testID="plain" closeLabel="Cerrar" onClose={jest.fn()}><Close /></AppSheet></OwnlevelThemeProvider>;
    const view = render(tree());
    jest.mocked(withTiming).mockClear();
    fireEvent(view.getByTestId('plain'), 'layout', { nativeEvent: { layout: { height: 300 } } });
    expect(withTiming).toHaveBeenCalledTimes(1);
    view.rerender(tree());
    expect(StyleSheet.flatten(view.getByTestId('plain').props.style).transform[0].translateY).toBe(0);
  });
});

describe('native metric keyboard presentation', () => {
  it('bounds only forms that opt in, while keeping existing metric geometry untouched', () => {
    const regular = open({ nativeKeyboard: true });
    expect(regular.view.UNSAFE_getByType(KeyboardSheetMotion).props.boundedViewport).toBeUndefined();
    regular.view.unmount();
    const bounded = open({ nativeKeyboard: true, keyboardViewport: true, keyboardTopInset: 78 });
    const motion = bounded.view.UNSAFE_getByType(KeyboardSheetMotion);
    expect(motion.props).toMatchObject({ boundedViewport: true, topInset: 78 });
    expect(StyleSheet.flatten(motion.props.style).flex).toBeUndefined();
    expect(StyleSheet.flatten(motion.props.style).height).toBeGreaterThan(0);
  });
  it('waits for measurement and Modal presentation and gives UIKit sole ownership of entry', () => {
    const view = render(<OwnlevelThemeProvider initialMode="light"><AppSheet nativeKeyboard testID="native" closeLabel="Cerrar" onClose={jest.fn()} keyboardInset={26}><Close /></AppSheet></OwnlevelThemeProvider>);
    expect(view.UNSAFE_getByType(KeyboardSheetMotion).props).toMatchObject({ sheetHeight: 0, presented: false, closing: false });
    jest.mocked(withTiming).mockClear();
    fireEvent(view.getByTestId('native'), 'layout', { nativeEvent: { layout: { height: 300 } } });
    expect(view.UNSAFE_getByType(KeyboardSheetMotion).props).toMatchObject({ sheetHeight: 300, presented: false, bottomInset: 26 });
    fireEvent(view.UNSAFE_getByType(Modal), 'show');
    expect(view.UNSAFE_getByType(KeyboardSheetMotion).props.presented).toBe(true);
    expect(StyleSheet.flatten(view.getByTestId('native').props.style).transform[0].translateY).toBe(0);
    // Neither measurement nor presentation may schedule a competing JS slide or a focus timeout.
    expect(withTiming).not.toHaveBeenCalled();
  });
  it('keeps the Modal mounted until UIKit completes closing and then waits for native Modal dismissal', () => {
    const keyboard = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const { view, onClose } = open({ nativeKeyboard: true });
    jest.mocked(withTiming).mockClear();
    fireEvent.press(view.getByLabelText('Cerrar métrica'));
    expect(view.UNSAFE_getByType(KeyboardSheetMotion).props.closing).toBe(true);
    expect(keyboard).not.toHaveBeenCalled(); // UIKit owns resignFirstResponder and the keyboard notification.
    expect(view.UNSAFE_getByType(Modal).props.visible).toBe(true);
    expect(jest.mocked(withTiming).mock.calls.map(([target]) => target)).toEqual([0]); // scrim only
    act(() => view.UNSAFE_getByType(KeyboardSheetMotion).props.onClosed());
    expect(view.UNSAFE_getByType(Modal).props.visible).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent(view.UNSAFE_getByType(Modal), 'dismiss');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('returns a cancelled drag to the native keyboard baseline, without adding keyboard height again', () => {
    const { view } = open({ nativeKeyboard: true });
    const pan = getByGestureTestId('metric-pan');
    act(() => fireGestureHandler(pan, [{ state: State.BEGAN }, { state: State.ACTIVE, translationY: 20 }, { state: State.END, translationY: 20, velocityY: 0 }]));
    expect(view.UNSAFE_getByType(KeyboardSheetMotion).props.closing).toBe(false);
    expect(StyleSheet.flatten(view.getByTestId('metric').props.style).transform[0].translateY).toBe(0);
    act(() => fireGestureHandler(pan, [{ state: State.BEGAN }, { state: State.ACTIVE, translationY: 200 }, { state: State.END, translationY: 200, velocityY: 0 }]));
    expect(view.UNSAFE_getByType(KeyboardSheetMotion).props.closing).toBe(true);
  });
  it('passes Reduce Motion to UIKit and keeps saving locked', () => {
    mockReduced = true;
    const { view } = open({ nativeKeyboard: true, locked: true });
    fireEvent.press(view.getByLabelText('Cerrar métrica'));
    expect(view.UNSAFE_getByType(KeyboardSheetMotion).props).toMatchObject({ reduceMotion: true, closing: false });
  });
});
