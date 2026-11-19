import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import type { NutritionReport, ReportDailyRow } from '@/api/nutrition-report';
import { AppIcon, AppText, Button, ChipGroup, Heading, atmosphere, brandTokens, glowGradient, pressedStyle, radius, spacing, useOwnlevelTheme, useReduceMotion } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { ExerciseSegmented } from '@/training/exercise-segmented';
import { nutritionValue as value, nutritionDifference as signed } from './nutrition-values';
import { NUTRITION_SECTIONS, type NutritionSection } from './nutrition-sections';
import { Averages, NutritionReportDays } from './nutrition-report-details';
import { ProgressRow } from './progress-row';

const count = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;
export function NutritionTopics({ report, timing, onCompare }: { report: NutritionReport; timing: ReactNode; onCompare: () => void }) {
  const router = useRouter(), { colors, isDark } = useOwnlevelTheme(), reduced = useReduceMotion();
  const { fontScale, width } = useWindowDimensions();
  const s = report.summary;
  const topics = [
    { key: 'protein', detail: s.proteinComparableDays ? `${s.proteinHitDays} de ${s.proteinComparableDays} días` : 'Sin días comparables', caption: 'Con el objetivo de esa fecha alcanzado' },
    { key: 'targets', detail: `${s.belowTargetDays} ↓ · ${s.aboveTargetDays} ↑`, caption: `${s.exactTargetDays} iguales al objetivo` },
    { key: 'macros', detail: 'P · C · G', caption: 'Cada nutriente y sus registros' },
    { key: 'balance', detail: signed(s.accumulatedBalance.value), caption: `${count(s.accumulatedBalance.denominator)} comparables · estimado` },
  ] as const;
  const open = (section: NutritionSection) => { haptics.selection(); router.push({ pathname: '/(tabs)/progress/trends/nutrition', params: { section } }); };
  return <>
    <View style={styles.section} testID="nutrition-topics">
      <Heading level={2}>Miralo por partes</Heading>
      <View style={styles.grid}>{topics.map(topic => <Pressable key={topic.key} testID={`nutrition-topic-${topic.key}`} accessibilityRole="button"
        accessibilityLabel={topic.key === 'targets' ? `Tus objetivos. ${s.belowTargetDays} días por debajo, ${s.exactTargetDays} iguales y ${s.aboveTargetDays} por encima.` : `${NUTRITION_SECTIONS[topic.key]}. ${topic.detail}. ${topic.caption}`} onPress={() => open(topic.key)}
        style={({ pressed }) => [styles.topic, fontScale > 1.3 || width < 375 ? styles.full : styles.half, {
          backgroundColor: colors.surfaceRaised,
          experimental_backgroundImage: glowGradient(atmosphere[isDark ? 'dark' : 'light'].band),
        }, pressedStyle(pressed, reduced)]}>
        <View style={styles.topicHead}><AppText variant="subheadline" style={styles.grow}>{NUTRITION_SECTIONS[topic.key]}</AppText><AppIcon name="chevronRight" color={colors.textMuted} /></View>
        <AppText numeric variant="title2">{topic.detail}</AppText>
        <AppText muted variant="footnote" style={{ color: atmosphere[isDark ? 'dark' : 'light'].bandTextMuted ?? colors.textMuted }}>{topic.caption}</AppText>
      </Pressable>)}</View>
    </View>
    <View style={styles.section} testID="nutrition-explore">
      <Heading level={2}>Explorar</Heading>
      <ProgressRow label="Día por día" onPress={() => open('days')}><AppText variant="headline" style={styles.grow}>Día por día</AppText></ProgressRow>
      {timing}
      <ProgressRow label="Comparar períodos" onPress={() => { haptics.selection(); onCompare(); }}><AppText variant="headline" style={styles.grow}>Comparar períodos</AppText></ProgressRow>
      <ProgressRow label="Etapas y objetivos históricos" onPress={() => router.push('/(tabs)/progress/stages')}><AppText variant="headline" style={styles.grow}>Etapas y objetivos históricos</AppText></ProgressRow>
      <ProgressRow label="Qué datos hay" onPress={() => open('coverage')}><AppText style={styles.grow}>Qué datos hay</AppText><AppText numeric muted variant="footnote">{report.coverage.registeredDays}/{report.range.days} días</AppText></ProgressRow>
    </View>
  </>;
}

/** Existing daily DTO fields and summary statistics, without recomputing analytics or filling gaps. */
export function NutritionTopicContent({ section, report, onDate }: { section: NutritionSection; report: NutritionReport; onDate: (date: string) => void }) {
  const [filter, setFilter] = useState<'all' | 'data' | 'partial' | 'missing'>('all');
  const [limit, setLimit] = useState(20);
  const [macro, setMacro] = useState<'protein' | 'carbs' | 'fat'>('protein');
  const { fontScale, width } = useWindowDimensions(), reduced = useReduceMotion();
  const s = report.summary, c = report.coverage;
  const nutrient = section === 'protein' ? 'protein' : section === 'macros' ? macro : 'calories';
  const comparableValue = (day: ReportDailyRow) => section === 'balance' ? day.energyBalanceKcal : section === 'targets' ? day.targetDeviationKcal : day.nutrients[nutrient].value;
  const filterLabel = section === 'balance' ? 'balance estimado' : section === 'targets' ? 'diferencia con el objetivo'
    : { protein: 'proteína', carbs: 'carbohidratos', fat: 'grasas', calories: 'calorías' }[nutrient];
  const filtered = report.days.filter(day => filter === 'all' || filter === 'data' && comparableValue(day) !== null
    || filter === 'partial' && day.nutrients[nutrient].status === 'partial' || filter === 'missing' && comparableValue(day) === null);
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  const Selector = fontScale > 1.3 ? ChipGroup : ExerciseSegmented;
  const rowFact = (day: ReportDailyRow) => section === 'macros' ? `${day.nutrients[nutrient].status === 'partial' ? 'Suma parcial' : day.nutrients[nutrient].status === 'unknown' ? 'Nutriente sin informar' : day.mealCount === 0 ? day.hasNutrition ? 'Registro nutricional sin desglose de comidas' : 'Sin registro' : `${day.nutrients[nutrient].knownMeals} de ${day.mealCount} comidas con dato`}` : section === 'protein'
    ? `Objetivo: ${value(day.targetProteinG, 'g')}${day.nutrients.protein.status === 'partial' ? ' · suma parcial' : ''}`
    : section === 'targets' ? `Objetivo: ${value(day.targetCalories, 'kcal')} · diferencia ${signed(day.targetDeviationKcal)}${day.nutrients.calories.status === 'partial' ? ' · calorías parciales' : ''}`
    : `Registradas: ${value(day.nutrients.calories.value, 'kcal')} · gasto estimado: ${value(day.expenditureKcal, 'kcal')}${day.nutrients.calories.status === 'partial' ? ' · calorías parciales' : ''}`;
  const stacked = fontScale > 1.3 || width < 375;
  const rowValue = (day: ReportDailyRow) => section === 'protein' || section === 'macros' ? value(day.nutrients[nutrient].value, 'g')
    : section === 'targets' ? value(day.nutrients.calories.value, 'kcal') : signed(day.energyBalanceKcal);
  if (section === 'coverage') return <View style={styles.section} testID="nutrition-topic-content">
    <Heading level={2}>Cobertura del período</Heading>
    <AppText numeric>{c.completedRegisteredDays} de {c.finalizedDays} días finalizados con registro.</AppText>
    <AppText muted>{c.missingDays} días sin registro{c.todayRegistered ? ' · hoy tiene datos en curso' : ''}.</AppText>
    {(['calories', 'protein', 'carbs', 'fat'] as const).map((k, i) => <View key={k} style={styles.fact}>
      <AppText variant="headline">{['Calorías', 'Proteína', 'Carbohidratos', 'Grasas'][i]}</AppText>
      <AppText muted numeric variant="footnote">{c.nutrients[k].knownDays} días con dato · {c.nutrients[k].partialDays} parciales · {c.nutrients[k].unknownDays} desconocidos</AppText>
    </View>)}
    <AppText muted variant="footnote">Completo entre las comidas registradas no confirma toda la ingesta. Una suma parcial incluye solo lo conocido.</AppText>
    {report.highlights.length ? <Heading level={2}>Días destacados</Heading> : null}
    {report.highlights.map(h => <ProgressRow key={h.kind} label={`${h.title}, ${h.date}`} onPress={() => onDate(h.date)}><AppText style={styles.grow}>{h.title}</AppText><AppText muted numeric variant="footnote">{h.date.split('-').reverse().join('/')}</AppText></ProgressRow>)}
  </View>;
  return <View style={styles.section} testID="nutrition-topic-content">
    {section === 'protein' ? <>
      <AppText numeric variant="heroNumber">{value(s.metrics.protein.value, 'g')}</AppText>
      <AppText muted numeric variant="footnote">Por día · {count(s.metrics.protein.denominator)} con dato{s.metrics.protein.partialDays ? ` · ${s.metrics.protein.partialDays} parciales` : ''} · sin contar hoy</AppText>
      <AppText numeric>{s.proteinHitDays} de {s.proteinComparableDays} días comparables con objetivo alcanzado.</AppText>
      <AppText muted numeric variant="footnote">Objetivo histórico medio: {value(s.metrics.targetProtein.value, 'g')} · {count(s.metrics.targetProtein.denominator)}</AppText>
    </> : section === 'targets' ? <>
      <View style={[styles.figures, fontScale > 1.3 && styles.stacked]}>{[[s.belowTargetDays, 'Por debajo'], [s.exactTargetDays, 'Iguales'], [s.aboveTargetDays, 'Por encima']].map(([n, text]) => <View key={text} style={styles.grow}><AppText numeric variant="title2">{n}</AppText><AppText muted variant="footnote">{text}</AppText></View>)}</View>
      <Averages report={report} includeMacros={false} />
    </> : section === 'balance' ? <>
      <AppText numeric variant="largeTitle">{signed(s.accumulatedBalance.value)}</AppText>
      <AppText muted numeric>{count(s.accumulatedBalance.denominator)} usados · estimado acumulado</AppText>
      <AppText muted variant="footnote">Calorías registradas menos gasto estimado de cada fecha. No predice un cambio de peso.</AppText>
      <AppText muted numeric variant="footnote">{s.deficitDays} con déficit · {s.neutralDays} neutros · {s.surplusDays} con superávit</AppText>
    </> : section === 'macros' ? <>
      <Heading level={2}>Promedio registrado por día</Heading>
      {(['protein', 'carbs', 'fat'] as const).map((k, i) => <View key={k} style={styles.fact}><AppText variant="headline">{['Proteína', 'Carbohidratos', 'Grasas'][i]}</AppText><AppText numeric variant="title2">{value(s.metrics[k].value, 'g')}</AppText><AppText muted numeric variant="footnote">{count(s.metrics[k].denominator)} con dato · {s.metrics[k].partialDays} parciales</AppText></View>)}
      <AppText muted variant="footnote">Cada nutriente conserva sus días utilizados. Hoy queda fuera del promedio.</AppText>
    </> : null}
    <View style={styles.section}>
      <Heading level={2}>Registros del período</Heading>
      {section === 'macros' ? <Selector accessibilityLabel="Macronutriente de los registros" value={macro} options={[{ value: 'protein', label: 'Proteína' }, { value: 'carbs', label: 'Carbos' }, { value: 'fat', label: 'Grasas' }]}
        onChange={next => { haptics.selection(); setMacro(next); setLimit(20); }} /> : null}
      <Selector accessibilityLabel="Filtrar días nutricionales" value={filter} options={[{ value: 'all', label: 'Todos' }, { value: 'data', label: 'Con dato' }, { value: 'partial', label: 'Parciales' }, { value: 'missing', label: 'Sin dato' }]}
        onChange={next => { haptics.selection(); setFilter(next); setLimit(20); }} />
      <AppText muted numeric variant="caption">{count(sorted.length)}{filter !== 'all' ? ` · ${filterLabel}` : ''}</AppText>
      <Animated.View key={filter} entering={FadeIn.duration(reduced ? brandTokens.motion.duration.fast : brandTokens.motion.duration.base)} layout={reduced ? undefined : LinearTransition.duration(brandTokens.motion.duration.base)}>
        {sorted.length ? section === 'days' ? <NutritionReportDays rows={sorted.slice(0, limit)} onDate={onDate} />
          : sorted.slice(0, limit).map(day => <ProgressRow key={day.date} label={`${day.date.split('-').reverse().join('/')}. ${rowValue(day) === '—' ? 'sin dato' : rowValue(day)}. ${rowFact(day)}${day.isToday ? ' · hoy en curso' : ''}`} onPress={() => onDate(day.date)}>
            <View style={styles.grow}><AppText numeric variant="headline">{day.date.split('-').reverse().join('/')}</AppText>{stacked ? <AppText numeric variant="headline">{rowValue(day)}</AppText> : null}<AppText muted numeric variant="footnote">{rowFact(day)}</AppText>{day.isToday ? <AppText muted variant="caption">Hoy en curso</AppText> : null}</View>
            {stacked ? null : <AppText numeric variant="headline">{rowValue(day)}</AppText>}
          </ProgressRow>) : <AppText muted>No hay días con este filtro.</AppText>}
      </Animated.View>
      {sorted.length > limit ? <Button label="Ver más días" variant="quiet" onPress={() => setLimit(n => n + 20)} /> : null}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: spacing.md }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  topic: { padding: brandTokens.layout.cardPadding, borderRadius: radius.card, gap: spacing.md, overflow: 'hidden' },
  topicHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, half: { width: '47%', flexGrow: 1 }, full: { width: '100%' },
  grow: { flex: 1, gap: spacing.xs }, figures: { flexDirection: 'row', gap: spacing.md }, stacked: { flexDirection: 'column' },
  fact: { gap: spacing.xs, paddingVertical: spacing.sm },
});
