import { act, fireEvent, render } from '@testing-library/react-native';
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { ActivityIndicator, Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { OwnlevelThemeProvider, brandTokens, spacing } from '@/design-system';
import { ExerciseNotice } from './exercise-notice';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const original = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };
// Jest's default window reports a 2x font scale (the stacked layout); a normal-text window is set here.
beforeEach(() => { Dimensions.set({ window: { ...original.window, fontScale: 1 }, screen: original.screen }); });
afterEach(() => { jest.restoreAllMocks(); Dimensions.set(original); });
const tree = (children: React.ReactNode, bottom = 34) => <GestureHandlerRootView><SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 700 }, insets: { top: 44, bottom, left: 0, right: 0 } }}>
  <OwnlevelThemeProvider initialMode="light">{children}</OwnlevelThemeProvider></SafeAreaProvider></GestureHandlerRootView>;
const swipe = (translationY: number) => act(() => fireGestureHandler(getByGestureTestId('transient-notice-dismiss'), [
  { state: State.BEGAN, translationX: 0, translationY: 0 }, { state: State.ACTIVE, translationX: 0, translationY }, { state: State.END, translationX: 0, translationY }]));
const open = (props: Partial<React.ComponentProps<typeof ExerciseNotice>> = {}) => render(tree(<ExerciseNotice message="PRESS agregado" disabled={false} {...props} />));

it('added: a check, Deshacer, and a swipe or VoiceOver dismissal that never undoes', () => {
  const undo = jest.fn(), onDismiss = jest.fn(); const view = open({ undo, onDismiss });
  expect(view.getByTestId('exercise-notice-icon')).toBeTruthy();
  swipe(brandTokens.layout.minTouch); expect(onDismiss).toHaveBeenCalledTimes(1);
  fireEvent(view.getByLabelText('PRESS agregado'), 'accessibilityAction', { nativeEvent: { actionName: 'dismiss' } }); expect(onDismiss).toHaveBeenCalledTimes(2);
  expect(undo).not.toHaveBeenCalled();
  fireEvent.press(view.getByRole('button', { name: 'Deshacer' })); expect(undo).toHaveBeenCalledTimes(1); expect(onDismiss).toHaveBeenCalledTimes(2);
});
it('added with its undo locked keeps the button disabled', () => {
  const undo = jest.fn(); const view = open({ undo, disabled: true });
  fireEvent.press(view.getByRole('button', { name: 'Deshacer' })); expect(undo).not.toHaveBeenCalled();
});
it('removing is pending: spinner, no Deshacer, no gesture, no dismiss action even if a dismissal is passed', () => {
  const onDismiss = jest.fn(); const view = open({ message: 'Quitando PRESS…', pending: true, onDismiss });
  expect(view.UNSAFE_queryByType(ActivityIndicator)).not.toBeNull(); expect(view.queryByRole('button')).toBeNull(); expect(view.queryByTestId('exercise-notice-icon')).toBeNull();
  expect(() => getByGestureTestId('transient-notice-dismiss')).toThrow(); expect(view.getByLabelText('Quitando PRESS…').props.accessibilityActions).toBeUndefined();
});
it('removed (confirmed, no undo) is dismissible and has no Deshacer', () => {
  const onDismiss = jest.fn(); const view = open({ message: 'PRESS quitado', onDismiss });
  expect(view.queryByRole('button', { name: 'Deshacer' })).toBeNull(); swipe(70); expect(onDismiss).toHaveBeenCalledTimes(1);
});
it('an unconfirmed removal has no dismissal at all: no gesture and no VoiceOver action, so its recovery message cannot be swiped away', () => {
  const view = open({ message: 'No pudimos confirmar la eliminación. Comprobá la sesión.' });
  expect(() => getByGestureTestId('transient-notice-dismiss')).toThrow();
  const text = view.getByLabelText('No pudimos confirmar la eliminación. Comprobá la sesión.'); expect(text.props.accessibilityActions).toBeUndefined(); expect(text.props.onAccessibilityEscape).toBeUndefined();
});
it('an error is announced as an alert, with no check', () => {
  const view = open({ message: 'No pudimos confirmar el cambio.', error: true });
  expect(view.getByRole('alert')).toBeTruthy(); expect(view.queryByTestId('exercise-notice-icon')).toBeNull();
});
it('a very long exercise name stays whole for VoiceOver but takes two lines on screen', () => {
  const name = 'PRESS DE BANCA INCLINADO CON MANCUERNAS, AGARRE NEUTRO Y PAUSA EN EL PECHO (VARIANTE LARGA DE PRUEBA)', message = `${name} agregado`;
  const view = open({ message, undo: jest.fn() }); const text = view.getByLabelText(message);
  expect(text.props.numberOfLines).toBe(2); expect(text.props.accessibilityLabel).toBe(message);
  expect(StyleSheet.flatten(view.getByTestId('exercise-notice-capsule').props.style).maxWidth).toBeLessThanOrEqual(420);
});
it('keeps the host placement: above the safe area plus the rest-timer offset, never under the bar floor of a tab placement', () => {
  expect(StyleSheet.flatten(open().getByTestId('exercise-notice').props.style).bottom).toBe(34 + spacing.sm);
  expect(StyleSheet.flatten(open({ bottomOffset: 90 }).getByTestId('exercise-notice').props.style).bottom).toBe(34 + spacing.sm + 90);
});
