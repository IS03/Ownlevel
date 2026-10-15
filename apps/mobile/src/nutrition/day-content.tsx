import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { MobileNutritionDayResponse, NutritionDayMetric } from '@/api/nutrition-day';
import type { NutritionDayMeal } from '../../../../src/lib/mobile-api/nutrition-day-contract';
import { AppIcon, AppText, useOwnlevelTheme } from '@/design-system';
import { amount, number } from './day-format';
import { NutritionDaySummary } from './day-summary';
import { NutritionGlassButton, NutritionSectionHeading } from './day-controls';
import { NutritionDayPanel, NutritionDayDetailSheet } from './day-panel';

export { metricValue } from './day-details';
const mealLabels = { breakfast: 'Desayuno', lunch: 'Almuerzo', snack: 'Merienda', dinner: 'Cena', extra: 'Extra' };
const time = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Cordoba', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const mealTitle = (meal: NutritionDayMeal) => meal.entryKind === 'legacy_daily_summary' ? 'Resumen histórico importado' : meal.title || meal.description || 'Comida';

/** E5: grouped by moment in the server's order; without any moment the list stays flat (no invented "Otras" heading). */
export function mealGroups(meals: NutritionDayMeal[]) {
  if (!meals.some(meal => meal.mealLabel)) return [{ key: 'all', label: null as string | null, meals }];
  const order = [...Object.keys(mealLabels), 'none'] as const;
  return order.map(key => ({ key, label: key === 'none' ? 'Sin momento' : mealLabels[key as keyof typeof mealLabels],
    meals: meals.filter(meal => (meal.mealLabel ?? 'none') === key) })).filter(group => group.meals.length > 0);
}
/** Flat row: name and kcal, then time and macros. The full description belongs to the meal detail (paso 4). */
function MealRow({ meal, divider, onEdit }: { meal: NutritionDayMeal; divider: boolean; onEdit?: (meal: NutritionDayMeal) => void }) {
  const { colors } = useOwnlevelTheme();
  const editable = !!onEdit && meal.entryKind === 'meal' && meal.sourceType === 'manual';
  const meta = `${meal.timeKnown ? time.format(new Date(meal.consumedAt)) : 'Hora sin dato'} · P ${amount(meal.proteinG, 'g')} · C ${amount(meal.carbsG, 'g')} · G ${amount(meal.fatG, 'g')}${meal.precision === 'estimated' ? ' · estimado' : ''}`;
  const body = <>
    {divider ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
    <View style={styles.mealText}>
      <AppText numberOfLines={2} variant="headline">{mealTitle(meal)}</AppText>
      <AppText muted numeric numberOfLines={1} variant="caption">{meta}</AppText>
    </View>
    <AppText numeric variant="subheadline">{amount(meal.calories, 'kcal')}</AppText>
    {editable ? <AppIcon name="chevronRight" color={colors.textMuted} size={15} /> : null}
  </>;
  return editable ? <Pressable accessibilityRole="button" accessibilityLabel={`${mealTitle(meal)}, ${amount(meal.calories, 'kcal')}. ${meta}`} accessibilityHint="Abre la edición"
    onPress={() => onEdit(meal)} style={({ pressed }) => [styles.meal, pressed && { opacity: 0.6 }]}>{body}</Pressable>
    : <View accessible style={styles.meal}>{body}</View>;
}

export function NutritionDayContent({ data, onAdd, addChoices, onEdit, onActivity, onContext, onMetric }: {
  data: MobileNutritionDayResponse; onAdd?: () => void; addChoices?: ReactNode; onEdit?: (meal: NutritionDayMeal) => void;
  onMetric?: (data: MobileNutritionDayResponse, metric: NutritionDayMetric) => void;
  onActivity?: (data: MobileNutritionDayResponse) => void; onContext?: (data: MobileNutritionDayResponse) => void;
}) {
  const [detail, setDetail] = useState(false);
  const nutrition = data.nutrition.status === 'ok' ? data.nutrition.data : null;
  const recorded = nutrition?.dayState === 'recorded' ? nutrition : null;
  return <>
    <NutritionDaySummary data={data} />
    <NutritionGlassButton icon="plus" label="Agregar comida" wide onPress={onAdd} />
    {addChoices}
    {!nutrition ? <AppText accessibilityRole="alert">Nutrición no disponible. No pudimos consultar el resumen ni las comidas de esta fecha. Deslizá para reintentar.</AppText>
      : !recorded ? <View style={styles.section}><AppText variant="headline">Sin día registrado</AppText><AppText muted>Esta fecha todavía no tiene un registro nutricional. No hay resumen ni objetivos guardados.</AppText></View> : null}
    {recorded && Object.values(recorded.summary).some(v => typeof v === 'object' && v.missingCount > 0) ?
      <AppText muted variant="caption">Las sumas parciales incluyen sólo valores conocidos. “Sin dato” no significa cero.</AppText> : null}
    <NutritionDayPanel data={data} onDetail={() => setDetail(true)} onMetric={onMetric} />
    {recorded ? <View style={styles.section}>
      <View style={styles.heading}><NutritionSectionHeading>Comidas</NutritionSectionHeading>
        <AppText muted numeric variant="caption">{recorded.summary.entryCount} · {recorded.summary.entryCount > 0 && recorded.summary.calories.missingCount === recorded.summary.entryCount ? 'Sin dato' : `${number(recorded.summary.calories.knownTotal)} kcal${recorded.summary.calories.missingCount > 0 ? ' · parcial' : ''}`}</AppText>
      </View>
      {recorded.meals.length === 0 ? <AppText muted>Sin comidas registradas</AppText> : mealGroups(recorded.meals).map(group => <View key={group.key} style={styles.group}>
        {group.label ? <AppText muted variant="footnote" style={styles.groupLabel}>{group.label}</AppText> : null}
        {group.meals.map((meal, index) => <MealRow key={meal.id} meal={meal} divider={index > 0} onEdit={onEdit} />)}
      </View>)}
    </View> : null}
    {detail ? <NutritionDayDetailSheet data={data} onClose={() => setDetail(false)} onActivity={onActivity} onContext={onContext} /> : null}
  </>;
}
const styles = StyleSheet.create({
  section: { gap: 12 }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  group: { gap: 0 }, groupLabel: { fontWeight: '600', paddingTop: 4 },
  meal: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }, mealText: { flex: 1, gap: 2 },
  divider: { position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth },
});
