import { useContext, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useMobileApi } from '@/api';
import type { NutritionReport } from '@/api/nutrition-report';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { AppIcon, AppSheet, AppText, Button, brandTokens, useAppSheetDismiss, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { displayNutritionDate, inputNutritionDate, number, parseInputNutritionDate, shiftNutritionDate } from './day-format';
import { nutritionMonth, reportRings } from './day-home-model';
import { NutritionCalorieRing } from './day-rings';
import { MonthWheel } from './month-wheel';
import { readingLabel } from './day-summary';
import { prefetchNutritionReport, useNutritionReportResource } from './report-resource';

/** The report range a calendar month reads: the month, cut at today. */
export function monthReportQuery(month: string, today: string) {
  const end = nutritionMonth(month).end;
  return { period: 'custom' as const, from: month, to: end < today ? end : today };
}
const shiftMonth = (month: string, delta: number) => {
  const value = new Date(`${month}T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + delta);
  return value.toISOString().slice(0, 10);
};
/** Warms the month the calendar opens on, so its rings and average show at once. */
export function prefetchCalendarMonth(client: Parameters<typeof prefetchNutritionReport>[0], date: string, today: string) {
  const month = `${date.slice(0, 7)}-01`;
  if (month <= today) prefetchNutritionReport(client, monthReportQuery(month, today));
}
const monthName = (month: string, style: 'long' | 'short' = 'long') => new Intl.DateTimeFormat('es-AR', { month: style, year: 'numeric', timeZone: 'UTC' })
  .format(new Date(`${month}T12:00:00Z`)).replace(/^./u, c => c.toLocaleUpperCase('es-AR'));

/**
 * Month calendar in an app sheet: drag it down or tap outside to close. The month title opens a month/year
 * picker for far dates; every month keeps six rows so the sheet never changes height.
 */
/** Just the month (compact): the averages and the report live in Progreso. */
export function NutritionMonthSheet({ date, today, onClose, onSelect }: {
  date: string; today: string; onClose: () => void; onSelect: (date: string) => void;
}) {
  // Context (not the hook): it also opens from places rendered without a provider (tests, nested sheets).
  const { colors } = useOwnlevelTheme(), bottom = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  // While the month/year wheels are up, only the handle drags the sheet: a drag near a wheel turns the wheel.
  const [picking, setPicking] = useState(false);
  return <AppSheet onClose={onClose} closeLabel="Cerrar calendario" dragFromContent={!picking} testID="nutrition-month-sheet"
    style={{ backgroundColor: colors.background, paddingBottom: Math.max(bottom, 16) }}>
    <MonthBody date={date} today={today} onSelect={onSelect} picking={picking} setPicking={setPicking} />
  </AppSheet>;
}
function MonthBody({ date, today, onSelect, picking, setPicking }: {
  date: string; today: string; onSelect: (date: string) => void;
  picking: boolean; setPicking: (next: boolean | ((v: boolean) => boolean)) => void;
}) {
  const { colors } = useOwnlevelTheme();
  const dismiss = useAppSheetDismiss();
  const [month, setMonth] = useState(`${date.slice(0, 7)}-01`);
  // The sheet keeps its tallest height (the day grid) when the month picker replaces it.
  const [height, setHeight] = useState(0);
  const { client } = useMobileApi();
  const select = (selected: string) => dismiss(() => onSelect(selected));
  const move = (delta: number) => {
    const next = shiftMonth(month, delta);
    if (parseInputNutritionDate(inputNutritionDate(next))) setMonth(next);
  };
  // The month before is the likely next step: read it while this one is on screen.
  useEffect(() => {
    const previous = shiftMonth(month, -1);
    if (parseInputNutritionDate(inputNutritionDate(previous))) prefetchNutritionReport(client, monthReportQuery(previous, today));
  }, [client, month, today]);
  return <View style={styles.content}>
    <View style={styles.monthHeader}>
      {picking ? <View style={styles.arrow} /> : <Pressable accessibilityLabel="Mes anterior" accessibilityRole="button" onPress={() => move(-1)} style={styles.arrow}><AppIcon name="chevronLeft" size={20} color={colors.primary} /></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel={`${monthName(month)}. ${picking ? 'Volver a los días' : 'Elegir mes y año'}`} onPress={() => setPicking(v => !v)} style={styles.title} testID="nutrition-month-title">
        <AppText accessibilityRole="header" variant="headline" style={picking && { color: colors.primary }}>{monthName(month)}</AppText>
        <AppIcon name={picking ? 'chevronDown' : 'chevronRight'} size={15} color={picking ? colors.primary : colors.textMuted} />
      </Pressable>
      {picking ? <View style={styles.arrow} /> : <Pressable accessibilityLabel="Mes siguiente" accessibilityRole="button" onPress={() => move(1)} style={styles.arrow}><AppIcon name="chevronRight" size={20} color={colors.primary} /></Pressable>}
    </View>
    <View style={[styles.body, { minHeight: height }]} onLayout={event => { const next = event.nativeEvent.layout.height; if (next > height) setHeight(next); }}>
      {picking ? <MonthWheel month={month} today={today} onChange={setMonth} onDone={next => { setMonth(next); setPicking(false); }} />
        : month > today ? <MonthGrid month={month} selected={date} today={today} onSelect={select} />
        : <ReadMonth key={month} month={month} selected={date} today={today} onSelect={select} />}
    </View>
  </View>;
}
function ReadMonth({ month, today, ...props }: { month: string; today: string; selected: string; onSelect: (date: string) => void }) {
  const { client } = useMobileApi();
  const { state, refresh } = useNutritionReportResource(client, monthReportQuery(month, today));
  const report = state.status === 'ready' ? state.current.data : state.status === 'unavailable' ? state.previous?.data : undefined;
  const failed = state.status !== 'ready' && state.status !== 'loading';
  // A month read just now fades in whole (numbers, rings and average together) instead of rings popping in after
  // the numbers. A month already read (cache) shows at once.
  const reduced = useReduceMotion();
  const settled = state.status !== 'loading';
  const [waited, setWaited] = useState(false);
  const shown = useSharedValue(settled ? 1 : 0);
  useEffect(() => {
    if (settled || waited) { shown.set(withTiming(1, { duration: reduced ? brandTokens.motion.duration.fast : brandTokens.motion.duration.base })); return; }
    // A slow read never leaves the month blank: after a moment the days show, and the rings join when they arrive.
    const timer = setTimeout(() => setWaited(true), 1200);
    return () => clearTimeout(timer);
  }, [reduced, settled, shown, waited]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));
  return <Animated.View style={[styles.body, fade]}>
    <MonthGrid {...props} month={month} today={today} report={report} loading={state.status === 'loading'} unavailable={failed} />
    {failed ? <View style={styles.manual}><AppText accessibilityRole="alert">{report ? 'No pudimos actualizar este mes. Mostramos la última lectura.' : 'No pudimos cargar este mes.'}</AppText>
      <Button variant="quiet" label="Reintentar mes" onPress={() => void refresh()} /></View> : null}
  </Animated.View>;
}
function MonthGrid({ month, selected, today, onSelect, report, loading, unavailable }: {
  month: string; selected: string; today: string; onSelect: (date: string) => void; report?: NutritionReport; loading?: boolean; unavailable?: boolean;
}) {
  const { colors } = useOwnlevelTheme();
  const { days, offset } = nutritionMonth(month);
  // Six rows for every month: the sheet keeps one height from month to month.
  const cells = Array.from({ length: 42 }, (_, i) => i >= offset && i < offset + days ? shiftNutritionDate(month, i - offset)! : null);
  const rows = new Map(report?.days.map(row => [row.date, row]));
  return <View testID="nutrition-month" style={styles.calendar}>
    <View style={styles.week}>{['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day, i) => <AppText key={i} muted variant="caption" style={styles.weekday}>{day}</AppText>)}</View>
    {Array.from({ length: cells.length / 7 }, (_, week) => <View key={week} style={styles.week}>
      {cells.slice(week * 7, week * 7 + 7).map((day, i) => {
        if (!day) return <View key={i} style={styles.cell} />;
        const future = day > today, row = rows.get(day), reading = reportRings(row).calories;
        const status = future ? 'Fecha futura' : unavailable ? 'No disponible' : loading ? 'Cargando' : !row?.hasNutrition ? 'Sin día registrado' : `Calorías ${readingLabel(reading, 'kcal')}${reading.target === null ? ', sin objetivo' : ` de ${number(reading.target)} kcal`}`;
        return <Pressable accessibilityRole="button" accessibilityState={{ disabled: future, selected: day === selected }} accessibilityLabel={`${displayNutritionDate(day)}. ${status}`}
          key={day} disabled={future} onPress={() => onSelect(day)} style={[styles.cell, { opacity: future ? 0.4 : 1 }]} testID={`nutrition-month-${day}`}>
          {row?.hasNutrition ? <View style={styles.cellRing}><NutritionCalorieRing reading={reading} testID={`nutrition-month-ring-${day}`} /></View> : null}
          <AppText numeric variant="footnote" style={{ fontWeight: day === selected ? '700' : '400' }}>{Number(day.slice(8))}</AppText>
          {day === selected ? <View style={[styles.selection, { backgroundColor: colors.primary }]} /> : null}
        </Pressable>;
      })}
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 16 },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 8 },
  arrow: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  calendar: { gap: 8 },
  week: { flexDirection: 'row' }, weekday: { flex: 1, textAlign: 'center' },
  cell: { flex: 1, minHeight: 52, justifyContent: 'center', alignItems: 'center' },
  // The ring is centered on the day number (it used to sit at the cell's top-left corner).
  cellRing: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  selection: { width: 12, height: 2, borderRadius: 2, position: 'absolute', bottom: 8 },
  body: { gap: 16 },
  manual: { gap: 12 },
});
