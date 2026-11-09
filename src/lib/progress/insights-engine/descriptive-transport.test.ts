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
