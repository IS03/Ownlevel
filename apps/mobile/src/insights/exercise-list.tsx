import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import type { InsightsSummary } from '@/api/performance-insights';
import { AppIcon, AppSheet, AppText, Heading, pressedStyle, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { formatPct } from './comparison-change';
import { Kicker } from './comparison-parts';
import { summarySpoken, type Lane } from './insights-model';

/**
 * «Ejercicios más claros» (bocetos/ejercicios-claros). Each exercise is one line of its last ten times (filled up, a dash same,
 * hollow down, dashed not compared) and a quiet line with what the last time was. Every mark comes from the server; a time that
 * could not be compared stays a dashed gap, never a zero.
 */
type Row = InsightsSummary['facts']['exercises'][number] | InsightsSummary['partial']['exercises'][number];
export type TimeMark = 'up' | 'same' | 'down' | 'none';
const MARKS: Record<string, TimeMark> = { u: 'up', U: 'up', s: 'same', S: 'same', d: 'down', D: 'down', n: 'none' };
const decimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

/** The marks of the last times, oldest first. An older server without `times`: only its measured results, by their sign. */
export function timesOf(row: Pick<Row, 'times' | 'recent'>): TimeMark[] {
  if (row.times !== undefined) return [...row.times].map(letter => MARKS[letter] ?? 'none');
  return (row.recent?.items ?? []).map(item => item.pct > 0 ? 'up' : item.pct < 0 ? 'down' : 'same');
}

/** The value on the right: the last time's percentage, «↑ peso» for a load step, «=» when equal, «—» when it was not compared. */
export function lastValue(row: Pick<Row, 'times' | 'recent'>): { value: string; spoken: string; mark: TimeMark } {
  const letter = row.times !== undefined ? row.times.at(-1) : row.recent?.items.length ? 'u' : undefined;
  const pct = row.recent?.items.at(-1)?.pct;
  if (letter === undefined || letter === 'n') return { value: '—', spoken: 'la última vez no se pudo comparar', mark: 'none' };
  if (letter === 'U' || letter === 'D') return letter === 'U' ? { value: '↑ peso', spoken: 'la última vez subiste el peso', mark: 'up' } : { value: '↓ peso', spoken: 'la última vez bajaste el peso', mark: 'down' };
  if (letter === 'S' || pct === undefined || pct === 0) return { value: '=', spoken: 'la última vez quedó igual', mark: 'same' };
  return { value: formatPct(pct), spoken: `la última vez ${pct > 0 ? 'subió' : 'bajó'} ${decimal.format(Math.abs(pct))} por ciento`, mark: pct > 0 ? 'up' : 'down' };
}

const range = (from: number, to: number, unit: string) => from === to ? `${decimal.format(to)} ${unit}` : `${decimal.format(from)} → ${decimal.format(to)} ${unit}`;
/** What the last time was, as recorded: «7,5 kg · 18 → 20 reps», «55 → 60 kg · 10 reps», «20 kg · 12 reps» when equal. */
export function lastText(row: Pick<Row, 'times' | 'recent' | 'lastShown'>): string | null {
  const shown = row.lastShown, letter = row.times?.at(-1);
  if (!shown || !letter || letter === 'n') return null;
  const load = shown.plates ? 'lingotes' : 'kg';
  if (letter === letter.toUpperCase()) return shown.anchor === null ? null : `${range(shown.from, shown.to, load)} · ${decimal.format(shown.anchor)} reps`;
  if (row.recent?.basis === 'time') return range(shown.from, shown.to, 's');
  if (row.recent?.basis === 'bodyweight_reps' || shown.anchor === null) return range(shown.from, shown.to, 'reps');
  return `${decimal.format(shown.anchor)} ${load} · ${range(shown.from, shown.to, 'reps')}`;
}

/** Many gaps are said once, in words: half or more of at least four times. */
export const manyUncompared = (marks: readonly TimeMark[]) => marks.length >= 4 && marks.filter(mark => mark === 'none').length * 2 >= marks.length;

export type ListEntry = { lane: Lane; row: Row; routineIds?: string[] };
export type ListGroups = { changed: ListEntry[]; same: ListEntry[]; none: ListEntry[]; single: ListEntry[] };
/** By how the last time ended: changed, equal, not compared; the ones done once go apart (they have nothing to compare with). */
export function groupsOf(entries: readonly ListEntry[]): ListGroups {
  const groups: ListGroups = { changed: [], same: [], none: [], single: [] };
  for (const entry of entries) {
    if (entry.row.exposures <= 1) { groups.single.push(entry); continue; }
    const mark = lastValue(entry.row).mark;
    groups[mark === 'up' || mark === 'down' ? 'changed' : mark].push(entry);
  }
  return groups;
}

const DOT = 8, GAP = 5;
/** The last ten times as marks. Hidden from VoiceOver: the row says the counts in words. */
export function TimeDots({ marks }: { marks: readonly TimeMark[] }) {
  const { colors } = useOwnlevelTheme();
  const width = Math.max(1, marks.length * (DOT + GAP));
  return <Svg width={width} height={12} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="exercise-dots">
    {marks.map((mark, index) => {
      const x = index * (DOT + GAP);
      if (mark === 'up') return <Circle key={index} cx={x + DOT / 2} cy={6} r={DOT / 2} fill={colors.primary} />;
      if (mark === 'down') return <Circle key={index} cx={x + DOT / 2} cy={6} r={DOT / 2 - 0.75} fill="none" stroke={colors.primary} strokeOpacity={0.6} strokeWidth={1.5} />;
      if (mark === 'same') return <Rect key={index} x={x} y={5} width={DOT} height={2} rx={1} fill={colors.textMuted} />;
      return <Rect key={index} x={x + 0.5} y={2.5} width={DOT - 1} height={DOT - 1} rx={2} fill="none" stroke={colors.textMuted} strokeWidth={1} strokeDasharray="2 2" />;
    })}
  </Svg>;
}

const tally = (marks: readonly TimeMark[]) => {
  const count = (mark: TimeMark) => marks.filter(row => row === mark).length;
  return [[count('up'), 'subió', 'subieron'], [count('same'), 'igual', 'iguales'], [count('down'), 'bajó', 'bajaron'], [count('none'), 'sin comparar', 'sin comparar']]
    .filter(([n]) => n).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`).join(', ');
};

export function ExerciseEntry({ lane, row, onPress }: ListEntry & { onPress: () => void }) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const marks = timesOf(row), last = lastValue(row), shown = lastText(row);
  const meta = [timesText(row.exposures), shown, manyUncompared(marks) ? 'muchas sin comparar' : null].filter(Boolean).join(' · ');
  const spoken = `${row.name || 'Ejercicio'}. ${meta}. ${capitalize(last.spoken)}.${marks.length ? ` Últimas ${marks.length} veces: ${tally(marks)}.` : ''} ${summarySpoken(lane, row)}`;
  return <Pressable accessibilityRole="button" accessibilityLabel={spoken} onPress={onPress} testID={`comparisons-exercise-${row.exerciseId}`}
    style={({ pressed }) => [styles.entry, { borderColor: colors.border }, pressedStyle(pressed, reduced)]}>
    <View style={styles.head}>
      <AppText variant="headline" numberOfLines={2} style={styles.flex}>{row.name || 'Ejercicio'}</AppText>
      <AppText variant="headline" numeric muted={last.mark !== 'up'} testID={`comparisons-exercise-${row.exerciseId}-value`}>{last.value}</AppText>
    </View>
    {marks.length ? <TimeDots marks={marks} /> : null}
    <AppText muted variant="footnote" numeric testID={`comparisons-exercise-${row.exerciseId}-meta`}>{meta}</AppText>
  </Pressable>;
}
const timesText = (count: number) => `${count} ${count === 1 ? 'vez' : 'veces'}`;
const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase('es-AR') + text.slice(1);

export function Legend() {
  const { colors } = useOwnlevelTheme();
  const { fontScale } = useWindowDimensions();
  const items: [TimeMark, string][] = [['up', 'subió'], ['same', 'igual'], ['down', 'bajó'], ['none', 'sin comparar']];
  return <View style={[styles.legend, fontScale > 1.3 && styles.legendStacked]} accessible accessibilityLabel="Cada punto es una vez: lleno si subió, raya si quedó igual, hueco si bajó, punteado si no se comparó." testID="exercise-legend">
    {items.map(([mark, label]) => <View key={mark} style={styles.legendItem}><TimeDots marks={[mark]} /><AppText muted variant="caption" style={{ color: colors.textMuted }}>{label}</AppText></View>)}
  </View>;
}

/** The ones done once, in one row; it opens them as a list. */
export function SingleGroup({ entries, onOpen }: { entries: readonly ListEntry[]; onOpen: (exerciseId: string) => void }) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const [open, setOpen] = useState(false);
  if (!entries.length) return null;
  const names = entries.map(entry => entry.row.name || 'Ejercicio');
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Con una sola vez, todavía sin con qué comparar: ${names.join(', ')}`} onPress={() => { haptics.selection(); setOpen(true); }} testID="exercise-single-group"
      style={({ pressed }) => [styles.single, { borderColor: colors.border }, pressedStyle(pressed, reduced)]}>
      <View style={styles.flex}>
        <AppText variant="headline">Con una sola vez</AppText>
        <AppText muted variant="footnote" numberOfLines={1}>{names.join(', ')}</AppText>
      </View>
      <AppIcon color={colors.textMuted} name="chevronRight" size={15} />
    </Pressable>
    {open ? <AppSheet onClose={() => setOpen(false)} closeLabel="Cerrar" testID="exercise-single-sheet" style={{ backgroundColor: colors.background }}>
      <View style={styles.sheet}>
        <Heading level={2}>Con una sola vez</Heading>
        <AppText muted>Todavía no tienen otra vez con qué compararse.</AppText>
        {entries.map(entry => <Pressable key={entry.row.exerciseId} accessibilityRole="button" accessibilityLabel={entry.row.name || 'Ejercicio'} onPress={() => { setOpen(false); onOpen(entry.row.exerciseId); }}
          style={({ pressed }) => [styles.single, { borderColor: colors.border }, pressedStyle(pressed, reduced)]}>
          <AppText style={styles.flex}>{entry.row.name || 'Ejercicio'}</AppText>
          <AppIcon color={colors.textMuted} name="chevronRight" size={15} />
        </Pressable>)}
      </View>
    </AppSheet> : null}
  </>;
}

/** The order as a small link («Recientes ▾»): the three orders open in a sheet, so the list starts higher. */
export function OrderMenu<T extends string>({ value, options, onChange }: { value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void }) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const [open, setOpen] = useState(false);
  const current = options.find(option => option.value === value)?.label ?? options[0]?.label ?? '';
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Ordenar ejercicios: ${current}`} hitSlop={12} onPress={() => { haptics.selection(); setOpen(true); }} testID="exercise-order"
      style={({ pressed }) => pressedStyle(pressed, reduced)}>
      <AppText variant="footnote" style={{ color: colors.primary, fontWeight: '600' }}>{current} ▾</AppText>
    </Pressable>
    {open ? <AppSheet onClose={() => setOpen(false)} closeLabel="Cerrar" testID="exercise-order-sheet" style={{ backgroundColor: colors.background }}>
      <View style={styles.sheet}>
        <Heading level={2}>Ordenar</Heading>
        {options.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected: option.value === value }} accessibilityLabel={option.label}
          onPress={() => { setOpen(false); if (option.value !== value) onChange(option.value); }} testID={`exercise-order-${option.value}`}
          style={({ pressed }) => [styles.single, { borderColor: colors.border }, pressedStyle(pressed, reduced)]}>
          <AppText style={styles.flex}>{option.label}</AppText>
          {option.value === value ? <AppIcon color={colors.primary} name="check" size={17} /> : null}
        </Pressable>)}
      </View>
    </AppSheet> : null}
  </>;
}

export function GroupTitle({ children }: { children: string }) {
  return <View style={styles.groupTitle}><Kicker>{children}</Kicker></View>;
}

const styles = StyleSheet.create({
  entry: { gap: 6, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md },
  flex: { flex: 1, flexShrink: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendStacked: { flexDirection: 'column', gap: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  single: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  sheet: { gap: spacing.sm },
  groupTitle: { paddingTop: spacing.md },
});
