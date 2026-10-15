import { StyleSheet, View } from 'react-native';
import type { ProgressComparison, ProgressTrainingSummary } from '@/api/progress';
import { AppText, spacing } from '@/design-system';
import { formatValue } from './progress-format';
import { useComparisonText } from './progress-range-context';

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
function Line({ label, value, comparison, unit, duration }: { label: string; value: string; comparison: ProgressComparison; unit: string | null; duration?: boolean }) {
  const compare = useComparisonText()(comparison, unit, duration ? 'duration' : 'integer');
  return <View style={styles.line}>
    <View style={styles.row}><AppText style={styles.flex}>{label}</AppText><AppText variant="label">{value}</AppText></View>
    {compare ? <AppText muted variant="caption">{compare}</AppText> : null}
  </View>;
}
/** Training load (sessions, days, sets, session duration) and the exercise performance tally. No volume. */
export function TrainingSummaryCard({ summary, compact }: { summary: ProgressTrainingSummary; compact?: boolean }) {
  const c = summary.comparisons, p = summary.performance;
  return <View style={styles.block} testID="training-summary">
    <AppText variant="label">Entrenamiento</AppText>
    {summary.sessions === 0 ? <AppText muted>Sin entrenamientos completados en este período.</AppText> : null}
    <Line label="Sesiones" value={String(summary.sessions)} comparison={c.sessions} unit="sesiones" />
    <Line label="Días entrenados" value={String(summary.trainingDays)} comparison={c.trainingDays} unit="días" />
    <Line label="Series completadas" value={String(summary.sets)} comparison={c.sets} unit="series" />
    {compact ? null : <Line label="Duración de sesiones" value={formatValue(summary.minutes, null, 'duration')} comparison={c.minutes} unit={null} duration />}
    {summary.sessionsPerWeek !== null && summary.sessions > 0 ? <AppText muted variant="caption">Frecuencia media: {new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(summary.sessionsPerWeek)} sesiones por semana</AppText> : null}
    <AppText muted variant="caption">{p.comparable
      ? `Ejercicios: ${count(p.improved, 'mejoró', 'mejoraron')} · ${count(p.stable, 'estable', 'estables')} · ${count(p.declined, 'bajó', 'bajaron')}${p.insufficient ? ` · ${p.insufficient} sin comparación` : ''}`
      : `Ejercicios: sin historial comparable${p.insufficient ? ` (${p.insufficient} sin comparación)` : ''}.`}</AppText>
  </View>;
}
const styles = StyleSheet.create({ block: { gap: 4 }, line: { gap: 2 }, row: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }, flex: { flex: 1 } });
