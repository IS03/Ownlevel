import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/design-system';
import { progressOriginParams } from './navigation';
/** A fixed destination, never a route supplied by a parameter. navigate reuses the existing tab root. */
export function ReturnToProgress() { const params = useLocalSearchParams(), router = useRouter(); return progressOriginParams({ fromProgress: params.fromProgress ?? params.insightsFromProgress }).fromProgress ? <Button label="Volver a Progreso" variant="secondary" onPress={() => router.navigate('/(tabs)/progress')}/> : null; }
