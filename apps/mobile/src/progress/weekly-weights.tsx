import { StyleSheet, View } from 'react-native';
import { AppText, spacing } from '@/design-system';
import { FactRow } from '@/insights/insights-screen';
import { MIN_WEEKLY_WEIGH_INS, weeklyWeights, type BodyWeekly } from '../../../../src/lib/progress/body-evolution/weekly';
import { arrowDelta, formatValue } from './progress-format';
import { shortRange } from './progress-range';

const WEEKDAY = new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' });
const weekday = (date: string) => `${WEEKDAY.format(new Date(`${date}T12:00:00Z`)).replace('.', '')} ${Number(date.slice(8, 10))}`;
const weighIns = (count: number) => count === 1 ? '1 pesaje' : `${count} pesajes`;
const REASON = {
  week_insufficient: `No se puede calcular el cambio: esta semana tiene menos de ${MIN_WEEKLY_WEIGH_INS} pesajes`,
  previous_week_insufficient: `No se puede calcular el cambio: la semana anterior tiene menos de ${MIN_WEEKLY_WEIGH_INS} pesajes`,
} as const;
/**
 * A change that was computed. Zero is a real equality between two medians, said as such: "sin cambio" would read like the
 * comparison that could not be made (#415).
 */
export function changeText(change: number) {
  return Math.abs(change) < 1e-9 ? '= 0 kg, igual que la semana anterior' : `${arrowDelta(change, 'kg')} frente a la semana anterior`;
}

/**
 * One row per whole closed week of the period, newest first: its median, its weigh-ins with their dates, and the change from the
 * week right before, with an arrow and its size. Never a color or a word that judges it, and never across an empty week.
 */
export function weeklyRows(weekly: BodyWeekly, today: string) {
  const changes = new Map(weekly.changes.map(change => [change.weekStart, change]));
  return [...weekly.weeks].reverse().map(week => {
    const label = `Semana ${shortRange({ start: week.start, end: week.end }, today)}`;
    const value = week.median === null ? 'Sin mediana' : `Mediana ${formatValue(week.median, 'kg')}`;
    const dates = week.weighIns.length ? `${weighIns(week.weighIns.length)}: ${week.weighIns.map(row => weekday(row.date)).join(', ')}` : 'Sin pesajes';
    const change = changes.get(week.start);
    const versus = !change ? null : change.change === null ? REASON[change.reason as keyof typeof REASON] : changeText(change.change);
    const detail = versus ? `${dates} · ${versus}` : dates;
    return { key: week.start, label, value, detail, spoken: `${label}: ${value.toLocaleLowerCase('es-AR')}. ${detail}` };
  });
}

/** Cuerpo → peso: the weeks of the period already read. Nothing is asked for here, and nothing is interpolated. */
export function WeeklyWeights({ observations, period, today }: { observations: readonly { date: string; value: number }[]; period: { start: string; end: string }; today: string }) {
  const weekly = weeklyWeights(observations, period, today);
  const rows = weeklyRows(weekly, today);
  const left = weekly.outside.partialWeeks + weekly.outside.currentWeek;
  return <View style={styles.section} testID="body-weekly">
    <AppText muted variant="footnote" accessibilityRole="header">Semana a semana</AppText>
    {rows.length ? rows.map(row => <FactRow key={row.key} label={row.label} value={row.value} detail={row.detail} spoken={row.spoken} />)
      : <AppText muted variant="footnote" testID="body-weekly-empty">Este período no tiene semanas completas ya cerradas.</AppText>}
    <AppText muted variant="caption" style={styles.note}>
      De lunes a domingo. La mediana necesita al menos {MIN_WEEKLY_WEIGH_INS} pesajes en la semana, y el cambio se calcula solo entre semanas seguidas. La semana en curso no entra.
      {left ? ` ${weighIns(left)} del período ${left === 1 ? 'queda' : 'quedan'} fuera por caer en una semana incompleta o en curso.` : ''}
    </AppText>
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
  note: { paddingTop: spacing.xs },
});
