import { Redirect } from 'expo-router';

/** The training calendar now lives inside Historial (HI2). */
export default function TrainingCalendarRedirect() {
  return <Redirect href="/(tabs)/train/history" />;
}
