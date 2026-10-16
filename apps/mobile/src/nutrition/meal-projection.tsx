import { View } from 'react-native';
import { useMobileApi } from '@/api';
import { AppText, SkeletonBlock, Surface } from '@/design-system';
import type { QuickNutrients } from '@/api/nutrition-quick';
import { useNutritionDayResource } from './day-resource';
import { dayRings, type RingReading } from './day-home-model';
import { NutritionRings } from './day-rings';
import { mealShown } from './meal-sheet';
/** `pending`: built on an estimate that is still being confirmed. */
export function MealProjection({ date, nutrients, pending = false }: { date: string; nutrients: QuickNutrients; pending?: boolean }) {
  const { client } = useMobileApi();
  const { state } = useNutritionDayResource(client, date);
  const data = state.status === 'ready' ? state.current.data : undefined;
  const rings = dayRings(data);
  const add = (reading: RingReading, n: number | null): RingReading => ({ ...reading, value: reading.value === null || n === null ? null : reading.value + n });
  const next = { calories: add(rings.calories, nutrients.calories), protein: add(rings.protein, nutrients.proteinG) };
  const text = (reading: RingReading, unit: string) => `${mealShown(reading.value)}${reading.target === null ? '' : ` / ${mealShown(reading.target)}`} ${unit}${reading.partial ? ' · parcial' : ''}`;
  return <Surface style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} testID="meal-day-projection">
    <NutritionRings readings={next} size={64} /><View style={{ flex: 1, gap: 4 }}>
      <AppText muted variant="footnote">Así queda tu día</AppText>
      {data ? <AppText numeric muted={pending} variant="subheadline">{`${text(next.calories, 'kcal')} · ${text(next.protein, 'g')}`}</AppText>
        : state.status === 'loading' ? <SkeletonBlock height={20} width={180} />
        : <AppText variant="subheadline">No pudimos confirmar el resumen del día.</AppText>}
    </View>
  </Surface>;
}
