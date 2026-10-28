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

describe('Library sheet (Alimentos, Comidas guardadas) — #306', () => {
  it('opened from a tab, reserves only the home indicator: the tab bar is behind the modal', () => {
    const view = sheet();
    expect(paddingBottom(view)).toBe(34);
  });
  it('a list with nothing below it has no footer padding cutting it short', () => {
    expect(sheet().queryByTestId('library-footer')).toBeNull();
    expect(sheet({ footer: <Text>Guardar</Text> }).getByTestId('library-footer')).toBeTruthy();
  });
  it('the keyboard is measured from the top of the screen, so Guardar stays above it', async () => {
    const view = sheet({ footer: <Text>Guardar</Text> });
    const layout = (y: number, height: number) => ({ persist: () => {}, nativeEvent: { layout: { x: 0, y, width: 402, height } } });
    await act(async () => {
      fireEvent(view.getByTestId('library-sheet'), 'layout', layout(52, 822));
      fireEvent(view.getByTestId('library-keyboard'), 'layout', layout(5, 783));
    });
    expect(view.UNSAFE_getByType(KeyboardAvoidingView).props.keyboardVerticalOffset).toBe(57);
  });
  it('embedded in another sheet keeps that sheet\'s insets and keyboard handling', () => {
    const view = sheet({ embedded: true });
    expect(paddingBottom(view)).toBe(83);
    expect(view.UNSAFE_getByType(KeyboardAvoidingView).props.keyboardVerticalOffset).toBe(0);
  });
});
