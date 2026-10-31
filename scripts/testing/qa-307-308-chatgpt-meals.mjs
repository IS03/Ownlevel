// Disposable PostgreSQL 17 for QA #307/#308: ChatGPT meals editable like manual ones, explicit time/type respected,
// registration time never presented as confirmed. No production fixtures or credentials.
// OWNLEVEL_TEST_MODULES=/tmp/tooling/node_modules node scripts/testing/qa-307-308-chatgpt-meals.mjs
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
const modules = process.env.OWNLEVEL_TEST_MODULES;
if (!modules) throw new Error('External embedded-postgres test tooling required');
const { default: EmbeddedPostgres } = await import(pathToFileURL(join(modules, 'embedded-postgres/dist/index.js')));
const directory = await mkdtemp(join(tmpdir(), 'ownlevel-qa307-'));
const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const pg = new EmbeddedPostgres({ databaseDir: join(directory,'db'), port, user:'postgres', password:'local-test',
  persistent:true, createPostgresUser:false, onLog:()=>{}, onError:()=>{}, postgresFlags:['-h','127.0.0.1'] });
const clients=[]; let started=false; let checks=0;
async function connect() { const c=pg.getPgClient(); clients.push(c); await c.connect(); return c; }
const file = name => readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8');
const id=n=>`41200000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1), other=id(2), date='2026-09-20', destination='2026-09-19';
async function role(c,user=owner) { await c.query('set role authenticated'); await c.query("select set_config('request.jwt.claim.sub',$1,false)",[user]); }
const fields=(patch={})=>({date,title:' pasta ',description:null,calories:200,proteinG:null,carbsG:20.25,fatG:0,...patch});
const create=(key,patch={},forceDuplicate=false)=>({operation:'create',sourceDate:date,mealId:null,expectedUpdatedAt:null,idempotencyKey:key,fields:fields(patch),forceDuplicate});
const mutate=async(c,intent)=>(await c.query('select * from public.mobile_mutate_manual_meal($1::jsonb)',[JSON.stringify(intent)])).rows[0];
const edit=(mealId,expectedUpdatedAt,key,patch={},sourceDate=date)=>({operation:'edit',sourceDate,mealId,expectedUpdatedAt,idempotencyKey:key,fields:fields(patch),forceDuplicate:false});
const remove=(mealId,expectedUpdatedAt,key,sourceDate=date)=>({operation:'delete',sourceDate,mealId,expectedUpdatedAt,idempotencyKey:key,fields:null,forceDuplicate:false});
async function check(name,run) { await run(); console.log(`PASS ${name}`); checks++; }
try {
  await pg.initialise(); await pg.start(); started=true;
  const admin=await connect(), a=await connect(), b=await connect(), stranger=await connect();
  await admin.query(`create role anon; create role authenticated; create role service_role; create schema auth; create schema extensions;
    create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  for(const name of ['0001.sql','20260426_0002_phase1_profiles_weight_and_checks.sql','20260426_0004_phase1_remove_meal_status.sql','20260813150000_nutrition_schema_foundation.sql']) await admin.query(await file(name));
  await admin.query('create table public.workout_sessions(id uuid primary key,user_id uuid,day_log_id uuid,status text)');
  for(const name of ['20260813163000_nutrition_day_engine.sql','20260813170000_nutrition_energy_sync.sql','20260908170000_nutrition_plan_energy_v2.sql','20260909180000_daily_nutrition_overrides_v2.sql']) await admin.query(await file(name));
  const normalization=await file('20260426_0012_normalize_names_uppercase.sql');
  await admin.query(normalization.slice(normalization.indexOf('create or replace function'),normalization.indexOf('$$;',normalization.indexOf('create or replace function'))+3));
  await admin.query(await file('20260426_0013_normalize_meals_uppercase.sql'));
  const ledger=await file('20260927190000_mobile_training_api_expand.sql');
  await admin.query(ledger.slice(0,ledger.indexOf('create function public.mobile_create_training_routine'))+'commit;');
  for (const name of ['20260909155017_configurable_daily_metrics.sql','20260914104157_r3_atomic_daily_metric_values.sql','20261003021157_mobile_nutrition_day_read.sql','20261003040926_mobile_activity_context_writes.sql']) await admin.query(await file(name));
  await admin.query('insert into auth.users values($1),($2)',[owner,other]);
  await admin.query('grant select,insert,update on public.day_logs,public.meal_entries to authenticated');
  await role(a); await role(b); await role(stranger,other);
  const blockers=await file('20260814010000_nutrition_import_blockers.sql');
  await admin.query(blockers.slice(0,blockers.indexOf('-- body_measurements'))+'commit;');
  for(const name of ['20260830171201_saved_meals.sql','20260908223000_food_calories_decimal.sql','20261004010134_mobile_quick_registration.sql']) await admin.query(await file(name));
  await admin.query('grant usage on schema extensions to authenticated; grant select on public.profiles, public.workout_sessions to authenticated');
  for(const name of ['20261003031651_mobile_manual_meal_crud.sql','20261004015101_mobile_personal_foods.sql','20261004041348_mobile_saved_meals_management.sql','20260820130000_chatgpt_private_meal_api.sql','20261015031555_mobile_meal_timing_expand.sql','20261028084439_chatgpt_meal_parity_expand.sql']) await admin.query(await file(name));
  const legacy=async(key,patch={})=>(await admin.query('select public.create_chatgpt_meal_for_integration($1,$2,$3,null,$4,null,null,null,$5,false) r',[owner,patch.date??date,patch.title??'yogur',patch.calories??150,key])).rows[0].r;
  const v2=async(key,consumedAt,label,patch={})=>(await admin.query('select public.create_chatgpt_meal_for_integration_v2($1,$2,$3,null,$4,null,null,null,$5,false,$6,$7) r',[owner,patch.date??date,patch.title??'milanesa',patch.calories??600,key,consumedAt,label])).rows[0].r;
  const row=async id=>(await admin.query('select *, updated_at::text v from public.meal_entries where id=$1',[id])).rows[0];
  const timed=(raw)=>{ if(typeof raw!=='string') return true; return JSON.parse(raw).originalTimeKnown!==false; };
  let untimed, timedMeal;
  await check('without a time the registration moment orders the day but is flagged as not reported (#308)',async()=>{
    const r=await legacy('gpt-no-time-1'); assert.equal(r.ok,true); untimed=r.meal.id;
    const m=await row(untimed); assert.equal(m.source_type,'chatgpt'); assert.equal(m.meal_label,null);
    assert.equal(timed(m.raw_input),false); assert.ok(Math.abs(new Date(m.consumed_at).getTime()-Date.now())<60_000);
  });
  await check('an explicit time and type are kept, including just before midnight in Córdoba (#308)',async()=>{
    const r=await v2('gpt-time-1','2026-09-20T23:30:00-03:00','dinner'); timedMeal=r.meal.id;
    const m=await row(timedMeal); assert.equal(m.meal_label,'dinner'); assert.equal(timed(m.raw_input),true);
    assert.equal(new Date(m.consumed_at).toISOString(),'2026-09-21T02:30:00.000Z');
    assert.equal((await admin.query('select log_date::text d from public.day_logs where id=$1',[m.day_log_id])).rows[0].d,date);
  });
  await check('a time on another local day or an unknown type is rejected, nothing is written',async()=>{
    const before=(await admin.query('select count(*)::int n from public.meal_entries')).rows[0].n;
    await assert.rejects(v2('gpt-bad-day','2026-09-21T00:30:00-03:00',null),/invalid_request/);
    await assert.rejects(v2('gpt-bad-label',null,'brunch'),/invalid_request/);
    assert.equal((await admin.query('select count(*)::int n from public.meal_entries')).rows[0].n,before);
  });
  await check('idempotent replay returns the same meal and never rewrites time or type',async()=>{
    const again=await v2('gpt-time-1',null,null); assert.equal(again.idempotent_replay,true); assert.equal(again.meal.id,timedMeal);
    assert.equal((await row(timedMeal)).meal_label,'dinner');
  });
  await check('a ChatGPT meal is edited from the app with CAS, keeps its origin and its unknown time (#307)',async()=>{
    const m=await row(untimed);
    const r=await mutate(a,edit(untimed,m.v,'gpt-edit-1',{title:'yogur griego',calories:180}));
    assert.equal(r.response_status,200,JSON.stringify(r.response_body));
    const after=await row(untimed); assert.equal(after.source_type,'chatgpt'); assert.equal(after.final_calories,180); assert.equal(timed(after.raw_input),false);
    assert.equal((await mutate(a,edit(untimed,m.v,'gpt-edit-stale',{calories:190}))).response_body.error,'MEAL_CHANGED');
  });
  await check('setting a time from the app makes it a confirmed time (#308)',async()=>{
    const m=await row(untimed);
    const r=await mutate(a,edit(untimed,m.v,'gpt-edit-time',{title:'yogur griego',calories:180,mealLabel:'breakfast',consumedAt:'2026-09-20T08:15:00-03:00'}));
    assert.equal(r.response_status,200,JSON.stringify(r.response_body));
    const after=await row(untimed); assert.equal(after.meal_label,'breakfast'); assert.equal(timed(after.raw_input),true);
    assert.equal(new Date(after.consumed_at).toISOString(),'2026-09-20T11:15:00.000Z');
  });
  await check('a ChatGPT meal is deleted from the app with a soft delete and updated totals (#307)',async()=>{
    const m=await row(timedMeal);
    const r=await mutate(a,remove(timedMeal,m.v,'gpt-delete'));
    assert.equal(r.response_status,200,JSON.stringify(r.response_body)); assert.ok((await row(timedMeal)).deleted_at);
    const d=(await admin.query('select total_calories_consumed n from public.day_logs where id=$1',[m.day_log_id])).rows[0];
    assert.equal(d.n,180);
  });
  await check('other origins stay read-only and another user cannot touch the meal',async()=>{
    const r=await legacy('gpt-sheet'); const id=r.meal.id;
    await admin.query("update public.meal_entries set source_type='sheet_import' where id=$1",[id]);
    const m=await row(id);
    assert.equal((await mutate(a,edit(id,m.v,'sheet-edit',{calories:1}))).response_body.error,'MEAL_UNAVAILABLE');
    const mine=await row(untimed);
    const foreign=await mutate(stranger,edit(untimed,mine.v,'foreign-edit',{calories:1}));
    assert.notEqual(foreign.response_status,200); assert.equal((await row(untimed)).final_calories,180);
  });
  await check('manual meals keep working as before',async()=>{
    const c=await mutate(a,create('manual-1',{title:'arroz',calories:300})); assert.equal(c.response_status,201);
    const m=await row(c.response_body.mealId); assert.equal(m.source_type,'manual');
    assert.equal((await mutate(a,edit(m.id,m.v,'manual-edit',{title:'arroz',calories:320}))).response_status,200);
  });
  await check('RPC role grants reject anon/authenticated integration writes while Mobile remains authenticated',async()=>{
    const rows=(await admin.query("select proname,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') authenticated,has_function_privilege('service_role',oid,'EXECUTE') service from pg_proc where proname in ('create_chatgpt_meal_for_integration','create_chatgpt_meal_for_integration_v2','create_chatgpt_meal_for_oauth_v2','mobile_mutate_manual_meal')")).rows;
    for(const r of rows){assert.equal(r.anon,false);assert.equal(r.authenticated,r.proname==='mobile_mutate_manual_meal');if(r.proname!=='mobile_mutate_manual_meal')assert.equal(r.service,true);}
    await assert.rejects(a.query("select public.create_chatgpt_meal_for_integration_v2($1,$2,'denied',null,1,null,null,null,'denied',false,null,null)",[owner,date]),/permission denied/);
  });
  await check('moving an untimed ChatGPT meal keeps provenance/time uncertainty and both day totals consistent',async()=>{
    const r=await legacy('move-unknown',{title:'move unknown',calories:487}), m=await row(r.meal.id);
    const sourceBefore=(await admin.query('select total_calories_consumed n from public.day_logs where id=$1',[m.day_log_id])).rows[0].n;
    const result=await mutate(a,edit(m.id,m.v,'move-unknown-write',{date:destination,title:'move unknown',calories:487}));
    assert.equal(result.response_status,200);
    const moved=await row(m.id);assert.equal(moved.source_type,'chatgpt');assert.equal(timed(moved.raw_input),false);
    assert.equal((await admin.query('select log_date::text d from public.day_logs where id=$1',[moved.day_log_id])).rows[0].d,destination);
    assert.equal((await admin.query('select total_calories_consumed n from public.day_logs where id=$1',[m.day_log_id])).rows[0].n,sourceBefore-487);
    assert.equal((await admin.query('select total_calories_consumed n from public.day_logs where id=$1',[moved.day_log_id])).rows[0].n,487);
    const replay=await mutate(a,edit(m.id,m.v,'move-unknown-write',{date:destination,title:'move unknown',calories:487}));assert.equal(replay.replayed,true);
    assert.equal((await admin.query('select total_calories_consumed n from public.day_logs where id=$1',[moved.day_log_id])).rows[0].n,487);
  });
  await check('simultaneous integration retries with the same key create one meal',async()=>{
    const secondAdmin=await connect();
    const q="select public.create_chatgpt_meal_for_integration_v2($1,$2,'concurrent',null,341,null,null,null,'concurrent-key',true,null,null) r";
    const replies=await Promise.all([admin.query(q,[owner,date]),secondAdmin.query(q,[owner,date])]);
    assert.equal(replies[0].rows[0].r.meal.id,replies[1].rows[0].r.meal.id);
    assert.equal(replies.filter(r=>r.rows[0].r.created).length,1);
    assert.equal((await admin.query("select count(*)::int n from public.meal_entries where user_id=$1 and idempotency_key='concurrent-key'",[owner])).rows[0].n,1);
  });
  await check('midnight and unknown time are distinct; applying EXPAND again leaves prior rows byte-for-byte unchanged',async()=>{
    const midnight=await v2('midnight-known','2026-09-20T00:00:00-03:00','breakfast',{title:'midnight',calories:225});
    assert.equal(timed((await row(midnight.meal.id)).raw_input),true);
    const before=(await admin.query('select jsonb_agg(to_jsonb(m) order by id) value from public.meal_entries m')).rows[0].value;
    await admin.query(await file('20261028084439_chatgpt_meal_parity_expand.sql'));
    assert.deepEqual((await admin.query('select jsonb_agg(to_jsonb(m) order by id) value from public.meal_entries m')).rows[0].value,before);
  });
  // #308 registration time: v3 wrappers over v2, applied on top of the rows above.
  const priorRows=(await admin.query('select jsonb_agg(to_jsonb(m) order by id) value from public.meal_entries m')).rows[0].value;
  await admin.query(await file('20261031210000_chatgpt_meal_registration_time_expand.sql'));
  const today=new Date(Date.now()-3*3600000).toISOString().slice(0,10), yesterday=new Date(Date.now()-27*3600000).toISOString().slice(0,10);
  const v3=async(key,source,patch={})=>(await admin.query('select public.create_chatgpt_meal_for_integration_v3($1,$2,$3,null,$4,null,null,null,$5,false,$6,$7) r',[owner,patch.date??today,patch.title??'tostado',patch.calories??380,key,patch.label??null,source])).rows[0].r;
  const source=raw=>{ if(typeof raw!=='string') return 'explicit'; const p=JSON.parse(raw); return p.originalTimeKnown!==false?'explicit':p.timeSource==='registration'?'registration':'unknown'; };
  await check('EXPAND #308 adds v3 without touching any existing row or v2',async()=>{
    assert.deepEqual((await admin.query('select jsonb_agg(to_jsonb(m) order by id) value from public.meal_entries m')).rows[0].value,priorRows);
    const r=await v2('after-v3-untimed',null,null,{date:today,title:'v2 sigue igual',calories:111}); assert.equal(source((await row(r.meal.id)).raw_input),'unknown');
  });
  let registered;
  await check('a meal eaten now keeps the registration instant as an approximate time, still not a known time (#308)',async()=>{
    const r=await v3('now-1','registration',{label:'lunch'}); assert.equal(r.created,true); registered=r.meal.id;
    const m=await row(registered); assert.equal(source(m.raw_input),'registration'); assert.equal(timed(m.raw_input),false);
    assert.equal(m.meal_label,'lunch'); assert.equal(m.source_type,'chatgpt');
    assert.ok(Math.abs(new Date(m.consumed_at).getTime()-Date.now())<60_000);
  });
  await check('replaying the same key returns the same meal and never re-marks or moves it',async()=>{
    const before=await row(registered), r=await v3('now-1','registration',{label:'lunch'});
    assert.equal(r.created,false); assert.equal(r.idempotent_replay,true); assert.equal(r.meal.id,registered);
    const after=await row(registered); assert.equal(after.raw_input,before.raw_input); assert.equal(after.v,before.v);
    assert.equal((await admin.query("select count(*)::int n from public.meal_entries where idempotency_key='now-1'")).rows[0].n,1);
  });
  await check('registration is refused for another day, an unknown source and a possible duplicate, writing nothing',async()=>{
    const count=async()=>(await admin.query('select count(*)::int n from public.meal_entries')).rows[0].n, n=await count();
    await assert.rejects(v3('now-yesterday','registration',{date:yesterday}),/invalid_request/);
    await assert.rejects(v3('now-bad-source','guess'),/invalid_request/);
    await assert.rejects(v3('now-dup','registration',{label:'lunch'}),/possible_duplicate/);
    assert.equal(await count(),n);
  });
  await check('without a source v3 behaves as v2 (time not reported), and an app correction makes the time explicit',async()=>{
    const r=await v3('v3-unknown',null,{title:'sin hora',calories:222}); assert.equal(source((await row(r.meal.id)).raw_input),'unknown');
    const m=await row(registered);
    const e=await mutate(a,edit(m.id,m.v,'fix-registration',{date:today,title:'tostado',calories:380,consumedAt:`${today}T12:15:00-03:00`},today));
    assert.equal(e.response_status,200); assert.equal(source((await row(registered)).raw_input),'explicit');
  });
  await check('v3 grants: only service_role may call the integration and OAuth wrappers',async()=>{
    const rows=(await admin.query("select proname,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') authenticated,has_function_privilege('service_role',oid,'EXECUTE') service,prosecdef from pg_proc where proname in ('create_chatgpt_meal_for_integration_v3','create_chatgpt_meal_for_oauth_v3')")).rows;
    assert.equal(rows.length,2); for(const r of rows){assert.equal(r.anon,false);assert.equal(r.authenticated,false);assert.equal(r.service,true);assert.equal(r.prosecdef,true);}
    await assert.rejects(a.query("select public.create_chatgpt_meal_for_integration_v3($1,$2,'denied',null,1,null,null,null,'denied-v3',false,null,'registration')",[owner,today]),/permission denied/);
  });
  console.log(`PostgreSQL: ${checks} groups PASS`);
} finally {
  for(const c of clients) await c.end().catch(()=>{});
  if(started) await pg.stop(); await rm(directory,{recursive:true,force:true});
}
