import type { NutritionStages } from '@/api/nutrition-stages';
import { chartBands } from './stages-model';

const DAY = 86_400_000;
const epoch = (date: string) => Date.parse(`${date}T12:00:00Z`);
const dateOf = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Positions are in bar slots, including fractions when a stage changes inside a block.
 * Bucket ends are inclusive; stage ends are exclusive. Only the current report's dates belong here.
 */
export function nutritionChartBands(list: NutritionStages | null | undefined, buckets: { start: string; end: string }[]) {
  return chartBands(list, buckets.flatMap(b => [b.start, b.end])).flatMap(band => {
    const pieces = buckets.flatMap((bucket, i) => {
      const start = epoch(bucket.start), end = epoch(bucket.end) + DAY;
      const from = Math.max(start, epoch(band.start)), to = Math.min(end, band.end ? epoch(band.end) : end);
      return from < to ? [{ left: i + (from - start) / (end - start), right: i + (to - start) / (end - start), from, to }] : [];
    });
    if (!pieces.length) return [];
    return [{ ...band, left: pieces[0].left, right: pieces[pieces.length - 1].right,
      visibleStart: dateOf(pieces[0].from), visibleEnd: dateOf(pieces[pieces.length - 1].to - DAY) }];
  });
}
