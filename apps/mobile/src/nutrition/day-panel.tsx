import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { RoutineSheetButton } from '@/training/routine-sheet-button';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { MobileNutritionDayResponse, NutritionDayMetric } from '@/api/nutrition-day';
import { AppIcon, AppSheet, AppText, GlassSurface, ScreenGlow, brandTokens, useAppSheetDismiss, useOwnlevelTheme, useReduceMotion, type AppIconName } from '@/design-system';
import { homeMetricIcon } from '@/home/home-metric-icons';
import { amount } from './day-format';
import { NutritionSectionHeading } from './day-controls';
import { NutritionDayDetails, metricValue, type DayContextAction } from './day-details';
import { canWriteDay } from './day-write-model';
import { canEditDayMetric } from './metric-entry-model';
import { NutritionCalorieRing } from './day-rings';
import { useTweenedNumber } from './use-tweened-number';
import {useMetricPresentations} from '@/metrics/presentation-provider';

function PanelCell({ title, value, target, icon, onPress, metric, actionLabel }: {
  title: string; value: string; target?: string; actionLabel?: string; icon: AppIconName; onPress?: () => void; metric?: NutritionDayMetric;
}) {
  const { colors } = useOwnlevelTheme(), reduced = useReduceMotion();
  // A new metric value: the ring fills to it; without a target the icon gives a small bump instead.
  const shown = useTweenedNumber(metric?.value ?? null);
  const bump = useSharedValue(1);
  const [last, setLast] = useState(metric?.value ?? null);
  if ((metric?.value ?? null) !== last) {
    const next = metric?.value ?? null;
    setLast(next);
    if (!reduced && metric && metric.target === null && next !== null && (last === null || next > last)) {
      bump.set(withSequence(withTiming(1.18, { duration: brandTokens.motion.duration.fast }), withSpring(1, brandTokens.motion.spring)));
    }
  }
  const bumped = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const content = <>
    <Animated.View style={[styles.icon, { backgroundColor: colors.surfaceRaised }, bumped]}>
      {metric ? <View style={StyleSheet.absoluteFill}><NutritionCalorieRing size={36} reading={{ value: shown, target: metric.target, partial: false }} testID={`nutrition-metric-ring-${metric.id}`} /></View> : null}
      <AppIcon name={icon} color={colors.textMuted} size={17} />
    </Animated.View>
    <View style={styles.cellText}>
      <AppText muted variant="caption">{title}</AppText>
      <View style={styles.value}><AppText numeric variant="headline">{value === 'Sin dato' ? '—' : value}</AppText>{target ? <AppText muted numeric variant="caption">{target}</AppText> : null}</View>
    </View>
  </>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${value}${target ? ` ${target}` : ''}. ${actionLabel ?? 'Editar actividad'}`}
    onPress={onPress} style={({ pressed }) => [styles.cell, pressed && { backgroundColor: colors.brandSubtle }]} testID={metric ? `nutrition-metric-${metric.id}` : undefined}>{content}</Pressable> : <View style={styles.cell}>{content}</View>;
}
export function NutritionDayPanel({ data, onDetail, onMetric }: {
  data: MobileNutritionDayResponse; onDetail: () => void; onMetric?: (data: MobileNutritionDayResponse, metric: NutritionDayMetric) => void;
}) {
  const { colors } = useOwnlevelTheme();
  const definitions=useMetricPresentations();
  const n = data.nutrition.status === 'ok' && data.nutrition.data.dayState === 'recorded' ? data.nutrition.data : null;
  const caloriesKnown = n && !(n.summary.entryCount > 0 && n.summary.calories.missingCount === n.summary.entryCount);
  // The arrow carries the direction; the number is the magnitude (no minus sign next to an arrow, no color).
  const balance = caloriesKnown && n.context.energyBalanceKcal !== null ? amount(Math.abs(n.context.energyBalanceKcal), 'kcal') : 'Sin dato';
  const metrics = data.activity.status === 'ok' ? data.activity.data.metrics : [];
  return <View style={styles.section} testID="nutrition-day-panel">
    <NutritionSectionHeading action="Detalle" onAction={onDetail}>Tu día</NutritionSectionHeading>
    {/* E5 explicitly allows glass for this action panel; bocetos/PENDIENTES.md records the brand exception. */}
    <GlassSurface style={styles.panel} testID="nutrition-day-panel-material">
      <View style={styles.row}>
        <PanelCell title="Gasto estimado" value={amount(n?.context.expenditureKcal ?? null, 'kcal')} icon="flame" actionLabel="Abrir detalle del día" onPress={onDetail} />
        <PanelCell title="Balance" value={`${n && caloriesKnown && n.context.energyBalanceKcal !== null ? n.context.energyBalanceKcal < 0 ? '↘ ' : n.context.energyBalanceKcal > 0 ? '↗ ' : '' : ''}${balance}${caloriesKnown && n.summary.calories.missingCount > 0 ? ' · parcial' : ''}`}
          icon="scale" actionLabel="Abrir detalle del día" onPress={onDetail} />
      </View>
      {data.activity.status === 'unavailable' ? <AppText muted variant="footnote">Las métricas de esta fecha no están disponibles. Deslizá para reintentar.</AppText>
        : metrics.length === 0 ? <AppText muted variant="footnote">No hay métricas disponibles para esta fecha.</AppText>
        : <View style={[styles.metrics, { borderTopColor: colors.border }]}>
          {metrics.map(m => <PanelCell key={m.id} title={`${m.label}${m.isActive ? '' : ' · archivada'}`} value={metricValue(m, m.value)}
            target={m.target !== null ? `/ ${metricValue(m, m.target)}` : undefined} icon={homeMetricIcon(m.systemKey,definitions.find(d=>d.id===m.id)?.icon)} actionLabel="Cargar esta métrica" onPress={onMetric && canEditDayMetric(data, m) ? () => onMetric(data, m) : undefined} metric={m} />)}
        </View>}
    </GlassSurface>
  </View>;
}
export function NutritionDayDetailSheet({ data, onClose, onContext }: {
  data: MobileNutritionDayResponse; onClose: () => void; onActivity?: (data: MobileNutritionDayResponse) => void; onContext?: DayContextAction;
}) {
  const { colors } = useOwnlevelTheme(), insets = useSafeAreaInsets();
  return <AppSheet onClose={onClose} closeLabel="Cerrar detalle del día desde el fondo" testID="nutrition-day-detail-sheet"
    style={[styles.detailSheet, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 16) }]}>
    <ScreenGlow />
    <DetailBody data={data} onContext={onContext} />
  </AppSheet>;
}
function DetailBody({ data, onContext }: { data: MobileNutritionDayResponse; onContext?: DayContextAction }) {
  const { colors } = useOwnlevelTheme();
  const dismiss = useAppSheetDismiss();
  // "Ajustar hoy" opens the context editor once this sheet is fully gone.
  const adjust: DayContextAction = (day, reset) => dismiss(() => onContext?.(day, reset));
  const canAdjust = onContext && canWriteDay('context', data);
  return <ScrollView contentContainerStyle={styles.detailContent}>
    <View style={styles.detailHeader}><AppText accessibilityRole="header" variant="title2" style={{ flex: 1 }}>Tu día</AppText>
      {canAdjust ? <Pressable accessibilityRole="button" accessibilityLabel="Ajustar hoy" onPress={() => adjust(data)} style={styles.adjust}><AppText variant="subheadline" style={{ color: colors.primary }}>Ajustar hoy</AppText></Pressable> : null}
      <RoutineSheetButton label="Cerrar Detalle del día" icon="close" onPress={() => dismiss()} />
    </View>
    <NutritionDayDetails data={data} onContext={canAdjust ? adjust : undefined} />
  </ScrollView>;
}
const styles = StyleSheet.create({

  detailSheet: { maxHeight: '90%' },
  detailContent: { padding: 16, gap: 20 }, detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 }, adjust: { minHeight: 44, justifyContent: 'center' },
  section: { gap: 8 }, panel: { borderRadius: 20, padding: 18, gap: 12 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  cell: { flex: 1, minWidth: '42%', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, cellText: { flex: 1 },
  value: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 },
});
