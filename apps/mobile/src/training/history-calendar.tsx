import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { AppIcon, AppText, GlassSurface, brandTokens, radius, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { WEEKDAY_LETTERS } from '@/home/home-day';
import { haptics } from '@/platform/haptics';
import { buildTrainingMonth, formatTrainingMonth } from './calendar';
import { addMonths, shiftDay } from './history-model';
import { HAS_MONTH_WHEEL, HistoryMonthWheel } from './history-month-wheel';

export type HistoryLevels = ReadonlyMap<string, 1 | 2 | 3 | 4>;
type Props = {
  today: string; selected: string | null; week: string; month: string; expanded: boolean;
  /** null while loading or unavailable: days render plain, never as "not trained". */
  levels: HistoryLevels | null; unavailable: boolean;
  onToggle: () => void; onMonth: (month: string) => void; onSelect: (date: string) => void; onRetry: () => void;
};
const CELL = 46;
/** "Lunes 12 – domingo 18". */
function weekLabel(monday: string) {
  return `Lunes ${Number(monday.slice(8))} – domingo ${Number(shiftDay(monday, 6).slice(8))}`;
}

function Day({ date, today, selected, level, known, onSelect }: { date: string; today: string; selected: boolean; level: number | undefined; known: boolean; onSelect: (date: string) => void }) {
  const { colors, isDark } = useOwnlevelTheme();
  const scale = brandTokens.intensity[isDark ? 'dark' : 'light'];
  const future = date > today, isToday = date === today;
  const fill = level ? scale[level] : 'transparent';
  // Levels 3–4 are the strong end of the scale in both themes: the background color reads on them.
  const text = future ? colors.textMuted : level && level >= 3 ? colors.background : colors.text;
  const ring = selected ? colors.text : isToday ? colors.primary : 'transparent';
  const label = `${Number(date.slice(8))}${isToday ? ', hoy' : ''}${level ? `, intensidad ${level} de 4` : future || !known ? '' : ', sin entrenar'}`;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled: future }} disabled={future}
    onPress={() => { haptics.selection(); onSelect(date); }} style={styles.cell} testID={`history-day-${date}`}>
    <View style={[styles.circle, { backgroundColor: fill, borderColor: ring }]}>
      <AppText numeric variant="subheadline" style={{ color: text, fontWeight: isToday || selected ? '700' : '500' }}>{Number(date.slice(8))}</AppText>
    </View>
  </Pressable>;
}

/**
 * Week strip that opens to the month in the same glass (HI1/HI2), painted with the brand 5-step
 * intensity scale. Tapping the card (anywhere but a day) opens or closes it; the glass grows with
 * a layout animation and no fades (fades inside Liquid Glass render blurred). The month title
 * opens the native month/year wheels.
 */
export function HistoryCalendar({ today, selected, week, month, expanded, levels, unavailable, onToggle, onMonth, onSelect, onRetry }: Props) {
  const { colors, isDark } = useOwnlevelTheme(), reduce = useReduceMotion();
  const [picking, setPicking] = useState(false);
  const scale = brandTokens.intensity[isDark ? 'dark' : 'light'];
  const level = (date: string) => levels?.get(date);
  const maxMonth = today.slice(0, 7), atMax = month >= maxMonth;
  const year = Number(today.slice(0, 4)), years = Array.from({ length: 6 }, (_, index) => year - 5 + index);
  const toggle = () => { haptics.selection(); setPicking(false); onToggle(); };
  const rows = buildTrainingMonth(month);
  const layout = reduce ? undefined : LinearTransition.duration(brandTokens.motion.duration.base);
  const day = (date: string) => <Day key={date} date={date} today={today} selected={selected === date} level={level(date)} known={levels !== null} onSelect={onSelect} />;
  return <Animated.View layout={layout} style={styles.clip}>
    <GlassSurface style={styles.glass}>
      <View style={styles.card} testID="history-calendar">
        {/* The header and the letters row open/close the calendar; days and the wheel keep their own touches. */}
        <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Ver semana' : 'Ver mes'} accessibilityState={{ expanded }} onPress={toggle} style={styles.header}>
          {expanded ? <View style={styles.monthNav}>
            <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" hitSlop={8} onPress={() => { setPicking(false); onMonth(addMonths(month, -1)); }} style={styles.navButton}><AppIcon name="chevronLeft" size={17} color={colors.primary} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`${formatTrainingMonth(month)}, elegir mes`} disabled={!HAS_MONTH_WHEEL} hitSlop={6}
              onPress={() => { haptics.selection(); setPicking(value => !value); }} style={styles.monthTitle}>
              <AppText variant="headline" style={picking ? { color: colors.primary } : null}>{formatTrainingMonth(month)}</AppText>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" hitSlop={8} disabled={atMax} onPress={() => { setPicking(false); onMonth(addMonths(month, 1)); }} style={[styles.navButton, atMax && { opacity: 0.3 }]}><AppIcon name="chevronRight" size={17} color={colors.primary} /></Pressable>
          </View> : <AppText numeric variant="headline">{weekLabel(week)}</AppText>}
          <View style={expanded ? styles.flip : null}><AppIcon name="chevronDown" size={17} color={colors.textMuted} /></View>
        </Pressable>
        {picking && expanded ? <HistoryMonthWheel month={month} maxMonth={maxMonth} years={years} height={rows.length * CELL + 20} onMonth={onMonth} /> : <>
          <Pressable accessible={false} onPress={toggle} style={styles.row}>{WEEKDAY_LETTERS.map((letter, index) => <AppText key={index} muted variant="caption" style={styles.letter}>{letter}</AppText>)}</Pressable>
          {expanded ? rows.map((row, index) => <View key={index} style={styles.row}>
            {row.map((cell, cellIndex) => cell ? day(cell.date) : <View key={`empty-${cellIndex}`} style={styles.cell} />)}
          </View>) : <View style={styles.row}>{Array.from({ length: 7 }, (_, index) => day(shiftDay(week, index)))}</View>}
        </>}
        {unavailable ? <Pressable accessibilityRole="button" onPress={onRetry} style={styles.notice}>
          <AppText muted variant="caption">No pudimos cargar la intensidad. Tocá para reintentar.</AppText>
        </Pressable> : expanded && !picking ? <View style={styles.legend} accessible accessibilityLabel="Escala de intensidad: de menos a más">
          <AppText muted variant="caption">Menos</AppText>
          {scale.map(color => <View key={color} style={[styles.swatch, { backgroundColor: color, borderColor: colors.border }]} />)}
          <AppText muted variant="caption">Más</AppText>
        </View> : null}
      </View>
    </GlassSurface>
  </Animated.View>;
}

const styles = StyleSheet.create({
  clip: { borderRadius: radius.card, overflow: 'hidden' },
  glass: { borderRadius: radius.card },
  card: { padding: spacing.md, gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32, paddingHorizontal: spacing.xs },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  monthTitle: { minHeight: 32, justifyContent: 'center', paddingHorizontal: spacing.xs },
  navButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row' },
  letter: { flex: 1, textAlign: 'center' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', height: CELL },
  circle: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingTop: spacing.xs },
  swatch: { width: 12, height: 12, borderRadius: 3, borderWidth: StyleSheet.hairlineWidth },
  flip: { transform: [{ rotate: '180deg' }] },
  notice: { paddingVertical: spacing.xs, alignItems: 'center' },
});
