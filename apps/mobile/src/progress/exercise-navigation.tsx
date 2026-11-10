import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/design-system';

/** A closed route, not a caller-supplied redirect. Range/A-B and inspection stay in the mounted Progreso stack. */
export function exerciseChartReturnHref(params: Record<string, unknown>) {
  const id = params.fromProgressExercise;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  return { pathname: '/(tabs)/progress/trends/exercise/[id]' as const, params: { id } };
}
export const exerciseSessionHref = (exerciseId: string, sessionId: string) => ({
  pathname: '/(tabs)/train/history/[id]' as const,
  params: { id: sessionId, fromProgressExercise: exerciseId },
});

export function ReturnToExerciseChart() {
  const router = useRouter(), href = exerciseChartReturnHref(useLocalSearchParams());
  // navigate reuses the existing screen instead of pushing another chart on every round trip.
  return href ? <Button label="Volver al gráfico del ejercicio" variant="secondary" onPress={() => router.navigate(href)} /> : null;
}
