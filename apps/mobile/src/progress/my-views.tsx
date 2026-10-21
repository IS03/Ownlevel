import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchProgressViews, influenceDefinitionOf, isInfluenceView, PROGRESS_VIEWS_MAX, type ExploreViewDefinition, type ProgressViewsRead } from '@/api/progress-views';
import { progressRequestKey } from '@/api/progress';
import { AppIcon, AppText, Heading, InlineUnavailable, SkeletonBlock, spacing, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { aggregationText } from './explore-model';
import { valueText } from './explore-screen';
import { shortAnswer, valueText as influenceValueText } from './influence-model';
import { MiniChart } from './mini-chart';
import { useProgressRange } from './progress-range-context';
import { useProgressResource } from './use-progress-resource';

/** Opens Explorar with a saved query, so a view can be read in full or changed. */
export function exploreParams(d: ExploreViewDefinition): Record<string, string> {
  return { measure: d.measure, ...(d.breakdown ? { breakdown: d.breakdown } : {}), ...(d.days ? { days: d.days } : {}), ...(d.series ? { series: '1' } : {}) };
}

function Tile({ view, onPress }: { view: ProgressViewsRead['views'][number]; onPress: () => void }) {
  const r = view.result;
  if (r.status === 'unavailable') return <Pressable accessibilityRole="button" accessibilityLabel={`${view.name}. No disponible`} onPress={onPress}
    testID={`my-view-${view.id}`} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.6 }]}>
    <AppText muted variant="caption" numberOfLines={1}>{view.name}</AppText>
    <AppText variant="headline">No disponible</AppText>
    <AppText muted variant="caption" numberOfLines={2}>{r.reason === 'invalid_definition' ? 'Esta medida ya no existe. Podés sacarla en Editar.' : 'No pudimos cargarla.'}</AppText>
  </Pressable>;
  if (r.kind === 'influence') {
    const data = r.data, c = data.current;
    const difference = c.status === 'ok' ? `${influenceValueText(Math.abs(c.difference), data.measure.outcome)} ${c.difference > 0 ? 'más' : c.difference < 0 ? 'menos' : 'de diferencia'}` : null;
    const summary = shortAnswer(data);
    return <Pressable accessibilityRole="button" accessibilityLabel={`${view.name}. ${difference ? `${difference}. ` : ''}${summary}`} accessibilityHint="Abre la respuesta en Qué influye" onPress={onPress}
      testID={`my-view-${view.id}`} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.6 }]}>
      <AppText muted variant="caption" numberOfLines={1}>{view.name}</AppText>
      {difference ? <AppText numeric variant="title2" numberOfLines={1} adjustsFontSizeToFit>{difference}</AppText> : null}
      <AppText muted numeric variant="caption" numberOfLines={2}>{summary}</AppText>
    </Pressable>;
  }
  const e = r.data, c = e.current;
  const dots = e.measure.aggregation === 'latest' || e.measure.aggregation === 'best';
  const top = e.breakdown ? [...c.groups].filter(g => g.value !== null).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0] : undefined;
  const value = c.value === null ? '—' : valueText(e, c.value);
  const topText = top ? `${top.label} · ${valueText(e, top.value, e.breakdown === 'weekday' && e.measure.aggregation === 'sum')}` : null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${view.name}: ${value}${topText ? `. El más alto, ${topText}` : ''}`} accessibilityHint="Abre la vista en Explorar" onPress={onPress}
    testID={`my-view-${view.id}`} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.6 }]}>
    <AppText muted variant="caption" numberOfLines={1}>{view.name}</AppText>
    <AppText numeric variant="title2" numberOfLines={1} adjustsFontSizeToFit>{value}</AppText>
    {c.series && !e.breakdown ? <MiniChart current={c.series} reference={e.reference?.series ?? null} mode={dots ? 'level' : 'bars'} />
      : top ? <View style={styles.breakdown}>
        <BreakdownBars groups={c.groups} top={top.key} ordered={ORDERED.has(e.breakdown!)} />
        <AppText muted variant="caption" numberOfLines={1} style={styles.grow}>{top.label}</AppText>
      </View>
      : <AppText muted variant="caption" numberOfLines={1}>{aggregationText(e)}</AppText>}
  </Pressable>;
}

/** Breakdowns with their own order (days, meal moments, time bands) keep it; the rest go from most to least. */
const ORDERED = new Set(['weekday', 'meal_moment', 'time_band']);
const BAR_W = 56, BAR_H = 22;
/** Decorative: one bar per group from zero, the highest in champagne (like Explorar); the label beside it names it. */
function BreakdownBars({ groups, top, ordered }: { groups: { key: string; value: number | null }[]; top: string; ordered: boolean }) {
  const { colors } = useOwnlevelTheme();
  const shown = (ordered ? groups : [...groups].sort((a, b) => (b.value ?? -1) - (a.value ?? -1))).slice(0, 8);
  const high = Math.max(0, ...shown.map(g => g.value ?? 0));
  if (!high) return null;
  const width = Math.max(2, (BAR_W - 2 * (shown.length - 1)) / shown.length);
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.bars}>
    {shown.map(g => <View key={g.key} style={{ width, height: BAR_H, justifyContent: 'flex-end' }}>
      {g.value !== null && g.value > 0 ? <View style={{ height: Math.max(2, (g.value / high) * BAR_H), borderTopLeftRadius: 1.5, borderTopRightRadius: 1.5,
        backgroundColor: colors.primary, opacity: g.key === top ? 1 : 0.35 }} /> : null}
    </View>)}
  </View>;
}

/** S1 · Mis vistas, on top of Progreso: saved queries in the shared period. Empty is useful and neutral. */
export function MyViews() {
  const router = useRouter();
  const { client } = useMobileApi();
  const { colors } = useOwnlevelTheme();
  const { query, compare } = useProgressRange();
  const load = useCallback((c: NonNullable<typeof client>, s: AbortSignal) => fetchProgressViews(c, query, s, compare), [query, compare]);
  const { state, data, refresh } = useProgressResource(client, `views|${progressRequestKey(query, compare)}`, load);
  const explore = (params: Record<string, string> = {}) => { haptics.selection(); router.push({ pathname: '/(tabs)/progress/explore', params }); };
  const views = data?.views ?? [];
  return <View style={styles.section} testID="my-views">
    <View style={styles.header}>
      <Heading level={2}>Mis vistas</Heading>
      {views.length ? <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { haptics.selection(); router.push('/(tabs)/progress/views'); }} testID="my-views-edit">
        <AppText variant="headline" style={{ color: colors.primary }}>Editar</AppText>
      </Pressable> : null}
    </View>
    {state.status === 'loading' ? <SkeletonBlock height={84} />
      : !data ? <InlineUnavailable actionLabel="Reintentar" message="No pudimos cargar tus vistas." onAction={() => void refresh()} />
      : views.length ? <View style={styles.grid}>{views.map(v => <View key={v.id} style={styles.cell}>
        <Tile view={v} onPress={() => {
          if (isInfluenceView(v.definition)) {
            haptics.selection(); const definition = influenceDefinitionOf(v.definition);
            router.push({ pathname: '/(tabs)/progress/influence/answer', params: { ...definition, lag: String(definition.lag) } });
          } else explore({ ...exploreParams(v.definition), view: v.name });
        }} />
      </View>)}</View>
      : <AppText muted testID="my-views-empty">Fijá acá lo que más mirás: armalo en Explorar y tocá “Fijar en Mis vistas”.</AppText>}
    {data && views.length < PROGRESS_VIEWS_MAX ? <Pressable accessibilityRole="button" onPress={() => explore()} testID="my-views-new" style={styles.add}>
      <AppIcon name="plus" color={colors.primary} size={17} />
      <AppText variant="headline" style={{ color: colors.primary }}>{views.length ? 'Nueva vista' : 'Explorar tus datos'}</AppText>
    </Pressable> : null}
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg, columnGap: spacing.lg },
  cell: { width: '47%' },
  tile: { gap: 4, minHeight: 74 },
  breakdown: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  bars: { width: BAR_W, height: BAR_H, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  grow: { flex: 1 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
});
