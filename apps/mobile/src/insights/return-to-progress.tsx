import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/design-system';
import { progressOriginParams } from './navigation';
/**
 * A fixed destination, never a route supplied by a parameter. navigate reuses the existing tab root. Opened from Progreso →
 * Entrenamiento (#518), it goes back to that screen, whose period lives in Progreso's range provider and is still there.
 */
export function ReturnToProgress() {
  const params = useLocalSearchParams(), router = useRouter();
  const origin = progressOriginParams({ fromProgress: params.fromProgress ?? params.insightsFromProgress }).fromProgress;
  if (!origin) return null;
  return origin === 'training'
    ? <Button label="Volver a Entrenamiento" variant="secondary" onPress={() => router.navigate('/(tabs)/progress/trends/training')} />
    : <Button label="Volver a Progreso" variant="secondary" onPress={() => router.navigate('/(tabs)/progress')} />;
}
