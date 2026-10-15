import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMobileApi } from '@/api';
import type { NutritionReport } from '@/api/nutrition-report';
import { AppIcon, AppText, Button, SheetHandle, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { displayNutritionDate, inputNutritionDate, number, parseInputNutritionDate, shiftNutritionDate } from './day-format';
import { nutritionMonth, reportRings } from './day-home-model';
import { NutritionCalorieRing } from './day-rings';
import { readingLabel } from './day-summary';
import { useNutritionReportResource } from './report-resource';

export function NutritionMonthSheet({ date, today, onClose, onSelect, onReport }: {
  date: string; today: string; onClose: () => void; onSelect: (date: string) => void; onReport?: (range: { from: string; to: string }) => void;
}) {
  const { colors } = useOwnlevelTheme();
  const reduced = useReduceMotion();
  const [month, setMonth] = useState(`${date.slice(0, 7)}-01`);
  const [manual, setManual] = useState(false);
  const [input, setInput] = useState(inputNutritionDate(date));
  const [error, setError] = useState(false);
  const select = (selected: string) => { onSelect(selected); onClose(); };
  const move = (delta: number) => {
    const value = new Date(`${month}T12:00:00Z`);
    value.setUTCMonth(value.getUTCMonth() + delta);
    const next = value.toISOString().slice(0, 10);
    if (parseInputNutritionDate(inputNutritionDate(next))) setMonth(next);
  };
  const monthTitle = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}T12:00:00Z`)).replace(/^./u, c => c.toLocaleUpperCase('es-AR'));
  return <Modal transparent animationType={reduced ? 'fade' : 'slide'} visible onRequestClose={onClose}>
    <View style={styles.modal}>
      <Pressable accessibilityLabel="Cerrar calendario" onPress={onClose} style={styles.backdrop} />
      <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.sheet, { backgroundColor: colors.background }]} accessibilityViewIsModal>
        <SheetHandle />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.monthHeader}>
            <Pressable accessibilityLabel="Mes anterior" accessibilityRole="button" onPress={() => move(-1)} style={styles.arrow}><AppIcon name="chevronLeft" size={20} color={colors.primary} /></Pressable>
            <AppText accessibilityRole="header" variant="headline">{monthTitle}</AppText>
            <Pressable accessibilityLabel="Mes siguiente" accessibilityRole="button" onPress={() => move(1)} style={styles.arrow}><AppIcon name="chevronRight" size={20} color={colors.primary} /></Pressable>
          </View>
          {month > today ? <MonthGrid month={month} selected={date} today={today} onSelect={select} />
            : <ReadMonth key={month} month={month} selected={date} today={today} onSelect={select} onReport={onReport ? range => { onClose(); onReport(range); } : undefined} />}
          <View style={styles.footer}>
            <Button label="Volver a hoy" variant="quiet" onPress={() => select(today)} />
            <Button label="Otra fecha" variant="quiet" onPress={() => setManual(v => !v)} />
          </View>
          {manual ? <View style={styles.manual}>
            <AppText muted variant="footnote">Usá el formato DD/MM/AAAA.</AppText>
            <TextInput accessibilityLabel="Fecha DD/MM/AAAA" autoCorrect={false} keyboardType="numbers-and-punctuation" maxLength={10}
              onChangeText={value => { setInput(value); setError(false); }} value={input} placeholder="DD/MM/AAAA" placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text, borderColor: error ? colors.danger : colors.border }]} />
            {error ? <AppText accessibilityRole="alert">Ingresá una fecha válida.</AppText> : null}
            <Button label="Consultar fecha" onPress={() => { const selected = parseInputNutritionDate(input); if (selected) select(selected); else setError(true); }} />
          </View> : null}
          <Button label="Cerrar calendario" variant="quiet" onPress={onClose} />
        </ScrollView>
      </SafeAreaView>
    </View>
  </Modal>;
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
    {state.status === 'loading' ? <AppText muted variant="footnote">Cargando mes…</AppText> : null}
    {failed ? <View style={styles.manual}><AppText accessibilityRole="alert">{report ? 'No pudimos actualizar este mes. Mostramos la última lectura.' : 'No pudimos cargar este mes.'}</AppText>
      <Button variant="quiet" label="Reintentar mes" onPress={() => void refresh()} /></View> : null}
    <View style={styles.average}>
      <View style={styles.averageText}><AppText muted variant="caption">Promedio del mes</AppText>
        <AppText numeric variant="footnote">{average ? average.value === null ? 'Sin promedio disponible' : `${number(average.value)} kcal · ${average.denominator} de ${report!.coverage.finalizedDays} días${average.partialDays > 0 ? ' · parcial' : ''}` : '—'}</AppText>
        {average && report?.range.end === today ? <AppText muted variant="caption">Hoy sigue en curso y no entra en el promedio.</AppText> : null}
      </View>
      {props.onReport ? <Button label="Ver reporte" variant="quiet" onPress={() => props.onReport?.({ from: month, to: end < today ? end : today })} /> : null}
    </View>
  </>;
}
function MonthGrid({ month, selected, today, onSelect, report, loading, unavailable }: {
  month: string; selected: string; today: string; onSelect: (date: string) => void; report?: NutritionReport; loading?: boolean; unavailable?: boolean;
}) {
  const { colors } = useOwnlevelTheme();
  const { days, offset } = nutritionMonth(month);
  const cells = Array.from({ length: Math.ceil((days + offset) / 7) * 7 }, (_, i) => i >= offset && i < offset + days ? shiftNutritionDate(month, i - offset)! : null);
  const rows = new Map(report?.days.map(row => [row.date, row]));
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gridScroll}><View testID="nutrition-month" style={styles.calendar}>
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
  </View></ScrollView>;
}
const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.25)' }, backdrop: { flex: 1 },
  sheet: { maxHeight: '85%', minHeight: '65%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8 },
  content: { padding: 16, gap: 16 }, monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  arrow: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, gridScroll: { flexGrow: 1 }, calendar: { gap: 8, minWidth: 308, flex: 1 },
  week: { flexDirection: 'row' }, weekday: { flex: 1, textAlign: 'center' },
  cell: { flex: 1, minHeight: 52, justifyContent: 'center', alignItems: 'center' }, cellRing: { position: 'absolute' },
  selection: { width: 12, height: 2, borderRadius: 2, position: 'absolute', bottom: 8 },
  average: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, averageText: { flex: 1, minWidth: 160, gap: 4 },
  footer: { flexDirection: 'row', justifyContent: 'space-between' }, manual: { gap: 12 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, fontSize: 17 },
});
