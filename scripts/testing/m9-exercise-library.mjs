// Disposable PostgreSQL 17, actual production functions and two-connection races.
// OWNLEVEL_TEST_MODULES=/external/node_modules node scripts/testing/m9-exercise-library.mjs
// Tooling: embedded-postgres@17.10.0-beta.17 installed outside the repository.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { bootstrapTrainingPostgres, readTrainingTestFile as read, trainingSqlFunction as fn } from './training-postgres-fixture.mjs';
const modules = process.env.OWNLEVEL_TEST_MODULES;
if (!modules) throw new Error('Set OWNLEVEL_TEST_MODULES to external tooling. No remote database is accepted.');
const { default: EmbeddedPostgres } = await import(pathToFileURL(join(modules, 'embedded-postgres/dist/index.js')));
const directory = await mkdtemp(join(tmpdir(), 'ownlevel-m9-exercises-'));
const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const pg = new EmbeddedPostgres({ databaseDir: join(directory, 'db'), port, user: 'postgres', password: 'local-test', persistent: true,
  createPostgresUser: false, onLog: () => {}, onError: () => {}, postgresFlags: ['-h', '127.0.0.1'] });
const clients = [];
async function connect() { const c = pg.getPgClient(); clients.push(c); await c.connect(); return c; }
const owner = '94000000-0000-4000-8000-000000000001', exercise = '94000000-0000-4000-8000-000000000201';
const identity = { name: 'CAS PRESS', muscleGroup: 'pecho', muscleGroupLabel: null, implement: 'Barra', weightMode: 'Total con barra', notes: 'Local' };
async function asOwner(c) { await c.query('set role authenticated'); await c.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]); }
async function version(c) { return (await c.query('select updated_at::text as version from public.exercises where id=$1', [exercise])).rows[0].version; }
async function save(c, expected) { return c.query('select public.mobile_update_training_exercise_identity($1,$2,$3) as data', [exercise, identity, expected]); }
async function waitForLock(c, pid) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if ((await c.query('select wait_event_type from pg_stat_activity where pid=$1', [pid])).rows[0]?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Second connection did not wait for Training lock');
}
let started = false;
try {
  await pg.initialise(); await pg.start(); started = true;
  const setup = await connect(); await bootstrapTrainingPostgres(setup);
  const editor = await read('supabase/migrations/20260928140340_mobile_routine_editor_start_expand.sql');
  await setup.query(fn(editor, 'mobile_start_training_session'));
  await setup.query(fn(await read('supabase/migrations/20260813170000_nutrition_energy_sync.sql'), 'get_or_create_day_log'));
  await setup.query(`create trigger tr_exercises_updated_at before update on public.exercises for each row execute function public.set_updated_at();
    revoke all on function public.mobile_start_training_session(text,uuid) from public,anon;
    grant execute on function public.mobile_start_training_session(text,uuid) to authenticated;`);
  const migration = await read('supabase/migrations/20261013183754_mobile_exercise_identity_template_start_expand.sql');
  await setup.query(migration); await setup.query(migration);
  await setup.query(await read('supabase/tests/m9_exercise_library.sql'));
  console.log('PASS SQL: exact migration reapplication, ownership, strict payload, CAS, defaults/memberships/history preserved, null/zero start, legacy fallback, ledger replay/policy conflict, active guard and grants');

  await setup.query('insert into auth.users(id) values($1)', [owner]);
  await setup.query("insert into public.exercises(id,user_id,nombre,series_sugeridas,reps_sugeridas,peso_sugerido) values($1,$2,'RACE PRESS',3,8,55)", [exercise, owner]);
  const a = await connect(), b = await connect(); await asOwner(a); await asOwner(b);
  const pid = (await b.query('select pg_backend_pid() as pid')).rows[0].pid;
  const before = await version(a); await a.query('begin');
  await a.query('update public.exercises set reps_sugeridas=15 where id=$1', [exercise]);
  const pending = save(b, before).then(result => ({ result }), error => ({ error }));
  await waitForLock(setup, pid); await a.query('commit');
  const outcome = await pending;
  assert.equal(outcome.error?.message, 'EXERCISE_CHANGED');
  assert.equal((await a.query('select reps_sugeridas from public.exercises where id=$1', [exercise])).rows[0].reps_sugeridas, 15);
  await save(b, await version(b));
  const after = (await a.query('select nombre,reps_sugeridas,peso_sugerido from public.exercises where id=$1', [exercise])).rows[0];
  assert.equal(after.nombre, 'CAS PRESS'); assert.equal(after.reps_sugeridas, 15); assert.equal(Number(after.peso_sugerido), 55);
  console.log('PASS real competing connections: Web defaults update vs Mobile identity; stale rejected and explicit fresh edit preserves server defaults');
  const expected = await version(a); await a.query('begin'); await save(a, expected);
  const second = save(b, expected).then(result => ({ result }), error => ({ error }));
  await waitForLock(setup, pid); await a.query('commit'); assert.equal((await second).error?.message, 'EXERCISE_CHANGED');
  console.log('PASS real competing identity edits: exactly one CAS succeeds');
  await setup.query("insert into public.day_logs(user_id,log_date) values($1,(timezone('America/Argentina/Cordoba',now()))::date)", [owner]);
  await a.query('begin');
  const firstStart = (await a.query("select * from public.mobile_start_training_session_from_template('race-start',null)")).rows[0];
  const secondStart = b.query("select * from public.mobile_start_training_session_from_template('race-start',null)").then(result => ({ result }), error => ({ error }));
  await waitForLock(setup, pid); await a.query('commit');
  const replay = await secondStart; assert.ifError(replay.error);
  assert.equal(replay.result.rows[0].replayed, true); assert.deepEqual(replay.result.rows[0].response_body, firstStart.response_body);
  assert.equal((await a.query('select count(*)::int as n from public.workout_sessions where user_id=$1', [owner])).rows[0].n, 1);
  console.log('PASS real concurrent start replay: one session, same durable response');

} finally {
  await Promise.all(clients.map(c => c.end().catch(() => {})));
  if (started) await pg.stop(); await rm(directory, { recursive: true, force: true });
}
