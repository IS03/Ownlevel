import type { HistoryRange } from '@/api/history';
import { reportFixture } from '@/nutrition/report-fixture.test-helper';
import type { ProgressOverview } from '@/api/progress';

export function atlasHistory(data: ProgressOverview): HistoryRange {
  const training = data.training.status === 'ok' ? data.training.data : null;
  const range = { from: data.period.start, to: data.period.end };
  return { today: data.today, requestedRange: range, effectiveRange: range,
    availability: { training: training ? 'ok' : 'unavailable', nutrition: 'ok', weight: 'ok', measurements: 'ok', metrics: 'ok' },
    days: Array.from({ length: data.period.days }, (_, i) => ({ date: new Date(Date.parse(range.from) + i * 86400000).toISOString().slice(0, 10),
      completedSessionsCount: !training ? null : i < training.trainingDays ? 1 + (i === 0 ? training.sessions - training.trainingDays : 0) : 0,
      nutritionEntriesCount: 0, hasExplicitOverrides: false, hasWeight: false, measurementsCount: 0, metricValuesCount: 0 })) };
}
export function atlasReport(data: ProgressOverview) {
  const report = reportFixture({ period: 'custom', from: data.period.start, to: data.period.end });
  const n = data.nutrition.status === 'ok' ? data.nutrition.data : null;
  const count = n?.averageKcal === null || !n ? 0 : data.panorama?.nutrition?.caloriesDays ?? 10;
  report.today = data.today;
  report.summary.metrics.calories = { value: n?.averageKcal ?? null, denominator: count, partialDays: 0 };
  report.days = report.days.map((d, i) => ({ ...d, isToday: d.date === data.today,
    hasNutrition: i > 0 && i <= count, mealCount: i > 0 && i <= count ? 1 : 0,
    nutrients: Object.fromEntries(Object.keys(d.nutrients).map(k => [k, { value: i > 0 && i <= count ? k === 'calories' ? n!.averageKcal : 100 : null,
      knownMeals: i > 0 && i <= count ? 1 : 0, missingMeals: 0, status: i > 0 && i <= count ? 'complete' : 'none' }])) as typeof d.nutrients }));
  report.evolution.forEach(e => { e.includesToday = e.end === data.today; });
  return report;
}
