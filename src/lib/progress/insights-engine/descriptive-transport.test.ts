import {expect,it} from 'vitest';
import {descriptiveFixture,descriptiveId} from './descriptive-fixture.test-helper';
import {periodExploration,periodCoincidenceEvidence} from './week-exploration';
import {parsePerformanceInsights} from '../../mobile-api/performance-insights-contract';
import {parseInsightsParams} from '../../mobile-api/performance-insights-server';
import {vi} from 'vitest';
vi.mock('server-only',()=>({}));
const source=()=>{const s=descriptiveFixture(),base=s.sessions[1]!;for(let i=0;i<55;i++)s.sessions.push({...base,id:descriptiveId(200+i)});return s;};
it('keeps counts based on the complete population while transporting only an explicit, stable page',()=>{
 const s=source(),initial=periodExploration(s,[],'2026-11-09','2026-11-07','r1',2);
 expect(parsePerformanceInsights(initial)).toBeDefined();expect(initial.coincidenceSummary!.timing.groups[0]!.sessions).toBe(61);
 const json=JSON.stringify(initial.coincidenceSummary);expect(json).not.toContain(descriptiveId(10));expect(json).not.toMatch(/sessionRows|weekRows|"ids"|"starts"/);
 const ids:string[]=[];for(const offset of [0,25,50]){const p=periodCoincidenceEvidence(s,[],'2026-11-09','2026-11-07','r1','r1',{kind:'timing',group:'morning'},offset);expect(parsePerformanceInsights(p)).toBeDefined();expect(p.total).toBe(61);ids.push(...p.sessionRows.map(r=>r.id));expect(p.nextOffset).toBe(offset===50?null:offset+25);}
 const expected=s.sessions.filter(r=>r.date!>='2026-08-01'&&r.date!<='2026-10-31'&&r.startedAt!.includes('T08:')).sort((a,b)=>a.date!.localeCompare(b.date!)||a.id.localeCompare(b.id)).map(r=>r.id);
 expect(ids).toEqual(expected);expect(new Set(ids).size).toBe(61);
 const changed=periodCoincidenceEvidence(s,[],'2026-11-09','2026-11-07','r2','r1',{kind:'timing',group:'morning'},25);expect(changed.status).toBe('revision_changed');expect(changed.sessionRows).toEqual([]);expect(parsePerformanceInsights(changed)).toBeDefined();
});
it('checks page boundaries, request selection and revision instead of silently accepting truncated evidence',()=>{
 const p=periodCoincidenceEvidence(source(),[],'2026-11-09','2026-11-07','r1','r1',{kind:'timing',group:'morning'},0);
 for(const mutate of [(v:typeof p)=>{v.sessionRows.pop();},(v:typeof p)=>{v.nextOffset=50;},(v:typeof p)=>{v.sourceRevision='r2';},(v:typeof p)=>{v.sessionRows[1]!.id=v.sessionRows[0]!.id;}]){const v=structuredClone(p);mutate(v);expect(parsePerformanceInsights(v)).toBeUndefined();}
 const base='view=coincidence-evidence&method=2&asOf=2026-11-07&revision='+ 'a'.repeat(32);
 expect(parseInsightsParams(new URLSearchParams(base+'&kind=timing&group=morning&offset=25'))).toMatchObject({view:'coincidence-evidence',offset:25});
 for(const extra of ['kind=timing&group=lower','kind=protein&group=night','kind=timing&group=morning&offset=1','kind=timing&group=morning&offset=0&offset=25'])expect(()=>parseInsightsParams(new URLSearchParams(base+'&'+extra))).toThrow();
});
it.each(['calories','carbs','lastMeal'] as const)('pages %s with shared session rows, complete counts and fixed revision',kind=>{
 const s=source(),group=kind==='lastMeal'?'within1h' as const:'lower' as const;
 s.meals.forEach((m,i)=>{m.calories=i<7?0:600;m.carbsG=i<7?0:100;if(i>=7)m.consumedAt=`${m.date}T13:30:00-03:00`;});
 const initial=periodExploration(s,[],'2026-11-09','2026-11-07','r1',2),seen:string[]=[];
 expect(initial.coincidenceSummary!.preMeal![kind].groups.find(g=>g.key===group)!.sessions).toBe(61);
 for(const offset of [0,25,50]){const page=periodCoincidenceEvidence(s,[],'2026-11-09','2026-11-07','r1','r1',{kind,group},offset);expect(page.total).toBe(61);expect(parsePerformanceInsights(page)).toBeDefined();seen.push(...page.sessionRows.map(r=>r.id));expect(page.sessionRows.every(r=>r.preMeal&&r.concurrency)).toBe(true);}
 expect(seen).toEqual(s.sessions.filter(r=>r.date!>='2026-08-01'&&r.date!<='2026-10-31'&&r.startedAt!.includes('T08:')).sort((a,b)=>a.date!.localeCompare(b.date!)||a.id.localeCompare(b.id)).map(r=>r.id));expect(new Set(seen).size).toBe(61);
 const revised=periodCoincidenceEvidence(s,[],'2026-11-09','2026-11-07','r2','r1',{kind,group},25);expect(revised.status).toBe('revision_changed');expect(revised.sessionRows).toEqual([]);
 const query='view=coincidence-evidence&method=2&asOf=2026-11-07&revision='+'a'.repeat(32)+'&kind='+kind;
 expect(()=>parseInsightsParams(new URLSearchParams(query+'&group='+(kind==='lastMeal'?'lower':'within1h')))).toThrow();
});
