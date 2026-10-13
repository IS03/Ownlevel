// Step 2: actual migration, triggers/RLS and real competing PostgreSQL connections.
// OWNLEVEL_TEST_MODULES=/external/node_modules node scripts/testing/active-session-append-empty.mjs
// Uses disposable PostgreSQL only; accepts no remote database URL.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { bootstrapTrainingPostgres, readTrainingTestFile as read } from './training-postgres-fixture.mjs';
const modules = process.env.OWNLEVEL_TEST_MODULES;
if (!modules) throw new Error('Set OWNLEVEL_TEST_MODULES to external PostgreSQL tooling.');
const { default: EmbeddedPostgres } = await import(pathToFileURL(join(modules, 'embedded-postgres/dist/index.js')));
const directory = await mkdtemp(join(tmpdir(), 'ownlevel-append-empty-'));
const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const pg = new EmbeddedPostgres({ databaseDir: join(directory, 'db'), port, user: 'postgres', password: 'local-test', persistent: true,
  createPostgresUser: false, onLog: () => {}, onError: () => {}, postgresFlags: ['-h', '127.0.0.1'] });
const clients = [];
let started = false;
const owner = '94300000-0000-4000-8000-000000000001', session = '94300000-0000-4000-8000-000000000301';
const exercise = '94300000-0000-4000-8000-000000000201';
async function connect() { const c = pg.getPgClient(); clients.push(c); await c.connect(); return c; }
async function asOwner(c) { await c.query('set role authenticated'); await c.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]); }
async function snapshot(c) {
  return (await c.query(`select to_jsonb(se) as exercise,
    (select jsonb_agg(to_jsonb(s) order by set_number) from public.workout_sets s where s.workout_session_exercise_id=se.id) as sets
    from public.workout_session_exercises se order by se.id`)).rows;
}
async function waitForLock(c, pid) {
  for (let i = 0; i < 200; i++) {
    if ((await c.query('select wait_event_type from pg_stat_activity where pid=$1', [pid])).rows[0]?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Concurrent mutation did not wait for the shared Training lock');
}
try {
  await pg.initialise(); await pg.start(); started = true;
  const setup = await connect(); await bootstrapTrainingPostgres(setup);
  // The minimal shared fixture omits routine RLS. Load the real policies so
  // advisor findings reflect production rather than those fixture shortcuts.
  const base = await read('supabase/migrations/20260810112232_training_robust_rebuild.sql');
  for (const table of ['routine_exercises', 'routine_exercise_sets']) {
    await setup.query(`alter table public.${table} enable row level security`);
    const policies = [...base.matchAll(new RegExp(`create policy ${table}_[\\s\\S]*?;`, 'g'))];
    assert.equal(policies.length, 4); for (const policy of policies) await setup.query(policy[0]);
  }
  await setup.query(await read('supabase/migrations/20261001010000_active_session_exercise_order.sql'));
  await setup.query('insert into auth.users(id) values($1)', [owner]);
  await setup.query("insert into public.day_logs(id,user_id,log_date) values('94300000-0000-4000-8000-000000000101',$1,'2026-10-13')", [owner]);
  await setup.query("insert into public.exercises(id,user_id,nombre,series_sugeridas,reps_sugeridas,peso_sugerido,rir_sugerido,descanso_min_sugerido_segundos,descanso_max_sugerido_segundos) values($1,$2,'OLD DEFAULTS',4,12,55,2,120,180)", [exercise, owner]);
  await setup.query("insert into public.workout_sessions(id,user_id,day_log_id,status) values($1,$2,'94300000-0000-4000-8000-000000000101','in_progress')", [session, owner]);
  await asOwner(setup); await setup.query('select public.append_workout_exercise($1,$2)', [session, exercise]);
  const before = await snapshot(setup);
  assert.equal(before[0].sets.length, 4, 'Fixture must first reproduce the previous preload');
  await setup.query('reset role');
  const migration = await read('supabase/migrations/20261013231609_active_session_append_empty_sets.sql');
  await setup.query(migration); await setup.query(migration);
  assert.deepEqual(await snapshot(setup), before, 'Migration reapplication must preserve existing snapshots and real values');
  await setup.query(await read('supabase/tests/active_session_append_empty.sql'));
  await setup.query(await read('supabase/tests/m3_3b_active_session.sql'));
  console.log('PASS SQL: one blank set, legacy mirrors, null/zero, both add paths, snapshots/defaults preserved, CAS, RLS/ownership, source/error contract, idempotency and rollback');

  const a = await connect(), b = await connect(); await asOwner(a); await asOwner(b);
  const pid = (await b.query('select pg_backend_pid() as pid')).rows[0].pid;
  await setup.query('delete from public.workout_session_exercises where workout_session_id=$1', [session]);
  await a.query('begin');
  const first = (await a.query("select * from public.mobile_mutate_workout_session($1,'add_existing','concurrent-empty',p_exercise_id=>$2)", [session, exercise])).rows[0];
  const pending = b.query("select * from public.mobile_mutate_workout_session($1,'add_existing','concurrent-empty',p_exercise_id=>$2)", [session, exercise]).then(result => ({ result }), error => ({ error }));
  await waitForLock(setup, pid); await a.query('commit');
  const replay = await pending; assert.ifError(replay.error); assert.equal(replay.result.rows[0].replayed, true); assert.deepEqual(replay.result.rows[0].response_body, first.response_body);
  let rows = await snapshot(setup); assert.equal(rows.length, 1); assert.equal(rows[0].sets.length, 1); assert.equal(rows[0].sets[0].actual_reps, null);
  console.log('PASS competing add/replay: exactly one exercise and blank set');

  await setup.query('delete from public.workout_session_exercises where workout_session_id=$1', [session]);
  await a.query('begin'); await a.query('select public.append_workout_exercise($1,$2)', [session, exercise]);
  const duplicate = b.query("select * from public.mobile_mutate_workout_session($1,'add_existing','duplicate-empty',p_exercise_id=>$2)", [session, exercise]).then(result => ({ result }), error => ({ error }));
  await waitForLock(setup, pid); await a.query('commit');
  assert.equal((await duplicate).error?.message, 'SESSION_EXERCISE_ALREADY_EXISTS');
  rows = await snapshot(setup); assert.equal(rows.length, 1); assert.equal(rows[0].sets.length, 1); assert.equal(rows[0].sets[0].target_reps, null);
  console.log('PASS Web append vs Mobile add: shared lock, duplicate rejected, one blank set');

  const previous = (await b.query('select updated_at::text as version from public.workout_sessions where id=$1', [session])).rows[0].version;
  const extra = '94300000-0000-4000-8000-000000000202';
  await setup.query("insert into public.exercises(id,user_id,nombre,series_sugeridas) values($1,$2,'SECOND DEFAULTS',4)", [extra, owner]);
  await a.query('begin'); await a.query('select public.append_workout_exercise($1,$2)', [session, extra]);
  const order = b.query('select * from public.mobile_reorder_workout_exercises($1,$2,$3,$4)', [session, [rows[0].exercise.id], previous, 'stale-order']).then(result => ({ result }), error => ({ error }));
  await waitForLock(setup, pid); await a.query('commit');
  assert.equal((await order).error?.message, 'SESSION_CHANGED');
  console.log('PASS append vs stale reorder: structure CAS still rejects an open stale editor');

  if (process.env.OWNLEVEL_RUN_ADVISORS === '1') {
    const { stdout } = await promisify(execFile)('npx', ['--yes', 'supabase', 'db', 'advisors', '--db-url',
      `postgresql://postgres:local-test@127.0.0.1:${port}/postgres?sslmode=disable`, '--type', 'security', '--level', 'warn', '--fail-on', 'error'], { maxBuffer: 4 * 1024 * 1024 });
    console.log(stdout.trim());
  }
} finally {
  await Promise.all(clients.map(c => c.end().catch(() => {})));
  if (started) await pg.stop(); await rm(directory, { recursive: true, force: true });
}
