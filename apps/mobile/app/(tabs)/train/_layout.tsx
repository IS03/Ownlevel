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
      <Stack.Screen name="history/[id]" options={{ title: '', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="history/exercise/[id]" options={{ title: 'Ejercicio' }} />
      <Stack.Screen name="insights/index" options={{ headerShown: false, title: 'Comparaciones' }} />
      <Stack.Screen name="insights/[relation]" options={{ headerShown: false, title: 'Relación' }} />
      <Stack.Screen name="insights/evidence" options={{ headerShown: false, title: 'Ejercicio' }} />
      <Stack.Screen name="insights/feelings" options={{ headerShown: false, title: 'Cómo terminaste' }} />
      <Stack.Screen name="insights/period" options={{ headerShown: false, title: 'Últimos 3 meses' }} />
      <Stack.Screen name="insights/period-feelings" options={{ headerShown: false, title: 'Sensaciones del período' }} />
      <Stack.Screen name="insights/period-nutrition" options={{ headerShown: false, title: 'Comidas del período' }} />
      <Stack.Screen name="insights/temporal" options={{ headerShown: false, title: 'Horarios y comidas' }} />
      <Stack.Screen name="insights/tramo" options={{ headerShown: false, title: 'Cómo llegaste' }} />
      <Stack.Screen name="insights/own" options={{ headerShown: false, title: 'Tu rendimiento' }} />
      <Stack.Screen name="insights/weeks" options={{ headerShown: false, title: 'Semanas y días' }} />
      <Stack.Screen name="calendar" options={{ title: 'Calendario' }} />
      <Stack.Screen name="day/[date]" options={{ title: 'Día' }} />
      <Stack.Screen name="correct/[id]" options={{ title: 'Corregir sesión' }} />
    </Stack>
  );
}
