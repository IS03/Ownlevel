import { Stack } from 'expo-router';

import { useStackScreenOptions } from '@/navigation/use-stack-screen-options';

export default function NutritionLayout() {
  return (
    <Stack screenOptions={useStackScreenOptions()}>
      <Stack.Screen name="index" options={{ title: 'Nutrición', headerShown: false }} />
      <Stack.Screen name="reports" options={{ title: 'Reporte nutricional' }} />
    </Stack>
  );
}
