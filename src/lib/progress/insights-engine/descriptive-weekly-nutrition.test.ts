import {expect,it} from 'vitest';
import {descriptiveWeeklyFixture} from './descriptive-fixture.test-helper';
import {periodExploration} from './week-exploration';
import {coincidenceWeeks,nutrientWeeks,weeklyNutritionGroups,WEEKLY_NUTRIENTS} from './descriptive-weeks';
import {parsePerformanceInsights} from '../../mobile-api/performance-insights-contract';
const run=(f=descriptiveWeeklyFixture())=>periodExploration(structuredClone(f.source),f.weights,'2026-11-09','2026-11-07','r1',2);
it('retains the canonical protein/body meaning while all four nutrient cuts ignore training/body results',()=>{
 const f=descriptiveWeeklyFixture(),p=run(f),protein=weeklyNutritionGroups(p.weeks,'proteinG'),legacy=p.coincidenceSummary!.body;
 expect(protein.cut).toBe(20);expect(protein.groups.map(g=>[g.weeks.length,g.body])).toEqual(legacy.groups.map(g=>[g.weeks,{eligible:g.eligible,increased:g.increased,same:g.same,decreased:g.decreased}]));
 expect(weeklyNutritionGroups(p.weeks,'calories').cut).toBe(200);expect(weeklyNutritionGroups(p.weeks,'carbsG').cut).toBe(50);expect(weeklyNutritionGroups(p.weeks,'fatG').contrast).toBe('constant');
 const altered=structuredClone(f);for(const s of altered.source.sets)s.actualLoad=1;altered.weights=altered.weights.map(w=>({...w,value:55}));
 for(const nutrient of WEEKLY_NUTRIENTS){const a=weeklyNutritionGroups(run(altered).weeks,nutrient),b=weeklyNutritionGroups(p.weeks,nutrient);expect(a.cut).toBe(b.cut);expect(a.groups.map(g=>g.weeks.map(w=>w.start))).toEqual(b.groups.map(g=>g.weeks.map(w=>w.start)));}
});
it('separates usable explicit zero, partial, all unknown and no meals with distinct per-nutrient denominators',()=>{
 const p=run(),w=p.weeks.find(w=>w.start==='2026-08-03')!;
 w.days[0]!.nutrition!.activeMeals=2;w.days[0]!.nutrition!.calories.missing=1;w.days[1]!.nutrition!.calories.missing=1;w.days[2]!.nutrition=null;
 const calories=nutrientWeeks([w],'calories')[0]!,protein=nutrientWeeks([w],'proteinG')[0]!;
 expect(calories).toMatchObject({completeDays:4,partialDays:1,unknownDays:1,noMealDays:1,amountPerRecordedDay:0});
 expect(protein).toMatchObject({completeDays:6,partialDays:0,unknownDays:0,noMealDays:1,amountPerRecordedDay:0});
 expect(coincidenceWeeks([w])[0]!.unknownDays).toBe(1); // Historical bucket still includes no meals.
 w.days[3]!.nutrition=null;expect(nutrientWeeks([w],'calories')[0]!.amountPerRecordedDay).toBeNull();
});
it('keeps complete/partial comparator results, session/day denominators and compatible external references separate',()=>{
 const p=run(),m=weeklyNutritionGroups(p.weeks,'calories');
 expect(m.strictReady).toBe(true);expect(m.partialReady).toBe(true);
 for(const g of m.groups){expect(g.sessions).toBe(4);expect(g.trainingDays).toBe(4);expect(g.strict.comparable).toBe(4);expect(g.partial.comparable).toBe(4);expect(g.strictSessions).toBe(4);expect(g.partialSessions).toBe(4);expect(g.strict.total).toBe(8);expect(g.strict.insufficient).toBe(4);}
 expect(p.weeks.find(w=>w.start==='2026-08-03')!.trainingCoverage).toEqual({strictSessions:1,partialSessions:1,routines:{distinct:1,unknownSessions:0}});
 // The first eligible session compares against July, outside its week and the loaded quarter.
 const f=descriptiveWeeklyFixture();expect(f.source.sessions[0]!.date).toBe('2026-07-27');expect(m.groups[0]!.strict.improved).toBe(4);
});
it('keeps insufficient weight, gaps and exactly zero computed change apart, never using W-1 nutrition',()=>{
 const p=run(),m=weeklyNutritionGroups(p.weeks,'proteinG'),rows=m.rows;
 expect(rows.find(w=>w.start==='2026-08-10')).toMatchObject({change:0,changeReason:'computed',previousStart:'2026-08-03',amountPerRecordedDay:0});
 const f=descriptiveWeeklyFixture();f.weights=f.weights.filter(w=>!['2026-08-17','2026-08-18','2026-08-19'].includes(w.date));
 const gap=weeklyNutritionGroups(run(f).weeks,'proteinG').rows;expect(gap.find(w=>w.start==='2026-08-17')).toMatchObject({change:null,changeReason:'week_insufficient'});expect(gap.find(w=>w.start==='2026-08-24')).toMatchObject({change:null,changeReason:'previous_week_insufficient'});
 expect(gap.find(w=>w.start==='2026-08-31')!.change).not.toBeNull();
});
it('excludes partial weeks at year boundaries, preserves constant/empty groups and displays insufficient support',()=>{
 const f=descriptiveWeeklyFixture();const empty={...f.source,sessions:[],exercises:[],sets:[],meals:[],feelings:[]};
 const year=periodExploration(empty,[],'2027-02-03','2027-01-04','r1',2);expect(year.weeks.find(w=>w.start==='2026-12-28')!.end).toBe('2026-12-31');expect(year.weeks.find(w=>w.start==='2026-12-28')!.wholeWeek).toBe(false);
 const m=weeklyNutritionGroups(year.weeks,'calories');expect(m.groups.map(g=>g.weeks.length)).toEqual([0,0]);expect(m.strictReady||m.partialReady||m.bodyReady).toBe(false);expect(m.contrast).toBe('no_data');
 const constant=weeklyNutritionGroups(run().weeks,'fatG');expect(constant.groups.map(g=>g.weeks.length)).toEqual([8,0]);expect(constant.bodyReady).toBe(false);
});
it('accepts older server coverage as unavailable and rejects impossible optional counts',()=>{
 const p=run();expect(parsePerformanceInsights(p)).toBeDefined();const old=structuredClone(p);for(const w of old.weeks)delete w.trainingCoverage;expect(parsePerformanceInsights(old)).toBeDefined();expect(weeklyNutritionGroups(old.weeks,'proteinG').groups[0]!.strictSessions).toBeNull();
 const bad=structuredClone(p);bad.weeks[1]!.trainingCoverage!.strictSessions=99;expect(parsePerformanceInsights(bad)).toBeUndefined();
 const invalidDay=structuredClone(p);(invalidDay.weeks[1]!.days as unknown[])[0]=null;expect(parsePerformanceInsights(invalidDay)).toBeUndefined();
});
