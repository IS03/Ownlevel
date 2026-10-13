// Isolated PostgreSQL 17, real functions and two-connection lock tests.
// OWNLEVEL_TEST_MODULES="$TEMP_DIR/node_modules" node scripts/testing/m3-3d-exercise-order.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { bootstrapTrainingPostgres, readTrainingTestFile } from './training-postgres-fixture.mjs';
const modules = process.env.OWNLEVEL_TEST_MODULES;
if (!modules) throw new Error('External PostgreSQL test tooling required');
const { default: EmbeddedPostgres } = await import(pathToFileURL(join(modules, 'embedded-postgres/dist/index.js')));
const directory = await mkdtemp(join(tmpdir(), 'ownlevel-m3-3d-'));
const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const pg = new EmbeddedPostgres({ databaseDir: join(directory, 'db'), port, user: 'postgres', password: 'local-test', persistent: true,
  createPostgresUser: false, onLog: () => {}, onError: () => {}, postgresFlags: ['-h', '127.0.0.1'] });
const clients = [];
const owner = '33500000-0000-4000-8000-000000000001', other = '33500000-0000-4000-8000-000000000002';
const sid = '33500000-0000-4000-8000-000000000301', foreignSid = '33500000-0000-4000-8000-000000000302';
const catalog = [201,202,203].map(id => `33500000-0000-4000-8000-${String(id).padStart(12,'0')}`);
const payload = { is_completed: true, decision: 'increase_reps', decision_note: '', apply_to_routine: false, notes: 'keep payload',
  sets: [{set_number:1,target_reps:8,target_weight_kg:40,target_rir:2,actual_reps:9,actual_weight_kg:42.5,is_completed:true,notes:'keep set'}] };
let sequence = 0, started = false;
const key = () => `order-test:${++sequence}`;
async function connect() { const client = pg.getPgClient(); clients.push(client); await client.connect(); return client; }
async function role(client, user = owner) { await client.query('set role authenticated'); await client.query("select set_config('request.jwt.claim.sub',$1,false)",[user]); }
async function state(client) {
  const version = (await client.query("select to_jsonb(ws)->>'updated_at' as version from public.workout_sessions ws where id=$1",[sid])).rows[0]?.version;
  const rows = (await client.query(`select se.id, se.exercise_order as rank, to_jsonb(se)->>'updated_at' as version,
    to_jsonb(se)-'exercise_order' as preserved, (select jsonb_agg(to_jsonb(s) order by s.set_number) from public.workout_sets s where s.workout_session_exercise_id=se.id) as sets
    from public.workout_session_exercises se where se.workout_session_id=$1 order by se.exercise_order`,[sid])).rows;
  return {version,rows,ids:rows.map(row=>row.id)};
}
async function reset(client) {
  await client.query('reset role'); await client.query('delete from public.workout_sessions where id=$1',[sid]);
  await client.query("insert into public.workout_sessions(id,user_id,day_log_id,status) values($1,$2,'33500000-0000-4000-8000-000000000101','in_progress')",[sid,owner]);
  await role(client);
  for(const id of catalog.slice(0,2)) await client.query('select public.append_workout_exercise($1,$2)',[sid,id]);
  const baseline = await state(client);
  await client.query('select public.save_workout_exercise($1,$2,$3)',[baseline.ids[0],baseline.rows[0].version,JSON.stringify(payload)]);
  const populated = await state(client); assert.equal(populated.version,baseline.version,'autosave must not change structure CAS'); return populated;
}
async function reorder(client, initial, ids = [...initial.ids].reverse(), idempotency = key()) {
  return client.query('select * from public.mobile_reorder_workout_exercises($1,$2,$3,$4)',[sid,ids,initial.version,idempotency]);
}
async function expectError(operation, code, message) {
  await assert.rejects(operation, error => error.code === code && (!message || error.message === message));
}
async function waitForLock(observer,pid) {
  for(let attempt=0;attempt<200;attempt++) {
    if((await observer.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0]?.wait_event_type==='Lock') return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw new Error('Expected PostgreSQL lock wait not observed');
}
try {
  await pg.initialise(); await pg.start(); started=true;
  const setup = await connect(); await bootstrapTrainingPostgres(setup);
  const migration = await readTrainingTestFile('supabase/migrations/20261001010000_active_session_exercise_order.sql');
  await setup.query(migration); await setup.query(migration);
  await setup.query(await readTrainingTestFile('supabase/migrations/20261013231609_active_session_append_empty_sets.sql'));
  for(const user of [owner,other]) await setup.query('insert into auth.users(id) values($1)',[user]);
  await setup.query("insert into public.day_logs(id,user_id,log_date) values('33500000-0000-4000-8000-000000000101',$1,'2026-10-01'),('33500000-0000-4000-8000-000000000102',$2,'2026-10-01')",[owner,other]);
  for(const [index,id] of catalog.entries()) await setup.query("insert into public.exercises(id,user_id,nombre,series_sugeridas,reps_sugeridas,peso_sugerido,rir_sugerido,descanso_min_sugerido_segundos,descanso_max_sugerido_segundos) values($1,$2,$3,1,8,40,2,90,120)",[id,owner,`ORDER EXERCISE ${index}`]);
  await setup.query("insert into public.workout_sessions(id,user_id,day_log_id,status) values($1,$2,'33500000-0000-4000-8000-000000000102','in_progress')",[foreignSid,other]);
  const foreignCatalog='33500000-0000-4000-8000-000000000204';
  await setup.query("insert into public.exercises(id,user_id,nombre,series_sugeridas) values($1,$2,'FOREIGN EXERCISE',1)",[foreignCatalog,other]);
  await role(setup,other);
  const foreignExercise=(await setup.query('select public.append_workout_exercise($1,$2) as id',[foreignSid,foreignCatalog])).rows[0].id;
  const baseline = await reset(setup);
  const requestKey = key(); const reversed = [...baseline.ids].reverse();
  const applied = (await reorder(setup,baseline,reversed,requestKey)).rows[0];
  const after = await state(setup); assert.deepEqual(after.ids,reversed); assert.deepEqual(after.rows.map(row=>row.rank),[1,2]); assert.notEqual(after.version,baseline.version);
  for(const row of after.rows) { const before=baseline.rows.find(before=>before.id===row.id); assert.deepEqual(row.preserved,before.preserved); assert.deepEqual(row.sets,before.sets); }
  assert.deepEqual(applied.response_body.orderedSessionExerciseIds,after.ids); assert.equal(applied.response_body.sessionUpdatedAt,after.version);
  const replay = (await reorder(setup,baseline,reversed,requestKey)).rows[0]; assert.equal(replay.replayed,true); assert.deepEqual(replay.response_body,applied.response_body);
  await expectError(reorder(setup,baseline,baseline.ids,requestKey),'PT409','IDEMPOTENCY_KEY_REUSED');
  await expectError(reorder(setup,baseline),'PT409','SESSION_CHANGED');
  await expectError(reorder(setup,after,[after.ids[0],after.ids[0]]),'22023');
  await expectError(reorder(setup,after,[after.ids[0]]),'22023');
  await expectError(reorder(setup,after,[after.ids[0],foreignExercise]),'22023');
  await role(setup,other); await expectError(reorder(setup,baseline,reversed,requestKey),'P0002','TRAINING_SESSION_NOT_FOUND'); await role(setup);
  await setup.query("update public.workout_sessions set status='completed' where id=$1",[sid]);
  await expectError(reorder(setup,await state(setup)),'P0001','SESSION_CLOSED');
  const replayAfterClosed=(await reorder(setup,baseline,reversed,requestKey)).rows[0]; assert.deepEqual(replayAfterClosed.response_body,applied.response_body);
  console.log('PASS reorder, exact read-back/replay, closed/ownership, duplicate/missing/foreign IDs, stale CAS, full payload/snapshot/version preservation');

  const a=await connect(), b=await connect(); await role(a); await role(b);
  const pid=(await b.query('select pg_backend_pid() as pid')).rows[0].pid;
  async function race(label,first,second,verify) {
    const initial=await reset(setup); await a.query('begin'); const firstResult=await first(a,initial);
    const pending=second(b,initial).then(result=>({result}),error=>({error}));
    await setup.query('reset role'); await waitForLock(setup,pid); await a.query('commit');
    await verify(await pending,initial,firstResult); console.log(`PASS concurrent connections: ${label}`);
  }
  const changed=outcome=>{ assert.equal(outcome.error?.code,'PT409'); assert.equal(outcome.error?.message,'SESSION_CHANGED'); };
  const saved=(client,initial)=>client.query('select public.mobile_save_workout_exercise($1,$2,$3,$4)',[sid,initial.ids[0],initial.rows[0].version,JSON.stringify({...payload,notes:'concurrent save'})]);
  const removed=(client,initial)=>client.query('select public.remove_workout_exercise($1,$2,$3)',[sid,initial.ids[0],initial.rows[0].version]);
  await race('reorder vs reorder',reorder,reorder,changed);
  const concurrentKey=key();
  await race('reorder exact concurrent replay',(client,initial)=>reorder(client,initial,[...initial.ids].reverse(),concurrentKey),
    (client,initial)=>reorder(client,initial,[...initial.ids].reverse(),concurrentKey),(outcome,_initial,first)=>{
      assert.ifError(outcome.error); assert.equal(outcome.result.rows[0].replayed,true); assert.deepEqual(outcome.result.rows[0].response_body,first.rows[0].response_body);
    });
  await race('reorder vs save (exercise CAS survives)',reorder,saved,async outcome=>{assert.ifError(outcome.error);const result=await state(setup);assert.equal(result.rows[1].preserved.notes,'concurrent save');});
  await race('save vs reorder (payload survives)',saved,reorder,async outcome=>{assert.ifError(outcome.error);assert.equal((await state(setup)).rows[1].preserved.notes,'concurrent save');});
  await race('add vs reorder (stale set rejected)',client=>client.query('select public.append_workout_exercise($1,$2)',[sid,catalog[2]]),reorder,async outcome=>{changed(outcome);assert.equal((await state(setup)).rows.length,3);});
  await race('reorder vs add (append after new order)',reorder,client=>client.query('select public.append_workout_exercise($1,$2)',[sid,catalog[2]]),async (outcome,initial)=>{assert.ifError(outcome.error);const result=await state(setup);assert.deepEqual(result.ids.slice(0,2),[...initial.ids].reverse());assert.equal(result.rows.length,3);});
  await race('remove vs reorder (stale set rejected)',removed,reorder,async outcome=>{changed(outcome);assert.equal((await state(setup)).rows.length,1);});
  await race('reorder vs remove (payload CAS survives)',reorder,removed,async (outcome,initial)=>{assert.ifError(outcome.error);assert.deepEqual((await state(setup)).ids,[initial.ids[1]]);});
  await race('cancel vs reorder',client=>client.query('select public.cancel_workout_session($1)',[sid]),reorder,outcome=>{assert.equal(outcome.error?.message,'TRAINING_SESSION_NOT_FOUND');});
  await race('reorder vs cancel',reorder,client=>client.query('select public.cancel_workout_session($1)',[sid]),async outcome=>{assert.ifError(outcome.error);assert.equal((await state(setup)).version,undefined);});
  await race('finish vs reorder',client=>client.query('select public.finish_workout_session($1)',[sid]),reorder,outcome=>{assert.equal(outcome.error?.message,'SESSION_CLOSED');});
  await race('reorder vs finish',reorder,client=>client.query('select public.finish_workout_session($1)',[sid]),async (outcome,initial)=>{assert.ifError(outcome.error);assert.deepEqual((await state(setup)).ids,[...initial.ids].reverse());});
  const empty=await reset(setup); await setup.query('delete from public.workout_session_exercises where workout_session_id=$1',[sid]);
  // Direct maintenance DML is not a product write: all product membership
  // writers use append/remove, which advance the existing parent CAS.
  const emptyResult=(await reorder(setup,{...empty,version:(await state(setup)).version,ids:[]},[])).rows[0]; assert.deepEqual(emptyResult.response_body.orderedSessionExerciseIds,[]);
  await setup.query('reset role');
  const privileges=(await setup.query("select has_function_privilege('anon','public.mobile_reorder_workout_exercises(uuid,uuid[],timestamptz,text)','EXECUTE') as anon,has_function_privilege('authenticated','public.mobile_reorder_workout_exercises(uuid,uuid[],timestamptz,text)','EXECUTE') as authenticated")).rows[0];
  assert.deepEqual(privileges,{anon:false,authenticated:true});
  console.log('PASS M3.3D: repeatable migration, 12 real lock races, no new tables/columns/backfill, no remove/re-add');
} finally {
  await Promise.all(clients.map(client=>client.end().catch(()=>{}))); if(started) await pg.stop(); await rm(directory,{recursive:true,force:true});
}
