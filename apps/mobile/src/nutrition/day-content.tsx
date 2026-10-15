import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { MobileNutritionDayResponse } from '@/api/nutrition-day';
import type { NutritionDayMeal } from '../../../../src/lib/mobile-api/nutrition-day-contract';
import { AppText, Button } from '@/design-system';
import { amount, number } from './day-format';
import { NutritionDaySummary } from './day-summary';
import { NutritionGlassButton, NutritionSectionHeading } from './day-controls';
import { NutritionDayPanel, NutritionDayDetailSheet } from './day-panel';

export { metricValue } from './day-details';
const mealLabels = { breakfast: 'Desayuno', lunch: 'Almuerzo', snack: 'Merienda', dinner: 'Cena', extra: 'Extra' };

export function NutritionDayContent({ data, onAdd, addChoices, onEdit, onActivity, onContext }: {
  data: MobileNutritionDayResponse; onAdd?: () => void; addChoices?: ReactNode; onEdit?: (meal: NutritionDayMeal) => void;
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
    <NutritionDayPanel data={data} onDetail={() => setDetail(true)} onActivity={onActivity} />
    {recorded ? <View style={styles.section}>
      <View style={styles.heading}><NutritionSectionHeading>Comidas</NutritionSectionHeading>
        <AppText muted numeric variant="caption">{recorded.summary.entryCount} · {recorded.summary.entryCount > 0 && recorded.summary.calories.missingCount === recorded.summary.entryCount ? 'Sin dato' : `${number(recorded.summary.calories.knownTotal)} kcal${recorded.summary.calories.missingCount > 0 ? ' · parcial' : ''}`}</AppText>
      </View>
      {recorded.meals.length === 0 ? <AppText muted>Sin comidas registradas</AppText> : recorded.meals.map(meal => <View key={meal.id} style={styles.meal}>
        {meal.mealLabel ? <AppText muted variant="caption">{mealLabels[meal.mealLabel]}</AppText> : null}
        <View style={styles.heading}>
          <AppText variant="headline" style={styles.mealTitle}>{meal.entryKind === 'legacy_daily_summary' ? 'Resumen histórico importado' : meal.title || meal.description || 'Comida'}</AppText>
          <AppText numeric variant="subheadline">{amount(meal.calories, 'kcal')}</AppText>
        </View>
        <AppText muted variant="caption">{meal.timeKnown ? new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Cordoba', hour: '2-digit', minute: '2-digit' }).format(new Date(meal.consumedAt)) : 'Hora sin dato'} · P {amount(meal.proteinG, 'g')} · C {amount(meal.carbsG, 'g')} · G {amount(meal.fatG, 'g')}{meal.precision === 'estimated' ? ' · estimado' : ''}</AppText>
        {meal.description && meal.description !== meal.title && meal.title ? <AppText muted variant="footnote">{meal.description}</AppText> : null}
        {onEdit && meal.entryKind === 'meal' && meal.sourceType === 'manual' ? <Button label="Editar comida" accessibilityLabel={`Editar ${meal.title || meal.description || 'comida'}`} onPress={() => onEdit(meal)} variant="quiet" /> : null}
      </View>)}
    </View> : null}
    {detail ? <NutritionDayDetailSheet data={data} onClose={() => setDetail(false)} onActivity={onActivity} onContext={onContext} /> : null}
  </>;
}
const styles = StyleSheet.create({
  section: { gap: 12 }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  meal: { gap: 4, paddingVertical: 12 }, mealTitle: { flex: 1 },
});
