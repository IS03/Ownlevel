import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinkRow } from '@/design-system';
import { historyDayHref, historyReturnParams } from './navigation';
export function ReturnToHistoryDay() {
  const params = useLocalSearchParams(), router = useRouter();
  const origin = historyReturnParams(params);
  return origin ? <LinkRow kind="back" label="Volver al día" onPress={() => router.navigate(historyDayHref(origin.historyDate, origin.historyMonth))} /> : null;
}
