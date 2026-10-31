import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { loadTrainingRecordsData, trainingRecordsSource, type TrainingRecordsRead } from './training-robust';
import { trainingRecordsDto } from '../mobile-api/progress-training';
import type { ProgressPeriod } from '../mobile-api/progress-contract';

// Input is produced by the disposable runner from REAL SQL, never a JS mirror of its aggregation.
const path=process.env.OWNLEVEL_RECORDS_FIXTURE;
describe.skipIf(!path)('real PostgreSQL records fixture',()=>{
  const fixture=path ? JSON.parse(readFileSync(path,'utf8')) as {
    full: TrainingRecordsRead; cases: {days:number;from:string;data:TrainingRecordsRead}[]; owner:string;
  } : null;
  it('returns exactly the old DTO with 3 years of history, across four current/previous windows',()=>{
    for(const c of fixture!.cases){
      const date=(offset:number)=>new Date(Date.UTC(2026,9,31-offset)).toISOString().slice(0,10);
      const period={start:date(c.days-1),end:date(0),previousStart:c.from,previousEnd:date(c.days)} as ProgressPeriod;
      const old=trainingRecordsDto(trainingRecordsSource(fixture!.full,c.from),date(0),period);
      expect(old.personalRecords.length).toBeGreaterThan(0);
      expect(trainingRecordsDto(trainingRecordsSource(c.data,c.from),date(0),period)).toEqual(old);
    }
  });
  it('uses the paginated fallback after DROP and preserves the DTO (PGRST202 contract)',async()=>{
    let pages=0;
    // HTTP error mapping is covered separately; runner verifies PostgreSQL 42883 after the actual DROP.
    const supabase={rpc:vi.fn(async()=>({data:null,error:{code:'PGRST202'}})),from:(table:string)=>{
      const rows: unknown[]=table==='workout_sessions'?fixture!.full.sessions:table==='workout_sets'?fixture!.full.sets:fixture!.full.exercises;
      let start=0,end=999;
      const chain={select:()=>chain,eq:()=>chain,order:()=>chain,returns:()=>chain,
        range:(a:number,b:number)=>{start=a;end=b;return chain;},
        then:(resolve:(value:unknown)=>unknown)=>{pages++;return Promise.resolve({data:rows.slice(start,end+1),error:null,count:rows.length}).then(resolve);}};
      return chain;
    }};
    const c=fixture!.cases[1],from=c.from,period={start:'2026-10-02',end:'2026-10-31',previousStart:from,previousEnd:'2026-10-01'} as ProgressPeriod;
    const loaded=await loadTrainingRecordsData({userId:fixture!.owner,supabase} as never,from);
    expect(pages).toBeGreaterThan(3);
    expect(trainingRecordsDto(loaded,'2026-10-31',period)).toEqual(trainingRecordsDto(trainingRecordsSource(c.data,from),'2026-10-31',period));
  });
});
