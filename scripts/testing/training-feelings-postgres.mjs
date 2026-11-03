// Disposable real PostgreSQL only. Never reads a connection URL or production credentials.
// OWNLEVEL_TEST_MODULES=/external/tooling/node_modules node scripts/testing/training-feelings-postgres.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { bootstrapTrainingPostgres, readTrainingTestFile as read, trainingSqlFunction } from './training-postgres-fixture.mjs';

if (!process.env.OWNLEVEL_TEST_MODULES) throw Error('Set OWNLEVEL_TEST_MODULES to external embedded-postgres tooling.');
const { default: EmbeddedPostgres } = await import(pathToFileURL(join(process.env.OWNLEVEL_TEST_MODULES, 'embedded-postgres/dist/index.js')));
const dir = await mkdtemp(join(tmpdir(), 'ownlevel-feelings-'));
const listener = createServer(); await new Promise(r => listener.listen(0, '127.0.0.1', r));
const port = listener.address().port; await new Promise(r => listener.close(r));
const pg = new EmbeddedPostgres({ databaseDir: join(dir, 'db'), port, user: 'postgres', password: 'local-synthetic-test',
  persistent: true, createPostgresUser: false, onLog: () => {}, onError: () => {}, postgresFlags: ['-h', '127.0.0.1'] });
const clients = []; let started = false; let assertions = 0;
const owner = '93670000-0000-4000-8000-000000000001', other = '93670000-0000-4000-8000-000000000002';
const sid = '93670000-0000-4000-8000-000000000010', foreign = '93670000-0000-4000-8000-000000000011';
const xid = '93670000-0000-4000-8000-000000000020', se = '93670000-0000-4000-8000-000000000030';
const routine = '93670000-0000-4000-8000-000000000040';
const fact = (value, phase = 'pre', capturedAt = '2026-11-02T10:05:00.123456Z') => ({ op: 'set', value, instrumentVersion: 'energy-fatigue/1', declaredMoment: phase,
  declaredAt: '2026-11-02T09:30:00Z', capturedAt, source: 'mobile' });
const input = (key, expectedRevision, patch = {}, extra = {}) => ({ contractVersion: 'training-feelings/1', operation: 'save', expectedRevision, patch, idempotencyKey: key, ...extra });
async function connect() { const client = pg.getPgClient(); clients.push(client); await client.connect(); return client; }
const check = (actual, expected) => { assert.deepEqual(actual, expected); assertions++; };
const reject = async (promise, message) => { await assert.rejects(promise, e => e.message === message || e.code === message); assertions++; };
try {
  await pg.initialise(); await pg.start(); started = true;
  const admin = await connect(), user = await connect(), user2 = await connect();
  await bootstrapTrainingPostgres(admin);
  // The same current domain finish and legacy receipts used by installed clients.
  const editor = await read('supabase/migrations/20260928140340_mobile_routine_editor_start_expand.sql');
  await admin.query(editor.slice(0, editor.indexOf('-- Every Training writer')) + 'commit;');
  await admin.query(trainingSqlFunction(editor, 'bump_training_routine_template_once'));
  await admin.query(await read('supabase/migrations/20261002010000_mobile_training_finish_history_expand.sql'));
  await admin.query(await read('supabase/migrations/20261013233111_active_session_add_to_routine_expand.sql'));
  // Reproduce Supabase default grants to verify EFFECTIVE permissions, not only REVOKE text.
  await admin.query('create role service_role; alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;');
  const migration = await read('supabase/migrations/20261103023740_training_feelings_expand.sql');
  await admin.query(migration);
  check((await admin.query("select count(*)::int n from public.workout_session_feelings")).rows[0].n, 0);
  const acl = (await admin.query(`select prosecdef,proconfig,has_function_privilege('anon',oid,'execute') anon,
    has_function_privilege('public',oid,'execute') public,has_function_privilege('authenticated',oid,'execute') authenticated
    from pg_proc where oid='public.mutate_training_feelings_v1(uuid,jsonb)'::regprocedure`)).rows[0];
  check([acl.prosecdef, acl.anon, acl.public, acl.authenticated], [true, false, false, true]);
  check(acl.proconfig.includes('search_path=""'), true);
  check((await admin.query("select relrowsecurity from pg_class where oid='public.workout_session_feelings'::regclass")).rows[0].relrowsecurity, true);
  await admin.query('insert into auth.users(id) values($1),($2)', [owner, other]);
  await admin.query("insert into public.day_logs(user_id,log_date) values($1,'2026-11-02'),($2,'2026-11-02')", [owner, other]);
  await admin.query(`insert into public.workout_sessions(id,user_id,day_log_id,started_at,energy_level,performance_level,pain_level,pain_note,notes,
    abs_completed,treadmill_minutes,treadmill_distance_km,treadmill_speed_kmh,treadmill_incline_percent)
    select $1,$2,id,'2026-11-02T10:00:00Z',2,3,4,'legacy pain','legacy notes',true,12,1.2,6,2 from public.day_logs where user_id=$2`, [sid, owner]);
  await admin.query('insert into public.workout_sessions(id,user_id,day_log_id) select $1,$2,id from public.day_logs where user_id=$2', [foreign, other]);
  await admin.query("insert into public.exercises(id,user_id,nombre,weight_mode) values($1,$2,'SYNTHETIC PRESS','Peso total')", [xid, owner]);
  await admin.query('insert into public.workout_session_exercises(id,user_id,workout_session_id,exercise_id,exercise_order) values($1,$2,$3,$4,1)', [se, owner, sid, xid]);
  for (const [client, uid] of [[user, owner], [user2, owner]]) {
    await client.query('set role authenticated'); await client.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  }
  const mutate = async (client, session, body) => (await client.query('select * from public.mutate_training_feelings_v1($1,$2::jsonb)', [session, JSON.stringify(body)])).rows[0];
  const readState = async (client = user, session = sid) => (await client.query('select public.read_training_feelings_v1($1) body', [session])).rows[0].body;
  const state0 = await readState(); check(state0.revision, 0); check(state0.values, {});
  await reject(user.query('select public.read_training_feelings_v1($1)', [foreign]), 'TRAINING_SESSION_NOT_FOUND');
  await reject(mutate(user, foreign, input('foreign', 0)), 'TRAINING_SESSION_NOT_FOUND');
  await reject(user.query('insert into public.workout_session_feelings(session_id,revision,facts,updated_at) values($1,1,$2,now())', [sid, '{}']), '42501');
  await reject(user.query('update public.workout_session_feelings set revision=2'), '42501');
  await reject(user.query('delete from public.workout_session_feelings'), '42501');
  await user2.query("select set_config('request.jwt.claim.sub','',false)");
  await reject(readState(user2), 'UNAUTHORIZED');
  await reject(mutate(user2, sid, input('unauth', 0)), 'UNAUTHORIZED');
  await user2.query('set role anon');
  await reject(readState(user2), '42501');
  await reject(mutate(user2, sid, input('anon', 0)), '42501');
  await user2.query('set role authenticated');
  await user2.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  console.log('PASS anonymous/unauthenticated rejection, ownership and RPC-only writes');

  for (const patch of [
    { energyPre: null }, { energyPre: fact(0) }, { energyPre: fact(6) }, { energyPre: fact(1.5) }, { energyPre: fact('3') },
    { energyPre: { ...fact(3), instrumentVersion: 'legacy' } }, { fatiguePre: fact(3, 'post') },
    { energyPre: { ...fact(3), source: 'server' } }, { energyPre: { ...fact(3), capturedAt: '2026-02-30T12:00:00Z' } },
    { energyPre: { ...fact(3), capturedAt: '2026-11-02T12:00:00' } }, { energyPre: { ...fact(3), receivedAt: '2026-01-01T00:00:00Z' } },
    { energyPre: { ...fact(3), capturedAt: '2026-11-02T24:00:00Z' } },
    { energyPre: { op: 'clear', value: 3 } }, { bogus: fact(3) },
  ]) await reject(mutate(user, sid, input('invalid', 0, patch)), 'INVALID_FEELINGS_INPUT');
  for (const extra of [{ userId: other }, { expectedRevision: -1 }, { expectedRevision: 0.5 }, { contractVersion: 'old' }])
    await reject(mutate(user, sid, input('invalid', 0, {}, extra)), 'INVALID_FEELINGS_INPUT');
  check(await readState(), state0);
  const firstInput = input('pre-1', 0, { energyPre: fact(4), fatiguePre: fact(2, 'pre', null) });
  const first = await mutate(user, sid, firstInput);
  check(first.replayed, false); check(first.response_body.revision, 1);
  check(first.response_body.values.energyPre.temporalQuality, 'unverified_client_clock');
  check(first.response_body.values.fatiguePre.temporalQuality, 'unknown');
  check(first.response_body.sessionUpdatedAt, state0.sessionUpdatedAt);
  check((await mutate(user, sid, firstInput)).response_body, first.response_body); // Lost response: exact request/key.
  check((await mutate(user, sid, firstInput)).replayed, true);
  await reject(mutate(user, sid, input('pre-1', 0, { energyPre: fact(5) })), 'IDEMPOTENCY_KEY_REUSED');
  await reject(mutate(user, sid, input('stale', 0, { energyPre: { op: 'clear' } })), 'FEELINGS_CHANGED');
  check((await mutate(user, sid, input('omit', 1))).response_body.values, first.response_body.values);
  check((await readState()).revision, 1);
  const cleared = (await mutate(user, sid, input('clear', 1, { energyPre: { op: 'clear' } }))).response_body;
  check(cleared.revision, 2); check(Object.hasOwn(cleared.values, 'energyPre'), false);
  check(cleared.values.fatiguePre, first.response_body.values.fatiguePre);
  // A second user sees no rows even through direct SELECT (RLS), and cannot replay owner's keys.
  await user2.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
  check((await user2.query('select * from public.workout_session_feelings')).rows, []);
  await reject(mutate(user2, sid, firstInput), 'TRAINING_SESSION_NOT_FOUND');
  await user2.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  console.log('PASS independent optional values, validation, omission/clear, CAS, durable exact replay and RLS');

  // Two physical connections race on the same revision; one succeeds, one must conflict.
  const raced = await Promise.allSettled([
    mutate(user, sid, input('race-a', 2, { energyPre: fact(3) })),
    mutate(user2, sid, input('race-b', 2, { fatiguePre: fact(5) })),
  ]);
  check(raced.filter(x => x.status === 'fulfilled').length, 1);
  check(raced.filter(x => x.status === 'rejected').map(x => x.reason.message), ['FEELINGS_CHANGED']);
  const beforeFinish = await readState();
  const finishInput = input('finish-1', beforeFinish.revision, { energyPost: fact(3, 'post'), fatiguePost: fact(5, 'post') },
    { operation: 'finish', expectedSessionUpdatedAt: beforeFinish.sessionUpdatedAt, metadata: { performanceLevel: 4, notes: null } });
  await reject(mutate(user, sid, { ...finishInput, expectedSessionUpdatedAt: '2026-01-01T00:00:00Z' }), 'SESSION_CHANGED');
  await reject(mutate(user, sid, finishInput), 'NO_COMPLETED_SETS');
  check(await readState(), beforeFinish); // No committed post values or receipt when finish fails.
  check((await admin.query("select count(*)::int n from public.mobile_idempotency_keys where idempotency_key='finish-1'")).rows[0].n, 0);
  await user.query('update public.workout_sets set actual_reps=10,actual_weight_kg=20,is_completed=true where workout_session_exercise_id=$1', [se]);
  await user.query('update public.workout_session_exercises set is_completed=true where id=$1', [se]);
  await admin.query("insert into public.routines(id,user_id,nombre) values($1,$2,'SYNTHETIC ROUTINE')", [routine, owner]);
  await user.query('update public.workout_sessions set routine_id=$1 where id=$2', [routine, sid]);
  await user.query('update public.workout_session_exercises set add_to_routine_on_finish=true where id=$1', [se]);
  const ready = await readState(); finishInput.expectedSessionUpdatedAt = ready.sessionUpdatedAt;
  const legacySnapshot = (await admin.query('select energy_level,performance_level,pain_level,pain_note,notes,abs_completed,treadmill_minutes,treadmill_distance_km,treadmill_speed_kmh,treadmill_incline_percent from public.workout_sessions where id=$1', [sid])).rows[0];
  // Fail AFTER finish has changed routine/session, while storing the receipt. All effects must roll back.
  await admin.query(`create function public.fixture_receipt_failure() returns trigger language plpgsql as $$ begin
    if new.idempotency_key='finish-crash' then raise exception 'SYNTHETIC_RECEIPT_FAILURE'; end if; return new; end; $$;
    create trigger fixture_receipt_failure before update on public.mobile_idempotency_keys for each row execute function public.fixture_receipt_failure();`);
  await reject(mutate(user, sid, { ...finishInput, idempotencyKey: 'finish-crash' }), 'SYNTHETIC_RECEIPT_FAILURE');
  check(await readState(), ready);
  check((await admin.query('select count(*)::int n from public.routine_exercises where routine_id=$1', [routine])).rows[0].n, 0);
  await admin.query('drop trigger fixture_receipt_failure on public.mobile_idempotency_keys; drop function public.fixture_receipt_failure();');
  const concurrentFinish = await Promise.all([mutate(user, sid, finishInput), mutate(user2, sid, finishInput)]);
  check(concurrentFinish.map(row => row.replayed).sort(), [false, true]);
  check(concurrentFinish[0].response_body, concurrentFinish[1].response_body);
  const finished = concurrentFinish[0];
  check(finished.response_body.sessionStatus, 'completed');
  check(finished.response_body.revision, ready.revision + 1);
  check(finished.response_body.values.fatiguePre, ready.values.fatiguePre);
  check(finished.response_body.values.energyPost.value, 3); check(finished.response_body.values.fatiguePost.value, 5);
  check((await admin.query('select energy_level,performance_level,pain_level,pain_note,notes,abs_completed,treadmill_minutes,treadmill_distance_km,treadmill_speed_kmh,treadmill_incline_percent from public.workout_sessions where id=$1', [sid])).rows[0], { ...legacySnapshot, performance_level: 4, notes: null });
  check((await mutate(user2, sid, finishInput)).response_body, finished.response_body);
  check((await mutate(user2, sid, finishInput)).replayed, true);
  const routineState = (await admin.query('select id from public.routine_exercises where routine_id=$1', [routine])).rows;
  check(routineState.length, 1);
  check((await admin.query('select count(*)::int n from public.routine_exercise_sets where routine_exercise_id=$1', [routineState[0].id])).rows[0].n, 1);
  await reject(mutate(user, sid, { ...finishInput, idempotencyKey: 'different-finish' }), 'SESSION_CLOSED');
  await reject(mutate(user, sid, { ...finishInput, patch: {} }), 'IDEMPOTENCY_KEY_REUSED');
  check((await admin.query("select expires_at='infinity'::timestamptz durable from public.mobile_idempotency_keys where operation='training.feelings.finish.v1'")).rows[0].durable, true);
  console.log('PASS concurrent CAS, atomic finish rollback, legacy metadata preservation, repeated/lost finish');

  // Installed clients continue to use their original strict receipt, with no new fields.
  await user2.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
  const foreignPre = await mutate(user2, foreign, input('other-pre', 0, { energyPre: fact(1) }));
  await admin.query('insert into public.exercises(user_id,nombre,weight_mode) values($1,$2,$3)', [other, 'OTHER', 'Peso total']);
  await admin.query(`insert into public.workout_session_exercises(user_id,workout_session_id,exercise_id,exercise_order)
    select $1,$2,id,1 from public.exercises where user_id=$1`, [other, foreign]);
  await user2.query('update public.workout_sets set actual_reps=8,actual_weight_kg=10,is_completed=true');
  await user2.query('update public.workout_session_exercises set is_completed=true');
  const metadata = { energy_level: 4, performance_level: 3, pain_level: 0, notes: 'legacy client' };
  const legacy = (await user2.query('select * from public.mobile_finish_training_session($1,$2::jsonb,$3)', [foreign, JSON.stringify(metadata), 'old-finish'])).rows[0];
  check(Object.keys(legacy.response_body).sort(), ['status','sessionId','sessionStatus','name','routineId','logDate','startedAt','endedAt','sessionUpdatedAt','metadata','exerciseCount','completedExerciseCount','completedSetCount'].sort());
  check((await readState(user2, foreign)).values, foreignPre.response_body.values);
  check(Object.hasOwn((await readState(user2, foreign)).values, 'energyPost'), false);
  check((await user2.query('select * from public.mobile_finish_training_session($1,$2::jsonb,$3)', [foreign, JSON.stringify(metadata), 'old-finish'])).rows[0].response_body, legacy.response_body);
  // Older metadata writes (including corrections) address only workout_sessions, not the separate facts.
  await user2.query('update public.workout_sessions set energy_level=5,pain_note=$1,notes=$2 where id=$3', ['corrected', 'old correction', foreign]);
  check((await readState(user2, foreign)).values, foreignPre.response_body.values);
  // A late pre declaration remains explicitly unverified, even after session completion.
  const late = await mutate(user2, foreign, input('late', 1, { fatiguePre: fact(4) }));
  check(late.response_body.values.fatiguePre.temporalQuality, 'unverified_client_clock');
  await user2.query("update public.workout_sessions set status='discarded' where id=$1", [foreign]);
  await reject(mutate(user2, foreign, input('discarded', 2)), 'SESSION_DISCARDED');
  check((await readState(user2, foreign)).values, late.response_body.values);
  console.log('PASS installed legacy finish/metadata writes, no historical alias, late capture, discard preservation');

  // Data-preserving deactivation: only new API execution is revoked, all facts/legacy APIs survive.
  const beforeDisable = (await admin.query('select * from public.workout_session_feelings order by session_id')).rows;
  await admin.query(await read('supabase/rollbacks/training_feelings_disable.sql'));
  await reject(readState(user2, foreign), '42501');
  await reject(mutate(user2, foreign, input('disabled', 2)), '42501');
  check((await admin.query('select * from public.workout_session_feelings order by session_id')).rows, beforeDisable);
  check((await user2.query('select * from public.mobile_finish_training_session($1,$2::jsonb,$3)', [foreign, JSON.stringify(metadata), 'old-finish'])).rows[0].response_body, legacy.response_body);
  await admin.query('grant execute on function public.mutate_training_feelings_v1(uuid,jsonb),public.read_training_feelings_v1(uuid) to authenticated;');
  check((await readState(user2, foreign)).values, late.response_body.values);
  check((await mutate(user2, foreign, input('late', 1, { fatiguePre: fact(4) }))).response_body, late.response_body);
  console.log(`PASS data-preserving deactivation; ${assertions} real PostgreSQL assertions total`);
} finally {
  await Promise.allSettled(clients.map(client => client.end()));
  if (started) await pg.stop();
  if (!resolve(dir).startsWith(resolve(tmpdir()) + sep)) throw Error('Unsafe test cleanup path');
  await rm(dir, { recursive: true, force: true });
}
