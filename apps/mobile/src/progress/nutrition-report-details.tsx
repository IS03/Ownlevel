import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import {
  REPORT_NUTRIENTS,
  type NutritionReport,
  type ReportDailyRow,
} from '@/api/nutrition-report';
import { AppIcon, AppText, Heading, brandTokens, spacing, useOwnlevelTheme, useReduceMotion, type AppIconName } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { formatDelta, formatValue } from './progress-format';
import { ProgressRow } from './progress-row';

const NAMES = { calories: 'Calorías', protein: 'Proteína', carbs: 'Carbohidratos', fat: 'Grasas' } as const;
const kcal = (v: number | null) => (v === null ? '—' : formatValue(v, 'kcal', 'integer'));
const grams = (v: number | null) => (v === null ? '—' : formatValue(v, 'g', 'integer'));
const signed = (v: number | null, unit: string) => (v === null ? '—' : formatDelta(Math.round(v), unit, 'integer'));
const days = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
/** "jue 1 oct": short and recognizable, never locale-dependent. */
function dayLabel(date: string, weekday = true) {
  const [y, m, d] = date.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${weekday ? `${WEEKDAYS[w]} ` : ''}${d} ${MONTHS[m - 1]}`;
}

/**
 * A value against its target as a bar from zero: the fill is what you ate (champagne), the tick is the target.
 * Over the target the bar keeps going and the tick stays where the target is; no color judges it (IDENTIDAD.md).
 */
function TargetBar({ value, target, testID }: { value: number; target: number | null; testID?: string }) {
  const { colors } = useOwnlevelTheme();
  const scale = Math.max(value, target ?? 0, 1) * 1.08;
  return <View style={[styles.track, { backgroundColor: colors.surfaceRaised }]} testID={testID}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={[styles.fill, { width: `${(value / scale) * 100}%`, backgroundColor: colors.primary }]} />
    {target !== null ? <View style={[styles.tick, { left: `${(target / scale) * 100}%`, backgroundColor: colors.text }]} /> : null}
  </View>;
}

/** The energy of the day split by macro (4/4/9 kcal per gram), with each macro's grams; the bar shows the share. */
function MacroSplit({ protein, carbs, fat, proteinTarget }: { protein: number | null; carbs: number | null; fat: number | null; proteinTarget: number | null }) {
  const { colors } = useOwnlevelTheme();
  const parts = [
    { key: 'protein', name: 'Proteína', g: protein, kcal: protein === null ? 0 : protein * 4, opacity: 1 },
    { key: 'carbs', name: 'Carbos', g: carbs, kcal: carbs === null ? 0 : carbs * 4, opacity: 0.55 },
    { key: 'fat', name: 'Grasas', g: fat, kcal: fat === null ? 0 : fat * 9, opacity: 0.28 },
  ];
  const total = parts.reduce((t, p) => t + p.kcal, 0);
  if (!total) return null;
  return <View style={styles.block} testID="nutrition-macro-split">
    <View style={[styles.split, { backgroundColor: colors.surfaceRaised }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {parts.map(p => p.kcal ? <View key={p.key} style={{ flex: p.kcal, backgroundColor: colors.primary, opacity: p.opacity }} /> : null)}
    </View>
    <View style={styles.macros}>
      {parts.map(p => <View key={p.key} style={styles.macro} accessible
        accessibilityLabel={`${p.name}: ${grams(p.g)} por día, ${Math.round((p.kcal / total) * 100)} % de las calorías${p.key === 'protein' && proteinTarget !== null ? `, objetivo ${grams(proteinTarget)}` : ''}`}>
        <View style={styles.legend}>
          <View style={[styles.swatch, { backgroundColor: colors.primary, opacity: p.opacity }]} />
          <AppText muted variant="footnote">{p.name}</AppText>
        </View>
        <AppText numeric variant="headline">{grams(p.g)}</AppText>
        <AppText muted numeric variant="caption">
          {Math.round((p.kcal / total) * 100)}{' '}%{p.key === 'protein' && proteinTarget !== null ? ` · obj. ${grams(proteinTarget)}` : ''}
        </AppText>
      </View>)}
    </View>
  </View>;
}

/** Eaten, target, expenditure and the two differences, side by side with the scale they share. */
function Averages({ report }: { report: NutritionReport }) {
  const s = report.summary.metrics;
  const base = s.calories.denominator;
  const eaten = s.calories.value, target = s.targetCalories.value, spent = s.expenditure.value;
  const own = (k: keyof typeof s) => s[k].denominator !== base ? ` · ${days(s[k].denominator)}` : '';
  return <View style={styles.section} testID="nutrition-progress-detail">
    <Heading level={2}>Promedio por día</Heading>
    <AppText muted numeric variant="footnote">
      {days(base)} terminados con dato{s.calories.partialDays ? ` · ${s.calories.partialDays} con suma parcial` : ''}. El objetivo y el gasto son los de cada día.
    </AppText>
    {eaten !== null ? <View style={styles.block}>
      <View style={styles.headRow}>
        <AppText variant="body">Calorías</AppText>
        <AppText numeric variant="headline">{kcal(eaten)}</AppText>
      </View>
      <TargetBar value={eaten} target={target} testID="nutrition-kcal-bar" />
      <View style={styles.facts}>
        <Fact label="Objetivo" value={kcal(target) + own('targetCalories')} detail={`diferencia ${signed(s.targetDeviation.value, 'kcal')}`} />
        <Fact label="Gasto estimado" value={kcal(spent) + own('expenditure')} detail={`balance ${signed(s.balance.value, 'kcal')}`} />
      </View>
    </View> : <AppText muted>Sin días terminados con calorías en este período.</AppText>}
    <MacroSplit protein={s.protein.value} carbs={s.carbs.value} fat={s.fat.value} proteinTarget={s.targetProtein.value} />
  </View>;
}
function Fact({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <View style={styles.fact} accessible accessibilityLabel={`${label}: ${value}, ${detail}`}>
    <AppText muted variant="footnote">{label}</AppText>
    <AppText numeric variant="subheadline">{value}</AppText>
    <AppText muted numeric variant="caption">{detail}</AppText>
  </View>;
}

const HIGHLIGHT: Record<NutritionReport['highlights'][number]['kind'], { icon: AppIconName; value: (d: ReportDailyRow) => string }> = {
  closest_target: { icon: 'checkmark', value: d => `${d.nutrients.calories.value === null ? '—' : formatValue(d.nutrients.calories.value, null, 'integer')} de ${kcal(d.targetCalories)}` },
  largest_balance: { icon: 'flame', value: d => `balance ${signed(d.energyBalanceKcal, 'kcal')}` },
  highest_protein: { icon: 'nutrition', value: d => grams(d.nutrients.protein.value) },
};

/** One flat row per day: date, calories and protein; tapping opens that day in Nutrición. */
function DayRow({ d, onDate, divided }: { d: ReportDailyRow; onDate: (date: string) => void; divided: boolean }) {
  const { colors } = useOwnlevelTheme();
  const partial = d.nutrients.calories.status === 'partial' || d.nutrients.protein.status === 'partial';
  const label = d.hasNutrition
    ? `${dayLabel(d.date)}${d.isToday ? ', en curso' : ''}: ${kcal(d.nutrients.calories.value)}, proteína ${grams(d.nutrients.protein.value)}${partial ? ', suma parcial' : ''}`
    : `${dayLabel(d.date)}: sin registro`;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Abre el día en Nutrición" onPress={() => onDate(d.date)}
    style={({ pressed }) => [styles.dayRow, divided && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, pressed && { opacity: 0.6 }]}>
    <AppText numeric variant="subheadline" style={styles.dayDate}>{dayLabel(d.date)}</AppText>
    {d.hasNutrition ? <>
      <AppText numeric variant="subheadline" style={styles.dayValue}>{kcal(d.nutrients.calories.value)}{partial ? '*' : ''}</AppText>
      <AppText muted numeric variant="subheadline" style={styles.dayValue}>{grams(d.nutrients.protein.value)}</AppText>
    </> : <AppText muted variant="subheadline" style={styles.dayEmpty}>{d.isToday ? 'en curso' : 'sin registro'}</AppText>}
    <AppIcon name="chevronRight" color={colors.textMuted} size={15} />
  </Pressable>;
}

/** Collapsed by default: a quiet header that opens a compact list, never a wall of cards. */
function Disclosure({ title, detail, open, onToggle, children, testID }: {
  title: string; detail: string; open: boolean; onToggle: () => void; children: React.ReactNode; testID: string;
}) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion();
  return <Animated.View layout={reduced ? undefined : LinearTransition.duration(brandTokens.motion.duration.base)} style={styles.section} testID={testID}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${title}. ${detail}`}
      onPress={() => { haptics.selection(); onToggle(); }} style={({ pressed }) => [styles.disclosure, pressed && { opacity: 0.6 }]}>
      <View style={styles.grow}><AppText variant="headline">{title}</AppText><AppText muted numeric variant="footnote">{detail}</AppText></View>
      <AppIcon name={open ? 'chevronDown' : 'chevronRight'} color={colors.textMuted} size={17} />
    </Pressable>
    {open ? <Animated.View entering={FadeIn.duration(reduced ? 0 : 200)} exiting={FadeOut.duration(reduced ? 0 : 150)}>{children}</Animated.View> : null}
  </Animated.View>;
}

/** "Por semana" or "Por mes", from how long the blocks are. */
function blockTitle(report: NutritionReport) {
  const b = report.evolution.find(x => x.start !== x.end);
  if (!b) return 'Por bloque';
  const span = (Date.parse(`${b.end}T12:00:00Z`) - Date.parse(`${b.start}T12:00:00Z`)) / 86_400_000 + 1;
  return span <= 7 ? 'Por semana' : 'Por mes';
}

/** All information from report-screen remains available, organized: averages, days, highlights, then the per-week and per-day lists. */
export function NutritionReportDetails({ report, onDate }: { report: NutritionReport; onDate: (date: string) => void }) {
  const { colors } = useOwnlevelTheme();
  const [daily, setDaily] = useState(false), [blocks, setBlocks] = useState(false);
  const { summary: s, coverage: c } = report;
  const byDate = new Map(report.days.map(d => [d.date, d]));
  // Only nutrients that are missing somewhere get a word; complete coverage needs none.
  const gaps = REPORT_NUTRIENTS.filter(k => c.nutrients[k].partialDays || c.nutrients[k].unknownDays);
  const sorted = [...report.days].sort((a, b) => b.date.localeCompare(a.date));
  return <>
    <Averages report={report} />
    <View style={styles.section} testID="nutrition-progress-days">
      <Heading level={2}>Tus días</Heading>
      <ProgressRow label={`Días con registro: ${c.registeredDays} de ${report.range.days}`}>
        <View style={styles.grow}>
          <AppText>Días con registro</AppText>
          <AppText muted numeric variant="caption">
            {c.missingDays ? `${days(c.missingDays)} sin registro` : c.registeredDays >= report.range.days ? 'Todos los días' : 'Hoy, todavía sin registro'}
            {gaps.length ? ` · faltan datos de ${gaps.map(k => NAMES[k].toLocaleLowerCase('es-AR')).join(', ')} en algunos` : ''}
          </AppText>
        </View>
        <AppText numeric variant="headline">{c.registeredDays} de {report.range.days}</AppText>
      </ProgressRow>
      <ProgressRow label={`Proteína cumplida: ${s.proteinHitDays} de ${s.proteinComparableDays} días`}>
        <View style={styles.grow}><AppText>Proteína cumplida</AppText><AppText muted variant="caption">Días con el objetivo de proteína alcanzado</AppText></View>
        <AppText numeric variant="headline">{s.proteinHitDays} de {s.proteinComparableDays}</AppText>
      </ProgressRow>
      <ProgressRow label={`Respecto del objetivo: ${s.belowTargetDays} por debajo, ${s.exactTargetDays} iguales, ${s.aboveTargetDays} por encima`}>
        <View style={styles.grow}><AppText>Respecto del objetivo</AppText>
          <AppText muted numeric variant="caption">{s.belowTargetDays} por debajo · {s.exactTargetDays} iguales · {s.aboveTargetDays} por encima</AppText></View>
      </ProgressRow>
      <ProgressRow label={`Balance acumulado: ${signed(s.accumulatedBalance.value, 'kcal')}`}>
        <View style={styles.grow}><AppText>Balance acumulado</AppText>
          <AppText muted numeric variant="caption">{s.deficitDays} con déficit · {s.neutralDays} neutros · {s.surplusDays} con superávit</AppText></View>
        <AppText numeric variant="headline">{signed(s.accumulatedBalance.value, 'kcal')}</AppText>
      </ProgressRow>
      {s.goalStages.length ? <ProgressRow label={`Etapa: ${s.goalStages.join(', ')}`}>
        <AppText style={styles.grow}>{s.goalStages.length === 1 ? 'Etapa' : 'Etapas'}</AppText>
        <AppText numeric variant="headline">{s.goalStages.join(', ')}</AppText>
      </ProgressRow> : null}
    </View>
    {report.highlights.length ? <View style={styles.section} testID="nutrition-progress-highlights">
      <Heading level={2}>Días destacados</Heading>
      {report.highlights.map(h => {
        const d = byDate.get(h.date), meta = HIGHLIGHT[h.kind];
        const value = d ? meta.value(d) : '';
        return <ProgressRow key={h.kind} label={`${h.title}: ${dayLabel(h.date)}${value ? `, ${value}` : ''}`} onPress={() => onDate(h.date)}>
          <AppIcon name={meta.icon} color={colors.primary} size={20} />
          <View style={styles.grow}><AppText>{h.title}</AppText><AppText muted numeric variant="caption">{dayLabel(h.date)}</AppText></View>
          {value ? <AppText numeric variant="subheadline">{value}</AppText> : null}
        </ProgressRow>;
      })}
    </View> : null}
    {/* Blocks only add something when they group several days (3 months or more); daily blocks repeat "Día por día". */}
    {report.evolution.length > 1 && report.evolution.some(b => b.start !== b.end) ? <Disclosure testID="nutrition-progress-blocks" title={blockTitle(report)} open={blocks} onToggle={() => setBlocks(v => !v)}
      detail={`${report.evolution.length} bloques · calorías, proteína y balance`}>
      <View style={styles.tableHead}><AppText muted variant="caption" style={styles.dayDate}>Desde</AppText>
        <AppText muted variant="caption" style={styles.dayValue}>kcal</AppText><AppText muted variant="caption" style={styles.dayValue}>proteína</AppText>
        <AppText muted variant="caption" style={styles.dayValue}>balance</AppText></View>
      {report.evolution.map((b, i) => <View key={b.start} accessible style={[styles.dayRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}
        accessibilityLabel={`${dayLabel(b.start, false)} al ${dayLabel(b.end, false)}${b.includesToday ? ', en curso' : ''}: ${kcal(b.metrics.calories.value)}, proteína ${grams(b.metrics.protein.value)}, balance ${signed(b.metrics.balance.value, 'kcal')}`}>
        <AppText numeric variant="subheadline" style={styles.dayDate}>{dayLabel(b.start, false)}{b.includesToday ? ' ·' : ''}</AppText>
        <AppText numeric variant="subheadline" style={styles.dayValue}>{b.metrics.calories.value === null ? '—' : formatValue(b.metrics.calories.value, null, 'integer')}</AppText>
        <AppText numeric variant="subheadline" style={styles.dayValue}>{grams(b.metrics.protein.value)}</AppText>
        <AppText muted numeric variant="subheadline" style={styles.dayValue}>{b.metrics.balance.value === null ? '—' : formatDelta(Math.round(b.metrics.balance.value), null, 'integer')}</AppText>
      </View>)}
      {report.evolution.some(b => b.includesToday) ? <AppText muted variant="caption">· la semana en curso todavía puede cambiar.</AppText> : null}
    </Disclosure> : null}
    <Disclosure testID="nutrition-progress-daily" title="Día por día" open={daily} onToggle={() => setDaily(v => !v)}
      detail={`${days(report.days.length)} · tocá uno para abrirlo`}>
      <View style={styles.tableHead}><AppText muted variant="caption" style={styles.dayDate}>Día</AppText>
        <AppText muted variant="caption" style={styles.dayValue}>kcal</AppText><AppText muted variant="caption" style={styles.dayValue}>proteína</AppText>
        <View style={styles.chevronRoom} /></View>
      {sorted.map((d, i) => <DayRow key={d.date} d={d} onDate={onDate} divided={i > 0} />)}
      {sorted.some(d => d.nutrients.calories.status === 'partial') ? <AppText muted variant="caption">* suma parcial: solo incluye los nutrientes conocidos.</AppText> : null}
    </Disclosure>
  </>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  block: { gap: spacing.sm, paddingTop: spacing.xs },
  grow: { flex: 1, gap: 2 },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  track: { height: 10, borderRadius: 5, overflow: 'visible', justifyContent: 'center' },
  fill: { height: 10, borderRadius: 5 },
  tick: { position: 'absolute', width: 2, height: 18, marginLeft: -1, borderRadius: 1, opacity: 0.7 },
  facts: { flexDirection: 'row', gap: spacing.lg },
  fact: { flex: 1, gap: 2 },
  split: { height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', gap: 2 },
  macros: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  macro: { flexGrow: 1, flexBasis: 90, gap: 2 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  disclosure: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tableHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.xs },
  dayRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  dayDate: { flex: 1.3 },
  dayValue: { flex: 1, textAlign: 'right' },
  dayEmpty: { flex: 2, textAlign: 'right' },
  chevronRoom: { width: 15 },
});
