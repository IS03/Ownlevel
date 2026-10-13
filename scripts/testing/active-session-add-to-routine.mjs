// Disposable PostgreSQL 17; real production functions, triggers, RLS and locks.
// OWNLEVEL_TEST_MODULES=/tmp/tooling/node_modules node scripts/testing/active-session-add-to-routine.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { bootstrapTrainingPostgres, readTrainingTestFile, trainingSqlFunction } from './training-postgres-fixture.mjs';
const modules = process.env.OWNLEVEL_TEST_MODULES;
if (!modules) throw new Error('External PostgreSQL test tooling required');
const { default: EmbeddedPostgres } = await import(pathToFileURL(join(modules, 'embedded-postgres/dist/index.js')));
const directory = await mkdtemp(join(tmpdir(), 'ownlevel-session-routine-'));
const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const pg = new EmbeddedPostgres({ databaseDir: join(directory, 'db'), port, user: 'postgres', password: 'local-test', persistent: true,
  createPostgresUser: false, onLog: () => {}, onError: () => {}, postgresFlags: ['-h', '127.0.0.1'] });
const clients = []; let started = false;
async function connect() { const c = pg.getPgClient(); clients.push(c); await c.connect(); return c; }
try {
  await pg.initialise(); await pg.start(); started = true;
  const setup = await connect(); await bootstrapTrainingPostgres(setup);
  const editor = await readTrainingTestFile('supabase/migrations/20260928140340_mobile_routine_editor_start_expand.sql');
  await setup.query(`alter table public.routines add column template_version bigint not null default 1;
    alter table public.routine_exercise_sets add constraint fixture_set_unique unique(routine_exercise_id,set_number);
    alter table public.routine_exercises add constraint fixture_exercise_unique unique(routine_id,exercise_id);`);
  for (const name of ['bump_training_routine_template_once','bump_routine_templates_from_relations','bump_routine_templates_from_sets',
    'routine_exercises_apply_exercise_defaults','routine_exercises_create_default_sets','mobile_replace_training_routine_template'])
    await setup.query(trainingSqlFunction(editor,name));
  await setup.query(editor.slice(editor.indexOf('create trigger tr_00_training_user_lock_routines'), editor.indexOf('revoke all on function public.lock_training_user_before_write'))
    .replace(/create trigger tr_00_training_user_lock_exercises[\s\S]*?;\n/,'')
    + `create trigger fixture_rest_defaults before insert on public.routine_exercises for each row execute function public.routine_exercises_apply_exercise_defaults();
       create trigger fixture_sets_defaults after insert on public.routine_exercises for each row execute function public.routine_exercises_create_default_sets();
       alter table public.routine_exercises enable row level security;
       create policy owner on public.routine_exercises to authenticated using(exists(select 1 from public.routines r where r.id=routine_id and r.user_id=(select auth.uid()))) with check(exists(select 1 from public.routines r where r.id=routine_id and r.user_id=(select auth.uid())));
       alter table public.routine_exercise_sets enable row level security;
       create policy owner on public.routine_exercise_sets to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
       alter table public.workout_sessions drop constraint workout_sessions_routine_id_fkey;
       alter table public.workout_sessions add foreign key(routine_id) references public.routines(id) on delete set null;`);
  const corrections = await readTrainingTestFile('supabase/migrations/20260811203000_session_history_corrections.sql');
  for (const name of ['correct_completed_workout_session','discard_completed_workout_session']) await setup.query(trainingSqlFunction(corrections,name));
  await setup.query(await readTrainingTestFile('supabase/migrations/20261001010000_active_session_exercise_order.sql'));
  await setup.query(await readTrainingTestFile('supabase/migrations/20261002010000_mobile_training_finish_history_expand.sql'));
  await setup.query(await readTrainingTestFile('supabase/migrations/20261013231609_active_session_append_empty_sets.sql'));
  const migration = await readTrainingTestFile('supabase/migrations/20261013233111_active_session_add_to_routine_expand.sql');
  await setup.query(migration); await setup.query(migration);
  await setup.query(await readTrainingTestFile('supabase/tests/active_session_add_to_routine.sql'));
  console.log('PASS SQL: blank default, opt-in, legacy save, finish receipts, archived/deleted/duplicate/no sets, ownership, immutable snapshots, replay, CAS');
  // Real competing connections: finish must serialize with an editor and
  // reject its stale version rather than overwrite the newly appended row.
  const a = await connect(), b = await connect();
  for (const c of [a,b]) await c.query("set role authenticated; select set_config('request.jwt.claim.sub','35300000-0000-4000-8000-000000000001',false)");
  const seed = (await setup.query('select * from public.fixture_routine_session(true)')).rows[0];
  const version = (await setup.query('select template_version from public.routines where id=$1',[seed.rid])).rows[0].template_version;
  await a.query('begin');
  const first = (await a.query('select * from public.mobile_finish_training_session_v2($1,$2,$3)',[seed.sid,JSON.stringify({energy_level:null,performance_level:null,pain_level:null,notes:null}),'race-finish'])).rows[0];
  const edit = b.query('select public.mobile_replace_training_routine_template($1,$2,$3)',[seed.rid,version,'[]']).then(() => ({ok:true}), error => ({error}));
  const pid = (await setup.query("select pid from pg_stat_activity where query like 'select public.mobile_replace_training_routine_template%' and wait_event_type='Lock'")).rows;
  // Give the second client a chance to reach the server; then inspect the lock.
  let blocked = pid.length > 0;
  for (let i=0; i<200 && !blocked; i++) {
    blocked = (await setup.query("select exists(select 1 from pg_stat_activity where query like 'select public.mobile_replace_training_routine_template%' and wait_event_type='Lock') as blocked")).rows[0].blocked;
    if (!blocked) await new Promise(resolve => setTimeout(resolve,10));
  }
  assert.equal(blocked,true,'editor waits on same user lock'); await a.query('commit');
  const result = await edit; assert.equal(result.error?.message,'ROUTINE_TEMPLATE_CHANGED');
  const replay = (await b.query('select * from public.mobile_finish_training_session_v2($1,$2,$3)',[seed.sid,JSON.stringify({energy_level:null,performance_level:null,pain_level:null,notes:null}),'race-finish'])).rows[0];
  assert.equal(replay.replayed,true); assert.deepEqual(replay.response_body,first.response_body);
  console.log('PASS race: finish -> blocked editor -> stale CAS; exact replay, no duplicate append');
  // Archive wins the same lock: finish succeeds and reports the skip.
  const archived = (await setup.query('select * from public.fixture_routine_session(true)')).rows[0];
  await a.query('begin'); await a.query('update public.routines set is_active=false where id=$1',[archived.rid]);
  const pending = b.query('select * from public.mobile_finish_training_session_v2($1,$2,$3)',[archived.sid,JSON.stringify({energy_level:null,performance_level:null,pain_level:null,notes:null}),'archive-race']);
  const bPid = (await setup.query("select pid from pg_stat_activity where query like 'select * from public.mobile_finish_training_session_v2%' and pid<>pg_backend_pid() and state='active'")).rows;
  let waiting = false;
  for (let i=0;i<200 && !waiting;i++) {
    waiting = (await setup.query("select exists(select 1 from pg_stat_activity where query like 'select * from public.mobile_finish_training_session_v2%' and wait_event_type='Lock') as blocked")).rows[0].blocked;
    if (!waiting) await new Promise(resolve => setTimeout(resolve,10));
  }
  assert.equal(waiting,true,`finish waits on archive (${bPid.length} active)`); await a.query('commit');
  assert.equal((await pending).rows[0].response_body.routineAdditions[0].outcome,'routine_unavailable');
  assert.equal((await setup.query('select count(*)::int as n from public.routine_exercises where routine_id=$1',[archived.rid])).rows[0].n,0);
  console.log('PASS race: archive -> blocked finish -> receipt skip, no template addition');

} finally {
  for (const c of clients) await c.end().catch(() => {});
  if (started) await pg.stop(); await rm(directory,{recursive:true,force:true});
}
