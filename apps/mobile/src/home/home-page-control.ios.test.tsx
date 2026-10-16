import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Animated, ScrollView, StyleSheet } from 'react-native';

import { AppText, OwnlevelThemeProvider } from '@/design-system';
import { HomePageControl } from './home-page-control.ios';
import { HomeCarousel } from './home-carousel';

let mockAvailable = true;
let mockReduced = false;
jest.mock('expo', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ...jest.requireActual<object>('expo'),
    requireOptionalNativeModule: jest.fn(() => mockAvailable ? {} : null),
    requireNativeView: jest.fn(() => View),
  };
});
jest.mock('./home-page-control', () => jest.requireActual('./home-page-control.ios'));
jest.mock('@/design-system', () => ({ ...jest.requireActual<object>('@/design-system'), useReduceMotion: () => mockReduced }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true,
  default: () => ({ width: 393, height: 852, scale: 3, fontScale: 1 }),
}));

const labels = ['Entrenos', 'Nutrición', 'Por día'];
function control(theme: 'light' | 'dark' = 'light') {
  const onSelect = jest.fn();
  const onScrub = jest.fn();
  const view = render(<OwnlevelThemeProvider initialMode={theme}><HomePageControl labels={labels} offset={new Animated.Value(0)}
    onScrub={onScrub} onSelect={onSelect} page={1} width={361} /></OwnlevelThemeProvider>);
  return { ...view, onSelect, onScrub };
}

describe('UIKit page control bridge', () => {
  beforeEach(() => { jest.restoreAllMocks(); mockAvailable = true; mockReduced = false; });

  it.each(['light', 'dark'] as const)('uses the actual native view contract and theme colors in %s, not custom dots or gestures', theme => {
    const view = control(theme);
    const native = view.getByTestId('home-week-native-page-control');
    expect(native.props).toMatchObject({ labels, page: 1, isDark: theme === 'dark',
      activeColor: theme === 'dark' ? '#C9B68A' : '#705F36', inactiveColor: theme === 'dark' ? '#9F9FA9' : '#62626A' });
    expect(StyleSheet.flatten(native.props.style).height).toBe(44);
    expect(view.queryByTestId('home-week-pagination-control')).toBeNull();
    expect(native.props.onResponderMove).toBeUndefined();
    expect(view.queryAllByTestId(/home-week-dot-\d/)).toHaveLength(0);
    fireEvent(native, 'pageChange', { nativeEvent: { page: 2 } });
    expect(view.onSelect).toHaveBeenCalledWith(2);
    expect(view.onScrub).not.toHaveBeenCalled();
  });

  it('ignores malformed or out-of-range native events', () => {
    const view = control();
    for (const page of [-1, 3, 1.5, Number.NaN]) fireEvent(view.getByTestId('home-week-native-page-control'), 'pageChange', { nativeEvent: { page } });
    expect(view.onSelect).not.toHaveBeenCalled();
  });

  it('old native builds explicitly ask for a rebuild instead of silently imitating UIKit', () => {
    mockAvailable = false;
    const view = control();
    expect(view.getByText('Recompilá la app para activar el control de páginas nativo.')).toBeTruthy();
    expect(view.queryByTestId('home-week-native-page-control')).toBeNull();
    expect(view.queryByTestId('home-week-pagination-control')).toBeNull();
  });

  it('native selection changes the existing pager; swiping content writes selection back to UIKit', () => {
    const scroll = jest.spyOn(ScrollView.prototype, 'scrollTo');
    const view = render(<OwnlevelThemeProvider initialMode="dark"><HomeCarousel pages={labels.map(label => ({ label, content: <AppText>{label}</AppText> }))} /></OwnlevelThemeProvider>);
    fireEvent(view.getByTestId('home-week-native-page-control'), 'pageChange', { nativeEvent: { page: 2 } });
    expect(scroll).toHaveBeenLastCalledWith({ x: 786, animated: true });
    expect(view.getByText('Por día')).toBeTruthy();
    expect(view.queryByText('Entrenos')).toBeNull();
    expect(view.getByTestId('home-week-native-page-control').props.page).toBe(2);
    fireEvent(view.getByTestId('home-week-pager'), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 393 } } });
    expect(view.getByTestId('home-week-native-page-control').props.page).toBe(1);
    expect(view.getByText('Nutrición')).toBeTruthy();
    act(() => { mockReduced = true; });
    view.rerender(<OwnlevelThemeProvider initialMode="dark"><HomeCarousel pages={labels.map(label => ({ label, content: <AppText>{label}</AppText> }))} /></OwnlevelThemeProvider>);
    fireEvent(view.getByTestId('home-week-native-page-control'), 'pageChange', { nativeEvent: { page: 0 } });
    expect(scroll).toHaveBeenLastCalledWith({ x: 0, animated: false });
  });
});
