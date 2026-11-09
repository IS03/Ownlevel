import {describe,it,expect} from 'vitest';
import {periodDetailsFixture} from './period-details-fixture';
import {periodExploration} from './week-exploration';
import {parsePerformanceInsights} from '../../mobile-api/performance-insights-contract';
describe('period exploration: complete calendar and independent facts',()=>{
  it('keeps every empty day, separates methods and ordinal coverage, and reuses weekly body medians',()=>{
    const weights=['2026-08-03','2026-08-05','2026-08-07','2026-08-10','2026-08-12','2026-08-14'].map((date,i)=>({date,value:i<3?80:79}));
    const body=periodExploration(periodDetailsFixture(),weights,'2027-01-02','2026-11-07','r1',2);
    const days=body.weeks.flatMap(w=>w.days);expect(days).toHaveLength(92);expect(new Set(days.map(d=>d.date)).size).toBe(92);
    expect(days[0]!.date).toBe('2026-08-01');expect(days.at(-1)!.date).toBe('2026-10-31');
    expect(body.weeks[0]!.wholeWeek).toBe(false);expect(body.weeks[0]!.weight).toBeNull();
    expect(body.weeks.find(w=>w.start==='2026-08-10')!.weightChange!.change).toBe(-1);
    expect(days.find(d=>d.date==='2026-08-12')!.nutrition!.calories).toEqual({recorded:0,missing:1});
    expect(days.find(d=>d.date==='2026-08-11')!.training).toBeNull();expect(days.find(d=>d.date==='2026-08-14')!.nutrition).toBeNull();
    expect(body.weeks.some(w=>w.days.every(d=>d.training===null&&d.nutrition===null))).toBe(true);
    expect(parsePerformanceInsights(body)).toBeDefined();
    const gap=structuredClone(body);gap.weeks[0]!.days.shift();expect(parsePerformanceInsights(gap)).toBeUndefined();
    const bad=structuredClone(body);bad.weeks[0]!.wholeWeek=true;expect(parsePerformanceInsights(bad)).toBeUndefined();
    console.log('period-explore fixture bytes:',Buffer.byteLength(JSON.stringify(body)));
  });
  it('retains a fully empty three months and calendar limits across a leap year',()=>{
    const source=periodDetailsFixture(),empty={...source,sessions:[],exercises:[],sets:[],feelings:[],meals:[]};
    const body=periodExploration(empty,[],'2024-04-01','2024-04-01','empty',2);
    expect(body.weeks.flatMap(w=>w.days)).toHaveLength(91);expect(body.weeks.every(w=>w.feelings.every(f=>f.sessions.completed===0))).toBe(true);
    expect(parsePerformanceInsights(body)).toBeDefined();
  });
  it('describes all prior answers independently of post coverage and keeps old payloads compatible',()=>{
    const fixture=periodDetailsFixture();
    const original=periodExploration(fixture,[],'2027-01-02','2026-11-07','r1',2).weeks.find(w=>w.start==='2026-08-03')!;
    expect(original.priorFeelings![0]).toMatchObject({eligible:7,sessions:7,values:[0,0,7,0,0]});
    expect(original.feelings[0]!.capture.atFinish).toBe(1);
    const source={...fixture,feelings:fixture.feelings.map((row,i)=>{
      if(i>6)return row;
      const facts={...row.facts as Record<string,unknown>},pre={...facts.energyPre as Record<string,unknown>};
      if(i===1||i===6)pre.capturedAt=`2026-08-${String(i+3).padStart(2,'0')}T18:20:00-03:00`;
      if(i===2)pre.capturedAt=null;
      if(i===3)delete facts.energyPre;
      else facts.energyPre=i===4?{...pre,value:9}:i===5?{...pre,instrumentVersion:'other/1'}:pre;
      return {...row,facts};
    })};
    const body=periodExploration(source,[],'2027-01-02','2026-11-07','r1',2),week=body.weeks.find(w=>w.start==='2026-08-03')!;
    expect(week.priorFeelings![0]).toEqual({kind:'energy',sessions:7,eligible:1,late:2,timingUnknown:1,notRecorded:1,unreadable:1,otherInstrument:1,values:[0,0,1,0,0]});
    expect(parsePerformanceInsights(body)).toBeDefined();
    const bad=structuredClone(body);bad.weeks.find(w=>w.start===week.start)!.priorFeelings![0]!.eligible++;
    expect(parsePerformanceInsights(bad)).toBeUndefined();
    const old=structuredClone(body);for(const w of old.weeks)delete w.priorFeelings;
    expect(parsePerformanceInsights(old)).toBeDefined();
  });
});
