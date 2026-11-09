import {createInsightsSnapshot} from './read-model';
import {descriptiveCoincidences} from './descriptive-coincidences';
import {expect,it} from 'vitest';
import {periodExploration} from './week-exploration';
import {descriptiveFixture,descriptiveBodyFixture,descriptiveId} from './descriptive-fixture.test-helper';
import {parsePerformanceInsights} from '../../mobile-api/performance-insights-contract';
const run=(source=descriptiveFixture(),weights:{date:string;value:number}[]=[])=>{const frame=periodExploration(source,weights,'2026-11-09','2026-11-07','fixed-r1',2);const old:{coincidences?:ReturnType<typeof descriptiveCoincidences>}={coincidences:descriptiveCoincidences(source,createInsightsSnapshot(source,{today:'2026-11-07',revision:'fixed-r1',method:2}),frame.weeks,frame.period)};return {...frame,...old};};
it('keeps a fixed inventory, exposure-only median groups and independent comparator lanes even with identical outcomes',()=>{
  const source=descriptiveFixture(),data=run(source),c=data.coincidences!;
  expect(c.protein.cut).toBe(25);expect(c.protein.groups.map(g=>g.sessions)).toEqual([6,6]);
  expect(c.protein.status).toBe('described');expect(c.timing.energyReady).toBe(true);
  expect(c.timing.groups.filter(g=>g.sessions).map(g=>g.energy.posts)).toEqual([[0,0,6,0,0],[0,0,6,0,0]]);
  const changed=structuredClone(source);for(const row of changed.sets)row.actualLoad=5;for(const row of changed.feelings)(row.facts as {energyPost:{value:number}}).energyPost.value=1;
  const after=run(changed).coincidences!;expect(after.protein.cut).toBe(c.protein.cut);expect(after.protein.groups.map(g=>g.ids)).toEqual(c.protein.groups.map(g=>g.ids));
  const first=c.sessionRows.find(r=>r.id===descriptiveId(10))!;expect(first.strict.comparable).toBe(1); // Its reference is July, outside August–October.
  expect(c.protein.groups[0]!.strict.comparable).toBe(6);expect(c.protein.groups[0]!.partial.comparable).toBe(0);expect(c.protein.partialReady).toBe(false);
  const unrecorded=structuredClone(source);for(const exercise of unrecorded.exercises)exercise.configuration=null;
  const onlyPartial=run(unrecorded).coincidences!;expect(onlyPartial.protein.groups[0]!.strict.comparable).toBe(0);expect(onlyPartial.protein.groups[0]!.partial.comparable).toBe(6);
  expect(c.protein.groups[0]!.routines[0]!.name).toBe('Rutina A');expect(c.protein.groups[1]!.routines[0]!.name).toBe('Rutina B');
  expect(data.associations).toBe('not_computed');expect(parsePerformanceInsights(data)).toBeDefined();
  const legacy=structuredClone(data);delete legacy.coincidences;expect(parsePerformanceInsights(legacy)).toBeDefined();
});
it('keeps explicit zero, missing protein/time and posterior meals separate; windows cross midnight',()=>{
  const source=descriptiveFixture(),session=source.sessions[1]!,meal=source.meals[1]!;
  session.startedAt='2026-08-03T01:00:00-03:00';session.endedAt='2026-08-03T02:00:00-03:00';meal.date='2026-08-02';meal.consumedAt='2026-08-02T23:00:00-03:00';meal.proteinG=0;
  expect(run(source).coincidences!.sessionRows.find(r=>r.id===session.id)!.protein).toEqual({state:'recorded',value:0});
  const next=structuredClone(source);next.meals[1]!.consumedAt=null;expect(run(next).coincidences!.sessionRows.find(r=>r.id===session.id)!.protein.value).toBeNull();
  const original=descriptiveFixture(),expected=run(original).coincidences!.protein.cut;
  (original.meals as unknown[]).push({...original.meals[1]!,id:descriptiveId(8888),proteinG:10000,consumedAt:'2026-08-03T12:00:00-03:00'});
  expect(run(original).coincidences!.protein.cut).toBe(expected);
});
it('reports during-session, late, unknown clocks and missing post without ordinal averages or combined scales',()=>{
  const source=descriptiveFixture();
  const at=['2026-08-03T08:30:00-03:00','2026-08-04T12:00:00-03:00',null];
  at.forEach((capturedAt,i)=>{(source.feelings[i+1]!.facts as {energyPost:{capturedAt:string|null}}).energyPost.capturedAt=capturedAt;});
  const c=run(source).coincidences!,g=c.timing.groups[0]!;
  expect(g.energy.exclusions).toMatchObject({before_end:1,late:1,unknown_time:1});expect(g.energy.eligible).toBe(3);expect(g.fatigue.eligible).toBe(6);
  expect(g.energy.posts).toEqual([0,0,3,0,0]);
  const flat=descriptiveFixture();for(const meal of flat.meals)meal.proteinG=10;
  expect(run(flat).coincidences!.protein.status).toBe('insufficient');
});
it('uses canonical consecutive body medians, including real zero changes and absent differences, with exposure-only weekly cuts',()=>{
  const {source,weights}=descriptiveBodyFixture(),data=run(source,weights),c=data.coincidences!;
  expect(c.body.cut).toBe(20);expect(c.body.status).toBe('described');
  expect(c.body.groups.map(g=>[g.weeks,g.eligible,g.increased,g.same,g.decreased])).toEqual([[4,3,0,2,1],[4,4,2,2,0]]);
  expect(c.weekRows.find(w=>w.start==='2026-08-10')!.change).toBe(0);
  const sparse=run(source,weights.filter(w=>w.date!=='2026-08-10'&&w.date!=='2026-08-11')).coincidences!;
  expect(sparse.weekRows.find(w=>w.start==='2026-08-10')!.change).toBeNull();expect(sparse.body.cut).toBe(c.body.cut);
  expect(sparse.weekRows.find(w=>w.start==='2026-08-17')!.change).toBeNull();
  const noNutrition=structuredClone(source);for(const meal of noNutrition.meals)meal.proteinG=null;
  expect(run(noNutrition,weights).coincidences!.body.status).toBe('insufficient');expect(run(noNutrition,weights).coincidences!.body.groups.every(g=>g.weeks===0)).toBe(true);
});
it('rejects malformed optional projections and out-of-period/duplicate evidence while retaining absent support for older clients',()=>{
  const original=run();
  for(const mutate of [(x:typeof original)=>{x.coincidences!.sessionRows[0]!.date='2026-07-01';},(x:typeof original)=>{x.coincidences!.timing.groups[0]!.energy.posts[0]=-1;},(x:typeof original)=>{x.coincidences!.claim='causal' as never;},(x:typeof original)=>{x.coincidences!.body.groups[0]!.eligible=999;},(x:typeof original)=>{x.coincidences!.protein.groups[1]!.ids[0]=x.coincidences!.protein.groups[0]!.ids[0]!;}]) {
    const broken=structuredClone(original);mutate(broken);expect(parsePerformanceInsights(broken)).toBeUndefined();
  }
  const empty=descriptiveBodyFixture();empty.source.meals=[];const c=run(empty.source).coincidences!;
  expect(c.protein.status).toBe('insufficient');expect(c.body.status).toBe('insufficient');expect(c.timing.energyReady).toBe(false);
});
