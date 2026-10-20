import { render } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaView } from 'react-native-safe-area-context';
import { Screen, ScrollScreen } from './primitives';
import { OwnlevelThemeProvider } from './theme';

afterEach(() => { jest.restoreAllMocks(); });

function wrap(children: React.ReactNode, bottom = 83) {
  return <SafeAreaInsetsContext.Provider value={{ top: 62, bottom, left: 0, right: 0 }}>
    <OwnlevelThemeProvider initialMode="light">{children}</OwnlevelThemeProvider>
  </SafeAreaInsetsContext.Provider>;
}

describe('scrollable bottom protection', () => {
  it.each([34, 83, 125])('lets UIKit protect an automatic iOS scroll, without an outer strip (%s)', bottom => {
    const view = render(wrap(<ScrollScreen contentContainerStyle={{ paddingBottom: 40 }}><Text>Último renglón</Text></ScrollScreen>, bottom));
    expect(view.UNSAFE_getByType(SafeAreaView).props.edges).toEqual(['left', 'right']);
    const scroll = view.UNSAFE_getByType(ScrollView);
    expect(scroll.props.contentInsetAdjustmentBehavior).toBe('automatic');
    expect(scroll.props.contentInset).toBeUndefined();
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBe(40);
  });

  it('protects manual-header content and its indicator once using the measured native safe area', () => {
    const view = render(wrap(<ScrollScreen topInset="manual" contentInset={{ top: 0, bottom: 8 }}
      scrollIndicatorInsets={{ right: 4, bottom: 12 }} contentContainerStyle={{ paddingTop: 114, paddingBottom: 24 }}>
      <Text>Último gráfico</Text>
    </ScrollScreen>));
    const scroll = () => view.UNSAFE_getByType(ScrollView);
    expect(scroll().props.contentInsetAdjustmentBehavior).toBe('never');
    expect(scroll().props.contentInset).toEqual({ top: 0, bottom: 91 });
    expect(scroll().props.scrollIndicatorInsets).toEqual({ right: 4, bottom: 95 });
    expect(StyleSheet.flatten(scroll().props.contentContainerStyle)).toMatchObject({ paddingTop: 114, paddingBottom: 24 });
    // A native rest accessory or rotation changes the inset, not a hard-coded tab-bar height.
    view.rerender(wrap(<ScrollScreen topInset="manual"><Text>Último gráfico</Text></ScrollScreen>, 125));
    expect(scroll().props.contentInset).toEqual({ bottom: 125 });
  });

  it('does not add protection twice when the caller already owns the bottom edge', () => {
    const view = render(wrap(<ScrollScreen safeAreaEdges={['left', 'right']} topInset="manual" contentInset={{ bottom: 24 }}>
      <Text>Sesión con controles propios</Text>
    </ScrollScreen>));
    expect(view.UNSAFE_getByType(ScrollView).props.contentInset).toEqual({ bottom: 24 });
  });

  it('keeps Android bottom protection and does not synthesize iOS content insets', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const view = render(wrap(<ScrollScreen topInset="manual"><Text>Contenido</Text></ScrollScreen>));
    expect(view.UNSAFE_getByType(SafeAreaView).props.edges).toEqual(['left', 'right', 'bottom']);
    expect(view.UNSAFE_getByType(ScrollView).props.contentInset).toBeUndefined();
  });

  it('preserves the safe area for non-scrolling screens with fixed controls', () => {
    const view = render(wrap(<Screen><Text>Control fijo</Text></Screen>));
    expect(view.UNSAFE_getByType(SafeAreaView).props.edges).toEqual(['left', 'right', 'bottom']);
  });
});
