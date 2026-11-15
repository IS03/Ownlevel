import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { NutritionReport, ReportDailyRow } from '@/api/nutrition-report';
import { AppIcon, AppText, Button, ChipGroup, Heading, SegmentedControl, brandTokens, radius, spacing, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { ProgressRow } from './progress-row';
import { inputNutritionDate as date } from '@/nutrition/day-format';
import { formatValue } from './progress-format';
import { useProgressRange } from './progress-range-context';
import { NutritionReportDays } from './nutrition-report-details';

export type NutritionInspection = { series: 'current' | 'reference'; start: string | null; end: string | null; daysOpen: boolean } | null;
/** #519 · Which nutrient the same bars show. Switching it is local: the reports already carry both. */
export type NutritionChartNutrient = 'calories' | 'protein';
const NUTRIENTS = {
  calories: { label: 'Calorías', title: 'Calorías registradas', unit: 'kcal', known: 'calorías conocidas', short: 'calorías', unknown: 'con calorías desconocidas',
    complete: 'Calorías completas entre las entradas registradas', target: (d: ReportDailyRow) => d.targetCalories },
  protein: { label: 'Proteína', title: 'Proteína registrada', unit: 'g', known: 'proteína conocida', short: 'proteína', unknown: 'con proteína desconocida',
    complete: 'Proteína completa entre las entradas registradas', target: (d: ReportDailyRow) => d.targetProteinG },
} as const;
const range = (start: string, end: string) => start === end ? date(start) : `${date(start)} – ${date(end)}`;
function points(report: NutritionReport, n: NutritionChartNutrient) {
  return report.range.days <= 31
    ? [...report.days].reverse().map(d => ({ start: d.date, end: d.date, value: d.nutrients[n].value,
      partial: d.nutrients[n].status === 'partial', today: d.isToday, day: d, denominator: d.nutrients[n].value === null ? 0 : 1, partialDays: d.nutrients[n].status === 'partial' ? 1 : 0 }))
    : report.evolution.map(b => ({ start: b.start, end: b.end, value: b.metrics[n].value,
      partial: b.metrics[n].partialDays > 0, today: b.includesToday, day: undefined as ReportDailyRow | undefined,
      denominator: b.metrics[n].denominator, partialDays: b.metrics[n].partialDays }));
}
function dayState(d: ReportDailyRow, n: NutritionChartNutrient) {
  const status = d.nutrients[n].status, copy = NUTRIENTS[n];
  return d.mealCount === 0 ? 'Sin registros nutricionales; no equivale a cero'
    : status === 'unknown' ? `Entradas registradas sin ${copy.known}`
    : status === 'partial' ? `Suma parcial: solo ${copy.known}` : copy.complete;
}

/** Same report and bars, now inspected locally. Each A/B series keeps its own dates and buckets. */
export function NutritionChart({ report, reference, selection, onSelect, onDate, nutrient, onNutrient }: {
  report: NutritionReport; reference?: NutritionReport; selection: NutritionInspection;
  onSelect: (next: NutritionInspection) => void; onDate: (date: string) => void;
  nutrient: NutritionChartNutrient; onNutrient: (next: NutritionChartNutrient) => void;
}) {
  const { colors } = useOwnlevelTheme(), { compareOn, compareText } = useProgressRange();
  const { fontScale } = useWindowDimensions(), [width, setWidth] = useState(300);
  const copy = NUTRIENTS[nutrient], fmt = (value: number) => formatValue(value, copy.unit, 'integer');
  const series = [{ key: 'current' as const, title: 'Período elegido', report, points: points(report, nutrient) },
    ...(compareOn && reference ? [{ key: 'reference' as const, title: `Comparación · ${compareText}`, report: reference, points: points(reference, nutrient) }] : [])];
  const activeSeries = compareOn ? selection?.series ?? 'current' : 'current';
  const max = Math.max(1, ...series.flatMap(s => s.points.map(p => p.value ?? 0)));
  const source = series.find(s => s.key === selection?.series);
  const selected = source?.points.find(p => p.start === selection?.start && p.end === selection?.end);
  // The historical target of the chosen nutrient, as recorded that date; absent stays absent.
  const target = selected?.day ? copy.target(selected.day) : null;
  const rows = selected && source ? source.report.days.filter(d => d.date >= selected.start && d.date <= selected.end) : [];
  const canInspect = activeSeries !== 'reference' || !!reference;
  const prompt = canInspect ? 'Tocá una barra' : 'Comparación no disponible';
  const value = selected ? selected.value === null ? 'Sin dato' : `${selected.day ? '' : 'Promedio del bloque · '}${fmt(selected.value)}${selected.day ? '' : ' por día con dato'}` : canInspect ? 'Consultá fecha o rango, valor y cobertura sin salir del gráfico.' : 'Reintentá la lectura del período de comparación.';
  return <View style={styles.section} testID="nutrition-progress-chart">
    <Heading level={2}>{copy.title}</Heading>
    {/* #519 · Same bars, period, A/B side and selection: only the nutrient they show changes. */}
    <SegmentedControl accessibilityLabel="Nutriente del gráfico" value={nutrient} options={[
      { value: 'calories', label: NUTRIENTS.calories.label }, { value: 'protein', label: NUTRIENTS.protein.label },
    ]} onChange={next => { if (next !== nutrient) { haptics.selection(); onNutrient(next); } }} />
    {compareOn ? <ChipGroup accessibilityLabel="Período del gráfico" value={activeSeries} options={[
      { value: 'current', label: 'Período elegido' }, { value: 'reference', label: 'Comparación' },
    ]} onChange={series => onSelect({ series: series as 'current' | 'reference', start: null, end: null, daysOpen: false })} /> : null}
    {series.filter(s => s.key === activeSeries).map(s => <View key={s.key} style={styles.section}>
      <AppText variant="headline">{s.title} · {s.report.range.days <= 31 ? 'por día' : 'promedio por bloque'}</AppText>
      <AppText muted numeric variant="caption">{range(s.report.range.start, s.report.range.end)}</AppText>
      <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
        <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel={`${copy.label} · ${s.title}`}>
          <View testID={`nutrition-chart-series-${s.key}`} style={[styles.chart, { width: Math.max(width, s.points.length * brandTokens.layout.minTouch * Math.max(1, fontScale)) }]}>
            {s.points.map(p => {
              const active = selection?.series === s.key && selection.start === p.start && selection.end === p.end;
              const label = `${range(p.start, p.end)}, ${p.value === null ? p.day ? dayState(p.day, nutrient) : 'sin promedio calculable' : `${p.day ? '' : 'promedio del bloque, '}${fmt(p.value)}`}${p.partial ? ', suma parcial' : ''}${p.today ? ', hoy en curso' : ''}${p.day ? `, ${p.day.nutrients[nutrient].knownMeals} de ${p.day.mealCount} entradas con ${copy.short}` : `, ${p.denominator} días usados, ${p.partialDays} con suma parcial`}, ${s.title}`;
              return <Pressable key={p.start} testID={`nutrition-chart-${s.key}-${p.start}-${p.value === null ? 'gap' : 'bar'}`}
                accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={label}
                accessibilityHint="Muestra el detalle. Otro toque quita la selección."
                onPress={() => onSelect(active ? null : { series: s.key, start: p.start, end: p.end, daysOpen: false })}
                style={[styles.slot, { minWidth: brandTokens.layout.minTouch }, active && { borderColor: colors.primary, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.inner }]}>
                <View style={styles.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {p.value !== null ? <View style={{ height: p.value === 0 ? 1 : 150 * p.value / max, backgroundColor: p.value === 0 ? colors.border : s.key === 'reference' ? colors.textMuted : colors.primary, opacity: p.today || s.key === 'reference' ? 0.4 : 1 }} /> : null}
                </View>
                <AppText numeric muted variant="caption">{p.start.slice(8)}/{p.start.slice(5, 7)}</AppText>
              </Pressable>;
            })}
          </View>
        </ScrollView>
      </View>
    </View>)}
    {compareOn && !reference ? <AppText muted>Comparación no disponible.</AppText> : null}
    <View style={styles.section} testID="nutrition-chart-inspection">
      <View accessible accessibilityLiveRegion="polite" accessibilityLabel={`${selected ? range(selected.start, selected.end) : prompt}, ${value}${source ? `, ${source.title}` : ''}`}>
        {selected || !canInspect ? <>
          <AppText variant="headline">{selected ? range(selected.start, selected.end) : prompt}</AppText>
          <AppText numeric>{value}</AppText>
        </> : <AppText muted variant="footnote">Tocá una barra para ver su fecha, valor y cobertura.</AppText>}
        {/* Which side of A/B the datum is from, only when there are two: date, value and coverage come first. */}
        {compareOn && source && selected ? <AppText muted variant="caption">{source.title} · {range(source.report.range.start, source.report.range.end)}</AppText> : null}
      </View>
      {selection?.start && !selected ? <AppText muted>El dato seleccionado ya no está disponible en esta lectura. Elegí otra barra.</AppText> : null}
      {selected?.day ? <>
        {/* #519 · Date, value, then coverage: what is known about this datum, next to it. */}
        <AppText muted testID="nutrition-chart-coverage">{dayState(selected.day, nutrient)}.</AppText>
        {selected.today ? <AppText variant="footnote" testID="nutrition-chart-today">Hoy está en curso: sus valores pueden cambiar y no entran en el promedio del período.</AppText> : null}
        <AppText numeric muted variant="caption">{selected.day.nutrients[nutrient].knownMeals} de {selected.day.mealCount} entradas con {copy.known} · {selected.day.nutrients[nutrient].missingMeals} sin ese dato{selected.day.imported ? ' · incluye registro importado' : ''}.</AppText>
        <AppText numeric muted variant="caption">{target === null ? 'Sin objetivo histórico acreditado para esta fecha.' : `Objetivo registrado de esta fecha: ${fmt(target)}.`}</AppText>
        <ProgressRow testID="nutrition-chart-open-day" label={`Ver comidas de ese día, ${range(selected.start, selected.end)}`} onPress={() => onDate(selected.start)}>
          <AppText variant="body" style={[styles.grow, { color: colors.primary }]}>Ver comidas de ese día</AppText>
        </ProgressRow>
      </> : selected ? <>
        <AppText numeric muted testID="nutrition-chart-coverage">{selected.denominator} días usados de {rows.length} días del bloque · {selected.partialDays} con suma parcial.</AppText>
        <AppText numeric muted variant="caption">{rows.filter(d => d.mealCount === 0).length} días sin entradas registradas · {rows.filter(d => d.nutrients[nutrient].status === 'unknown').length} {copy.unknown}.</AppText>
        {selected.today ? <AppText variant="footnote" testID="nutrition-chart-today">Incluye hoy en curso: este promedio de bloque puede cambiar. El promedio del período excluye hoy.</AppText> : null}
        <Button label={selection?.daysOpen ? 'Ocultar días del bloque' : 'Ver días del bloque'} variant="secondary"
          onPress={() => { if (selection) onSelect({ ...selection, daysOpen: !selection.daysOpen }); }} />
        {selection?.daysOpen ? <NutritionReportDays rows={rows} onDate={onDate} /> : null}
      </> : null}
    </View>
    <ChartHelp compare={compareOn} />
  </View>;
}

/**
 * #519 · The general explanations, out of the way but one tap from the chart. Opening it is local: nothing is read. What is
 * true of the selected datum (partial, today, unavailable) stays next to it, never in here.
 */
function ChartHelp({ compare }: { compare: boolean }) {
  const { colors } = useOwnlevelTheme();
  const [open, setOpen] = useState(false);
  return <View style={styles.section} testID="nutrition-chart-help">
    <Pressable accessibilityRole="button" accessibilityLabel="Cómo leer el gráfico" accessibilityState={{ expanded: open }} testID="nutrition-chart-help-toggle"
      onPress={() => { haptics.selection(); setOpen(value => !value); }} style={({ pressed }) => [styles.help, pressed && { opacity: 0.6 }]}>
      <AppIcon name="info" color={colors.textMuted} size={17} />
      <AppText muted variant="subheadline" style={styles.grow}>Cómo leer el gráfico</AppText>
      <AppIcon name={open ? 'chevronDown' : 'chevronRight'} color={colors.textMuted} size={15} />
    </Pressable>
    {open ? <View style={styles.helpBody} testID="nutrition-chart-help-body">
      <AppText muted variant="footnote">Cada barra es un día (o el promedio de un bloque en períodos largos). Tocá una para ver su fecha, valor y cobertura; otro toque quita la selección.</AppText>
      <AppText muted variant="footnote">Hueco: ese día no tiene valor. Línea en la base: cero registrado. No son lo mismo.</AppText>
      <AppText muted variant="footnote">Hoy aparece más tenue: está en curso y no entra en el promedio del período.</AppText>
      {compare ? <AppText muted variant="footnote">Champagne: período elegido; gris: comparación. Cada serie conserva sus fechas, sin emparejar posiciones.</AppText> : null}
      <AppText muted variant="footnote">Datos completos entre las entradas registradas no acreditan toda la ingesta.</AppText>
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  chart: { flexDirection: 'row', alignItems: 'flex-start' },
  slot: { flex: 1, gap: spacing.xs, paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
  bar: { height: 150, justifyContent: 'flex-end' },
  grow: { flex: 1 },
  help: { minHeight: brandTokens.layout.minTouch, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  helpBody: { gap: spacing.xs, paddingBottom: spacing.xs },
});
