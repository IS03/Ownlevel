import { Platform, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { AppIcon, brandTokens, useOwnlevelTheme } from '@/design-system';
import { useStackScreenOptions } from '@/navigation/use-stack-screen-options';

const editorial = {
  headerTransparent: true,
  headerStyle: { backgroundColor: 'transparent' },
};
export default function SettingsLayout() {
  const { colors } = useOwnlevelTheme();
  // Each settings screen: on iOS the native large title (big at the top, small in the bar while scrolling; the screen draws
  // no title of its own, see ScreenTitle). Android has no large title: the bar stays empty and the screen draws the title.
  const titled = Platform.OS === 'ios'
    ? { headerLargeTitleEnabled: true, headerLargeTitleStyle: { color: colors.text }, headerStyle: { backgroundColor: 'transparent' },
      headerLargeStyle: { backgroundColor: 'transparent' }, headerBackButtonMenuEnabled: false }
    : { ...editorial, headerTitle: '' };
  return (
    <Stack screenOptions={useStackScreenOptions()}>
      <Stack.Screen name="index" options={{ ...editorial, title: 'Ajustes', headerLeft: () => <SettingsBack /> }} />
      <Stack.Screen name="metrics" options={{ ...titled, title: 'Métricas' }} />
      <Stack.Screen name="meal-moments" options={{ ...titled, title: 'Horarios de comidas' }} />
      <Stack.Screen name="diagnostics" options={{ ...editorial, title: 'Diagnóstico' }} />
      <Stack.Screen name="account" options={{ ...titled, title: 'Cuenta' }} />
      <Stack.Screen name="delete-account" options={{ ...titled, title: 'Eliminar cuenta' }} />
      <Stack.Screen name="app" options={{ ...titled, title: 'App' }} />
      <Stack.Screen name="energy" options={{ ...titled, title: 'Energía' }} />
      <Stack.Screen name="physical" options={{ ...titled, title: 'Datos físicos' }} />
      <Stack.Screen name="stages" options={{ ...titled, title: 'Etapas' }} />
      <Stack.Screen name="stage-action" options={{ ...editorial, title: 'Tu plan' }} />
      <Stack.Screen name="stage-plan" options={{ ...titled, title: 'Plan nutricional' }} />
      <Stack.Screen name="stage-sequence" options={{ ...titled, title: 'Programar etapas' }} />
    </Stack>
  );
}
/** Ajustes is the first screen of its own stack, so iOS draws no back button: this one returns to where you came from. */
function SettingsBack() {
  const router = useRouter();
  const { colors } = useOwnlevelTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Volver"
      hitSlop={brandTokens.space.xs}
      onPress={() => router.back()}
      style={{ width: brandTokens.layout.minTouch, height: brandTokens.layout.minTouch, alignItems: 'center', justifyContent: 'center' }}
    >
      <AppIcon name="chevronLeft" size={20} color={colors.text} />
    </Pressable>
  );
}
