/** Dependency-free, so the shared contract can check a period without loading the engine. */
/**
 * #367 phase 4: the last three whole calendar months, by the Córdoba date. Fixed by the date alone, never by what the months hold;
 * the month in progress is never one of them.
 */
export const PERIOD_MONTHS = 3;
export type InsightsPeriod = { start: string; end: string; months: string[]; days: number };
export function periodOf(today: string, months = PERIOD_MONTHS): InsightsPeriod {
  const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const first = new Date(Date.UTC(year, month - 1 - months, 1)), last = new Date(Date.UTC(year, month - 1, 0));
  const list = Array.from({ length: months }, (_, index) => new Date(Date.UTC(year, month - 1 - months + index, 1)).toISOString().slice(0, 7));
  const start = first.toISOString().slice(0, 10), end = last.toISOString().slice(0, 10);
  return { start, end, months: list, days: Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1 };
}
