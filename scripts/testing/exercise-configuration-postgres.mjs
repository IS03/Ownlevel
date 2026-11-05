// Disposable real PostgreSQL only. Never reads a connection URL or production credentials.
// OWNLEVEL_TEST_MODULES=/external/tooling/node_modules node scripts/testing/exercise-configuration-postgres.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { bootstrapTrainingPostgres, readTrainingTestFile as read, trainingSqlFunction } from './training-postgres-fixture.mjs';

if (!process.env.OWNLEVEL_TEST_MODULES) throw Error('Set OWNLEVEL_TEST_MODULES to external embedded-postgres tooling.');
const { default: EmbeddedPostgres } = await import(pathToFileURL(join(process.env.OWNLEVEL_TEST_MODULES, 'embedded-postgres/dist/index.js')));
const MIGRATION = 'supabase/migrations/20261106120000_training_exercise_configuration_expand.sql';
const REVISION = 'supabase/migrations/20261105211040_insights_source_revision_expand.sql';
const dir = await mkdtemp(join(tmpdir(), 'ownlevel-configuration-'));
const listener = createServer(); await new Promise(r => listener.listen(0, '127.0.0.1', r));
const port = listener.address().port; await new Promise(r => listener.close(r));
const pg = new EmbeddedPostgres({ databaseDir: join(dir, 'db'), port, user: 'postgres', password: 'local-synthetic-test',
  persistent: true, createPostgresUser: false, onLog: () => {}, onError: () => {}, postgresFlags: ['-h', '127.0.0.1'] });
const clients = []; let started = false; let assertions = 0;
const id = n => `93671000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = id(1), other = id(2);
const press = id(10), row = id(11), foreignPress = id(12);
// Sessions: A and C completed before B started; B in progress; D completed after B started; F belongs to the other user.
const A = id(20), B = id(21), C = id(22), D = id(23), F = id(24);
const aPress = id(30), bPress = id(31), bRow = id(32), cPress1 = id(33), cPress2 = id(34), dPress = id(35), fPress = id(36), aRow = id(37);
async function connect() { const client = pg.getPgClient(); clients.push(client); await client.connect(); return client; }
const check = (actual, expected) => { assert.deepEqual(actual, expected); assertions++; };
const reject = async (promise, message) => { await assert.rejects(promise, e => e.message === message || e.code === message); assertions++; };
const recorded = (label, source = 'entered', repeatedFrom = null) => ({ kind: 'recorded', label, source, repeatedFrom });
const input = (key, sessionExerciseId, expectedRevision, value, extra = {}) => ({ contractVersion: 'training-exercise-configuration/1', sessionExerciseId, expectedRevision, value, idempotencyKey: key, ...extra });
try {
  await pg.initialise(); await pg.start(); started = true;
  const admin = await connect(), user = await connect(), user2 = await connect();
  await bootstrapTrainingPostgres(admin);
  const editor = await read('supabase/migrations/20260928140340_mobile_routine_editor_start_expand.sql');
  await admin.query(editor.slice(0, editor.indexOf('-- Every Training writer')) + 'commit;');
  await admin.query(trainingSqlFunction(editor, 'bump_training_routine_template_once'));
  await admin.query(await read('supabase/migrations/20261002010000_mobile_training_finish_history_expand.sql'));
  await admin.query(await read('supabase/migrations/20261013233111_active_session_add_to_routine_expand.sql'));
  await admin.query('create role service_role; alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;');
  await admin.query(await read('supabase/migrations/20261104011622_training_feelings_expand.sql'));
  // The other Insights sources, only as far as their triggers need them.
  await admin.query(`create table public.user_metrics(id uuid primary key default gen_random_uuid(), user_id uuid);
    create table public.daily_metric_values(id uuid primary key default gen_random_uuid(), user_id uuid);
    create table public.meal_entries(id uuid primary key default gen_random_uuid(), user_id uuid);`);
  await admin.query(await read(REVISION));
  // Supabase grants every new table to these roles by default: the migration has to take them back.
  await admin.query('alter default privileges in schema public grant all on tables to anon,authenticated,service_role;');
  await admin.query(await read(MIGRATION));

  // The trigger function is the #391 one plus a single branch.
  const fn = (source) => trainingSqlFunction(source, 'insights_source_changed').replace(/\s+/g, ' ');
  const branch = /elsif tg_table_name = 'workout_session_exercise_configurations' then .*? on conflict do nothing; (?=else)/;
  check(fn(await read(MIGRATION)).replace('create or replace function', 'create function').replace(branch, ''), fn(await read(REVISION)));
  const acl = (await admin.query(`select p.proname, prosecdef, has_function_privilege('anon',p.oid,'execute') anon,
    has_function_privilege('authenticated',p.oid,'execute') authenticated, has_function_privilege('public',p.oid,'execute') pub
    from pg_proc p where p.proname in ('read_training_exercise_configurations_v1','mutate_training_exercise_configuration_v1','training_configuration_label') order by 1`)).rows;
  check(acl.map(r => [r.proname, r.prosecdef, r.anon, r.authenticated, r.pub]), [
    ['mutate_training_exercise_configuration_v1', true, false, true, false],
    ['read_training_exercise_configurations_v1', false, false, true, false],
    ['training_configuration_label', false, false, false, false]]);
  const grants = (await admin.query(`select has_table_privilege('authenticated','public.workout_session_exercise_configurations','select') s,
    has_table_privilege('authenticated','public.workout_session_exercise_configurations','insert,update,delete') w,
    has_table_privilege('anon','public.workout_session_exercise_configurations','select') a,
    (select relrowsecurity from pg_class where oid='public.workout_session_exercise_configurations'::regclass) rls`)).rows[0];
  check(grants, { s: true, w: false, a: false, rls: true });

  await admin.query('insert into auth.users(id) values($1),($2)', [owner, other]);
  await admin.query("insert into public.day_logs(user_id,log_date) values($1,'2026-11-01'),($1,'2026-11-03'),($1,'2026-11-05'),($1,'2026-11-06'),($2,'2026-11-06')", [owner, other]);
  await admin.query("insert into public.exercises(id,user_id,nombre,implement,weight_mode) values($1,$3,'SYNTHETIC PRESS','Mancuerna','Peso por lado'),($2,$3,'SYNTHETIC ROW','Polea','Peso total')", [press, row, owner]);
  await admin.query("insert into public.exercises(id,user_id,nombre,implement,weight_mode) values($1,$2,'SYNTHETIC PRESS','Mancuerna','Peso por lado')", [foreignPress, other]);
  const session = (sid, uid, date, status, started, ended) => admin.query(`insert into public.workout_sessions(id,user_id,day_log_id,status,started_at,ended_at)
    select $1,$2,id,$4,$5,$6 from public.day_logs where user_id=$2 and log_date=$3`, [sid, uid, date, 'in_progress', started, null])
    .then(() => status === 'in_progress' ? null : admin.query('update public.workout_sessions set status=$2, ended_at=$3 where id=$1', [sid, status, ended]));
  await session(A, owner, '2026-11-01', 'completed', '2026-11-01T10:00:00Z', '2026-11-01T11:00:00Z');
  await session(C, owner, '2026-11-03', 'completed', '2026-11-03T10:00:00Z', '2026-11-03T11:00:00Z');
  await session(D, owner, '2026-11-05', 'completed', '2026-11-05T10:00:00Z', '2026-11-05T11:00:00Z');
  await session(B, owner, '2026-11-06', 'in_progress', '2026-11-04T10:00:00Z', null);
  await session(F, other, '2026-11-06', 'in_progress', '2026-11-06T10:00:00Z', null);
  const exercise = (seid, sid, uid, xid, order) => admin.query('insert into public.workout_session_exercises(id,user_id,workout_session_id,exercise_id,exercise_order) values($1,$2,$3,$4,$5)', [seid, uid, sid, xid, order]);
  await exercise(aPress, A, owner, press, 1); await exercise(aRow, A, owner, row, 2);
  await exercise(cPress1, C, owner, press, 1); await exercise(cPress2, C, owner, press, 2);
  await exercise(dPress, D, owner, press, 1);
  await exercise(bPress, B, owner, press, 1); await exercise(bRow, B, owner, row, 2);
  await exercise(fPress, F, other, foreignPress, 1);
  for (const client of [user, user2]) { await client.query('set role authenticated'); await client.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]); }
  const mutate = async (client, sid, body) => (await client.query('select * from public.mutate_training_exercise_configuration_v1($1,$2::jsonb)', [sid, JSON.stringify(body)])).rows[0];
  const readState = async (sid = B, client = user) => (await client.query('select public.read_training_exercise_configurations_v1($1) body', [sid])).rows[0].body;
  const item = (state, seid) => state.items.find(entry => entry.sessionExerciseId === seid);
  const revision = async () => Number((await admin.query('select revision from public.insights_source_revisions where user_id=$1', [owner])).rows[0]?.revision ?? 0);

  // Every existing row stays unknown: nothing is backfilled and no "none" is written.
  check((await admin.query('select count(*)::int n from public.workout_session_exercise_configurations')).rows[0].n, 0);
  const state0 = await readState();
  check(state0.contractVersion, 'training-exercise-configuration/1'); check(state0.sessionStatus, 'in_progress');
  check(state0.items.map(entry => [entry.sessionExerciseId, entry.exerciseId, entry.revision, entry.value, entry.previous]),
    [[bPress, press, 0, null, null], [bRow, row, 0, null, null]]);
  await reject(user.query('insert into public.workout_session_exercise_configurations(session_exercise_id,user_id,revision,kind,label,source,updated_at) values($1,$2,1,$3,$4,$5,now())', [bPress, owner, 'recorded', 'x', 'entered']), '42501');
  await reject(user.query('update public.workout_session_exercise_configurations set revision=2'), '42501');
  await reject(user.query('delete from public.workout_session_exercise_configurations'), '42501');
  await user2.query("select set_config('request.jwt.claim.sub','',false)");
  await reject(readState(B, user2), 'UNAUTHORIZED');
  await reject(mutate(user2, B, input('unauth', bPress, 0, null)), 'UNAUTHORIZED');
  await user2.query('set role anon');
  await reject(readState(B, user2), '42501');
  await reject(mutate(user2, B, input('anon', bPress, 0, null)), '42501');
  await user2.query('set role authenticated'); await user2.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
  await reject(readState(B, user2), 'TRAINING_SESSION_NOT_FOUND');
  await reject(mutate(user2, B, input('foreign', bPress, 0, recorded('x'))), 'TRAINING_SESSION_NOT_FOUND');
  await reject(mutate(user, F, input('foreign-session', fPress, 0, recorded('x'))), 'TRAINING_SESSION_NOT_FOUND');
  await reject(mutate(user, B, input('other-exercise', aPress, 0, recorded('x'))), 'SESSION_EXERCISE_NOT_FOUND');
  await user2.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  console.log('PASS unknown by default, RPC-only writes, ownership, anonymous and unauthenticated rejection');

  for (const value of [{}, { kind: 'recorded', label: 'x', source: 'entered' }, recorded(''), recorded('   '), recorded('x'.repeat(81)),
    recorded('a\u0001b'), recorded(3), { kind: 'none', label: null, source: 'entered', repeatedFrom: null },
    { kind: 'not_applicable', label: 'x', source: 'entered', repeatedFrom: null }, recorded('x', 'catalog'),
    recorded('x', 'entered', aPress), recorded('x', 'repeated_previous'), recorded('x', 'repeated_previous', 'nope'),
    { ...recorded('x'), userId: other }, [], 'none'])
    await reject(mutate(user, B, input('invalid', bPress, 0, value)), 'INVALID_CONFIGURATION_INPUT');
  for (const extra of [{ userId: other }, { expectedRevision: -1 }, { expectedRevision: 0.5 }, { contractVersion: 'old' }, { sessionExerciseId: 'x' }, { idempotencyKey: 'a b' }])
    await reject(mutate(user, B, input('invalid', bPress, 0, null, extra)), 'INVALID_CONFIGURATION_INPUT');
  check(await readState(), state0);
  console.log('PASS validation: shape, label, kind, source, provenance and extra keys');

  const updatedAt = async seid => (await admin.query('select updated_at::text t from public.workout_session_exercises where id=$1', [seid])).rows[0].t;
  const before = await updatedAt(bPress), revisionBefore = await revision();
  const first = input('set-1', bPress, 0, recorded('  Agarre \n  neutro  '));
  const r1 = await mutate(user, B, first);
  check(r1.replayed, false);
  check(item(r1.response_body, bPress).value, recorded('Agarre neutro'));
  check(item(r1.response_body, bPress).revision, 1);
  check(item(r1.response_body, bRow).value, null);
  check(await updatedAt(bPress), before); // The set autosave CAS token does not move.
  check(await revision(), revisionBefore); // A workout in progress does not move the Insights counter.
  check((await mutate(user, B, first)).response_body, r1.response_body); // Response lost: same key and body.
  check((await mutate(user, B, first)).replayed, true);
  await reject(mutate(user, B, input('set-1', bPress, 0, recorded('Agarre prono'))), 'IDEMPOTENCY_KEY_REUSED');
  await reject(mutate(user, B, input('stale', bPress, 0, recorded('Agarre prono'))), 'CONFIGURATION_CHANGED');
  check(item((await mutate(user, B, input('same', bPress, 1, recorded('Agarre neutro')))).response_body, bPress).revision, 1);
  // The catalog changes tomorrow: the session keeps what was recorded.
  await admin.query("update public.exercises set implement='Barra', weight_mode='Peso total', notes='otra' where id=$1", [press]);
  check(item(await readState(), bPress).value, recorded('Agarre neutro'));
  const cleared = (await mutate(user, B, input('clear', bPress, 1, null))).response_body;
  check([item(cleared, bPress).revision, item(cleared, bPress).value], [2, null]);
  check((await admin.query('select kind,label,source from public.workout_session_exercise_configurations where session_exercise_id=$1', [bPress])).rows, [{ kind: null, label: null, source: null }]);
  check(item((await mutate(user, B, input('clear-again', bPress, 2, null))).response_body, bPress).revision, 2);
  check(item((await mutate(user, B, input('na', bRow, 0, { kind: 'not_applicable', label: null, source: 'entered', repeatedFrom: null }))).response_body, bRow).value,
    { kind: 'not_applicable', label: null, source: 'entered', repeatedFrom: null });
  // Another user sees nothing, even with a direct SELECT.
  await user2.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
  check((await user2.query('select * from public.workout_session_exercise_configurations')).rows, []);
  await user2.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  console.log('PASS normalized label, exact replay, CAS, same value keeps revision, explicit clear, catalog change, RLS');

  const raced = await Promise.allSettled([
    mutate(user, B, input('race-a', bPress, 2, recorded('Banco 30°'))),
    mutate(user2, B, input('race-b', bPress, 2, recorded('Banco plano'))),
  ]);
  check(raced.filter(x => x.status === 'fulfilled').length, 1);
  check(raced.filter(x => x.status === 'rejected').map(x => x.reason.message), ['CONFIGURATION_CHANGED']);
  console.log('PASS two connections on one revision: one write, one conflict');

  // "Same as last time": the latest completed session that ended before this one started, if it holds a single value.
  const save = async (sid, seid, value, key) => { const state = await readState(sid); return mutate(user, sid, input(key, seid, item(state, seid).revision, value)); };
  await save(A, aPress, recorded('Agarre neutro'), 'a-press');
  await save(A, aRow, recorded('Agarre ancho'), 'a-row');
  await save(D, dPress, recorded('Banco declinado'), 'd-press'); // Ended after B started: never offered to B.
  let previous = item(await readState(), bPress).previous;
  check(previous, { sessionExerciseId: aPress, sessionId: A, endedAt: previous.endedAt, value: { kind: 'recorded', label: 'Agarre neutro' } });
  check(item(await readState(), bRow).previous.value, { kind: 'recorded', label: 'Agarre ancho' });
  await save(C, cPress1, recorded('Agarre neutro'), 'c1');
  await save(C, cPress2, recorded('Agarre prono'), 'c2');
  check(item(await readState(), bPress).previous, null); // C is later than A and holds two different values.
  await save(C, cPress2, recorded('agarre NEUTRO'), 'c2-same');
  check(item(await readState(), bPress).previous.value.kind, 'recorded'); // Case does not make a second value.
  const current = item(await readState(), bPress).revision;
  await reject(mutate(user, B, input('rep-wrong-label', bPress, current, recorded('Agarre prono', 'repeated_previous', aPress))), 'REPEATED_CONFIGURATION_MISMATCH');
  await reject(mutate(user, B, input('rep-later', bPress, current, recorded('Banco declinado', 'repeated_previous', dPress))), 'REPEATED_CONFIGURATION_MISMATCH');
  await reject(mutate(user, B, input('rep-other-exercise', bPress, current, recorded('Agarre ancho', 'repeated_previous', aRow))), 'REPEATED_CONFIGURATION_MISMATCH');
  await reject(mutate(user, B, input('rep-self', bPress, current, recorded('Banco 30°', 'repeated_previous', bPress))), 'REPEATED_CONFIGURATION_MISMATCH');
  await reject(mutate(user, B, input('rep-foreign', bPress, current, recorded('x', 'repeated_previous', fPress))), 'REPEATED_CONFIGURATION_MISMATCH');
  const repeated = item((await mutate(user, B, input('rep', bPress, current, recorded('agarre neutro', 'repeated_previous', aPress)))).response_body, bPress);
  check(repeated.value, recorded('agarre neutro', 'repeated_previous', aPress));
  console.log('PASS previous value: order, ambiguity, case, and checked provenance for "same as last time"');

  // Insights revision: completing the session moves it; later writes on a completed session move it once each.
  const r0 = await revision();
  await admin.query("update public.workout_sessions set status='completed', ended_at='2026-11-06T12:00:00Z' where id=$1", [B]);
  check(await revision(), r0 + 1);
  await save(B, bPress, recorded('Agarre neutro'), 'after-finish');
  check(await revision(), r0 + 2);
  check(item(await readState(), bPress).value, recorded('Agarre neutro'));
  await admin.query('delete from public.workout_session_exercises where id=$1', [bRow]);
  check(await revision(), r0 + 3);
  check((await admin.query('select count(*)::int n from public.workout_session_exercise_configurations where session_exercise_id=$1', [bRow])).rows[0].n, 0);
  // A discarded session keeps its rows and takes no new writes.
  await admin.query("update public.workout_sessions set status='discarded' where id=$1", [D]);
  await reject(save(D, dPress, recorded('otro'), 'discarded'), 'SESSION_DISCARDED');
  check((await admin.query('select label from public.workout_session_exercise_configurations where session_exercise_id=$1', [dPress])).rows, [{ label: 'Banco declinado' }]);
  console.log('PASS Insights counter, cascade with its session exercise, discarded session kept and closed');
  console.log(`exercise-configuration PostgreSQL: ${assertions} assertions passed (PostgreSQL ${(await admin.query('show server_version')).rows[0].server_version})`);
} finally {
  for (const client of clients) await client.end().catch(() => undefined);
  if (started) await pg.stop().catch(() => undefined);
  await rm(dir, { recursive: true, force: true });
}
