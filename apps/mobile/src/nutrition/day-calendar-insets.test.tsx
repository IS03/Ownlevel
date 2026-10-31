import { render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { OwnlevelThemeProvider } from '@/design-system';
import { NutritionMonthSheet } from './day-calendar';

// The window: home indicator only. Inside the Nutrition tab the screen's own insets also count the tab bar (34 + 49).
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual<typeof import('react-native-safe-area-context')>('react-native-safe-area-context');
  return { ...actual, initialWindowMetrics: { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } } };
});
const mockApi = { client: { read: jest.fn(async () => ({ status: 'unavailable', reason: 'network', meta: { durationMs: 0, httpStatus: 0, outcome: 'unavailable' } })), request: jest.fn() } };
jest.mock('@/api', () => ({ useMobileApi: () => mockApi }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void | (() => void)) => jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]) }));
jest.mock('@expo/ui/swift-ui', () => {
  const { View, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Host: View, Picker: View, HStack: View, Spacer: () => null, Text, DatePicker: () => null };
});

const sheet = (tabBottom: number) => render(
  <SafeAreaInsetsContext.Provider value={{ top: 62, bottom: tabBottom, left: 0, right: 0 }}>
    <OwnlevelThemeProvider initialMode="light">
      <NutritionMonthSheet date="2026-08-31" today="2026-10-31" onClose={() => {}} onSelect={() => {}} />
    </OwnlevelThemeProvider>
  </SafeAreaInsetsContext.Provider>,
);
const paddingBottom = (view: ReturnType<typeof sheet>) =>
  StyleSheet.flatten(view.getByTestId('nutrition-month-sheet').props.style).paddingBottom;

describe('month sheet bottom (#358)', () => {
  it('opened from the Nutrition tab reserves only the home indicator: the tab bar is behind the sheet', () => {
    expect(paddingBottom(sheet(83))).toBe(34);
  });
  it('keeps the six-row grid: every month has the same 42 cells and the 31st is a full-size cell', () => {
    const view = sheet(83);
    const cell = StyleSheet.flatten(view.getByTestId('nutrition-month-2026-08-31').props.style);
    expect(cell.minHeight).toBe(44);
    expect(view.getByTestId('nutrition-month').children).toHaveLength(7);
  });
});
