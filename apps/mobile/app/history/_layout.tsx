import { Stack } from 'expo-router';
import { useStackScreenOptions } from '@/navigation/use-stack-screen-options';
export default function HistoryLayout() {
  return <Stack screenOptions={{ ...useStackScreenOptions(), headerShown: false }}>
    <Stack.Screen name="index" options={{ title: 'Historial' }} />
    <Stack.Screen name="calendar" options={{ title: 'Calendario' }} />
    <Stack.Screen name="day/[date]" options={{ title: 'Día' }} />
  </Stack>;
}
