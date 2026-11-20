import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { NutritionReport, ReportDailyRow } from '@/api/nutrition-report';
import { LinkRow, AppIcon, AppText, Chip, ChipGroup, Heading, useReduceMotion, brandTokens, radius, spacing, useOwnlevelTheme } from '@/design-system';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { ExerciseSegmented } from '@/training/exercise-segmented';
import { haptics } from '@/platform/haptics';
import { FittedChart } from './fitted-chart';
import { ProgressRow } from './progress-row';
import { inputNutritionDate as date } from '@/nutrition/day-format';
import { nutritionValue } from './nutrition-values';
import { useProgressRange } from './progress-range-context';
import { shortRange } from './progress-range';
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
const valueText = (nutrient: NutritionChartNutrient, value: number, spoken = false) => nutritionValue(value, nutrient === 'calories' ? 'kcal' : 'g', spoken);

function points(report: NutritionReport, n: NutritionChartNutrient) {
  return report.range.days <= 31
    ? [...report.days].reverse().map(d => ({ start: d.date, end: d.date, value: d.nutrients[n].value,
      target: NUTRIENTS[n].target(d), partial: d.nutrients[n].status === 'partial', today: d.isToday, day: d, denominator: d.nutrients[n].value === null ? 0 : 1, partialDays: d.nutrients[n].status === 'partial' ? 1 : 0 }))
    : report.evolution.map(b => ({ start: b.start, end: b.end, value: b.metrics[n].value,
      target: b.metrics[n === 'calories' ? 'targetCalories' : 'targetProtein'].value, partial: b.metrics[n].partialDays > 0, today: b.includesToday, day: undefined as ReportDailyRow | undefined,
      denominator: b.metrics[n].denominator, partialDays: b.metrics[n].partialDays }));
}
/**
 * #531 · Stages are the labels the report gives each date (`days[].goalStage`). Equal text only groups contiguous dates visually:
 * the contract carries labels, not a stage's identity or validity. An empty label is no label.
 */
const stageOf = (d: ReportDailyRow | undefined) => d?.goalStage?.trim() ? d.goalStage.trim() : null;
const nextDate = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const daysText = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;
type StageRun = { label: string; first: boolean; last: boolean; length: number } | null;
/** Daily points → runs of contiguous dates with the same informed label. A change, a missing label or a skipped date cuts the run. */
function stageRuns(points: { start: string; day?: ReportDailyRow }[]): StageRun[] {
  const out: StageRun[] = points.map(() => null);
  for (let i = 0; i < points.length;) {
    const label = stageOf(points[i].day);
    if (!label) { i++; continue; }
    let j = i + 1;
    while (j < points.length && stageOf(points[j].day) === label && nextDate(points[j - 1].start) === points[j].start) j++;
    for (let k = i; k < j; k++) out[k] = { label, first: k === i, last: k === j - 1, length: j - i };
    i = j;
  }
  return out;
}
/** A block's calendar dates (inclusive bounds) by label, from the daily rows of the same report; a date without a label (or a row) counts as none. */
function blockStages(report: NutritionReport, start: string, end: string) {
  const byDate = new Map(report.days.map(d => [d.date, stageOf(d)]));
  const counts = new Map<string, number>();
  let none = 0, total = 0;
  for (let d = start; d <= end; d = nextDate(d)) {
    const label = byDate.get(d) ?? null;
    total++;
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1); else none++;
  }
  return { labels: [...counts.entries()], none, total };
}
/** The block's breakdown, on screen («Volumen · 3 días») or spoken («Volumen, 3 días»: no middle dot for the screen reader). */
function blockStagesText(s: ReturnType<typeof blockStages>, spoken = false) {
  if (!s.labels.length) return `Sin etapa informada en los ${daysText(s.total)} del bloque${spoken ? '' : '.'}`;
  const sep = spoken ? ', ' : ' · ';
  return `Etapas del bloque: ${[...s.labels.map(([label, n]) => `${label}${sep}${daysText(n)}`), ...(s.none ? [`sin etapa informada${sep}${daysText(s.none)}`] : [])].join('; ')}${spoken ? '' : '.'}`;
}
function dayState(d: ReportDailyRow, n: NutritionChartNutrient) {
  const status = d.nutrients[n].status, copy = NUTRIENTS[n];
  return d.mealCount === 0 ? d.hasNutrition ? 'Registro nutricional sin desglose de comidas' : 'Sin registros nutricionales; no equivale a cero'
    : status === 'unknown' ? `Entradas registradas sin ${copy.known}`
    : status === 'partial' ? `Suma parcial: solo ${copy.known}` : copy.complete;
}

/** Same report and bars, now inspected locally. Each A/B series keeps its own dates and buckets. */
export function NutritionChart({ report, reference, selection, onSelect, onDate, nutrient, onNutrient, stages = false, onStages }: {
  report: NutritionReport; reference?: NutritionReport; selection: NutritionInspection;
  onSelect: (next: NutritionInspection) => void; onDate: (date: string) => void;
  nutrient: NutritionChartNutrient; onNutrient: (next: NutritionChartNutrient) => void;
  /** #531 · The «Etapas» toggle; local, it reads nothing. */
  stages?: boolean; onStages?: (next: boolean) => void;
}) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion(), { compareOn, compareText } = useProgressRange();
  const { fontScale } = useWindowDimensions();
  const [details, setDetails] = useState(false);
  const Selector = fontScale > 1.3 ? ChipGroup : ExerciseSegmented;
  const copy = NUTRIENTS[nutrient], fmt = (value: number) => valueText(nutrient, value), spoken = (value: number) => valueText(nutrient, value, true);
  const series = [{ key: 'current' as const, title: 'Período elegido', report, points: points(report, nutrient) },
    ...(compareOn && reference ? [{ key: 'reference' as const, title: `Comparación · ${compareText}`, report: reference, points: points(reference, nutrient) }] : [])];
  const activeSeries = compareOn ? selection?.series ?? 'current' : 'current';
  // The chip exists when a loaded report of A or of the active B has a label; off at first, it keeps its state across nutrient and side.
  const hasStages = series.some(s => s.report.days.some(d => stageOf(d) !== null));
  const showStages = stages && hasStages;
  const max = Math.max(1, ...series.flatMap(s => s.points.flatMap(p => [p.value ?? 0,p.target ?? 0])));
  const min = Math.min(0,...series.flatMap(s=>s.points.flatMap(p=>[p.value??0,p.target??0])));
  const source = series.find(s => s.key === selection?.series);
  const selected = source?.points.find(p => p.start === selection?.start && p.end === selection?.end);
  // The historical target of the chosen nutrient, as recorded that date; absent stays absent.
  const target = selected?.day ? copy.target(selected.day) : null;
  const rows = selected && source ? source.report.days.filter(d => d.date >= selected.start && d.date <= selected.end) : [];
  const canInspect = activeSeries !== 'reference' || !!reference;
  const prompt = canInspect ? 'Tocá una barra' : 'Comparación no disponible';
  const selectedStage = showStages && selected?.day ? stageOf(selected.day) : null;
  const selectedBlockStages = showStages && selected && !selected.day && source ? blockStages(source.report, selected.start, selected.end) : null;
  const valueWith = (show: (v: number) => string) => selected ? selected.value === null ? 'Sin dato' : `${selected.day ? '' : 'Promedio del bloque · '}${show(selected.value)}${selected.day ? '' : ' por día con dato'}` : canInspect ? 'Consultá fecha o rango, valor y cobertura sin salir del gráfico.' : 'Reintentá la lectura del período de comparación.';
  const value = valueWith(fmt), spokenValue = valueWith(spoken);
  return <View style={styles.section} testID="nutrition-progress-chart">
    <Heading level={2}>{copy.title}</Heading>
    {/* #519 · Same bars, period, A/B side and selection: only the nutrient they show changes. */}
    {/* The nutrient and the stages toggle share one row: both only change how these same bars read. */}
    <View style={styles.controls}>
      <View style={styles.selector}><Selector accessibilityLabel="Nutriente del gráfico" value={nutrient} options={[
        { value: 'calories', label: NUTRIENTS.calories.label }, { value: 'protein', label: NUTRIENTS.protein.label },
      ]} onChange={next => { if (next !== nutrient) { haptics.selection(); onNutrient(next); } }} /></View>
      {hasStages && onStages ? <Chip kind="toggle" label="Etapas" selected={stages} onPress={() => { haptics.selection(); onStages(!stages); }} /> : null}
    </View>
    {series.map(s => {
      const runs = showStages && s.report.range.days <= 31 ? stageRuns(s.points) : null;
      const bands = runs?.flatMap((r,i) => r?.first ? [{start:s.points[i].start,end:s.points[i+r.length-1].end,label:r.label}] : []) ?? [];
      return <View key={s.key} style={styles.section} testID={`nutrition-chart-series-${s.key}`}>
        <AppText variant="headline">{s.title} · {s.report.range.days <= 31 ? 'por día' : 'promedio por bloque'}</AppText>
        <AppText muted numeric variant="caption" accessibilityLabel={range(s.report.range.start,s.report.range.end)}>{shortRange(s.report.range,s.report.range.end)}</AppText>
        <FittedChart testID={`nutrition-chart-${s.key}`} label={`${copy.label} · ${s.title}`} unit={copy.unit} range={s.report.range} mode="bars" bounds={{low:min,high:max}} color={s.key==='reference'?colors.textMuted:colors.primary}
          bands={bands} selectedKey={selection?.series===s.key?selection.start:null} onSelect={key=>{
            const p=s.points.find(p=>p.start===key); if(!p)return;
            setDetails(false); onSelect(selection?.series===s.key&&selection.start===p.start?null:{series:s.key,start:p.start,end:p.end,daysOpen:false});
          }} points={s.points.map(p=>({key:p.start,start:p.start,end:p.end,value:p.value,target:p.target,partial:p.partial,soft:p.today,kind:p.value===null?'gap':'bar',
            text:`${range(p.start,p.end)}, ${p.value===null?p.day?dayState(p.day,nutrient):'sin promedio calculable':`${p.day?'':'promedio del bloque, '}${spoken(p.value)}`}${p.partial?', suma parcial':''}${p.today?', hoy en curso':''}${p.day?`, ${p.day.nutrients[nutrient].knownMeals} de ${p.day.mealCount} entradas con ${copy.short}`:`, ${p.denominator} días usados, ${p.partialDays} con suma parcial`}${showStages?p.day?`, ${stageOf(p.day)?`Etapa: ${stageOf(p.day)}`:'Sin etapa informada'}`:`, ${blockStagesText(blockStages(s.report,p.start,p.end),true)}`:''}, ${s.title}`
          }))} />
      </View>;
    })}
    {compareOn && !reference ? <AppText muted>Comparación no disponible.</AppText> : null}
    <Animated.View entering={FadeIn.duration(brandTokens.motion.duration.fast)}
      layout={reduced ? undefined : LinearTransition.duration(brandTokens.motion.duration.base)}
      style={[styles.section, selected && { padding: brandTokens.layout.cardPadding, borderRadius: radius.card, backgroundColor: colors.surfaceRaised }]} testID="nutrition-chart-inspection">
      <View accessible accessibilityLiveRegion="polite" accessibilityLabel={`${selected ? range(selected.start, selected.end) : prompt}, ${spokenValue}${source ? `, ${source.title}` : ''}${selectedBlockStages ? `, ${blockStagesText(selectedBlockStages, true)}` : ''}`}>
        {selected || !canInspect ? <>
          <AppText variant="headline">{selected ? range(selected.start, selected.end) : prompt}</AppText>
<AppText numeric variant="title1">{value}</AppText>
        </> : <AppText muted variant="footnote">Tocá una barra para ver su fecha, valor y cobertura.</AppText>}
        {/* Which side of A/B the datum is from, only when there are two: date, value and coverage come first. */}
        {compareOn && source && selected ? <AppText muted variant="caption">{source.title} · {range(source.report.range.start, source.report.range.end)}</AppText> : null}
      </View>
      {selection?.start && !selected ? <AppText muted>El dato seleccionado ya no está disponible en esta lectura. Elegí otra barra.</AppText> : null}
      {selected?.day ? <>
        {/* #519 · Date, value, then coverage: what is known about this datum, next to it. */}
        {selected.day.nutrients[nutrient].status !== 'complete' || details ? <AppText muted variant="footnote" testID="nutrition-chart-coverage">{dayState(selected.day, nutrient)}.</AppText> : null}
        {showStages ? <AppText muted variant="footnote" testID="nutrition-chart-stage">{selectedStage ? `Etapa: ${selectedStage}.` : 'Sin etapa informada.'}</AppText> : null}
        {selected.today ? <AppText variant="footnote" testID="nutrition-chart-today">Hoy está en curso: sus valores pueden cambiar y no entran en el promedio del período.</AppText> : null}
        {selected.day.mealCount === 0 && selected.day.hasNutrition ? <AppText muted variant="caption">Sin entradas de comidas para contar{selected.day.imported ? ' · registro importado' : ''}.</AppText> :
          <AppText numeric muted variant="caption">{selected.day.nutrients[nutrient].knownMeals} de {selected.day.mealCount} entradas con {copy.known} · {selected.day.nutrients[nutrient].missingMeals} sin ese dato{selected.day.imported ? ' · incluye registro importado' : ''}.</AppText>}
        <AppText numeric muted variant="caption">{target === null ? 'Sin objetivo histórico acreditado para esta fecha.' : `Objetivo registrado de esta fecha: ${fmt(target)}.`}</AppText>
        {selected.day.nutrients[nutrient].status === 'complete' ? <LinkRow kind="disclosure" expanded={details} label={details ? 'Ocultar cobertura' : 'Ver cobertura'} onPress={() => { haptics.selection(); setDetails(v => !v); }} /> : null}
        <ProgressRow testID="nutrition-chart-open-day" label={`Ver comidas de ese día, ${range(selected.start, selected.end)}`} onPress={() => onDate(selected.start)}>
          <AppText variant="body" style={[styles.grow, { color: colors.primary }]}>Ver comidas de ese día</AppText>
        </ProgressRow>
      </> : selected ? <>
        <AppText numeric muted testID="nutrition-chart-coverage">{selected.denominator} días usados de {rows.length} días del bloque · {selected.partialDays} con suma parcial.</AppText>
        {/* Already spoken by the inspection region above (and the block's bar): hidden from the reader so it is not read twice. */}
        {selectedBlockStages ? <AppText numeric muted variant="footnote" testID="nutrition-chart-stage" accessibilityElementsHidden importantForAccessibility="no">{blockStagesText(selectedBlockStages)}</AppText> : null}
        <AppText numeric muted variant="caption">{rows.filter(d => d.mealCount === 0).length} días sin entradas registradas · {rows.filter(d => d.nutrients[nutrient].status === 'unknown').length} {copy.unknown}.</AppText>
        {selected.today ? <AppText variant="footnote" testID="nutrition-chart-today">Incluye hoy en curso: este promedio de bloque puede cambiar. El promedio del período excluye hoy.</AppText> : null}
        <LinkRow kind="disclosure" expanded={selection?.daysOpen} label={selection?.daysOpen ? 'Ocultar días del bloque' : 'Ver días del bloque'}
          onPress={() => { if (selection) onSelect({ ...selection, daysOpen: !selection.daysOpen }); }} />
        {selection?.daysOpen ? <NutritionReportDays rows={rows} onDate={onDate} /> : null}
      </> : null}
    </Animated.View>
    <ChartHelp compare={compareOn} stages={hasStages} />
  </View>;
}

/**
 * #519 · The general explanations, out of the way but one tap from the chart. Opening it is local: nothing is read. What is
 * true of the selected datum (partial, today, unavailable) stays next to it, never in here.
 */
function ChartHelp({ compare, stages }: { compare: boolean; stages: boolean }) {
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
      {stages ? <AppText muted variant="footnote">Etapas: una franja tenue reúne los días seguidos con la misma etapa informada y su nombre aparece una vez. En períodos largos, el detalle del bloque cuenta los días de cada etapa.</AppText> : null}
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
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }, selector: { flexGrow: 1, flexBasis: 200 },
  stageBand: { position: 'absolute', top: 0, bottom: 0, opacity: 0.45, borderRadius: 2 },
  stageName: { position: 'absolute', top: 1 },
  help: { minHeight: brandTokens.layout.minTouch, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  helpBody: { gap: spacing.xs, paddingBottom: spacing.xs },
});
