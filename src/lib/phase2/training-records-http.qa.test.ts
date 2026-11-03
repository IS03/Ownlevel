import {readFileSync} from 'node:fs';
import {it,expect,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
vi.mock('server-only',()=>({}));
import {loadTrainingRecordsData,trainingRecordsSource} from './training-robust';
import {trainingRecordsDto} from '../mobile-api/progress-training';
it('after real HTTP PGRST202 the application falls back through real paginated PostgREST GETs',async()=>{
 const f=JSON.parse(readFileSync(process.env.OWNLEVEL_RECORDS_FIXTURE!,'utf8'));
 const requests:{path:string;status:number}[]=[];
 const supabase=createClient(f.url,'fixture-only-public-key',{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${f.token}`},fetch:async(input,init)=>{
  const u=new URL(String(input));u.pathname=u.pathname.replace(/^\/rest\/v1/,'');
  const r=await fetch(u,init);requests.push({path:u.pathname,status:r.status});return r;
 }}});
 const c=f.cases[1]; const period={start:'2026-10-02',end:'2026-10-31',previousStart:c.from,previousEnd:'2026-10-01'};
 const source=await loadTrainingRecordsData({userId:f.owner,supabase} as never,c.from);
 expect(requests[0]).toEqual({path:'/rpc/mobile_read_training_records',status:404});
 expect(requests.filter(r=>r.path==='/workout_sets').length).toBeGreaterThan(1);
 expect(requests.slice(1).every(r=>r.status===200||r.status===206)).toBe(true);
 expect(trainingRecordsDto(source,'2026-10-31',period as never)).toEqual(trainingRecordsDto(trainingRecordsSource(c.data,c.from),'2026-10-31',period as never));
 console.log('HTTP fallback verified',JSON.stringify({requests:requests.length,statuses:[...new Set(requests.map(r=>r.status))],equivalent:true}));
},30000);
