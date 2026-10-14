import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

import type { HistoryDay } from '@/api/history';
import type { NutritionDayMetric } from '@/api/nutrition-day';
import {
  AppIcon,
  AppText,
  brandTokens,
  SkeletonBlock,
  pressedStyle,
  radius,
  spacing,
  useOwnlevelTheme,
  useReduceMotion,
  type AppIconName,
} from '@/design-system';

import { metricValue } from '@/nutrition/day-content';

import type { HomeResource } from './home-resource';
import { homeMetricIcon } from './home-metric-icons';
import { HomeSection, useHomeGutter } from './home-ui';

/** Only daily metrics: weight and body measurements live in Progreso (Cuerpo). */
export type HomeRegisterTarget = { kind: 'metric'; metricId: string } | { kind: 'more' };

/** All active metrics, in the user's own order. The viewport, not the data, is limited. */
export function registerMetrics(day: HistoryDay | undefined): NutritionDayMetric[] {
  if (!day || day.metrics.status !== 'ok') return [];
  return day.metrics.data.metrics.filter(metric => metric.isActive);
}

/** One shortcut: a 48 pt circle, its name and today's state; a check badge when it is logged today. */
function RegisterCircle({ detail, done, glass, icon, label, onPress, testID, width }: {
  detail: string | null; done: boolean; glass: boolean; icon: AppIconName; label: string; onPress: () => void; testID?: string; width: number;
}) {
  const { colors, isDark } = useOwnlevelTheme();
  const reduceMotion = useReduceMotion();
  const image = <AppIcon color={colors.textMuted} name={icon} size={20} />;
  return (
    <Pressable
      accessibilityHint={done ? 'Ya lo registraste hoy' : 'Abre la carga de hoy'}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityRole="button"
      accessibilityState={{ checked: done }}
      onPress={onPress}
      style={({ pressed }) => [styles.item, { width }, glass && !reduceMotion ? null : pressedStyle(pressed, reduceMotion)]}
      testID={testID}
    >
      <View style={styles.circleWrap}>
        {glass ? <GlassView colorScheme={isDark ? 'dark' : 'light'} glassEffectStyle="regular" isInteractive={!reduceMotion} style={styles.circle} testID={`${testID}-glass`}>{image}</GlassView>
          : <View style={[styles.circle, { backgroundColor: colors.surface }]}>{image}</View>}
        {done ? (
          <View style={[styles.badge, { backgroundColor: colors.background }]}>
            <AppIcon color={colors.primary} name="check" size={17} />
          </View>
        ) : null}
      </View>
      <AppText style={styles.label} variant="subheadline">{label}</AppText>
      {detail === null ? <SkeletonBlock height={14} width={40} /> : (
        <AppText muted numeric style={styles.detail} variant="footnote">{detail}</AppText>
      )}
    </Pressable>
  );
}

export function HomeRegister({ date, onRegister, today }: { date: string; onRegister: (target: HomeRegisterTarget) => void; today: HomeResource<HistoryDay> }) {
  const supported = Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  const [reduceTransparency, setReduceTransparency] = useState(true);
  useEffect(() => {
    if (!supported) return;
    let alive = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => { if (alive) setReduceTransparency(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', value => { if (alive) setReduceTransparency(value); });
    return () => { alive = false; subscription.remove(); };
  }, [supported]);
  const glass = supported && !reduceTransparency;
  const window = useWindowDimensions();
  const gutter = useHomeGutter();
  const [width, setWidth] = useState(Math.max(1, window.width - gutter.paddingLeft - gutter.paddingRight));
  // Only a confirmed read of today says what is (not) logged today; anything else stays
  // unknown ("—", no check): a stale or previous-day read never claims a state.
  const day = today.data?.date === date ? today.data : undefined;
  const confirmed = today.status === 'ready' && !!day;
  const loading = !day && today.status === 'loading';
  const metrics = registerMetrics(day);
  const itemWidth = Math.max(width / 3, brandTokens.space.xxxl * 2 * Math.max(1, window.fontScale));
  return (
    <HomeSection testID="home-register" title="Métricas">
      <View onLayout={event => { const next = event.nativeEvent.layout.width - gutter.paddingRight; if (next > 0) setWidth(next); }} style={[styles.row, { marginRight: -gutter.paddingRight }]} testID="home-register-row">
        <ScrollView accessibilityHint="Deslizá para ver más métricas" contentContainerStyle={[styles.scrollContent, { paddingRight: gutter.paddingRight }]} decelerationRate="fast"
          directionalLockEnabled horizontal nestedScrollEnabled removeClippedSubviews={false} showsHorizontalScrollIndicator={metrics.length > 3}
          style={styles.scroll} testID="home-register-scroll">
        {loading
          ? <><RegisterCircle detail={null} done={false} glass={false} icon="activity" label=" " onPress={() => undefined} width={itemWidth} /><RegisterCircle detail={null} done={false} glass={false} icon="activity" label=" " onPress={() => undefined} width={itemWidth} /></>
          : metrics.map(metric => (
            <RegisterCircle detail={!confirmed ? '—' : metric.value === null ? 'Cargar' : metricValue(metric, metric.value)} done={confirmed && metric.value !== null}
              glass={glass} icon={homeMetricIcon(metric.systemKey)} key={metric.id} label={metric.label}
              onPress={() => onRegister({ kind: 'metric', metricId: metric.id })} testID={`home-register-metric-${metric.id}`} width={itemWidth} />
          ))}
          <RegisterCircle detail="Métricas" done={false} glass={glass} icon="more" label="Más" onPress={() => onRegister({ kind: 'more' })} testID="home-register-more" width={itemWidth} />
        </ScrollView>
      </View>
    </HomeSection>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: radius.full, bottom: -4, padding: 1, position: 'absolute', right: -4 },
  circle: { alignItems: 'center', borderRadius: radius.full, height: 48, justifyContent: 'center', width: 48 },
  circleWrap: { height: 48, marginBottom: 2, width: 48 },
  detail: { textAlign: 'center' },
  item: { alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: spacing.xs },
  label: { fontWeight: '600', textAlign: 'center' },
  // Native glass grows outside its 48 pt circle. Keep its entire expansion inside the
  // scroller's clipping rectangle, including the final Más control.
  row: { alignItems: 'flex-start', flexDirection: 'row', marginTop: -brandTokens.space.md, paddingTop: spacing.xs },
  scroll: { flex: 1 },
  scrollContent: { alignItems: 'flex-start', paddingBottom: spacing.sm, paddingTop: brandTokens.space.lg },
});
