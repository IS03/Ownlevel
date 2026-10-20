import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type {MetricDefinition} from '@/api/metric-definitions';
import type {QuickMetricTap} from './use-home-metric-entry';
import {NutritionCalorieRing} from '@/nutrition/day-rings';
import {useTweenedNumber} from '@/nutrition/use-tweened-number';
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
export type HomeRegisterTarget = { kind: 'metric'; metricId: string; quick?:QuickMetricTap } | { kind: 'more' };

/** All active metrics, in the user's own order. The viewport, not the data, is limited. */
export function registerMetrics(day: HistoryDay | undefined): NutritionDayMetric[] {
  if (!day || day.metrics.status !== 'ok') return [];
  return day.metrics.data.metrics.filter(metric => metric.isActive);
}

/** One shortcut: a 48 pt circle, its name and today's state; a check badge when it is logged today. */
function RegisterCircle({ detail, done, glass, icon, label, onPress, testID, width, onLongPress, pending=false, disabled=false, ring, quick=false }: {
  detail: string | null; done: boolean; glass: boolean; icon: AppIconName; label: string; onPress: () => void; testID?: string; width: number;
  onLongPress?:()=>void;pending?:boolean;disabled?:boolean;ring?:React.ReactNode;quick?:boolean;
}) {
  const { colors, isDark } = useOwnlevelTheme();
  const reduceMotion = useReduceMotion();
  const image = pending?<ActivityIndicator size="small" color={colors.primary}/>:<AppIcon color={colors.textMuted} name={icon} size={20} />;
  return (
    <Pressable
      accessibilityHint={quick?'Un toque suma tu porción. Mantené apretado para cargar otro valor.':done ? 'Ya lo registraste hoy' : 'Abre la carga de hoy'}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityRole="button"
      accessibilityState={{ checked: done,busy:pending,disabled }}
      disabled={disabled} onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [styles.item, { width }, glass && !reduceMotion ? null : pressedStyle(pressed, reduceMotion)]}
      testID={testID}
    >
      <View style={styles.circleWrap}>
        {glass ? <GlassView colorScheme={isDark ? 'dark' : 'light'} glassEffectStyle="regular" isInteractive={!reduceMotion} style={styles.circle} testID={`${testID}-glass`}>{image}</GlassView>
          : <View style={[styles.circle, { backgroundColor: colors.surface }]}>{image}</View>}
        {ring?<View pointerEvents="none" style={StyleSheet.absoluteFill}>{ring}</View>:null}
        {done ? (
          <View style={[styles.badge, { backgroundColor: colors.background }]}>
            <AppIcon color={colors.primary} name="check" size={17} />
          </View>
        ) : null}
        {/* Quick entry: one tap adds the portion. A small "+" says so before the first tap. */}
        {quick ? (
          <View style={[styles.quickBadge, { backgroundColor: colors.background, borderColor: colors.border }]} testID={`${testID}-quick`}>
            <AppIcon color={colors.textMuted} name="plus" size={13} />
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

export type MetricPresentationProps={metricDefinitions?:MetricDefinition[];metricBusyId?:string|null;metricsLocked?:boolean};
function MetricCircle({metric,definition,confirmed,date,onRegister,pending,disabled,...circle}:{metric:NutritionDayMetric;definition?:MetricDefinition;confirmed:boolean;date:string;onRegister:(t:HomeRegisterTarget)=>void;pending:boolean;disabled:boolean;glass:boolean;width:number}){
 const shown=useTweenedNumber(confirmed?metric.value:null,300);
 const quick=confirmed&&definition?.quickValue!=null;
 return <RegisterCircle {...circle} detail={!confirmed?'—':shown===null?'Cargar':metricValue(metric,shown)} done={confirmed&&metric.value!==null} icon={homeMetricIcon(metric.systemKey,definition?.icon)} label={metric.label} testID={'home-register-metric-'+metric.id} pending={pending} disabled={disabled} quick={quick}
  ring={<NutritionCalorieRing size={48} reading={{value:shown,target:metric.target,partial:false}} testID={'home-register-ring-'+metric.id}/>}
  onPress={()=>onRegister({kind:'metric',metricId:metric.id,...(quick?{quick:{portion:definition!.quickValue!,value:metric.value,updatedAt:metric.updatedAt,definitionUpdatedAt:metric.definitionUpdatedAt,date}}:{})})}
  onLongPress={()=>onRegister({kind:'metric',metricId:metric.id})}/>;
}
export function HomeRegister({ date, onRegister, today,metricDefinitions=[],metricBusyId,metricsLocked=false }: { date: string; onRegister: (target: HomeRegisterTarget) => void; today: HomeResource<HistoryDay> }&MetricPresentationProps) {
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
            <MetricCircle metric={metric} definition={metricDefinitions.find(d=>d.id===metric.id)} confirmed={confirmed} date={date} onRegister={onRegister} pending={metricBusyId===metric.id} disabled={metricsLocked} glass={glass} key={metric.id} width={itemWidth}/>
          ))}
          <RegisterCircle detail="Métricas" done={false} glass={glass} icon="more" label="Más" onPress={() => onRegister({ kind: 'more' })} testID="home-register-more" width={itemWidth} />
        </ScrollView>
      </View>
    </HomeSection>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: radius.full, bottom: -4, padding: 1, position: 'absolute', right: -4 },
  quickBadge: { alignItems: 'center', borderRadius: radius.full, borderWidth: StyleSheet.hairlineWidth, height: 20, justifyContent: 'center',
    position: 'absolute', right: -4, top: -4, width: 20 },
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
