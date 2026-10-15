import { Pressable, StyleSheet, View } from 'react-native';
import { AppIcon, AppText, Heading, LoadingState, Button, useOwnlevelTheme } from '@/design-system';
import type { PersonalFood } from '@/api/nutrition-food';
import type { FoodController, FoodState } from './food-controller';
import { MealSheet, MealSearch, mealShown, mealSheetStyles as shared } from './meal-sheet';
import { MealDateControl } from './meal-date-control';
import { NutritionGlassButton } from './day-controls';
export function FoodAddPicker({ controller, state, onChoose, onClose }: { controller: FoodController; state: FoodState; onChoose: (food: PersonalFood) => void; onClose: () => void }) {
  const { colors } = useOwnlevelTheme(), locked = state.phase !== 'idle' || !!state.intent;
  return <MealSheet embedded title="Alimento" onClose={onClose} testID="food-add-picker" right={<MealDateControl date={state.date!} disabled={locked} onChange={date => controller.changeDate(date)} />}>
    <MealSearch label="Buscar alimento" value={state.search} onChange={search => controller.query(search)} />
    <Heading level={2}>Tus alimentos</Heading>
    {state.listLoading ? <LoadingState label="Cargando alimentos" /> : null}
    {state.listError ? <><AppText accessibilityRole="alert">No pudimos actualizar tus alimentos.</AppText><Button label="Reintentar catálogo" onPress={() => void controller.load()} /></> : null}
    {!state.listLoading && !state.listError && state.foods?.length === 0 ? <AppText muted>{state.search.trim() ? 'No encontramos alimentos con esa búsqueda.' : 'Todavía no tenés alimentos. Podés crear uno.'}</AppText> : null}
    <View>{state.foods?.map(food => <Pressable key={food.id} accessibilityRole="button" accessibilityLabel={`Usar ${food.name}`} disabled={locked || state.listLoading || state.listError || !food.isActive || food.calories === null || food.calories <= 0} onPress={() => onChoose(food)} style={[shared.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
      <View style={shared.text}><AppText variant="headline">{food.name}</AppText><AppText muted numeric variant="caption">{`P ${mealShown(food.proteinG)} · C ${mealShown(food.carbsG)} · G ${mealShown(food.fatG)}${food.precisionLevel === 'estimated' ? ' · estimado' : ''}`}</AppText>{food.calories === null || food.calories <= 0 ? <AppText muted variant="caption">Completá calorías para poder agregarlo.</AppText> : null}</View>
      <AppText muted numeric variant="footnote" style={{ maxWidth: '38%', textAlign: 'right' }}>{mealShown(food.servingQuantity, 3)} {food.servingUnit} · {mealShown(food.calories)} kcal</AppText><AppIcon name="chevronRight" color={colors.textMuted} size={17} />
    </Pressable>)}</View>
    <View style={shared.footer}><NutritionGlassButton icon="plus" label="Nuevo alimento" wide onPress={locked ? undefined : () => controller.begin()} /></View>
  </MealSheet>;
}
