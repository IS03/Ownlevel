import { fireEvent, render } from '@testing-library/react-native';
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


describe('optional floating-tab backdrop', () => {
  it('covers the measured bar, stays fixed during scroll/bounce and never takes taps or changes content insets', () => {
    const view = render(wrap(<ScrollScreen bottomBackdrop contentContainerStyle={{ paddingBottom: 40 }}>
      <Text>Última comida</Text>
    </ScrollScreen>));
    const backdrop = () => view.getByTestId('scroll-bottom-backdrop', { includeHiddenElements: true });
    const style = StyleSheet.flatten(backdrop().props.style);
    expect(style).toMatchObject({ position: 'absolute', bottom: 0, height: 107 }); // 83 measured + 24 fade
    expect(backdrop().props).toMatchObject({ pointerEvents: 'none', accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' });
    const scroll = view.UNSAFE_getByType(ScrollView);
    for (const y of [0, 700, 703, 1900, 2000, 1900, -30]) {
      fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { x: 0, y } } });
      expect(StyleSheet.flatten(backdrop().props.style)).toEqual(style);
    }
    expect(scroll.props.contentInsetAdjustmentBehavior).toBe('automatic');
    expect(scroll.props.contentInset).toBeUndefined();
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBe(40);
    expect(view.getByText('Última comida')).toBeTruthy();
  });
  it('tracks safe-area changes, including an accessory, and omits itself when no bottom protection is needed', () => {
    const screen = <ScrollScreen bottomBackdrop><Text>Última comida</Text></ScrollScreen>;
    const view = render(wrap(screen, 34));
    expect(StyleSheet.flatten(view.getByTestId('scroll-bottom-backdrop', { includeHiddenElements: true }).props.style).height).toBe(58);
    view.rerender(wrap(screen, 125));
    expect(StyleSheet.flatten(view.getByTestId('scroll-bottom-backdrop', { includeHiddenElements: true }).props.style).height).toBe(149);
    view.rerender(wrap(screen, 0));
    expect(view.queryByTestId('scroll-bottom-backdrop', { includeHiddenElements: true })).toBeNull();
  });
  it('preserves other screens and Android, and respects callers that own the bottom edge', () => {
    const view = render(wrap(<ScrollScreen><Text>Otra pestaña</Text></ScrollScreen>));
    expect(view.queryByTestId('scroll-bottom-backdrop', { includeHiddenElements: true })).toBeNull();
    view.rerender(wrap(<ScrollScreen bottomBackdrop safeAreaEdges={['left', 'right']}><Text>Controles propios</Text></ScrollScreen>));
    expect(view.queryByTestId('scroll-bottom-backdrop', { includeHiddenElements: true })).toBeNull();
    jest.replaceProperty(Platform, 'OS', 'android');
    view.rerender(wrap(<ScrollScreen bottomBackdrop><Text>Android</Text></ScrollScreen>));
    expect(view.queryByTestId('scroll-bottom-backdrop', { includeHiddenElements: true })).toBeNull();
    expect(view.UNSAFE_getByType(SafeAreaView).props.edges).toEqual(['left', 'right', 'bottom']);
  });
});
