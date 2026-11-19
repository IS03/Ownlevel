import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, SlideInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppSheet, AppText, Button, GlassSurface, SheetHandle, useAppSheetDismiss, spacing, brandTokens, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import { RoutineSheetButton } from '@/training/routine-sheet-button';
import { RangeCalendar, type CalendarMark } from './range-calendar';
import { PROGRESS_MAX_DAYS, PROGRESS_UNITS, addDays, addMonths, compareRange, currentProgressRange, daysBetween, isCurrentProgressRange, progressRange, progressStateForRange, shiftLabel, shiftProgressRange, shortRange, type DateRange, type ProgressRangeState } from './progress-range';
import { useProgressRange } from './progress-range-context';

type Draft = { start: string; end: string | null };
/** Tap the first day, then the last; a third tap starts again. Picking an earlier day second swaps them. */
const pick = (draft: Draft | null, day: string): Draft => !draft || draft.end ? { start: day, end: null }
  : day < draft.start ? { start: day, end: draft.start } : { start: draft.start, end: day };
const complete = (d: Draft | null): DateRange | null => d?.end ? { start: d.start, end: d.end } : null;

function Sheet({ title, subtitle, valid, onClose, onDone, children }: {
  title: string; subtitle: string; valid: boolean; onClose: () => void; onDone: () => void; children: ReactNode;
}) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion(), insets = useSafeAreaInsets();
  return <Modal transparent statusBarTranslucent visible animationType="fade" onRequestClose={onClose}>
    <View style={styles.fill}>
      <Pressable accessibilityLabel="Cerrar" onPress={onClose} style={[StyleSheet.absoluteFill, styles.scrim]} />
      <Animated.View entering={reduced ? FadeIn.duration(200) : SlideInDown.duration(300)} accessibilityViewIsModal
        style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <SheetHandle />
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <RoutineSheetButton label="Cerrar sin cambiar" icon="close" onPress={onClose} />
            <View style={styles.title}><AppText accessibilityRole="header" variant="headline">{title}</AppText>
              <AppText numeric variant="caption" style={{ color: valid ? colors.primary : colors.textMuted, textAlign: 'center' }}>{subtitle}</AppText></View>
            <RoutineSheetButton label="Listo" icon="check" accent disabled={!valid} onPress={onDone} />
          </View>
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  </Modal>;
}
function Shortcut({ label, active, onPress, disabled = false, testID }: { label: string; active?: boolean; onPress: () => void; disabled?: boolean; testID?: string }) {
  const { colors } = useOwnlevelTheme();
  // The capsule keeps its look; the touch area reaches the 44 pt minimum around it.
  return <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ selected: !!active, disabled }} disabled={disabled} onPress={() => { triggerHaptic('stepperChange'); onPress(); }} style={styles.shortcutTarget}>
    {/* The chosen one sinks into the app's own raised tone (never black); glass would wash its fill out. */}
    {active ? <View style={[styles.shortcut, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      <AppText variant="footnote" style={{ fontWeight: '700', color: colors.text }}>{label}</AppText>
    </View> : <GlassSurface interactive style={styles.shortcut}>
      <AppText variant="footnote" style={{ fontWeight: '600', color: colors.text }}>{label}</AppText>
    </GlassSurface>}
  </Pressable>;
}
const rangeSubtitle = (r: DateRange | null, today: string, partial: Draft | null) => {
  if (r) { const days = daysBetween(r.start, r.end); return days > PROGRESS_MAX_DAYS ? `Hasta ${PROGRESS_MAX_DAYS} días` : `${shortRange(r, today)} · ${days} días`; }
  return partial ? 'Elegí el último día' : 'Elegí el primer día';
};

const quickRanges = (today: string): { label: string; range: DateRange }[] => [
  { label: 'Últimos 30 días', range: { start: addDays(today, -29), end: today } },
  { label: 'Últimos 90 días', range: { start: addDays(today, -89), end: today } },
  { label: 'Último año', range: { start: addDays(addMonths(today, -12), 1), end: today } },
];

/** R3 · Personalizado: one calendar, a painted range, quick shortcuts. */
export function CustomRangeSheet({ onClose, shortPreset = false }: { onClose: () => void; shortPreset?: boolean }) {
  const { state, setState, today } = useProgressRange();
  const current = progressRange(state, today);
  const [draft, setDraft] = useState<Draft | null>(current);
  const [month, setMonth] = useState(current.end);
  const range = complete(draft), valid = !!range && daysBetween(range.start, range.end) <= PROGRESS_MAX_DAYS;
  const apply = (r: DateRange) => { setState({ ...state, unit: 'custom', custom: r, anchor: r.end }); onClose(); };
  // Step the unit you are on (the previous week, month, 3 months…) without a stepper on screen.
  const prev = shiftProgressRange(state, -1, today), next = shiftProgressRange(state, 1, today);
  const move = (to: ProgressRangeState) => { setState(to); onClose(); };
  return <Sheet title="Elegir período" subtitle={rangeSubtitle(range, today, draft)} valid={valid} onClose={onClose} onDone={() => { if (range && valid) apply(range); }}>
    {/* One row of shortcuts that scrolls sideways, like the period bar: stepping the unit first, then the quick ranges. */}
    <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} style={styles.shortcutRow} contentContainerStyle={styles.shortcutScroll}>
      <View style={styles.shortcutGroup} testID="progress-period-shift">
        {prev ? <Shortcut label={shiftLabel(state.unit, -1)} onPress={() => move(prev)} /> : null}
        {next ? <Shortcut label={shiftLabel(state.unit, 1)} onPress={() => move(next)} /> : null}
        {!isCurrentProgressRange(state, today) ? <Shortcut label="Volver a hoy" onPress={() => move(currentProgressRange(state, today))} /> : null}
      </View>
      {(shortPreset ? [{ label: 'Últimos 7 días', range: { start: addDays(today, -6), end: today } }, { label: 'Este mes', range: { start: `${today.slice(0, 7)}-01`, end: today } }, ...quickRanges(today)] : quickRanges(today)).map(q => <Shortcut key={q.label} label={q.label} onPress={() => apply(q.range)}
        active={current.start === q.range.start && current.end === q.range.end} />)}
    </ScrollView>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortcutScroll} accessibilityLabel="Períodos de calendario">
      {PROGRESS_UNITS.filter(o => o.value !== 'custom').map(o => <View key={o.value}>
        <Shortcut testID={`progress-unit-${o.value}`} label={o.label} active={state.unit === o.value} onPress={() => { setState({...state, unit:o.value, anchor:today, custom:null}); onClose(); }} />
      </View>)}
    </ScrollView>
    <RangeCalendar month={month} onMonth={setMonth} max={today} onDay={d => setDraft(pick(draft, d))} marks={draft ? [{ range: draft, tone: 'a' }] : []} />
  </Sheet>;
}

/** Compact A/B editor. Drafts never escape before the sheet has finished leaving. */
export function CompareSheet({ onClose, proposal = null, onApplied }: {
  onClose: () => void; proposal?: DateRange | null; onApplied?: () => void;
}) {
  const { colors } = useOwnlevelTheme();
  return <AppSheet testID="progress-compare-sheet" closeLabel="Cancelar comparación" onClose={onClose}
    style={{ maxHeight: '92%', backgroundColor: colors.background }}>
    <CompareEditor proposal={proposal} onApplied={onApplied} />
  </AppSheet>;
}

function CompareEditor({ proposal, onApplied }: { proposal: DateRange | null; onApplied?: () => void }) {
  const { state: active, setState, today } = useProgressRange();
  const dismiss = useAppSheetDismiss(), reduced = useReduceMotion(), insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const [state] = useState(() => (proposal && progressStateForRange(proposal.start, proposal.end, active, today)) || active);
  const a = progressRange(state, today);
  const [draftA, setDraftA] = useState<Draft>(a);
  const [draftB, setDraftB] = useState<Draft>(() => compareRange(state, today) ?? compareRange({ ...state, compare: { kind: 'previous' } }, today)!);
  const [kind, setKind] = useState<'previous' | 'last_year' | 'custom'>(state.compare.kind === 'none' ? 'previous' : state.compare.kind);
  const [editing, setEditing] = useState<'a' | 'b' | null>(null);
  const [month, setMonth] = useState(draftB.end ?? draftB.start);
  const rangeA = complete(draftA), rangeB = complete(draftB);
  const fits = (r: DateRange | null) => !!r && r.start <= r.end && r.end <= today && daysBetween(r.start, r.end) <= PROGRESS_MAX_DAYS;
  const valid = fits(rangeA) && fits(rangeB);
  const baseFor = (r: DateRange): ProgressRangeState => r.start === a.start && r.end === a.end ? state
    : { ...state, unit: 'custom', custom: r, anchor: r.end };
  const quick = (k: 'previous' | 'last_year') => {
    if (!rangeA) return;
    const next = compareRange({ ...baseFor(rangeA), compare: { kind: k } }, today)!;
    setKind(k); setDraftB(next); setMonth(next.end); setEditing(null);
  };
  const day = (d: string) => {
    if (editing === 'a') {
      const next = pick(draftA, d); setDraftA(next);
      const r = complete(next);
      if (r && kind !== 'custom') setDraftB(compareRange({ ...baseFor(r), compare: { kind } }, today)!);
    } else { setKind('custom'); setDraftB(pick(draftB, d)); }
  };
  const done = () => {
    if (!rangeA || !rangeB || !valid) return;
    const base = baseFor(rangeA);
    const expected = kind === 'custom' ? null : compareRange({ ...base, compare: { kind } }, today);
    const next: ProgressRangeState = { ...base, compare: expected?.start === rangeB.start && expected?.end === rangeB.end && kind !== 'custom'
      ? { kind } : { kind: 'custom', range: rangeB } };
    triggerHaptic('stepperChange');
    dismiss(() => { setState(next); onApplied?.(); });
  };
  const length = (r: DateRange | null) => r ? `${daysBetween(r.start, r.end)} ${daysBetween(r.start, r.end) === 1 ? 'día' : 'días'}` : null;
  const selectedDraft = editing === 'a' ? draftA : draftB;
  const marks: CalendarMark[] = editing ? [{ range: selectedDraft, tone: editing }] : [];
  return <>
    <View style={[styles.header, { paddingHorizontal: spacing.md, paddingVertical: spacing.sm }]}>
      <View style={styles.title}><AppText accessibilityRole="header" variant="headline">Comparar períodos</AppText></View>
      <RoutineSheetButton label="Cerrar sin cambiar" icon="close" onPress={() => dismiss()} />
    </View>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={[styles.ab, fontScale > 1.3 && styles.abStacked]} testID="compare-ab">{(['a', 'b'] as const).map(k => {
        const r = k === 'a' ? rangeA : rangeB, on = editing === k;
        return <Pressable key={k} accessibilityRole="button" accessibilityState={{ expanded: on }} style={fontScale > 1.3 ? undefined : styles.abItem} testID={`compare-cell-${k}`}
          accessibilityLabel={`${k === 'a' ? 'Período elegido' : 'Referencia'}: ${r ? `${shortRange(r, today)}, ${length(r)}` : 'elegí el último día'}`}
          onPress={() => { triggerHaptic('stepperChange'); setEditing(on ? null : k); setMonth((k === 'a' ? draftA : draftB).end ?? (k === 'a' ? draftA : draftB).start); }}>
          <ABCell label={k === 'a' ? 'Período elegido' : 'Referencia'} value={r ? shortRange(r, today) : 'Elegí el último día'} length={length(r)} on={on} />
        </Pressable>;
      })}</View>
      <View style={styles.shortcuts}>
        <Shortcut label="Período anterior" active={kind === 'previous'} disabled={!rangeA} onPress={() => quick('previous')} />
        <Shortcut label="Año pasado" active={kind === 'last_year'} disabled={!rangeA} onPress={() => quick('last_year')} />
        <Shortcut label="Personalizado" active={kind === 'custom'} onPress={() => { setKind('custom'); setEditing('b'); setMonth(draftB.end ?? draftB.start); }} />
      </View>
      {editing ? <Animated.View entering={FadeIn.duration(brandTokens.motion.duration.fast)} layout={reduced ? undefined : LinearTransition.duration(brandTokens.motion.duration.fast)} style={{ gap: spacing.sm }}>
        <View style={styles.header}><AppText variant="headline" style={{ flex: 1 }}>{editing === 'a' ? 'Período elegido' : 'Referencia'}</AppText>
          <RoutineSheetButton label="Ocultar calendario" icon="close" onPress={() => setEditing(null)} /></View>
        <RangeCalendar month={month} onMonth={setMonth} max={today} marks={marks} onDay={day} />
        <AppText muted variant="footnote" accessibilityLiveRegion="polite">{selectedDraft.end ? 'Tocá el primer día y el último.' : 'Ahora elegí el último día.'}</AppText>
      </Animated.View> : null}
      {rangeA && rangeB && daysBetween(rangeA.start, rangeA.end) !== daysBetween(rangeB.start, rangeB.end) ? <AppText muted variant="footnote">Distinta duración: los totales no son equivalentes.</AppText> : null}
      {rangeA && rangeB && rangeA.start <= rangeB.end && rangeB.start <= rangeA.end ? <AppText muted variant="footnote">Los períodos se superponen.</AppText> : null}
      {!valid && rangeA && rangeB ? <AppText muted variant="footnote">Elegí hasta {PROGRESS_MAX_DAYS} días por período, sin fechas futuras.</AppText> : null}
    </ScrollView>
    <View style={{ padding: spacing.md, paddingBottom: Math.max(insets.bottom, spacing.md), gap: spacing.xs }}>
      <Button testID="compare-apply" label="Ver comparación" disabled={!valid} onPress={done} />
      {active.compare.kind !== 'none' ? <Button variant="quiet" label="Sin comparar" onPress={() => dismiss(() => setState({ ...active, compare: { kind: 'none' } }))} /> : null}
    </View>
  </>;
}
function ABCell({ label, value, length, on }: { label: string; value: string; length: string | null; on: boolean }) {
  const { colors } = useOwnlevelTheme();
  return <View style={[styles.abCell, { backgroundColor: on ? colors.brandSubtle : 'transparent', borderColor: on ? 'transparent' : colors.border }]}>
    <AppText variant="caption" style={{ color: on ? colors.primary : colors.textMuted, fontWeight: '600' }}>{label}</AppText>
    <AppText numeric variant="headline">{value}</AppText>
    {length ? <AppText muted numeric variant="footnote">{length}</AppText> : null}
  </View>;
}
const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' }, scrim: { backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: brandTokens.radius.sheet, borderTopRightRadius: brandTokens.radius.sheet, paddingTop: 8 },
  content: { padding: 16, gap: 14 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12 }, title: { flex: 1, alignItems: 'center', gap: 2 },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shortcutRow: { marginHorizontal: -16, flexGrow: 0 }, shortcutScroll: { paddingHorizontal: 16, gap: 8 }, shortcutGroup: { flexDirection: 'row', gap: 8 }, shortcut: { minHeight: 34, paddingHorizontal: 12, borderRadius: brandTokens.radius.full, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent', justifyContent: 'center' },
  ab: { flexDirection: 'row', gap: 8 }, abStacked: { flexDirection: 'column' }, abItem: { flex: 1 },
  shortcutTarget: { minHeight: brandTokens.layout.minTouch, justifyContent: 'center' },
  abCell: { borderRadius: brandTokens.radius.inner, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
});
