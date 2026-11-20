import { useLocalSearchParams } from 'expo-router';
import { LinkRow } from '@/design-system';
import { insightsReturnHref, progressOriginParams } from './navigation';
import { insideProgress, useInsightsRouter } from './insights-router';

/** Only on a route opened from Insights. The other tab's back button goes through its own stack, not back here. */
export function ReturnToInsights() {
  const params = useLocalSearchParams(), router = useInsightsRouter();
  const href = insightsReturnHref(params);
  const label = href?.pathname === '/(tabs)/train/insights/period-nutrition' ? 'Volver a las comidas del período' : 'Volver a Comparaciones';
  // Opened from Progreso, Comparaciones lives in Progreso's stack: going back returns there, not to Entrenar.
  const fromProgress = !!progressOriginParams(params).fromProgress;
  return href ? <LinkRow kind="back" label={label} onPress={() => router.navigate(insideProgress(href, fromProgress))} /> : null;
}
