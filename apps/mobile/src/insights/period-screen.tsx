import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useCallback, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { fetchInsightsPinnedPeriod, validPeriodAnchor } from '@/api/performance-insights';
import { AppText, Button, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, brandTokens, spacing, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { useProgressResource } from '@/progress/use-progress-resource';
import { weeklyRows } from '@/progress/weekly-weights';
import { FactRow } from './insights-screen';
import { InsightRow } from './insight-row';
import { bodyWeightHref, periodDetailHref, explorationHref } from './navigation';
import { usePeriodReturn } from './use-period-return';
import { FACTS_ONLY, exactPeriodDate, feelingRows, nutritionRows, periodEmpty, periodHeading, periodSentences, routineRows, trainingRows } from './period-model';

const Section = ({ title }: { title: string }) => <AppText muted variant="footnote" style={styles.section} accessibilityRole="header">{title}</AppText>;

/** Insights → the last three whole months: facts with their figures, each part with its own method, and one tap to each detail. */
export function PeriodScreen() {
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const routeAnchor = validPeriodAnchor(params.asOf) ? params.asOf : undefined;
  const anchor = useRef<{ client: MobileApiClient; route: string | undefined; captured: string } | null>(null);
  const load = useCallback(async (c: MobileApiClient, signal: AbortSignal) => {
    const asOf = anchor.current?.client === c && anchor.current.route === routeAnchor ? anchor.current.captured : routeAnchor;
    const result = await fetchInsightsPinnedPeriod(c, asOf, signal);
    if (result.status === 'ok' && !signal.aborted) anchor.current = { client: c, route: routeAnchor, captured: result.data.asOf };
    return result;
  }, [routeAnchor]);
  const invalidAnchor = params.asOf !== undefined && !routeAnchor;
  const { state, data, refresh } = useProgressResource(invalidAnchor ? null : client, `performance-insights|period-at|${routeAnchor ?? 'current'}`, load);
  usePeriodReturn(refresh);
  const refreshControl = <RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />;
  const scroll = (children: React.ReactNode) => <ScrollView testID="period-screen" contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll} refreshControl={refreshControl}>{children}</ScrollView>;
  if (invalidAnchor) return scroll(<UnavailableState title="No pudimos identificar el período" description="Volvé a abrir el resumen desde Insights." />);
  if (state.status === 'loading' && !data) return scroll(<View style={styles.block} testID="period-loading"><SkeletonBlock height={72} /><SkeletonBlock height={132} /><SkeletonBlock height={176} /></View>);
  if (!data || data.integrity !== 'valid') return scroll(<UnavailableState title="Uy, no pudimos leer tus datos" description="Tranqui: está todo guardado." action={<Button label="Reintentar" onPress={() => void refresh()} />} />);
  const heading = periodHeading(data);
  const open = (href: Parameters<typeof router.push>[0]) => { haptics.selection(); router.push(href); };
  if (periodEmpty(data)) return scroll(<View style={styles.block} testID="period-empty">
    {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    <Heading level={2}>Sin registros en estos tres meses</Heading>
    <AppText muted numeric>{heading.range}. {heading.months}</AppText>
    <InsightRow label="Recorrer semanas y días" spoken="Recorrer semanas y días de estos mismos tres meses" onPress={()=>open(explorationHref(data.asOf,undefined,data.sourceRevision))}/>
    <InsightRow label="Ver energía y fatiga del período" spoken="Ver energía y fatiga de los mismos tres meses" onPress={() => open(periodDetailHref('feelings', data.asOf, data.sourceRevision))} />
    <InsightRow label="Ver los días con alimentación registrada" spoken="Ver los días con alimentación registrada de los mismos tres meses" onPress={() => open(periodDetailHref('nutrition', data.asOf, data.sourceRevision))} />
    <InsightRow label="Ver Cómo terminaste" detail="En todo tu historial, según cómo empezaste" spoken="Ver Cómo terminaste, en todo tu historial" onPress={() => open('/(tabs)/train/insights/feelings')} />
  </View>);
  const weeks = weeklyRows(data.weight, data.today);
  return scroll(<>
    {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    <View style={styles.block}>
      <Heading level={2}>Últimos 3 meses</Heading>
      <AppText numeric testID="period-range">{heading.range}</AppText>
      <AppText muted variant="footnote">{heading.months}</AppText>
      <InsightRow label="Recorrer semanas y días" spoken="Recorrer semanas y días de estos mismos tres meses" onPress={()=>open(explorationHref(data.asOf,undefined,data.sourceRevision))}/>
      {data.asOf.slice(0, 7) !== data.today.slice(0, 7) ? <AppText muted>Conservamos el período que abriste el {exactPeriodDate(data.asOf)}.</AppText> : null}
    </View>
    <View style={styles.block} testID="period-written">
      {periodSentences(data).map(sentence => <AppText key={sentence} numeric>{sentence}</AppText>)}
      <AppText muted variant="footnote">{FACTS_ONLY}</AppText>
    </View>
    <View testID="period-training">
      <Section title="Entrenamiento" />
      {trainingRows(data).map(row => <FactRow key={row.key} label={row.label} value={row.value} detail={row.detail} />)}
      {routineRows(data, data.today).map(row => <FactRow key={row.key} label={row.label} value={row.value} detail={row.detail} />)}
      {data.routines.order === 'alternating' ? <AppText muted variant="caption" style={styles.note}>Las rutinas se alternaron: no hay un orden de una a otra.</AppText> : null}
      <InsightRow label="Ver los días en Insights" spoken="Ver los días en Insights" onPress={() => open('/(tabs)/train/insights')} />
    </View>
    <View testID="period-feelings">
      <Section title="Sensaciones al terminar" />
      {feelingRows(data).map(row => <FactRow key={row.key} label={row.label} value={row.value} detail={row.detail} />)}
      <InsightRow label="Ver energía y fatiga del período" spoken="Ver energía y fatiga de los mismos tres meses" onPress={() => open(periodDetailHref('feelings', data.asOf, data.sourceRevision))} />
      <InsightRow label="Ver Cómo terminaste" detail="En todo tu historial, según cómo empezaste" spoken="Ver Cómo terminaste, en todo tu historial" onPress={() => open('/(tabs)/train/insights/feelings')} />
    </View>
    <View testID="period-nutrition">
      <Section title={`Comidas registradas · ${data.nutrition.daysWithMeals} de ${data.period.days} días`} />
      {nutritionRows(data).map(row => <FactRow key={row.key} label={row.label} value={row.value} detail={row.detail} />)}
      <AppText muted variant="caption" style={styles.note}>Un día sin comidas registradas no cuenta como cero.</AppText>
      <InsightRow label="Ver los días con alimentación registrada" spoken="Ver los días con alimentación registrada de los mismos tres meses" onPress={() => open(periodDetailHref('nutrition', data.asOf, data.sourceRevision))} />
    </View>
    <View testID="period-weight">
      <Section title="Peso, semana a semana" />
      {weeks.length ? weeks.map(row => <FactRow key={row.key} label={row.label} value={row.value} detail={row.detail} spoken={row.spoken} />)
        : <AppText muted variant="footnote">Sin semanas enteras en el período.</AppText>}
      {data.weight.weighIns && !weeks.some(row => row.value !== 'Sin mediana') ? <AppText muted variant="footnote" testID="period-weight-insufficient">Ninguna semana tiene 3 pesajes: no hay medianas para comparar.</AppText> : null}
      <InsightRow label="Ver tu peso en Cuerpo" detail="Los mismos tres meses" spoken="Ver tu peso en Cuerpo, en los mismos tres meses" onPress={() => open(bodyWeightHref({ from: data.period.start, to: data.period.end }, { summary: '1', asOf: data.asOf }))} />
    </View>
  </>);
}

const styles = StyleSheet.create({
  scroll: { alignSelf: 'center', flexGrow: 1, gap: spacing.xl, maxWidth: 720, padding: brandTokens.layout.screenPadding, paddingBottom: 120, width: '100%' },
  block: { gap: spacing.sm },
  section: { paddingTop: spacing.sm, paddingBottom: spacing.xs },
  note: { paddingTop: spacing.xs },
});
