import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useMobileApi } from '@/api';
import { fetchProgressConnections, type ConnectionStory } from '@/api/progress-connections';
import { progressRequestKey } from '@/api/progress';
import { AppIcon, AppText, Heading, InlineUnavailable, SkeletonBlock, spacing, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';
import {
  CONNECTION_NAMES, connectionAccessibilityLabel, connectionFacts, connectionMissingText,
  connectionTitle, connectionsPeriodNames, connectionsPeriodText,
} from './connections-model';
import { compareRange } from './progress-range';
import { useProgressRange } from './progress-range-context';
import { useProgressResource } from './use-progress-resource';

/** Own resource and key: a change in the general comparison never changes this section's B. */
export function useProgressConnections() {
  const { client } = useMobileApi();
  const { state, query, today } = useProgressRange();
  const { start, end } = compareRange({ ...state, compare: { kind: 'previous' } }, today)!;
  const load = useCallback((c: NonNullable<typeof client>, signal: AbortSignal) =>
    fetchProgressConnections(c, query, { start, end }, signal), [query, start, end]);
  return useProgressResource(client, `connections|${progressRequestKey(query, { start, end })}`, load);
}
type ConnectionsResource = ReturnType<typeof useProgressConnections>;

/** One story as a flat row: the sentence, then each fact with its before → now (C1, simplified after QA). */
function ReadyConnection({ story }: { story: ConnectionStory }) {
  const { colors } = useOwnlevelTheme();
  const router = useRouter();
  const { state, today } = useProgressRange();
  const facts = connectionFacts(story, connectionsPeriodNames(state, today).before);
  return <Animated.View entering={FadeIn.duration(200)}><Pressable accessibilityRole="button" accessibilityHint="Abre el detalle semana por semana"
    accessibilityLabel={connectionAccessibilityLabel(story)} testID={`connection-${story.key}`}
    onPress={() => { haptics.selection(); router.push({ pathname: '/(tabs)/progress/connections/[key]', params: { key: story.key } }); }}
    style={({ pressed }) => [styles.story, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}>
    <View style={styles.value}>
      <AppText variant="headline">{connectionTitle(story)}</AppText>
      <AppText muted numeric variant="footnote">{facts.food}</AppText>
      <AppText muted numeric variant="footnote">{facts.outcome}</AppText>
    </View>
    <AppIcon name="chevronRight" color={colors.textMuted} size={15} />
  </Pressable></Animated.View>;
}

function ConnectionsSkeleton() {
  return <View testID="connections-loading" accessibilityLabel="Cargando las historias de este período" accessibilityRole="progressbar">
    {[0, 1].map(i => <View key={i} style={[styles.story, styles.value]}>
      <SkeletonBlock height={22} width="85%" /><SkeletonBlock height={16} width="60%" /><SkeletonBlock height={16} width="70%" />
    </View>)}
  </View>;
}

/** C1/C4. Editorial facts; each ready story opens its detail (C2/C3). */
export function ConnectionsSection({ resource }: { resource: ConnectionsResource }) {
  const { state, today, setState } = useProgressRange();
  const { colors } = useOwnlevelTheme();
  const { state: status, data, refresh } = resource;
  const ready = data?.ranking.flatMap(key => {
    const story = data.stories.find(s => s.key === key);
    return story?.status === 'ready' ? [story] : [];
  }) ?? [];
  const insufficient = data?.stories.filter(s => s.status === 'insufficient') ?? [];
  const unavailable = data?.stories.filter(s => s.status === 'unavailable') ?? [];
  return <View style={styles.section} testID="progress-connections">
    <Heading level={2}>Lo que se movió junto</Heading>
    <AppText muted variant="footnote">{connectionsPeriodText(state, today)}</AppText>
    {status.status === 'loading' ? <ConnectionsSkeleton /> : !data
      ? <InlineUnavailable message="No pudimos cargar lo que se movió junto." actionLabel="Reintentar" onAction={() => void refresh()} />
      : <>
        {status.status === 'ready' && status.refreshing
          ? <ActivityIndicator accessibilityLabel="Actualizando estas historias" color={colors.textMuted} size="small" style={styles.refreshing} /> : null}
        {status.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar estas historias. Mostramos los últimos datos de este período."
          actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
        {ready.map(story => <ReadyConnection key={story.key} story={story} />)}
        {insufficient.length ? <View style={styles.insufficient} testID="connections-insufficient">
          {insufficient.map(story => {
            const message = story.missing ? connectionMissingText(story.missing, state.unit) : 'Todavía faltan datos para comparar.';
            return <View key={story.key} style={styles.missing} accessible accessibilityRole="text"
              accessibilityLabel={`${CONNECTION_NAMES[story.key]}: todavía no alcanza. ${message}`} testID={`connection-missing-${story.key}`}>
              <AppIcon name="hourglass" size={17} color={colors.textMuted} />
              <AppText muted numeric variant="footnote" style={styles.value}>{`${CONNECTION_NAMES[story.key]}: todavía no alcanza. ${message}`}</AppText>
            </View>;
          })}
          {insufficient.length === 4 && state.unit === 'week' ? <Pressable accessibilityRole="button" accessibilityLabel="Ver el mes" testID="connections-view-month" style={styles.month}
            onPress={() => { haptics.selection(); setState({ ...state, unit: 'month', custom: null }); }}>
            <AppText variant="headline" style={{ color: colors.primary }}>Con un período más largo hay más para cruzar. Ver el mes →</AppText>
          </Pressable> : null}
        </View> : null}
        {unavailable.map(story => <View key={story.key} testID={`connection-unavailable-${story.key}`}>
          <InlineUnavailable message={`No pudimos cargar ${CONNECTION_NAMES[story.key].toLocaleLowerCase('es-AR')}. Reintentá más tarde.`}
            actionLabel="Reintentar" onAction={() => void refresh()} />
        </View>)}
      </>}
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: spacing.xs, marginTop: spacing.md },
  story: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  value: { flex: 1, gap: 2 },
  insufficient: { gap: spacing.sm, paddingTop: spacing.md },
  missing: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  month: { minHeight: 44, justifyContent: 'center' },
  refreshing: { alignSelf: 'flex-end' },
});
