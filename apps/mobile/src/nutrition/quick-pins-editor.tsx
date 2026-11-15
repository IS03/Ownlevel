import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { LinearTransition, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { AppIcon, AppSheet, AppText, Surface, brandTokens, useAppSheetDismiss, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { QUICK_PINS_MAX, type QuickOption } from '@/api/nutrition-quick';
import type { QuickPinsController, QuickPinsDraftBase, QuickPinsState } from './quick-pins-controller';
import { pinnedRows, searchLibrary, sortAZ } from './quick-library-model';
import { MealSearch, mealShown as shown } from './meal-sheet';

/**
 * #516 · «Administrar fijadas»: the person's pins as a local draft. Choosing, removing and reordering (drag from the handle,
 * or Subir/Bajar/Quitar for VoiceOver and Switch Control) change only this sheet; nothing is written. «Guardar» sends the
 * whole list once, over the confirmed revision the draft started from (QuickPinsController.write with its base): if the pins
 * changed meanwhile, nothing is sent and the person chooses. «Cancelar» drops the draft, asking first if it changed. The draft
 * lives in memory: closing the app before «Guardar» loses it without writing anything.
 */
export type QuickPinsDraft = { base: QuickPinsDraftBase; ids: string[] };
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, index) => id === b[index]);
export function moveTo(ids: readonly string[], id: string, index: number) {
  const next = ids.filter(x => x !== id);
  next.splice(Math.max(0, Math.min(next.length, index)), 0, id);
  return next;
}

export function QuickPinsEditor({ controller, state, saved, start, onClose }: {
  controller: QuickPinsController; state: QuickPinsState; saved: readonly QuickOption[]; start: QuickPinsDraft; onClose: () => void;
}) {
  const { colors } = useOwnlevelTheme();
  // What the sheet shows against what it would replace: the confirmed pins it edits over (the opening base, or the newer truth
  // adopted with «Usar las guardadas» / «Seguir con mi versión»). A change prepared from the menu is already a difference.
  const draft = useRef({ ids: start.ids, base: start.base.ids });
  // The confirmed list is only replaced by the receipt: a draft whose changes were not sent asks before it goes.
  const beforeDismiss = (proceed: () => void) => {
    if (same(draft.current.ids, draft.current.base) || controller.getSnapshot().intent) { proceed(); return; }
    Alert.alert('¿Descartar los cambios?', 'Tus fijadas guardadas no cambian.', [
      { text: 'Seguir editando', style: 'cancel' }, { text: 'Descartar', style: 'destructive', onPress: proceed },
    ]);
  };
  return <AppSheet onClose={onClose} closeLabel="Cerrar fijadas" locked={state.phase === 'pending'} beforeDismiss={beforeDismiss}
    style={{ backgroundColor: colors.background, maxHeight: '92%', flex: 1 }} testID="quick-pins-editor">
    <EditorBody controller={controller} state={state} saved={saved} start={start} onDraft={(ids, base) => { draft.current = { ids, base }; }} />
  </AppSheet>;
}

function EditorBody({ controller, state, saved, start, onDraft }: {
  controller: QuickPinsController; state: QuickPinsState; saved: readonly QuickOption[]; start: QuickPinsDraft; onDraft: (ids: string[], base: string[]) => void;
}) {
  const { colors } = useOwnlevelTheme(), dismiss = useAppSheetDismiss();
  const [ids, setIds] = useState(start.ids), [base, setBase] = useState(start.base);
  const [search, setSearch] = useState(''), [dragging, setDragging] = useState(false), [saving, setSaving] = useState(false);
  // The pins changed under the draft (found on this device before sending): nothing was sent.
  const [stale, setStale] = useState(false);
  useEffect(() => { onDraft(ids, base.ids); }, [base.ids, ids, onDraft]);
  // A refused write whose truth could not be read again: no decision can be made over it until a read works.
  const [reading, setReading] = useState(false);
  const unconfirmed = !!state.intent, conflict = stale || state.phase === 'conflict';
  const editable = !saving && state.phase !== 'pending' && !unconfirmed;
  const dirty = !same(ids, base.ids), full = ids.length >= QUICK_PINS_MAX;
  const names = (list: readonly string[]) => list.map(id => saved.find(o => o.source.id === id)?.name ?? 'una comida no disponible').join(', ');
  const update = (next: string[]) => { if (editable) setIds(next); };
  const toggle = (id: string) => { haptics.selection(); update(ids.includes(id) ? ids.filter(x => x !== id) : full ? ids : [...ids, id]); };
  const move = (id: string, to: number) => { haptics.selection(); update(moveTo(ids, id, to)); };
  /** Done only on the server's receipt: an uncertain or refused write keeps the sheet and its recovery. */
  // With a callback the sheet leaves without «¿Descartar los cambios?»: they are the receipt now, not a draft.
  const settled = () => { const now = controller.getSnapshot(); if (now.phase === 'idle' && !now.intent && !now.error) dismiss(() => {}); };
  const save = async () => {
    if (!dirty || !editable || conflict) return;
    setSaving(true);
    try {
      const outcome = await controller.write(ids, base);
      if (outcome === 'stale') setStale(true); else if (outcome !== 'refused') settled();
    } finally { setSaving(false); }
  };
  /** Start again from what is saved now (the receipt or the newer truth): the draft becomes that list. */
  const useSaved = () => { const next = controller.draftBase(); if (!next) return; controller.dismiss(); setStale(false); setBase(next); setIds(next.ids); };
  /** Keep my draft, now explicitly over the newer truth: one more explicit «Guardar» is still needed. */
  const keepMine = () => { const next = controller.draftBase(); if (!next) return; controller.dismiss(); setStale(false); setBase(next); };
  /** Decisions need a confirmed, readable truth (the same rule as draftBase). */
  const decidable = !!controller.draftBase();
  /** The same quick-options GET Rápido makes (QuickPinsController.reload): it only reads, never writes. */
  const reread = async () => { setReading(true); try { await controller.reload(); } finally { setReading(false); } };
  const rows = pinnedRows(ids, saved, state.confirmed);
  const library = useMemo(() => search.trim() ? searchLibrary(saved, search) : sortAZ(saved), [saved, search]);
  const busy = saving || state.phase === 'pending';

  const header = <View style={styles.top}>
    <View style={styles.bar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancelar" onPress={() => dismiss()} disabled={state.phase === 'pending'}
        style={styles.barButton} testID="quick-pins-cancel"><AppText variant="body" style={{ color: colors.text }}>Cancelar</AppText></Pressable>
      <AppText accessibilityRole="header" variant="headline" style={styles.title}>Fijadas</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel="Guardar fijadas" accessibilityState={{ disabled: !dirty || !editable || conflict, busy }}
        disabled={!dirty || !editable || conflict} onPress={() => void save()} style={[styles.barButton, styles.end]} testID="quick-pins-save">
        <View style={[styles.capsule, { backgroundColor: colors.primary, opacity: !dirty || !editable || conflict ? 0.4 : 1 }]}>
          <AppText variant="subheadline" style={{ color: colors.onPrimary, fontWeight: '600' }}>{busy ? 'Guardando…' : 'Guardar'}</AppText>
        </View>
      </Pressable>
    </View>
    {conflict ? <Surface style={styles.notice} testID="quick-pins-editor-conflict">
      <AppText accessibilityLiveRegion="polite" variant="footnote">{stale ? 'Tus fijadas cambiaron en otro dispositivo mientras editabas. No guardamos nada.' : state.message}</AppText>
      {decidable ? <>
        <AppText muted variant="footnote">Guardadas: {state.confirmed?.items.length ? names(state.confirmed.items.map(item => item.id)) : 'ninguna'}.</AppText>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={useSaved} style={styles.action} testID="quick-pins-use-saved"><AppText variant="subheadline" style={{ color: colors.primary, fontWeight: '600' }}>Usar las guardadas</AppText></Pressable>
          <Pressable accessibilityRole="button" onPress={keepMine} style={styles.action} testID="quick-pins-keep-mine"><AppText variant="subheadline" style={{ color: colors.primary, fontWeight: '600' }}>Seguir con mi versión</AppText></Pressable>
        </View>
      </> : <>
        {/* Without a confirmed reading there is nothing true to choose against: say so, keep the draft, offer only the read. */}
        <AppText muted variant="footnote" testID="quick-pins-editor-unreadable">No pudimos leer tus fijadas guardadas. Tu borrador sigue acá; no se guardó nada.</AppText>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: reading, busy: reading }} disabled={reading} onPress={() => void reread()} style={styles.action} testID="quick-pins-reread">
            <AppText variant="subheadline" style={{ color: reading ? colors.textMuted : colors.primary, fontWeight: '600' }}>{reading ? 'Leyendo…' : 'Volver a leer'}</AppText></Pressable>
        </View>
      </>}
    </Surface> : null}
    {state.phase === 'uncertain' ? <Surface style={styles.notice} testID="quick-pins-editor-uncertain">
      <AppText accessibilityLiveRegion="polite" variant="footnote">{state.message}</AppText>
      <View style={styles.actions}>
        {state.availability === 'ok' ? <Pressable accessibilityRole="button" onPress={() => void controller.recover().then(settled)} style={styles.action} testID="quick-pins-editor-recover">
          <AppText variant="subheadline" style={{ color: colors.primary, fontWeight: '600' }}>Comprobar</AppText></Pressable> : null}
      </View>
    </Surface> : null}
    {!conflict && state.phase !== 'uncertain' && state.error && state.message ? <AppText accessibilityLiveRegion="polite" muted variant="footnote" testID="quick-pins-editor-error">{state.message}</AppText> : null}
    <AppText muted numeric variant="footnote">{ids.length} de {QUICK_PINS_MAX}{ids.length > 1 ? ' · arrastrá para ordenar' : ''}{dirty && editable ? ' · Sin guardar' : ''}</AppText>
    <View testID="quick-pins-draft">
      {rows.map((row, index) => <DraftRow key={row.id} id={row.id} index={index} count={rows.length} disabled={!editable}
        name={row.kind === 'meal' ? row.option.name : row.state === 'archived' ? 'Comida archivada' : row.state === 'deleted' ? 'Comida eliminada' : 'Comida no disponible'}
        detail={row.kind === 'meal' ? `${shown(row.option.calories)} kcal` : 'Ocupa un lugar de tus fijadas.'} gone={row.kind !== 'meal'}
        onMove={to => move(row.id, to)} onRemove={() => toggle(row.id)} onDrag={setDragging} order={ids} onDrop={next => { haptics.selection(); update(next); }} />)}
      {!ids.length ? <AppText muted variant="subheadline" style={styles.empty}>Sin fijadas. Elegí abajo hasta {QUICK_PINS_MAX}.</AppText> : null}
    </View>
    <AppText accessibilityRole="header" variant="headline" style={styles.section}>Elegir de tus comidas</AppText>
    <MealSearch label="Buscar para fijar" value={search} onChange={setSearch} />
    {full ? <AppText muted variant="footnote">Ya tenés {QUICK_PINS_MAX}. Quitá una para sumar otra.</AppText> : null}
  </View>;

  return <FlatList data={library} keyExtractor={option => option.source.id} scrollEnabled={!dragging} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
    ListHeaderComponent={header} initialNumToRender={20} windowSize={7} testID="quick-pins-library"
    ListEmptyComponent={<AppText muted style={styles.empty}>No encontramos comidas con esa búsqueda.</AppText>}
    renderItem={({ item }) => <ChoiceRow option={item} pinned={ids.includes(item.source.id)} disabled={!editable || (full && !ids.includes(item.source.id))} onToggle={toggle} />}
    contentContainerStyle={{ paddingHorizontal: brandTokens.layout.screenPadding, paddingBottom: 32 }} />;
}

/** A meal of the library in the sheet: the pin toggles it in the draft. Never «+»: adding to the day is not this sheet. */
const ChoiceRow = memo(function ChoiceRow({ option, pinned, disabled, onToggle }: { option: QuickOption; pinned: boolean; disabled: boolean; onToggle: (id: string) => void }) {
  const { colors } = useOwnlevelTheme();
  return <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
    <View style={styles.text}><AppText variant="body">{option.name}</AppText><AppText muted numeric variant="footnote">{shown(option.calories)} kcal</AppText></View>
    <Pressable accessibilityRole="button" accessibilityLabel={pinned ? `Quitar ${option.name} de fijadas` : `Fijar ${option.name}`} accessibilityState={{ selected: pinned, disabled }}
      accessibilityHint={disabled && !pinned ? `Ya tenés ${QUICK_PINS_MAX} fijadas.` : undefined} disabled={disabled} onPress={() => onToggle(option.source.id)}
      style={styles.control} testID={`quick-pins-choice-${option.source.id}`}>
      <View style={[styles.disc, { backgroundColor: pinned ? colors.primary : colors.brandSubtle, opacity: disabled ? 0.4 : 1 }]}>
        <AppIcon name="pin" size={20} color={pinned ? colors.onPrimary : colors.primary} />
      </View>
    </Pressable>
  </View>;
});

/**
 * A pinned place in the draft. The handle is the only drag start (never the row: it does not compete with the scroll); the
 * row says its position and offers Subir/Bajar/Quitar as accessibility actions. Reduce Motion: no lift or travel.
 */
function DraftRow({ id, name, detail, gone, index, count, disabled, order, onMove, onRemove, onDrag, onDrop }: {
  id: string; name: string; detail: string; gone: boolean; index: number; count: number; disabled: boolean; order: string[];
  onMove: (to: number) => void; onRemove: () => void; onDrag: (dragging: boolean) => void; onDrop: (next: string[]) => void;
}) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion();
  const y = useSharedValue(0), lift = useSharedValue(0), height = useRef(56);
  const latest = useRef({ order, index, onDrag, onDrop });
  useEffect(() => { latest.current = { order, index, onDrag, onDrop }; });
  const finish = useCallback((dy: number, commit: boolean) => {
    const { order: now, index: from, onDrag: drag, onDrop: drop } = latest.current;
    drag(false);
    y.set(reduced ? 0 : withSpring(0, brandTokens.motion.spring)); lift.set(reduced ? 0 : withSpring(0, brandTokens.motion.spring));
    if (!commit) return;
    const to = Math.max(0, Math.min(now.length - 1, from + Math.round(dy / height.current)));
    if (to !== from) drop(moveTo(now, now[from], to));
  }, [lift, reduced, y]);
  // RNGH only registers these callbacks here; the refs are read later by native gesture events, never during render.
  /* eslint-disable react-hooks/refs */
  const pan = useMemo(() => Gesture.Pan().withTestId(`quick-pins-drag-${id}`).enabled(!disabled && count > 1).minDistance(1).runOnJS(true)
    .onStart(() => { latest.current.onDrag(true); haptics.selection(); lift.set(reduced ? 0 : withSpring(1, brandTokens.motion.spring)); })
    .onUpdate(event => { y.set(reduced ? 0 : event.translationY); })
    .onEnd(event => finish(event.translationY, true))
    .onFinalize((_event, success) => { if (!success) finish(0, false); }), [count, disabled, finish, id, lift, reduced, y]);
  /* eslint-enable react-hooks/refs */
  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { scale: 1 + 0.02 * lift.value }], zIndex: lift.value > 0 ? 2 : 0 }));
  const actions = [...(index > 0 ? [{ name: 'up', label: 'Subir' }] : []), ...(index < count - 1 ? [{ name: 'down', label: 'Bajar' }] : []), { name: 'remove', label: 'Quitar' }];
  const onAction = (event: AccessibilityActionEvent) => {
    if (disabled) return;
    const action = event.nativeEvent.actionName;
    if (action === 'up') onMove(index - 1); else if (action === 'down') onMove(index + 1); else if (action === 'remove') onRemove();
  };
  return <Animated.View layout={reduced ? undefined : LinearTransition.springify().damping(28).stiffness(240)} style={[{ backgroundColor: colors.background }, animated]}
    onLayout={event => { height.current = event.nativeEvent.layout.height || 56; }} testID={`quick-pins-draft-${id}`}>
    <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
      <GestureDetector gesture={pan}>
        <View style={styles.control} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={`quick-pins-handle-${id}`}>
          <AppIcon name="dragHandle" size={20} color={colors.textMuted} />
        </View>
      </GestureDetector>
      <View style={styles.text} accessible accessibilityLabel={`${name}, ${index + 1} de ${count}`} accessibilityActions={disabled ? [] : actions} onAccessibilityAction={onAction}
        testID={`quick-pins-draft-label-${id}`}>
        <AppText muted={gone} variant="body">{name}</AppText><AppText muted numeric variant="footnote">{detail}</AppText>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${name} de fijadas`} disabled={disabled} onPress={onRemove} style={styles.control} testID={`quick-pins-remove-${id}`}>
        <AppIcon name="minus" size={20} color={disabled ? colors.textMuted : colors.text} />
      </Pressable>
    </View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  top: { gap: 12, paddingBottom: 8 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingTop: 4 },
  barButton: { minHeight: 44, minWidth: 44, justifyContent: 'center' }, end: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center' },
  capsule: { minHeight: 34, paddingHorizontal: 14, borderRadius: brandTokens.radius.full, justifyContent: 'center' },
  notice: { gap: 8 }, actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 }, action: { minHeight: 44, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingVertical: 6 },
  text: { flex: 1, gap: 2 }, section: { paddingTop: 12 }, empty: { paddingVertical: 12 },
  control: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  disc: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
});
