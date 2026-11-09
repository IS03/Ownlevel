import type { BodyWeek, BodyWeekChange } from "../body-evolution/weekly";
import type { NutritionContext } from "./types";
export type CoincidenceWeek = { start: string; end: string; wholeWeek: boolean; days: { date: string; nutrition: NutritionContext | null }[]; weight: BodyWeek | null; weightChange: BodyWeekChange | null };
const sum = (xs:number[])=>xs.reduce((a,b)=>a+b,0);
/** Projection of the weeks already transported. Same formula on server and client; no source read. */
export function coincidenceWeeks(weeks:readonly CoincidenceWeek[]) {
  return weeks.map(week => {
    const complete = week.days.filter(day => day.nutrition && day.nutrition.activeMeals > 0 && day.nutrition.proteinG.missing === 0);
    const partialDays = week.days.filter(day => day.nutrition && day.nutrition.proteinG.missing > 0 && day.nutrition.proteinG.missing < day.nutrition.activeMeals).length;
    const amount = week.wholeWeek && complete.length >= 4 ? sum(complete.map(day => day.nutrition!.proteinG.recorded)) / complete.length : null;
    return { start: week.start, end: week.end, wholeWeek: week.wholeWeek, proteinPerRecordedDay: amount, completeDays: complete.length, partialDays, unknownDays: week.days.length - complete.length - partialDays,
      median: week.weight?.median ?? null, weighIns: week.weight?.weighIns ?? [], change: week.weightChange?.change ?? null,
      changeReason: week.weightChange?.reason ?? "no_previous_week", previousStart: week.weightChange?.previousStart ?? null,
      days: week.days.map(day => ({ date: day.date, protein: day.nutrition?.proteinG ?? null, records: day.nutrition?.activeMeals ?? 0 })) };
  });
}
