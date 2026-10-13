import { Stack } from 'expo-router';

import { useStackScreenOptions } from '@/navigation/use-stack-screen-options';

export default function TrainLayout() {
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="routines" options={{ title: 'Rutinas' }} />
      <Stack.Screen name="routines/archived" options={{ title: 'Archivadas' }} />
      <Stack.Screen
        name="routines/[id]"
        options={{ headerBackButtonMenuEnabled: false, title: 'Rutinas' }}
      />
      <Stack.Screen name="exercises/index" options={{ title: 'Ejercicios' }} />
      <Stack.Screen name="exercises/[id]" options={{ title: 'Ejercicio' }} />
      <Stack.Screen name="session/[id]" options={{ title: 'Entrenar' }} />
      <Stack.Screen name="history/index" options={{ title: 'Historial' }} />
      <Stack.Screen name="history/[id]" options={{ title: 'Sesión' }} />
      <Stack.Screen name="history/exercise/[id]" options={{ title: 'Ejercicio' }} />
      <Stack.Screen name="calendar" options={{ title: 'Calendario' }} />
      <Stack.Screen name="day/[date]" options={{ title: 'Día' }} />
      <Stack.Screen name="correct/[id]" options={{ title: 'Corregir sesión' }} />
    </Stack>
  );
}
