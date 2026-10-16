import { useContext, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useMobileApi } from '@/api';
import type { NutritionReport } from '@/api/nutrition-report';
import { AppIcon, AppSheet, AppText, Button, useAppSheetDismiss, useOwnlevelTheme } from '@/design-system';
import { NutritionGlassButton } from './day-controls';
import { displayNutritionDate, inputNutritionDate, number, parseInputNutritionDate, shiftNutritionDate } from './day-format';
import { nutritionMonth, reportRings } from './day-home-model';
import { NutritionCalorieRing } from './day-rings';
import { readingLabel } from './day-summary';
import { useNutritionReportResource } from './report-resource';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const monthName = (month: string, style: 'long' | 'short' = 'long') => new Intl.DateTimeFormat('es-AR', { month: style, year: 'numeric', timeZone: 'UTC' })
  .format(new Date(`${month}T12:00:00Z`)).replace(/^./u, c => c.toLocaleUpperCase('es-AR'));

/**
 * Month calendar in an app sheet: drag it down or tap outside to close. The month title opens a month/year
 * picker for far dates; every month keeps six rows so the sheet never changes height.
 */
export function NutritionMonthSheet({ date, today, onClose, onSelect, onReport }: {
  date: string; today: string; onClose: () => void; onSelect: (date: string) => void; onReport?: (range: { from: string; to: string }) => void;
}) {
  // Context (not the hook): it also opens from places rendered without a provider (tests, nested sheets).
  const { colors } = useOwnlevelTheme(), bottom = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  return <AppSheet onClose={onClose} closeLabel="Cerrar calendario" dragFromContent testID="nutrition-month-sheet"
    style={{ backgroundColor: colors.background, paddingBottom: Math.max(bottom, 16) }}>
    <MonthBody date={date} today={today} onSelect={onSelect} onReport={onReport} />
  </AppSheet>;
}
function MonthBody({ date, today, onSelect, onReport }: { date: string; today: string; onSelect: (date: string) => void; onReport?: (range: { from: string; to: string }) => void }) {
  const { colors } = useOwnlevelTheme();
  const dismiss = useAppSheetDismiss();
  const [month, setMonth] = useState(`${date.slice(0, 7)}-01`);
  const [picking, setPicking] = useState(false);
  // The sheet keeps its tallest height (the day grid) when the month picker replaces it.
  const [height, setHeight] = useState(0);
  const select = (selected: string) => dismiss(() => onSelect(selected));
  const move = (delta: number) => {
    const value = new Date(`${month}T12:00:00Z`);
    value.setUTCMonth(value.getUTCMonth() + delta);
    const next = value.toISOString().slice(0, 10);
    if (parseInputNutritionDate(inputNutritionDate(next))) setMonth(next);
  };
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
      {picking ? <MonthPicker month={month} today={today} onPick={next => { setMonth(next); setPicking(false); }} />
        : month > today ? <><MonthGrid month={month} selected={date} today={today} onSelect={select} /><View style={styles.average} /></>
        : <ReadMonth key={month} month={month} selected={date} today={today} onSelect={select} onReport={onReport ? range => dismiss(() => onReport(range)) : undefined} />}
    </View>
  </View>;
}
/** Year with arrows and its twelve months; months after today are not offered. */
function MonthPicker({ month, today, onPick }: { month: string; today: string; onPick: (month: string) => void }) {
  const { colors } = useOwnlevelTheme();
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const lastYear = Number(today.slice(0, 4));
  return <View style={styles.picker} testID="nutrition-month-picker">
    <View style={styles.monthHeader}>
      <Pressable accessibilityLabel="Año anterior" accessibilityRole="button" onPress={() => setYear(y => y - 1)} style={styles.arrow}><AppIcon name="chevronLeft" size={20} color={colors.primary} /></Pressable>
      <AppText numeric variant="headline">{year}</AppText>
      <Pressable accessibilityLabel="Año siguiente" accessibilityRole="button" accessibilityState={{ disabled: year >= lastYear }} disabled={year >= lastYear} onPress={() => setYear(y => y + 1)}
        style={[styles.arrow, year >= lastYear && { opacity: 0.3 }]}><AppIcon name="chevronRight" size={20} color={colors.primary} /></Pressable>
    </View>
    <View style={styles.months}>{MONTHS.map((label, i) => {
      const value = `${year}-${String(i + 1).padStart(2, '0')}-01`, future = value > today, current = value === month;
      return <Pressable key={label} accessibilityRole="button" accessibilityLabel={monthName(value)} accessibilityState={{ disabled: future, selected: current }} disabled={future}
        onPress={() => onPick(value)} style={[styles.monthCell, { backgroundColor: current ? colors.brandSubtle : colors.surface }, future && { opacity: 0.35 }]} testID={`nutrition-pick-${value.slice(0, 7)}`}>
        <AppText variant="subheadline" style={current && { color: colors.primary, fontWeight: '600' }}>{label}</AppText>
      </Pressable>;
    })}</View>
  </View>;
}
function ReadMonth({ month, today, ...props }: { month: string; today: string; selected: string; onSelect: (date: string) => void; onReport?: (range: { from: string; to: string }) => void }) {
  const { client } = useMobileApi();
  const end = nutritionMonth(month).end;
  const { state, refresh } = useNutritionReportResource(client, { period: 'custom', from: month, to: end < today ? end : today });
  const report = state.status === 'ready' ? state.current.data : state.status === 'unavailable' ? state.previous?.data : undefined;
  const failed = state.status !== 'ready' && state.status !== 'loading';
  const average = report?.summary.metrics.calories;
  return <>
    <MonthGrid {...props} month={month} today={today} report={report} loading={state.status === 'loading'} unavailable={failed} />
    {failed ? <View style={styles.manual}><AppText accessibilityRole="alert">{report ? 'No pudimos actualizar este mes. Mostramos la última lectura.' : 'No pudimos cargar este mes.'}</AppText>
      <Button variant="quiet" label="Reintentar mes" onPress={() => void refresh()} /></View> : null}
    <View style={styles.average}>
      <View style={styles.averageText}><AppText muted variant="caption">Promedio del mes</AppText>
        <AppText numeric variant="footnote">{average ? average.value === null ? 'Sin promedio disponible' : `${number(average.value)} kcal · ${average.denominator} de ${report!.coverage.finalizedDays} días${average.partialDays > 0 ? ' · parcial' : ''}` : '—'}</AppText>
        {average && report?.range.end === today ? <AppText muted variant="caption">Hoy sigue en curso y no entra en el promedio.</AppText> : null}
      </View>
      {props.onReport ? <NutritionGlassButton icon="progress" label="Ver reporte" wide onPress={() => props.onReport?.({ from: month, to: end < today ? end : today })} /> : null}
    </View>
  </>;
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
  average: { minHeight: 50, gap: 12 }, averageText: { gap: 4 },
  body: { gap: 16 }, picker: { gap: 12 },
  months: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthCell: { width: '31.5%', minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  manual: { gap: 12 },
});
