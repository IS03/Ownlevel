import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { PeriodExploration } from '@/api/performance-insights';
import { AppText, spacing } from '@/design-system';
import { formatValue } from '@/progress/progress-format';
import { FactRow } from './insights-screen';
import { InsightRow } from './insight-row';
import { periodDayRows } from './period-nutrition-model';
import { exactPeriodDate } from './period-model';
import { bodyWeightHref, metricTrendHref, nutritionDayHref, type InsightsOrigin } from './navigation';
import { nextDate } from './insights-model';
import type { ExplorationWeek } from './week-comparison-model';

/** The existing exploration records, shared by the one-week view and the A/B selection. No readers. */
export function WeekRecords({ week, metrics, origin }: { week: ExplorationWeek; metrics: PeriodExploration['metrics']; origin: InsightsOrigin }) {
  const router = useRouter();
  return <>{week.days.map(d => <View key={d.date} testID={`week-day-${d.date}`} style={styles.day}>
    <AppText variant="headline" numeric>{exactPeriodDate(d.date)}</AppText>
    <AppText numeric>{d.training?.sessions ?? 0} sesiones finalizadas</AppText>
    {d.nutrition ? periodDayRows({ ...d.nutrition, date: d.date }).map(r => <FactRow key={r.key} label={r.label} value={r.value} detail={r.detail} />) : <AppText muted>Sin comidas registradas; no es cero.</AppText>}
    <AppText numeric>Peso corporal: {d.weight.state === 'recorded' ? formatValue(d.weight.value, 'kg') : d.weight.state === 'invalid' ? 'registro no válido' : 'sin pesaje'}</AppText>
    {d.training ? <InsightRow label="Ver sesiones y comparaciones" spoken={`Ver sesiones y comparaciones del ${exactPeriodDate(d.date)}`} onPress={() => router.push({ pathname: '/(tabs)/train/insights', params: { ...origin, date: d.date, before: nextDate(d.date) } })} /> : null}
    <InsightRow label="Abrir Nutrición" spoken={`Abrir Nutrición del ${exactPeriodDate(d.date)}`} onPress={() => router.push(nutritionDayHref(d.date, origin))} />
    <InsightRow label="Ver en Cuerpo" spoken={`Ver peso corporal del ${exactPeriodDate(d.date)}`} onPress={() => router.push(bodyWeightHref({ from: week.start, to: week.end }, origin))} />
    {d.metrics.map(m => { const def = metrics.find(v => v.id === m.metricId); return <InsightRow key={m.metricId} label={def?.name ?? 'Métrica personal'} value={formatValue(m.value, def?.unit ?? null)} spoken={`Ver ${def?.name ?? 'métrica personal'} del ${exactPeriodDate(d.date)}`} onPress={() => router.push(metricTrendHref(m.metricId, d.date, origin))} />; })}
  </View>)}</>;
}
const styles = StyleSheet.create({ day: { gap: spacing.xs, paddingVertical: spacing.md } });
