import { Stack } from 'expo-router';

import { useStackScreenOptions } from '@/navigation/use-stack-screen-options';
import { ProgressRangeProvider } from '@/progress/progress-range-context';

export default function ProgressLayout() {
  return (
    // One period and comparison for the whole Progreso stack.
    <ProgressRangeProvider><Stack screenOptions={useStackScreenOptions()}>
      <Stack.Screen name="index" options={{ title: 'Progreso' }} />
      <Stack.Screen name="body" options={{ title: 'Cuerpo' }} />
      <Stack.Screen name="metrics" options={{ title: 'Métricas diarias' }} />
      <Stack.Screen name="trends/body" options={{ title: 'Cuerpo' }} />
      <Stack.Screen name="trends/metrics" options={{ title: 'Métricas' }} />
      <Stack.Screen name="trends/nutrition" options={{ title: 'Nutrición' }} />
      <Stack.Screen name="trends/meal-times" options={{ title: 'Cuándo comés' }} />
      <Stack.Screen name="trends/training" options={{ title: 'Entrenamiento' }} />
      <Stack.Screen name="trends/exercise/[id]" options={{ title: 'Ejercicio' }} />
      <Stack.Screen name="explore" options={{ title: 'Explorar' }} />
      <Stack.Screen name="views" options={{ title: 'Mis vistas' }} />
      <Stack.Screen name="influence/index" options={{ title: 'Qué influye' }} />
      <Stack.Screen name="influence/answer" options={{ title: 'Tu pregunta' }} />
      <Stack.Screen name="influence/build" options={{ title: 'Tu pregunta' }} />
    </Stack></ProgressRangeProvider>
  );
}
