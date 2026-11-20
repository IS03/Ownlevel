import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinkRow } from '@/design-system';
import { progressOriginParams } from './navigation';
import { useInProgressStack } from './insights-router';
/**
 * A fixed destination, never a route supplied by a parameter. navigate reuses the existing tab root. Opened from Progreso →
 * Entrenamiento (#518), it goes back to that screen, whose period lives in Progreso's range provider and is still there.
 */
export function ReturnToProgress() {
  const params = useLocalSearchParams(), router = useRouter();
  const origin = progressOriginParams({ fromProgress: params.fromProgress ?? params.insightsFromProgress }).fromProgress;
  // Inside Progreso's own stack the native back already returns there: no second way back.
  const inProgress = useInProgressStack();
  if (!origin || inProgress) return null;
  return origin === 'training'
    ? <LinkRow kind="back" label="Volver a Entrenamiento" onPress={() => router.navigate('/(tabs)/progress/trends/training')} />
    : <LinkRow kind="back" label="Volver a Progreso" onPress={() => router.navigate('/(tabs)/progress')} />;
}
