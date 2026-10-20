// Disposable PostgreSQL 17: actual Nutrition schema, engine, triggers, ledger
// and Mobile RPC. No production fixtures or credentials.
// OWNLEVEL_TEST_MODULES=/tmp/tooling/node_modules node scripts/testing/nutrition-stages.mjs
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const modules = process.env.OWNLEVEL_TEST_MODULES;
if (!modules) throw new Error('External embedded-postgres test tooling required');
const { default: EmbeddedPostgres } = await import(pathToFileURL(join(modules, 'embedded-postgres/dist/index.js')));
const directory = await mkdtemp(join(tmpdir(), 'ownlevel-stages-'));
const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const pg = new EmbeddedPostgres({ databaseDir: join(directory,'db'), port, user:'postgres', password:'local-test',
  persistent:true, createPostgresUser:false, onLog:()=>{}, onError:()=>{}, postgresFlags:['-h','127.0.0.1'] });
const clients=[]; let started=false; let checks=0;
async function connect() { const c=pg.getPgClient(); clients.push(c); await c.connect(); return c; }
const file = name => readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8');
const id=n=>`41300000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=id(1), other=id(2);
async function role(c,user=owner) { await c.query('set role authenticated'); await c.query("select set_config('request.jwt.claim.sub',$1,false)",[user]); }
async function check(name,run) { await run(); console.log(`PASS ${name}`); checks++; }
async function advisors() {
  const {stdout}=await promisify(execFile)('npx',['--yes','supabase','db','advisors','--db-url',`postgresql://postgres:local-test@127.0.0.1:${port}/postgres?sslmode=disable`,'--type','all','--level','warn','--fail-on','none'],{timeout:45000,maxBuffer:4*1024*1024});
  return JSON.parse(stdout).results;
}
try {
  await pg.initialise(); await pg.start(); started=true;
  const admin=await connect(), a=await connect(), b=await connect(), stranger=await connect();
  await admin.query(`create role anon; create role authenticated; create schema auth; create schema extensions;
    create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  for(const name of ['0001.sql','20260426_0002_phase1_profiles_weight_and_checks.sql','20260426_0004_phase1_remove_meal_status.sql','20260813150000_nutrition_schema_foundation.sql']) await admin.query(await file(name));
  await admin.query('create table public.workout_sessions(id uuid primary key,user_id uuid,day_log_id uuid,status text)');
  for(const name of ['20260813133845_atomic_weight_and_current_day_snapshots.sql','20260813134351_centralize_profile_energy_derivation.sql','20260813163000_nutrition_day_engine.sql','20260813170000_nutrition_energy_sync.sql','20260908170000_nutrition_plan_energy_v2.sql','20260908220654_pr71_1_plan_energy_coherence.sql','20260909180000_daily_nutrition_overrides_v2.sql']) await admin.query(await file(name));
  const normalization=await file('20260426_0012_normalize_names_uppercase.sql');
  await admin.query(normalization.slice(normalization.indexOf('create or replace function'),normalization.indexOf('$$;',normalization.indexOf('create or replace function'))+3));
  await admin.query(await file('20260426_0013_normalize_meals_uppercase.sql'));
  const ledger=await file('20260927190000_mobile_training_api_expand.sql');
  await admin.query(ledger.slice(0,ledger.indexOf('create function public.mobile_create_training_routine'))+'commit;');
  for (const name of ['20260909155017_configurable_daily_metrics.sql','20260914104157_r3_atomic_daily_metric_values.sql','20261003021157_mobile_nutrition_day_read.sql','20261003040926_mobile_activity_context_writes.sql']) await admin.query(await file(name));
  await admin.query('insert into auth.users values($1),($2)',[owner,other]);
  await admin.query('grant select,insert,update,delete on public.day_logs,public.meal_entries to authenticated; grant select,insert,update on public.profiles,public.nutrition_goal_periods,public.expenditure_rule_periods to authenticated');
  await role(a); await role(b); await role(stranger,other);
  const blockers=await file('20260814010000_nutrition_import_blockers.sql');
  await admin.query(blockers.slice(0,blockers.indexOf('-- body_measurements'))+'commit;');
  for(const name of ['20260830171201_saved_meals.sql','20260908223000_food_calories_decimal.sql','20261004010134_mobile_quick_registration.sql']) await admin.query(await file(name));
  await admin.query('grant usage on schema extensions to authenticated; grant select on public.profiles, public.workout_sessions to authenticated');
  const today=(await admin.query("select (statement_timestamp() at time zone 'America/Argentina/Cordoba')::date::text d")).rows[0].d;
  const yesterday=(await admin.query('select ($1::date-1)::text d',[today])).rows[0].d;
  // Pick a future leap-year boundary; these mutation tests must not expire after 2027.
  let leapYear=Number(today.slice(0,4))+2;
  while(leapYear%4!==0||(leapYear%100===0&&leapYear%400!==0))leapYear++;
  const calendar=s=>s.replace(/^202[789]/,year=>String(leapYear-1+Number(year)-2027));
  await admin.query(await file('20261004175844_mobile_nutrition_configuration.sql'));

  const baselineAdvisors=process.env.OWNLEVEL_TEST_ADVISORS==='1'?await advisors():null;
  await admin.query(await file('20261016121039_nutrition_plan_stages_expand.sql'));
  // Every v1 check below runs on top of the training-extra EXPAND: the original shape must not move.
  await admin.query(await file('20261020013939_nutrition_training_protein_expand.sql'));
  const snapshot=async(c=a)=>(await c.query('select public.mobile_read_nutrition_stages() d')).rows[0].d;
  const mutate=async(i,c=a)=>(await c.query('select * from public.mobile_mutate_nutrition_stages($1)',[JSON.stringify(i)])).rows[0];
  let key=0;
  const intent=async(operation,fields={},c=a)=>({operation,date:today,expectedListVersion:(await snapshot(c)).listVersion,idempotencyKey:`stage-${++key}`,...fields});
  const stage=(name='Plan',calories=2000,kind='custom')=>({name,kind,baseWaterL:0,trainingCalorieDeltaKcal:0,trainingWaterDeltaL:0,
    weekdays:Array.from({length:7},(_,i)=>({weekday:i+1,calorieTargetKcal:calories,proteinTargetG:0}))});
  const scheduled=(name,calories,kind,unit='months',value=1)=>({...stage(name,calories,kind),duration:{unit,value}});
  const scheduleFields={name:'Volumen y definición',after_end:'maintenance',start_date:calendar('2027-12-31'),
    stages:[scheduled('Volumen',2200,'surplus'),scheduled('Déficit',1800,'deficit'),scheduled('Mantenimiento',2400,'maintenance')],maintenanceStage:stage('Mantenimiento final',2300,'maintenance')};
  let history, scheduledIntent, scheduledReceipt, seq, futureIds;
  const rawDay=async date=>(await admin.query('select to_jsonb(d) d from public.day_logs d where user_id=$1 and log_date=$2',[owner,date])).rows[0]?.d;

  await check('empty is not unavailable; no inferred energy target',async()=>{
    assert.deepEqual(await snapshot(),{today,listVersion:0,current:null,upcoming:[],past:[],sequences:[],suggestions:null});
  });
  await check('legacy save stays untyped; today refreshes, yesterday retains its exact snapshots and FK',async()=>{
    await admin.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
    const s=stage('Antes',1900);
    await admin.query('select ownlevel_private.put_nutrition_stage($1::date,$2,null,null,null)',[yesterday,JSON.stringify(s)]);
    await a.query('select public.get_or_create_day_log($1)',[yesterday]); history=await rawDay(yesterday);
    await a.query('select public.get_or_create_day_log($1)',[today]);
    const weekdays=s.weekdays.map(w=>({weekday:w.weekday,calorie_target_kcal:w.calorieTargetKcal,protein_target_g:w.proteinTargetG}));
    await a.query('select public.save_nutrition_plan_v2($1,0,0,0,$2)', ['Plan Web',JSON.stringify(weekdays)]);
    const list=await snapshot();assert.equal(list.current.kind,null);assert.equal(list.current.name,'Plan Web');
    assert.equal(list.current.weekdays.length,7); assert.equal(list.current.baseWaterL,0);
    assert.equal((await rawDay(today)).nutrition_plan_period_id,list.current.id);
    assert.deepEqual(await rawDay(yesterday),history);
  });
  await check('three calendar months chain through a new year and leap February; terminal maintenance is a real period',async()=>{
    scheduledIntent=await intent('schedule_sequence',scheduleFields);scheduledReceipt=await mutate(scheduledIntent);
    assert.equal(scheduledReceipt.response_status,200);
    const list=scheduledReceipt.response_body.list;seq=list.sequences[0].id;futureIds=list.upcoming.map(s=>s.id);
    assert.deepEqual(list.upcoming.map(s=>s.startsOn),[calendar('2027-12-31'),calendar('2028-01-31'),calendar('2028-02-29'),calendar('2028-03-29')]);
    assert.deepEqual(list.upcoming.map(s=>s.endsOn),[calendar('2028-01-31'),calendar('2028-02-29'),calendar('2028-03-29'),null]);
    assert.equal(list.upcoming[3].kind,'maintenance');assert.equal(list.upcoming[3].duration,null);
    assert.equal(list.upcoming[3].weekdays[0].calorieTargetKcal,2300);
    assert.equal((await admin.query("select ownlevel_private.stage_next_date('2027-01-31','{\"unit\":\"months\",\"value\":1}')::text d")).rows[0].d,'2027-02-28');
    assert.equal((await admin.query("select ownlevel_private.stage_next_date('2027-12-25','{\"unit\":\"weeks\",\"value\":2}')::text d")).rows[0].d,'2028-01-08');
  });
  await check('the unmodified day engine automatically selects each scheduled start date',async()=>{
    for(const [date,calories] of [[calendar('2027-12-30'),1900],[calendar('2027-12-31'),2200],[calendar('2028-01-31'),1800],[calendar('2028-02-29'),2400],[calendar('2028-03-29'),2300]]){
      const context=(await a.query('select * from public.resolve_nutrition_context($1)',[date])).rows[0];
      assert.equal(context.nutrition_target_kcal,calories);
    }
    assert.deepEqual(await rawDay(yesterday),history);
  });
  await check('overlap rejects the entire sequence, without a partial plan or list version change',async()=>{
    const before=await snapshot(); const result=await mutate(await intent('schedule_sequence',scheduleFields));
    assert.equal(result.response_status,400);assert.match(result.response_body.message,/programadas/);
    assert.deepEqual(await snapshot(),before);
  });
  await check('future edits preserve ids and reflow only the unstarted sequence tail',async()=>{
    const i=await intent('update_future',{stageId:futureIds[0],stage:stage('Volumen ajustado',2250,'surplus'),startsOn:calendar('2027-12-31'),duration:{unit:'months',value:2}});
    const r=await mutate(i); assert.equal(r.response_status,200);
    assert.deepEqual(r.response_body.list.upcoming.map(s=>s.id),futureIds);
    assert.deepEqual(r.response_body.list.upcoming.map(s=>s.startsOn),[calendar('2027-12-31'),calendar('2028-02-29'),calendar('2028-03-29'),calendar('2028-04-29')]);
    assert.equal(r.response_body.list.upcoming[0].name,'Volumen ajustado');assert.deepEqual(await rawDay(yesterday),history);
    const later=await mutate(await intent('schedule_sequence',{name:'Más adelante',after_end:'keep_last',start_date:calendar('2029-01-01'),stages:[scheduled('Después',2100,'custom','weeks',4)],maintenanceStage:null}));
    assert.equal(later.response_status,200);const laterStage=later.response_body.list.upcoming.at(-1);
    const edit=await mutate(await intent('update_future',{stageId:futureIds[0],stage:stage('Volumen ajustado',2260,'surplus'),startsOn:calendar('2027-12-31'),duration:{unit:'months',value:2}}));
    assert.equal(edit.response_status,200);assert.equal(edit.response_body.list.upcoming.at(-1).id,laterStage.id);
    const overlap=await mutate(await intent('update_future',{stageId:futureIds[0],stage:stage('Volumen ajustado',2260,'surplus'),startsOn:calendar('2027-12-31'),duration:{unit:'months',value:24}}));
    assert.equal(overlap.response_status,400);assert.deepEqual(await snapshot(),edit.response_body.list);
    assert.equal((await mutate(await intent('cancel_sequence',{sequenceId:laterStage.sequenceId}))).response_status,200);
  });
  await check('deleting the middle fails clearly; the last future stage can be deleted',async()=>{
    const before=await snapshot();const mid=await mutate(await intent('delete_future',{stageId:futureIds[1]}));
    assert.equal(mid.response_status,400);assert.match(mid.response_body.message,/última|cortá/);assert.deepEqual(await snapshot(),before);
    assert.equal((await mutate(await intent('delete_future',{stageId:futureIds[3]}))).response_status,200);
    assert.equal((await snapshot()).upcoming.length,3);
  });
  await check('CAS conflicts return actual server truth; receipt replay survives later edits without duplication',async()=>{
    const before=await snapshot();const replay=await mutate(scheduledIntent);assert.equal(replay.replayed,true);assert.deepEqual(replay.response_body,scheduledReceipt.response_body);
    assert.deepEqual(await snapshot(),before);
    const stale=await mutate({...await intent('replace_from_today',{stage:stage(),future_stages:'keep'}),expectedListVersion:scheduledIntent.expectedListVersion});
    assert.equal(stale.response_status,409);assert.equal(stale.response_body.error,'STAGES_CHANGED');assert.deepEqual(stale.response_body.list,before);
    const reused=await mutate({...scheduledIntent,name:'Otro nombre'});assert.equal(reused.response_body.error,'IDEMPOTENCY_KEY_REUSED');assert.deepEqual(reused.response_body.list,before);
    const oldDay=await mutate({...await intent('replace_from_today',{stage:stage(),future_stages:'keep'}),date:yesterday});assert.equal(oldDay.response_body.error,'STAGES_DAY_CHANGED');
  });
  await check('replace today explicitly keeps or cancels future stages and preserves today id/history',async()=>{
    const before=await snapshot();const currentId=before.current.id;
    const keep=await mutate(await intent('replace_from_today',{stage:stage('Desde hoy',2100,'deficit'),future_stages:'keep'}));
    assert.equal(keep.response_status,200);assert.equal(keep.response_body.list.current.id,currentId);assert.equal(keep.response_body.list.upcoming.length,3);
    assert.equal((await rawDay(today)).nutrition_target_kcal_snapshot,2100);
    assert.equal((await mutate(await intent('replace_from_today',{stage:stage('Sin programación',2050),future_stages:'cancel'}))).response_body.list.upcoming.length,0);
    assert.deepEqual(await rawDay(yesterday),history);
  });
  await check('a sequence may start today; cancellation removes only its future, never the current stage',async()=>{
    const r=await mutate(await intent('schedule_sequence',{...scheduleFields,start_date:today}));assert.equal(r.response_status,200);
    const current=r.response_body.list.current;assert.equal(current.kind,'surplus');assert.equal(current.startsOn,today);
    assert.equal((await rawDay(today)).nutrition_plan_period_id,current.id);
    assert.equal((await mutate(await intent('delete_future',{stageId:current.id}))).response_status,400);
    assert.equal((await mutate(await intent('update_future',{stageId:current.id,stage:stage(),startsOn:today,duration:current.duration}))).response_status,400);
    assert.equal((await mutate(await intent('delete_future',{stageId:history.nutrition_plan_period_id}))).response_status,400);
    assert.equal((await mutate(await intent('update_future',{stageId:history.nutrition_plan_period_id,stage:stage(),startsOn:calendar('2027-01-01'),duration:null}))).response_status,400);
    const cancelled=await mutate(await intent('cancel_sequence',{sequenceId:current.sequenceId}));
    assert.equal(cancelled.response_status,200);assert.equal(cancelled.response_body.list.current.id,current.id);assert.equal(cancelled.response_body.list.upcoming.length,0);
    assert.deepEqual(await rawDay(yesterday),history);
  });
  await check('legacy Web and current Mobile operation plan clear only new metadata and keep their original save semantics',async()=>{
    const currentId=(await snapshot()).current.id;
    const s=stage('Web de nuevo',2150);const weekdays=s.weekdays.map(w=>({weekday:w.weekday,calorie_target_kcal:w.calorieTargetKcal,protein_target_g:w.proteinTargetG}));
    await a.query('select public.save_nutrition_plan_v2($1,0,0,0,$2)',[s.name,JSON.stringify(weekdays)]);
    const current=(await snapshot()).current;assert.equal(current.id,currentId);assert.equal(current.kind,null);assert.equal(current.sequenceId,null);assert.equal(current.duration,null);
    const source=(await a.query("select public.mobile_configuration_state('plan') d")).rows[0].d;
    const fields=stage('Mobile actual',2200);delete fields.kind;
    const r=(await a.query('select * from public.mobile_mutate_nutrition_configuration($1)',[JSON.stringify({operation:'plan',date:today,expectedVersion:source.version,idempotencyKey:'old-mobile',fields})])).rows[0];
    assert.equal(r.response_status,200);assert.equal((await snapshot()).current.kind,null);assert.equal((await snapshot()).current.name,'Mobile actual');
    assert.deepEqual(await rawDay(yesterday),history);
  });
  await check('RLS, composite owner FK and RPC ownership isolate both users; private helpers cannot be called',async()=>{
    const list=await snapshot();const otherList=await snapshot(stranger);assert.equal(otherList.current,null);assert.deepEqual(otherList.sequences,[]);
    assert.equal((await stranger.query('select count(*)::int n from public.nutrition_plan_sequences')).rows[0].n,0);
    assert.equal((await stranger.query('select count(*)::int n from public.nutrition_plan_periods')).rows[0].n,0);
    const result=await mutate(await intent('delete_future',{stageId:list.current.id},stranger),stranger);assert.equal(result.response_status,400);
    await assert.rejects(stranger.query('select ownlevel_private.put_nutrition_stage($1,$2,null,null,null)',[today,JSON.stringify(stage())]),e=>e.code==='42501');
    await assert.rejects(stranger.query('insert into public.nutrition_plan_sequences(user_id,name,after_end) values($1,$2,$3)',[other,'Ajena','keep_last']),e=>e.code==='42501');
    await assert.rejects(stranger.query("insert into public.nutrition_plan_periods(user_id,effective_from,name,base_water_l,sequence_id,sequence_position) values($1,'2028-01-01','Ajena',0,$2,1)",[other,seq]),e=>e.code==='23503');
    assert.equal((await a.query('select count(*)::int n from public.nutrition_plan_periods where user_id=$1',[other])).rows[0].n,0);
    await admin.query('reset role; set role anon');await assert.rejects(admin.query('select public.mobile_read_nutrition_stages()'),e=>e.code==='42501');await admin.query('reset role');
    assert.equal((await snapshot()).current.id,list.current.id);
    const temporaryOwner=id(3);await admin.query('insert into auth.users values($1)',[temporaryOwner]);
    await admin.query("select set_config('request.jwt.claim.sub',$1,false)",[temporaryOwner]);
    const fresh={operation:'schedule_sequence',date:today,expectedListVersion:0,idempotencyKey:'temporary-owner',...scheduleFields,start_date:today};
    assert.equal((await mutate(fresh,admin)).response_status,200);
    await admin.query('delete from auth.users where id=$1',[temporaryOwner]);
    assert.equal((await admin.query('select count(*)::int n from ownlevel_private.nutrition_stage_lists where user_id=$1',[temporaryOwner])).rows[0].n,0);
    await admin.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  });
  await check('two devices using the same list version serialize into confirmed + conflict',async()=>{
    const i=await intent('replace_from_today',{stage:stage('Dispositivo A'),future_stages:'keep'});
    const j={...i,idempotencyKey:'device-b',stage:stage('Dispositivo B')};
    const results=await Promise.all([mutate(i,a),mutate(j,b)]);
    assert.deepEqual(results.map(r=>r.response_status).sort(),[200,409]);
    assert.deepEqual(results.find(r=>r.response_status===409).response_body.list,await snapshot());
  });
  await check('a concurrent legacy weekday write invalidates the list after the advisory lock wait',async()=>{
    const i=await intent('replace_from_today',{stage:stage(),future_stages:'keep'});const pid=(await snapshot()).current.id;
    await b.query('begin');await b.query('update public.nutrition_plan_weekdays set calorie_target_kcal=2300 where plan_id=$1 and weekday=1',[pid]);
    const pending=mutate(i);await new Promise(r=>setTimeout(r,40));await b.query('commit');
    const result=await pending;assert.equal(result.response_status,409);assert.deepEqual(result.response_body.list,await snapshot());
  });
  await check('unknown failure while refreshing today rolls back period, version AND receipt; same key can recover',async()=>{
    const before=await snapshot();const i=await intent('replace_from_today',{stage:stage('Falla'),future_stages:'keep'});
    await admin.query("create function public.stage_test_failure() returns trigger language plpgsql as $$ begin raise exception 'test failure'; end $$; create trigger stage_test_failure before update on public.day_logs for each row execute function public.stage_test_failure()");
    await assert.rejects(mutate(i));assert.deepEqual(await snapshot(),before);
    assert.equal((await admin.query('select count(*)::int n from public.mobile_idempotency_keys where user_id=$1 and idempotency_key=$2',[owner,i.idempotencyKey])).rows[0].n,0);
    await admin.query('drop trigger stage_test_failure on public.day_logs; drop function public.stage_test_failure()');
    assert.equal((await mutate(i)).response_status,200);
  });
  await check('suggestions use computed expenditure (maintenance, -10%, +5%) and never save a target',async()=>{
    const before=(await snapshot()).current;
    await a.query("insert into public.profiles(user_id,birth_date,sex,height_cm,current_weight_kg) values($1,'1990-01-01','male',180,80) on conflict(user_id) do update set birth_date=excluded.birth_date,sex=excluded.sex,height_cm=excluded.height_cm,current_weight_kg=excluded.current_weight_kg",[owner]);
    await a.query("select public.save_energy_config_v2('moderate',0,'custom',2300)");
    assert.deepEqual((await snapshot()).suggestions,{expenditureKcal:2300,maintenance:2300,deficit:2070,surplus:2415,recomposition:null,custom:null});
    assert.deepEqual((await snapshot()).current,before);assert.deepEqual(await rawDay(yesterday),history);
  });
  await check('keep_last adds no terminal row; persisted future references prevent edits/deletes/cancellation',async()=>{
    const r=await mutate(await intent('schedule_sequence',{...scheduleFields,start_date:calendar('2028-01-01'),after_end:'keep_last',maintenanceStage:null}));
    assert.equal(r.response_status,200);assert.equal(r.response_body.list.upcoming.length,3);
    const future=r.response_body.list.upcoming[0];
    await a.query('select public.get_or_create_day_log($1)',[future.startsOn]);
    const day=await rawDay(future.startsOn);assert.equal(day.nutrition_plan_period_id,future.id);
    const updated=await mutate(await intent('update_future',{stageId:future.id,stage:stage(),startsOn:future.startsOn,duration:future.duration}));
    assert.equal(updated.response_status,400);
    const cancelled=await mutate(await intent('cancel_sequence',{sequenceId:future.sequenceId}));assert.equal(cancelled.response_status,400);
    assert.equal((await snapshot()).upcoming.length,3);assert.deepEqual(await rawDay(future.startsOn),day);
  });
  await check('bounded past returns the latest 24 in a stable order, with correct exclusive ends',async()=>{
    for(let n=35;n>=1;n--){const date=(await admin.query('select ($1::date-$2::int)::text d',[yesterday,n*7])).rows[0].d;
      await admin.query('select ownlevel_private.put_nutrition_stage($1::date,$2,null,null,null)',[date,JSON.stringify(stage(`Antes ${n}`))]);}
    const list=await snapshot();assert.equal(list.past.length,24);
    assert.equal(list.past[0].startsOn,yesterday);assert.equal(list.past[0].endsOn,today);
    for(let n=1;n<list.past.length;n++)assert.equal(list.past[n].endsOn,list.past[n-1].startsOn);
    assert.deepEqual(await rawDay(yesterday),history);
  });
  await check('advisory/security checks: public functions are invokers, private tables inaccessible, definers pin search_path',async()=>{
    assert.equal((await admin.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('mobile_read_nutrition_stages','mobile_mutate_nutrition_stages','save_nutrition_plan_v2') and p.prosecdef")).rows[0].n,0);
    assert.equal((await admin.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ownlevel_private' and p.prosecdef and not coalesce(p.proconfig @> array['search_path=\"\"'],false)")).rows[0].n,0);
    await assert.rejects(stranger.query('select * from ownlevel_private.nutrition_stage_lists'),e=>e.code==='42501');
  });
  const snapshot2=async(c=a)=>(await c.query('select public.mobile_read_nutrition_stages_v2() d')).rows[0].d;
  const mutate2=async(i,c=a)=>(await c.query('select * from public.mobile_mutate_nutrition_stages_v2($1)',[JSON.stringify(i)])).rows[0];
  const stage2=(name='Sin agua',calories=2000,protein=130,extra=25)=>({...stage(name,calories,'maintenance'),baseWaterL:null,trainingProteinDeltaG:extra,
    weekdays:Array.from({length:7},(_,i)=>({weekday:i+1,calorieTargetKcal:calories,proteinTargetG:protein}))});
  const context=async date=>(await a.query('select nutrition_target_kcal,protein_target_g::float8 p,water_target_l::float8 w from public.resolve_nutrition_context($1)',[date])).rows[0];
  await check('v2 is opt-in: v1 keeps its exact keys; v2 adds only the protein extra',async()=>{
    const v1=await snapshot(),v2=await snapshot2();
    assert.equal('trainingProteinDeltaG' in v1.current,false);assert.equal(v2.current.trainingProteinDeltaG,0);
    const rest={...v2.current};delete rest.trainingProteinDeltaG;assert.deepEqual(rest,v1.current);
  });
  await check('training raises the goals the plan has (calories and protein); without its own water the Agua metric keeps the goal',async()=>{
    await admin.query("insert into public.user_metrics(user_id,system_key,name,unit,value_type,target_value) values($1,'water','Agua','L','decimal',2.5)",[owner]);
    const r=await mutate2(await intent('replace_from_today',{stage:{...stage2(),trainingCalorieDeltaKcal:300},future_stages:'keep'}));
    assert.equal(r.response_status,200);
    assert.equal(r.response_body.list.current.baseWaterL,null);assert.equal(r.response_body.list.current.trainingProteinDeltaG,25);
    assert.equal((await snapshot()).current.baseWaterL,null); // v1 readers see the missing water as missing, never as 0
    assert.deepEqual(await context(today),{nutrition_target_kcal:2000,p:130,w:2.5});
    const dayId=(await rawDay(today)).id;
    await admin.query("insert into public.workout_sessions values($1,$2,$3,'completed')",[id(90),owner,dayId]);
    assert.deepEqual(await context(today),{nutrition_target_kcal:2300,p:155,w:2.5});
    await a.query('select public.refresh_nutrition_day($1)',[dayId]);
    const day=await rawDay(today);assert.equal(Number(day.protein_target_g_snapshot),155);assert.equal(Number(day.water_target_l_snapshot),2.5);
    await admin.query("update public.user_metrics set target_value=60 where user_id=$1 and system_key='water'",[owner]);
    assert.equal((await context(today)).w,null); // out of the snapshot's range: no goal, never a clipped one
    await admin.query("update public.user_metrics set target_value=2.5 where user_id=$1 and system_key='water'",[owner]);
    await admin.query('delete from public.workout_sessions where id=$1',[id(90)]);
    assert.deepEqual(await rawDay(yesterday),history);
  });
  await check('a v1 save keeps the stored protein extra; only a v2 edit changes it',async()=>{
    const v1=await mutate(await intent('replace_from_today',{stage:stage('Guardado v1',2100),future_stages:'keep'}));
    assert.equal(v1.response_status,200);assert.equal('trainingProteinDeltaG' in v1.response_body.list.current,false);
    assert.equal((await snapshot2()).current.trainingProteinDeltaG,25);assert.equal((await snapshot2()).current.baseWaterL,0);
    const r=await mutate2(await intent('schedule_sequence',{name:'Proteína',after_end:'keep_last',start_date:calendar('2029-06-01'),
      stages:[{...stage2('Con extra',2200,140,30),duration:{unit:'weeks',value:4}}],maintenanceStage:null}));
    assert.equal(r.response_status,200);const future=r.response_body.list.upcoming.at(-1);assert.equal(future.trainingProteinDeltaG,30);
    const kept=await mutate(await intent('update_future',{stageId:future.id,stage:stage('Editado en v1',2250,'custom'),startsOn:future.startsOn,duration:future.duration}));
    assert.equal(kept.response_status,200);assert.equal((await snapshot2()).upcoming.at(-1).trainingProteinDeltaG,30);
    const edited=await mutate2(await intent('update_future',{stageId:future.id,stage:{...stage2('Editado en v2',2250,140,10),kind:'custom'},startsOn:future.startsOn,duration:future.duration}));
    assert.equal(edited.response_status,200);assert.equal(edited.response_body.list.upcoming.at(-1).trainingProteinDeltaG,10);
    assert.equal((await mutate(await intent('cancel_sequence',{sequenceId:future.sequenceId}))).response_status,200);
  });
  await check('mixed shapes and inconsistent water are rejected before any write; ledgers never cross',async()=>{
    const before=await snapshot2();
    await assert.rejects(mutate2(await intent('replace_from_today',{stage:stage(),future_stages:'keep'})),e=>e.code==='22023');
    await assert.rejects(mutate(await intent('replace_from_today',{stage:stage2(),future_stages:'keep'})),e=>e.code==='22023');
    await assert.rejects(mutate2(await intent('replace_from_today',{stage:{...stage2(),trainingWaterDeltaL:0.5},future_stages:'keep'})),e=>e.code==='22023');
    await assert.rejects(mutate2(await intent('replace_from_today',{stage:stage2('Mucho',2000,130,1000.5),future_stages:'keep'})),e=>e.code==='22023');
    assert.deepEqual(await snapshot2(),before);
    const i=await intent('replace_from_today',{stage:stage2('Misma clave'),future_stages:'keep'});
    assert.equal((await mutate2(i)).response_status,200);
    const v1=await mutate({...i,stage:stage('Misma clave'),expectedListVersion:(await snapshot()).listVersion});
    assert.equal(v1.replayed,false);assert.equal(v1.response_status,200);
    assert.equal((await admin.query("select count(*)::int n from public.mobile_idempotency_keys where user_id=$1 and idempotency_key=$2",[owner,i.idempotencyKey])).rows[0].n,2);
    await admin.query('reset role; set role anon');await assert.rejects(admin.query('select public.mobile_read_nutrition_stages_v2()'),e=>e.code==='42501');await admin.query('reset role');
    assert.equal((await admin.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('mobile_read_nutrition_stages_v2','mobile_mutate_nutrition_stages_v2') and p.prosecdef")).rows[0].n,0);
    assert.deepEqual(await rawDay(yesterday),history);
  });
  console.log(`STAGES_SNAPSHOT ${JSON.stringify(await snapshot())}`);
  console.log(`STAGES_SNAPSHOT_V2 ${JSON.stringify(await snapshot2())}`);
  console.log(`${checks} Postgres integration groups passed`);
  if(process.env.OWNLEVEL_TEST_ADVISORS==='1') {
    const findings=await advisors();
    const existing=new Set(baselineAdvisors.map(f=>f.cacheKey));
    const added=findings.filter(f=>!existing.has(f.cacheKey));
    assert.deepEqual(added,[]);
    console.log(`LOCAL_ADVISORS: 0 new findings; ${baselineAdvisors.length} baseline fixture findings`);
  }
} finally {
  await Promise.allSettled(clients.map(c=>c.end()));
  if(started) await pg.stop();
  await rm(directory,{recursive:true,force:true});
}
