import { Stack } from 'expo-router';

import { useStackScreenOptions } from '@/navigation/use-stack-screen-options';
import { ProgressRangeProvider } from '@/progress/progress-range-context';

export default function ProgressLayout() {
  return (
    // One period and comparison for the whole Progreso stack. Screens on ProgressScroll draw their own header
    // (hidden here too, so the native bar never flashes and never shifts the content inset on the way back).
    <ProgressRangeProvider><Stack screenOptions={useStackScreenOptions()}>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Progreso' }} />
      <Stack.Screen name="compare" options={{ headerShown: false, title: 'Comparar períodos' }} />
      <Stack.Screen name="period" options={{ headerShown: false, title: 'Explorar período' }} />
      <Stack.Screen name="body" options={{ headerShown: false, title: 'Cuerpo' }} />
      <Stack.Screen name="metrics" options={{ headerShown: false, title: 'Métricas diarias' }} />
      <Stack.Screen name="trends/body" options={{ headerShown: false, title: 'Cuerpo' }} />
      <Stack.Screen name="trends/metrics" options={{ headerShown: false, title: 'Métricas' }} />
      <Stack.Screen name="trends/nutrition" options={{ headerShown: false, title: 'Nutrición' }} />
      <Stack.Screen name="trends/meal-times" options={{ headerShown: false, title: 'Cuándo comés' }} />
      <Stack.Screen name="trends/training" options={{ headerShown: false, title: 'Entrenamiento' }} />
      <Stack.Screen name="trends/training-times" options={{ headerShown: false, title: 'Tus horarios' }} />
      <Stack.Screen name="training-session/[id]" options={{ title: '', headerBackTitle: 'Tus horarios', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="trends/exercise/[id]" options={{ headerShown: false, title: 'Ejercicio' }} />
      <Stack.Screen name="explore" options={{ headerShown: false, title: 'Explorar' }} />
      <Stack.Screen name="views" options={{ headerShown: false, title: 'Mis vistas' }} />
      {/* These readers share the floating header and progressive scroll blur. */}
      <Stack.Screen name="stages" options={{ title: 'Tus etapas', headerShown: false }} />
      <Stack.Screen name="connections/[key]" options={{ headerShown: false, title: 'Lo que se movió junto' }} />
      <Stack.Screen name="influence/index" options={{ headerShown: false, title: 'Qué influye' }} />
      <Stack.Screen name="influence/answer" options={{ headerShown: false, title: 'Tu pregunta' }} />
      <Stack.Screen name="influence/build" options={{ headerShown: false, title: 'Tu pregunta' }} />
      {/* Comparaciones and the three-month summary, the same screens as in Entrenar: opened from Progreso they stay in this stack. */}
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
    </Stack></ProgressRangeProvider>
  );
}
