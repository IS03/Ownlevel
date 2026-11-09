import { ReturnToProgress } from './return-to-progress';
import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import type { MobileApiClient } from '@/api/client';
import { fetchInsightsEvidence } from '@/api/performance-insights';
import { AppText, Button, Heading, InlineUnavailable, SkeletonBlock, UnavailableState, brandTokens, spacing, useOwnlevelTheme } from '@/design-system';
import { useProgressResource } from '@/progress/use-progress-resource';
import { contextRows, evidenceMatch, evidenceNote, evidenceSelectionOf, recordRows, resultOf, sideRows, sideTitle, signalRow } from './evidence-model';
import { FactRow } from './insights-screen';
import { InsightRow } from './insight-row';
import { LANE_TITLE, PARTIAL_LIMIT, referenceText, statusArrow, statusText } from './insights-model';
import { insightsReturnHref } from './navigation';

const Section = ({ title }: { title: string }) => <AppText muted variant="footnote" style={styles.section} accessibilityRole="header">{title}</AppText>;

/**
 * Insights → one exercise of one session: the sets and signals its result rests on, against the reference Insights chose. Read
 * only when it opens, from that exercise's history alone; every number in its own unit, and the record apart from the result.
 */
export function EvidenceScreen() {
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const selection = evidenceSelectionOf(params);
  // Read as plain strings: nothing is asked for unless the whole selection above is valid, and then they are the same values.
  const session = typeof params.session === 'string' ? params.session.toLowerCase() : '', exercise = typeof params.exercise === 'string' ? params.exercise.toLowerCase() : '';
  const lane = params.lane === 'partial' ? 'partial' : 'strict';
  const key = `performance-insights|evidence|${session}|${exercise}|${lane}`;
  const load = useCallback((c: MobileApiClient, signal: AbortSignal) => fetchInsightsEvidence(c, { session, exercise, lane }, signal), [session, exercise, lane]);
  const { state, data, refresh } = useProgressResource(selection ? client : null, key, load);
  const back = () => { if (router.canGoBack()) router.back(); else router.replace(insightsReturnHref(params) ?? '/(tabs)/train/insights'); };
  const backButton = <Button label="Volver a Insights" onPress={back} />;
  const refreshControl = <RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />;
  const scroll = (children: React.ReactNode) => <ScrollView testID="evidence-screen" contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.scroll} refreshControl={selection ? refreshControl : undefined}><ReturnToProgress/>{children}</ScrollView>;

  if (!selection) return scroll(<UnavailableState title="No encontramos esta comparación" description="Volvé a Insights y elegí el ejercicio de nuevo." action={backButton} />);
  if (state.status === 'loading' && !data) return scroll(<View style={styles.block} testID="evidence-loading"><SkeletonBlock height={72} /><SkeletonBlock height={132} /><SkeletonBlock height={176} /></View>);
  if (!data || data.integrity !== 'valid' || (data.partial && data.partial.integrity !== 'valid')) return scroll(<UnavailableState title="Uy, no pudimos leer tus datos" description="Tranqui: está todo guardado." action={<Button label="Reintentar" onPress={() => void refresh()} />} />);
  const match = evidenceMatch(data, selection);
  // Never another comparison in place of the one tapped: if it changed, Insights reads it again.
  if (match === 'changed' || !data.item) return scroll(<View style={styles.block} testID="evidence-changed">
    <Heading level={2}>Esta comparación cambió</Heading>
    <AppText muted>Tus registros cambiaron desde que abriste Insights. Volvé para ver la lectura actual.</AppText>
    {backButton}
  </View>);
  const { item } = data, result = resultOf(item);
  const note = evidenceNote(item, lane), records = recordRows(item, lane);
  const signals = item.evidence.map(signal => signalRow(signal, item.context?.unit));
  const against = item.reference ? referenceText(item.reference.ageDays, item.reference.date) : null;
  return scroll(<>
    {state.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar. Mostramos la última lectura." actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
    <View style={styles.block}>
      <Heading level={2}>{item.name || 'Ejercicio'}</Heading>
      <AppText muted variant="footnote" testID="evidence-lane">{LANE_TITLE[lane]}</AppText>
      <AppText variant="headline" testID="evidence-result" accessibilityLabel={`${statusText(lane, result)}${lane === 'partial' && statusArrow(result) ? ', con contexto parcial' : ''}${against ? `. ${against}` : ''}`}>
        {statusArrow(result) ? `${statusArrow(result)} ` : ''}{statusText(lane, result)}
      </AppText>
      {against ? <AppText muted testID="evidence-against">{against}</AppText> : null}
      {match === 'newer' ? <AppText muted variant="footnote" testID="evidence-newer">Hubo cambios en tus registros desde que abriste Insights. La comparación es la misma; estos son los datos de ahora.</AppText> : null}
      {lane === 'partial' ? <AppText muted variant="footnote" testID="evidence-partial-limit">{PARTIAL_LIMIT}</AppText> : null}
    </View>
    <View testID="evidence-signals">
      <Section title="Qué se comparó" />
      {signals.map(row => <FactRow key={row.key} arrow={row.arrow} label={row.label} value={row.value} spoken={row.spoken} />)}
      {note ? <AppText muted variant="footnote" style={styles.note} testID="evidence-note">{note}</AppText> : null}
    </View>
    <View testID="evidence-current">
      <Section title={sideTitle(item.current, 'current')} />
      {sideRows(item.current, item, 'current').map(row => <FactRow key={row.key} label={row.label} value={row.value} detail={row.detail} spoken={row.spoken} />)}
    </View>
    {item.reference ? <View testID="evidence-reference">
      <Section title={sideTitle(item.reference, 'reference')} />
      {sideRows(item.reference, item, 'reference').map(row => <FactRow key={row.key} label={row.label} value={row.value} detail={row.detail} spoken={row.spoken} />)}
      <InsightRow label="Abrir la sesión de referencia" spoken="Abrir la sesión de referencia" onPress={() => router.push({ pathname: '/(tabs)/train/history/[id]', params: { id: item.reference!.sessionId } })} />
    </View> : <View testID="evidence-no-reference">
      <Section title="Sesión de referencia" />
      <AppText muted>Sin una sesión compatible para comparar.</AppText>
    </View>}
    <View testID="evidence-records">
      <Section title={lane === 'strict' ? 'Récords en este contexto' : 'Lo más alto con contexto parcial'} />
      {records.length ? records.map(row => <FactRow key={row.key} label={row.label} value={row.value} spoken={row.spoken} />)
        : <AppText muted variant="footnote">Sin valores nuevos más altos en esta sesión.</AppText>}
      <AppText muted variant="caption" style={styles.note}>{lane === 'strict' ? 'Un récord se mide contra todo tu historial en este contexto. No es el resultado de la comparación.' : 'Es lo más alto de lo que registraste así. No es un récord ni el resultado de la comparación.'}</AppText>
    </View>
    <View>
      <Section title="Contexto registrado" />
      {contextRows(item).map(row => <FactRow key={row.key} label={row.label} value={row.value} />)}
    </View>
    <View>
      <InsightRow label="Abrir esta sesión" spoken="Abrir esta sesión" onPress={() => router.push({ pathname: '/(tabs)/train/history/[id]', params: { id: item.current.sessionId } })} />
      <InsightRow label="Ver historial de este ejercicio" spoken={`Ver historial de ${item.name || 'este ejercicio'}`} onPress={() => router.push({ pathname: '/(tabs)/train/history/exercise/[id]', params: { id: data.exerciseId } })} />
    </View>
  </>);
}

const styles = StyleSheet.create({
  scroll: { alignSelf: 'center', flexGrow: 1, gap: spacing.xl, maxWidth: 720, padding: brandTokens.layout.screenPadding, paddingBottom: 120, width: '100%' },
  block: { gap: spacing.sm },
  section: { paddingTop: spacing.sm, paddingBottom: spacing.xs },
  note: { paddingTop: spacing.xs },
});
