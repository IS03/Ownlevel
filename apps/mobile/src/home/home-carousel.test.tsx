import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Animated, PanResponder, Platform, ScrollView, StyleSheet, type GestureResponderEvent, type PanResponderGestureState } from 'react-native';

import { AppText, OwnlevelThemeProvider } from '@/design-system';

import { HomeCarousel } from './home-carousel';

// Exercise the retained Android/web implementation; UIKit integration has its own suite.
jest.mock('./home-page-control', () => jest.requireActual('./home-page-control.tsx'));

let mockReduced = false;
let mockFontScale = 1;
let mockGlass = false;
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { GlassView: View, isGlassEffectAPIAvailable: () => mockGlass, isLiquidGlassAvailable: () => mockGlass };
});
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true,
  default: () => ({ width: 393, height: 852, scale: 3, fontScale: mockFontScale }),
}));
jest.mock('@/design-system', () => ({ ...jest.requireActual<object>('@/design-system'), useReduceMotion: () => mockReduced }));

function carousel(theme: 'light' | 'dark' = 'light') {
  return render(<OwnlevelThemeProvider initialMode={theme}><HomeCarousel pages={[
    { label: 'Entrenos', content: <AppText>Resumen de entrenos</AppText> },
    { label: 'Nutrición', content: <AppText>Promedios</AppText> },
    { label: 'Hábitos', content: <AppText>Detalle de días</AppText> },
  ]} /></OwnlevelThemeProvider>);
}

describe('Home weekly carousel', () => {
  beforeEach(() => {
    jest.restoreAllMocks(); mockReduced = false; mockFontScale = 1; mockGlass = false;
  });
  it('explicit controls select the same pages and hide offscreen content from accessibility', () => {
    const view = carousel();
    expect(view.getByText('Resumen de entrenos')).toBeTruthy();
    expect(view.queryByText('Promedios')).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Página 2 de 3: Nutrición' }));
    expect(view.getByText('Promedios')).toBeTruthy();
    expect(view.queryByText('Resumen de entrenos')).toBeNull();
    expect(view.getByTestId('home-week-page-1').props.accessibilityState).toEqual({ selected: true });
    expect(StyleSheet.flatten(view.getByTestId('home-week-page-1').props.style).minHeight).toBe(44);
  });

  it('all pages are already mounted and swipes never expand the viewport or depend on a layout measurement', () => {
    const view = carousel();
    expect(view.getByText('Promedios', { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByText('Detalle de días', { includeHiddenElements: true })).toBeTruthy();
    const initialHeight = StyleSheet.flatten(view.getByTestId('home-week-pager').props.style).height;
    expect(initialHeight).toBe(176);
    fireEvent(view.getByTestId('home-week-carousel'), 'layout', { nativeEvent: { layout: { width: 360 } } });
    fireEvent(view.getByTestId('home-week-pager'), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 725 } } });
    expect(view.getByText('Detalle de días')).toBeTruthy();
    expect(StyleSheet.flatten(view.getByTestId('home-week-pager').props.style).height).toBe(initialHeight);
    expect(view.queryAllByTestId(/home-week-scroll-/)).toHaveLength(0);
    expect(view.UNSAFE_getAllByType(ScrollView).every(scroll => scroll.props.horizontal)).toBe(true);
    fireEvent(view.getByTestId('home-week-pager'), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: -80 } } });
    expect(view.getByText('Resumen de entrenos')).toBeTruthy();
  });

  it('width changes keep the selected page without dropping the fixed height', () => {
    const view = carousel();
    fireEvent.press(view.getByTestId('home-week-page-2'));
    fireEvent(view.getByTestId('home-week-carousel'), 'layout', { nativeEvent: { layout: { width: 600 } } });
    expect(view.getByTestId('home-week-page-2').props.accessibilityState).toEqual({ selected: true });
    // Each page spans the gutter too (600 + 2 × 16): pages sit 32 pt apart.
    expect(StyleSheet.flatten(view.getByTestId('home-week-content-2').props.style).width).toBe(632);
    expect(StyleSheet.flatten(view.getByTestId('home-week-pager').props.style).height).toBe(176);
  });

  it('large Dynamic Type grows the bounded viewport, without introducing a vertical scroll', () => {
    mockFontScale = 2;
    const view = carousel();
    expect(StyleSheet.flatten(view.getByTestId('home-week-pager').props.style).height).toBe(416);
    fireEvent.press(view.getByTestId('home-week-page-2'));
    expect(view.getByText('Detalle de días')).toBeTruthy();
    expect(view.queryAllByTestId(/home-week-scroll-/)).toHaveLength(0);
  });

  it('Reduce Motion disables animated jumps, not access to pages', () => {
    const scroll = jest.spyOn(ScrollView.prototype, 'scrollTo');
    mockReduced = true;
    const view = carousel();
    fireEvent.press(view.getByTestId('home-week-page-1'));
    expect(scroll).toHaveBeenLastCalledWith(expect.objectContaining({ animated: false }));
    expect(view.getByText('Promedios')).toBeTruthy();
    mockReduced = false;
    scroll.mockRestore();
  });

  it('only three bottom dots are visible, with 44 pt controls and accessible page names', () => {
    const view = carousel();
    for (const label of ['Entrenos', 'Nutrición', 'Hábitos']) expect(view.queryByText(label)).toBeNull();
    expect(view.getByTestId('home-week-pagination')).toBeTruthy();
    expect(view.getAllByTestId(/home-week-dot-\d/)).toHaveLength(3);
    expect(StyleSheet.flatten(view.getByTestId('home-week-active-dot').props.style).backgroundColor).toBe('#705F36');
    fireEvent.press(view.getByRole('button', { name: 'Página 3 de 3: Hábitos' }));
    expect(StyleSheet.flatten(view.getByTestId('home-week-page-2').props.style)).toMatchObject({ minHeight: 44, width: 44 });
    expect(view.getByTestId('home-week-page-2').props.accessibilityState).toEqual({ selected: true });
    expect(StyleSheet.flatten(view.getByTestId('home-week-dot-0').props.style).opacity).toBe(0.35);
  });

  it.each(['light', 'dark'] as const)('uses a single non-interactive glass capsule in %s, keeping each page independently tappable', async theme => {
    mockGlass = true;
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
    const view = carousel(theme);
    await act(async () => { await Promise.resolve(); });
    const glass = view.getByTestId('home-week-pagination-glass');
    expect(glass.props.isInteractive).toBe(false);
    expect(view.getByTestId('home-week-pagination-backplate').props.pointerEvents).toBe('none');
    expect(glass.props.colorScheme).toBe(theme);
    expect(view.queryByTestId('home-week-pagination-fallback')).toBeNull();
    fireEvent.press(view.getByTestId('home-week-page-2'));
    expect(view.getByText('Detalle de días')).toBeTruthy();
  });

  it('Reduce Transparency keeps a solid fallback and changes live, removing its listener on unmount', async () => {
    mockGlass = true;
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(true);
    const remove = jest.fn();
    const listener = jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove } as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>);
    const view = carousel();
    await act(async () => { await Promise.resolve(); });
    const calls = listener.mock.calls as unknown as [string, (value: boolean) => void][];
    const changed = calls.find(call => call[0] === 'reduceTransparencyChanged')![1];
    expect(view.queryByTestId('home-week-pagination-glass')).toBeNull();
    expect(view.getByTestId('home-week-pagination-fallback')).toBeTruthy();
    act(() => changed(false));
    expect(view.getByTestId('home-week-pagination-glass')).toBeTruthy();
    act(() => changed(true));
    expect(view.queryByTestId('home-week-pagination-glass')).toBeNull();
    view.unmount();
    expect(remove).toHaveBeenCalled();
  });

  it('unsupported systems, Android and a failed preference read never mount glass', async () => {
    const fallback = carousel();
    expect(fallback.getByTestId('home-week-pagination-fallback')).toBeTruthy();
    fallback.unmount();
    mockGlass = true;
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockRejectedValue(new Error('unavailable'));
    const failed = carousel();
    await act(async () => { await Promise.resolve(); });
    expect(failed.queryByTestId('home-week-pagination-glass')).toBeNull();
    failed.unmount();
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(carousel().queryByTestId('home-week-pagination-glass')).toBeNull();
  });

  it('reduces the visible capsule to 28 pt without reducing the 44 pt touch targets', () => {
    const view = carousel();
    expect(StyleSheet.flatten(view.getByTestId('home-week-pagination-backplate').props.style)).toMatchObject({ height: 28, top: 8 });
    expect(StyleSheet.flatten(view.getByTestId('home-week-pagination-control').props.style).minHeight).toBe(44);
    for (let index = 0; index < 3; index++) expect(StyleSheet.flatten(view.getByTestId(`home-week-page-${index}`).props.style)).toMatchObject({ minHeight: 44, width: 44 });
  });

  it('the active dot follows the native pager offset between pages and clamps overscroll', () => {
    const binding = jest.spyOn(Animated, 'event');
    const view = carousel();
    expect(binding.mock.calls[0][1]).toEqual({ useNativeDriver: true });
    const mapping = binding.mock.calls[0][0] as [{ nativeEvent: { contentOffset: { x: Animated.Value } } }];
    // Jest does not deliver UI-thread native events: set the bound value as the native scroll would.
    act(() => mapping[0].nativeEvent.contentOffset.x.setValue(196.5));
    fireEvent.press(view.getByTestId('home-week-page-1'));
    expect(StyleSheet.flatten(view.getByTestId('home-week-active-dot').props.style).transform).toEqual([{ translateX: 22 }]);
    act(() => mapping[0].nativeEvent.contentOffset.x.setValue(900));
    fireEvent.press(view.getByTestId('home-week-page-2'));
    expect(StyleSheet.flatten(view.getByTestId('home-week-active-dot').props.style).transform).toEqual([{ translateX: 88 }]);
  });

  it('scrubbing the dots follows the finger, clamps both ends and snaps on release', () => {
    const responder = jest.spyOn(PanResponder, 'create');
    const scroll = jest.spyOn(ScrollView.prototype, 'scrollTo');
    const view = carousel();
    const callbacks = responder.mock.calls[0][0];
    const event = {} as GestureResponderEvent;
    const gesture = (dx: number, dy = 0): PanResponderGestureState => ({ dx, dy, moveX: 0, moveY: 0, x0: 0, y0: 0, vx: 0, vy: 0, stateID: 1, numberActiveTouches: 1, _accountsForMovesUpTo: 0 });
    expect(callbacks.onMoveShouldSetPanResponderCapture!(event, gesture(3))).toBe(false);
    expect(callbacks.onMoveShouldSetPanResponderCapture!(event, gesture(6, 20))).toBe(false);
    expect(callbacks.onMoveShouldSetPanResponderCapture!(event, gesture(6))).toBe(true);
    act(() => {
      callbacks.onPanResponderGrant!(event, gesture(0));
      callbacks.onPanResponderMove!(event, gesture(22));
    });
    expect(scroll).toHaveBeenLastCalledWith({ x: 196.5, animated: false });
    act(() => callbacks.onPanResponderRelease!(event, gesture(22)));
    expect(scroll).toHaveBeenLastCalledWith({ x: 393, animated: true });
    expect(view.getByTestId('home-week-page-1').props.accessibilityState).toEqual({ selected: true });
    act(() => {
      callbacks.onPanResponderGrant!(event, gesture(0));
      callbacks.onPanResponderMove!(event, gesture(200));
      callbacks.onPanResponderRelease!(event, gesture(200));
    });
    expect(view.getByTestId('home-week-page-2').props.accessibilityState).toEqual({ selected: true });
    expect(scroll).toHaveBeenLastCalledWith({ x: 786, animated: true });
    act(() => {
      callbacks.onPanResponderGrant!(event, gesture(0));
      callbacks.onPanResponderMove!(event, gesture(-200));
      callbacks.onPanResponderTerminate!(event, gesture(-200));
    });
    expect(view.getByTestId('home-week-page-0').props.accessibilityState).toEqual({ selected: true });
    expect(scroll).toHaveBeenLastCalledWith({ x: 0, animated: true });
  });

  it('Reduce Motion keeps scrubbing usable without continuously moving content or animating the snap', () => {
    mockReduced = true;
    const responder = jest.spyOn(PanResponder, 'create');
    const scroll = jest.spyOn(ScrollView.prototype, 'scrollTo');
    const view = carousel();
    scroll.mockClear();
    const callbacks = responder.mock.calls[0][0];
    const event = {} as GestureResponderEvent;
    const gesture = { dx: 10, dy: 0 } as PanResponderGestureState;
    act(() => {
      callbacks.onPanResponderGrant!(event, gesture);
      callbacks.onPanResponderMove!(event, gesture);
    });
    expect(scroll).not.toHaveBeenCalled();
    act(() => callbacks.onPanResponderMove!(event, { ...gesture, dx: 44 }));
    expect(scroll).toHaveBeenLastCalledWith({ x: 393, animated: false });
    act(() => callbacks.onPanResponderRelease!(event, gesture));
    expect(scroll).toHaveBeenLastCalledWith({ x: 393, animated: false });
    expect(view.getByTestId('home-week-page-1').props.accessibilityState).toEqual({ selected: true });
  });
});
