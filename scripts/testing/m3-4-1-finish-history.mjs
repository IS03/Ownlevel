// Isolated PostgreSQL 17, real Training functions and two-connection lock tests.
// OWNLEVEL_TEST_MODULES="$TEMP_DIR/node_modules" node scripts/testing/m3-4-1-finish-history.mjs
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
const directory = await mkdtemp(join(tmpdir(), 'ownlevel-m3-4-1-'));
const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const pg = new EmbeddedPostgres({ databaseDir: join(directory, 'db'), port, user: 'postgres', password: 'local-test', persistent: true,
  createPostgresUser: false, onLog: () => {}, onError: () => {}, postgresFlags: ['-h', '127.0.0.1'] });
const clients = [];
const id = n => `34100000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = id(1), other = id(2), ownerDay = id(101), otherDay = id(102);
const pressId = id(201), rowId = id(202), routineId = id(301), routineExerciseId = id(302), otherSid = id(402);
const metadata = { energy_level: 4, performance_level: null, pain_level: 0, notes: 'buena sesión' };
let sequence = 0, started = false;
const key = label => `m341:${label}:${++sequence}`;
async function connect() { const client = pg.getPgClient(); clients.push(client); await client.connect(); return client; }
async function role(client, user = owner) { await client.query('set role authenticated'); await client.query("select set_config('request.jwt.claim.sub',$1,false)", [user || '']); }
async function expectError(operation, code, message) {
  await assert.rejects(operation, error => error.code === code && (!message || error.message === message)
    || assert.fail(`expected ${code}/${message ?? '*'}, got ${error.code}/${error.message}`));
}
async function waitForLock(observer, pid) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if ((await observer.query('select wait_event_type from pg_stat_activity where pid=$1', [pid])).rows[0]?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Expected PostgreSQL lock wait not observed');
}
const finish = (client, sid, idempotency = key('finish'), meta = metadata) =>
  client.query('select * from public.mobile_finish_training_session($1,$2,$3)', [sid, JSON.stringify(meta), idempotency]);
const correct = (client, sid, version, payload, idempotency = key('correct')) =>
  client.query('select * from public.mobile_correct_completed_session($1,$2,$3,$4)', [sid, version, JSON.stringify(payload), idempotency]);
const discard = (client, sid, idempotency = key('discard')) =>
  client.query('select * from public.mobile_discard_completed_session($1,$2)', [sid, idempotency]);
async function routineState(client) {
  await client.query('reset role');
  const exercise = (await client.query('select next_adjustment, next_adjustment_note, notes from public.routine_exercises where id=$1', [routineExerciseId])).rows[0];
  const sets = (await client.query('select id, set_number, target_reps, target_weight_kg from public.routine_exercise_sets where routine_exercise_id=$1 order by set_number', [routineExerciseId])).rows;
  return { exercise, sets };
}
async function sessionRow(client, sid) {
  await client.query('reset role');
  return (await client.query("select status::text, to_jsonb(ws)->>'updated_at' as version, to_jsonb(ws)->>'ended_at' as ended, energy_level, performance_level, pain_level, pain_note, treadmill_minutes, notes from public.workout_sessions ws where id=$1", [sid])).rows[0];
}
async function exercises(client, sid) {
  await client.query('reset role');
  return (await client.query(`select se.id, to_jsonb(se)->>'updated_at' as version, se.nombre_snapshot, se.notes, se.is_completed, se.decision,
    (select jsonb_agg(jsonb_build_object('id',s.id,'set_number',s.set_number,'target_reps',s.target_reps,'target_weight_kg',s.target_weight_kg,
      'actual_reps',s.actual_reps,'actual_weight_kg',s.actual_weight_kg,'is_completed',s.is_completed,'notes',s.notes) order by s.set_number)
      from public.workout_sets s where s.workout_session_exercise_id=se.id) as sets
    from public.workout_session_exercises se where se.workout_session_id=$1 order by se.exercise_order`, [sid])).rows;
}
// One routine-linked exercise with two sets (one completed) + one extra exercise.
async function seed(client, { complete = true } = {}) {
  await client.query('reset role');
  await client.query('delete from public.workout_sessions where user_id=$1', [owner]);
  await client.query("update public.routine_exercises set next_adjustment='maintain', next_adjustment_note=null, notes='routine note' where id=$1", [routineExerciseId]);
  await client.query('delete from public.routine_exercise_sets where routine_exercise_id=$1', [routineExerciseId]);
  await client.query('insert into public.routine_exercise_sets(user_id,routine_exercise_id,set_number,target_reps,target_weight_kg,target_rir) values($1,$2,1,8,40,2),($1,$2,2,8,40,2)', [owner, routineExerciseId]);
  const sid = (await client.query("insert into public.workout_sessions(user_id,day_log_id,routine_id,routine_name_snapshot,status) values($1,$2,$3,'PULL','in_progress') returning id", [owner, ownerDay, routineId])).rows[0].id;
  await role(client);
  for (const exercise of [pressId, rowId]) await client.query('select public.append_workout_exercise($1,$2)', [sid, exercise]);
  const [linked] = await exercises(client, sid);
  await client.query("update public.workout_session_exercises set routine_exercise_id=$1, routine_note_snapshot='routine note' where id=$2", [routineExerciseId, linked.id]);
  await client.query('insert into public.workout_sets(user_id,workout_session_exercise_id,set_number,target_reps,target_weight_kg,target_rir) values($1,$2,2,8,40,2) on conflict do nothing', [owner, linked.id]);
  const [current] = await exercises(client, sid);
  await role(client);
  await client.query('select public.save_workout_exercise($1,$2,$3)', [current.id, current.version, JSON.stringify({
    is_completed: complete, decision: 'increase_weight', decision_note: '', apply_to_routine: true, notes: 'session note',
    sets: [
      { set_number: 1, target_reps: 8, target_weight_kg: 40, target_rir: 2, actual_reps: 9, actual_weight_kg: 42.5, is_completed: complete, notes: 'set one' },
      { set_number: 2, target_reps: 8, target_weight_kg: 40, target_rir: 2, actual_reps: null, actual_weight_kg: null, is_completed: false, notes: null },
    ],
  })]);
  await role(client);
  return sid;
}
async function finished(client) {
  const sid = await seed(client); await role(client);
  const result = (await finish(client, sid)).rows[0];
  return { sid, result };
}
function correctionPayload(rows, overrides = {}) {
  return {
    metadata: { energy_level: 3, performance_level: 2, pain_level: 1, pain_note: 'rodilla', treadmill_minutes: 10.5,
      treadmill_distance_km: 1.2, treadmill_speed_kmh: 7, treadmill_incline_percent: 2, notes: 'corregida', ...overrides.metadata },
    exercises: overrides.exercises ?? [{
      session_exercise_id: rows[0].id, expected_updated_at: rows[0].version, notes: 'nota corregida',
      sets: rows[0].sets.map(set => ({ set_number: set.set_number, actual_reps: set.set_number === 1 ? 10 : set.actual_reps,
        actual_weight_kg: set.actual_weight_kg, notes: set.set_number === 1 ? 'corregida' : set.notes })),
    }],
  };
}
try {
  await pg.initialise(); await pg.start(); started = true;
  const setup = await connect(); await bootstrapTrainingPostgres(setup);
  const corrections = await readTrainingTestFile('supabase/migrations/20260811203000_session_history_corrections.sql');
  for (const name of ['correct_completed_workout_session', 'discard_completed_workout_session']) await setup.query(trainingSqlFunction(corrections, name));
  await setup.query(await readTrainingTestFile('supabase/migrations/20261001010000_active_session_exercise_order.sql'));
  const migration = await readTrainingTestFile('supabase/migrations/20261002010000_mobile_training_finish_history_expand.sql');
  await setup.query(migration); await setup.query(migration);
  // Verify the existing finish/correction/discard contracts against Step 3 EXPAND too.
  if (process.argv.includes('--routine-additions')) await setup.query(await readTrainingTestFile('supabase/migrations/20261013233111_active_session_add_to_routine_expand.sql'));
  for (const user of [owner, other]) await setup.query('insert into auth.users(id) values($1)', [user]);
  await setup.query("insert into public.day_logs(id,user_id,log_date) values($1,$2,'2026-10-01'),($3,$4,'2026-10-01')", [ownerDay, owner, otherDay, other]);
  await setup.query("insert into public.exercises(id,user_id,nombre,series_sugeridas,reps_sugeridas,peso_sugerido,rir_sugerido) values($1,$3,'PRESS',1,8,40,2),($2,$3,'ROW',1,8,40,2)", [pressId, rowId, owner]);
  await setup.query("insert into public.routines(id,user_id,nombre) values($1,$2,'PULL')", [routineId, owner]);
  await setup.query("insert into public.routine_exercises(id,routine_id,exercise_id,exercise_order,notes) values($1,$2,$3,1,'routine note')", [routineExerciseId, routineId, pressId]);
  await setup.query("insert into public.workout_sessions(id,user_id,day_log_id,status) values($1,$2,$3,'in_progress')", [otherSid, other, otherDay]);

  // FINISH ------------------------------------------------------------------
  {
    const sid = await seed(setup); const before = await exercises(setup, sid); await role(setup);
    const requestKey = key('finish');
    const first = (await finish(setup, sid, requestKey)).rows[0];
    const row = await sessionRow(setup, sid); const routine = await routineState(setup);
    assert.equal(first.response_status, 200); assert.equal(first.replayed, false);
    assert.equal(row.status, 'completed');
    assert.deepEqual([row.energy_level, row.performance_level, row.pain_level, row.notes, row.pain_note, row.treadmill_minutes], [4, null, 0, 'buena sesión', null, null], 'null != 0 and absent fields stay null');
    assert.deepEqual(first.response_body, {
      status: 'finished', sessionId: sid, sessionStatus: 'completed', name: 'PULL', routineId, logDate: '2026-10-01',
      startedAt: first.response_body.startedAt, endedAt: first.response_body.endedAt, sessionUpdatedAt: row.version,
      metadata: { energyLevel: 4, performanceLevel: null, painLevel: 0, notes: 'buena sesión' },
      exerciseCount: 2, completedExerciseCount: 1, completedSetCount: 1,
    });
    assert.ok(Date.parse(first.response_body.endedAt) >= Date.parse(first.response_body.startedAt));
    assert.equal(routine.exercise.next_adjustment, 'increase_weight', 'progression applied');
    assert.equal(routine.exercise.notes, 'session note', 'routine note propagated');
    assert.deepEqual(routine.sets.map(set => [set.set_number, set.target_reps, Number(set.target_weight_kg)]), [[1, 9, 42.5]], 'apply_to_routine replaced targets');
    await role(setup);
    const replay = (await finish(setup, sid, requestKey)).rows[0];
    assert.equal(replay.replayed, true); assert.deepEqual(replay.response_body, first.response_body);
    assert.deepEqual(await routineState(setup), routine, 'replay never re-executes progression (same routine set ids)');
    assert.equal((await sessionRow(setup, sid)).ended, row.ended);
    await role(setup);
    await expectError(finish(setup, sid, requestKey, { ...metadata, notes: 'otra' }), 'PT409', 'IDEMPOTENCY_KEY_REUSED');
    await expectError(finish(setup, sid), 'P0001', 'SESSION_CLOSED');
    await role(setup, other); await expectError(finish(setup, sid, key('foreign')), 'P0002', 'TRAINING_SESSION_NOT_FOUND');
    await role(setup, ''); await expectError(finish(setup, sid, key('anon')), 'P0001', 'UNAUTHORIZED');
    await role(setup); await expectError(finish(setup, otherSid), 'P0002', 'TRAINING_SESSION_NOT_FOUND');
    assert.deepEqual((await exercises(setup, sid)).map(row => [row.nombre_snapshot, row.sets.map(set => [set.target_reps, Number(set.target_weight_kg)])]),
      before.map(row => [row.nombre_snapshot, row.sets.map(set => [set.target_reps, Number(set.target_weight_kg)])]), 'snapshots/targets untouched');
    console.log('PASS finish: success, server truth response, null != 0, progression once, exact replay, key reuse, closed, ownership, unauthorized');
  }
  {
    const sid = await seed(setup, { complete: false }); await role(setup); const requestKey = key('finish-empty');
    await expectError(finish(setup, sid, requestKey), 'P0001', 'NO_COMPLETED_SETS');
    assert.equal((await sessionRow(setup, sid)).status, 'in_progress');
    assert.equal((await setup.query('select count(*)::int as count from public.mobile_idempotency_keys where idempotency_key=$1', [requestKey])).rows[0].count, 0, 'failed attempt leaves no ledger row');
    await role(setup);
    for (const invalid of [{ ...metadata, pain_note: 'x' }, { energy_level: 4, performance_level: null, pain_level: 0 }, { ...metadata, energy_level: '4' }, []])
      await expectError(finish(setup, sid, key('invalid'), invalid), '22023');
    await expectError(finish(setup, sid, key('fraction'), { ...metadata, energy_level: 3.5 }), '22023');
    console.log('PASS finish: no completed sets (stable code, no partial effect, no stuck key), strict metadata shape');
  }

  // CORRECTION --------------------------------------------------------------
  {
    const { sid } = await finished(setup); const routine = await routineState(setup);
    const rows = await exercises(setup, sid); const version = (await sessionRow(setup, sid)).version;
    const payload = correctionPayload(rows); const requestKey = key('correct');
    await role(setup); const first = (await correct(setup, sid, version, payload, requestKey)).rows[0];
    const after = await exercises(setup, sid); const row = await sessionRow(setup, sid);
    assert.equal(first.replayed, false); assert.equal(first.response_body.status, 'corrected');
    assert.equal(first.response_body.sessionUpdatedAt, row.version); assert.notEqual(row.version, version);
    assert.deepEqual(first.response_body.metadata, { energyLevel: 3, performanceLevel: 2, painLevel: 1, painNote: 'rodilla', treadmillMinutes: 10.5,
      treadmillDistanceKm: 1.2, treadmillSpeedKmh: 7, treadmillInclinePercent: 2, notes: 'corregida' });
    assert.equal(after[0].notes, 'nota corregida'); assert.equal(after[0].sets[0].actual_reps, 10); assert.equal(after[0].sets[0].notes, 'corregida');
    assert.deepEqual(first.response_body.exercises.map(exercise => [exercise.id, exercise.updatedAt]), after.map(exercise => [exercise.id, exercise.version]));
    assert.deepEqual(first.response_body.exercises[0].sets[0], { setNumber: 1, actualReps: 10, actualWeightKg: 42.5, notes: 'corregida' });
    assert.deepEqual(after.map(exercise => [exercise.nombre_snapshot, exercise.is_completed, exercise.decision, exercise.sets.map(set => [set.id, set.set_number, set.target_reps, Number(set.target_weight_kg), set.is_completed])]),
      rows.map(exercise => [exercise.nombre_snapshot, exercise.is_completed, exercise.decision, exercise.sets.map(set => [set.id, set.set_number, set.target_reps, Number(set.target_weight_kg), set.is_completed])]),
      'snapshots, targets, set ids and completion preserved');
    assert.equal(row.status, 'completed');
    assert.deepEqual(await routineState(setup), routine, 'correction never re-runs progression');
    await role(setup);
    const replay = (await correct(setup, sid, version, payload, requestKey)).rows[0];
    assert.equal(replay.replayed, true); assert.deepEqual(replay.response_body, first.response_body, 'retry after success replays instead of hitting the advanced CAS');
    await expectError(correct(setup, sid, version, correctionPayload(rows, { metadata: { notes: 'otra' } }), requestKey), 'PT409', 'IDEMPOTENCY_KEY_REUSED');
    await expectError(correct(setup, sid, version, payload), 'PT409', 'SESSION_CHANGED');
    const fresh = await exercises(setup, sid); const freshVersion = (await sessionRow(setup, sid)).version; await role(setup);
    await expectError(correct(setup, sid, freshVersion, correctionPayload(rows)), 'PT409', 'SESSION_EXERCISE_CHANGED');
    const freshPayload = correctionPayload(fresh);
    const missingSet = { ...freshPayload, exercises: [{ ...freshPayload.exercises[0], sets: freshPayload.exercises[0].sets.slice(0, 1) }] };
    const extraSet = { ...freshPayload, exercises: [{ ...freshPayload.exercises[0], sets: [...freshPayload.exercises[0].sets, { set_number: 3, actual_reps: 1, actual_weight_kg: 1, notes: null }] }] };
    const renumbered = { ...freshPayload, exercises: [{ ...freshPayload.exercises[0], sets: freshPayload.exercises[0].sets.map(set => ({ ...set, set_number: set.set_number + 1 })) }] };
    const duplicated = { ...freshPayload, exercises: [freshPayload.exercises[0], freshPayload.exercises[0]] };
    const foreign = { ...freshPayload, exercises: [{ ...freshPayload.exercises[0], session_exercise_id: id(999) }] };
    const missingMetadata = { ...freshPayload, metadata: { ...freshPayload.metadata, treadmill_minutes: undefined } };
    const completionChange = { ...freshPayload, exercises: [{ ...freshPayload.exercises[0], sets: freshPayload.exercises[0].sets.map(set => ({ ...set, is_completed: false })) }] };
    for (const invalid of [missingSet, extraSet, renumbered, duplicated, foreign, missingMetadata, completionChange])
      await expectError(correct(setup, sid, freshVersion, invalid), '22023');
    const partial = { ...freshPayload, exercises: [] };
    const metadataOnly = (await correct(setup, sid, freshVersion, partial)).rows[0];
    assert.equal(metadataOnly.response_body.exercises.length, 2, 'metadata-only correction still returns every exercise version');
    await role(setup, other); await expectError(correct(setup, sid, freshVersion, freshPayload, key('foreign')), 'P0002', 'TRAINING_SESSION_NOT_FOUND');
    await role(setup);
    const active = await seed(setup); const activeRows = await exercises(setup, active); const activeVersion = (await sessionRow(setup, active)).version; await role(setup);
    await expectError(correct(setup, active, activeVersion, correctionPayload(activeRows)), 'P0001', 'SESSION_NOT_COMPLETED');
    console.log('PASS correction: valid, snapshots/completion/progression preserved, CAS session+exercise, exact replay, retry after success, key reuse, set count/number, duplicate/foreign, ownership, active');
  }
  {
    const { sid } = await finished(setup); const rows = await exercises(setup, sid); const version = (await sessionRow(setup, sid)).version;
    await role(setup); await discard(setup, sid);
    await expectError(correct(setup, sid, version, correctionPayload(rows)), 'P0001', 'SESSION_DISCARDED');
    console.log('PASS correction: discarded session');
  }

  // DISCARD -----------------------------------------------------------------
  {
    const { sid } = await finished(setup); const routine = await routineState(setup); const requestKey = key('discard');
    await role(setup); const first = (await discard(setup, sid, requestKey)).rows[0]; const row = await sessionRow(setup, sid);
    assert.equal(row.status, 'discarded'); assert.deepEqual(first.response_body, { status: 'discarded', sessionId: sid, sessionUpdatedAt: row.version });
    assert.deepEqual(await routineState(setup), routine, 'no progression rollback');
    await role(setup); const replay = (await discard(setup, sid, requestKey)).rows[0];
    assert.equal(replay.replayed, true); assert.deepEqual(replay.response_body, first.response_body);
    await expectError(discard(setup, sid), 'P0001', 'SESSION_DISCARDED');
    await role(setup, other); await expectError(discard(setup, sid, key('foreign')), 'P0002', 'TRAINING_SESSION_NOT_FOUND');
    await role(setup); const active = await seed(setup); await role(setup);
    await expectError(discard(setup, active), 'P0001', 'SESSION_NOT_COMPLETED');
    await setup.query('reset role');
    const privileges = (await setup.query(`select
      bool_or(has_function_privilege('anon', fn, 'EXECUTE')) as anon, bool_and(has_function_privilege('authenticated', fn, 'EXECUTE')) as authenticated
      from unnest(array['public.mobile_finish_training_session(uuid,jsonb,text)','public.mobile_correct_completed_session(uuid,timestamptz,jsonb,text)','public.mobile_discard_completed_session(uuid,text)']) as fn`)).rows[0];
    assert.deepEqual(privileges, { anon: false, authenticated: true });
    console.log('PASS discard: success, no routine rollback, exact replay, already discarded, ownership, active, privileges');
  }

  // CONCURRENCY (two real connections, first transaction holds the user lock) --
  const a = await connect(), b = await connect(); await role(a); await role(b);
  const pid = (await b.query('select pg_backend_pid() as pid')).rows[0].pid;
  async function race(label, prepare, first, second, verify) {
    const context = await prepare(); await role(a); await role(b);
    await a.query('begin'); const firstResult = await first(a, context);
    const pending = second(b, context).then(result => ({ result }), error => ({ error }));
    await setup.query('reset role'); await waitForLock(setup, pid); await a.query('commit');
    await verify(await pending, context, firstResult); console.log(`PASS concurrent connections: ${label}`);
  }
  const active = async () => { const sid = await seed(setup); return { sid, rows: await exercises(setup, sid) }; };
  const sameKey = () => key('same');
  let shared;
  await race('finish vs finish (same key → exact replay)', async () => { shared = sameKey(); return active(); },
    (client, { sid }) => finish(client, sid, shared), (client, { sid }) => finish(client, sid, shared),
    async (outcome, _context, first) => { assert.ifError(outcome.error); assert.equal(outcome.result.rows[0].replayed, true); assert.deepEqual(outcome.result.rows[0].response_body, first.rows[0].response_body); });
  await race('finish vs finish (different keys → SESSION_CLOSED, progression once)', active,
    (client, { sid }) => finish(client, sid), (client, { sid }) => finish(client, sid),
    async outcome => { assert.equal(outcome.error?.message, 'SESSION_CLOSED'); assert.equal((await routineState(setup)).sets.length, 1); });
  await race('finish vs cancel', active, (client, { sid }) => finish(client, sid), (client, { sid }) => client.query('select public.cancel_workout_session($1)', [sid]),
    async (outcome, { sid }) => { assert.equal(outcome.error?.message, 'SESSION_CLOSED'); assert.equal((await sessionRow(setup, sid)).status, 'completed'); });
  await race('cancel vs finish', active, (client, { sid }) => client.query('select public.cancel_workout_session($1)', [sid]), (client, { sid }) => finish(client, sid),
    async (outcome, { sid }) => { assert.equal(outcome.error?.message, 'TRAINING_SESSION_NOT_FOUND'); assert.equal(await sessionRow(setup, sid), undefined); });
  const save = (client, { sid, rows }, notes) => client.query('select public.mobile_save_workout_exercise($1,$2,$3,$4)', [sid, rows[0].id, rows[0].version, JSON.stringify({
    is_completed: true, decision: 'increase_reps', decision_note: '', apply_to_routine: false, notes,
    sets: rows[0].sets.map(set => ({ set_number: set.set_number, target_reps: set.target_reps, target_weight_kg: set.target_weight_kg === null ? null : Number(set.target_weight_kg), target_rir: 2,
      actual_reps: set.actual_reps ?? 8, actual_weight_kg: set.actual_weight_kg === null ? 40 : Number(set.actual_weight_kg), is_completed: true, notes: set.notes })) })]);
  await race('save vs finish (finish closes the saved server truth)', active, (client, context) => save(client, context, 'saved before finish'), (client, { sid }) => finish(client, sid),
    async outcome => { assert.ifError(outcome.error); assert.equal(outcome.result.rows[0].response_body.completedSetCount, 2);
      const routine = await routineState(setup); assert.equal(routine.exercise.next_adjustment, 'increase_reps'); assert.equal(routine.exercise.notes, 'saved before finish'); });
  await race('finish vs save (late autosave rejected)', active, (client, { sid }) => finish(client, sid), (client, context) => save(client, context, 'too late'),
    async (outcome, { sid }) => { assert.equal(outcome.error?.message, 'SESSION_CLOSED'); assert.equal((await exercises(setup, sid))[0].notes, 'session note'); });
  await race('finish vs add', active, (client, { sid }) => finish(client, sid), (client, { sid }) => client.query('select public.append_workout_exercise($1,$2)', [sid, rowId]),
    outcome => assert.equal(outcome.error?.message, 'SESSION_CLOSED'));
  await race('finish vs remove', active, (client, { sid }) => finish(client, sid), (client, { sid, rows }) => client.query('select public.remove_workout_exercise($1,$2,$3)', [sid, rows[1].id, rows[1].version]),
    outcome => assert.equal(outcome.error?.message, 'SESSION_CLOSED'));
  await race('finish vs reorder', active, (client, { sid }) => finish(client, sid), async (client, { sid, rows }) => {
    const version = (await client.query("select to_jsonb(ws)->>'updated_at' as v from public.workout_sessions ws where id=$1", [sid])).rows[0]?.v;
    return client.query('select * from public.mobile_reorder_workout_exercises($1,$2,$3,$4)', [sid, [rows[1].id, rows[0].id], version, key('order')]);
  }, outcome => assert.match(outcome.error?.message ?? '', /SESSION_CLOSED|SESSION_CHANGED/));
  const completed = async () => { const { sid } = await finished(setup); return { sid, rows: await exercises(setup, sid), version: (await sessionRow(setup, sid)).version }; };
  await race('discard vs discard (same key → exact replay)', async () => { shared = sameKey(); return completed(); },
    (client, { sid }) => discard(client, sid, shared), (client, { sid }) => discard(client, sid, shared),
    (outcome, _context, first) => { assert.ifError(outcome.error); assert.equal(outcome.result.rows[0].replayed, true); assert.deepEqual(outcome.result.rows[0].response_body, first.rows[0].response_body); });
  await race('discard vs discard (different keys)', completed, (client, { sid }) => discard(client, sid), (client, { sid }) => discard(client, sid),
    outcome => assert.equal(outcome.error?.message, 'SESSION_DISCARDED'));
  await race('discard vs correction', completed, (client, { sid }) => discard(client, sid), (client, { sid, rows, version }) => correct(client, sid, version, correctionPayload(rows)),
    outcome => assert.equal(outcome.error?.message, 'SESSION_DISCARDED'));
  await race('correction vs correction (stale CAS)', completed, (client, { sid, rows, version }) => correct(client, sid, version, correctionPayload(rows)),
    (client, { sid, rows, version }) => correct(client, sid, version, correctionPayload(rows, { metadata: { notes: 'second' } })),
    async (outcome, { sid }) => { assert.equal(outcome.error?.message, 'SESSION_CHANGED'); assert.equal((await sessionRow(setup, sid)).notes, 'corregida'); });
  await race('correction vs discard', completed, (client, { sid, rows, version }) => correct(client, sid, version, correctionPayload(rows)), (client, { sid }) => discard(client, sid),
    async (outcome, { sid }) => { assert.ifError(outcome.error); const row = await sessionRow(setup, sid); assert.equal(row.status, 'discarded'); assert.equal(row.notes, 'corregida'); });
  console.log('PASS M3.4-1: repeatable additive migration, wrappers reuse domain RPCs, 14 real lock races');
} finally {
  await Promise.all(clients.map(client => client.end().catch(() => {}))); if (started) await pg.stop(); await rm(directory, { recursive: true, force: true });
}
