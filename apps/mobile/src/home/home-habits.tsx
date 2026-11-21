import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import type { ProgressHabitWeek, ProgressMetricHabit } from '@/api/progress';
import { LinkRow, AppIcon, AppText, InlineUnavailable, SkeletonBlock, brandTokens, useOwnlevelTheme } from '@/design-system';
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
  // One row's real height (it grows with the text size), so the window shows exactly `limit` rows and a hint of the next.
  const [rowHeight, setRowHeight] = useState<number>(brandTokens.layout.minTouch + 4);
  const scroll = useRef<ScrollView>(null);
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
    <LinkRow label="Ir a Métricas" onPress={onMetrics} />
    {stale ? <Stale /> : null}
  </View>;
  const visibleLimit = stale && data.items.length > limit ? Math.min(2, limit) : limit;
  const overflow = data.items.length > visibleLimit;
  // The block keeps its size: more metrics than fit scroll inside it, with half of the next row showing that there is more.
  const windowHeight = overflow && rowHeight ? rowHeight * (visibleLimit + 0.5) : undefined;
  return <View testID="home-week-habits">
    <ScrollingRows scroll={scroll} height={windowHeight} overflow={overflow}>
    {data.items.map((item, index) => {
      const value = item.average === null ? '—' : formatValue(item.average, item.unit, item.valueType);
      // Monday to today: each metric counts the days it has, out of the days the week has had so far.
      const days = item.coverage.eligible ?? data.completedDays + (data.includesToday ? 1 : 0);
      const coverage = `Promedio · ${item.coverage.registered} de ${days} ${days === 1 ? 'día' : 'días'}`;
      const arrow = habitDirection(item);
      const direction = arrow === '↗' ? '. Subió frente a la semana anterior' : arrow === '↘' ? '. Bajó frente a la semana anterior' : '';
      return <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}: ${value}. ${coverage}${direction}`}
        accessibilityHint="Abre esta métrica en Progreso" key={item.id} onPress={() => onOpen(item.id)}
        onLayout={index === 0 ? event => { const h = Math.ceil(event.nativeEvent.layout.height); if (h !== rowHeight) setRowHeight(h); } : undefined}
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
    </ScrollingRows>
    {stale ? <Stale /> : null}
  </View>;
}

/** The rows, in a window of fixed height when there are more than fit; it flashes its scroll bar once so the more is seen. */
function ScrollingRows({ children, height, overflow, scroll }: { children: React.ReactNode; height: number | undefined; overflow: boolean; scroll: React.RefObject<ScrollView | null> }) {
  useEffect(() => { if (overflow && height) { const timer = setTimeout(() => scroll.current?.flashScrollIndicators(), 600); return () => clearTimeout(timer); } }, [overflow, height, scroll]);
  if (!overflow) return <>{children}</>;
  return <ScrollView ref={scroll} nestedScrollEnabled showsVerticalScrollIndicator style={height ? { height, flexGrow: 0 } : null} testID="home-habits-scroll">{children}</ScrollView>;
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
});
