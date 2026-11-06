import { useCallback, useState } from 'react';
import { LayoutChangeEvent, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { fetchInsightsRelation, type InsightsRelationDetail } from '@/api/performance-insights';
import { AppText, Button, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, brandTokens, spacing, useOwnlevelTheme } from '@/design-system';
import { formatValue } from '@/progress/progress-format';
import { useProgressResource } from '@/progress/use-progress-resource';
import { FactRow } from './insights-screen';
import { InsightRow } from './insight-row';
import { bodyWeightHref, metricTrendHref } from './navigation';
import { exposureMeaning, LANE_TITLE, PARTIAL_LIMIT, coverageText, dayLabel, exclusionRows, exposureUnit, groupRows, relationName, relationSentence, relationState, sameRead, shareText, type Lane } from './insights-model';

type Pair = NonNullable<InsightsRelationDetail['pairs']>[number];
const PLOT = 180, DOT = 8, LIST_STEP = 60;

/** Each point is a day. Zero and negative values keep their place: the axes span what was recorded, with no trend line or ideal range. */
function Plot({ pairs, summary }: { pairs: readonly Pair[]; summary: string }) {
  const { colors } = useOwnlevelTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const xs = pairs.map(pair => pair.exposure), low = Math.min(...xs), high = Math.max(...xs), span = high - low;
  return <View accessible accessibilityRole="image" accessibilityLabel={summary} onLayout={onLayout} testID="relation-plot"
    style={[styles.plot, { borderColor: colors.border }]}>
    {width ? pairs.map(pair => <View key={pair.date} testID="relation-dot" style={{ position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: colors.primary,
      left: (span ? (pair.exposure - low) / span : 0.5) * (width - DOT), top: (1 - pair.outcome) * (PLOT - DOT) }} />) : null}
  </View>;
}

export function RelationDetailScreen() {
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const relation = typeof params.relation === 'string' ? params.relation : '';
  const lane: Lane = relation.startsWith('partial:') ? 'partial' : 'strict';
  const load = useCallback((c: MobileApiClient, signal: AbortSignal) => fetchInsightsRelation(c, relation, signal), [relation]);
  const { state, data: recent, refresh } = useProgressResource(client, `performance-insights|${relation}`, load);
  // Every pair, once asked for. It is a whole answer of its own read, so it replaces the recent one and is never joined to it.
  const [everyPair, setEveryPair] = useState<InsightsRelationDetail | null>(null);
  const [everyPhase, setEveryPhase] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [listed, setListed] = useState(LIST_STEP);
  const data = everyPair && recent && everyPair.id === relation && sameRead(everyPair, recent) ? everyPair : recent;
  const loadEvery = async () => {
    if (!client || everyPhase === 'loading') return;
    setEveryPhase('loading');
    const result = await fetchInsightsRelation(client, relation, undefined, 'all');
    if (result.status !== 'ok') { setEveryPhase('failed'); return; }
    setEveryPair(result.data); setEveryPhase('idle');
    if (recent && !sameRead(result.data, recent)) void refresh();
  };
  const refreshControl = <RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />;
  const scroll = (children: React.ReactNode) => <ScrollView testID="relation-screen" contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll} refreshControl={refreshControl}>{children}</ScrollView>;
  if (state.status === 'loading' && !data) return scroll(<View style={styles.block} testID="relation-loading"><SkeletonBlock height={72} /><SkeletonBlock height={PLOT} /><SkeletonBlock height={120} /></View>);
  const retry = <Button label="Reintentar" onPress={() => void refresh()} />;
  if (!data || data.integrity !== 'valid' || (data.partial && data.partial.integrity !== 'valid')) return scroll(<UnavailableState title="Uy, no pudimos leer tus datos" description="Tranqui: está todo guardado." action={retry} />);
  const { item, pairs } = data;
  if (!item || !pairs) return scroll(<UnavailableState title="No encontramos esta relación" description="Volvé a Insights y elegila de nuevo." action={<Button label="Volver" onPress={() => router.back()} />} />);
  const unit = exposureUnit(item, data.metrics), name = relationName(item, data.metrics);
  const newestFirst = [...pairs].reverse();
  const some = pairs.length < data.pairsTotal;
  const scope = some ? `Los últimos ${pairs.length} de ${data.pairsTotal} días. ` : '';
  const groups = groupRows(lane, item, unit);
  return scroll(<>
    {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    <View style={styles.block}>
      <Heading level={2}>{name}</Heading>
      <AppText muted variant="footnote" testID="relation-lane">{relationState(item)} · {LANE_TITLE[lane]}</AppText>
      <AppText>{relationSentence(lane, item, data.metrics)}</AppText>
      {exposureMeaning(item) ? <AppText muted variant="footnote" testID="relation-exposure-meaning">{exposureMeaning(item)}</AppText> : null}
      {lane === 'partial' ? <AppText muted variant="footnote" testID="relation-partial-limit">{PARTIAL_LIMIT}</AppText> : null}
    </View>
    {pairs.length >= 2 ? <View style={styles.block}>
      <Plot pairs={pairs} summary={`${scope || `${pairs.length} días. `}A la derecha, más ${name}. Arriba, más ejercicios ${lane === 'strict' ? 'por debajo' : 'con registro inferior'}. La lista de abajo tiene los mismos días.`} />
      <AppText muted numeric variant="caption">{scope}Cada punto es un día. No marca un rango ideal.</AppText>
      {some ? <AppText muted variant="caption">Los números de esta relación ya cuentan todos los días.</AppText> : null}
    </View> : null}
    {item.definition.family === 'body' ? <InsightRow label="Ver tu peso en Cuerpo" detail={pairs.length ? 'En los mismos días de esta relación' : undefined} spoken="Ver tu peso en Cuerpo, en los mismos días de esta relación"
      onPress={() => router.push(bodyWeightHref(pairs.length ? { from: pairs[0]!.date, to: pairs.at(-1)!.date } : null, { relation }))} /> : null}
    {(item.definition.family === 'metric' || item.definition.family === 'sleep') && data.metrics.some(metric => metric.id === item.definition.subject)
      ? <InsightRow label="Ver tendencias de esta métrica" spoken={`Ver tendencias de ${data.metrics.find(metric => metric.id === item.definition.subject)!.name}`}
        onPress={() => router.push(metricTrendHref(item.definition.subject, newestFirst[0]?.date ?? null, { relation }))} /> : null}
    {groups.length ? <View>
      <AppText muted variant="footnote" style={styles.section} accessibilityRole="header">Comparación de los días</AppText>
      {groups.map(group => <FactRow key={group.label} label={`${group.label} · ${group.days}`} value={group.value} />)}
    </View> : null}
    <View>
      <AppText muted variant="footnote" style={styles.section} accessibilityRole="header">Cobertura</AppText>
      <FactRow label={coverageText(item)} value={item.coverage === null ? 'Sin dato' : `${Math.round(item.coverage * 100)} %`} />
      {exclusionRows(item.exclusions).map(row => <FactRow key={row.key} label={row.label} value={`${row.days} días`} />)}
    </View>
    {newestFirst.length ? <View>
      <AppText muted variant="footnote" style={styles.section} accessibilityRole="header">Días</AppText>
      {newestFirst.slice(0, listed).map(pair => {
        const [only, ...others] = pair.sessionIds, single = only && !others.length;
        return <InsightRow key={pair.date} label={dayLabel(pair.date)} detail={`${formatValue(pair.exposure, unit)} · ${shareText(lane, pair.outcome)}`}
          spoken={`${dayLabel(pair.date)}: ${formatValue(pair.exposure, unit)}, ${shareText(lane, pair.outcome)}. ${single ? 'Abrir sesión' : 'Abrir día'}`}
          onPress={() => single ? router.push({ pathname: '/(tabs)/train/history/[id]', params: { id: only } }) : router.push({ pathname: '/(tabs)/train/day/[date]', params: { date: pair.date } })} />;
      })}
      {newestFirst.length > listed ? <Button label="Mostrar más días" variant="secondary" onPress={() => setListed(current => current + LIST_STEP)} />
        : some ? <Button label={everyPhase === 'loading' ? 'Cargando…' : `Ver los ${data.pairsTotal} días`} variant="secondary" disabled={everyPhase === 'loading'} onPress={() => void loadEvery()} /> : null}
      {everyPhase === 'failed' ? <InlineUnavailable message="No pudimos traer todos los días." actionLabel="Reintentar" onAction={() => void loadEvery()} /> : null}
    </View> : null}
  </>);
}

const styles = StyleSheet.create({
  scroll: { alignSelf: 'center', flexGrow: 1, gap: spacing.xl, maxWidth: 720, padding: brandTokens.layout.screenPadding, paddingBottom: 120, width: '100%' },
  block: { gap: spacing.sm },
  section: { paddingTop: spacing.sm, paddingBottom: spacing.xs },
  plot: { height: PLOT, borderBottomWidth: StyleSheet.hairlineWidth, borderLeftWidth: StyleSheet.hairlineWidth },
});
