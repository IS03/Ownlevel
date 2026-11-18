import { expect, it } from '@jest/globals';
import { atlasHistory, atlasReport } from './panorama-daily.test-helper';
import { panoramaFixture } from './panorama-fixture.test-helper';
import { panoramaCalendar, panoramaCalories, panoramaWeightGeometry } from './panorama-model';

it('aligns the real calendar to Monday, preserves empty days and rejects unavailable or inconsistent snapshots', () => {
  const data = panoramaFixture(), history = atlasHistory(data);
  const cells = panoramaCalendar(data, history)!;
  expect(cells.slice(0, 6)).toEqual(Array(6).fill(null)); // 11 Oct is Sunday.
  expect(cells.filter(Boolean)).toHaveLength(30);
  expect(cells.filter(c => c?.count === 0)).toHaveLength(23);
  history.days[0].completedSessionsCount = 0;
  expect(panoramaCalendar(data, history)).toBeNull();
  history.availability.training = 'unavailable'; history.days.forEach(d => { d.completedSessionsCount = null; });
  expect(panoramaCalendar(data, history)).toBeNull();
});
it('uses the canonical closed-day calorie sample, including partial totals and real zero, never today or missing days', () => {
  const data = panoramaFixture(), report = atlasReport(data);
  report.days[1].nutrients.calories.status = 'partial';
  report.days[2].nutrients.calories.value = 0;
  const points = panoramaCalories(data, report)!;
  expect(points).toHaveLength(10);
  expect(points.some(p => p.partial)).toBe(true);
  expect(points.some(p => p.value === 0)).toBe(true);
  expect(points.some(p => p.date === data.today)).toBe(false);
  report.summary.metrics.calories.denominator++;
  expect(panoramaCalories(data, report)).toBeNull();
  report.summary.metrics.calories.denominator--; report.range.start = '2026-10-12';
  expect(panoramaCalories(data, report)).toBeNull();
});
it('keeps absent calorie samples distinct from an unavailable report and refuses a different mean', () => {
  const data = panoramaFixture(), report = atlasReport(data);
  report.summary.metrics.calories.value = 5;
  expect(panoramaCalories(data, report)).toBeNull();
  if (data.nutrition.status === 'ok') data.nutrition.data.averageKcal = null;
  data.panorama!.nutrition!.caloriesDays = 0;
  expect(panoramaCalories(data, atlasReport(data))).toEqual([]);
  expect(panoramaCalories(data, undefined)).toBeNull();
});
it('keeps weight gaps and proportional dates, including constant or single observations', () => {
  const points = [{ start: '2026-11-01', end: '2026-11-07', value: 70 }, { start: '2026-11-08', end: '2026-11-14', value: null }, { start: '2026-11-15', end: '2026-11-18', value: 70 }];
  const geometry = panoramaWeightGeometry(points, 160, 64);
  expect(geometry).toEqual([{ x: 4, y: 32 }, null, { x: 156, y: 32 }]);
  expect(panoramaWeightGeometry([points[0]], 160, 64)).toEqual([{ x: 80, y: 32 }]);
  expect(panoramaWeightGeometry([points[1]], 160, 64)).toEqual([]);
});
