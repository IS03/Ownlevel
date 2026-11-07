import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { fetchInsightsFeelings } from '@/api/performance-insights';
import { AppText, Button, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, brandTokens, spacing, useOwnlevelTheme } from '@/design-system';
import { useProgressResource } from '@/progress/use-progress-resource';
import { FactRow } from './insights-screen';
import { NOT_PUBLISHED, asideRows, outcomeTitle, priorRows, scopeText } from './feelings-model';

const Section = ({ title }: { title: string }) => <AppText muted variant="footnote" style={styles.section} accessibilityRole="header">{title}</AppText>;

/** Insights → how sessions ended: energy and fatigue at the end, each on its own, by how it started. One read when it opens. */
export function FeelingsScreen() {
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const load = useCallback((c: MobileApiClient, signal: AbortSignal) => fetchInsightsFeelings(c, signal), []);
  const { state, data, refresh } = useProgressResource(client, 'performance-insights|feelings', load);
  const refreshControl = <RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />;
  const scroll = (children: React.ReactNode) => <ScrollView testID="feelings-screen" contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll} refreshControl={refreshControl}>{children}</ScrollView>;
  if (state.status === 'loading' && !data) return scroll(<View style={styles.block} testID="feelings-loading"><SkeletonBlock height={72} /><SkeletonBlock height={176} /><SkeletonBlock height={176} /></View>);
  if (!data || data.integrity !== 'valid') return scroll(<UnavailableState title="Uy, no pudimos leer tus datos" description="Tranqui: está todo guardado." action={<Button label="Reintentar" onPress={() => void refresh()} />} />);
  return scroll(<>
    {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    <View style={styles.block}>
      <Heading level={2}>Cómo terminaste</Heading>
      <AppText muted>Energía y fatiga al terminar, cada una por su lado, según cómo empezaste.</AppText>
    </View>
    {data.outcomes.map(summary => <View key={summary.kind} testID={`feelings-${summary.kind}`}>
      <AppText variant="headline" accessibilityRole="header">{outcomeTitle(summary)}</AppText>
      <AppText muted variant="footnote" numeric style={styles.note}>{scopeText(summary)}</AppText>
      {priorRows(summary).map(row => <FactRow key={row.key} label={row.label} value={row.value} detail={row.detail} spoken={row.spoken} />)}
      {asideRows(summary).length ? <>
        <Section title="Fuera de estas cuentas" />
        {asideRows(summary).map(row => <FactRow key={row.key} label={row.label} value={row.value} detail={row.detail} />)}
      </> : null}
    </View>)}
    <AppText muted variant="footnote" testID="feelings-not-published">{NOT_PUBLISHED}</AppText>
  </>);
}

const styles = StyleSheet.create({
  scroll: { alignSelf: 'center', flexGrow: 1, gap: spacing.xl, maxWidth: 720, padding: brandTokens.layout.screenPadding, paddingBottom: 120, width: '100%' },
  block: { gap: spacing.sm },
  section: { paddingTop: spacing.sm, paddingBottom: spacing.xs },
  note: { paddingVertical: spacing.xs },
});
