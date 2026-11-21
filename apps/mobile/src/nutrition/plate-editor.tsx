import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { AppIcon, AppText, Button, GlassSurface, LinkRow, LoadingState, brandTokens, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { haptics, triggerHaptic } from '@/platform/haptics';
import type { PersonalFood } from '@/api/nutrition-food';
import type { PlateController, PlateState } from './plate-controller';
import { itemEstimate, plateable, plateEstimate, PLATE_MAX, parsePlateQuantity, plateStep, type PlateItem } from './plate-model';
import { MealSearch, MealSheet, mealShown as shown, mealSheetStyles as shared } from './meal-sheet';
import { MealNutrients } from './quick-editor';
import { MealProjection } from './meal-projection';
import { MealTiming } from './meal-timing';
import { MealDateControl } from './meal-date-control';
import { SaveButton } from './save-button';
import { searchable } from './quick-model';

const count = (n: number) => `${n} ${n === 1 ? 'alimento' : 'alimentos'}`;

/** One of the person's foods in the picker: «+» puts a portion in the plate; once there, it shows how much and adds another. */
function FoodPickRow({ food, item, locked, onAdd }: { food: PersonalFood; item: PlateItem | undefined; locked: boolean; onAdd: (food: PersonalFood) => void }) {
  const { colors } = useOwnlevelTheme();
  const usable = plateable(food), inPlate = !!item;
  return <View style={[shared.row, styles.pickRow, { borderColor: colors.border }]} testID={`plate-food-${food.id}`}>
    <View style={shared.text}>
      <AppText variant="body">{food.name}</AppText>
      <AppText muted numeric variant="footnote">{usable ? `${shown(food.servingQuantity, 3)} ${food.servingUnit} · ${shown(food.calories)} kcal` : 'Sin calorías cargadas'}</AppText>
    </View>
    {inPlate ? <AppText numeric variant="subheadline" style={{ color: colors.primary }}>{`${item.quantity} ${food.servingUnit}`}</AppText> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={inPlate ? `Sumar otra porción de ${food.name}` : `Agregar ${food.name} al plato`} accessibilityState={{ disabled: locked || !usable }}
      disabled={locked || !usable} onPress={() => onAdd(food)} style={styles.touch} testID={`plate-add-${food.id}`}>
      <View style={[styles.disc, inPlate ? { backgroundColor: colors.primary } : { borderWidth: 1.5, borderColor: colors.border }, !usable && styles.faded]}>
        <AppIcon name={inPlate ? 'checkmark' : 'plus'} size={17} color={inPlate ? colors.onPrimary : colors.primary} />
      </View>
    </Pressable>
  </View>;
}

/** The plate under construction, floating over the foods: how many and how much; a tap opens it to review and register. */
function PlateBar({ state, onOpen }: { state: PlateState; onOpen: () => void }) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion();
  const draft = state.draft!, estimate = plateEstimate(draft);
  return <Animated.View entering={reduced ? FadeIn.duration(200) : SlideInDown.springify().damping(20)} exiting={reduced ? FadeOut.duration(200) : SlideOutDown.duration(200)} style={styles.barWrap}>
    <GlassSurface style={styles.bar} interactive>
      <Pressable accessibilityRole="button" accessibilityLabel={`Ver el plato: ${count(draft.items.length)}${estimate?.calories != null ? `, ${shown(estimate.calories)} kcal` : ''}`} onPress={onOpen} style={styles.barPress} testID="plate-bar">
        <View style={shared.text}>
          <AppText variant="headline">Plato</AppText>
          <AppText muted numeric variant="footnote">{count(draft.items.length)}</AppText>
        </View>
        <AppText numeric variant="headline">{estimate?.calories != null ? `${shown(estimate.calories)} kcal` : '—'}</AppText>
        <AppIcon name="chevronRight" size={17} color={colors.textMuted} />
      </Pressable>
    </GlassSurface>
  </Animated.View>;
}

/** A food in the plate: its quantity with − / + (grams by 10, units by one), what it adds, and a way out. */
function PlateItemRow({ item, kcal, error, locked, controller }: { item: PlateItem; kcal: number | null | undefined; error?: string; locked: boolean; controller: PlateController }) {
  const { colors } = useOwnlevelTheme();
  const quantity = parsePlateQuantity(item.quantity), step = plateStep(item.food.servingUnit), food = item.food;
  return <Animated.View layout={LinearTransition.duration(200)} entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={[styles.item, { borderColor: colors.border }]} testID={`plate-item-${food.id}`}>
    <View style={styles.itemHead}>
      <View style={shared.text}><AppText variant="body">{food.name}</AppText><AppText muted numeric variant="footnote">{`${shown(kcal)} kcal`}</AppText></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Sacar ${food.name} del plato`} disabled={locked} onPress={() => { haptics.selection(); controller.remove(food.id); }} style={styles.touch}>
        <AppIcon name="close" size={17} color={colors.textMuted} />
      </Pressable>
    </View>
    <View style={[styles.stepper, { backgroundColor: colors.surface }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Restar ${food.name}`} disabled={locked || !(quantity > step)} onPress={() => { triggerHaptic('stepperChange'); controller.step(food.id, -1); }} style={styles.touch}>
        <AppIcon name="minus" size={17} color={locked || !(quantity > step) ? colors.border : colors.text} />
      </Pressable>
      <View style={styles.amount}>
        <TextInput accessibilityLabel={`Cantidad de ${food.name}`} editable={!locked} keyboardType="decimal-pad" selectTextOnFocus value={item.quantity}
          onChangeText={value => controller.change(food.id, value)} style={[styles.quantity, { color: colors.text }]} testID={`plate-quantity-${food.id}`} />
        <AppText muted variant="caption">{food.servingUnit}</AppText>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Sumar ${food.name}`} disabled={locked} onPress={() => { triggerHaptic('stepperChange'); controller.step(food.id, 1); }} style={styles.touch}>
        <AppIcon name="plus" size={17} color={locked ? colors.border : colors.text} />
      </Pressable>
    </View>
    {error ? <AppText accessibilityRole="alert" variant="footnote">{error}</AppText> : null}
  </Animated.View>;
}

/**
 * «Plato»: a meal built from the person's own foods by quantity (a merienda of bread, cream cheese and coffee), registered as
 * ONE meal with its total. The foods come first (search, «+»); the plate floats at the bottom until it is opened to review
 * the quantities, the name, the moment and «Guardar en mis comidas». Closing keeps the plate for next time.
 */
export function PlateEditor({ controller, state, externalLocked = false }: { controller: PlateController; state: PlateState; externalLocked?: boolean }) {
  const { colors } = useOwnlevelTheme();
  const draft = state.draft;
  const locked = externalLocked || !!state.intent || state.phase !== 'idle';
  const running = state.phase === 'pending' || state.phase === 'loading';
  const saving = state.phase === 'pending' || (state.phase === 'confirmed' && !state.message);
  const review = state.view === 'review' && !!draft?.items.length;
  const estimate = draft ? plateEstimate(draft) : null;
  // The total is confirmed by the server a moment after each change; stale work is cancelled in the controller.
  useEffect(() => {
    if (!state.open || !review || locked || state.preview || state.previewLoading || state.message) return;
    const timer = setTimeout(() => void controller.requestPreview(), 300);
    return () => clearTimeout(timer);
  }, [controller, review, locked, state.open, state.preview, state.previewLoading, state.message, draft]);
  const query = searchable(state.search.trim());
  const foods = useMemo(() => (state.foods ?? []).filter(food => !query || searchable(food.name).includes(query)), [state.foods, query]);
  const inPlate = useMemo(() => new Map((draft?.items ?? []).map(item => [item.food.id, item])), [draft]);
  if (!state.open || !state.date || !draft) return null;
  const add = (food: PersonalFood) => {
    if (draft.items.length >= PLATE_MAX && !inPlate.has(food.id)) { Alert.alert('Plato completo', `Un plato admite hasta ${PLATE_MAX} alimentos.`); return; }
    haptics.selection(); controller.add(food);
  };
  const empty = () => Alert.alert('¿Vaciar el plato?', 'Se sacan todos los alimentos. No se registró nada.', [
    { text: 'Cancelar', style: 'cancel' }, { text: 'Vaciar', style: 'destructive', onPress: () => controller.clear() }]);

  const status = <>
    {state.message ? <AppText accessibilityRole="alert" selectable>{state.message}</AppText> : null}
    {state.phase === 'idle' && review && !state.preview && !state.previewLoading && state.message ? <Button label="Calcular el total de nuevo" onPress={() => void controller.requestPreview()} variant="quiet" /> : null}
    {['uncertain', 'confirmed', 'blocked'].includes(state.phase) && !saving ? <Button label={state.intent?.receipt ? 'Actualizar el día' : 'Comprobar el plato enviado'} onPress={() => void controller.recover()} /> : null}
  </>;

  const picker = <View style={styles.fill}>
    <FlatList data={foods} keyExtractor={food => food.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" testID="plate-picker"
      initialNumToRender={20} windowSize={9}
      contentContainerStyle={[styles.list, draft.items.length ? styles.listUnderBar : null]}
      ListHeaderComponent={<View style={styles.pickHeader}>
        <MealSearch label="Buscar en tus alimentos" value={state.search} onChange={value => controller.query(value)} />
        {status}
        {state.foodsLoading && !state.foods ? <LoadingState label="Cargando tus alimentos" /> : null}
        {state.foodsError ? <View style={styles.inline}><AppText accessibilityRole="alert" style={styles.fill}>{state.foods ? 'No pudimos actualizar tus alimentos. Mostramos los últimos.' : 'No pudimos cargar tus alimentos.'}</AppText>
          <Button label="Reintentar" variant="quiet" onPress={() => void controller.loadFoods()} /></View> : null}
      </View>}
      ListEmptyComponent={state.foods ? <AppText muted style={styles.emptyText}>{query ? 'No encontramos alimentos con esa búsqueda.' : 'Todavía no tenés alimentos. Crealos en Alimentos por cantidad.'}</AppText> : null}
      renderItem={({ item: food }) => <FoodPickRow food={food} item={inPlate.get(food.id)} locked={locked} onAdd={add} />} />
    {draft.items.length && !review ? <PlateBar state={state} onOpen={() => { haptics.selection(); controller.showReview(); }} /> : null}
  </View>;

  const confirmed = state.preview?.snapshot;
  const kcalOf = (id: string, item: PlateItem) => state.preview?.items.find(row => row.id === id)?.calories ?? itemEstimate(item)?.calories;
  return <MealSheet list={picker} listHidden={review} title={draft.title.trim() && review ? draft.title.trim() : 'Plato'}
    subtitle={review ? count(draft.items.length) : draft.items.length ? undefined : 'Elegí tus alimentos'}
    onClose={review && !state.intent ? () => controller.showPicker() : () => controller.close()} onDismiss={() => controller.close()} back={review && !state.intent}
    dismissable={!running} running={running} testID="plate-editor"
    right={<MealDateControl date={state.date} disabled={locked} onChange={date => controller.changeDate(date)} />}>
    {review ? <>
      <TextInput accessibilityLabel="Nombre del plato" placeholder="Plato" placeholderTextColor={colors.textMuted} editable={!locked} value={draft.title} maxLength={140}
        onChangeText={value => controller.rename(value)} style={[shared.input, { backgroundColor: colors.surfaceRaised, color: colors.text }]} testID="plate-title" />
      {state.errors.title ? <AppText accessibilityRole="alert" variant="footnote">{state.errors.title}</AppText> : null}
      {/* The same block stays put: the instant estimate first, then the server's confirmed total. */}
      {confirmed ? <View style={styles.totals} testID="plate-total"><MealNutrients value={confirmed} /><MealProjection date={state.date} nutrients={confirmed} /></View>
        : estimate ? <View style={styles.totals} testID="plate-estimate"><MealNutrients value={estimate} pending /><MealProjection date={state.date} nutrients={estimate} pending /></View>
        : state.previewLoading ? <ActivityIndicator color={colors.textMuted} /> : null}
      <View>
        {draft.items.map(item => <PlateItemRow key={item.food.id} item={item} kcal={kcalOf(item.food.id, item)} error={state.errors[item.food.id]} locked={locked} controller={controller} />)}
        <LinkRow label="Agregar otro alimento" onPress={() => controller.showPicker()} disabled={locked || draft.items.length >= PLATE_MAX} testID="plate-add-more" />
      </View>
      <View style={shared.row}>
        <View style={shared.text}><AppText>Guardar en mis comidas</AppText><AppText muted variant="caption">Queda en Rápido para repetirlo con un toque</AppText></View>
        <Switch accessibilityLabel="Guardar en mis comidas" disabled={locked} value={draft.saveToLibrary} onValueChange={value => controller.saveToLibrary(value)} trackColor={{ true: colors.primary, false: colors.border }} testID="plate-save-library" />
      </View>
      <MealTiming date={state.date} value={draft} disabled={locked} onChange={(label, time, declared) => controller.timing(label, time, declared)} />
      {status}
      <View style={shared.footer}>
        <SaveButton state={saving ? 'saving' : 'idle'} disabled={locked || !state.preview || state.previewLoading} testID="plate-register"
          label={`Registrar plato${confirmed ? ` · ${shown(confirmed.calories)} kcal` : estimate?.calories != null ? ` · ${shown(estimate.calories)} kcal` : ''}`} onPress={() => void controller.save()} />
        {!state.intent ? <Button label="Vaciar plato" variant="quiet" disabled={locked} onPress={empty} /> : null}
      </View>
    </> : null}
  </MealSheet>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { paddingHorizontal: brandTokens.layout.screenPadding, paddingBottom: 24 },
  listUnderBar: { paddingBottom: 112 },
  pickHeader: { gap: 12, paddingBottom: 4 },
  pickRow: { borderBottomWidth: StyleSheet.hairlineWidth },
  emptyText: { paddingVertical: 12 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  touch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  disc: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  faded: { opacity: 0.35 },
  barWrap: { position: 'absolute', left: brandTokens.layout.screenPadding, right: brandTokens.layout.screenPadding, bottom: 24 },
  bar: { borderRadius: brandTokens.radius.tabBar, overflow: 'hidden' },
  barPress: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 18 },
  totals: { gap: 20 },
  item: { gap: 8, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: brandTokens.radius.button, paddingVertical: 2, alignSelf: 'stretch' },
  amount: { alignItems: 'center', flexShrink: 1 },
  quantity: { ...brandTokens.typeScale.headline, textAlign: 'center', minWidth: 60, maxWidth: 180, padding: 0, fontVariant: ['tabular-nums'] },
});
