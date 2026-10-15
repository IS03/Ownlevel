import { Pressable, StyleSheet, View } from 'react-native';
import { AppIcon, AppText, useOwnlevelTheme } from '@/design-system';
import { triggerHaptic } from '@/platform/haptics';
import { addDays, addMonths, type DateRange } from './progress-range';

export type CalendarMark = { range: DateRange | { start: string; end: null }; tone: 'a' | 'b' };
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const CELL = 40;

/**
 * One month, Monday first, with up to two ranges painted (A champagne, B grey). Plain RN on purpose:
 * the native date picker selects single days and cannot paint two ranges. Days after `max` are disabled.
 */
export function RangeCalendar({ month, onMonth, marks, max, onDay }: {
  month: string; onMonth: (month: string) => void; marks: CalendarMark[]; max: string; onDay: (day: string) => void;
}) {
  const { colors } = useOwnlevelTheme();
  const first = `${month.slice(0, 7)}-01`, offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const days = Number(addDays(addMonths(first, 1), -1).slice(8));
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => i - offset + 1);
  const toneOf = (d: string) => {
    for (const m of marks) {
      const end = m.range.end ?? m.range.start;
      if (d >= m.range.start && d <= end) return { tone: m.tone, start: d === m.range.start, end: d === end };
    }
    return null;
  };
  const nextMonth = addMonths(first, 1), canNext = nextMonth <= max;
  return <View style={styles.wrap} testID="progress-range-calendar">
    <View style={styles.head}>
      <AppText variant="headline">{MONTHS[Number(first.slice(5, 7)) - 1]} {first.slice(0, 4)}</AppText>
      <View style={styles.arrows}>
        <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" hitSlop={8} onPress={() => { triggerHaptic('stepperChange'); onMonth(addMonths(first, -1)); }}>
          <AppIcon name="chevronLeft" color={colors.primary} size={20} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" accessibilityState={{ disabled: !canNext }} disabled={!canNext} hitSlop={8}
          onPress={() => { triggerHaptic('stepperChange'); onMonth(nextMonth); }}>
          <AppIcon name="chevronRight" color={canNext ? colors.primary : colors.border} size={20} /></Pressable>
      </View>
    </View>
    <View style={styles.row}>{WEEKDAYS.map(d => <View key={d} style={styles.cell}><AppText muted variant="caption">{d}</AppText></View>)}</View>
    {Array.from({ length: cells.length / 7 }, (_, r) => <View key={r} style={styles.row}>{cells.slice(r * 7, r * 7 + 7).map((n, i) => {
      if (n < 1 || n > days) return <View key={i} style={styles.cell} />;
      const day = `${first.slice(0, 8)}${String(n).padStart(2, '0')}`, mark = toneOf(day), future = day > max;
      const band = mark ? (mark.tone === 'a' ? colors.brandSubtle : colors.surfaceRaised) : 'transparent';
      const dot = mark && (mark.start || mark.end) ? (mark.tone === 'a' ? colors.primary : colors.textMuted) : null;
      return <Pressable key={i} accessibilityRole="button" accessibilityLabel={`${n} de ${MONTHS[Number(first.slice(5, 7)) - 1].toLowerCase()}`}
        accessibilityState={{ disabled: future, selected: !!mark }} disabled={future} onPress={() => { triggerHaptic('stepperChange'); onDay(day); }} style={styles.cell}>
        <View style={[styles.band, { backgroundColor: band }, mark?.start && styles.bandStart, mark?.end && styles.bandEnd]} />
        <View style={[styles.dot, dot ? { backgroundColor: dot } : null]}>
          <AppText numeric variant="body" style={{ color: dot ? colors.onPrimary : future ? colors.border : colors.text, fontWeight: dot ? '700' : '500' }}>{n}</AppText>
        </View>
      </Pressable>;
    })}</View>)}
  </View>;
}
const styles = StyleSheet.create({
  wrap: { gap: 4 }, head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 6 },
  arrows: { flexDirection: 'row', gap: 22 }, row: { flexDirection: 'row' },
  cell: { flex: 1, height: CELL, alignItems: 'center', justifyContent: 'center' },
  band: { position: 'absolute', left: 0, right: 0, top: 3, bottom: 3 },
  bandStart: { left: '50%' }, bandEnd: { right: '50%' },
  dot: { width: CELL - 6, height: CELL - 6, borderRadius: (CELL - 6) / 2, alignItems: 'center', justifyContent: 'center' },
});
