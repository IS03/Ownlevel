// Local disposable Supabase ONLY. Never accepts a connection URL or remote project.
// OWNLEVEL_FEELINGS_LOCAL_WORKDIR=<fresh CLI workdir> node scripts/testing/training-feelings-finish-local.mjs --bootstrap|--expand|--test
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
const local = process.env.OWNLEVEL_FEELINGS_LOCAL_WORKDIR;
if (!local) throw Error('Explicit isolated local workdir required');
const config = readFileSync(join(local,'supabase/config.toml'),'utf8');
const project = config.match(/^project_id\s*=\s*"(ownlevel-receipt-[a-f0-9]{8})"/m)?.[1];
if (!project) throw Error('Refuse a non-disposable project');
const root = resolve(import.meta.dirname,'../..'), migration = '20261104040000_training_feelings_finish_receipt.sql';
const docker = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe') : 'docker';
function run(args, input) {
  const r = spawnSync(docker,args,{input,encoding:'utf8',maxBuffer:16*1024*1024});
  if(r.status !== 0) throw Error(r.stderr || r.stdout); return r.stdout.trim();
}
if (!run(['context','inspect','desktop-linux','--format','{{json .Endpoints.docker.Host}}']).includes('npipe:')) throw Error('Local Windows engine required');
const sql = input => run(['--context','desktop-linux','exec','-i',`supabase_db_${project}`,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],input);
if (process.argv.includes('--bootstrap')) {
  assert.equal(sql("select to_regclass('public.profiles') is null"),'t','Refuse initialized schema');
  const names = readdirSync(join(root,'supabase/migrations')).filter(n=>n.endsWith('.sql') && n < migration).sort();
  for (const name of names) sql(readFileSync(join(root,'supabase/migrations',name),'utf8'));
  writeFileSync(join(local,'baseline-migrations.json'),JSON.stringify(names,null,2));
  console.log(`PASS ${names.length} baseline migrations in fresh local schema`);
} else if (process.argv.includes('--expand')) {
  assert.equal(sql("select to_regprocedure('public.finish_training_feelings_v2(uuid,jsonb)') is null"),'t','Refuse repeat');
  sql(readFileSync(join(root,'supabase/migrations',migration),'utf8'));
  console.log(`PASS additive migration ${migration} on full local schema`);
} else if (process.argv.includes('--test')) {
  const status = JSON.parse(readFileSync(join(local,'status.json'),'utf8').replace(/^\uFEFF/,''));
  const base = status.API_URL;
  if (new URL(base).hostname !== '127.0.0.1') throw Error('Loopback API required');
  let checks = 0;
  const eq = (a,b) => { assert.deepEqual(a,b); checks++; };
  async function http(path, headers, body) {
    const r = await fetch(base+path,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    return { status:r.status, body:await r.json() };
  }
  const admin = { apikey:status.ANON_KEY,Authorization:`Bearer ${status.SERVICE_ROLE_KEY}`,'Content-Type':'application/json' };
  async function user() {
    const email=`receipt-${randomUUID()}@example.invalid`,password=randomBytes(24).toString('hex');
    const made=await http('/auth/v1/admin/users',admin,{email,password,email_confirm:true}); assert.equal(made.status,200);
    const signed=await http('/auth/v1/token?grant_type=password',{apikey:status.ANON_KEY,'Content-Type':'application/json'},{email,password}); assert.equal(signed.status,200);
    return { id:made.body.id,headers:{apikey:status.ANON_KEY,Authorization:`Bearer ${signed.body.access_token}`,'Content-Type':'application/json'} };
  }
  const owner=await user(),other=await user(),sid=randomUUID(),legacy=randomUUID(),crash=randomUUID(),free=randomUUID(),routine=randomUUID(),x1=randomUUID(),x2=randomUUID(),x3=randomUUID();
  for (const id of [owner.id,other.id,sid,legacy,crash,free,routine,x1,x2,x3]) assert.match(id,/^[0-9a-f-]{36}$/);
  sql(`insert into public.profiles(user_id) values('${owner.id}'),('${other.id}') on conflict do nothing;
  insert into public.day_logs(user_id,log_date) values('${owner.id}','2026-11-04');
  insert into public.routines(id,user_id,nombre) values('${routine}','${owner.id}','SYNTHETIC ROUTINE');
  insert into public.exercises(id,user_id,nombre,weight_mode) values('${x1}','${owner.id}','SYNTHETIC ADDED','Peso total'),('${x2}','${owner.id}','SYNTHETIC EXISTING','Peso total'),('${x3}','${owner.id}','SYNTHETIC UNFINISHED','Peso total');
  insert into public.routine_exercises(routine_id,exercise_id,exercise_order) values('${routine}','${x2}',1);
  notify pgrst,'reload schema';`);
  function seedSession(session,withRoutine=true) {
    sql(`insert into public.workout_sessions(id,user_id,day_log_id,routine_id,energy_level,notes)
    select '${session}','${owner.id}',id,${withRoutine ? `'${routine}'::uuid` : 'null'},2,'original notes' from public.day_logs where user_id='${owner.id}';
  insert into public.workout_session_exercises(user_id,workout_session_id,exercise_id,exercise_order,add_to_routine_on_finish)
    select '${owner.id}',s.id,e.id,e.n,true from (values('${session}'::uuid)) s(id)
    cross join (values('${x1}'::uuid,1),('${x2}'::uuid,2),('${x3}'::uuid,3)) e(id,n);
  update public.workout_sets t set actual_reps=8,actual_weight_kg=20,is_completed=true from public.workout_session_exercises x where x.id=t.workout_session_exercise_id and x.user_id='${owner.id}' and x.exercise_id<>'${x3}';
  update public.workout_session_exercises set is_completed=true where user_id='${owner.id}' and exercise_id<>'${x3}';
  `);
  }
  seedSession(sid);
  const read = session => JSON.parse(sql(`select public.read_training_feelings_v1('${session}') from (select set_config('request.jwt.claim.sub','${owner.id}',false)) a`));
  const input = (session,key) => ({contractVersion:'training-feelings/1',operation:'finish',expectedRevision:0,patch:{energyPost:{op:'set',value:4,instrumentVersion:'energy-fatigue/1',declaredMoment:'post',declaredAt:null,capturedAt:'2026-11-04T12:00:00Z',source:'mobile'}},idempotencyKey:key,expectedSessionUpdatedAt:read(session).sessionUpdatedAt,metadata:{}});
  const rpc = (user,session,body,name='finish_training_feelings_v2') => http(`/rest/v1/rpc/${name}`,user.headers,{p_session_id:session,p_input:body});
  const request=input(sid,'lost-original');
  eq((await rpc(other,sid,request)).body.message,'TRAINING_SESSION_NOT_FOUND');
  eq((await rpc({headers:{apikey:status.ANON_KEY,'Content-Type':'application/json'}},sid,request)).status,401);
  const acl=JSON.parse(sql("select json_build_array(has_function_privilege('anon','public.finish_training_feelings_v2(uuid,jsonb)','execute'),has_function_privilege('authenticated','public.finish_training_feelings_v2(uuid,jsonb)','execute'),(select proconfig @> array['search_path=\"\"'] from pg_proc where oid='public.finish_training_feelings_v2(uuid,jsonb)'::regprocedure))"));
  eq(acl,[false,true,true]);
  eq((await rpc(owner,sid,{...request,patch:{energyPost:null}})).body.message,'INVALID_FEELINGS_INPUT');
  // Drop the HTTP response after the commit, then alter current state before recovering.
  await assert.rejects(rpc(owner,sid,request).then(r=>{assert.equal(r.status,200);throw Error('synthetic lost response');}),/synthetic lost response/); checks++;
  const original=JSON.parse(sql(`select response_body from public.mobile_idempotency_keys where user_id='${owner.id}' and operation='training.feelings.finish.v2' and idempotency_key='lost-original'`));
  eq(original.contractVersion,'training-feelings-finish/2'); eq(original.finished.metadata.energyLevel,2); eq(original.finished.metadata.notes,'original notes');
  eq(original.finished.routineAdditions.map(x=>x.outcome),['added','already_in_routine','no_completed_sets']);
  eq(original.feelings.values.energyPost.value,4);
  eq(sql(`select count(*) from public.routine_exercises where routine_id='${routine}' and exercise_id='${x1}'`),'1');
  sql(`delete from public.routine_exercises where routine_id='${routine}' and exercise_id='${x1}'; update public.workout_sessions set notes='later correction',energy_level=5 where id='${sid}';
    update public.workout_session_exercises set nombre_snapshot='LATER NAME',routine_addition_outcome='already_in_routine' where workout_session_id='${sid}';`);
  const replay=await rpc(owner,sid,request); eq(replay.status,200); eq(replay.body[0].replayed,true); eq(replay.body[0].response_body,original);
  eq(sql(`select count(*) from public.routine_exercises where routine_id='${routine}' and exercise_id='${x1}'`),'0');
  eq((await rpc(owner,sid,{...request,metadata:{notes:'different'}})).body.message,'IDEMPOTENCY_KEY_REUSED');
  eq((await rpc(owner,sid,{...request,idempotencyKey:'new-finish'})).body.message,'SESSION_CLOSED');
  const v1=await rpc(owner,sid,request,'mutate_training_feelings_v1'); eq(v1.body[0].response_body,original.feelings); eq(Object.hasOwn(v1.body[0].response_body,'finished'),false);
  seedSession(legacy);
  const old=input(legacy,'old-only'); eq((await rpc(owner,legacy,old,'mutate_training_feelings_v1')).status,200);
  eq((await rpc(owner,legacy,old)).body.message,'FEELINGS_RECEIPT_VERSION_UNAVAILABLE');
  eq(sql(`select count(*) from public.mobile_idempotency_keys where user_id='${owner.id}' and operation='training.feelings.finish.v2' and idempotency_key='old-only'`),'0');
  seedSession(free,false);
  const noRoutine=await rpc(owner,free,input(free,'no-routine')); eq(noRoutine.status,200); eq(noRoutine.body[0].response_body.finished.routineAdditions.map(x=>x.outcome),['routine_unavailable','routine_unavailable','no_completed_sets']);
  sql(`delete from public.routine_exercises where routine_id='${routine}' and exercise_id='${x1}';`);
  seedSession(crash);
  const fail=input(crash,'injected');
  sql(`create function public.test_receipt_failure_383() returns trigger language plpgsql as $$ begin if new.operation='training.feelings.finish.v2' and new.idempotency_key='injected' then raise exception 'SYNTHETIC_RECEIPT_FAILURE'; end if; return new; end; $$;
    create trigger test_receipt_failure_383 before update on public.mobile_idempotency_keys for each row execute function public.test_receipt_failure_383();`);
  eq((await rpc(owner,crash,fail)).body.message,'SYNTHETIC_RECEIPT_FAILURE');
  eq(sql(`select status from public.workout_sessions where id='${crash}'`),'in_progress');
  eq(sql(`select count(*) from public.workout_session_feelings where session_id='${crash}'`),'0');
  eq(sql(`select count(*) from public.mobile_idempotency_keys where user_id='${owner.id}' and idempotency_key='injected'`),'0');
  eq(sql(`select count(*) from public.routine_exercises where routine_id='${routine}' and exercise_id='${x1}'`),'0');
  sql('drop trigger test_receipt_failure_383 on public.mobile_idempotency_keys; drop function public.test_receipt_failure_383();');
  const concurrent=await Promise.all([rpc(owner,crash,fail),rpc(owner,crash,fail)]); eq(concurrent.map(r=>r.body[0].replayed).sort(),[false,true]); eq(concurrent[0].body[0].response_body,concurrent[1].body[0].response_body);
  eq(sql("select bool_and(expires_at='infinity'::timestamptz) from public.mobile_idempotency_keys where operation='training.feelings.finish.v2'"),'t');
  sql(readFileSync(join(root,'supabase/rollbacks/training_feelings_finish_receipt_disable.sql'),'utf8'));
  eq((await rpc(owner,sid,request)).status,403); eq((await rpc(owner,sid,request,'mutate_training_feelings_v1')).status,200);
  sql('grant execute on function public.finish_training_feelings_v2(uuid,jsonb) to authenticated;'); eq((await rpc(owner,sid,request)).body[0].response_body,original);
  const report={result:'PASS',checks,project,postgres:sql('show server_version'),coverage:['real Auth/PostgREST ownership+ACL','original routine outcomes+metadata','response lost after commit','replay after current-state changes','no second finish','v1 unchanged','no v1 receipt upgrade','rollback+concurrent replay','disable preserves data']};
  writeFileSync(join(local,'receipt-report.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
} else throw Error('Choose --bootstrap, --expand or --test');
