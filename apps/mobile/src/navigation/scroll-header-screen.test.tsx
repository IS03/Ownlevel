import { act, fireEvent, render } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, type ScrollViewProps } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider, ScrollEdgeBlur, ScrollScreen } from '@/design-system';
import { ScrollHeaderScreen } from './scroll-header-screen';
let mockHasBack = true;
const mockBack = jest.fn(), mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ canGoBack: () => mockHasBack, back: mockBack, replace: mockReplace }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const wrap = (child: React.ReactElement<ScrollViewProps>, mode: 'dark' | 'light' = 'dark') => render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, bottom: 34, left: 0, right: 0 } }}><OwnlevelThemeProvider initialMode={mode}><ScrollHeaderScreen title="Calendario">{child}</ScrollHeaderScreen></OwnlevelThemeProvider></SafeAreaProvider>);
beforeEach(() => { mockHasBack = true; });
describe('floating detail header', () => {
  it.each(['dark', 'light'] as const)('keeps the measured header outside the scroll content and forwards scroll/refresh in %s', mode => {
    const onScroll = jest.fn(), onRefresh = jest.fn();
    const view = wrap(<ScrollView testID="reader" contentContainerStyle={{ padding: 16, paddingTop: 24 }} onScroll={onScroll}
      refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} />}><Text>Registros</Text></ScrollView>, mode);
    const bar = view.getByTestId('detail-header-bar');
    fireEvent(bar, 'layout', { nativeEvent: { layout: { height: 160 } } });
    expect(StyleSheet.flatten(view.getByTestId('reader').props.contentContainerStyle).paddingTop).toBe(47 + 160 + 24);
    expect(view.getByTestId('reader').props.contentInsetAdjustmentBehavior).toBe('never');
    expect(view.getByTestId('reader').props.contentInset.bottom).toBe(34);
    const refresh = view.getByTestId('reader').props.refreshControl;
    expect(refresh.props.progressViewOffset).toBe(207); refresh.props.onRefresh(); expect(onRefresh).toHaveBeenCalled();
    const event = { nativeEvent: { contentOffset: { y: 100, x: 0 } } };
    act(() => fireEvent.scroll(view.getByTestId('reader'), event));
    expect(onScroll).toHaveBeenCalledWith(expect.objectContaining(event));
    expect(view.UNSAFE_getByType(ScrollEdgeBlur).props.visible).toBe(true);
    act(() => fireEvent.scroll(view.getByTestId('reader'), { nativeEvent: { contentOffset: { y: 0, x: 0 } } }));
    expect(view.UNSAFE_getByType(ScrollEdgeBlur).props.visible).toBe(false);
  });
  it('preserves FlatList virtualization and renderer props instead of introducing a parent ScrollView', () => {
    const data = [{ id: 'a' }, { id: 'b' }];
    const view = wrap(<FlatList data={data} keyExtractor={row => row.id} renderItem={({ item }) => <Text>{item.id}</Text>} contentInset={{ bottom: 10 }} />);
    expect(view.UNSAFE_getByType(FlatList).props.data).toBe(data);
    expect(view.UNSAFE_getByType(FlatList).props.contentInset.bottom).toBe(44);
    expect(view.getByText('a')).toBeTruthy(); expect(view.getByText('b')).toBeTruthy();
  });
  it('uses ScrollScreen manual insets without adding its bottom protection twice', () => {
    const view = wrap(<ScrollScreen testID="managed"><Text>Fechas</Text></ScrollScreen>);
    expect(view.UNSAFE_getByType(ScrollScreen).props.topInset).toBe('manual');
    expect(view.UNSAFE_getByType(ScrollScreen).props.contentInset).toBeUndefined();
  });
  it('keeps the retained back stack, with a working cold-entry fallback', () => {
    const view = wrap(<ScrollView><Text>Fechas</Text></ScrollView>);
    fireEvent.press(view.getByRole('button', { name: 'Volver' })); expect(mockBack).toHaveBeenCalledTimes(1);
    mockHasBack = false;
    fireEvent.press(view.getByRole('button', { name: 'Volver' })); expect(mockReplace).toHaveBeenCalledWith('/(tabs)/progress');
  });
});
