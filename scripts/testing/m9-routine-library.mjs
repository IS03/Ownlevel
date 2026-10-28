// Disposable PostgreSQL 17; production SQL and real competing connections.
// npm install --prefix "$TEMP_DIR" --no-save --package-lock=false embedded-postgres@17.10.0-beta.17
// OWNLEVEL_TEST_MODULES="$TEMP_DIR/node_modules" node scripts/testing/m9-routine-library.mjs
// Optional HTTP regression: set OWNLEVEL_POSTGREST_BIN to a local PostgREST binary (tested v14.5).
// No remote URL is accepted; no repository dependencies are added.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readTrainingTestFile as read, trainingSqlFunction as sqlFunction } from './training-postgres-fixture.mjs';

const moduleRoot = process.env.OWNLEVEL_TEST_MODULES;
if (!moduleRoot) throw new Error('Set OWNLEVEL_TEST_MODULES to external test tooling.');
const { default: EmbeddedPostgres } = await import(pathToFileURL(join(moduleRoot, 'embedded-postgres/dist/index.js')));
const directory = await mkdtemp(join(tmpdir(), 'ownlevel-m9-routines-'));
const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const pg = new EmbeddedPostgres({ databaseDir: join(directory, 'db'), port, user: 'postgres', password: 'local-test',
  persistent: true, createPostgresUser: false, onLog: () => {}, onError: () => {}, postgresFlags: ['-h', '127.0.0.1'] });
const clients = [];
let started = false;
async function connect() { const c = pg.getPgClient(); clients.push(c); await c.connect(); return c; }
const owner = '93000000-0000-4000-8000-000000000001';
const sourceId = '93000000-0000-4000-8000-000000000101';
const nextId = '93000000-0000-4000-8000-000000000102';
async function asOwner(c) {
  await c.query('set role authenticated');
  await c.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
}
async function snapshot(c) { return (await c.query('select public.mobile_training_routines_snapshot() as data')).rows[0].data; }
async function duplicate(c, source, key = 'race-copy') {
  return c.query('select * from public.mobile_duplicate_training_routine($1,$2,$3,$4,$5,$6)',
    [sourceId, 'RACE COPY', 'sand', key, source.updated_at, source.template_version]);
}
async function waitForLock(observer, pid) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if ((await observer.query('select wait_event_type from pg_stat_activity where pid=$1', [pid])).rows[0]?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Competing connection did not block on the Training lock');
}
try {
  await pg.initialise(); await pg.start(); started = true;
  const setup = await connect();
  await setup.query(await read('supabase/tests/m3_3b_bootstrap.sql'));
  await setup.query('create role service_role');
  const base = await read('supabase/migrations/20260810112232_training_robust_rebuild.sql');
  const repair = await read('supabase/migrations/20260426_0008_training_repair_converge.sql');
  const editor = await read('supabase/migrations/20260928140340_mobile_routine_editor_start_expand.sql');
  const ledger = await read('supabase/migrations/20260927190000_mobile_training_api_expand.sql');
  await setup.query(sqlFunction(await read('supabase/migrations/0001.sql'), 'set_updated_at'));
  await setup.query(sqlFunction(repair, 'normalize_name'));
  await setup.query(`
    alter table public.routines add column color text, add column updated_at timestamptz not null default now(), add column created_at timestamptz not null default now();
    alter table public.routines drop constraint routines_user_id_fkey;
    alter table public.routines add constraint routines_user_id_fkey foreign key(user_id) references auth.users(id) on delete cascade;
    alter table public.routine_exercises add column created_at timestamptz not null default now();
    drop table public.routine_exercise_sets;
  `);
  // Load the real routine schema, constraints and legacy defaults, not mocks.
  await setup.query(base.slice(0, base.indexOf('-- Sesiones y snapshots')) + 'commit;');
  await setup.query(`
    alter table public.routine_exercise_sets add column target_rir smallint check(target_rir is null or target_rir between 0 and 10);
    alter table public.routine_exercises add constraint routine_exercises_unique_exercise unique(routine_id,exercise_id);
    alter table public.routine_exercises enable row level security;
    create unique index uniq_routines_user_nombre_norm on public.routines(user_id,lower(public.normalize_name(nombre)));
    create trigger tr_routines_updated_at before update on public.routines for each row execute function public.set_updated_at();
  `);
  await setup.query(sqlFunction(repair, 'trg_routines_normalize_nombre'));
  await setup.query('create trigger tr_routines_normalize_nombre before insert or update of nombre on public.routines for each row execute function public.trg_routines_normalize_nombre()');
  await setup.query(base.slice(base.indexOf('alter table public.routine_exercise_sets enable row level security;'), base.indexOf('create or replace function public.start_workout_session')));
  await setup.query(await read('supabase/migrations/20260827013625_routine_color_preset_keys.sql'));
  await setup.query(ledger.slice(0, ledger.indexOf('create function public.mobile_create_training_routine')) + 'commit;');
  await setup.query(sqlFunction(ledger, 'mobile_create_training_routine'));
  await setup.query('revoke all on function public.mobile_create_training_routine(text,text,text) from public,anon; grant execute on function public.mobile_create_training_routine(text,text,text) to authenticated');
  await setup.query(editor);
  // RIR/rest defaults are production functions from the installed editor expand.
  await setup.query('create trigger tr_routine_exercises_apply_exercise_defaults before insert on public.routine_exercises for each row execute function public.routine_exercises_apply_exercise_defaults()');
  const migration = await read('supabase/migrations/20261012230412_mobile_routine_library_expand.sql');
  await setup.query(migration);
  await setup.query(migration);
  const orderDefinition = async () => (await setup.query("select pg_get_functiondef('ownlevel_private.reorder_training_routines(uuid[],bigint,text)'::regprocedure) as body")).rows[0].body;
  const previousOrderDefinition = await orderDefinition();
  const conflictMigration = await read('supabase/migrations/20261028211830_routine_order_conflict_no_retry.sql');
  await setup.query(conflictMigration);
  await setup.query(conflictMigration);
  assert.equal(await orderDefinition(), previousOrderDefinition.replace("errcode = '40001'", "errcode = 'PT409'"),
    'migration changes only the permanent conflict code, preserving identity, locks, CAS and idempotency');
  assert.equal((await setup.query("select pg_get_functiondef('public.mobile_create_training_routine(text,text,text)'::regprocedure) as body")).rows[0].body.split('perform public.lock_training_user_mutations();').length - 1, 1);
  console.log('PASS actual migration + safe DDL reapplication');
  await setup.query(await read('supabase/tests/m9_routine_library.sql'));
  console.log('PASS SQL: ownership, closed ledger/counter, twelve colors, exact templates, null/zero, archived copy, ordering, CAS, replay, rollback, immutable history');

  await setup.query('insert into auth.users(id) values($1)', [owner]);
  await setup.query("insert into public.routines(id,user_id,nombre,routine_order) values($1,$3,'RACE SOURCE',1),($2,$3,'RACE NEXT',2)", [sourceId,nextId,owner]);
  const a = await connect(), b = await connect(); await asOwner(a); await asOwner(b);
  if (process.env.OWNLEVEL_POSTGREST_BIN) {
    const { verifyRoutineOrderPostgrest } = await import('./routine-order-postgrest.mjs');
    await verifyRoutineOrderPostgrest({ admin: setup, pgPort: port, owner, directory, binary: process.env.OWNLEVEL_POSTGREST_BIN });
  }
  const pid = Number((await b.query('select pg_backend_pid() as pid')).rows[0].pid);
  const source = (await a.query('select updated_at::text,template_version from public.routines where id=$1', [sourceId])).rows[0];
  // Same intent on two connections creates exactly one resource.
  await a.query('begin');
  const first = await duplicate(a, source);
  const pending = duplicate(b, source).then(result => ({ result }), error => ({ error }));
  await waitForLock(setup,pid); await a.query('commit');
  const second = await pending; assert.ifError(second.error);
  assert.equal(second.result.rows[0].replayed,true);
  assert.deepEqual(second.result.rows[0].response_body,first.rows[0].response_body);
  console.log('PASS concurrent duplicate: one copy, stable replay');

  async function conflictRace(label, firstWrite, waitingWrite, expected = 'ROUTINE_LIST_CHANGED', expectedCode = 'PT409') {
    const before = await snapshot(a);
    await a.query('begin'); await firstWrite(a,before);
    const waiter = waitingWrite(b,before).then(result => ({ result }), error => ({ error }));
    await waitForLock(setup,pid); await a.query('commit');
    const outcome = await waiter;
    assert.equal(outcome.error?.code,expectedCode); assert.equal(outcome.error?.message,expected);
    console.log(`PASS concurrent ${label}`);
  }
  const reorder = (c,s,key) => c.query('select * from public.mobile_reorder_training_routines($1,$2,$3)',
    [s.routines.filter(r=>r.isActive).map(r=>r.id).reverse(),s.listVersion,key]);
  await conflictRace('reorder vs reorder: second device cannot overwrite',
    (c,s)=>reorder(c,s,'race-order-a'), (c,s)=>reorder(c,s,'race-order-b'));
  await conflictRace('Web archive vs Mobile order: exact membership and version',
    c=>c.query('update public.routines set is_active=false where id=$1',[nextId]), (c,s)=>reorder(c,s,'race-archive'));
  await conflictRace('Web create vs Mobile order: shared lock',
    c=>c.query("insert into public.routines(user_id,nombre) values($1,'RACE NEW')",[owner]), (c,s)=>reorder(c,s,'race-create'));
  await conflictRace('Web rename vs duplicate: source identity CAS',
    c=>c.query("update public.routines set nombre='RACE RENAMED' where id=$1",[sourceId]),
    c=>duplicate(c,source,'race-source-change'), 'ROUTINE_CHANGED', '40001');

  // A read during uncommitted changes sees the old list AND its old version.
  const before = await snapshot(b);
  await a.query('begin'); await a.query('update public.routines set is_active=true where id=$1',[nextId]);
  assert.deepEqual(await snapshot(b),before);
  await a.query('commit');
  const after = await snapshot(b); assert.ok(after.listVersion > before.listVersion);
  assert.equal(after.routines.find(r=>r.id===nextId).isActive,true);
  console.log('PASS consistent read: membership/counts and version share a snapshot');
  if (process.env.OWNLEVEL_RUN_ADVISORS === '1') {
    const { stdout } = await promisify(execFile)('npx', ['--yes', 'supabase', 'db', 'advisors',
      '--db-url', `postgresql://postgres:local-test@127.0.0.1:${port}/postgres?sslmode=disable`,
      '--type', 'security', '--level', 'warn', '--fail-on', 'error'], { maxBuffer: 4 * 1024 * 1024 });
    console.log(stdout.trim());
  }
} finally {
  for (const c of clients) await c.end().catch(()=>{});
  if (started) await pg.stop();
  await rm(directory,{recursive:true,force:true});
}
