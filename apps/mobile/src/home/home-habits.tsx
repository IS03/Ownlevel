import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import type { ProgressHabitWeek, ProgressMetricHabit } from '@/api/progress';
import { AppIcon, AppText, Button, InlineUnavailable, SkeletonBlock, brandTokens, useOwnlevelTheme } from '@/design-system';
import { formatValue } from '@/progress/progress-format';

import { homeMetricIcon } from './home-metric-icons';
import {useMetricPresentations} from '@/metrics/presentation-provider';
import type { HomeResource } from './home-resource';

/** Only a server-comparable change carries a neutral direction arrow. */
export function habitDirection(item: ProgressMetricHabit): string | null {
  if (item.average === null || item.comparison.status !== 'comparable') return null;
  return item.comparison.change === 'increased' ? '↗' : item.comparison.change === 'decreased' ? '↘' : null;
}

export function HomeHabits({ habits, onOpen, onMetrics, today, weekStart }: {
  habits: HomeResource<ProgressHabitWeek>; onOpen: (metricId: string) => void; onMetrics: () => void; today: string; weekStart: string;
}) {
  const { colors } = useOwnlevelTheme();
  const definitions=useMetricPresentations();
  const { fontScale, width } = useWindowDimensions();
  const data = habits.data?.weekStart === weekStart && habits.data.today === today ? habits.data : undefined;
  // Leave room for complete names/values and the remainder action at accessibility sizes.
  const limit = fontScale > 2 ? 1 : fontScale > 1.3 || width < 375 ? 2 : 3;
  if (!data) return habits.status === 'loading'
    ? <View style={styles.loading} testID="home-habits-loading">{Array.from({ length: limit }, (_, index) => <SkeletonBlock height={44} key={index} />)}</View>
    : <InlineUnavailable message="No pudimos cargar Hábitos de esta semana." />;
  const stale = habits.status === 'unavailable';
  if (data.items.length === 0) return <View style={styles.empty} testID="home-habits-empty">
    <AppText variant="headline">Tus hábitos, semana a semana</AppText>
    <AppText muted variant="subheadline">Activá una métrica para ver acá tus promedios.</AppText>
    <Button label="Ir a Métricas" onPress={onMetrics} variant="quiet" />
    {stale ? <Stale /> : null}
  </View>;
  const visibleLimit = stale && data.items.length > limit ? Math.min(2, limit) : limit;
  const shown = data.items.slice(0, visibleLimit), remaining = data.items.length - shown.length;
  return <View testID="home-week-habits">
    {shown.map((item, index) => {
      const value = item.average === null ? '—' : formatValue(item.average, item.unit, item.valueType);
      const coverage = `Promedio · ${item.coverage.registered} de 7 días`;
      const arrow = habitDirection(item);
      const direction = arrow === '↗' ? '. Subió frente a la semana anterior' : arrow === '↘' ? '. Bajó frente a la semana anterior' : '';
      return <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}: ${value}. ${coverage}${direction}`}
        accessibilityHint="Abre esta métrica en Progreso" key={item.id} onPress={() => onOpen(item.id)}
        style={({ pressed }) => [styles.row, index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }, pressed && { opacity: 0.55 }]}
        testID={`home-habit-${item.id}`}>
        <AppIcon color={colors.textMuted} name={homeMetricIcon(item.systemKey,definitions.find(d=>d.id===item.id)?.icon)} size={20} />
        <View style={styles.name}>
          <AppText numberOfLines={1} variant="body">{item.name}</AppText>
          <AppText muted numeric variant="caption">{coverage}</AppText>
        </View>
        <View style={styles.value}>
          {arrow ? <AppText muted testID={`home-habit-${item.id}-direction`} variant="body">{arrow}</AppText> : null}
          <AppText numeric style={styles.number} variant="title2">{value}</AppText>
        </View>
      </Pressable>;
    })}
    {remaining > 0 ? <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${remaining} métricas más`} onPress={onMetrics} style={styles.more} testID="home-habits-more">
      <AppText muted numeric variant="footnote">y {remaining} más</AppText>
    </Pressable> : null}
    {stale ? <Stale /> : null}
  </View>;
}

function Stale() {
  return <AppText muted variant="caption">Sin actualizar · Última lectura disponible</AppText>;
}

const styles = StyleSheet.create({
  empty: { gap: brandTokens.space.xs },
  loading: { gap: brandTokens.space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: brandTokens.space.sm, minHeight: brandTokens.layout.minTouch, paddingVertical: 0 },
  name: { flex: 1, minWidth: 0 },
  value: { flexDirection: 'row', alignItems: 'center', gap: brandTokens.space.xxs, flexShrink: 1, maxWidth: '50%' },
  number: { flexShrink: 1, fontWeight: '600', textAlign: 'right' },
  more: { minHeight: brandTokens.layout.minTouch, justifyContent: 'center' },
});
