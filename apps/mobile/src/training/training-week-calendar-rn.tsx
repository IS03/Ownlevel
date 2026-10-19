import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon, AppText, GlassSurface, InlineUnavailable, radius, spacing, useOwnlevelTheme, brandTokens } from '@/design-system';
import { WEEKDAY_LETTERS } from '@/home/home-day';

import { shiftHubMonth } from './training-hub-data';
import { HUB_WEEKDAY_NAMES, HubWeekStrip, hubMonthName } from './training-hub-dashboard';
import type { TrainingWeekCalendarProps } from './training-week-calendar.types';

export const WEEK_CALENDAR_RADIUS = 32;

/**
 * Fallback for Android, iOS before 26 and tests: same layout and behavior on the brand
 * surface (no Liquid Glass, no blur). The month/year wheel is iOS-only; here the arrows
 * change months.
 */
export function TrainingWeekCalendarRN({ expanded, marks, month, monthCells, monthStatus, onCollapse, onCollapsedHeight, onExpand, onMonth, onOpenDay, intensity, selected = null }: TrainingWeekCalendarProps) {
  const { colors } = useOwnlevelTheme();
  // History: circles painted by intensity level; 3–4 take the background color as text.
  const levelDay = (date: string, level: number | undefined, isToday: boolean, future: boolean, size: number) => <View style={[styles.day, { width: size, height: size, borderWidth: 2,
    backgroundColor: level ? intensity![level] : 'transparent', borderColor: selected === date ? colors.text : isToday ? colors.primary : 'transparent' }]}>
    <AppText numeric style={[styles.dayNumber, { color: future ? colors.textMuted : level && level >= 3 ? colors.background : colors.text }]}>{Number(date.slice(8))}</AppText>
  </View>;
  // Always six weeks tall: changing months never resizes the calendar.
  const weeks = [...monthCells, ...Array.from({ length: Math.max(0, 6 - monthCells.length) }, () => Array<null>(7).fill(null))];
  return (
    <GlassSurface style={styles.glass} testID="training-week-calendar">
      <View onLayout={event => { if (!expanded) onCollapsedHeight?.(event.nativeEvent.layout.height + 2 * spacing.md); }}>
      <Pressable accessibilityHint={expanded ? 'Cierra el calendario' : 'Abre el calendario del mes'} accessibilityLabel="Semana" accessibilityRole="button"
        accessibilityState={{ expanded }} onPress={expanded ? onCollapse : onExpand} testID="training-week-strip">
        {intensity ? <View style={styles.row}>{marks.map((mark, index) => <View key={mark.date} style={styles.stripCell}>
          <AppText muted style={styles.letter}>{WEEKDAY_LETTERS[index]}</AppText>{levelDay(mark.date, mark.level, mark.isToday, mark.future, 40)}</View>)}</View>
          : <HubWeekStrip marks={marks} />}
      </Pressable>
      </View>
      {expanded ? (
        <View style={styles.month} testID="training-month-calendar">
          <View style={[styles.header, { borderTopColor: colors.border }]}>
            <AppText accessibilityRole="header" numeric style={styles.flex} variant="headline">{hubMonthName(month, true)}</AppText>
            <Pressable accessibilityLabel="Mes anterior" accessibilityRole="button" onPress={() => onMonth(shiftHubMonth(month, -1))} style={styles.arrow}>
              <AppIcon color={colors.primary} name="chevronLeft" size={17} />
            </Pressable>
            <Pressable accessibilityLabel="Mes siguiente" accessibilityRole="button" onPress={() => onMonth(shiftHubMonth(month, 1))} style={styles.arrow}>
              <AppIcon color={colors.primary} name="chevronRight" size={17} />
            </Pressable>
          </View>
          <View style={styles.row}>
            {WEEKDAY_LETTERS.map((letter, index) => <View accessibilityElementsHidden key={index} style={styles.letterCell}><AppText muted style={styles.letter}>{letter}</AppText></View>)}
          </View>
          {weeks.map((week, rowIndex) => (
            <View key={rowIndex} style={styles.row}>
              {week.map((cell, weekday) => {
                if (!cell) return <View accessibilityElementsHidden key={`empty-${weekday}`} style={styles.cell} />;
                const label = `${HUB_WEEKDAY_NAMES[weekday]} ${cell.day}${cell.isToday ? ', hoy' : ''}${cell.future ? '' : `, ${monthStatus !== 'ready' ? 'actividad no disponible' : cell.level ? `intensidad ${cell.level} de 4` : cell.trained ? 'entrenaste' : 'sin entrenamiento'}`}`;
                const body = intensity ? levelDay(cell.date, cell.level, cell.isToday, cell.future, 40) : (
                  <>
                    <View style={[styles.day, cell.isToday && { backgroundColor: colors.primary }]}>
                      <AppText numeric style={[styles.dayNumber, { color: cell.isToday ? colors.onPrimary : cell.future ? colors.textMuted : colors.text }]}>{cell.day}</AppText>
                    </View>
                    <View style={[styles.dot, { backgroundColor: cell.trained && !cell.isToday ? colors.primary : 'transparent' }]} testID={cell.trained ? `training-month-dot-${cell.date}` : undefined} />
                  </>
                );
                return cell.future ? (
                  <View accessible accessibilityLabel={label} key={cell.date} style={styles.cell} testID={`training-month-day-${cell.date}`}>{body}</View>
                ) : (
                  <Pressable accessibilityHint="Abre este día en el historial" accessibilityLabel={label} accessibilityRole="button" key={cell.date}
                    onPress={() => onOpenDay(cell.date)} style={({ pressed }) => [styles.cell, { opacity: pressed ? 0.55 : 1 }]} testID={`training-month-day-${cell.date}`}>
                    {body}
                  </Pressable>
                );
              })}
            </View>
          ))}
          {monthStatus === 'unavailable' ? <InlineUnavailable message="No pudimos cargar los días entrenados de este mes." /> : intensity ? (
            <View accessible accessibilityLabel="Escala de intensidad: de menos a más" style={styles.legend}>
              <AppText muted variant="caption">Menos</AppText>
              {intensity.map(color => <View key={color} style={[styles.swatch, { backgroundColor: color, borderColor: colors.border }]} />)}
              <AppText muted variant="caption">Más</AppText>
            </View>) : null}
        </View>
      ) : null}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  arrow: { alignItems: 'center', height: 44, justifyContent: 'center', width: 40 },
  cell: { alignItems: 'center', flex: 1, gap: 2, minHeight: 48 },
  day: { alignItems: 'center', borderRadius: radius.full, height: 36, justifyContent: 'center', width: 36 },
  dayNumber: { ...brandTokens.typeScale.subheadline, fontWeight: '600' },
  dot: { borderRadius: radius.full, height: 4, width: 4 },
  flex: { flex: 1, minWidth: 0 },
  glass: { borderRadius: WEEK_CALENDAR_RADIUS, overflow: 'hidden', paddingHorizontal: spacing.xs, paddingVertical: spacing.md },
  header: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', marginTop: spacing.md, paddingLeft: spacing.md, paddingTop: spacing.xs },
  letter: { fontSize: brandTokens.typeScale.footnote.fontSize, lineHeight: brandTokens.typeScale.footnote.lineHeight },
  letterCell: { alignItems: 'center', flex: 1, paddingBottom: spacing.xs },
  month: { paddingHorizontal: spacing.xs },
  row: { flexDirection: 'row' },
  stripCell: { alignItems: 'center', flex: 1, gap: spacing.sm },
  legend: { alignItems: 'center', flexDirection: 'row', gap: 4, justifyContent: 'flex-end', paddingTop: spacing.xs, paddingHorizontal: spacing.sm },
  swatch: { borderRadius: 3, borderWidth: StyleSheet.hairlineWidth, height: 12, width: 12 },
});
