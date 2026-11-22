import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, SectionList, StyleSheet, View, useWindowDimensions, type AccessibilityActionEvent, type ViewToken } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { LinkRow, AppIcon, AppText, Button, LoadingState, Surface, brandTokens, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';
import type { QuickOption } from '@/api/nutrition-quick';
import type { QuickController, QuickState } from './quick-controller';
import { visibleQuickPins, type QuickPinsController, type QuickPinsState } from './quick-pins-controller';
import { QuickPinsEditor, type QuickPinsDraft } from './quick-pins-editor';
import { LetterJump, sectionStarts } from './quick-letter-jump';
import { SIDE_INDEX_WIDTH, SideIndex } from './quick-side-index';
import { INITIALS, librarySections, pinnedRows, pinsFull, searchLibrary, type PinnedRow } from './quick-library-model';
import { MealSearch, mealShown as shown, mealSheetStyles as shared } from './meal-sheet';
import { QUICK_MENU_TIMES, QuickRowMenu } from './quick-row-menu';

/**
 * #479 C / #516 · Rápido. One SectionList owns the vertical scroll (MealSheet `list`), so 10, 50 or 200 saved meals render as a
 * window, not all at once: «Fijadas» on top, «Para vos», then «Todas las comidas» A–Z, in one view. Searching and jumping to
 * a letter never read anything. Holding a meal opens the native menu: Agregar, Agregar varias veces (×N, one meal),
 * Fijar arriba / Desfijar (written at once, the person's explicit choice) and Editar. Ordering and several changes at once
 * stay in «Administrar fijadas». Nothing is offered for pinning while pins are not confirmed. «+» only adds to the day.
 */
export type QuickPins = { controller: QuickPinsController; state: QuickPinsState } | null;
type Item = { type: 'meal'; key: string; option: QuickOption; pinned: number } | { type: 'gone'; key: string; row: Extract<PinnedRow, { kind: 'unavailable' }> }
  /** A1 · the pinned meals as one row of cards (normal text size). */
  | { type: 'pins'; key: string; rows: Exclude<Item, { type: 'pins' }>[] };
type Section = { key: string; title: string; data: Item[] };
const LETTERS_FROM = 12;
/** A row counts as on screen when at least half of it is (a zero-height section footer never does). */
const VIEWABILITY = { itemVisiblePercentThreshold: 50 };
/** The native small spinner is 20 pt: the refresh slot is never shorter than it, nor than one footnote line at the current text size. */
const SPINNER_SIZE = 20;

/** What a long press offers on a meal: multiples (saved meals only), pin or unpin, edit. Null where it does not apply. */
type RowMenu = { onTimes: ((option: QuickOption, times: number) => void) | null; onEdit: ((option: QuickOption) => void) | null };
type RowProps = {
  option: QuickOption; added: boolean; pending: boolean; locked: boolean; onReview: (option: QuickOption) => void; onAdd: (option: QuickOption) => void;
  /** Present when pins can be changed now: pin or unpin this meal right away. */
  pin: null | { pinned: boolean; full: boolean; onToggle: () => void };
  menu: RowMenu;
};
/** The part of a row or card that opens the review and, held, the native menu. Measured: the menu needs its width. */
function MenuArea({ option, locked, onReview, onAdd, pin, menu, children, style, label }: Omit<RowProps, 'added' | 'pending'> & { children: ReactNode; style?: object; label: string }) {
  const [width, setWidth] = useState(0);
  const actions = pin ? pin.pinned ? [{ name: 'unpin', label: 'Desfijar' }] : pin.full ? [] : [{ name: 'pin', label: 'Fijar' }] : [];
  const saved = option.source.kind === 'saved';
  return <View style={styles.menuArea} onLayout={event => { const w = Math.floor(event.nativeEvent.layout.width); if (w !== width) setWidth(w); }}>
    <QuickRowMenu disabled={locked} width={width} name={option.name} onOpen={() => onReview(option)} onAdd={() => onAdd(option)}
      times={QUICK_MENU_TIMES} onTimes={saved && menu.onTimes ? n => menu.onTimes!(option, n) : null} pin={pin} onEdit={saved && menu.onEdit ? () => menu.onEdit!(option) : null}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Mantené apretado para más opciones" accessibilityActions={actions}
        onAccessibilityAction={(event: AccessibilityActionEvent) => { const name = event.nativeEvent.actionName; if (name === 'pin' || name === 'unpin') pin?.onToggle(); }}
        disabled={locked} onPress={() => onReview(option)} style={style}>{children}</Pressable>
    </QuickRowMenu>
  </View>;
}

const QuickRow = memo(function QuickRow({ option, added, pending, locked, onReview, onAdd, pin, menu }: RowProps) {
  const { colors } = useOwnlevelTheme();
  return <View style={[shared.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
    <MenuArea option={option} locked={locked} onReview={onReview} onAdd={onAdd} pin={pin} menu={menu} label={`Revisar ${option.name}`} style={styles.rowMain}>
      {/* #467/#481 hierarchy, unchanged: a regular name, secondary detail and value. */}
      <View style={shared.text}>
        <AppText variant="body">{option.name}</AppText>
        {/* An added option keeps its macros; the check says it is in the day, and undoing happens from the day. */}
        <AppText muted numeric variant="footnote">{`P ${shown(option.proteinG)} · C ${shown(option.carbsG)} · G ${shown(option.fatG)}${option.items.length ? ` · ${option.items.length} ingredientes` : ''}`}</AppText>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}><AppText muted numeric variant="subheadline">{shown(option.calories)} kcal</AppText>{option.useCount !== null ? <AppText muted variant="caption">{option.useCount} veces</AppText> : null}</View>
    </MenuArea>
    {/* The touch target stays 44 × 44 pt; only the disc drawn inside it is smaller. «+» only ever adds to the day. */}
    <Pressable accessibilityRole="button" accessibilityLabel={added ? `${option.name} agregado` : `Agregar ${option.name}`} accessibilityState={{ disabled: locked || added, busy: pending }} disabled={locked || added} onPress={() => onAdd(option)} style={styles.add} testID={`quick-add-${option.source.kind}:${option.source.id}`}>
        {/* At rest a thin ring (19 of them in a column read as one quiet rhythm); a soft champagne check once added. */}
        <View style={[styles.addDisc, added ? { backgroundColor: colors.brandSubtle } : { borderWidth: 1.5, borderColor: colors.border }]} testID="quick-add-disc">
          {pending ? <ActivityIndicator color={colors.primary} /> : <AppIcon name={added ? 'checkmark' : 'plus'} size={17} color={colors.primary} />}
        </View>
      </Pressable>
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

/**
 * A1 · A pinned meal as a card: tap reviews, «+» adds to the day, long press opens the pin menu. Same labels and actions
 * as the row, so VoiceOver and the add flow do not change; only the name is clamped to two lines (the label keeps it whole).
 */
const PinTile = memo(function PinTile({ option, added, pending, locked, onReview, onAdd, pin, menu }: RowProps) {
  const { colors } = useOwnlevelTheme();
  return <View style={[styles.tile, { backgroundColor: colors.field, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.fieldBorder }]} testID={`quick-pin-tile-${option.source.id}`}>
    <MenuArea option={option} locked={locked} onReview={onReview} onAdd={onAdd} pin={pin} menu={menu} label={`Revisar ${option.name}`} style={styles.tileText}>
      <AppText numberOfLines={2} variant="footnote" style={{ fontWeight: '600' }}>{option.name}</AppText>
    </MenuArea>
    <View style={styles.tileFoot}>
      <AppText muted numeric variant="caption">{shown(option.calories)} kcal</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={added ? `${option.name} agregado` : `Agregar ${option.name}`} accessibilityState={{ disabled: locked || added, busy: pending }} disabled={locked || added} onPress={() => onAdd(option)} style={styles.add} testID={`quick-add-${option.source.kind}:${option.source.id}`}>
        <View style={[styles.tileDisc, { backgroundColor: colors.brandSubtle }]}>
          {pending ? <ActivityIndicator color={colors.primary} /> : <AppIcon name={added ? 'checkmark' : 'plus'} size={17} color={colors.primary} />}
        </View>
      </Pressable>
    </View>
  </View>;
});
/** A pinned place whose meal is not offered now, as a card: never added, released only on request. */
function GoneTile({ row, onRelease }: { row: Extract<PinnedRow, { kind: 'unavailable' }>; onRelease: (() => void) | null }) {
  const { colors } = useOwnlevelTheme();
  const what = row.state === 'archived' ? 'Comida archivada' : row.state === 'deleted' ? 'Comida eliminada' : 'Comida no disponible';
  return <View style={[styles.tile, { backgroundColor: colors.field, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.fieldBorder }]} testID={`quick-pin-gone-${row.id}`}>
    <View style={styles.tileText} accessible accessibilityLabel={`${what}. Ocupa un lugar de tus fijadas y no se puede agregar.`}>
      <AppText muted numberOfLines={2} variant="footnote">{what}</AppText>
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

export function QuickLibrary({ state, controller, pins, locked, suggestions, onSaved, onEdit, status, footer }: {
  state: QuickState; controller: QuickController; pins: QuickPins; locked: boolean; suggestions: boolean; onSaved?: () => void;
  /** «Editar» from a saved meal's long-press menu: its editor, outside Rápido. */
  onEdit?: (option: QuickOption) => void;
  /** What the quick registration needs the person to see or decide (outcome, recovery, conflict): above the rows. */
  status: ReactNode; footer: ReactNode;
}) {
  // Optional, like ScrollScreen: a sheet rendered without a provider just skips the bottom inset.
  const { colors } = useOwnlevelTheme(), bottomInset = useContext(SafeAreaInsetsContext)?.bottom ?? 0, { fontScale } = useWindowDimensions();
  const [search, setSearch] = useState('');
  // #516: the draft «Administrar fijadas» edits (null: closed). Opening it never writes.
  const [editor, setEditor] = useState<QuickPinsDraft | null>(null);
  const [lettersOpen, setLettersOpen] = useState(false);
  const [more, setMore] = useState(false);
  const list = useRef<SectionList<Item, Section>>(null);
  // A letter jump in progress: the section, how many passes it took, whether the last one hit rows that were not measured yet.
  // #525 · «Ir a letra» checks where it landed (quick-letter-jump.ts). What the list reports: the offset, its size, and which
  // flat indexes (headers and rows) are on screen at least half.
  const offsetY = useRef(0), viewport = useRef(0), content = useRef(0), shown = useRef<{ first: number | null; last: number | null }>({ first: null, last: null });
  const layout = useRef<{ starts: number[]; index: Map<string, number> }>({ starts: [], index: new Map() });
  const jumper = useRef<LetterJump | null>(null);
  const stopJump = useCallback(() => { jumper.current?.stop(); }, []);
  useEffect(() => stopJump, [stopJump]);
  // Stable for the list's whole life (the list does not accept a new callback); it reads the current sections from a ref.
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const { starts, index } = layout.current;
    const flat = viewableItems.flatMap(token => {
      const section = index.get((token.section as { key?: string } | undefined)?.key ?? '');
      return section === undefined ? [] : [starts[section]! + (token.index === null || token.index === undefined ? 0 : token.index + 1)];
    });
    shown.current = flat.length ? { first: Math.min(...flat), last: Math.max(...flat) } : { first: null, last: null };
  }, []);
  const saved = state.options?.saved.status === 'ok' ? state.options.saved.items : null;
  const pinsState = pins?.state ?? null;
  // Unknown pins (unavailable without a confirmed list, still loading): the library is shown, never an empty pinned section.
  const pinnedIds = useMemo(() => (pinsState ? visibleQuickPins(pinsState)?.ids : null) ?? [], [pinsState]);
  const writable = !!pins && pinsState!.availability === 'ok' && !!pinsState!.confirmed && (pinsState!.phase === 'idle' || pinsState!.phase === 'conflict') && !pinsState!.intent;
  const query = search.trim();
  // Large text: 28 letters of 44 pt in one row stop reading as an alphabet; the same letters open on request instead.
  const compactIndex = fontScale > 1.3;
  // A1 · pinned meals as a row of cards at normal text size; with large text they stay full-width rows (nothing squeezed).
  const cards = !compactIndex;
  // #303 · Only a section the server confirmed counts: with one on screen a new read is a quiet refresh, never a blank loader.
  const confirmed = !!saved || (suggestions && state.options?.suggested.status === 'ok');
  const retryable = state.optionsError || state.options?.saved.status === 'unavailable' || (suggestions && state.options?.suggested.status === 'unavailable');

  const review = useCallback((option: QuickOption) => controller.choose(option), [controller]);
  const add = useCallback((option: QuickOption) => { void controller.addInline(option); }, [controller]);
  const rowMenu = useMemo<RowMenu>(() => ({
    onTimes: (option, times) => { haptics.selection(); void controller.addInline(option, times); },
    onEdit: onEdit ?? null,
  }), [controller, onEdit]);
  const names = useCallback((ids: readonly string[]) => ids.map(id => saved?.find(option => option.source.id === id)?.name ?? 'una comida no disponible').join(', '), [saved]);
  /** «Administrar fijadas» over the confirmed pins it starts from, optionally with one change already prepared. */
  const openEditor = useCallback((change?: { pin?: string; unpin?: string }) => {
    const base = writable && pins ? pins.controller.draftBase() : null;
    if (!base) return;
    haptics.selection();
    const ids = change?.unpin ? base.ids.filter(id => id !== change.unpin) : change?.pin && !base.ids.includes(change.pin) && !pinsFull(base.ids) ? [...base.ids, change.pin] : base.ids;
    setEditor({ base, ids });
  }, [pins, writable]);
  const pinControls = useCallback((option: QuickOption) => {
    if (!writable || !pins) return null;
    const pinned = pinnedIds.includes(option.source.id), full = pinsFull(pinnedIds);
    // Pinning from the menu is the person's explicit choice: it writes at once, through the same verified, one-at-a-time write
    // as «Administrar» (a refusal over newer pins shows its conflict above the list). Order and bulk changes stay there.
    const toggle = () => {
      if (!pinned && full) { Alert.alert('Fijadas completas', 'Ya tenés 6 fijadas. Desfijá una para fijar otra.'); return; }
      haptics.selection();
      void (pinned ? pins.controller.unpin(option.source.id) : pins.controller.pin(option.source.id));
    };
    return { pinned, full, onToggle: toggle };
  }, [pinnedIds, pins, writable]);

  const sections = useMemo<Section[]>(() => {
    const meal = (option: QuickOption): Extract<Item, { type: 'meal' }> => ({ type: 'meal', key: option.source.id, option, pinned: pinnedIds.indexOf(option.source.id) });
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
    // #516: one view. «Fijadas» only when there are pins (no empty card), then «Para vos», then the whole library A–Z.
    const pinnedItems = pinnedRows(pinnedIds, saved, pinsState?.confirmed ?? null)
      .map(row => row.kind === 'meal' ? { ...meal(row.option), key: `pinned:${row.option.source.id}` } : { type: 'gone' as const, key: `gone:${row.id}`, row });
    const pinned: Section[] = pinnedIds.length ? [{ key: 'pinned', title: 'Fijadas', data: cards ? [{ type: 'pins' as const, key: 'pins', rows: pinnedItems }] : pinnedItems }] : [];
    const library = librarySections(saved);
    return [...pinned, ...suggestedSection(), ...(library.length ? [{ key: 'library', title: 'Todas las comidas', data: [] }] : []),
      ...library.map(section => ({ key: section.key, title: section.title, data: section.data.map(meal) }))];
  }, [cards, more, pinnedIds, pinsState?.confirmed, query, saved, state.options, suggestions]);

  // The whole Spanish alphabet, always in the same places: an initial with no meals is shown disabled, never a jump to nothing.
  const present = useMemo(() => new Set(sections.map(section => section.key)), [sections]);
  const indexed = !query && (saved?.length ?? 0) >= LETTERS_FROM;
  // New sections (another query, a refreshed list): a jump in progress points at rows that are not there anymore.
  useEffect(() => {
    layout.current = { starts: sectionStarts(sections.map(section => section.data.length)), index: new Map(sections.map((section, i) => [section.key, i])) };
    return stopJump;
  }, [sections, stopJump]);
  /** Jump to a letter's section: on the first tap it lands there, checked against what is on screen (see quick-letter-jump.ts). */
  const jump = (key: string) => {
    const sectionIndex = sections.findIndex(s => s.key === key);
    if (sectionIndex < 0) return;
    jumper.current ??= new LetterJump({
      toSection: index => list.current?.scrollToLocation({ sectionIndex: index, itemIndex: 0, viewPosition: 0, animated: false }),
      toOffset: y => list.current?.getScrollResponder()?.scrollTo({ y, animated: false }),
      view: () => ({ ...shown.current, offset: offsetY.current, viewport: viewport.current, atEnd: offsetY.current >= content.current - viewport.current - 2 }),
      schedule: (run, ms) => setTimeout(run, ms), cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const start = sectionStarts(sections.map(section => section.data.length))[sectionIndex]!;
    jumper.current.start(sectionIndex, start, start + sections[sectionIndex]!.data.length + 2);
  };
  const manageButton = writable ? <LinkRow label={pinnedIds.length ? 'Administrar' : 'Elegir fijadas'} onPress={() => openEditor()} testID="quick-pins-manage" /> : null;
  const letterButton = (letter: string, side = false, active = false) => {
    const has = present.has(letter), label = letter === '#' ? 'números y símbolos' : letter;
    // The side column is quiet (muted letters, the empty ones faint); only the letter under the finger takes the accent.
    const tint = !has ? { color: colors.textMuted, opacity: side ? 0.3 : 0.45 } : side && !active ? { color: colors.textMuted } : { color: colors.primary };
    return <Pressable key={letter} accessibilityRole="button" accessibilityLabel={has ? `Ir a la letra ${label}` : `${label}, sin comidas`} accessibilityState={{ disabled: !has }} disabled={!has}
      onPress={() => { setLettersOpen(false); jump(letter); }} style={side ? styles.sideLetter : styles.letter} testID={`quick-letter-${letter}`}>
      <AppText numeric variant={side ? 'caption' : 'subheadline'} style={[tint, { fontWeight: '600' }]}>{letter}</AppText>
    </Pressable>;
  };
  const alphabet = INITIALS.split('');
  // Normal size: the index is a column at the right edge (SideIndex, below). Large text: «Ir a letra» opens the letters.
  const index = !indexed || !compactIndex ? null
    : <View style={styles.compact} testID="quick-letters-compact">
      <Pressable accessibilityRole="button" accessibilityLabel="Ir a letra" accessibilityState={{ expanded: lettersOpen }} onPress={() => setLettersOpen(value => !value)} style={styles.goto} testID="quick-letters-toggle">
        <AppText variant="subheadline" style={{ color: colors.primary, fontWeight: '600' }}>Ir a letra</AppText>
        <View style={lettersOpen ? styles.flip : null}><AppIcon name="chevronDown" size={17} color={colors.primary} /></View>
      </Pressable>
      {lettersOpen ? <View style={styles.grid}>{alphabet.map(letter => letterButton(letter))}</View> : null}
    </View>;
  const side = indexed && !compactIndex;
  const refreshRow = state.optionsLoading && confirmed
    ? <View accessible accessibilityLabel="Actualizando opciones rápidas" accessibilityLiveRegion="polite" style={styles.inline} testID="quick-options-refreshing">
      <ActivityIndicator accessibilityElementsHidden importantForAccessibility="no-hide-descendants" color={colors.textMuted} />
      <AppText muted variant="footnote" style={styles.flex}>Actualizando…</AppText>
    </View> : null;
  const refreshSlot = retryable ? refreshRow : <View style={{ minHeight: Math.max(SPINNER_SIZE, Math.ceil(brandTokens.typeScale.footnote.lineHeight * fontScale)), justifyContent: 'center' }} testID="quick-options-refresh-slot">{refreshRow}</View>;
  const header = <View style={styles.header}>
    <MealSearch label="Buscar en tus comidas" value={search} onChange={setSearch} />
    {status}
    {state.optionsLoading && !confirmed ? <LoadingState label="Cargando opciones rápidas" /> : null}
    {/* With confirmed meals on screen the rows stay; the refresh sits in a slot of constant height so the list does not jump. */}
    {confirmed ? refreshSlot : null}
    {state.optionsError ? <AppText accessibilityRole="alert">{confirmed ? 'No pudimos actualizar las opciones. Estás viendo las últimas confirmadas, pueden estar desactualizadas.' : 'No pudimos actualizar las opciones.'}</AppText> : null}
    {state.options?.saved.status === 'unavailable' ? <AppText accessibilityRole="alert">No pudimos cargar estas opciones.</AppText> : null}
    {/* The retry sits next to the error it answers, not after the last row. */}
    {retryable
      ? <Button label="Reintentar opciones" onPress={() => void controller.loadOptions()} variant="quiet" /> : null}
    {pins ? <PinsNotice pins={pins} names={names} /> : null}
  </View>;
  const empty = saved ? <AppText muted style={styles.empty}>{query ? 'No encontramos comidas con esa búsqueda.' : 'Todavía no tenés comidas guardadas.'}</AppText> : null;
  const listFooter = <View style={styles.footer}>
    {suggestions && !query && state.options?.suggested.status === 'ok' && state.options.suggested.items.length > 3 ? <LinkRow kind="disclosure" expanded={more} label={more ? 'Ver menos' : 'Ver más sugerencias'} onPress={() => setMore(!more)} /> : null}
    {onSaved && saved?.length ? <LinkRow label="Editar guardadas" onPress={onSaved} disabled={locked} /> : null}
    {footer}
  </View>;

  return <><View style={styles.flex}><SectionList<Item, Section> showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} ref={list} sections={sections} keyExtractor={item => item.key} testID="quick-library"
    renderItem={({ item }) => item.type === 'pins'
      ? <ScrollView horizontal showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} contentContainerStyle={styles.tiles} testID="quick-pin-tiles">
        {item.rows.map(row => row.type === 'gone'
          ? <GoneTile key={row.key} row={row.row} onRelease={writable && pins ? () => openEditor({ unpin: row.row.id }) : null} />
          : <PinTile key={row.key} option={row.option} added={!!state.added?.[`${row.option.source.kind}:${row.option.source.id}`]} pending={state.inlineKey === `${row.option.source.kind}:${row.option.source.id}`}
            locked={locked} onReview={review} onAdd={add} pin={pinControls(row.option)} menu={rowMenu} />)}
      </ScrollView>
      : item.type === 'gone'
      ? <GoneRow row={item.row} onRelease={writable && pins ? () => openEditor({ unpin: item.row.id }) : null} />
      : <QuickRow option={item.option} added={!!state.added?.[`${item.option.source.kind}:${item.option.source.id}`]} pending={state.inlineKey === `${item.option.source.kind}:${item.option.source.id}`}
        locked={locked} onReview={review} onAdd={add} pin={item.option.source.kind === 'saved' ? pinControls(item.option) : null} menu={rowMenu} />}
    renderSectionHeader={({ section }) => section.key === 'pinned'
      ? <View style={styles.titleRow}><AppText accessibilityRole="header" variant="headline" style={styles.heading}>Fijadas</AppText>{manageButton}</View>
      : section.key === 'library'
        ? <View style={styles.library}><View style={styles.titleRow}><AppText accessibilityRole="header" variant="headline" style={styles.heading}>Todas las comidas</AppText>
          <AppText muted numeric variant="subheadline">{saved?.length ?? 0}</AppText>{pinnedIds.length || cards ? null : manageButton}</View>
          {/* A1 · no pins yet: one line that says what pins are for, instead of an empty section. */}
          {!pinnedIds.length && cards && manageButton ? <View style={styles.titleRow}><AppText muted variant="footnote" style={styles.heading}>Fijá hasta 6 para tenerlas a mano.</AppText>{manageButton}</View> : null}
          {index}</View>
        : section.key === 'results' && !query ? null
          : <View style={styles.section}><AppText accessibilityRole="header" muted numeric variant="footnote">{section.title}</AppText></View>}
    ListHeaderComponent={header} ListEmptyComponent={empty} ListFooterComponent={listFooter}
    stickySectionHeadersEnabled={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
    // Section headers and footers count as items: 30 is about one screen of rows, whatever the library size.
    initialNumToRender={30} maxToRenderPerBatch={12} windowSize={9}
    onScroll={event => { offsetY.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={32} onScrollBeginDrag={stopJump}
    onLayout={event => { viewport.current = event.nativeEvent.layout.height; }} onContentSizeChange={(_width, height) => { content.current = height; }}
    viewabilityConfig={VIEWABILITY} onViewableItemsChanged={onViewable}
    onScrollToIndexFailed={info => {
      // Below what was measured: go near it so those rows get measured; the jump then corrects from what is on screen.
      list.current?.getScrollResponder()?.scrollTo({ y: info.averageItemLength * info.index, animated: false });
    }}
    contentContainerStyle={{ paddingLeft: brandTokens.layout.screenPadding, paddingRight: brandTokens.layout.screenPadding + (side ? SIDE_INDEX_WIDTH : 0), paddingBottom: Math.max(bottomInset, 12) + brandTokens.layout.screenPadding }} />
    {side ? <SideIndex letters={alphabet} present={present} render={(letter, active) => letterButton(letter, true, active)} onJump={jump} /> : null}</View>
    {editor && pins && saved ? <QuickPinsEditor controller={pins.controller} state={pins.state} saved={saved} start={editor} onClose={() => setEditor(null)} /> : null}
  </>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, header: { gap: 12, paddingBottom: 4 }, footer: { gap: 12, paddingTop: 24 }, empty: { paddingVertical: 12 },
  // Large text: the heading keeps at least half the row and the action wraps below it, instead of breaking the words.
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, minHeight: 44 }, heading: { flexGrow: 1, flexShrink: 1, minWidth: '50%' },
  section: { paddingTop: 12, paddingBottom: 4 },
  letters: { gap: 0 }, letter: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  library: { gap: 4, paddingTop: 12 }, indexRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  compact: { gap: 4 }, goto: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  notice: { gap: 8 }, actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 }, inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tiles: { gap: 8, paddingVertical: 4 },
  tile: { width: 140, borderRadius: brandTokens.radius.inner, paddingTop: 10, paddingLeft: 12, paddingRight: 2, gap: 2, justifyContent: 'space-between' },
  tileText: { minHeight: 36, paddingRight: 10 },
  menuArea: { flex: 1, minWidth: 0 }, rowMain: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }, tileFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileDisc: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  sideLetter: { flexShrink: 1, flexGrow: 0, minHeight: 12, maxHeight: 22, flexBasis: 18, alignItems: 'center', justifyContent: 'center' },
  add: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }, addDisc: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  control: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }, flip: { transform: [{ rotate: '180deg' }] },
});
