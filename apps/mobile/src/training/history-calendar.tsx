import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { AppIcon, AppText, GlassSurface, brandTokens, radius, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { WEEKDAY_LETTERS } from '@/home/home-day';
import { haptics } from '@/platform/haptics';
import { buildTrainingMonth, formatTrainingMonth } from './calendar';
import { shiftDay, weekRangeLabel } from './history-model';

export type HistoryLevels = ReadonlyMap<string, 1 | 2 | 3 | 4>;
type Props = {
  today: string; selected: string | null; week: string; month: string; expanded: boolean;
  /** null while loading or unavailable: days render plain, never as "not trained". */
  levels: HistoryLevels | null; unavailable: boolean;
  onToggle: () => void; onMonth: (delta: number) => void; onSelect: (date: string) => void; onRetry: () => void;
};

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

/** Week strip that opens to the month in the same glass (HI1/HI2), painted with the brand 5-step intensity scale. */
export function HistoryCalendar({ today, selected, week, month, expanded, levels, unavailable, onToggle, onMonth, onSelect, onRetry }: Props) {
  const { colors, isDark } = useOwnlevelTheme(), reduce = useReduceMotion();
  const scale = brandTokens.intensity[isDark ? 'dark' : 'light'];
  const level = (date: string) => levels?.get(date);
  const days = Array.from({ length: 7 }, (_, index) => shiftDay(week, index));
  const letters = <View style={styles.row}>{WEEKDAY_LETTERS.map((letter, index) => <AppText key={index} muted variant="caption" style={styles.letter}>{letter}</AppText>)}</View>;
  return <Animated.View layout={reduce ? undefined : LinearTransition.duration(brandTokens.motion.duration.base)}>
    <GlassSurface style={styles.glass}>
      <View style={styles.header}>
        {expanded ? <View style={styles.monthNav}>
          <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" hitSlop={8} onPress={() => onMonth(-1)} style={styles.navButton}><AppIcon name="chevronLeft" size={17} color={colors.textMuted} /></Pressable>
          <AppText variant="headline">{formatTrainingMonth(month)}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" hitSlop={8} disabled={month >= today.slice(0, 7)} onPress={() => onMonth(1)} style={[styles.navButton, month >= today.slice(0, 7) && { opacity: 0.3 }]}><AppIcon name="chevronRight" size={17} color={colors.textMuted} /></Pressable>
        </View> : <AppText numeric variant="headline">{weekRangeLabel(week)}</AppText>}
        <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Ver semana' : 'Ver mes'} accessibilityState={{ expanded }} hitSlop={8}
          onPress={() => { haptics.selection(); onToggle(); }} style={styles.toggle}>
          <AppText variant="subheadline" style={{ color: colors.primary }}>{expanded ? 'Ver semana' : 'Ver mes'}</AppText>
          <View style={expanded ? styles.flip : null}><AppIcon name="chevronDown" size={15} color={colors.primary} /></View>
        </Pressable>
      </View>
      {letters}
      {expanded ? buildTrainingMonth(month).map((row, index) => <View key={index} style={styles.row}>
        {row.map((cell, cellIndex) => cell ? <Day key={cell.date} date={cell.date} today={today} selected={selected === cell.date} level={level(cell.date)} known={levels !== null} onSelect={onSelect} />
          : <View key={`empty-${cellIndex}`} style={styles.cell} />)}
      </View>) : <View style={styles.row}>{days.map(date => <Day key={date} date={date} today={today} selected={selected === date} level={level(date)} known={levels !== null} onSelect={onSelect} />)}</View>}
      {unavailable ? <Pressable accessibilityRole="button" onPress={onRetry} style={styles.notice}>
        <AppText muted variant="caption">No pudimos cargar la intensidad. Tocá para reintentar.</AppText>
      </Pressable> : expanded ? <View style={styles.legend} accessible accessibilityLabel="Escala de intensidad: de menos a más">
        <AppText muted variant="caption">Menos</AppText>
        {scale.map(color => <View key={color} style={[styles.swatch, { backgroundColor: color, borderColor: colors.border }]} />)}
        <AppText muted variant="caption">Más</AppText>
      </View> : null}
    </GlassSurface>
  </Animated.View>;
}

const styles = StyleSheet.create({
  glass: { borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32, paddingHorizontal: spacing.xs },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  navButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  row: { flexDirection: 'row' },
  letter: { flex: 1, textAlign: 'center' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 46 },
  circle: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingTop: spacing.xs },
  swatch: { width: 12, height: 12, borderRadius: 3, borderWidth: StyleSheet.hairlineWidth },
  flip: { transform: [{ rotate: '180deg' }] },
  notice: { paddingVertical: spacing.xs, alignItems: 'center' },
});
