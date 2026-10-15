import { Modal, Pressable, StyleSheet, View } from 'react-native';
import type { MobileNutritionDayResponse, NutritionDayMetric } from '@/api/nutrition-day';
import { AppIcon, AppText, GlassSurface, ScrollScreen, SheetHeader, useOwnlevelTheme, useReduceMotion, type AppIconName } from '@/design-system';
import { homeMetricIcon } from '@/home/home-metric-icons';
import { amount } from './day-format';
import { NutritionSectionHeading } from './day-controls';
import { NutritionDayDetails, metricValue } from './day-details';
import { canEditDayMetric } from './metric-entry-model';
import { NutritionCalorieRing } from './day-rings';

function PanelCell({ title, value, target, icon, onPress, metric, actionLabel }: {
  title: string; value: string; target?: string; actionLabel?: string; icon: AppIconName; onPress?: () => void; metric?: NutritionDayMetric;
}) {
  const { colors } = useOwnlevelTheme();
  const content = <>
    <View style={[styles.icon, { backgroundColor: colors.surfaceRaised }]}>
      {metric ? <View style={StyleSheet.absoluteFill}><NutritionCalorieRing size={36} reading={{ value: metric.value, target: metric.target, partial: false }} testID={`nutrition-metric-ring-${metric.id}`} /></View> : null}
      <AppIcon name={icon} color={colors.textMuted} size={17} />
    </View>
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
            target={m.target !== null ? `/ ${metricValue(m, m.target)}` : undefined} icon={homeMetricIcon(m.systemKey)} actionLabel="Cargar esta métrica" onPress={onMetric && canEditDayMetric(data, m) ? () => onMetric(data, m) : undefined} metric={m} />)}
        </View>}
    </GlassSurface>
  </View>;
}
export function NutritionDayDetailSheet({ data, onClose, onActivity, onContext }: {
  data: MobileNutritionDayResponse; onClose: () => void; onActivity?: (data: MobileNutritionDayResponse) => void; onContext?: (data: MobileNutritionDayResponse) => void;
}) {
  const reduced = useReduceMotion();
  return <Modal animationType={reduced ? 'fade' : 'slide'} presentationStyle="pageSheet" visible onRequestClose={onClose}>
    <ScrollScreen safeAreaEdges={['top', 'bottom', 'left', 'right']}>
      <SheetHeader title="Detalle del día" onClose={onClose} inset={false} />
      <NutritionDayDetails data={data} onActivity={onActivity ? d => { onClose(); onActivity(d); } : undefined} onContext={onContext ? d => { onClose(); onContext(d); } : undefined} />
    </ScrollScreen>
  </Modal>;
}
const styles = StyleSheet.create({
  section: { gap: 8 }, panel: { borderRadius: 20, padding: 18, gap: 12 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  cell: { flex: 1, minWidth: '42%', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, cellText: { flex: 1 },
  value: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 },
});
