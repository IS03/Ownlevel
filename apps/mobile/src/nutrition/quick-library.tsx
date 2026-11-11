import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, ScrollView, SectionList, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { AppIcon, AppText, Button, LoadingState, Surface, brandTokens, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';
import type { QuickOption } from '@/api/nutrition-quick';
import type { QuickController, QuickState } from './quick-controller';
import { visibleQuickPins, type QuickPinsController, type QuickPinsState } from './quick-pins-controller';
import { librarySections, pinnedRows, pinsFull, searchLibrary, type PinnedRow } from './quick-library-model';
import { MealSearch, mealShown as shown, mealSheetStyles as shared } from './meal-sheet';

/**
 * #479 C · Rápido. One SectionList owns the vertical scroll (MealSheet `list`), so 10, 50 or 200 saved meals render as a
 * window, not all at once. Searching, switching between the pinned entry and «Todas las comidas», and jumping to a letter
 * never read anything: they reorder the options Rápido already holds. Every pin change is the person's explicit decision
 * (manage mode, long press menu or VoiceOver actions), and nothing is offered for pinning while pins are not confirmed.
 */
export type QuickPins = { controller: QuickPinsController; state: QuickPinsState } | null;
type Item = { type: 'meal'; key: string; option: QuickOption; pinned: number } | { type: 'gone'; key: string; row: Extract<PinnedRow, { kind: 'unavailable' }> };
type Section = { key: string; title: string; data: Item[] };
const LETTERS_FROM = 12;
/** «Ir a letra»: each pass measures more rows, so the next one lands closer; a few passes land on the letter. */
const JUMP_PASSES = 8, JUMP_PASS_MS = 80;

const QuickRow = memo(function QuickRow({ option, added, pending, locked, onReview, onAdd, pin }: {
  option: QuickOption; added: boolean; pending: boolean; locked: boolean; onReview: (option: QuickOption) => void; onAdd: (option: QuickOption) => void;
  /** Present when pins can be changed now: the explicit actions on this meal. */
  pin: null | { pinned: boolean; index: number; count: number; full: boolean; manage: boolean; onToggle: () => void; onMove: (to: number) => void; menu: () => void };
}) {
  const { colors } = useOwnlevelTheme();
  const actions = pin ? [...(pin.pinned ? [{ name: 'unpin', label: 'Desfijar' }] : pin.full ? [] : [{ name: 'pin', label: 'Fijar' }]),
    ...(pin.pinned && pin.index > 0 ? [{ name: 'up', label: 'Subir' }] : []), ...(pin.pinned && pin.index < pin.count - 1 ? [{ name: 'down', label: 'Bajar' }] : [])] : [];
  const onAction = (event: AccessibilityActionEvent) => {
    const name = event.nativeEvent.actionName;
    if (name === 'pin' || name === 'unpin') pin?.onToggle(); else if (name === 'up') pin?.onMove(pin.index - 1); else if (name === 'down') pin?.onMove(pin.index + 1);
  };
  return <View style={[shared.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
    <View style={shared.text}><Pressable accessibilityRole="button" accessibilityLabel={`Revisar ${option.name}`} accessibilityActions={actions} onAccessibilityAction={onAction}
      disabled={locked} onPress={() => onReview(option)} onLongPress={pin ? pin.menu : undefined} style={{ minHeight: 44, justifyContent: 'center' }}>
      {/* #467/#481 hierarchy, unchanged: a regular name, secondary detail and value. */}
      <AppText variant="body">{option.name}</AppText>
      {/* An added option keeps its macros; the check says it is in the day, and undoing happens from the day. */}
      <AppText muted numeric variant="footnote">{`P ${shown(option.proteinG)} · C ${shown(option.carbsG)} · G ${shown(option.fatG)}${option.items.length ? ` · ${option.items.length} ingredientes` : ''}`}</AppText>
    </Pressable></View>
    {pin?.manage && pin.pinned && pin.count > 1 ? <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Subir ${option.name}`} disabled={pin.index === 0} onPress={() => pin.onMove(pin.index - 1)} style={styles.control} testID={`quick-pin-up-${option.source.id}`}>
        <View style={styles.flip}><AppIcon name="chevronDown" size={20} color={pin.index === 0 ? colors.textMuted : colors.primary} /></View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Bajar ${option.name}`} disabled={pin.index === pin.count - 1} onPress={() => pin.onMove(pin.index + 1)} style={styles.control} testID={`quick-pin-down-${option.source.id}`}>
        <AppIcon name="chevronDown" size={20} color={pin.index === pin.count - 1 ? colors.textMuted : colors.primary} />
      </Pressable>
    </> : <View style={{ alignItems: 'flex-end', gap: 2 }}><AppText muted numeric variant="subheadline">{shown(option.calories)} kcal</AppText>{option.useCount !== null ? <AppText muted variant="caption">{option.useCount} veces</AppText> : null}</View>}
    {pin?.manage ? <Pressable accessibilityRole="button" accessibilityLabel={pin.pinned ? `Desfijar ${option.name}` : `Fijar ${option.name}`}
      accessibilityState={{ selected: pin.pinned, disabled: !pin.pinned && pin.full }} accessibilityHint={!pin.pinned && pin.full ? 'Ya tenés 6 fijadas.' : undefined}
      disabled={!pin.pinned && pin.full} onPress={pin.onToggle} style={styles.add} testID={`quick-pin-toggle-${option.source.id}`}>
      <View style={[styles.addDisc, { backgroundColor: pin.pinned ? colors.primary : colors.brandSubtle, opacity: !pin.pinned && pin.full ? 0.4 : 1 }]}>
        <AppIcon name="pin" size={20} color={pin.pinned ? colors.onPrimary : colors.primary} />
      </View>
    </Pressable>
      /* The touch target stays 44 × 44 pt; only the disc drawn inside it is smaller. */
      : <Pressable accessibilityRole="button" accessibilityLabel={added ? `${option.name} agregado` : `Agregar ${option.name}`} accessibilityState={{ disabled: locked || added, busy: pending }} disabled={locked || added} onPress={() => onAdd(option)} style={styles.add} testID={`quick-add-${option.source.kind}:${option.source.id}`}>
        <View style={[styles.addDisc, { backgroundColor: added ? colors.primary : colors.brandSubtle }]} testID="quick-add-disc">
          {pending ? <ActivityIndicator color={colors.primary} /> : <AppIcon name={added ? 'checkmark' : 'plus'} size={20} color={added ? colors.onPrimary : colors.primary} />}
        </View>
      </Pressable>}
  </View>;
});

/** A place still taken by a meal that is not offered now (archived or deleted): never added, released only on request. */
function GoneRow({ row, onRelease }: { row: Extract<PinnedRow, { kind: 'unavailable' }>; onRelease: (() => void) | null }) {
  const { colors } = useOwnlevelTheme();
  const what = row.state === 'archived' ? 'Comida archivada' : row.state === 'deleted' ? 'Comida eliminada' : 'Comida no disponible';
  return <View style={[shared.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]} testID={`quick-pin-gone-${row.id}`}>
    <View style={shared.text} accessible accessibilityLabel={`${what}. Ocupa un lugar de tus fijadas y no se puede agregar.`}>
      <AppText muted variant="body">{what}</AppText>
      <AppText muted variant="footnote">{row.state === 'archived' ? 'Vuelve si la restaurás. Ocupa un lugar de tus fijadas.' : 'Ocupa un lugar de tus fijadas.'}</AppText>
    </View>
    {onRelease ? <Button label="Liberar lugar" variant="quiet" onPress={onRelease} /> : null}
  </View>;
}

/** Pins that need the person: unconfirmed, refused against newer truth, unreadable, or not refreshed. Never «no pins». */
function PinsNotice({ pins, names }: { pins: NonNullable<QuickPins>; names: (ids: readonly string[]) => string }) {
  const { colors } = useOwnlevelTheme();
  const { state, controller } = pins;
  if (state.phase === 'pending') return <View style={styles.inline} testID="quick-pins-pending"><ActivityIndicator color={colors.textMuted} /><AppText muted variant="footnote">Guardando tus fijadas…</AppText></View>;
  // Only readable pins can be checked or written against: otherwise the change just waits on the device.
  const readable = state.availability === 'ok';
  if (state.phase === 'uncertain') return <Surface style={styles.notice} testID="quick-pins-uncertain">
    <AppText accessibilityLiveRegion="polite" variant="footnote">{state.message}</AppText>
    {readable ? null : <AppText muted variant="footnote">Tus fijadas no están disponibles ahora. El cambio sigue guardado en este dispositivo y se podrá comprobar cuando vuelvan.</AppText>}
    <View style={styles.actions}>{readable ? <Button label="Comprobar" variant="quiet" onPress={() => void controller.recover()} /> : null}
      {state.error !== 'session' ? <Button label="Dejar de esperar" variant="quiet" onPress={() => void controller.forget()} /> : null}</View>
  </Surface>;
  if (state.phase === 'conflict') return <Surface style={styles.notice} testID="quick-pins-conflict">
    <AppText accessibilityLiveRegion="polite" variant="footnote">{state.message}</AppText>
    {state.wanted ? <AppText muted variant="footnote">Tu cambio: {state.wanted.length ? names(state.wanted) : 'ninguna fijada'}.</AppText> : null}
    <View style={styles.actions}>{state.wanted && readable ? <Button label="Aplicar mi cambio" variant="quiet" onPress={() => void controller.reapply()} /> : null}
      <Button label="Descartar" variant="quiet" onPress={() => controller.dismiss()} /></View>
  </Surface>;
  if (state.phase === 'blocked') return <Surface style={styles.notice} testID="quick-pins-blocked"><AppText accessibilityRole="alert" variant="footnote">{state.message}</AppText></Surface>;
  if (state.availability === 'unavailable' && state.confirmed) return <AppText muted variant="footnote" testID="quick-pins-stale">No pudimos actualizar tus fijadas. Mostramos las últimas confirmadas; por ahora no se pueden cambiar.</AppText>;
  if (state.error && state.message) return <AppText accessibilityLiveRegion="polite" muted variant="footnote" testID="quick-pins-error">{state.message}</AppText>;
  return null;
}

export function QuickLibrary({ state, controller, pins, locked, suggestions, onSaved, status, footer }: {
  state: QuickState; controller: QuickController; pins: QuickPins; locked: boolean; suggestions: boolean; onSaved?: () => void;
  /** What the quick registration needs the person to see or decide (outcome, recovery, conflict): above the rows. */
  status: ReactNode; footer: ReactNode;
}) {
  // Optional, like ScrollScreen: a sheet rendered without a provider just skips the bottom inset.
  const { colors } = useOwnlevelTheme(), bottomInset = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'entry' | 'all'>('entry');
  const [manage, setManage] = useState(false);
  const [more, setMore] = useState(false);
  const list = useRef<SectionList<Item, Section>>(null);
  // A letter jump in progress: the section, how many passes it took, whether the last one hit rows that were not measured yet.
  const jumping = useRef<{ sectionIndex: number; passes: number; failed: boolean; lastY: number } | null>(null), offsetY = useRef(0), jumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopJump = useCallback(() => { jumping.current = null; if (jumpTimer.current) clearTimeout(jumpTimer.current); jumpTimer.current = null; }, []);
  useEffect(() => stopJump, [stopJump]);
  const saved = state.options?.saved.status === 'ok' ? state.options.saved.items : null;
  const pinsState = pins?.state ?? null;
  // Unknown pins (unavailable without a confirmed list, still loading): the library is shown, never an empty pinned section.
  const pinnedIds = useMemo(() => (pinsState ? visibleQuickPins(pinsState)?.ids : null) ?? [], [pinsState]);
  const writable = !!pins && pinsState!.availability === 'ok' && !!pinsState!.confirmed && (pinsState!.phase === 'idle' || pinsState!.phase === 'conflict');
  const managing = manage && writable;
  const hasEntry = !!saved && pinnedIds.length > 0;
  // Once the library is what the person sees (no pins, or pins not readable), it stays: pinning the first meal from it, or
  // pins arriving later, never switches the screen under their finger. «Fijadas» is then one tap away.
  const pinsKnown = !pins || !!pinsState!.confirmed || pinsState!.availability === 'unavailable' || pinsState!.phase === 'blocked';
  if (saved && pinsKnown && !hasEntry && view === 'entry') setView('all');
  const current = hasEntry ? view : 'all';
  const query = search.trim();

  const review = useCallback((option: QuickOption) => controller.choose(option), [controller]);
  const add = useCallback((option: QuickOption) => { void controller.addInline(option); }, [controller]);
  const names = useCallback((ids: readonly string[]) => ids.map(id => saved?.find(option => option.source.id === id)?.name ?? 'una comida no disponible').join(', '), [saved]);
  const pinControls = useCallback((option: QuickOption) => {
    if (!writable || !pins) return null;
    const index = pinnedIds.indexOf(option.source.id), pinned = index >= 0, full = pinsFull(pinnedIds);
    const toggle = () => { haptics.selection(); void (pinned ? pins.controller.unpin(option.source.id) : pins.controller.pin(option.source.id)); };
    const move = (to: number) => { haptics.selection(); void pins.controller.move(option.source.id, to); };
    const menu = () => {
      const choices = [...(pinned ? [{ label: 'Desfijar', run: toggle }] : full ? [] : [{ label: 'Fijar en Rápido', run: toggle }]),
        ...(pinned && index > 0 ? [{ label: 'Subir', run: () => move(index - 1) }] : []), ...(pinned && index < pinnedIds.length - 1 ? [{ label: 'Bajar', run: () => move(index + 1) }] : [])];
      if (!choices.length) { Alert.alert(option.name, 'Ya tenés 6 fijadas. Desfijá una para fijar otra.'); return; }
      if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ title: option.name, options: [...choices.map(c => c.label), 'Cancelar'], cancelButtonIndex: choices.length },
        selected => { choices[selected]?.run(); });
      else Alert.alert(option.name, undefined, [...choices.map(c => ({ text: c.label, onPress: c.run })), { text: 'Cancelar', style: 'cancel' as const }]);
    };
    return { pinned, index, count: pinnedIds.length, full, manage: managing, onToggle: toggle, onMove: move, menu };
  }, [managing, pinnedIds, pins, writable]);

  const sections = useMemo<Section[]>(() => {
    const meal = (option: QuickOption): Item => ({ type: 'meal', key: option.source.id, option, pinned: pinnedIds.indexOf(option.source.id) });
    const suggestedSection = (): Section[] => {
      if (!suggestions || state.options?.suggested.status !== 'ok') return [];
      const items = query ? state.options.suggested.items.filter(o => searchLibrary([o], query).length) : state.options.suggested.items.slice(0, more ? undefined : 3);
      return items.length ? [{ key: 'suggested', title: 'Para vos', data: items.map(option => ({ type: 'meal' as const, key: `suggestion:${option.source.id}`, option, pinned: -1 })) }] : [];
    };
    // Each section is independent: unavailable saved meals never hide the suggestions (and vice versa).
    if (!saved) return suggestedSection();
    if (query) {
      const found = searchLibrary(saved, query);
      return [...suggestedSection(), ...(found.length ? [{ key: 'results', title: `${found.length} ${found.length === 1 ? 'resultado' : 'resultados'}`, data: found.map(meal) }] : [])];
    }
    if (current === 'entry') return [{ key: 'pinned', title: 'Fijadas', data: pinnedRows(pinnedIds, saved, pinsState?.confirmed ?? null)
      .map(row => row.kind === 'meal' ? meal(row.option) : { type: 'gone' as const, key: `gone:${row.id}`, row }) }];
    return [...suggestedSection(), ...librarySections(saved).map(section => ({ key: section.key, title: section.title, data: section.data.map(meal) }))];
  }, [current, more, pinnedIds, pinsState?.confirmed, query, saved, state.options, suggestions]);

  const letters = !query && current === 'all' && (saved?.length ?? 0) >= LETTERS_FROM ? sections.filter(s => s.key !== 'suggested') : [];
  // New sections (another query, a refreshed list): a jump in progress points at rows that are not there anymore.
  useEffect(() => stopJump, [sections, stopJump]);
  /**
   * #479 D1, measured on the iOS simulator: one scrollToLocation does nothing when the letter is below what has been measured
   * (200 meals: «G» is item 85, 64 measured), and with sticky section headers even the retry ends at the top. So: no sticky
   * headers, and several passes (80 ms apart) that stop when a pass found everything measured and the offset stopped moving,
   * or when the person touches the list.
   */
  const jump = (key: string) => {
    const sectionIndex = sections.findIndex(s => s.key === key);
    if (sectionIndex < 0) return;
    stopJump();
    jumping.current = { sectionIndex, passes: 0, failed: false, lastY: Number.NaN };
    function pass() {
      const job = jumping.current;
      if (!job) return;
      job.passes += 1; job.failed = false;
      list.current?.scrollToLocation({ sectionIndex: job.sectionIndex, itemIndex: 0, viewPosition: 0, animated: false });
      jumpTimer.current = setTimeout(() => {
        const now = jumping.current;
        if (!now) return;
        if (now.passes >= JUMP_PASSES || (!now.failed && Math.abs(offsetY.current - now.lastY) < 1)) { stopJump(); return; }
        now.lastY = offsetY.current; pass();
      }, JUMP_PASS_MS);
    }
    pass();
  };
  const toggleManage = () => { haptics.selection(); setManage(value => !value); };

  const manageButton = writable ? <Button label={managing ? 'Listo' : pinnedIds.length ? 'Administrar' : 'Elegir fijadas'} variant="quiet" onPress={toggleManage} testID="quick-pins-manage" /> : null;
  const header = <View style={styles.header}>
    <MealSearch label="Buscar en tus comidas" value={search} onChange={setSearch} />
    {status}
    {state.optionsLoading ? <LoadingState label="Cargando opciones rápidas" /> : null}
    {state.optionsError ? <AppText accessibilityRole="alert">No pudimos actualizar las opciones.</AppText> : null}
    {state.options?.saved.status === 'unavailable' ? <AppText accessibilityRole="alert">No pudimos cargar estas opciones.</AppText> : null}
    {/* The retry sits next to the error it answers, not after the last row. */}
    {state.optionsError || state.options?.saved.status === 'unavailable' || (suggestions && state.options?.suggested.status === 'unavailable')
      ? <Button label="Reintentar opciones" onPress={() => void controller.loadOptions()} variant="quiet" /> : null}
    {pins ? <PinsNotice pins={pins} names={names} /> : null}
    {hasEntry && !query ? current === 'entry'
      ? <Pressable accessibilityRole="button" accessibilityLabel={`Todas las comidas, ${saved!.length}`} onPress={() => { haptics.selection(); setView('all'); }} style={[styles.nav, { backgroundColor: colors.surface }]} testID="quick-all-meals">
        <AppText variant="body" style={styles.flex}>Todas las comidas</AppText><AppText muted numeric variant="subheadline">{saved!.length}</AppText><AppIcon name="chevronRight" size={17} color={colors.textMuted} />
      </Pressable>
      : <Pressable accessibilityRole="button" accessibilityLabel="Volver a fijadas" onPress={() => { haptics.selection(); setView('entry'); }} style={styles.back} testID="quick-back-to-pins">
        <AppIcon name="chevronLeft" size={17} color={colors.primary} /><AppText variant="subheadline" style={{ color: colors.primary }}>Fijadas</AppText>
      </Pressable> : null}
    {saved && !query && current === 'all' ? <View style={styles.titleRow}><AppText accessibilityRole="header" variant="headline" style={styles.flex}>Todas las comidas</AppText>{manageButton}</View> : null}
    {saved && query ? <View style={styles.titleRow}><View style={styles.flex} />{manageButton}</View> : null}
    {saved && !query && current === 'entry' ? <View style={styles.titleRow}><AppText accessibilityRole="header" variant="headline" style={styles.flex}>Fijadas</AppText>{manageButton}</View> : null}
    {letters.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.letters} accessibilityLabel="Ir a letra" testID="quick-letters">
      {letters.map(section => <Pressable key={section.key} accessibilityRole="button" accessibilityLabel={`Ir a la letra ${section.title === '#' ? 'números y símbolos' : section.title}`}
        onPress={() => jump(section.key)} style={styles.letter} testID={`quick-letter-${section.key}`}><AppText numeric variant="subheadline" style={{ color: colors.primary }}>{section.title}</AppText></Pressable>)}
    </ScrollView> : null}
  </View>;
  const empty = saved ? <AppText muted style={styles.empty}>{query ? 'No encontramos comidas con esa búsqueda.' : 'Todavía no tenés comidas guardadas.'}</AppText> : null;
  const listFooter = <View style={styles.footer}>
    {suggestions && !query && state.options?.suggested.status === 'ok' && state.options.suggested.items.length > 3 ? <Button label={more ? 'Ver menos' : 'Ver más sugerencias'} variant="quiet" onPress={() => setMore(!more)} /> : null}
    {onSaved && saved?.length ? <Button label="Editar guardadas" variant="quiet" onPress={onSaved} disabled={locked} /> : null}
    {footer}
  </View>;

  return <SectionList<Item, Section> ref={list} sections={sections} keyExtractor={item => item.key} testID="quick-library"
    renderItem={({ item }) => item.type === 'gone'
      ? <GoneRow row={item.row} onRelease={writable && pins ? () => { haptics.selection(); void pins.controller.unpin(item.row.id); } : null} />
      : <QuickRow option={item.option} added={!!state.added?.[`${item.option.source.kind}:${item.option.source.id}`]} pending={state.inlineKey === `${item.option.source.kind}:${item.option.source.id}`}
        locked={locked} onReview={review} onAdd={add} pin={item.option.source.kind === 'saved' ? pinControls(item.option) : null} />}
    renderSectionHeader={({ section }) => section.key === 'pinned' || section.key === 'results' && !query ? null
      : <View style={[styles.section, { backgroundColor: colors.background }]}><AppText accessibilityRole="header" muted numeric variant="footnote">{section.title}</AppText></View>}
    ListHeaderComponent={header} ListEmptyComponent={empty} ListFooterComponent={listFooter}
    stickySectionHeadersEnabled={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
    // Section headers and footers count as items: 30 is about one screen of rows, whatever the library size.
    initialNumToRender={30} maxToRenderPerBatch={12} windowSize={9}
    onScroll={event => { offsetY.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={32} onScrollBeginDrag={stopJump}
    onScrollToIndexFailed={info => {
      // Rows have their own heights (long names wrap): go near the letter so those rows get measured; the next pass lands on it.
      if (jumping.current) jumping.current.failed = true;
      list.current?.getScrollResponder()?.scrollTo({ y: info.averageItemLength * info.index, animated: false });
    }}
    contentContainerStyle={{ paddingHorizontal: brandTokens.layout.screenPadding, paddingBottom: Math.max(bottomInset, 12) + brandTokens.layout.screenPadding }} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, header: { gap: 12, paddingBottom: 4 }, footer: { gap: 12, paddingTop: 24 }, empty: { paddingVertical: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }, section: { paddingTop: 12, paddingBottom: 4 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 50, paddingHorizontal: 16, borderRadius: brandTokens.radius.button },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start' },
  letters: { gap: 4 }, letter: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  notice: { gap: 8 }, actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 }, inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  add: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }, addDisc: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  control: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }, flip: { transform: [{ rotate: '180deg' }] },
});
