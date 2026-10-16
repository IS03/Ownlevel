import { Stack } from 'expo-router';
import { useStackScreenOptions } from '@/navigation/use-stack-screen-options';

const editorial = {
  headerTransparent: true,
  headerStyle: { backgroundColor: 'transparent' },
};
export default function SettingsLayout() {
  return (
    <Stack screenOptions={useStackScreenOptions()}>
      <Stack.Screen name="index" options={{ ...editorial, title: 'Ajustes' }} />
      <Stack.Screen name="metrics" options={{ title: 'Métricas' }} />
      <Stack.Screen name="diagnostics" options={{ title: 'Diagnóstico' }} />
      <Stack.Screen name="account" options={{ ...editorial, title: 'Cuenta' }} />
      <Stack.Screen name="app" options={{ ...editorial, title: 'App' }} />
      <Stack.Screen name="energy" options={{ ...editorial, title: 'Energía' }} />
      <Stack.Screen name="physical" options={{ ...editorial, title: 'Datos físicos' }} />
    </Stack>
  );
}
