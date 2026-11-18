import type { HistoryRange } from '@/api/history';
import type { NutritionReport } from '@/api/nutrition-report';
import type { ProgressOverview, ProgressSparkPoint } from '@/api/progress';

/** These readers are independent snapshots. Never pair a different window or mismatched totals. */
export function panoramaCalendar(overview: ProgressOverview, history: HistoryRange | undefined) {
  if (!history || overview.training.status !== 'ok' || history.availability.training !== 'ok'
    || history.today !== overview.today || history.effectiveRange.from !== overview.period.start || history.effectiveRange.to !== overview.period.end) return null;
  const days = history.days;
  if (days.some(d => d.completedSessionsCount === null)
    || days.reduce((sum, d) => sum + d.completedSessionsCount!, 0) !== overview.training.data.sessions
    || days.filter(d => d.completedSessionsCount! > 0).length !== overview.training.data.trainingDays) return null;
  const lead = (new Date(`${history.effectiveRange.from}T12:00:00Z`).getUTCDay() + 6) % 7;
  const cells: ({ date: string; count: number } | null)[] = Array.from({ length: lead }, () => null);
  cells.push(...days.map(d => ({ date: d.date, count: d.completedSessionsCount! })));
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function panoramaCalories(overview: ProgressOverview, report: NutritionReport | undefined) {
  if (!report || overview.nutrition.status !== 'ok' || report.today !== overview.today
    || report.range.start !== overview.period.start || report.range.end !== overview.period.end) return null;
  // Canonical eligibility: a CLOSED day with registered, known calories, including partial entries.
  // `isComplete` in the engine means date < today, not proof of complete food intake.
  const days = report.days.filter(d => !d.isToday && d.hasNutrition && d.nutrients.calories.value !== null);
  const average = report.summary.metrics.calories.value, expected = overview.nutrition.data.averageKcal;
  if (days.length !== report.summary.metrics.calories.denominator
    || (overview.panorama?.nutrition && days.length !== overview.panorama.nutrition.caloriesDays)
    || (average === null) !== (expected === null)
    || (average !== null && expected !== null && Math.abs(average - expected) > 0.000001)) return null;
  return days.map(d => ({ date: d.date, value: d.nutrients.calories.value!, partial: d.nutrients.calories.status === 'partial' }));
}

/** Only adjacent known buckets can connect; the last short bucket keeps its actual date spacing. */
export function panoramaWeightGeometry(points: readonly ProgressSparkPoint[], width: number, height: number) {
  const known = points.flatMap(p => p.value === null ? [] : [p.value]);
  if (!known.length) return [];
  const low = Math.min(...known), high = Math.max(...known);
  const first = Date.parse(points[0].start), last = Date.parse(points.at(-1)!.start);
  return points.map(p => p.value === null ? null : {
    x: last === first ? width / 2 : 4 + (Date.parse(p.start) - first) / (last - first) * (width - 8),
    y: high === low ? height / 2 : 4 + (high - p.value) / (high - low) * (height - 8),
  });
}
