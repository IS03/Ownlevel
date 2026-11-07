import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { fetchInsightsPeriodFeelings, validPeriodAnchor } from '@/api/performance-insights';
import { AppText, Button, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, brandTokens, spacing, useOwnlevelTheme } from '@/design-system';
import { useProgressResource } from '@/progress/use-progress-resource';
import { FeelingOutcomeSections } from './feeling-outcome-sections';
import { FactRow } from './insights-screen';
import { InsightRow } from './insight-row';
import { periodSummaryHref } from './navigation';
import { usePeriodReturn } from './use-period-return';
import { exactPeriodRange } from './period-model';

export function PeriodFeelingsScreen() {
  const { client } = useMobileApi(), { colors } = useOwnlevelTheme(), router = useRouter(), params = useLocalSearchParams();
  const asOf = validPeriodAnchor(params.asOf) ? params.asOf : null;
  const load = useCallback((c: MobileApiClient, signal: AbortSignal) => fetchInsightsPeriodFeelings(c, asOf!, signal), [asOf]);
  const { state, data, refresh } = useProgressResource(asOf ? client : null, `performance-insights|period-feelings|${asOf}`, load);
  usePeriodReturn(refresh);
  const scroll = (children: React.ReactNode) => <ScrollView testID="period-feelings-screen" contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll}
    refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}>{children}</ScrollView>;
  if (!asOf) return scroll(<UnavailableState title="No pudimos identificar el período" description="Abrí el detalle desde el resumen de tres meses." action={<Button label="Volver al resumen" onPress={() => router.navigate(periodSummaryHref())} />} />);
  if (state.status === 'loading' && !data) return scroll(<SkeletonBlock height={176} />);
  if (!data || data.integrity !== 'valid') return scroll(<UnavailableState title="No pudimos leer las sensaciones" description="Tus respuestas siguen guardadas." action={<Button label="Reintentar" onPress={() => void refresh()} />} />);
  return scroll(<>
    {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura completa." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    <View style={styles.block}><Heading level={2}>Energía y fatiga del período</Heading><AppText numeric testID="period-detail-range">{exactPeriodRange(data.period)}</AppText>
      <AppText muted>Cada respuesta por su lado, según cómo empezaste.</AppText></View>
    {typeof params.revision === 'string' && params.revision !== data.sourceRevision ? <AppText muted testID="period-detail-revised">Los registros cambiaron desde el resumen. Esta lectura está actualizada; al volver se actualiza el resumen.</AppText> : null}
    <View>{data.outcomes.map(o => <FactRow key={o.kind} label={o.kind === 'energy' ? 'Cobertura de energía' : 'Cobertura de fatiga'} value={`${o.capture.atFinish} de ${o.sessions.completed} sesiones con respuesta al terminar`} />)}</View>
    <FeelingOutcomeSections outcomes={data.outcomes} prefix="period-detail" />
    <AppText muted variant="footnote">Descripción de las respuestas registradas en estas fechas.</AppText>
    <InsightRow label="Cómo terminaste · todo el historial" spoken="Cómo terminaste, en todo tu historial" onPress={() => router.push('/(tabs)/train/insights/feelings')} />
    <Button label="Volver al resumen" variant="secondary" onPress={() => router.navigate(periodSummaryHref(asOf))} />
  </>);
}
const styles = StyleSheet.create({ scroll: { alignSelf: 'center', flexGrow: 1, gap: spacing.xl, maxWidth: 720, padding: brandTokens.layout.screenPadding, paddingBottom: 120, width: '100%' }, block: { gap: spacing.sm } });
