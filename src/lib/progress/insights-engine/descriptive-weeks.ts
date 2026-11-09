import { median, type BodyWeek, type BodyWeekChange } from "../body-evolution/weekly";
import type { NutritionContext } from "./types";
export type CoincidenceWeek = { start: string; end: string; wholeWeek: boolean; days: { date: string; nutrition: NutritionContext | null }[]; weight: BodyWeek | null; weightChange: BodyWeekChange | null };
const sum = (xs:number[])=>xs.reduce((a,b)=>a+b,0);
/** Projection of the weeks already transported. Same formula on server and client; no source read. */
export function coincidenceWeeks(weeks:readonly CoincidenceWeek[]) {
  return nutrientWeeks(weeks,'proteinG').map(w=>({start:w.start,end:w.end,wholeWeek:w.wholeWeek,proteinPerRecordedDay:w.amountPerRecordedDay,
    completeDays:w.completeDays,partialDays:w.partialDays,unknownDays:w.unknownDays+w.noMealDays,
    median:w.median,weighIns:w.weighIns,change:w.change,changeReason:w.changeReason,previousStart:w.previousStart,
    days:w.days.map(d=>({date:d.date,protein:d.nutrient,records:d.records}))}));
}

export const WEEKLY_NUTRIENTS = ['calories', 'proteinG', 'carbsG', 'fatG'] as const;
export type WeeklyNutrient = typeof WEEKLY_NUTRIENTS[number];
export type WeeklyTrainingCoverage = { strictSessions: number; partialSessions: number; routines: { distinct: number; unknownSessions: number } };
export type WeeklyDescriptionSource = Omit<CoincidenceWeek,'days'> & {
  trainingCoverage?: WeeklyTrainingCoverage;
  days: (CoincidenceWeek['days'][number] & {
    training?: { sessions: number; counts: import('../performance-insights/types').PerformanceCounts } | null;
    partial?: { counts: import('../performance-insights/partial').PartialCounts } | null;
  })[];
};
function weeklyTraining(weeks:readonly Pick<WeeklyDescriptionSource,'days'|'trainingCoverage'>[]) {
  const days=weeks.flatMap(w=>w.days),strict=(field:'improved'|'observedStable'|'declined'|'ambiguous'|'insufficient'|'comparable'|'total')=>sum(days.map(d=>d.training?.counts[field]??0));
    const partial=(field:'higher'|'same'|'lower'|'ambiguous'|'insufficient'|'comparable'|'total')=>sum(days.map(d=>d.partial?.counts[field]??0));
  return {
      sessions:sum(days.map(d=>d.training?.sessions??0)),trainingDays:days.filter(d=>(d.training?.sessions??0)>0).length,
      strict:{improved:strict('improved'),observedStable:strict('observedStable'),declined:strict('declined'),ambiguous:strict('ambiguous'),insufficient:strict('insufficient'),comparable:strict('comparable'),total:strict('total')},
      partial:{higher:partial('higher'),same:partial('same'),lower:partial('lower'),ambiguous:partial('ambiguous'),insufficient:partial('insufficient'),comparable:partial('comparable'),total:partial('total')},
      strictDays:days.filter(d=>(d.training?.counts.comparable??0)>0).length,partialDays:days.filter(d=>(d.partial?.counts.comparable??0)>0).length,
      strictSessions:weeks.every(w=>w.trainingCoverage!==undefined)?sum(weeks.map(w=>w.trainingCoverage!.strictSessions)):null,
      partialSessions:weeks.every(w=>w.trainingCoverage!==undefined)?sum(weeks.map(w=>w.trainingCoverage!.partialSessions)):null,
      strictWeeks:weeks.filter(w=>w.days.some(d=>(d.training?.counts.comparable??0)>0)).length,
      partialWeeks:weeks.filter(w=>w.days.some(d=>(d.partial?.counts.comparable??0)>0)).length,
  };
}

/** Same recorded-day formula as protein/weight, with the old unknown bucket separated for the new surface. */
export function nutrientWeeks(weeks: readonly WeeklyDescriptionSource[], nutrient: WeeklyNutrient) {
  return weeks.map(week => {
    const state=(day:CoincidenceWeek['days'][number])=>!day.nutrition || day.nutrition.activeMeals===0?'no_meals':day.nutrition[nutrient].missing===0?'usable':day.nutrition[nutrient].missing<day.nutrition.activeMeals?'partial':'unknown';
    const complete=week.days.filter(d=>state(d)==='usable');
    return { start:week.start,end:week.end,wholeWeek:week.wholeWeek,
      amountPerRecordedDay:week.wholeWeek&&complete.length>=4?sum(complete.map(d=>d.nutrition![nutrient].recorded))/complete.length:null,
      completeDays:complete.length,partialDays:week.days.filter(d=>state(d)==='partial').length,
      unknownDays:week.days.filter(d=>state(d)==='unknown').length,noMealDays:week.days.filter(d=>state(d)==='no_meals').length,
      median:week.weight?.median??null,weighIns:week.weight?.weighIns??[],change:week.weightChange?.change??null,
      changeReason:week.weightChange?.reason??'no_previous_week',previousStart:week.weightChange?.previousStart??null,
      trainingCoverage:week.trainingCoverage,training:weeklyTraining([week]),
      days:week.days.map(d=>({...d,nutrient:d.nutrition?.[nutrient]??null,state:state(d),records:d.nutrition?.activeMeals??0})) };
  });
}

/** Local projection of the bounded, already loaded weeks. No transport IDs, reads, search or outcome-based cuts. */
export function weeklyNutritionGroups(weeks: readonly WeeklyDescriptionSource[], nutrient: WeeklyNutrient) {
  const rows=nutrientWeeks(weeks,nutrient),eligible=rows.filter(w=>w.amountPerRecordedDay!==null);
  const values=eligible.map(w=>w.amountPerRecordedDay!),cut=values.length?median(values):null;
  const groups=(['lower','upper'] as const).map(key=>{
    const selected=eligible.filter(w=>key==='lower'?w.amountPerRecordedDay!<=cut!:w.amountPerRecordedDay!>cut!);
    const changes=selected.filter(w=>w.change!==null);
    return {key,weeks:selected,
      completeDays:sum(selected.map(w=>w.completeDays)),partialFoodDays:sum(selected.map(w=>w.partialDays)),unknownDays:sum(selected.map(w=>w.unknownDays)),noMealDays:sum(selected.map(w=>w.noMealDays)),
      ...weeklyTraining(selected),
      body:{eligible:changes.length,increased:changes.filter(w=>w.change!>0).length,same:changes.filter(w=>w.change===0).length,decreased:changes.filter(w=>w.change!<0).length}};
  });
  return {rows,cut,groups,excluded:rows.filter(w=>w.amountPerRecordedDay===null),
    excludedPartial:rows.filter(w=>!w.wholeWeek).length,excludedCoverage:rows.filter(w=>w.wholeWeek&&w.amountPerRecordedDay===null).length,
    contrast:!eligible.length?'no_data':new Set(values).size===1?'constant':groups.some(g=>!g.weeks.length)?'empty_group':'available',
    strictReady:groups.every(g=>g.strictWeeks>=2),partialReady:groups.every(g=>g.partialWeeks>=2),bodyReady:groups.every(g=>g.body.eligible>=2)};
}
