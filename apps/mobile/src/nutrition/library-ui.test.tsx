import { act, fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { KeyboardAvoidingView, StyleSheet, Text } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { LibrarySheet } from './library-ui';

// The window: home indicator only. Inside a tab the screen's own insets also count the tab bar (34 + 49).
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual<typeof import('react-native-safe-area-context')>('react-native-safe-area-context');
  return {
    ...actual,
    initialWindowMetrics: { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } },
  };
});
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const tabScreen = { top: 62, bottom: 83, left: 0, right: 0 };
const sheet = (props: { footer?: React.ReactNode; embedded?: boolean } = {}) =>
  render(
    <SafeAreaInsetsContext.Provider value={tabScreen}>
      <OwnlevelThemeProvider initialMode="light">
        <LibrarySheet title="Comidas guardadas" browse onClose={() => {}} testID="library" {...props}>
          <Text>Lista</Text>
        </LibrarySheet>
      </OwnlevelThemeProvider>
    </SafeAreaInsetsContext.Provider>,
  );
const paddingBottom = (view: ReturnType<typeof render>) =>
  StyleSheet.flatten(view.getByTestId('library-sheet').props.style).paddingBottom;
const scrollPadding = (view: ReturnType<typeof render>) => {
  const style = StyleSheet.flatten(view.getByTestId('library').props.contentContainerStyle);
  return style.paddingBottom ?? style.padding;
};

describe('Library sheet (Alimentos, Comidas guardadas) — #306', () => {
  it('opened from a tab, reserves only the home indicator: the tab bar is behind the modal', () => {
    expect(paddingBottom(sheet({ footer: <Text>Guardar</Text> }))).toBe(34);
  });
  it('a browsing list runs to the bottom edge and keeps the home indicator as scroll padding, not a band that cuts rows', () => {
    const view = sheet();
    expect(paddingBottom(view)).toBe(0);
    expect(scrollPadding(view)).toBe(16 + 34);
    // With a footer the list ends at the footer; the inset stays under the footer.
    expect(scrollPadding(sheet({ footer: <Text>Guardar</Text> }))).toBe(16);
  });
  it('a list with nothing below it has no footer padding cutting it short', () => {
    expect(sheet().queryByTestId('library-footer')).toBeNull();
    expect(sheet({ footer: <Text>Guardar</Text> }).getByTestId('library-footer')).toBeTruthy();
  });
  it.each([
    { parentY: 52, localY: 5, height: 783, keyboardY: 540 },
    { parentY: 24, localY: 5, height: 350, keyboardY: 240 },
  ])('avoids the actual overlap on screen without counting local y twice ($height pt view)', async ({ parentY, localY, height, keyboardY }) => {
    const view = sheet({ footer: <Text>Guardar</Text> });
    const layout = (y: number, h: number) => ({ persist: () => {}, nativeEvent: { layout: { x: 0, y, width: 402, height: h } } });
    await act(async () => {
      fireEvent(view.getByTestId('library-sheet'), 'layout', layout(parentY, height + 39));
      fireEvent(view.getByTestId('library-keyboard'), 'layout', layout(localY, height));
    });
    // Exercise the installed RN implementation, not an assertion about the offset prop alone.
    const avoiding = view.UNSAFE_getByType(KeyboardAvoidingView).instance as {
      _relativeKeyboardHeight: (frame: { screenY: number; screenX: number; width: number; height: number }) => Promise<number>;
    };
    const overlap = (screenY: number) => avoiding._relativeKeyboardHeight({ screenY, screenX: 0, width: 402, height: 334 });
    await expect(overlap(keyboardY)).resolves.toBe(parentY + localY + height - keyboardY);
    await expect(overlap(parentY + localY + height + 10)).resolves.toBe(0);
    // The modal is re-laid out (a different window height): the parent origin must follow it.
    await act(async () => { fireEvent(view.getByTestId('library-sheet'), 'layout', layout(parentY + 12, height + 39)); });
    await expect(overlap(keyboardY)).resolves.toBe(parentY + 12 + localY + height - keyboardY);
  });
  it('updates the window insets after a native frame/dimensions change instead of retaining launch metrics', async () => {
    const view = sheet();
    const native = view.root.find(node => typeof node.type === 'string' && typeof node.props.onInsetsChange === 'function');
    await act(async () => { fireEvent(native, 'insetsChange', { nativeEvent: {
      frame: { x: 0, y: 0, width: 874, height: 402 },
      insets: { top: 0, bottom: 21, left: 62, right: 62 },
    } }); });
    expect(scrollPadding(view)).toBe(16 + 21);
  });
  it('embedded in another sheet keeps that sheet\'s insets and keyboard handling', () => {
    const view = sheet({ embedded: true });
    expect(paddingBottom(view)).toBe(83);
    expect(scrollPadding(view)).toBe(16);
    expect(view.UNSAFE_getByType(KeyboardAvoidingView).props.keyboardVerticalOffset).toBe(0);
  });
});
