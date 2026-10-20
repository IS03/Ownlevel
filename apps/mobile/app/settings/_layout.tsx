import { Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { AppIcon, brandTokens, useOwnlevelTheme } from '@/design-system';
import { useStackScreenOptions } from '@/navigation/use-stack-screen-options';

const editorial = {
  headerTransparent: true,
  headerStyle: { backgroundColor: 'transparent' },
};
export default function SettingsLayout() {
  return (
    <Stack screenOptions={useStackScreenOptions()}>
      <Stack.Screen name="index" options={{ ...editorial, title: 'Ajustes', headerLeft: () => <SettingsBack /> }} />
      <Stack.Screen name="metrics" options={{ ...editorial, title: 'Métricas' }} />
      <Stack.Screen name="diagnostics" options={{ ...editorial, title: 'Diagnóstico' }} />
      <Stack.Screen name="account" options={{ ...editorial, title: 'Cuenta' }} />
      <Stack.Screen name="delete-account" options={{ ...editorial, title: 'Eliminar cuenta' }} />
      <Stack.Screen name="app" options={{ ...editorial, title: 'App' }} />
      <Stack.Screen name="energy" options={{ ...editorial, title: 'Energía' }} />
      <Stack.Screen name="physical" options={{ ...editorial, title: 'Datos físicos' }} />
      <Stack.Screen name="stages" options={{ ...editorial, title: 'Etapas' }} />
      <Stack.Screen name="stage-action" options={{ ...editorial, title: 'Tu plan' }} />
      <Stack.Screen name="stage-plan" options={{ ...editorial, title: 'Plan nutricional' }} />
      <Stack.Screen name="stage-sequence" options={{ ...editorial, title: 'Programar etapas' }} />
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
