import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useMobileApi } from '@/api';
import { fetchProgressConnections, type ConnectionStory } from '@/api/progress-connections';
import { progressRequestKey } from '@/api/progress';
import { AppIcon, AppText, Heading, InlineUnavailable, SkeletonBlock, spacing, useOwnlevelTheme } from '@/design-system';
import { useTweenedNumber } from '@/nutrition/use-tweened-number';
import { haptics } from '@/platform/haptics';
import {
  CONNECTION_LABELS, CONNECTION_NAMES, connectionAccessibilityLabel, connectionDelta,
  connectionMissingText, connectionTitle, connectionsPeriodText,
} from './connections-model';
import { formatValue } from './progress-format';
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

function StatValue({ value, unit = null, integer = false, total, suffix = '' }: {
  value: number | null; unit?: string | null; integer?: boolean; total?: number | null; suffix?: string;
}) {
  const shown = useTweenedNumber(value, 300), shownTotal = useTweenedNumber(total ?? null, 300);
  const text = formatValue(shown, unit, integer ? 'integer' : 'decimal');
  return <AppText numeric variant="title1">{value === null ? 'Sin dato' : total !== undefined
    ? `${text} de ${formatValue(shownTotal, null, 'integer')}` : `${text}${suffix}`}</AppText>;
}

function ReadyConnection({ story }: { story: ConnectionStory }) {
  const { colors } = useOwnlevelTheme();
  const router = useRouter();
  const f = story.food, o = story.outcome;
  const food = story.key === 'protein_strength' ? 'proteína' : story.key === 'kcal_weight' ? 'kcal' : 'carbos';
  return <Animated.View entering={FadeIn.duration(200)}><Pressable accessibilityRole="button" accessibilityHint="Abre el detalle semana por semana"
    accessibilityLabel={connectionAccessibilityLabel(story)} testID={`connection-${story.key}`}
    onPress={() => { haptics.selection(); router.push({ pathname: '/(tabs)/progress/connections/[key]', params: { key: story.key } }); }}
    style={({ pressed }) => [styles.story, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}>
    <View style={styles.labelRow}>
      <AppText muted variant="caption" style={styles.label}>{CONNECTION_LABELS[story.key]}</AppText>
      <AppIcon name="chevronRight" color={colors.textMuted} size={15} />
    </View>
    <AppText variant="headline">{connectionTitle(story)}</AppText>
    <View style={styles.values}>
      <View style={styles.value}>
        <StatValue value={f.current} unit={f.unit === 'kcal' ? null : f.unit} integer={f.unit === 'kcal'} />
        <AppText muted numeric variant="footnote">{food} por día · {connectionDelta(f.current, f.previous, f.unit)}</AppText>
      </View>
      <View style={[styles.value, styles.result, { borderColor: colors.border }]}>
        {o.kind === 'strength' ? story.key === 'protein_strength' ? <>
          <StatValue value={o.improved} total={o.comparable} integer />
          <AppText muted variant="footnote">ejercicios mejoraron</AppText>
        </> : <>
          <StatValue value={o.top?.currentE1rm ?? null} unit="kg" />
          <AppText muted numeric variant="footnote">{o.top ? `${o.top.name} (estimado) · ${connectionDelta(o.top.currentE1rm, o.top.previousE1rm, null)}` : '1RM estimado · Sin dato'}</AppText>
        </> : o.kind === 'energy' ? <>
          <StatValue value={o.current} suffix=" de 5" />
          <AppText muted numeric variant="footnote">energía al finalizar · {connectionDelta(o.current, o.previous, null)}</AppText>
        </> : <>
          <StatValue value={o.current} unit="kg" />
          <AppText muted numeric variant="footnote">tendencia · {connectionDelta(o.current, o.previous, 'kg')}</AppText>
        </>}
      </View>
    </View>
  </Pressable></Animated.View>;
}

function ConnectionsSkeleton() {
  return <View testID="connections-loading" accessibilityLabel="Cargando las historias de este período" accessibilityRole="progressbar">
    {[0, 1].map(i => <View key={i} style={styles.story}>
      <SkeletonBlock height={16} width="40%" /><SkeletonBlock height={24} width="90%" />
      <View style={styles.values}>{[0, 1].map(j => <View key={j} style={styles.value}>
        <SkeletonBlock height={34} width="75%" /><SkeletonBlock height={18} width="90%" />
      </View>)}</View>
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
    <AppText muted variant="footnote">Pasaron al mismo tiempo: no quiere decir que una cosa cause la otra.</AppText>
    {status.status === 'loading' ? <ConnectionsSkeleton /> : !data
      ? <InlineUnavailable message="No pudimos cargar lo que se movió junto." actionLabel="Reintentar" onAction={() => void refresh()} />
      : <>
        {status.status === 'ready' && status.refreshing
          ? <ActivityIndicator accessibilityLabel="Actualizando estas historias" color={colors.textMuted} size="small" style={styles.refreshing} /> : null}
        {status.status !== 'ready' ? <InlineUnavailable message="No pudimos actualizar estas historias. Mostramos los últimos datos de este período."
          actionLabel="Reintentar" onAction={() => void refresh()} /> : null}
        {ready.map(story => <ReadyConnection key={story.key} story={story} />)}
        {insufficient.length ? <View style={styles.insufficient} testID="connections-insufficient">
          <AppText muted variant="caption" style={styles.label}>TODAVÍA NO ALCANZA</AppText>
          {insufficient.map(story => {
            const message = story.missing ? connectionMissingText(story.missing, state.unit) : 'Todavía faltan datos para comparar.';
            return <View key={story.key} style={styles.missing} accessible accessibilityRole="text"
              accessibilityLabel={`${CONNECTION_NAMES[story.key]}. ${message}`} testID={`connection-missing-${story.key}`}>
              <AppIcon name="hourglass" size={20} color={colors.textMuted} />
              <View style={styles.value}><AppText variant="headline">{CONNECTION_NAMES[story.key]}</AppText>
                <AppText muted numeric variant="footnote">{message}</AppText></View>
            </View>;
          })}
          {insufficient.length === 4 && state.unit === 'week' ? <>
            <AppText muted variant="footnote">Con períodos más largos hay más para cruzar.</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Ver el mes" testID="connections-view-month" style={styles.month}
              onPress={() => { haptics.selection(); setState({ ...state, unit: 'month', custom: null }); }}>
              <AppText variant="headline" style={{ color: colors.primary }}>Ver el mes →</AppText>
            </Pressable>
          </> : null}
        </View> : null}
        {unavailable.map(story => <View key={story.key} testID={`connection-unavailable-${story.key}`}>
          <InlineUnavailable message={`No pudimos cargar ${CONNECTION_NAMES[story.key].toLocaleLowerCase('es-AR')}. Reintentá más tarde.`}
            actionLabel="Reintentar" onAction={() => void refresh()} />
        </View>)}
      </>}
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: spacing.xs, marginTop: spacing.xl },
  story: { gap: spacing.sm, paddingVertical: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { fontWeight: '600', letterSpacing: 0.8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  values: { flexDirection: 'row', gap: spacing.md },
  value: { flex: 1, gap: spacing.xs },
  result: { borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: spacing.md },
  insufficient: { gap: spacing.md, paddingTop: spacing.lg },
  missing: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  month: { minHeight: 44, justifyContent: 'center' },
  refreshing: { alignSelf: 'flex-end' },
});
