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
    HStack: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Spacer: () => null,
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Menu: ({ children, label }: { children: React.ReactNode; label: React.ReactNode }) => <View testID="native-menu">{label}{children}</View>,
  };
});
jest.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityLabel: (label: string) => ({ label }), font: () => ({}), foregroundStyle: () => ({}), padding: () => ({}),
  buttonStyle: () => ({}), menuStyle: () => ({}), menuIndicator: () => ({}), frame: () => ({}), contentShape: () => ({}), shapes: { rectangle: () => ({}) },
}));
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { GlassView: View, isGlassEffectAPIAvailable: () => true, isLiquidGlassAvailable: () => true };
});

describe('Home "+ Comida" native menu (iOS)', () => {
  it('has the same entries as Nutrición (a mano, rápido, alimento por cantidad), each calling its flow', () => {
    const handlers = { onFood: jest.fn(), onManual: jest.fn(), onQuick: jest.fn() };
    const view = render(<OwnlevelThemeProvider initialMode="light"><HomeAddMenu {...handlers} /></OwnlevelThemeProvider>);
    // The visible label is React Native (hidden from VoiceOver); the native menu carries the accessible name.
    expect(view.getByText('+ Comida', { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByTestId('home-add-menu-glass').props.tintColor).toBe('rgba(201,182,138,0.32)');
    fireEvent.press(view.getByText('A mano'));
    fireEvent.press(view.getByText('Rápido'));
    fireEvent.press(view.getByText('Alimento por cantidad'));
    expect(handlers.onManual).toHaveBeenCalledTimes(1);
    expect(handlers.onQuick).toHaveBeenCalledTimes(1);
    expect(handlers.onFood).toHaveBeenCalledTimes(1);
  });
});
