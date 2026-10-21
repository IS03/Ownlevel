import { Stack } from 'expo-router';

import { useStackScreenOptions } from '@/navigation/use-stack-screen-options';
import { ProgressRangeProvider } from '@/progress/progress-range-context';

export default function ProgressLayout() {
  return (
    // One period and comparison for the whole Progreso stack. Screens on ProgressScroll draw their own header
    // (hidden here too, so the native bar never flashes and never shifts the content inset on the way back).
    <ProgressRangeProvider><Stack screenOptions={useStackScreenOptions()}>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Progreso' }} />
      <Stack.Screen name="body" options={{ title: 'Cuerpo' }} />
      <Stack.Screen name="metrics" options={{ title: 'Métricas diarias' }} />
      <Stack.Screen name="trends/body" options={{ headerShown: false, title: 'Cuerpo' }} />
      <Stack.Screen name="trends/metrics" options={{ headerShown: false, title: 'Métricas' }} />
      <Stack.Screen name="trends/nutrition" options={{ headerShown: false, title: 'Nutrición' }} />
      <Stack.Screen name="trends/meal-times" options={{ headerShown: false, title: 'Cuándo comés' }} />
      <Stack.Screen name="trends/training" options={{ headerShown: false, title: 'Entrenamiento' }} />
      <Stack.Screen name="trends/exercise/[id]" options={{ headerShown: false, title: 'Ejercicio' }} />
      <Stack.Screen name="explore" options={{ headerShown: false, title: 'Explorar' }} />
      <Stack.Screen name="views" options={{ title: 'Mis vistas' }} />
      {/* The page opens with its own large title: the bar only keeps Back, so the name is never said twice. */}
      <Stack.Screen name="stages" options={{ title: 'Tus etapas', headerTitle: '', headerTransparent: true, headerStyle: { backgroundColor: 'transparent' } }} />
      <Stack.Screen name="connections/[key]" options={{ headerShown: false, title: 'Lo que se movió junto' }} />
      <Stack.Screen name="influence/index" options={{ headerShown: false, title: 'Qué influye' }} />
      <Stack.Screen name="influence/answer" options={{ headerShown: false, title: 'Tu pregunta' }} />
      <Stack.Screen name="influence/build" options={{ headerShown: false, title: 'Tu pregunta' }} />
    </Stack></ProgressRangeProvider>
  );
}
