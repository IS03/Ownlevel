import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { PeriodExploration } from '@/api/performance-insights';
import { AppText, Button, Heading, UnavailableState, spacing } from '@/design-system';
import { formatValue } from '@/progress/progress-format';
import { FactRow } from './insights-screen';
import { InsightRow } from './insight-row';
import type { InsightsOrigin } from './navigation';
import { PERIOD_NUTRIENTS } from './period-nutrition-model';
import { exactPeriodDate, exactPeriodRange } from './period-model';
import { postsText } from './feelings-model';
import { LANE_TITLE, PARTIAL_LIMIT } from './insights-model';
import { WeekRecords } from './week-records';
import { nextWeekIndex, nutrientCoverage, postValues, selectedWeeks, weekComparisonSummary, weeklyNutrient, weeklyResults, weeklyTraining, weightComparison, type ExplorationWeek, type WeekSide } from './week-comparison-model';

function WeekFact({ side, week, value, detail }: { side: WeekSide; week: ExplorationWeek; value: string; detail?: string }) {
  return <FactRow label={`Semana ${side}`} value={value} detail={`${exactPeriodRange(week)}${detail ? `. ${detail}` : ''}`} />;
}

/** One presentation over the exploration already loaded by its parent. Selection and records are route-local. */
export function WeekComparison({ data, currentWeek }: { data: PeriodExploration; currentWeek?: string }) {
  const params = useLocalSearchParams(), router = useRouter();
  const chosen = selectedWeeks(data, currentWeek, typeof params.weekA === 'string' ? params.weekA : params.weekA === undefined ? undefined : '', typeof params.weekB === 'string' ? params.weekB : params.weekB === undefined ? undefined : '');
  if (!chosen) return <UnavailableState title="Semanas fuera del período" description="Elegí de nuevo las dos semanas del período abierto." action={<Button label="Restablecer selección" onPress={() => router.setParams({ weekA: undefined, weekB: undefined, week: data.weeks.at(-1)!.start, weekSide: undefined })} />} />;
  const a = data.weeks[chosen.a]!, b = data.weeks[chosen.b]!, weight = weightComparison(a, b);
  const sides = [{ side: 'A' as const, week: a, index: chosen.a, other: chosen.b }, { side: 'B' as const, week: b, index: chosen.b, other: chosen.a }];
  const side: WeekSide | null = params.weekSide === 'A' || params.weekSide === 'B' ? params.weekSide : null;
  const recordsWeek = side === 'A' ? a : b;
  const origin: InsightsOrigin = { explore: '1', compare: '1', asOf: data.asOf, week: recordsWeek.start, weekA: a.start, weekB: b.start, ...(side ? { weekSide: side } : {}), revision: data.sourceRevision };
  return <View style={styles.content} testID="week-comparison">
    <Heading level={1}>Comparar semanas</Heading>
    <AppText numeric>{exactPeriodRange(data.period)}</AppText>
    <AppText muted>La selección inicial sigue el calendario, no los resultados. Podés elegir otras semanas.</AppText>
    {sides.map(({ side, week, index, other }) => <View key={side} style={styles.controls} testID={`week-selection-${side}`}>
      <Heading level={2}>Semana {side}</Heading><AppText numeric>{exactPeriodRange(week)}</AppText>
      {!week.wholeWeek ? <AppText muted>Semana recortada por los límites del período: {week.days.length} días.</AppText> : null}
      {([-1, 1] as const).map(direction => { const next = nextWeekIndex(data.weeks.length, index, other, direction); return <Button key={direction} variant="secondary" label={`Semana ${direction === -1 ? 'anterior' : 'siguiente'} para ${side}`} disabled={next === null}
        accessibilityHint={next === null ? undefined : `Elegir ${exactPeriodRange(data.weeks[next]!)} para ${side}`}
        onPress={() => { if (next !== null) router.setParams(side === 'A' ? { weekA: data.weeks[next]!.start } : { weekB: data.weeks[next]!.start }); }} />; })}
    </View>)}
    <Button label="Intercambiar A y B" variant="secondary" accessibilityHint={`A pasará a ${exactPeriodRange(b)} y B a ${exactPeriodRange(a)}`} onPress={() => router.setParams({ weekA: b.start, weekB: a.start })} />
    <AppText muted>Comparación de registros; no determina qué produjo el cambio.</AppText>
    <Heading level={2}>Lo que muestran los registros</Heading>
    {weekComparisonSummary(a, b).map((line, i) => <AppText key={i} numeric>{line}</AppText>)}

    <Heading level={2}>Entrenamiento registrado</Heading>
    {sides.map(({ side, week }) => { const t = weeklyTraining(week); return <WeekFact key={side} side={side} week={week} value={`${t.sessions} sesiones · ${t.days} de ${week.days.length} días`} />; })}
    <AppText muted variant="footnote">Los resultados de cada ejercicio usan su referencia compatible, que puede estar fuera de la semana. No son una comparación directa A contra B ni un cambio de fuerza.</AppText>
    {(['strict', 'partial'] as const).map(lane => <View key={lane} style={styles.content} testID={`week-comparison-${lane}`}>
      <AppText accessibilityRole="header" variant="headline">{LANE_TITLE[lane]}</AppText>
      {sides.map(({ side, week }) => { const c = weeklyResults(week, lane); return <WeekFact key={side} side={side} week={week} value={`${c.comparable} de ${c.total} comparables`}
        detail={lane === 'strict' ? `Mejoraron ${c.up}; igual ${c.same}; por debajo ${c.down}; mezclado ${c.ambiguous}; sin comparar ${c.insufficient}.` : `Registro superior ${c.up}; igual ${c.same}; inferior ${c.down}; mezclado ${c.ambiguous}; sin comparar ${c.insufficient}.`} />; })}
      {lane === 'partial' ? <AppText muted variant="footnote">{PARTIAL_LIMIT}</AppText> : null}
    </View>)}

    <Heading level={2}>Alimentación registrada</Heading>
    <AppText muted>Promedio por día con algún dato del nutriente; no por los 7 días. Los registros no prueban ingesta completa.</AppText>
    {PERIOD_NUTRIENTS.map(([key, label, unit]) => <View key={key} style={styles.content} testID={`week-nutrient-${key}`}>
      <AppText variant="headline" accessibilityRole="header">{label} por día con dato</AppText>
      {sides.map(({ side, week }) => { const n = weeklyNutrient(week, key); return <WeekFact key={side} side={side} week={week} value={formatValue(n.mean, unit)} detail={`Total conocido: ${formatValue(n.total, unit)}. ${nutrientCoverage(n)}`} />; })}
    </View>)}

    <Heading level={2}>Peso corporal</Heading>
    {sides.map(({ side, week }) => {
      const weights = week.days.filter(d => d.weight.state === 'recorded');
      const median = side === 'A' ? weight.a : weight.b;
      return <WeekFact key={side} side={side} week={week} value={median === null ? 'Sin mediana elegible' : formatValue(median, 'kg')}
        detail={`${weights.length} pesajes${weights.length ? `: ${weights.map(d => exactPeriodDate(d.date)).join(', ')}` : ''}. ${week.wholeWeek ? 'Se necesitan al menos 3 pesajes válidos.' : 'La semana está recortada; no tiene mediana.'}`} />;
    })}
    <FactRow label="Diferencia de medianas B − A" value={weight.difference === null ? 'No calculable' : formatValue(weight.difference, 'kg')}
      detail={`Separación: ${weight.weeksApart} semanas de calendario. Solo se calcula con ambas medianas elegibles; sin interpolación.`} />

    <Heading level={2}>Energía y fatiga</Heading>
    <AppText muted variant="footnote">Respuestas ordinales, sin promedios ni puntaje conjunto. El momento de respuesta usa el reloj del teléfono.</AppText>
    <AppText muted variant="footnote">Antes: hora ubicable antes del inicio o de la primera serie. Al terminar: franja de captura existente, desde el inicio hasta 2 h después del final. Tardías y sin momento comprobable se cuentan aparte.</AppText>
    {(['energy', 'fatigue'] as const).map(kind => <View key={kind} style={styles.content}>
      <AppText variant="headline" accessibilityRole="header">{kind === 'energy' ? 'Energía' : 'Fatiga'} antes</AppText>
      {sides.map(({ side, week }) => {
        const pre = week.priorFeelings?.find(f => f.kind === kind);
        return <WeekFact key={side} side={side} week={week} value={pre ? `${pre.eligible} de ${pre.sessions} sesiones` : 'No disponible en esta lectura'}
          detail={pre ? `${postsText(kind, pre.values) || 'Sin respuestas elegibles'}. ${pre.late} tardías; ${pre.timingUnknown} sin hora o sin poder ubicarla; ${pre.notRecorded} ausentes; ${pre.unreadable} ilegibles; ${pre.otherInstrument} de otra escala.` : 'Esta versión del servidor no incluye la distribución previa. Consultá las respuestas en los días y sesiones.'} />;
      })}
      <AppText variant="headline" accessibilityRole="header">{kind === 'energy' ? 'Energía' : 'Fatiga'} al terminar</AppText>
      {sides.map(({ side, week }) => { const { feeling: f, values } = postValues(week, kind); return <WeekFact key={side} side={side} week={week} value={`${f.capture.atFinish} de ${f.sessions.completed} sesiones`}
        detail={`${postsText(kind, values) || 'Sin respuestas elegibles'}. ${f.capture.late} después de 2 h; ${f.capture.captureUnknown} sin hora; ${f.capture.beforeStart} anteriores al inicio; ${f.sessions.notRecorded} ausentes; ${f.sessions.unreadable} ilegibles; ${f.sessions.otherInstrument} de otra escala.`} />; })}
    </View>)}

    <Heading level={2}>Días y registros que sostienen las cifras</Heading>
    <AppText muted>Sesiones con sus horarios y referencias; comidas previas/posteriores en sus ventanas existentes, con incertidumbre horaria. Las comidas posteriores no son antecedentes del entrenamiento.</AppText>
    {sides.map(({ side, week }) => <InsightRow key={side} label={`Ver días y registros de ${side}`} spoken={`Ver días y registros de ${side}`} expanded={params.weekSide === side} onPress={() => router.setParams({ weekSide: params.weekSide === side ? undefined : side, week: week.start })} />)}
    {side ? <View testID={`week-records-${side}`}><Heading level={2}>Registros de {side}: {exactPeriodRange(recordsWeek)}</Heading><WeekRecords week={recordsWeek} metrics={data.metrics} origin={origin} /></View> : null}
    <Button label="Volver a una semana" variant="quiet" onPress={() => router.setParams({ compare: undefined, week: b.start, weekA: undefined, weekB: undefined, weekSide: undefined })} />
  </View>;
}
const styles = StyleSheet.create({ content: { gap: spacing.sm }, controls: { gap: spacing.xs, paddingVertical: spacing.sm } });
