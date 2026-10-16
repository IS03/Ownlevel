import { act, fireEvent, render } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { OwnlevelThemeProvider } from '@/design-system';
import { HomeButton } from './home-ui';

let mockGlass = true;
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { GlassView: View, isGlassEffectAPIAvailable: () => mockGlass, isLiquidGlassAvailable: () => mockGlass };
});
afterEach(() => { jest.restoreAllMocks(); mockGlass = true; });

describe('Home champagne glass actions', () => {
  it.each([{ theme: 'light' as const, tint: 'rgba(201,182,138,0.32)' }, { theme: 'dark' as const, tint: 'rgba(201,182,138,0.16)' }])('uses native tinted glass in $theme without changing the action', ({ theme, tint }) => {
    const onPress = jest.fn();
    const view = render(<OwnlevelThemeProvider initialMode={theme}><HomeButton label="+ Nueva sesión" testID="new-session" tone="soft" onPress={onPress} /></OwnlevelThemeProvider>);
    expect(view.getByTestId('new-session-glass').props.tintColor).toBe(tint);
    fireEvent.press(view.getByRole('button', { name: '+ Nueva sesión' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(StyleSheet.flatten(view.getByTestId('new-session-glass').props.style).minHeight).toBe(50);
  });
  it('keeps a non-glass champagne fallback when the native API is unavailable', () => {
    mockGlass = false;
    const view = render(<OwnlevelThemeProvider initialMode="light"><HomeButton label="+ Nueva sesión" testID="new-session" tone="soft" onPress={() => {}} /></OwnlevelThemeProvider>);
    const material = view.getByTestId('new-session-glass');
    expect(material.props.tintColor).toBeUndefined();
    expect(StyleSheet.flatten(material.props.style).backgroundColor).toBe('rgba(201,182,138,0.32)');
  });
  it('honors Reduce Transparency with the same fallback', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(true);
    const view = render(<OwnlevelThemeProvider initialMode="light"><HomeButton label="+ Nueva sesión" testID="new-session" tone="soft" onPress={() => {}} /></OwnlevelThemeProvider>);
    await act(async () => {});
    expect(view.getByTestId('new-session-glass').props.tintColor).toBeUndefined();
  });
  it('does not turn the other primary session action into glass', () => {
    const view = render(<OwnlevelThemeProvider initialMode="light"><HomeButton label="Arrancar rutina" testID="start" tone="solid" onPress={() => {}} /></OwnlevelThemeProvider>);
    expect(view.queryByTestId('start-glass')).toBeNull();
  });
});
