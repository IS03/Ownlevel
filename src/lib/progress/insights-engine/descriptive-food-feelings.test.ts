import { expect, it } from 'vitest';
import { descriptivePreMealFixture, descriptiveId } from './descriptive-fixture.test-helper';
import { periodExploration, periodCoincidenceEvidence } from './week-exploration';
import { parsePerformanceInsights } from '../../mobile-api/performance-insights-contract';
const run=(s=descriptivePreMealFixture())=>periodExploration(structuredClone(s),[],'2026-11-09','2026-11-07','r1',2);
const raw=(s:ReturnType<typeof descriptivePreMealFixture>,i:number)=>s.feelings[i+1]!.facts as Record<string,Record<string,unknown>>;
const food=(p:ReturnType<typeof run>)=>p.coincidenceSummary!.preMeal!.calories;
it('describes independent energy/fatigue populations, prior levels and overlap without requiring comparator or paired answers',()=>{
 const s=descriptivePreMealFixture();
 for(let i=0;i<12;i++) {const f=raw(s,i);f.energyPre!.value=i<6?1:4;f.fatiguePre={...f.energyPre!,value:i<6?2:5};}
 delete raw(s,0).energyPost; delete raw(s,1).energyPre; delete raw(s,2).fatiguePost;
 for(let i=6;i<10;i++)delete raw(s,i).fatiguePost;
 s.sets=[]; // No comparable exercises; still the same food and feeling population.
 const p=run(s),d=food(p),[lo,hi]=d.groups;
 expect(d.strictReady).toBe(false);expect(d.feelingReadiness).toEqual({energy:true,fatigue:false});
 expect(lo!.feelings!.energy).toEqual({pre:{posts:[5,0,0,0,0],eligible:5,total:6,exclusions:{not_recorded:1}},post:{posts:[0,0,5,0,0],eligible:5,total:6,exclusions:{not_recorded:1}},paired:4});
 expect(hi!.feelings!.energy.pre.posts).toEqual([0,0,0,6,0]);
 expect(lo!.feelings!.fatigue.post.eligible).toBe(5);expect(hi!.feelings!.fatigue.post.eligible).toBe(2);
 expect(lo!.feelings!.fatigue.pre.posts).toEqual([0,6,0,0,0]);expect(hi!.feelings!.fatigue.pre.posts).toEqual([0,0,0,0,6]);
 expect(parsePerformanceInsights(p)).toBeDefined();
});
it('keeps during-session, exact finish/+2h, late, unknown, absent, unreadable and other-scale post answers separate',()=>{
 const s=descriptivePreMealFixture();
 const changes=[{capturedAt:s.sessions[1]!.startedAt},{capturedAt:s.sessions[2]!.endedAt},{capturedAt:'2026-08-05T11:00:00-03:00'},{capturedAt:'2026-08-06T11:00:00.001-03:00'},{capturedAt:null},{value:0}];
 changes.forEach((v,i)=>Object.assign(raw(s,i).energyPost!,v));
 raw(s,6).energyPost!.instrumentVersion='other/1';delete raw(s,7).energyPost;raw(s,8).energyPost!.capturedAt='invalid';
 const d=food(run(s));expect(d.groups[0]!.feelings!.energy.post).toEqual({posts:[0,0,2,0,0],eligible:2,total:6,exclusions:{before_end:1,late:1,unknown_time:1,unreadable:1}});
 expect(d.groups[1]!.feelings!.energy.post).toEqual({posts:[0,0,3,0,0],eligible:3,total:6,exclusions:{other_instrument:1,not_recorded:1,unknown_time:1}});
 expect(d.feelingReadiness!.energy).toBe(false);
 // Historical How you finished still admits answers during the session; the new description does not redefine it.
 expect(run(s).weeks.flatMap(w=>w.feelings).filter(f=>f.kind==='energy').reduce((n,f)=>n+f.capture.atFinish,0)).toBe(6);
});
it('reuses prior moment rules and counts absent, invalid scale, unreadable and late without substituting a post answer',()=>{
 const s=descriptivePreMealFixture();
 Object.assign(raw(s,0).energyPre!,{capturedAt:'2026-08-03T08:10:00-03:00'}); // first set, inclusive
 Object.assign(raw(s,1).energyPre!,{capturedAt:'2026-08-04T08:10:00.001-03:00'});
 raw(s,2).energyPre!.capturedAt=null;delete raw(s,3).energyPre;raw(s,4).energyPre!.value=8;raw(s,5).energyPre!.instrumentVersion='other/1';
 const f=food(run(s)).groups[0]!.feelings!.energy;
 expect(f.pre).toEqual({posts:[0,0,1,0,0],eligible:1,total:6,exclusions:{late:1,unknown_time:1,not_recorded:1,unreadable:1,other_instrument:1}});expect(f.paired).toBe(1);expect(f.post.eligible).toBe(6);
});
it('keeps constant/empty food groups and insufficient sensations, explicit zero and unknown meal time honest',()=>{
 const s=descriptivePreMealFixture();for(const m of s.meals)m.calories=0;
 raw(s,0).energyPost!.value=1;const d=food(run(s));expect(d.contrast).toBe('constant');expect(d.groups.map(g=>g.sessions)).toEqual([12,0]);expect(d.feelingReadiness).toEqual({energy:false,fatigue:false});expect(d.groups[1]!.feelings!.energy.pre.total).toBe(0);
 s.meals[1]!.consumedAt=null;const p=run(s);expect(food(p).eligible).toBe(11);expect(food(p).exclusions).toEqual({untimed_meal_in_scope:1});
 const page=periodCoincidenceEvidence(structuredClone(s),[],'2026-11-09','2026-11-07','r1','r1',{kind:'calories',group:'excluded'},0);expect(page.sessionRows[0]!.prior!.energy.state).toBe('recorded');expect(page.sessionRows[0]!.post.energy.value).toBe(1);
});
it('keeps food summary populations independent of evidence pagination, and returns prior facts once per shared row',()=>{
 const s=descriptivePreMealFixture(),base=s.sessions[1]!,f=s.feelings[1]!,m=s.meals[1]!;
 for(let i=0;i<55;i++){const id=descriptiveId(20000+i);s.sessions.push({...base,id});s.feelings.push({...f,sessionId:id});s.meals.push({...m,id:descriptiveId(21000+i),date:'2026-07-01'});}
 const p=run(s);expect(food(p).groups[0]!.feelings!.energy.post.total).toBe(61);
 const ids:string[]=[];for(const offset of [0,25,50]){const page=periodCoincidenceEvidence(structuredClone(s),[],'2026-11-09','2026-11-07','r1','r1',{kind:'calories',group:'lower'},offset);expect(parsePerformanceInsights(page)).toBeDefined();expect(page.total).toBe(61);for(const row of page.sessionRows){ids.push(row.id);expect(row.prior!.energy.value).toBe(3);} }
 expect(new Set(ids).size).toBe(61);expect(ids).toEqual([base.id,...s.sessions.slice(13).map(x=>x.id),...s.sessions.slice(2,7).map(x=>x.id)]);
 const stale=periodCoincidenceEvidence(s,[],'2026-11-09','2026-11-07','r2','r1',{kind:'calories',group:'lower'},0);expect(stale).toMatchObject({status:'revision_changed',sessionRows:[]});
 const text=JSON.stringify(p.coincidenceSummary);expect(text).not.toMatch(/"ids"|sessionRows|"prior"|"capturedAt"/);
});
it('accepts older summaries/evidence as unavailable extensions and rejects inconsistent new coverage',()=>{
 const p=run(),old=structuredClone(p);
 for(const d of [old.coincidenceSummary!.protein,...Object.values(old.coincidenceSummary!.preMeal!)]){delete d.feelingReadiness;for(const g of d.groups)delete g.feelings;}
 expect(parsePerformanceInsights(old)).toBeDefined();
 for(const mutate of [(d:ReturnType<typeof food>)=>{d.groups[0]!.feelings!.energy.post.posts[0]=99;},(d:ReturnType<typeof food>)=>{d.groups[0]!.feelings!.energy.paired=0;},(d:ReturnType<typeof food>)=>{d.feelingReadiness!.energy=false;},(d:ReturnType<typeof food>)=>{delete d.groups[0]!.feelings;}]){const bad=structuredClone(p);mutate(food(bad));expect(parsePerformanceInsights(bad)).toBeUndefined();}
 const page=periodCoincidenceEvidence(descriptivePreMealFixture(),[],'2026-11-09','2026-11-07','r1','r1',{kind:'protein',group:'lower'},0);for(const r of page.sessionRows)delete r.prior;expect(parsePerformanceInsights(page)).toBeDefined();
});
