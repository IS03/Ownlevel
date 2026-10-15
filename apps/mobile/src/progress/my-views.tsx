import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMobileApi } from '@/api';
import { fetchProgressViews, PROGRESS_VIEWS_MAX, type ProgressViewDefinition, type ProgressViewsRead } from '@/api/progress-views';
import { progressRequestKey } from '@/api/progress';
import { AppIcon, AppText, Heading, InlineUnavailable, SkeletonBlock, spacing, useOwnlevelTheme } from '@/design-system';
import { haptics } from '@/platform/haptics';
import { aggregationText } from './explore-model';
import { valueText } from './explore-screen';
import { MiniChart } from './mini-chart';
import { useProgressRange } from './progress-range-context';
import { useProgressResource } from './use-progress-resource';

/** Opens Explorar with a saved query, so a view can be read in full or changed. */
export function exploreParams(d: ProgressViewDefinition): Record<string, string> {
  return { measure: d.measure, ...(d.breakdown ? { breakdown: d.breakdown } : {}), ...(d.days ? { days: d.days } : {}), ...(d.series ? { series: '1' } : {}) };
}

function Tile({ view, onPress }: { view: ProgressViewsRead['views'][number]; onPress: () => void }) {
  const r = view.result;
  if (r.status === 'unavailable') return <Pressable accessibilityRole="button" accessibilityLabel={`${view.name}. No disponible`} onPress={onPress}
    testID={`my-view-${view.id}`} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.6 }]}>
    <AppText muted variant="caption" numberOfLines={1} style={styles.name}>{view.name}</AppText>
    <AppText variant="headline">No disponible</AppText>
    <AppText muted variant="caption" numberOfLines={2}>{r.reason === 'invalid_definition' ? 'Esta medida ya no existe. Podés sacarla en Editar.' : 'No pudimos cargarla.'}</AppText>
  </Pressable>;
  const e = r.data, c = e.current;
  const dots = e.measure.aggregation === 'latest' || e.measure.aggregation === 'best';
  const top = e.breakdown ? [...c.groups].filter(g => g.value !== null).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0] : undefined;
  const value = c.value === null ? '—' : valueText(e, c.value);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${view.name}: ${value}`} accessibilityHint="Abre la vista en Explorar" onPress={onPress}
    testID={`my-view-${view.id}`} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.6 }]}>
    <AppText muted variant="caption" numberOfLines={1} style={styles.name}>{view.name}</AppText>
    <AppText numeric variant="title2" numberOfLines={1} adjustsFontSizeToFit>{value}</AppText>
    {c.series && !e.breakdown ? <MiniChart current={c.series} reference={e.reference?.series ?? null} mode={dots ? 'level' : 'bars'} />
      : top ? <AppText muted numeric variant="caption" numberOfLines={1}>{top.label} · {valueText(e, top.value, e.breakdown === 'weekday' && e.measure.aggregation === 'sum')}</AppText>
      : <AppText muted variant="caption" numberOfLines={1}>{aggregationText(e)}</AppText>}
  </Pressable>;
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
        <Tile view={v} onPress={() => explore(exploreParams(v.definition))} />
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
  name: { fontWeight: '600' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
});
