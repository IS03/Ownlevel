import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Switch, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, LinearTransition } from 'react-native-reanimated';
import { AppIcon, AppText, Button, GlassSurface, LinkRow, LoadingState, SegmentedControl, brandTokens, pressedStyle, useOwnlevelTheme, useReduceMotion, useFieldSurface } from '@/design-system';
import { haptics, triggerHaptic } from '@/platform/haptics';
import type { PlateController, PlateState } from './plate-controller';
import { itemEstimate, parsePlateQuantity, plateable, plateEstimate, plateStep, PLATE_MAX, sourceId, sourceName, sourceUnit, unitLabel,
  type PlateItem, type PlateSource } from './plate-model';
import { MealSearch, MealSheet, mealShown as shown, mealSheetStyles as shared } from './meal-sheet';
import { MealNutrients } from './quick-editor';
import { MealProjection } from './meal-projection';
import { MealTiming } from './meal-timing';
import { MealDateControl } from './meal-date-control';
import { SaveButton } from './save-button';
import { searchable } from './quick-model';

const count = (n: number) => `${n} ${n === 1 ? 'ingrediente' : 'ingredientes'}`;
const TABS = [{ value: 'foods' as const, label: 'Alimentos' }, { value: 'saved' as const, label: 'Comidas guardadas' }];

/**
 * How much of one item is in the plate, as a soft champagne pill: − / + by its step (grams by 10, the rest by one); at the
 * first step the − becomes a bin and takes it out. In the review the amount can also be typed.
 */
function Amount({ item, locked, controller, editable = false }: { item: PlateItem; locked: boolean; controller: PlateController; editable?: boolean }) {
  const { colors } = useOwnlevelTheme();
  const id = sourceId(item.source), name = sourceName(item.source), unit = sourceUnit(item.source);
  const quantity = parsePlateQuantity(item.quantity), leaves = !(quantity > plateStep(unit));
  const step = (delta: number) => { triggerHaptic('stepperChange'); controller.step(id, delta); };
  return <View style={[styles.amount, { backgroundColor: colors.brandSubtle }]} testID={`plate-amount-${id}`}>
    <Pressable accessibilityRole="button" accessibilityLabel={leaves ? `Sacar ${name} del plato` : `Restar ${name}`} disabled={locked} onPress={() => step(-1)} style={styles.step}>
      <AppIcon name={leaves ? 'trash' : 'minus'} size={17} color={colors.primary} />
    </Pressable>
    <View style={styles.amountText}>
      {editable ? <TextInput accessibilityLabel={`Cantidad de ${name}`} editable={!locked} keyboardType="decimal-pad" selectTextOnFocus value={item.quantity}
        onChangeText={value => controller.change(id, value)} style={[styles.quantity, { color: colors.text }]} testID={`plate-quantity-${id}`} />
        : <AppText numeric variant="subheadline" style={{ fontWeight: '600' }}>{item.quantity}</AppText>}
      <AppText muted numeric variant="caption">{unitLabel(unit, quantity)}</AppText>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Sumar ${name}`} disabled={locked} onPress={() => step(1)} style={styles.step}>
      <AppIcon name="plus" size={17} color={colors.primary} />
    </Pressable>
  </View>;
}

/** One food or saved meal in the picker: «+» puts it in the plate; once there, its amount takes the place of the «+». */
function PickRow({ source, item, locked, onAdd, controller }: { source: PlateSource; item: PlateItem | undefined; locked: boolean; onAdd: (s: PlateSource) => void; controller: PlateController }) {
  const { colors } = useOwnlevelTheme();
  const usable = plateable(source), id = sourceId(source), name = sourceName(source);
  const detail = source.kind === 'food' ? `${shown(source.food.servingQuantity, 3)} ${source.food.servingUnit} · ${shown(source.food.calories)} kcal`
    : `1 porción · ${shown(source.meal.calories)} kcal${source.meal.items.length ? ` · ${source.meal.items.length} ingredientes` : ''}`;
  return <View style={[shared.row, styles.pickRow, { borderColor: colors.border }]} testID={`plate-pick-${id}`}>
    <View style={shared.text}>
      <AppText variant="body">{name}</AppText>
      <AppText muted numeric variant="footnote">{usable ? detail : 'Sin calorías cargadas'}</AppText>
    </View>
    {item ? <Animated.View entering={FadeIn.duration(200)}><Amount item={item} locked={locked} controller={controller} /></Animated.View>
      : <Pressable accessibilityRole="button" accessibilityLabel={`Agregar ${name} al plato`} accessibilityState={{ disabled: locked || !usable }}
        disabled={locked || !usable} onPress={() => onAdd(source)} style={styles.step} testID={`plate-add-${id}`}>
        <View style={[styles.disc, { borderColor: colors.border }, !usable && styles.faded]}><AppIcon name="plus" size={17} color={colors.primary} /></View>
      </Pressable>}
  </View>;
}

/** The plate under construction, floating over the lists: how many things and how much; a tap opens it to review. */
function PlateBar({ state, onOpen }: { state: PlateState; onOpen: () => void }) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion();
  const draft = state.draft!, estimate = plateEstimate(draft);
  return <Animated.View entering={reduced ? FadeIn.duration(200) : FadeInDown.duration(280)} exiting={reduced ? FadeOut.duration(200) : FadeOutDown.duration(200)} style={styles.barWrap}>
    <GlassSurface style={styles.bar} interactive>
      <Pressable accessibilityRole="button" accessibilityLabel={`Ver el plato: ${count(draft.items.length)}${estimate?.calories != null ? `, ${shown(estimate.calories)} kcal` : ''}`} onPress={onOpen} style={styles.barPress} testID="plate-bar">
        <View style={shared.text}>
          <AppText variant="headline">Ver plato</AppText>
          <AppText muted numeric variant="footnote">{count(draft.items.length)}</AppText>
        </View>
        <AppText numeric variant="headline">{estimate?.calories != null ? `${shown(estimate.calories)} kcal` : '—'}</AppText>
        <AppIcon name="chevronRight" size={17} color={colors.textMuted} />
      </Pressable>
    </GlassSurface>
  </Animated.View>;
}

function PlateReviewActions({ label, saving, locked, blocked, onRegister, onEmpty }: {
  label: string; saving: boolean; locked: boolean; blocked: boolean; onRegister: () => void; onEmpty?: () => void;
}) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.3;
  return <GlassSurface interactive style={[styles.bar, styles.reviewActions, stacked && styles.reviewActionsStacked]} testID="plate-review-actions">
    <View style={stacked ? styles.reviewMainStacked : styles.fill}>
      <SaveButton capsule numeric label={label} state={saving ? 'saving' : 'idle'} disabled={blocked} testID="plate-register" onPress={onRegister} />
    </View>
    {onEmpty ? <GlassSurface interactive style={styles.emptyCircle}>
      <Pressable accessibilityRole="button" accessibilityLabel="Vaciar plato" accessibilityState={{ disabled: locked }}
        disabled={locked} onPress={onEmpty} style={({ pressed }) => [styles.emptyButton, locked && styles.faded, pressedStyle(pressed, reduced)]}>
        <AppIcon name="trash" color={colors.textMuted} size={20} />
      </Pressable>
    </GlassSurface> : null}
  </GlassSurface>;
}

/**
 * «Plato»: a meal built from the person's own foods (by quantity) and saved meals (by portions) — a merienda of bread,
 * cream cheese and a yogurt they already saved — registered as ONE meal with its total. The lists come first (search,
 * «+», then − / + in place); the plate floats at the bottom until it is opened to review the amounts, the name, the
 * moment and «Guardar en mis comidas». Closing keeps the plate for next time.
 */
export function PlateEditor({ controller, state, externalLocked = false }: { controller: PlateController; state: PlateState; externalLocked?: boolean }) {
  const { colors } = useOwnlevelTheme();
  const fieldSurface = useFieldSurface();
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
  const sources = useMemo<PlateSource[]>(() => state.tab === 'foods'
    ? (state.foods ?? []).map(food => ({ kind: 'food' as const, food }))
    : (state.saved ?? []).map(meal => ({ kind: 'saved' as const, meal })), [state.tab, state.foods, state.saved]);
  const shownSources = useMemo(() => sources.filter(s => !query || searchable(sourceName(s)).includes(query)), [sources, query]);
  const inPlate = useMemo(() => new Map((draft?.items ?? []).map(item => [sourceId(item.source), item])), [draft]);
  if (!state.open || !state.date || !draft) return null;
  const add = (source: PlateSource) => {
    if (draft.items.length >= PLATE_MAX) { Alert.alert('Plato completo', `Un plato admite hasta ${PLATE_MAX} ingredientes.`); return; }
    haptics.selection(); controller.add(source);
  };
  const empty = () => Alert.alert('¿Vaciar el plato?', 'Se saca todo. No se registró nada.', [
    { text: 'Cancelar', style: 'cancel' }, { text: 'Vaciar', style: 'destructive', onPress: () => controller.clear() }]);
  const foodsTab = state.tab === 'foods';
  const loading = foodsTab ? state.foodsLoading && !state.foods : state.savedLoading && !state.saved;
  const failed = foodsTab ? state.foodsError : state.savedError, have = foodsTab ? state.foods : state.saved;

  const status = <>
    {state.message ? <AppText accessibilityRole="alert" selectable>{state.message}</AppText> : null}
    {state.phase === 'idle' && review && !state.preview && !state.previewLoading && state.message ? <Button label="Calcular el total de nuevo" onPress={() => void controller.requestPreview()} variant="quiet" /> : null}
    {['uncertain', 'confirmed', 'blocked'].includes(state.phase) && !saving ? <Button label={state.intent?.receipt ? 'Actualizar el día' : 'Comprobar el plato enviado'} onPress={() => void controller.recover()} /> : null}
  </>;

  const picker = <View style={styles.fill}>
    <FlatList data={shownSources} keyExtractor={s => `${s.kind}:${sourceId(s)}`} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" testID="plate-picker"
      initialNumToRender={20} windowSize={9}
      contentContainerStyle={[styles.list, draft.items.length ? styles.listUnderBar : null]}
      ListHeaderComponent={<View style={styles.pickHeader}>
        {/* Sand on sand: the native segmented control would draw its selection in white. */}
        <SegmentedControl accessibilityLabel="Qué sumar al plato" value={state.tab} options={TABS} onChange={tab => { haptics.selection(); controller.showTab(tab); }} />
        <MealSearch label={foodsTab ? 'Buscar en tus alimentos' : 'Buscar en tus comidas'} value={state.search} onChange={value => controller.query(value)} />
        {status}
        {loading ? <LoadingState label={foodsTab ? 'Cargando tus alimentos' : 'Cargando tus comidas'} /> : null}
        {failed ? <View style={styles.inline}><AppText accessibilityRole="alert" style={styles.fill}>{have ? 'No pudimos actualizar esta lista. Mostramos la última.' : 'No pudimos cargar esta lista.'}</AppText>
          <Button label="Reintentar" variant="quiet" onPress={() => void (foodsTab ? controller.loadFoods() : controller.loadSaved())} /></View> : null}
      </View>}
      ListEmptyComponent={have ? <AppText muted style={styles.emptyText}>{query ? 'No encontramos nada con esa búsqueda.' : foodsTab ? 'Todavía no tenés alimentos. Crealos en Alimento por cantidad.' : 'Todavía no tenés comidas guardadas.'}</AppText> : null}
      renderItem={({ item: source }) => <PickRow source={source} item={inPlate.get(sourceId(source))} locked={locked} onAdd={add} controller={controller} />} />
    {draft.items.length && !review ? <PlateBar state={state} onOpen={() => { haptics.selection(); controller.showReview(); }} /> : null}
  </View>;

  const confirmed = state.preview?.snapshot;
  const kcalOf = (item: PlateItem) => state.preview?.items.find(row => row.id === sourceId(item.source))?.calories ?? itemEstimate(item)?.calories;
  return <MealSheet list={picker} listHidden={review} title={draft.title.trim() && review ? draft.title.trim() : 'Plato'}
    subtitle={review ? count(draft.items.length) : draft.items.length ? undefined : 'Elegí qué va en el plato'}
    onClose={review && !state.intent ? () => controller.showPicker() : () => controller.close()} onDismiss={() => controller.close()} back={review && !state.intent}
    dismissable={!running} running={running} testID="plate-editor"
    reviewFooter={review ? <PlateReviewActions saving={saving} locked={locked} blocked={locked || !state.preview || state.previewLoading}
      label={`Registrar plato${confirmed ? ` · ${shown(confirmed.calories)} kcal` : estimate?.calories != null ? ` · ${shown(estimate.calories)} kcal` : ''}`}
      onRegister={() => void controller.save()} onEmpty={state.intent ? undefined : empty} /> : undefined}
    right={<MealDateControl date={state.date} disabled={locked} onChange={date => controller.changeDate(date)} />}>
    {review ? <>
      <TextInput accessibilityLabel="Nombre del plato" placeholder="Plato" placeholderTextColor={colors.textMuted} editable={!locked} value={draft.title} maxLength={140}
        onChangeText={value => controller.rename(value)} style={[shared.input, { ...fieldSurface, color: colors.text }]} testID="plate-title" />
      {state.errors.title ? <AppText accessibilityRole="alert" variant="footnote">{state.errors.title}</AppText> : null}
      {/* The same block stays put: the instant estimate first, then the server's confirmed total. */}
      {confirmed ? <View style={styles.totals} testID="plate-total"><MealNutrients value={confirmed} /><MealProjection date={state.date} nutrients={confirmed} /></View>
        : estimate ? <View style={styles.totals} testID="plate-estimate"><MealNutrients value={estimate} pending /><MealProjection date={state.date} nutrients={estimate} pending /></View>
        : state.previewLoading ? <ActivityIndicator color={colors.textMuted} /> : null}
      <View>
        {draft.items.map(item => <Animated.View key={sourceId(item.source)} layout={LinearTransition.duration(200)} entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}
          style={[styles.item, { borderColor: colors.border }]} testID={`plate-item-${sourceId(item.source)}`}>
          <View style={shared.text}>
            <AppText variant="body">{sourceName(item.source)}</AppText>
            <AppText muted numeric variant="footnote">{`${shown(kcalOf(item))} kcal${item.source.kind === 'saved' ? ' · comida guardada' : ''}`}</AppText>
            {state.errors[sourceId(item.source)] ? <AppText accessibilityRole="alert" variant="footnote">{state.errors[sourceId(item.source)]}</AppText> : null}
          </View>
          <Amount item={item} locked={locked} controller={controller} editable />
        </Animated.View>)}
        <LinkRow label="Sumar algo más" onPress={() => controller.showPicker()} disabled={locked || draft.items.length >= PLATE_MAX} testID="plate-add-more" />
      </View>
      <View style={shared.row}>
        <View style={shared.text}><AppText>Guardar en mis comidas</AppText><AppText muted variant="caption">Queda en Rápido para repetirlo con un toque</AppText></View>
        <Switch accessibilityLabel="Guardar en mis comidas" disabled={locked} value={draft.saveToLibrary} onValueChange={value => controller.saveToLibrary(value)} trackColor={{ true: colors.primary, false: colors.border }} testID="plate-save-library" />
      </View>
      <MealTiming date={state.date} value={draft} disabled={locked} onChange={(label, time, declared) => controller.timing(label, time, declared)} />
      {status}
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
  step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  disc: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  faded: { opacity: 0.35 },
  amount: { flexDirection: 'row', alignItems: 'center', borderRadius: brandTokens.radius.button },
  amountText: { alignItems: 'center', minWidth: 48, maxWidth: 100 },
  quantity: { ...brandTokens.typeScale.subheadline, fontWeight: '600', textAlign: 'center', minWidth: 44, padding: 0, fontVariant: ['tabular-nums'] },
  barWrap: { position: 'absolute', left: brandTokens.layout.screenPadding, right: brandTokens.layout.screenPadding, bottom: 24 },
  bar: { borderRadius: brandTokens.radius.tabBar, overflow: 'hidden' },
  barPress: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 18 },
  reviewActions: { flexDirection: 'row', gap: brandTokens.space.xs, padding: brandTokens.space.xs, alignItems: 'center' },
  reviewActionsStacked: { flexDirection: 'column', alignItems: 'flex-end' },
  reviewMainStacked: { alignSelf: 'stretch' },
  emptyCircle: { borderRadius: brandTokens.radius.full, overflow: 'hidden' },
  emptyButton: { width: brandTokens.layout.buttonHeight, height: brandTokens.layout.buttonHeight, alignItems: 'center', justifyContent: 'center' },
  totals: { gap: 20 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
