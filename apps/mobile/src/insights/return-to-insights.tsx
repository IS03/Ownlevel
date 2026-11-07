import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/design-system';
import { insightsReturnHref } from './navigation';

/** Only on a route opened from Insights. The other tab's back button goes through its own stack, not back here. */
export function ReturnToInsights() {
  const params = useLocalSearchParams(), router = useRouter();
  const href = insightsReturnHref(params);
  const label = href?.pathname === '/(tabs)/train/insights/period-nutrition' ? 'Volver a las comidas del período' : 'Volver a Insights';
  return href ? <Button label={label} variant="secondary" onPress={() => router.navigate(href)} /> : null;
}
