import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/design-system';
import { insightsReturnHref } from './navigation';

/** Only on a route opened from Insights. The other tab's back button goes through its own stack, not back here. */
export function ReturnToInsights() {
  const params = useLocalSearchParams(), router = useRouter();
  const href = insightsReturnHref(params);
  return href ? <Button label="Volver a Insights" variant="secondary" onPress={() => router.navigate(href)} /> : null;
}
