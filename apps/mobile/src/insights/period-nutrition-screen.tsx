import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { fetchInsightsPeriodNutrition, validPeriodAnchor } from '@/api/performance-insights';
import { AppText, Button, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, brandTokens, spacing, useOwnlevelTheme } from '@/design-system';
import { useProgressResource } from '@/progress/use-progress-resource';
import { FactRow } from './insights-screen';
import { InsightRow } from './insight-row';
import { nutritionDayHref, periodSummaryHref } from './navigation';
import { exactPeriodRange } from './period-model';
import { periodDayRows } from './period-nutrition-model';
import { usePeriodReturn } from './use-period-return';

export function PeriodNutritionScreen() {
  const { client } = useMobileApi(), { colors } = useOwnlevelTheme(), router = useRouter(), params = useLocalSearchParams();
  const asOf = validPeriodAnchor(params.asOf) ? params.asOf : null;
  const load = useCallback((c: MobileApiClient, signal: AbortSignal) => fetchInsightsPeriodNutrition(c, asOf!, signal), [asOf]);
  const { state, data, refresh } = useProgressResource(asOf ? client : null, `performance-insights|period-nutrition|${asOf}`, load);
  usePeriodReturn(refresh);
  const returnButton = <Button label="Volver al resumen" variant="secondary" onPress={() => router.navigate(periodSummaryHref(asOf ?? undefined))} />;
  const ready = data?.integrity === 'valid' ? data : undefined;
  const header = !asOf ? <UnavailableState title="No pudimos identificar el período" description="Abrí el detalle desde el resumen de tres meses." action={returnButton} />
    : state.status === 'loading' && !data ? <SkeletonBlock height={176} />
    : !ready ? <UnavailableState title="No pudimos leer las comidas" description="Tus registros siguen guardados." action={<Button label="Reintentar" onPress={() => void refresh()} />} />
    : <View style={styles.block}>
      {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura completa." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
      <Heading level={2}>Comidas del período</Heading>
      <AppText numeric testID="period-nutrition-range">{exactPeriodRange(ready.period)}</AppText>
      <AppText numeric>{ready.days.length} de {ready.period.days} días con registros; {ready.daysWithoutMeals} sin comidas registradas.</AppText>
      <AppText muted>Es lo registrado, no necesariamente todo lo que comiste. Un día sin registros no es cero.</AppText>
      {typeof params.revision === 'string' && params.revision !== ready.sourceRevision ? <AppText muted testID="period-nutrition-revised">Los registros cambiaron desde el resumen. Esta lectura completa está actualizada.</AppText> : null}
      {!ready.days.length ? <AppText testID="period-nutrition-empty">Sin alimentación registrada en estas fechas.</AppText> : null}
    </View>;
  return <FlatList testID="period-nutrition-screen" contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll}
    data={asOf && ready ? ready.days : []} keyExtractor={d => d.date} ListHeaderComponent={header} ListFooterComponent={ready ? returnButton : null}
    ItemSeparatorComponent={() => <View style={styles.separator} />}
    refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
    renderItem={({ item }) => <View testID={`period-food-${item.date}`} style={styles.day}>
      <AppText variant="headline" numeric accessibilityRole="header">{item.date.split('-').reverse().join('/')}</AppText>
      {periodDayRows(item).map(row => <FactRow key={row.key} label={row.label} value={row.value} detail={row.detail} />)}
      <InsightRow label="Abrir este día en Nutrición" spoken={`Abrir Nutrición del ${item.date.split('-').reverse().join('/')}`} onPress={() => router.push(nutritionDayHref(item.date, { period: 'nutrition', asOf: asOf!, revision: ready!.sourceRevision }))} />
    </View>} />;
}
const styles = StyleSheet.create({ scroll: { alignSelf: 'center', flexGrow: 1, maxWidth: 720, padding: brandTokens.layout.screenPadding, paddingBottom: 120, width: '100%' }, block: { gap: spacing.sm, paddingBottom: spacing.xl }, day: { gap: spacing.xs, paddingBottom: spacing.xl }, separator: { height: spacing.lg } });
