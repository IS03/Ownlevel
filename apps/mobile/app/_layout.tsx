import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { MobileAuthProvider, useMobileAuth } from '@/auth';
import { MobileApiProvider } from '@/api';
import { createThemePreferenceStorage, OwnlevelThemeProvider, useOwnlevelTheme } from '@/design-system';
import { NutritionConfigurationProvider } from '@/nutrition/config-provider';
import { initHapticsPreference } from '@/platform/haptics';
import { createHapticsPreferenceStorage } from '@/platform/haptics-preference';
import { useStackScreenOptions } from '@/navigation/use-stack-screen-options';
import { SessionPresenceProvider } from '@/training/session-presence-provider';
import { EntryTransitionProvider } from '@/entry/transition';

const themePreference = createThemePreferenceStorage(AsyncStorage);
initHapticsPreference(createHapticsPreferenceStorage(AsyncStorage));

void SplashScreen.preventAutoHideAsync().catch(() => {
  // Fast refresh can call this after the native splash has already been handled.
});

function RootNavigator() {
  const { session } = useMobileAuth();
  const { colors, isDark } = useOwnlevelTheme();
  const screenOptions = useStackScreenOptions();
  const navigationTheme = useMemo(
    () => ({
      ...(isDark ? DarkTheme : DefaultTheme),
      colors: {
        ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
        background: colors.background,
        border: colors.border,
        card: colors.surface,
        primary: colors.primary,
        text: colors.text,
      },
    }),
    [colors, isDark],
  );

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {
      // System chrome theming is best-effort on unsupported targets.
    });
  }, [colors.background]);

  useEffect(() => {
    // The entry presentation renders the bootstrap artwork while session restoration runs.
    void SplashScreen.hideAsync().catch(() => {
      // The splash may already be hidden during fast refresh.
    });
  }, []);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <NutritionConfigurationProvider>
      <SessionPresenceProvider>
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="auth" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(session)}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="history" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
      </SessionPresenceProvider>
      </NutritionConfigurationProvider>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider>
      <OwnlevelThemeProvider persistence={themePreference}>
        <MobileAuthProvider>
          <MobileApiProvider>
            <EntryTransitionProvider>
              <RootNavigator />
            </EntryTransitionProvider>
          </MobileApiProvider>
        </MobileAuthProvider>
      </OwnlevelThemeProvider>
    </SafeAreaProvider></GestureHandlerRootView>
  );
}
