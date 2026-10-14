import { Redirect, useLocalSearchParams } from 'expo-router';
import { historyReturnParams } from '@/history/navigation';

/** A training day now opens Historial with that day chosen (HI2); history return params pass through. */
export default function TrainingDayRedirect() {
  const params = useLocalSearchParams();
  const date = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined;
  return <Redirect href={{ pathname: '/(tabs)/train/history', params: { ...(date ? { date } : {}), ...historyReturnParams(params) } }} />;
}
