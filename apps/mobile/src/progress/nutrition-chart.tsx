import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { NutritionReport, ReportDailyRow } from '@/api/nutrition-report';
import { AppText, Button, ChipGroup, Heading, brandTokens, spacing, useOwnlevelTheme } from '@/design-system';
import { inputNutritionDate as date } from '@/nutrition/day-format';
import { formatValue } from './progress-format';
import { useProgressRange } from './progress-range-context';
import { NutritionReportDays } from './nutrition-report-details';

export type NutritionInspection = { series: 'current' | 'reference'; start: string | null; end: string | null; daysOpen: boolean } | null;
const range = (start: string, end: string) => start === end ? date(start) : `${date(start)} – ${date(end)}`;
const kcal = (value: number) => formatValue(value, 'kcal', 'integer');
function points(report: NutritionReport) {
  return report.range.days <= 31
    ? [...report.days].reverse().map(d => ({ start: d.date, end: d.date, value: d.nutrients.calories.value,
      partial: d.nutrients.calories.status === 'partial', today: d.isToday, day: d, denominator: d.nutrients.calories.value === null ? 0 : 1, partialDays: d.nutrients.calories.status === 'partial' ? 1 : 0 }))
    : report.evolution.map(b => ({ start: b.start, end: b.end, value: b.metrics.calories.value,
      partial: b.metrics.calories.partialDays > 0, today: b.includesToday, day: undefined as ReportDailyRow | undefined,
      denominator: b.metrics.calories.denominator, partialDays: b.metrics.calories.partialDays }));
}
function dayState(d: ReportDailyRow) {
  return d.mealCount === 0 ? 'Sin registros nutricionales; no equivale a cero'
    : d.nutrients.calories.status === 'unknown' ? 'Entradas registradas sin calorías conocidas'
    : d.nutrients.calories.status === 'partial' ? 'Suma parcial: solo calorías conocidas' : 'Calorías completas entre las entradas registradas';
}

/** Same report and bars, now inspected locally. Each A/B series keeps its own dates and buckets. */
export function NutritionChart({ report, reference, selection, onSelect, onDate }: {
  report: NutritionReport; reference?: NutritionReport; selection: NutritionInspection;
  onSelect: (next: NutritionInspection) => void; onDate: (date: string) => void;
}) {
  const { colors } = useOwnlevelTheme(), { compareOn, compareText } = useProgressRange();
  const { fontScale } = useWindowDimensions(), [width, setWidth] = useState(300);
  const series = [{ key: 'current' as const, title: 'Período elegido', report, points: points(report) },
    ...(compareOn && reference ? [{ key: 'reference' as const, title: `Comparación · ${compareText}`, report: reference, points: points(reference) }] : [])];
  const activeSeries = compareOn ? selection?.series ?? 'current' : 'current';
  const max = Math.max(1, ...series.flatMap(s => s.points.map(p => p.value ?? 0)));
  const source = series.find(s => s.key === selection?.series);
  const selected = source?.points.find(p => p.start === selection?.start && p.end === selection?.end);
  const rows = selected && source ? source.report.days.filter(d => d.date >= selected.start && d.date <= selected.end) : [];
  const canInspect = activeSeries !== 'reference' || !!reference;
  const prompt = canInspect ? 'Tocá una barra' : 'Comparación no disponible';
  const value = selected ? selected.value === null ? 'Sin valor de calorías' : `${selected.day ? '' : 'Promedio del bloque · '}${kcal(selected.value)}${selected.day ? '' : ' por día con dato'}` : canInspect ? 'Consultá fecha o rango, valor y cobertura sin salir del gráfico.' : 'Reintentá la lectura del período de comparación.';
  return <View style={styles.section} testID="nutrition-progress-chart">
    <Heading level={2}>Calorías registradas</Heading>
    {compareOn ? <ChipGroup accessibilityLabel="Período del gráfico" value={activeSeries} options={[
      { value: 'current', label: 'Período elegido' }, { value: 'reference', label: 'Comparación' },
    ]} onChange={series => onSelect({ series: series as 'current' | 'reference', start: null, end: null, daysOpen: false })} /> : null}
    {series.filter(s => s.key === activeSeries).map(s => <View key={s.key} style={styles.section}>
      <AppText variant="headline">{s.title} · {s.report.range.days <= 31 ? 'por día' : 'promedio por bloque'}</AppText>
      <AppText muted numeric variant="caption">{range(s.report.range.start, s.report.range.end)}</AppText>
      <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
        <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel={`Calorías · ${s.title}`}>
          <View testID={`nutrition-chart-series-${s.key}`} style={[styles.chart, { width: Math.max(width, s.points.length * brandTokens.layout.minTouch * Math.max(1, fontScale)) }]}>
            {s.points.map(p => {
              const active = selection?.series === s.key && selection.start === p.start && selection.end === p.end;
              const label = `${range(p.start, p.end)}, ${p.value === null ? p.day ? dayState(p.day) : 'sin promedio calculable' : `${p.day ? '' : 'promedio del bloque, '}${kcal(p.value)}`}${p.partial ? ', suma parcial' : ''}${p.today ? ', hoy en curso' : ''}${p.day ? `, ${p.day.nutrients.calories.knownMeals} de ${p.day.mealCount} entradas con calorías` : `, ${p.denominator} días usados, ${p.partialDays} con suma parcial`}, ${s.title}`;
              return <Pressable key={p.start} testID={`nutrition-chart-${s.key}-${p.start}-${p.value === null ? 'gap' : 'bar'}`}
                accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={label}
                accessibilityHint="Muestra el detalle. Otro toque quita la selección."
                onPress={() => onSelect(active ? null : { series: s.key, start: p.start, end: p.end, daysOpen: false })}
                style={[styles.slot, { minWidth: brandTokens.layout.minTouch }, active && { borderColor: colors.primary, borderWidth: StyleSheet.hairlineWidth }]}>
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
    <AppText muted variant="caption">Champagne: período elegido; gris: comparación. Cada serie conserva sus fechas, sin emparejar posiciones. Hueco: sin valor; línea en la base: cero registrado.</AppText>
    <View style={styles.section} testID="nutrition-chart-inspection">
      <View accessible accessibilityLiveRegion="polite" accessibilityLabel={`${selected ? range(selected.start, selected.end) : prompt}, ${value}${source ? `, ${source.title}` : ''}`}>
        <AppText variant="headline">{selected ? range(selected.start, selected.end) : prompt}</AppText>
        <AppText numeric>{value}</AppText>
        {source && selected ? <AppText muted variant="caption">{source.title} · {range(source.report.range.start, source.report.range.end)}</AppText> : null}
      </View>
      {selection?.start && !selected ? <AppText muted>El dato seleccionado ya no está disponible en esta lectura. Elegí otra barra.</AppText> : null}
      {selected?.day ? <>
        <AppText muted>{dayState(selected.day)}.</AppText>
        <AppText numeric muted variant="caption">{selected.day.nutrients.calories.knownMeals} de {selected.day.mealCount} entradas con calorías conocidas · {selected.day.nutrients.calories.missingMeals} sin ese dato{selected.day.imported ? ' · incluye registro importado' : ''}.</AppText>
        <AppText numeric muted variant="caption">{selected.day.targetCalories === null ? 'Sin objetivo histórico acreditado para esta fecha.' : `Objetivo registrado de esta fecha: ${kcal(selected.day.targetCalories)}.`}</AppText>
        {selected.today ? <AppText muted variant="caption">Hoy está en curso: sus valores pueden cambiar y no entran en el promedio del período.</AppText> : null}
        <Button label="Abrir día y comidas originales" variant="secondary" onPress={() => onDate(selected.start)} />
      </> : selected ? <>
        <AppText numeric muted>{selected.denominator} días usados de {rows.length} días del bloque · {selected.partialDays} con suma parcial. Datos completos entre las entradas registradas no acreditan toda la ingesta.</AppText>
        <AppText numeric muted variant="caption">{rows.filter(d => d.mealCount === 0).length} días sin entradas registradas · {rows.filter(d => d.nutrients.calories.status === 'unknown').length} con calorías desconocidas.</AppText>
        {selected.today ? <AppText muted variant="caption">Incluye hoy en curso: este promedio de bloque puede cambiar. El promedio del período excluye hoy.</AppText> : null}
        <Button label={selection?.daysOpen ? 'Ocultar días del bloque' : 'Ver días del bloque'} variant="secondary"
          onPress={() => { if (selection) onSelect({ ...selection, daysOpen: !selection.daysOpen }); }} />
        {selection?.daysOpen ? <NutritionReportDays rows={rows} onDate={onDate} /> : null}
      </> : null}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  chart: { flexDirection: 'row', alignItems: 'flex-start' },
  slot: { flex: 1, gap: spacing.xs, paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
  bar: { height: 150, justifyContent: 'flex-end' },
});
