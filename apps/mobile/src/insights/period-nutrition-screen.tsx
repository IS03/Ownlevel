import { ScrollHeaderScreen } from '@/navigation/scroll-header-screen';
import { ReturnToProgress } from './return-to-progress';
import { useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { fetchInsightsPeriodNutrition, validPeriodAnchor } from '@/api/performance-insights';
import { PullRefreshControl, LinkRow, AppText, Button, InlineUnavailable, SkeletonBlock, UnavailableState, brandTokens, spacing, useOwnlevelTheme } from '@/design-system';
import { useProgressResource } from '@/progress/use-progress-resource';
import { FactRow } from './insights-screen';
import { InsightRow } from './insight-row';
import { nutritionDayHref, periodSummaryHref,progressOriginParams,insightsOriginOf } from './navigation';
import { exactPeriodRange } from './period-model';
import { periodDayRows } from './period-nutrition-model';
import { usePeriodReturn } from './use-period-return';
import { useInsightsRouter } from './insights-router';

export function PeriodNutritionScreen() {
  const { client } = useMobileApi(), { colors } = useOwnlevelTheme(), router = useInsightsRouter(), params = useLocalSearchParams();
  const asOf = validPeriodAnchor(params.asOf) ? params.asOf : null;
  const load = useCallback((c: MobileApiClient, signal: AbortSignal) => fetchInsightsPeriodNutrition(c, asOf!, signal), [asOf]);
  const { state, data, refresh } = useProgressResource(asOf ? client : null, `performance-insights|period-nutrition|${asOf}`, load);
  usePeriodReturn(refresh);
  const returnButton = <LinkRow kind="back" label="Volver al resumen" onPress={() => router.navigate(periodSummaryHref(asOf ?? undefined,insightsOriginOf(params)))} />;
  const ready = data?.integrity === 'valid' ? data : undefined;
  const header = !asOf ? <UnavailableState title="No pudimos identificar el período" description="Abrí el detalle desde el resumen de tres meses." action={returnButton} />
    : state.status === 'loading' && !data ? <SkeletonBlock height={176} />
    : !ready ? <UnavailableState title="No pudimos leer las comidas" description="Tus registros siguen guardados." action={<Button label="Reintentar" onPress={() => void refresh()} />} />
    : <View style={styles.block}>
      {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura completa." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}

      <AppText numeric testID="period-nutrition-range">{exactPeriodRange(ready.period)}</AppText>
      <AppText numeric>{ready.days.length} de {ready.period.days} días con registros; {ready.daysWithoutMeals} sin comidas registradas.</AppText>
      <AppText muted>Es lo registrado, no necesariamente todo lo que comiste. Un día sin registros no es cero.</AppText>
      {typeof params.revision === 'string' && params.revision !== ready.sourceRevision ? <AppText muted testID="period-nutrition-revised">Los registros cambiaron desde el resumen. Esta lectura completa está actualizada.</AppText> : null}
      {!ready.days.length ? <AppText testID="period-nutrition-empty">Sin alimentación registrada en estas fechas.</AppText> : null}
    </View>;
  return <ScrollHeaderScreen title="Comidas del período"><FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} testID="period-nutrition-screen" contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll}
    data={asOf && ready ? ready.days : []} keyExtractor={d => d.date} ListHeaderComponent={<View><ReturnToProgress/>{header}</View>} ListFooterComponent={ready ? returnButton : null}
    ItemSeparatorComponent={() => <View style={styles.separator} />}
    refreshControl={<PullRefreshControl onRefresh={() => refresh()} tintColor={colors.primary} />}
    renderItem={({ item }) => <View testID={`period-food-${item.date}`} style={styles.day}>
      <AppText variant="headline" numeric accessibilityRole="header">{item.date.split('-').reverse().join('/')}</AppText>
      {periodDayRows(item).map(row => <FactRow key={row.key} label={row.label} value={row.value} detail={row.detail} />)}
      <InsightRow label="Abrir este día en Nutrición" spoken={`Abrir Nutrición del ${item.date.split('-').reverse().join('/')}`} onPress={() => router.push(nutritionDayHref(item.date, {...progressOriginParams(params), period: 'nutrition', asOf: asOf!, revision: ready!.sourceRevision }))} />
    </View>} /></ScrollHeaderScreen>;
}
const styles = StyleSheet.create({ scroll: { alignSelf: 'center', flexGrow: 1, maxWidth: 720, padding: brandTokens.layout.screenPadding, paddingBottom: 120, width: '100%' }, block: { gap: spacing.sm, paddingBottom: spacing.xl }, day: { gap: spacing.xs, paddingBottom: spacing.xl }, separator: { height: spacing.lg } });
