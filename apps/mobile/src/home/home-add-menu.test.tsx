import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { OwnlevelThemeProvider } from '@/design-system';

import { HomeAddMenu } from './home-add-menu.ios';

// SwiftUI views are native; here each one renders its label/children so the menu tree can be checked.
jest.mock('@expo/ui/swift-ui', () => {
  const { Pressable, Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => <Pressable accessibilityRole="button" onPress={onPress}><Text>{label}</Text></Pressable>,
    Host: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Menu: ({ children, label }: { children: React.ReactNode; label: React.ReactNode }) => <View testID="native-menu">{label}{children}</View>,
  };
});
jest.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityLabel: (label: string) => ({ label }), font: () => ({}), foregroundStyle: () => ({}), padding: () => ({}),
}));

describe('Home "+ Comida" native menu (iOS)', () => {
  it('has the same entries as Nutrición (a mano, rápido, alimento por cantidad), each calling its flow', () => {
    const handlers = { onFood: jest.fn(), onManual: jest.fn(), onQuick: jest.fn() };
    const view = render(<OwnlevelThemeProvider initialMode="light"><HomeAddMenu {...handlers} /></OwnlevelThemeProvider>);
    expect(view.getByText('+ Comida')).toBeTruthy();
    fireEvent.press(view.getByText('A mano'));
    fireEvent.press(view.getByText('Rápido'));
    fireEvent.press(view.getByText('Alimento por cantidad'));
    expect(handlers.onManual).toHaveBeenCalledTimes(1);
    expect(handlers.onQuick).toHaveBeenCalledTimes(1);
    expect(handlers.onFood).toHaveBeenCalledTimes(1);
  });
});
