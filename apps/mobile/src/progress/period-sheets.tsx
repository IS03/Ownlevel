import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, GlassSurface, SheetHandle, brandTokens, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import { RoutineSheetButton } from '@/training/routine-sheet-button';
import { RangeCalendar, type CalendarMark } from './range-calendar';
import { PROGRESS_MAX_DAYS, addDays, addMonths, compareRange, currentProgressRange, daysBetween, isCurrentProgressRange, progressRange, shiftLabel, shiftProgressRange, shortRange, type DateRange, type ProgressRangeState } from './progress-range';
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
        <ScrollView contentContainerStyle={styles.content}>
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
function Shortcut({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  const { colors } = useOwnlevelTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: !!active }} onPress={() => { triggerHaptic('stepperChange'); onPress(); }}>
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
export function CustomRangeSheet({ onClose }: { onClose: () => void }) {
  const { state, setState, today } = useProgressRange();
  const current = progressRange(state, today);
  const [draft, setDraft] = useState<Draft | null>(state.unit === 'custom' ? current : null);
  const [month, setMonth] = useState(current.end);
  const range = complete(draft), valid = !!range && daysBetween(range.start, range.end) <= PROGRESS_MAX_DAYS;
  const apply = (r: DateRange) => { setState({ ...state, unit: 'custom', custom: r, anchor: r.end }); onClose(); };
  // Step the unit you are on (the previous week, month, 3 months…) without a stepper on screen.
  const prev = shiftProgressRange(state, -1, today), next = shiftProgressRange(state, 1, today);
  const move = (to: ProgressRangeState) => { setState(to); onClose(); };
  return <Sheet title="Elegir período" subtitle={rangeSubtitle(range, today, draft)} valid={valid} onClose={onClose} onDone={() => { if (range && valid) apply(range); }}>
    <View style={styles.shortcuts} testID="progress-period-shift">
      {prev ? <Shortcut label={shiftLabel(state.unit, -1)} onPress={() => move(prev)} /> : null}
      {next ? <Shortcut label={shiftLabel(state.unit, 1)} onPress={() => move(next)} /> : null}
      {!isCurrentProgressRange(state, today) ? <Shortcut label="Volver a hoy" onPress={() => move(currentProgressRange(state, today))} /> : null}
    </View>
    <View style={styles.shortcuts}>
      {quickRanges(today).map(q => <Shortcut key={q.label} label={q.label} onPress={() => apply(q.range)}
        active={state.unit === 'custom' && current.start === q.range.start && current.end === q.range.end} />)}
    </View>
    <RangeCalendar month={month} onMonth={setMonth} max={today} onDay={d => setDraft(pick(draft, d))} marks={draft ? [{ range: draft, tone: 'a' }] : []} />
  </Sheet>;
}

/** R4 · Comparar: one calendar for both periods. A = what you look at (champagne), B = what you compare with (grey). */
export function CompareSheet({ onClose }: { onClose: () => void }) {
  const { state, setState, today } = useProgressRange();
  const [editing, setEditing] = useState<'a' | 'b'>('b');
  const a = progressRange(state, today), b = compareRange(state, today);
  const [draftA, setDraftA] = useState<Draft | null>(a);
  const [draftB, setDraftB] = useState<Draft | null>(b ?? compareRange({ ...state, compare: { kind: 'previous' } }, today));
  const [kind, setKind] = useState(state.compare.kind === 'none' ? 'previous' : state.compare.kind);
  const [month, setMonth] = useState((b ?? a).end);
  const rangeA = complete(draftA), rangeB = complete(draftB);
  const fits = (r: DateRange | null) => !!r && daysBetween(r.start, r.end) <= PROGRESS_MAX_DAYS;
  const valid = fits(rangeA) && fits(rangeB);
  const quick = (k: 'previous' | 'last_year') => {
    const next = compareRange({ ...state, compare: { kind: k } }, today)!;
    setKind(k); setDraftB(next); setEditing('b'); setMonth(next.end);
  };
  const done = () => {
    if (!rangeA || !rangeB || !valid) return;
    const aChanged = rangeA.start !== a.start || rangeA.end !== a.end;
    const base = aChanged ? { ...state, unit: 'custom' as const, custom: rangeA, anchor: rangeA.end } : state;
    const bChanged = kind === 'custom' || compareRange({ ...base, compare: { kind } }, today)?.start !== rangeB.start;
    setState({ ...base, compare: bChanged ? { kind: 'custom', range: rangeB } : { kind } });
    triggerHaptic('stepperChange'); onClose();
  };
  const marks: CalendarMark[] = [...(draftB ? [{ range: draftB, tone: 'b' as const }] : []), ...(draftA ? [{ range: draftA, tone: 'a' as const }] : [])];
  return <Sheet title="Comparar" subtitle={editing === 'a' ? rangeSubtitle(rangeA, today, draftA) : rangeSubtitle(rangeB, today, draftB)} valid={valid} onClose={onClose} onDone={done}>
    <View style={styles.ab}>{(['a', 'b'] as const).map(k => {
      const r = k === 'a' ? rangeA : rangeB, on = editing === k;
      return <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: on }} style={styles.abItem}
        accessibilityLabel={`${k === 'a' ? 'Tu período' : 'Comparar con'}: ${r ? shortRange(r, today) : 'sin elegir'}`}
        onPress={() => { setEditing(k); if (r) setMonth(r.end); }}>
        <ABCell label={k === 'a' ? 'A · Tu período' : 'B · Comparar con'} value={r ? shortRange(r, today) : '—'} on={on} />
      </Pressable>;
    })}</View>
    <View style={styles.shortcuts}>
      <Shortcut label="Período anterior" active={editing === 'b' && kind === 'previous'} onPress={() => quick('previous')} />
      <Shortcut label="Año pasado" active={editing === 'b' && kind === 'last_year'} onPress={() => quick('last_year')} />
      <Shortcut label="Sin comparar" onPress={() => { setState({ ...state, compare: { kind: 'none' } }); onClose(); }} />
    </View>
    <RangeCalendar month={month} onMonth={setMonth} max={today} marks={marks}
      onDay={d => { if (editing === 'a') setDraftA(pick(draftA, d)); else { setKind('custom'); setDraftB(pick(draftB, d)); } }} />
    <AppText muted variant="caption">{editing === 'a' ? 'Marcás tu período (champagne).' : 'Marcás el período para comparar (gris).'} Tocá el primer día y el último.</AppText>
  </Sheet>;
}
function ABCell({ label, value, on }: { label: string; value: string; on: boolean }) {
  const { colors } = useOwnlevelTheme();
  return <View style={[styles.abCell, { backgroundColor: on ? colors.brandSubtle : 'transparent', borderColor: on ? 'transparent' : colors.border }]}>
    <AppText variant="caption" style={{ color: on ? colors.primary : colors.textMuted, fontWeight: '600' }}>{label}</AppText>
    <AppText numeric variant="headline">{value}</AppText>
  </View>;
}
const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' }, scrim: { backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: brandTokens.radius.sheet, borderTopRightRadius: brandTokens.radius.sheet, paddingTop: 8 },
  content: { padding: 16, gap: 14 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12 }, title: { flex: 1, alignItems: 'center', gap: 2 },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, shortcut: { minHeight: 34, paddingHorizontal: 12, borderRadius: brandTokens.radius.full, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent', justifyContent: 'center' },
  ab: { flexDirection: 'row', gap: 8 }, abItem: { flex: 1 },
  abCell: { borderRadius: brandTokens.radius.inner, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
});
