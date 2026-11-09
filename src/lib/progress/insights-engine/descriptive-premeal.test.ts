import {expect,it} from 'vitest';
import {descriptivePreMealFixture,descriptiveId} from './descriptive-fixture.test-helper';
import {descriptiveCoincidences} from './descriptive-coincidences';
import {createInsightsSnapshot} from './read-model';
import {periodExploration,periodCoincidenceEvidence} from './week-exploration';
import {parsePerformanceInsights} from '../../mobile-api/performance-insights-contract';
// Re-read fixtures as fresh rows, matching the immutable source used by the canonical meal-facts cache.
const run=(input=descriptivePreMealFixture())=>{const s=structuredClone(input),snapshot=createInsightsSnapshot(s,{today:'2026-11-07',revision:'r1',method:2}),initial=periodExploration(s,[],'2026-11-09','2026-11-07','r1',2);return {initial,snapshot,full:descriptiveCoincidences(s,snapshot,initial.weeks,initial.period)};};
it('shares protein grouping, uses recorded calories/grams, fixed last-meal bands and independent method denominators',()=>{
 const s=descriptivePreMealFixture(),{full,initial}=run(s);
 expect(full.preMeal.calories.cut).toBe(300);expect(full.preMeal.carbs.cut).toBe(50);
 for(const k of ['calories','carbs'] as const){const d=full.preMeal[k];expect(d.groups.map(g=>[g.sessions,g.days,g.strict.comparable,g.partial.comparable])).toEqual([[6,6,6,0],[6,6,6,0]]);expect(d.status).toBe('described');}
 expect(full.preMeal.lastMeal.groups.map(g=>[g.key,g.sessions])).toEqual([['within1h',6],['oneTo3h',6],['over3h',0]]);expect(full.preMeal.lastMeal.cut).toBeNull();expect(full.preMeal.lastMeal.status).toBe('described');
 const other=structuredClone(s);for(const m of other.meals)m.proteinG=999;for(const r of other.sets)r.actualLoad=3;
 expect(run(other).full.preMeal.calories.cut).toBe(300);expect(run(other).full.preMeal.carbs.groups.map(g=>g.ids)).toEqual(full.preMeal.carbs.groups.map(g=>g.ids));
 const partial=structuredClone(s);for(const e of partial.exercises)e.configuration=null;
 expect(run(partial).full.preMeal.calories.groups.map(g=>[g.strict.comparable,g.partial.comparable])).toEqual([[0,6],[0,6]]);
 expect(parsePerformanceInsights(initial)).toBeDefined();const legacy=structuredClone(initial);delete legacy.coincidenceSummary!.preMeal;expect(parsePerformanceInsights(legacy)).toBeDefined();
});
it('crosses midnight using real Córdoba dates, preserves legacy carbs scope, excludes posterior and leaves uncertainty unknown',()=>{
 const s=descriptivePreMealFixture(),session=s.sessions[1]!,meal=s.meals[1]!;
 session.startedAt='2026-08-03T01:00:00-03:00';session.endedAt='2026-08-03T02:00:00-03:00';meal.date='2026-08-02';meal.consumedAt='2026-08-02T23:00:00-03:00';
 let row=run(s).full.sessionRows.find(r=>r.id===session.id)!;expect(row.preMeal).toEqual({calories:{value:0,state:'recorded'},carbs:{value:0,state:'recorded'},lastMeal:{value:2,state:'recorded'}});
 s.meals.push({...meal,id:descriptiveId(9998),date:'2026-08-03',consumedAt:'2026-08-03T03:00:00-03:00',calories:999,carbsG:999});
 expect(run(s).full.sessionRows.find(r=>r.id===session.id)!.preMeal).toEqual(row.preMeal);
 s.meals.push({...meal,id:descriptiveId(9999),consumedAt:null});const unknown=run(s);row=unknown.full.sessionRows.find(r=>r.id===session.id)!;
 expect(row.preMeal.carbs).toEqual({value:null,state:'untimed_meal_in_scope'});expect(row.preMeal.lastMeal.value).toBeNull();
 const old=unknown.snapshot.days.flatMap(d=>d.sessions).find(r=>r.sessionId===session.id)!;
 expect(old.context.carbsPre3h).toEqual({value:0,state:'recorded'});expect(old.context.preStart!.lastExplicitMeal).toMatchObject({hours:2,untimedInScope:true});
});
it.each(['registration_now','default_clock',null])('never substitutes %s provenance for an explicit consumption time',source=>{
 const s=descriptivePreMealFixture();s.meals[1]!.consumedAtSource=source;s.meals[1]!.rawInput=source===null?'{}':null;
 const row=run(s).full.sessionRows.find(r=>r.id===s.sessions[1]!.id)!;expect(row.preMeal.calories.value).toBeNull();expect(row.preMeal.carbs.value).toBeNull();expect(row.preMeal.lastMeal.value).toBeNull();
});
it('keeps explicit zero, missing nutrients, constant exposures and no known last meal different',()=>{
 const s=descriptivePreMealFixture();s.meals[1]!.calories=null;s.meals[1]!.carbsG=0;
 let row=run(s).full.sessionRows.find(r=>r.id===s.sessions[1]!.id)!;expect(row.preMeal.calories.state).toBe('partial_macro');expect(row.preMeal.carbs.value).toBe(0);expect(row.preMeal.lastMeal.value).toBe(1);
 s.meals[1]!.consumedAt='2026-08-02T18:00:00-03:00';s.meals[1]!.date='2026-08-02';row=run(s).full.sessionRows.find(r=>r.id===s.sessions[1]!.id)!;
 expect(row.preMeal.lastMeal).toEqual({value:null,state:'no_explicit_meal_in_12h'});
 for(const m of s.meals)m.calories=0;expect(run(s).full.preMeal.calories.contrast).toBe('constant');expect(run(s).full.preMeal.calories.status).toBe('insufficient');
 s.sessions[1]!.startedAt=null;row=run(s).full.sessionRows.find(r=>r.id===s.sessions[1]!.id)!;expect(row.preMeal.lastMeal.state).toBe('no_start_time');expect(row.concurrency.overlap3h).toBeNull();
});
it('uses exact 1/3/12-hour boundaries, counts sessions and days separately and reports overlapping windows',()=>{
 const s=descriptivePreMealFixture(),base=s.sessions[1]!;
 for(const [hours,key] of [[1,'within1h'],[3,'oneTo3h'],[12,'over3h']] as const){s.meals[1]!.consumedAt=new Date(Date.parse(base.startedAt!)-hours*3600000).toISOString();s.meals[1]!.date=hours===12?'2026-08-02':base.date!;expect(run(s).full.preMeal.lastMeal.groups.find(g=>g.key===key)!.ids).toContain(base.id);}
 s.meals[1]!.consumedAt='2026-08-03T07:00:00-03:00';s.meals[1]!.date='2026-08-03';s.sessions.push({...base,id:descriptiveId(9980),startedAt:'2026-08-03T08:30:00-03:00'});
 const c=run(s).full;expect(c.preMeal.calories.groups[0]).toMatchObject({sessions:7,days:6,strictSessions:6,strictDays:6});expect(c.preMeal.calories).toMatchObject({multiSessionDays:1,overlappingSessions:2});
 expect(c.sessionRows.find(r=>r.id===base.id)!.concurrency).toEqual({sameDaySessions:2,overlap3h:1,overlap12h:1});
 const page=periodCoincidenceEvidence(s,[],'2026-11-09','2026-11-07','r1','r1',{kind:'lastMeal',group:'within1h'},0);expect(parsePerformanceInsights(page)).toBeDefined();expect(page.total).toBe(6);expect(page.sessionRows.map(r=>r.id)).not.toContain(descriptiveId(9980));
 const later=periodCoincidenceEvidence(s,[],'2026-11-09','2026-11-07','r1','r1',{kind:'lastMeal',group:'oneTo3h'},0);expect(later.total).toBe(7);expect(later.sessionRows.map(r=>r.id)).toContain(descriptiveId(9980));expect(page.sessionRows[0]!.preMeal).toBeDefined();
 const bad=structuredClone(page);bad.sessionRows[0]!.preMeal!.lastMeal.value=99;expect(parsePerformanceInsights(bad)).toBeUndefined();
});

it('rejects malformed new optional summaries without rejecting an older compatible response',()=>{
 const initial=run().initial;
 for(const mutate of [(v:typeof initial)=>{v.coincidenceSummary!.preMeal!.calories.cut=-1;},(v:typeof initial)=>{v.coincidenceSummary!.preMeal!.lastMeal.groups[0]!.key='lower';},(v:typeof initial)=>{v.coincidenceSummary!.preMeal!.carbs.eligible=999;},(v:typeof initial)=>{v.coincidenceSummary!.preMeal!.calories.groups[0]!.days=99;}]){const value=structuredClone(initial);mutate(value);expect(parsePerformanceInsights(value)).toBeUndefined();}
});
