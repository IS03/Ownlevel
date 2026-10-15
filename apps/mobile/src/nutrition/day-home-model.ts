import type { MobileNutritionDayResponse, NutritionNutrientTotal } from '@/api/nutrition-day';
import type { ReportDailyRow } from '@/api/nutrition-report';
import { shiftNutritionDate } from './day-format';

export type RingReading = { value: number | null; target: number | null; partial: boolean };
export type DayRings = { calories: RingReading; protein: RingReading };
const unknown = (): RingReading => ({ value: null, target: null, partial: false });

export function nutrientReading(total: NutritionNutrientTotal, entries: number, target: number | null): RingReading {
  return { value: entries > 0 && total.missingCount === entries ? null : total.knownTotal,
    target, partial: total.missingCount > 0 && total.missingCount < entries };
}
export function dayRings(data?: MobileNutritionDayResponse): DayRings {
  const n = data?.nutrition.status === 'ok' && data.nutrition.data.dayState === 'recorded' ? data.nutrition.data : null;
  return n ? { calories: nutrientReading(n.summary.calories, n.summary.entryCount, n.context.calorieTarget),
    protein: nutrientReading(n.summary.proteinG, n.summary.entryCount, n.context.proteinTargetG) }
    : { calories: unknown(), protein: unknown() };
}
export function reportRings(row?: ReportDailyRow): DayRings {
  if (!row?.hasNutrition) return { calories: unknown(), protein: unknown() };
  const read = (key: 'calories' | 'protein', target: number | null): RingReading => ({
    value: row.nutrients[key].value, target, partial: row.nutrients[key].status === 'partial',
  });
  return { calories: read('calories', row.targetCalories), protein: read('protein', row.targetProteinG) };
}
/** No arc is inferred from an absent/non-positive target, missing intake or a negative value. */
export function ringFraction(reading: RingReading): number | null {
  return reading.value !== null && reading.value >= 0 && reading.target !== null && reading.target > 0
    ? reading.value / reading.target : null;
}
export function nutritionWeek(date: string): string[] {
  const offset = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => shiftNutritionDate(date, i - offset)!);
}
export function nutritionMonth(date: string) {
  const start = `${date.slice(0, 7)}-01`;
  const endDate = new Date(`${start}T12:00:00Z`);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1, 0);
  return { start, end: endDate.toISOString().slice(0, 10),
    offset: (new Date(`${start}T12:00:00Z`).getUTCDay() + 6) % 7,
    days: endDate.getUTCDate() };
}
