import { useCallback, useState } from 'react';
import { LayoutChangeEvent, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { fetchPerformanceInsights, type AssociationResult, type InsightsReadModel } from '@/api/performance-insights';
import { AppIcon, AppText, Button, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, brandTokens, spacing, useOwnlevelTheme } from '@/design-system';
import { formatValue } from '@/progress/progress-format';
import { useProgressResource } from '@/progress/use-progress-resource';
import { FactRow } from './insights-screen';
import { LANE_TITLE, PARTIAL_LIMIT, coverageText, dayLabel, exclusionRows, exposureUnit, groupRows, relationName, relationSentence, relationState, shareText, type Lane } from './insights-model';

type Pair = NonNullable<InsightsReadModel['associations']['detail']>['pairs'][number];
const PLOT = 180, DOT = 8;

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
  const load = useCallback((c: MobileApiClient, signal: AbortSignal) => fetchPerformanceInsights(c, { association: relation, limit: 1 }, signal), [relation]);
  const { state, data, refresh } = useProgressResource(client, `performance-insights|${relation}`, load);
  const refreshControl = <RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />;
  const scroll = (children: React.ReactNode) => <ScrollView testID="relation-screen" contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll} refreshControl={refreshControl}>{children}</ScrollView>;
  if (state.status === 'loading' && !data) return scroll(<View style={styles.block} testID="relation-loading"><SkeletonBlock height={72} /><SkeletonBlock height={PLOT} /><SkeletonBlock height={120} /></View>);
  const retry = <Button label="Reintentar" onPress={() => void refresh()} />;
  if (!data || data.integrity !== 'valid' || data.partial.integrity !== 'valid') return scroll(<UnavailableState title="Uy, no pudimos leer tus datos" description="Tranqui: está todo guardado." action={retry} />);
  const items: readonly AssociationResult[] = lane === 'partial' ? data.partial.associations.items : data.associations.items;
  const item = items.find(row => row.id === relation);
  const pairs = (lane === 'partial' ? data.partial.associations.detail : data.associations.detail)?.pairs;
  if (!item || !pairs) return scroll(<UnavailableState title="No encontramos esta relación" description="Volvé a Insights y elegila de nuevo." action={<Button label="Volver" onPress={() => router.back()} />} />);
  const unit = exposureUnit(item, data.metrics), name = relationName(item, data.metrics);
  const newestFirst = [...pairs].reverse();
  const groups = groupRows(lane, item, unit);
  return scroll(<>
    {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    <View style={styles.block}>
      <Heading level={2}>{name}</Heading>
      <AppText muted variant="footnote" testID="relation-lane">{relationState(item)} · {LANE_TITLE[lane]}</AppText>
      <AppText>{relationSentence(lane, item, data.metrics)}</AppText>
      {lane === 'partial' ? <AppText muted variant="footnote" testID="relation-partial-limit">{PARTIAL_LIMIT}</AppText> : null}
    </View>
    {pairs.length >= 2 ? <View style={styles.block}>
      <Plot pairs={pairs} summary={`${pairs.length} días. A la derecha, más ${name}. Arriba, más ejercicios ${lane === 'strict' ? 'por debajo' : 'con registro inferior'}. La lista de abajo tiene los mismos días.`} />
      <AppText muted variant="caption">Cada punto es un día. No marca un rango ideal.</AppText>
    </View> : null}
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
      {newestFirst.map(pair => {
        const [only, ...others] = pair.sessionIds, single = only && !others.length;
        return <Pressable key={pair.date} accessibilityRole="button" accessibilityLabel={`${dayLabel(pair.date)}: ${formatValue(pair.exposure, unit)}, ${shareText(lane, pair.outcome)}. ${single ? 'Abrir sesión' : 'Abrir día'}`}
          onPress={() => single ? router.push({ pathname: '/(tabs)/train/history/[id]', params: { id: only } }) : router.push({ pathname: '/(tabs)/train/day/[date]', params: { date: pair.date } })}
          style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.55 : 1 }]}>
          <View style={styles.flex}>
            <AppText>{dayLabel(pair.date)}</AppText>
            <AppText muted numeric variant="footnote">{formatValue(pair.exposure, unit)} · {shareText(lane, pair.outcome)}</AppText>
          </View>
          <AppIcon color={colors.textMuted} name="chevronRight" size={15} />
        </Pressable>;
      })}
    </View> : null}
  </>);
}

const styles = StyleSheet.create({
  scroll: { alignSelf: 'center', flexGrow: 1, gap: spacing.xl, maxWidth: 720, padding: brandTokens.layout.screenPadding, paddingBottom: 120, width: '100%' },
  block: { gap: spacing.sm },
  flex: { flex: 1 },
  section: { paddingTop: spacing.sm, paddingBottom: spacing.xs },
  plot: { height: PLOT, borderBottomWidth: StyleSheet.hairlineWidth, borderLeftWidth: StyleSheet.hairlineWidth },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
});
