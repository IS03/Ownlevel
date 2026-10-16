import type { DayContextAction } from './day-details';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import type { MobileNutritionDayResponse, NutritionDayMetric } from '@/api/nutrition-day';
import type { NutritionDayMeal } from '../../../../src/lib/mobile-api/nutrition-day-contract';
import { AppIcon, AppText, brandTokens, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { TrainingContextMenu } from '@/training/routine-context-menu';
import type { TrainingMenuAction } from '@/training/routine-context-menu.types';
import { MealDetailSheet, mealEditable, mealTitle } from './meal-detail-sheet';
import { amount, number } from './day-format';
import { NutritionDaySummary } from './day-summary';
import { NutritionGlassButton, NutritionSectionHeading } from './day-controls';
import { NutritionDayPanel, NutritionDayDetailSheet } from './day-panel';

export { metricValue } from './day-details';
const mealLabels = { breakfast: 'Desayuno', lunch: 'Almuerzo', snack: 'Merienda', dinner: 'Cena', extra: 'Extra' };
const time = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Cordoba', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** E5: grouped by moment in the server's order; without any moment the list stays flat (no invented "Otras" heading). */
export function mealGroups(meals: NutritionDayMeal[]) {
  if (!meals.some(meal => meal.mealLabel)) return [{ key: 'all', label: null as string | null, meals }];
  const order = [...Object.keys(mealLabels), 'none'] as const;
  return order.map(key => ({ key, label: key === 'none' ? 'Sin momento' : mealLabels[key as keyof typeof mealLabels],
    meals: meals.filter(meal => (meal.mealLabel ?? 'none') === key) })).filter(group => group.meals.length > 0);
}
export type MealActions = { edit?: (meal: NutritionDayMeal) => void; repeat?: (meal: NutritionDayMeal) => void;
  save?: (meal: NutritionDayMeal) => void; remove?: (meal: NutritionDayMeal) => void };
/** What a meal allows: edit/delete only for manual meals (server rule); repeat/save for any real meal; nothing for legacy summaries. */
export function mealMenu(meal: NutritionDayMeal, actions: MealActions) {
  const editable = mealEditable(meal), real = meal.entryKind === 'meal';
  return { edit: editable ? actions.edit : undefined, repeat: real ? actions.repeat : undefined, save: real ? actions.save : undefined, remove: editable ? actions.remove : undefined };
}
/** Visible only while swiping, so rows stay transparent over the E5 glow at rest. */
function DeleteAction({ onPress, translation }: { onPress: () => void; translation: SharedValue<number> }) {
  const { colors } = useOwnlevelTheme();
  // It slides in beside the row (never under its transparent content).
  const shown = useAnimatedStyle(() => ({ opacity: translation.value < -1 ? 1 : 0, transform: [{ translateX: Math.max(0, 104 + translation.value) }] }));
  return <Animated.View style={shown}><Pressable accessibilityLabel="Eliminar comida" accessibilityRole="button" onPress={onPress} style={[styles.swipeAction, { backgroundColor: colors.danger }]}>
    <AppIcon color={colors.onPrimary} name="trash" size={20} /><AppText style={{ color: colors.onPrimary }} variant="footnote">Eliminar</AppText>
  </Pressable></Animated.View>;
}
/** A just-added meal blinks once (about a second) and settles back; the tint reaches past the text, never cutting it. */
function RowFlash({ active }: { active: boolean }) {
  const { colors } = useOwnlevelTheme();
  const opacity = useSharedValue(0);
  const { fast, base } = brandTokens.motion.duration;
  useEffect(() => {
    if (active) opacity.set(withSequence(withTiming(1, { duration: fast }), withDelay(700, withTiming(0, { duration: base }))));
  }, [active, base, fast, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View pointerEvents="none" style={[styles.flash, { backgroundColor: colors.brandSubtle }, style]} />;
}
/**
 * Flat row (E5). Tap opens the detail (D1/D2); long-press shows the native menu and swipe left deletes (D4).
 * The full description lives in the detail.
 */
function MealRow({ meal, divider, highlighted, actions, onOpen }: { meal: NutritionDayMeal; divider: boolean; highlighted?: boolean; actions: MealActions; onOpen: (meal: NutritionDayMeal) => void }) {
  const { colors } = useOwnlevelTheme(), reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const menu = mealMenu(meal, actions);
  const meta = `${meal.timeKnown ? time.format(new Date(meal.consumedAt)) : 'Hora sin dato'} · P ${amount(meal.proteinG, 'g')} · C ${amount(meal.carbsG, 'g')} · G ${amount(meal.fatG, 'g')}${meal.precision === 'estimated' ? ' · estimado' : ''}`;
  // The swipe hands its own methods to the action, so no ref is read while rendering.
  const confirmDelete = (swipe?: SwipeableMethods) => { if (reduceMotion) swipe?.reset(); else swipe?.close(); Alert.alert('¿Eliminar esta comida?', 'Deja de contar en el día y desaparece de la lista.', [
    { text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => menu.remove?.(meal) }]); };
  const menuActions: TrainingMenuAction[] = [
    ...(menu.edit ? [{ label: 'Editar', symbol: 'pencil' as const, onPress: () => menu.edit!(meal) }] : []),
    ...(menu.repeat ? [{ label: 'Repetir', symbol: 'arrow.2.squarepath' as const, onPress: () => menu.repeat!(meal) }] : []),
    ...(menu.save ? [{ label: 'Guardar como comida', symbol: 'bookmark' as const, onPress: () => menu.save!(meal) }] : []),
    ...(menu.remove ? [{ label: 'Eliminar', symbol: 'trash' as const, onPress: () => confirmDelete(), separated: true, destructive: true }] : []),
  ];
  const row = <Pressable accessibilityRole="button" accessibilityLabel={`${mealTitle(meal)}, ${amount(meal.calories, 'kcal')}. ${meta}`} accessibilityHint="Abre el detalle. Mantené apretado para ver acciones."
    accessibilityActions={menuActions.map(action => ({ name: action.label, label: action.label }))}
    onAccessibilityAction={event => menuActions.find(action => action.label === event.nativeEvent.actionName)?.onPress()}
    onPress={() => onOpen(meal)} style={({ pressed }) => [styles.meal, { width: width > 0 ? width : undefined }, pressed && { opacity: 0.6 }]}>
    <RowFlash active={!!highlighted} />
    {divider ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
    <View style={styles.mealText}>
      <AppText numberOfLines={2} variant="headline">{mealTitle(meal)}</AppText>
      <AppText muted numeric numberOfLines={1} variant="caption">{meta}</AppText>
    </View>
    <AppText numeric variant="subheadline">{amount(meal.calories, 'kcal')}</AppText>
    <AppIcon name="chevronRight" color={colors.textMuted} size={15} />
  </Pressable>;
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={styles.bleed} testID={`nutrition-meal-${meal.id}`}>
    <Swipeable enabled={!!menu.remove} friction={1} overshootRight={false} renderRightActions={(_progress, translation, methods) => <DeleteAction translation={translation} onPress={() => confirmDelete(methods)} />}>
      {menuActions.length ? <TrainingContextMenu width={width} disabled={false} name={mealTitle(meal)} onOpen={() => onOpen(meal)} actions={menuActions}>{row}</TrainingContextMenu> : row}
    </Swipeable>
  </View>;
}

export function NutritionDayContent({ data, onAdd, addChoices, addControl, highlightedMeal, mealActions = {}, onActivity, onContext, onMetric }: {
  data: MobileNutritionDayResponse; onAdd?: () => void; addChoices?: ReactNode; addControl?: ReactNode; highlightedMeal?: string; mealActions?: MealActions;
  onMetric?: (data: MobileNutritionDayResponse, metric: NutritionDayMetric) => void;
  onActivity?: (data: MobileNutritionDayResponse) => void; onContext?: DayContextAction;
}) {
  const [detail, setDetail] = useState(false);
  const [openMeal, setOpenMeal] = useState<string | null>(null);
  const nutrition = data.nutrition.status === 'ok' ? data.nutrition.data : null;
  const recorded = nutrition?.dayState === 'recorded' ? nutrition : null;
  return <>
    <NutritionDaySummary data={data} />
    {addControl ?? <NutritionGlassButton icon="plus" label="Agregar comida" wide onPress={onAdd} />}
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
        {group.meals.map((meal, index) => <MealRow key={meal.id} meal={meal} divider={index > 0} highlighted={meal.id === highlightedMeal} actions={mealActions} onOpen={m => setOpenMeal(m.id)} />)}
      </View>)}
    </View> : null}
    {(meal => meal && recorded ? <MealDetailSheet meal={meal} calories={recorded.summary.calories} protein={recorded.summary.proteinG} entries={recorded.summary.entryCount}
      onClose={() => setOpenMeal(null)} actions={(menu => ({ onEdit: menu.edit && (() => menu.edit!(meal)), onRepeat: menu.repeat && (() => menu.repeat!(meal)),
        onSave: menu.save && (() => menu.save!(meal)), onDelete: menu.remove && (() => { setOpenMeal(null); menu.remove!(meal); }) }))(mealMenu(meal, mealActions))} /> : null)(recorded?.meals.find(m => m.id === openMeal))}
    {detail ? <NutritionDayDetailSheet data={data} onClose={() => setDetail(false)} onActivity={onActivity} onContext={onContext} /> : null}
  </>;
}
const styles = StyleSheet.create({
  section: { gap: 12 }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  group: { gap: 0 }, groupLabel: { fontWeight: '600', paddingTop: 4 },
  // The row bleeds 12 pt past the gutter so its flash has room; the content keeps the gutter's alignment.
  bleed: { marginHorizontal: -12 },
  meal: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12 }, mealText: { flex: 1, gap: 2 },
  swipeAction: { width: 96, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 14, marginLeft: 8 },
  divider: { position: 'absolute', top: 0, left: 12, right: 12, height: StyleSheet.hairlineWidth },
  flash: { position: 'absolute', top: 2, bottom: 2, left: 0, right: 0, borderRadius: 12 },
});
