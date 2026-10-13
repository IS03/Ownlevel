// Disposable PostgreSQL 17 regression + real two-connection races. No remote URL
// is accepted. Install test-only tooling OUTSIDE the repo, then run:
// npm install --prefix "$TEMP_DIR" --no-save --package-lock=false embedded-postgres@17.10.0-beta.17
// OWNLEVEL_TEST_MODULES="$TEMP_DIR/node_modules" node scripts/testing/m3-3b-active-session.mjs
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

const moduleRoot = process.env.OWNLEVEL_TEST_MODULES;
if (!moduleRoot) throw new Error('Set OWNLEVEL_TEST_MODULES to the external test-tooling node_modules directory.');
const { default: EmbeddedPostgres } = await import(pathToFileURL(join(moduleRoot, 'embedded-postgres/dist/index.js')));
const directory = await mkdtemp(join(tmpdir(), 'ownlevel-m3-3b-'));
const listener = createServer();
await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const pg = new EmbeddedPostgres({ databaseDir: join(directory, 'db'), port, user: 'postgres', password: 'local-test',
  persistent: true, createPostgresUser: false, onLog: () => {}, onError: () => {}, postgresFlags: ['-h', '127.0.0.1'] });
const clients = [];
const read = (file) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
function sqlFunction(source, name) {
  const sql = source.match(new RegExp(`create(?: or replace)? function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))?.[0];
  if (!sql) throw new Error(`Missing production function ${name}`);
  return sql;
}
async function connect() {
  const client = pg.getPgClient(); clients.push(client); await client.connect(); return client;
}
const owner = '33400000-0000-4000-8000-000000000001';
const sessionId = '33400000-0000-4000-8000-000000000301';
const exerciseId = '33400000-0000-4000-8000-000000000201';
const payload = { is_completed: true, decision: 'maintain', decision_note: '', apply_to_routine: false, notes: 'saved',
  sets: [{ set_number: 1, target_reps: 8, target_weight_kg: 40, target_rir: 2, actual_reps: 8, actual_weight_kg: 42.5, is_completed: true, notes: null }] };
async function asOwner(client) {
  await client.query('set role authenticated');
  await client.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
}
async function reset(client) {
  await client.query('reset role');
  await client.query('delete from public.workout_sessions where user_id=$1', [owner]);
  await client.query("insert into public.workout_sessions(id,user_id,day_log_id,status) values($1,$2,'33400000-0000-4000-8000-000000000101','in_progress')", [sessionId, owner]);
  await asOwner(client);
  const appended = await client.query('select public.append_workout_exercise($1,$2) as id', [sessionId, exerciseId]);
  return (await client.query('select id,updated_at::text as version from public.workout_session_exercises where id=$1', [appended.rows[0].id])).rows[0];
}
async function save(client, row, notes = 'saved') {
  return client.query('select public.mobile_save_workout_exercise($1,$2,$3,$4)::text as version',
    [sessionId, row.id, row.version, JSON.stringify({ ...payload, notes })]);
}
// Prove the waiter is blocked in PostgreSQL, not with timing-only assumptions.
async function waitForLock(observer, pid) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const { rows } = await observer.query('select wait_event_type from pg_stat_activity where pid=$1', [pid]);
    if (rows[0]?.wait_event_type === 'Lock') return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Second connection did not block on the shared database lock');
}
let started = false;
try {
  await pg.initialise(); await pg.start(); started = true;
  const setup = await connect();
  await setup.query(await read('supabase/tests/m3_3b_bootstrap.sql'));
  const base = await read('supabase/migrations/20260810112232_training_robust_rebuild.sql');
  const resilience = await read('supabase/migrations/20260826114439_workout_sync_resilience.sql');
  const editor = await read('supabase/migrations/20260928140340_mobile_routine_editor_start_expand.sql');
  const ledger = await read('supabase/migrations/20260927190000_mobile_training_api_expand.sql');
  const repair = await read('supabase/migrations/20260426_0008_training_repair_converge.sql');
  const initial = await read('supabase/migrations/0001.sql');
  for (const [source, names] of [
    [initial, ['set_updated_at']],
    [base, ['workout_session_exercises_init_robust', 'workout_sets_sync_owner_and_completion']],
    [resilience, ['workout_session_exercises_sync_legacy_sets']],
    [editor, ['lock_training_user_mutations', 'lock_training_user_before_write', 'workout_session_exercises_create_default_sets', 'start_workout_session', 'finish_workout_session']],
    [repair, ['trg_workout_session_exercises_completion']],
  ]) for (const name of names) await setup.query(sqlFunction(source, name));
  await setup.query("create function public.normalize_name(value text) returns text language sql immutable as $$ select nullif(upper(regexp_replace(btrim(value),'\\s+',' ','g')),'') $$");
  await setup.query(ledger.slice(0, ledger.indexOf('create function public.mobile_create_training_routine')) + 'commit;');
  await setup.query(sqlFunction(ledger, 'mobile_create_training_exercise'));
  await setup.query(`
    create trigger training_lock before insert or update or delete on public.exercises for each statement execute function public.lock_training_user_before_write();
    create trigger tr_workout_session_exercises_updated_at before update on public.workout_session_exercises for each row execute function public.set_updated_at();
    create trigger init before insert on public.workout_session_exercises for each row execute function public.workout_session_exercises_init_robust();
    create trigger defaults after insert on public.workout_session_exercises for each row execute function public.workout_session_exercises_create_default_sets();
    create trigger legacy after update of series_reales,reps_reales,peso_real,is_completed on public.workout_session_exercises for each row execute function public.workout_session_exercises_sync_legacy_sets();
    create trigger completion before update of is_completed,completed_at on public.workout_session_exercises for each row execute function public.trg_workout_session_exercises_completion();
    create trigger set_owner before insert or update of workout_session_exercise_id,user_id,is_completed on public.workout_sets for each row execute function public.workout_sets_sync_owner_and_completion();
  `);
  await setup.query(await read('supabase/migrations/20260929220000_mobile_active_session_expand.sql'));
  // A rollout interrupted before history registration can safely reapply DDL.
  await setup.query(await read('supabase/migrations/20260929220000_mobile_active_session_expand.sql'));
  const repaired = (await setup.query("select pg_get_functiondef('public.mobile_create_training_exercise(text,jsonb,uuid[])'::regprocedure) as definition")).rows[0].definition;
  assert.equal(repaired.split('perform public.lock_training_user_mutations();').length - 1, 1);
  console.log('PASS migration reapplication: no duplicate catalog lock injection');
  const conflictMigration = await read('supabase/migrations/20260930030000_mobile_active_session_conflict_status.sql');
  await setup.query(conflictMigration);
  await setup.query(conflictMigration);
  await setup.query(await read('supabase/migrations/20261001010000_active_session_exercise_order.sql'));
  await setup.query(await read('supabase/migrations/20261013230126_active_session_append_empty_sets.sql'));
  await setup.query(await read('supabase/tests/m3_3b_active_session.sql'));
  console.log('PASS SQL: ownership/RLS, snapshots, save/CAS/read-back, closed/removed, structural replay, atomic rollback, cancel/history');

  await setup.query('insert into auth.users(id) values($1)', [owner]);
  await setup.query("insert into public.day_logs(id,user_id,log_date) values('33400000-0000-4000-8000-000000000101',$1,'2026-09-29')", [owner]);
  await setup.query("insert into public.exercises(id,user_id,nombre,series_sugeridas,reps_sugeridas,peso_sugerido) values($1,$2,'RACE PRESS',1,8,40)", [exerciseId, owner]);
  const a = await connect(), b = await connect(); await asOwner(a); await asOwner(b);
  const pid = Number((await b.query('select pg_backend_pid() as pid')).rows[0].pid);
  async function race(label, first, second, verify) {
    const row = await reset(setup);
    await a.query('begin');
    const initial = await first(a, row);
    // Handle rejection immediately so expected SQL errors are not unhandled.
    const pending = second(b, row).then((result) => ({ result }), (error) => ({ error }));
    await setup.query('reset role');
    await waitForLock(setup, pid);
    await a.query('commit');
    await verify(await pending, row, initial);
    console.log(`PASS concurrent PostgreSQL connections: ${label}`);
  }
  const conflict = (outcome) => { assert.equal(outcome.error?.code, 'PT409'); assert.equal(outcome.error?.message, 'SESSION_EXERCISE_CHANGED'); };
  await race('save vs save (Web first, Mobile waiter)',
    (c, row) => c.query('select public.save_workout_exercise($1,$2,$3)', [row.id,row.version,JSON.stringify(payload)]),
    (c, row) => save(c,row,'unseen overwrite'), conflict);
  await race('save vs finish (Web finish sees confirmed series)', save,
    (c) => c.query('select public.finish_workout_session($1)', [sessionId]), async (outcome) => {
      assert.ifError(outcome.error);
      assert.equal((await setup.query('select status from public.workout_sessions where id=$1',[sessionId])).rows[0].status,'completed');
    });
  await race('finish vs save (Mobile waiter receives SESSION_CLOSED)', async (c,row) => {
    await save(c,row); await c.query('select public.finish_workout_session($1)',[sessionId]);
  }, save, (outcome) => { assert.equal(outcome.error?.message,'SESSION_CLOSED'); });
  await race('save vs remove (unobserved version rejected)', save,
    (c,row) => c.query("select * from public.mobile_mutate_workout_session($1,'remove','race-remove',$2,$3)",[sessionId,row.id,row.version]), conflict);
  await race('remove vs save (removed explicit)',
    (c,row) => c.query('select public.remove_workout_exercise($1,$2,$3)',[sessionId,row.id,row.version]), save,
    (outcome) => { assert.equal(outcome.error?.message,'SESSION_EXERCISE_REMOVED'); });
  await race('save vs cancel (delete waits, then removes only active)', save,
    (c) => c.query("select * from public.mobile_mutate_workout_session($1,'cancel','race-cancel')",[sessionId]), async (outcome) => {
      assert.ifError(outcome.error);
      assert.equal((await setup.query('select count(*)::int as n from public.workout_sessions where id=$1',[sessionId])).rows[0].n,0);
    });
  await race('cancel vs save (missing parent explicit)',
    (c) => c.query('select public.cancel_workout_session($1)',[sessionId]), save,
    (outcome) => { assert.equal(outcome.error?.message,'TRAINING_SESSION_NOT_FOUND'); });
  // The standalone catalog RPC and outer create+add MUST agree on user ->
  // ledger order even if both intents address the exact same nested key.
  await reset(setup);
  const createKey = 'race-create-catalog';
  const createdExercise = JSON.stringify({ name: 'RACE NEW EXERCISE', suggestedSets: 1 });
  const derived = (await setup.query("select 'session-create:' || encode(extensions.digest(convert_to($1::text || ':' || $2,'UTF8'),'sha256'),'hex') as key", [sessionId,createKey])).rows[0].key;
  await a.query('begin'); await a.query('select public.lock_training_user_mutations()');
  const catalogPending = b.query('select * from public.mobile_create_training_exercise($1,$2)', [derived,createdExercise])
    .then((result) => ({ result }), (error) => ({ error }));
  await setup.query('reset role'); await waitForLock(setup,pid);
  const created = await a.query("select * from public.mobile_mutate_workout_session($1,'create_and_add',$2,p_exercise => $3)", [sessionId,createKey,createdExercise]);
  await a.query('commit');
  const catalogOutcome = await catalogPending;
  assert.ifError(catalogOutcome.error);
  assert.equal(catalogOutcome.result.rows[0].replayed,true);
  assert.equal(catalogOutcome.result.rows[0].response_body.exercise.id,created.rows[0].response_body.exerciseId);
  const replay = await b.query("select * from public.mobile_mutate_workout_session($1,'create_and_add',$2,p_exercise => $3)", [sessionId,createKey,createdExercise]);
  assert.equal(replay.rows[0].replayed,true);
  assert.deepEqual(replay.rows[0].response_body,created.rows[0].response_body);
  console.log('PASS concurrent PostgreSQL connections: catalog/create+add shared user/ledger order and exact replay');
  // A failed structural intent must roll back its key, so it is recoverable.
  await setup.query('reset role');
  assert.equal((await setup.query("select count(*)::int as n from public.mobile_idempotency_keys where idempotency_key='race-remove'")).rows[0].n,0);
  console.log('PASS all M3.3B SQL checks (PostgreSQL 17, isolated local fixtures)');
} finally {
  await Promise.all(clients.map((client) => client.end().catch(() => {})));
  if (started) await pg.stop();
  await rm(directory, { recursive: true, force: true });
}
