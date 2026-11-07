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
});
