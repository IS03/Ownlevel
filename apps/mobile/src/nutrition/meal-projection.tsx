import { StyleSheet, View } from 'react-native';
import { useMobileApi } from '@/api';
import { AppText, SkeletonBlock, useOwnlevelTheme } from '@/design-system';
import type { QuickNutrients } from '@/api/nutrition-quick';
import type { MobileNutritionDayResponse, NutritionDayMeal } from '@/api/nutrition-day';
import { useNutritionDayResource } from './day-resource';
import { dayRings, type RingReading } from './day-home-model';
import { mealShown } from './meal-sheet';
import { mealMoments } from './meal-timing-model';

type Moment = NutritionDayMeal['mealLabel'];
export type ProjectionLine = { before: number | null; after: number | null; target: number | null; partial: boolean };

/**
 * What the day reads before and after this meal. A day with nothing recorded yet ends with exactly this meal (its known
 * values); an unknown day total or an unknown value of the meal stays unknown (missing ≠ zero).
 */
export function projectionLines(data: MobileNutritionDayResponse, nutrients: QuickNutrients) {
  const recorded = data.nutrition.status === 'ok' && data.nutrition.data.dayState === 'recorded';
  const rings = dayRings(data);
  const line = (reading: RingReading, n: number | null): ProjectionLine => {
    const before = recorded ? reading.value : 0;
    return { before, after: before === null || n === null ? null : before + n, target: reading.target, partial: reading.partial };
  };
  return { calories: line(rings.calories, nutrients.calories), protein: line(rings.protein, nutrients.proteinG) };
}

/** The meals already in that moment of the day (declared, or the server's own reading of the time). */
export function momentMeals(data: MobileNutritionDayResponse, moment: Moment | undefined): NutritionDayMeal[] {
  if (!moment || data.nutrition.status !== 'ok' || data.nutrition.data.dayState !== 'recorded') return [];
  return data.nutrition.data.meals.filter(m => (m.mealLabel ?? m.automaticMealLabel ?? null) === moment);
}

function Line({ label, unit, line, pending }: { label: string; unit: string; line: ProjectionLine; pending: boolean }) {
  const { colors } = useOwnlevelTheme();
  const known = line.after !== null && line.before !== null;
  const scale = line.target !== null && line.target > 0 ? line.target : null;
  const width = (n: number) => `${Math.max(0, Math.min(100, (n / scale!) * 100))}%` as const;
  const value = !known ? 'Sin datos'
    : `${mealShown(line.before)} → ${mealShown(line.after)}${scale !== null ? ` de ${mealShown(scale)}` : ''} ${unit}`;
  return <View style={styles.line} accessible accessibilityLabel={`${label}: ${known ? `${mealShown(line.before)} antes, ${mealShown(line.after)} después${scale !== null ? `, de ${mealShown(scale)} ${unit}` : ` ${unit}`}` : 'sin datos'}${line.partial ? ', parcial' : ''}`}>
    <View style={styles.lineText}>
      <AppText muted variant="subheadline">{label}{line.partial ? ' · parcial' : ''}</AppText>
      <AppText numeric muted={pending} variant="subheadline">{value}</AppText>
    </View>
    {known && scale !== null ? <View style={[styles.track, { backgroundColor: colors.surfaceRaised }]}>
      <View style={[styles.fill, { width: width(line.after!), backgroundColor: colors.action, opacity: pending ? 0.5 : 1 }]} />
      <View style={[styles.fill, { width: width(line.before!), backgroundColor: colors.textMuted, opacity: 0.45 }]} />
    </View> : null}
  </View>;
}

/** `pending`: built on an estimate that is still being confirmed. */
export function MealProjection({ date, nutrients, pending = false }: { date: string; nutrients: QuickNutrients; pending?: boolean }) {
  const { client } = useMobileApi();
  const { state } = useNutritionDayResource(client, date);
  const data = state.status === 'ready' ? state.current.data : undefined;
  if (!data) return <View style={styles.block} testID="meal-day-projection">
    <AppText muted variant="footnote">Así queda tu día</AppText>
    {state.status === 'loading' ? <SkeletonBlock height={44} width="100%" /> : <AppText variant="subheadline">No pudimos confirmar el resumen del día.</AppText>}
  </View>;
  if (data.nutrition.status !== 'ok') return <View style={styles.block} testID="meal-day-projection">
    <AppText muted variant="footnote">Así queda tu día</AppText><AppText variant="subheadline">No pudimos confirmar el resumen del día.</AppText>
  </View>;
  const lines = projectionLines(data, nutrients);
  return <View style={styles.block} testID="meal-day-projection">
    <AppText muted variant="footnote">Así queda tu día</AppText>
    <Line label="Calorías" unit="kcal" line={lines.calories} pending={pending} />
    <Line label="Proteína" unit="g" line={lines.protein} pending={pending} />
  </View>;
}

/** What is already registered in that moment of the day, so the same thing is not added twice. Nothing while the day is unknown. */
export function MomentMeals({ date, moment }: { date: string; moment?: Moment }) {
  const { client } = useMobileApi();
  const { state } = useNutritionDayResource(client, date);
  const data = state.status === 'ready' ? state.current.data : undefined;
  if (!data || !moment || data.nutrition.status !== 'ok') return null;
  const already = momentMeals(data, moment);
  return <View style={styles.moment} testID="meal-moment-already">
    <AppText muted variant="footnote">{already.length ? `Ya en ${mealMoments[moment]}` : `Nada en ${mealMoments[moment]} todavía`}</AppText>
    {already.slice(0, 3).map(m => <View key={m.id} style={styles.mealRow}>
      <AppText numberOfLines={1} style={styles.mealName} variant="subheadline">{m.title ?? m.description ?? 'Comida'}</AppText>
      <AppText numeric muted variant="subheadline">{m.calories === null ? 'Sin datos' : `${mealShown(m.calories)} kcal`}</AppText>
    </View>)}
    {already.length > 3 ? <AppText muted variant="footnote">{`y ${already.length - 3} más`}</AppText> : null}
  </View>;
}
const styles = StyleSheet.create({
  block: { gap: 12 }, line: { gap: 6 }, lineText: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 12, rowGap: 2 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' }, fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  moment: { gap: 4 }, mealRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, minHeight: 24, alignItems: 'center' }, mealName: { flexShrink: 1 },
});
