import type { DayContextAction } from './day-details';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeOut, Keyframe, LinearTransition, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
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
/** List precision: whole grams, one decimal under 10 g (0,3 g never reads as 0); a missing macro is "—", never 0. */
export function rowGrams(value: number | null) {
  return value === null ? '—' : `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} g`;
}

/** Group by the effective moment; provenance stays on the original DTO. */
/** When a meal is shown at a time: a known time, or the registration instant (approximate). Otherwise null. */
const shownInstant = (meal: NutritionDayMeal) => meal.timeKnown || (meal.timeSource === 'registration') ? Date.parse(meal.consumedAt) : NaN;
/** By time, earliest first; meals without a time keep their order after the timed ones. */
export function byTime(meals: NutritionDayMeal[]) {
  return meals.map((meal, index) => ({ meal, index, at: shownInstant(meal) }))
    .sort((a, b) => (Number.isFinite(a.at) ? Number.isFinite(b.at) ? a.at - b.at : -1 : Number.isFinite(b.at) ? 1 : 0) || a.index - b.index)
    .map(entry => entry.meal);
}
export function mealGroups(unsorted: NutritionDayMeal[]) {
  const meals = byTime(unsorted);
  if (!meals.some(meal => meal.mealLabel || meal.automaticMealLabel)) return [{ key: 'all', label: null as string | null, meals }];
  const groups = Object.entries(mealLabels).map(([key, label]) => (
    { key, label, meals: meals.filter(meal => (meal.mealLabel ?? meal.automaticMealLabel) === key) }
  ));
  return [...groups, { key: 'none', label: 'Sin momento', meals: meals.filter(meal => !meal.mealLabel && !meal.automaticMealLabel) }]
    .filter(group => group.meals.length > 0);
}
/** The meal being deleted and the last one confirmed gone (see useMealNotice). */
export type MealRemoval = { removing: string | null; removed: string | null };
/** A deleted meal breaks away: a quick crack (shrink and tilt) while it fades. Reduce Motion only fades. */
const breakAway = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }, { rotate: '0deg' }] },
  40: { opacity: 0.6, transform: [{ scale: 0.97 }, { rotate: '-1.5deg' }] },
  100: { opacity: 0, transform: [{ scale: 0.86 }, { rotate: '2deg' }] },
}).duration(brandTokens.motion.duration.base);
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
function MealRow({ meal, target, divider, highlighted, removing, removed, actions, onOpen, onShaken }: {
  /** The day's calorie target: the thin line under the row is this meal's share of it. Null: no line. */
  meal: NutritionDayMeal; target: number | null; divider: boolean; highlighted?: boolean; removing?: boolean; removed?: boolean; actions: MealActions; onOpen: (meal: NutritionDayMeal) => void;
  /** The shake is over: the list hides the row now (trust), while the delete finishes in the background. */
  onShaken: (id: string) => void;
}) {
  const { colors } = useOwnlevelTheme(), reduceMotion = useReduceMotion(), { fontScale } = useWindowDimensions();
  // Large text: no time column (it would squeeze the name); the time goes back into the detail line.
  const column = fontScale <= 1.3;
  // Deleting: a short shake and the row breaks away at once; the server finishes in the background (the notice shows
  // it running) and a failed delete brings the row back.
  const shake = useSharedValue(0);
  useEffect(() => {
    if (!removing) return;
    if (reduceMotion) { onShaken(meal.id); return; }
    const step = (to: number) => withTiming(to, { duration: 45 });
    shake.set(withSequence(step(-6), step(6), step(-4), step(4), step(-2), step(0)));
    const timer = setTimeout(() => onShaken(meal.id), 280);
    return () => clearTimeout(timer);
  }, [meal.id, onShaken, reduceMotion, removing, shake]);
  const trembling = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const [width, setWidth] = useState(0);
  const menu = mealMenu(meal, actions);
  // Display the effective clock without changing its stored provenance (#308).
  const approximate = !meal.timeKnown && meal.timeSource === 'registration';
  const timed = meal.timeKnown || approximate;
  const clock = timed ? time.format(new Date(meal.consumedAt)) : 'Sin hora';
  const estimated = meal.precision === 'estimated' ? ' · estimado' : '';
  // The row stays light (one-line title, rounded macros); the detail keeps every exact value.
  const meta = `${column ? '' : `${clock} · `}P ${rowGrams(meal.proteinG)} · C ${rowGrams(meal.carbsG)} · G ${rowGrams(meal.fatG)}${estimated}`;
  // Share of the day's target: shown only with a known target and known calories, capped at the full width.
  const share = target && target > 0 && meal.calories !== null ? Math.min(1, Math.max(0, meal.calories / target)) : null;
  const spoken = `${timed ? clock : 'Hora sin dato'} · Proteína ${amount(meal.proteinG, 'g')} · Carbohidratos ${amount(meal.carbsG, 'g')} · Grasas ${amount(meal.fatG, 'g')}${estimated}`;
  // The swipe hands its own methods to the action, so no ref is read while rendering.
  const confirmDelete = (swipe?: SwipeableMethods) => { if (reduceMotion) swipe?.reset(); else swipe?.close(); Alert.alert('¿Eliminar esta comida?', 'Deja de contar en el día y desaparece de la lista.', [
    { text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => menu.remove?.(meal) }]); };
  const menuActions: TrainingMenuAction[] = [
    ...(menu.edit ? [{ label: 'Editar', symbol: 'pencil' as const, onPress: () => menu.edit!(meal) }] : []),
    ...(menu.repeat ? [{ label: 'Repetir', symbol: 'arrow.2.squarepath' as const, onPress: () => menu.repeat!(meal) }] : []),
    ...(menu.save ? [{ label: 'Guardar como comida', symbol: 'bookmark' as const, onPress: () => menu.save!(meal) }] : []),
    ...(menu.remove ? [{ label: 'Eliminar', symbol: 'trash' as const, onPress: () => confirmDelete(), separated: true, destructive: true }] : []),
  ];
  const row = <Pressable accessibilityRole="button" accessibilityLabel={`${mealTitle(meal)}, ${amount(meal.calories, 'kcal')}. ${spoken}`} accessibilityHint="Abre el detalle. Mantené apretado para ver acciones."
    accessibilityActions={menuActions.map(action => ({ name: action.label, label: action.label }))}
    onAccessibilityAction={event => menuActions.find(action => action.label === event.nativeEvent.actionName)?.onPress()}
    onPress={() => onOpen(meal)} style={({ pressed }) => [styles.meal, { width: width > 0 ? width : undefined }, pressed && { opacity: 0.6 }]}>
    <RowFlash active={!!highlighted} />
    {divider ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
    {column ? <AppText muted numeric variant="footnote" style={styles.clock} testID="nutrition-meal-time">{timed ? clock : '—'}</AppText> : null}
    <View style={styles.mealText}>
      {/* A long name wraps to a second line instead of being cut; the detail keeps the whole description. */}
      <AppText numberOfLines={2} variant="headline">{mealTitle(meal)}</AppText>
      <AppText muted numeric numberOfLines={1} variant="caption">{meta}</AppText>
      {share !== null ? <View style={styles.share} testID="nutrition-meal-share"><View style={[styles.shareFill, { width: `${share * 100}%`, backgroundColor: colors.primary }]} /></View> : null}
    </View>
    {/* The unit is in the section total; the spoken label keeps it. */}
    <AppText numeric variant="subheadline" style={styles.kcal}>{meal.calories === null ? '—' : number(meal.calories)}</AppText>
  </Pressable>;
  return <Animated.View onLayout={event => setWidth(event.nativeEvent.layout.width)} pointerEvents={removing ? 'none' : 'auto'}
    layout={reduceMotion ? undefined : LinearTransition.duration(brandTokens.motion.duration.base)}
    exiting={removing || removed ? reduceMotion ? FadeOut.duration(brandTokens.motion.duration.fast) : breakAway : undefined}
    style={[styles.bleed, trembling]} testID={`nutrition-meal-${meal.id}`}>
    <Swipeable enabled={!!menu.remove} friction={1} overshootRight={false} renderRightActions={(_progress, translation, methods) => <DeleteAction translation={translation} onPress={() => confirmDelete(methods)} />}>
      {menuActions.length ? <TrainingContextMenu width={width} disabled={false} name={mealTitle(meal)} onOpen={() => onOpen(meal)} actions={menuActions}>{row}</TrainingContextMenu> : row}
    </Swipeable>
  </Animated.View>;
}

export function NutritionDayContent({ data, onAdd, addChoices, addControl, highlightedMeal, removal, mealActions = {}, onActivity, onContext, onMetric }: {
  data: MobileNutritionDayResponse; onAdd?: () => void; addChoices?: ReactNode; addControl?: ReactNode; highlightedMeal?: string; removal?: MealRemoval; mealActions?: MealActions;
  onMetric?: (data: MobileNutritionDayResponse, metric: NutritionDayMetric) => void;
  onActivity?: (data: MobileNutritionDayResponse) => void; onContext?: DayContextAction;
}) {
  const [detail, setDetail] = useState(false);
  // A row hidden on trust while its delete runs; it comes back only if that delete does not go through.
  const [gone, setGone] = useState<string | null>(null);
  const hide = useCallback((id: string) => setGone(id), []);
  const [openMeal, setOpenMeal] = useState<string | null>(null);
  const nutrition = data.nutrition.status === 'ok' ? data.nutrition.data : null;
  const recorded = nutrition?.dayState === 'recorded' ? nutrition : null;
  return <>
    <NutritionDaySummary data={data} />
    {addControl ?? <NutritionGlassButton icon="plus" label="Agregar comida" wide onPress={onAdd} />}
    {addChoices}
    {!nutrition ? <AppText accessibilityRole="alert">Nutrición no disponible. No pudimos consultar el resumen ni las comidas de esta fecha. Deslizá para reintentar.</AppText>
      : !recorded ? <View style={styles.section}><AppText variant="headline">Sin día registrado</AppText><AppText muted>Esta fecha todavía no tiene un registro nutricional. No hay resumen ni objetivos guardados.</AppText></View> : null}
    <NutritionDayPanel data={data} onDetail={() => setDetail(true)} onMetric={onMetric} />
    {recorded ? <View style={styles.section}>
      <View style={styles.heading}><NutritionSectionHeading>Comidas</NutritionSectionHeading>
        <AppText muted numeric variant="caption">{recorded.summary.entryCount} · {recorded.summary.entryCount > 0 && recorded.summary.calories.missingCount === recorded.summary.entryCount ? 'Sin dato' : `${number(recorded.summary.calories.knownTotal)} kcal${recorded.summary.calories.missingCount > 0 ? ' · parcial' : ''}`}</AppText>
      </View>
      {recorded.meals.length === 0 ? <AppText muted>Sin comidas registradas</AppText> : mealGroups(recorded.meals.filter(m => !(m.id === gone && (m.id === removal?.removing || m.id === removal?.removed)))).map(group => <View key={group.key} style={styles.group}>
        {group.label ? <AppText muted variant="footnote" style={styles.groupLabel}>{group.label}</AppText> : null}
        {group.meals.map((meal, index) => <MealRow key={meal.id} meal={meal} target={recorded.context.calorieTarget} divider={index > 0} highlighted={meal.id === highlightedMeal} removing={meal.id === removal?.removing} removed={meal.id === removal?.removed} actions={mealActions} onOpen={m => setOpenMeal(m.id)} onShaken={hide} />)}
      </View>)}
    </View> : null}
    {(meal => meal && recorded ? <MealDetailSheet meal={meal} calories={recorded.summary.calories} protein={recorded.summary.proteinG} entries={recorded.summary.entryCount}
      onClose={() => setOpenMeal(null)} actions={(menu => ({ onEdit: menu.edit && (() => menu.edit!(meal)), onRepeat: menu.repeat && (() => menu.repeat!(meal)),
        onSave: menu.save && (() => menu.save!(meal)), onDelete: menu.remove && (() => { setOpenMeal(null); menu.remove!(meal); }) }))(mealMenu(meal, mealActions))} /> : null)(recorded?.meals.find(m => m.id === openMeal))}
    {detail ? <NutritionDayDetailSheet data={data} onClose={() => setDetail(false)} onActivity={onActivity} onContext={onContext} /> : null}
  </>;
}
const styles = StyleSheet.create({
  clock: { width: 44, paddingTop: 2 }, kcal: { alignSelf: 'flex-start', paddingTop: 1 },
  // Quiet on purpose: a thin line, no track, half-strength accent. Read at a glance, never the main thing on the row.
  share: { height: 2, marginTop: 4, borderRadius: 1, overflow: 'hidden' }, shareFill: { height: 2, borderRadius: 1, opacity: 0.5 },
  section: { gap: 12 }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  group: { gap: 0 }, groupLabel: { fontWeight: '600', paddingTop: 4 },
  // The row bleeds 12 pt past the gutter so its flash has room; the content keeps the gutter's alignment.
  bleed: { marginHorizontal: -12 },
  meal: { minHeight: 64, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 12 }, mealText: { flex: 1, gap: 4 },
  swipeAction: { width: 96, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 14, marginLeft: 8 },
  divider: { position: 'absolute', top: 0, left: 12, right: 12, height: StyleSheet.hairlineWidth },
  flash: { position: 'absolute', top: 2, bottom: 2, left: 0, right: 0, borderRadius: 12 },
});
