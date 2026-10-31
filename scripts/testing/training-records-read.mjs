// Disposable PostgreSQL only; no remote DB option or production credentials.
// OWNLEVEL_TEST_MODULES=/path/to/tooling/node_modules node scripts/testing/training-records-read.mjs
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { spawnSync } from 'node:child_process';
const root = new URL('../../', import.meta.url);
const modules = process.env.OWNLEVEL_TEST_MODULES;
if (!modules) throw Error('Set OWNLEVEL_TEST_MODULES to external embedded-postgres tooling.');
const { default: EmbeddedPostgres } = await import(pathToFileURL(join(modules, 'embedded-postgres/dist/index.js')));
const dir = await mkdtemp(join(tmpdir(), 'ownlevel-records-'));
const listener = createServer(); await new Promise(r => listener.listen(0, '127.0.0.1', r));
const port = listener.address().port; await new Promise(r => listener.close(r));
const pg = new EmbeddedPostgres({ databaseDir: join(dir, 'db'), port, user: 'postgres', password: 'local-test',
  persistent: true, createPostgresUser: false, onLog: () => {}, onError: () => {}, postgresFlags: ['-h', '127.0.0.1'] });
const clients = []; let started = false;
const owner = '93530000-0000-4000-8000-000000000001', other = '93530000-0000-4000-8000-000000000002';
const read = path => readFile(new URL(path, root), 'utf8');
async function connect() { const c = pg.getPgClient(); clients.push(c); await c.connect(); return c; }
try {
  await pg.initialise(); await pg.start(); started = true;
  const admin = await connect(), user = await connect();
  await admin.query(await read('supabase/tests/m3_3b_bootstrap.sql'));
  // Reproduce Supabase's default function grants, rather than assuming GRANT text is the effective ACL.
  await admin.query(`create role service_role; alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
  await admin.query(await read('supabase/migrations/20261030235611_training_records_read_expand.sql'));
  const acl = (await admin.query(`select prosecdef,provolatile,proconfig,
    has_function_privilege('public',oid,'execute') public,has_function_privilege('anon',oid,'execute') anon,
    has_function_privilege('authenticated',oid,'execute') authenticated,has_function_privilege('service_role',oid,'execute') service
    from pg_proc where oid='public.mobile_read_training_records(date)'::regprocedure`)).rows[0];
  assert.equal(acl.prosecdef,false); assert.equal(acl.provolatile,'s'); assert.ok(acl.proconfig.includes('search_path=""'));
  assert.equal(acl.public,false); assert.equal(acl.anon,false); assert.equal(acl.authenticated,true); assert.equal(acl.service,true);
  await user.query('set role anon');
  await assert.rejects(user.query("select public.mobile_read_training_records('2026-09-02')"),e=>e.code==='42501');
  await user.query('set role authenticated');
  await assert.rejects(user.query("select public.mobile_read_training_records('2026-09-02')"),e=>e.code==='PT401');
  await user.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  await assert.rejects(user.query('select public.mobile_read_training_records(null)'),e=>e.code==='22023');
  await assert.rejects(user.query("select public.mobile_read_training_records('infinity')"),e=>e.code==='22023');
  console.log('PASS effective ACL, invoker, unauthenticated/anonymous rejection, invalid dates');
  await admin.query('insert into auth.users(id) values($1),($2)',[owner,other]);
  // Three years; >1,000 sessions, >6,000 exercises, >19,000 sets for EACH account.
  await admin.query(`insert into public.day_logs(user_id,log_date)
    select u.id,date '2026-10-31'-i from auth.users u cross join generate_series(0,1099) i;
    insert into public.exercises(user_id,nombre) select id,'Fixture '||n from auth.users cross join generate_series(1,6) n;
    insert into public.workout_sessions(user_id,day_log_id,status,started_at,ended_at,session_name)
    select user_id,id,case when extract(day from log_date)=13 then 'discarded' else 'completed' end,
      log_date+time '12:00',case when extract(day from log_date)=17 then null else log_date+time '13:00' end,'Fixture'
    from public.day_logs;
    insert into public.workout_session_exercises(user_id,workout_session_id,exercise_id,exercise_order,nombre_snapshot,weight_mode_snapshot,is_completed)
    select s.user_id,s.id,e.id,right(e.nombre,1)::int,e.nombre,
      (array['Total con barra','Por mancuerna','Lingotes (no kg)','Peso corporal','Tiempo (segundos)','Carga manual'])[right(e.nombre,1)::int],
      extract(day from d.log_date)<>19 from public.workout_sessions s join public.day_logs d on d.id=s.day_log_id
      join public.exercises e on e.user_id=s.user_id;
    insert into public.workout_sets(user_id,workout_session_exercise_id,set_number,actual_reps,actual_weight_kg,is_completed)
    select x.user_id,x.id,n,case when n=3 then 0 else 8+extract(month from d.log_date)::int end,
      case when n=3 then null when x.weight_mode_snapshot='Peso corporal' then 0
        when x.weight_mode_snapshot='Tiempo (segundos)' then null
        when d.log_date=date '2026-10-31' then 200 else 10+extract(month from d.log_date) end,
      extract(day from d.log_date)<>23
    from public.workout_session_exercises x join public.workout_sessions s on s.id=x.workout_session_id
    join public.day_logs d on d.id=s.day_log_id cross join generate_series(1,3) n;
    update public.workout_sets set actual_weight_kg='NaN',actual_reps=8 where set_number=3;
    update public.workout_session_exercises x set weight_mode_snapshot=' total  CON BARRA '
      from public.workout_sessions s join public.day_logs d on d.id=s.day_log_id
      where x.workout_session_id=s.id and x.weight_mode_snapshot='Total con barra' and d.log_date<'2025-01-01';`);
  const fullRead = async () => (await user.query(`select json_build_object(
    'sessions',(select json_agg(to_jsonb(s)||jsonb_build_object('day',jsonb_build_object('log_date',d.log_date)) order by s.id)
      from public.workout_sessions s join public.day_logs d on d.id=s.day_log_id where s.status='completed'),
    'exercises',(select json_agg(x order by x.id) from public.workout_session_exercises x),
    'sets',(select json_agg(t order by t.id) from public.workout_sets t where t.is_completed),'history','[]'::json) data`)).rows[0].data;
  const snapshot = async () => (await admin.query(`select md5(string_agg(row_to_json(t)::text,'' order by t.id)) hash
    from (select id,to_jsonb(s) row from public.workout_sessions s union all select id,to_jsonb(x) from public.workout_session_exercises x
    union all select id,to_jsonb(t) from public.workout_sets t) t`)).rows[0].hash;
  const before = await snapshot(), full = await fullRead();
  const cases=[];
  for (const days of [7,30,90,365]) {
    const date = offset => new Date(Date.UTC(2026,9,31-offset)).toISOString().slice(0,10);
    const from=date(2*days-1), data=(await user.query('select public.mobile_read_training_records($1::date) data',[from])).rows[0].data;
    assert.ok(data.history.length>0); assert.ok(data.sets.length<full.sets.length);
    assert.ok(data.sessions.every(s=>s.day.log_date>=from));
    cases.push({days,from,data});
  }
  await user.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
  const foreign=(await user.query("select public.mobile_read_training_records('2026-09-02') data")).rows[0].data;
  const ownSessions=new Set(full.sessions.map(s=>s.id)), ownExercises=new Set(full.exercises.map(x=>x.id));
  assert.ok(foreign.sessions.every(s=>!ownSessions.has(s.id)));
  assert.ok(foreign.exercises.every(x=>!ownExercises.has(x.id)));
  assert.ok(foreign.history.every(h=>!full.exercises.some(x=>x.exercise_id===h.exercise_id)));
  // Mirror the additional restrictive policy installed for OAuth clients in production.
  await admin.query(`create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;`);
  for(const table of ['day_logs','workout_sessions','workout_session_exercises','workout_sets']) {
    await admin.query(`create policy oauth_restriction on public.${table} as restrictive for select to authenticated
      using (nullif((select auth.jwt())->>'client_id','') is null)`);
  }
  await user.query(`select set_config('request.jwt.claims','{"client_id":"synthetic-client"}',false)`);
  assert.deepEqual((await user.query("select public.mobile_read_training_records('2026-09-02') data")).rows[0].data,
    {sessions:[],exercises:[],sets:[],history:[]});
  await user.query(`select set_config('request.jwt.claims','{}',false)`);
  console.log('PASS restrictive OAuth policy still blocks product reads through the RPC');
  await user.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  await admin.query('revoke select on public.workout_sets from authenticated');
  await assert.rejects(user.query("select public.mobile_read_training_records('2026-09-02')"),e=>e.code==='42501');
  await admin.query('grant select on public.workout_sets to authenticated');
  console.log('PASS separate users, real RLS, invoker cannot bypass missing table privileges');
  await user.query('begin read only'); await user.query("select public.mobile_read_training_records('2026-09-02')"); await user.query('rollback');
  assert.equal(await snapshot(),before);
  const sql = await read('supabase/migrations/20261030235611_training_records_read_expand.sql');
  await admin.query(sql.split('\n').find(l=>l.startsWith('--   drop function')).slice(5));
  await assert.rejects(user.query("select public.mobile_read_training_records('2026-09-02')"),e=>e.code==='42883');
  assert.equal(await snapshot(),before); assert.deepEqual(await fullRead(),full);
  console.log('PASS documented DROP, unchanged historical rows, old read still works');
  const path=join(dir,'fixture.json'); await writeFile(path,JSON.stringify({full,cases,owner}));
  const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','src/lib/phase2/training-records-postgres.test.ts'],
    {cwd:root,env:{...process.env,OWNLEVEL_RECORDS_FIXTURE:path},stdio:'inherit'});
  assert.equal(result.status,0,'DTO equivalence / fallback integration failed');
  console.log(`PASS SQL + application: ${full.sessions.length} completed sessions, ${full.exercises.length} exercises, ${full.sets.length} completed sets per account`);
} finally {
  for(const c of clients) await c.end().catch(()=>{});
  if(started) await pg.stop();
  await rm(dir,{recursive:true,force:true});
}
