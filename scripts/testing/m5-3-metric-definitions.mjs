// Disposable PostgreSQL 17: actual daily metrics schema, Web RPCs, M4.1-3 / M5.2
// value writer and the M5.3 Mobile metric definitions migration. No production data.
// No production fixtures or credentials.
// OWNLEVEL_TEST_MODULES=/tmp/tooling/node_modules node scripts/testing/m5-3-metric-definitions.mjs
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
const modules = process.env.OWNLEVEL_TEST_MODULES;
if (!modules) throw new Error('External embedded-postgres test tooling required');
const { default: EmbeddedPostgres } = await import(pathToFileURL(join(modules, 'embedded-postgres/dist/index.js')));
const directory = await mkdtemp(join(tmpdir(), 'ownlevel-m53-'));
const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const pg = new EmbeddedPostgres({ databaseDir: join(directory, 'db'), port, user: 'postgres', password: 'local-test',
  persistent: true, createPostgresUser: false, onLog: () => {}, onError: () => {}, postgresFlags: ['-h', '127.0.0.1'] });
const clients = []; let started = false; let checks = 0;
async function connect() { const c = pg.getPgClient(); clients.push(c); await c.connect(); return c; }
const file = name => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const id = n => `53000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = id(1), other = id(2), fresh = id(3);
async function role(c, user = owner) { await c.query('set role authenticated'); await c.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); }
async function check(name, run) { await run(); console.log(`PASS ${name}`); checks++; }
try {
  await pg.initialise(); await pg.start(); started = true;
  const admin = await connect(), a = await connect(), b = await connect(), stranger = await connect();
  await admin.query(`create role anon; create role authenticated; create schema auth; create schema extensions;
    create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  for (const name of ['0001.sql', '20260426_0002_phase1_profiles_weight_and_checks.sql', '20260426_0004_phase1_remove_meal_status.sql', '20260813150000_nutrition_schema_foundation.sql']) await admin.query(await file(name));
  await admin.query('create table public.workout_sessions(id uuid primary key,user_id uuid,day_log_id uuid,status text)');
  for (const name of ['20260813163000_nutrition_day_engine.sql', '20260813170000_nutrition_energy_sync.sql', '20260908170000_nutrition_plan_energy_v2.sql', '20260909180000_daily_nutrition_overrides_v2.sql']) await admin.query(await file(name));
  const normalization = await file('20260426_0012_normalize_names_uppercase.sql');
  await admin.query(normalization.slice(normalization.indexOf('create or replace function'), normalization.indexOf('$$;', normalization.indexOf('create or replace function')) + 3));
  await admin.query(await file('20260426_0013_normalize_meals_uppercase.sql'));
  const ledger = await file('20260927190000_mobile_training_api_expand.sql');
  await admin.query(ledger.slice(0, ledger.indexOf('create function public.mobile_create_training_routine')) + 'commit;');
  for (const name of ['20260909155017_configurable_daily_metrics.sql', '20260914104157_r3_atomic_daily_metric_values.sql', '20261003021157_mobile_nutrition_day_read.sql', '20261003040926_mobile_activity_context_writes.sql', '20261004235000_mobile_daily_metrics_integrity.sql', '20261005000000_mobile_metric_definitions.sql']) await admin.query(await file(name));
  await admin.query('insert into auth.users values($1),($2),($3)', [owner, other, fresh]);
  const legacyUser=id(99),legacyClient=await connect();
  await admin.query('insert into auth.users values($1)',[legacyUser]);await role(legacyClient,legacyUser);
  const legacyIntent={operation:'create',metricId:null,expectedUpdatedAt:null,fields:{name:'Antes del EXPAND',valueType:'integer',unit:null,target:null},idempotencyKey:'pre-expand'};
  const beforeExpand=(await legacyClient.query('select * from public.mobile_mutate_metric_definition($1::jsonb)',[JSON.stringify(legacyIntent)])).rows[0];
  await admin.query(await file('20261016180618_metric_presentation_expand.sql'));
  await check('legacy receipt created before EXPAND replays unchanged after migration',async()=>{
    const after=(await legacyClient.query('select * from public.mobile_mutate_metric_definition($1::jsonb)',[JSON.stringify(legacyIntent)])).rows[0];
    assert.equal(after.replayed,true);assert.deepEqual(after.response_body,beforeExpand.response_body);
  });
  await admin.query('grant select,insert,update on public.day_logs,public.meal_entries to authenticated; grant select on public.profiles, public.workout_sessions to authenticated');
  const c = await connect();
  await role(a); await role(b); await role(stranger, other); await role(c, fresh);
  const day = async offset => (await admin.query("select ((statement_timestamp() at time zone 'America/Argentina/Cordoba')::date+$1::int)::text d", [offset])).rows[0].d;
  const today = await day(0), yesterday = await day(-1);
  const read = async (conn = a) => (await conn.query('select public.mobile_read_metric_definitions() r')).rows[0].r.definitions;
  const mutate = async (conn, intent) => (await conn.query('select * from public.mobile_mutate_metric_definition($1::jsonb)', [JSON.stringify(intent)])).rows[0];
  const reorder = async (conn, intent) => (await conn.query('select * from public.mobile_reorder_metric_definitions($1::jsonb)', [JSON.stringify(intent)])).rows[0];
  const values = async (conn, key, dt, changes) => (await conn.query('select * from public.mobile_mutate_nutrition_day($1::jsonb)', [JSON.stringify({ operation: 'metrics', date: dt, idempotencyKey: key, changes })])).rows[0];
  const intent = (operation, key, def = null, fields = null) => ({ operation, metricId: def?.id ?? null, expectedUpdatedAt: def?.updatedAt ?? null, fields, idempotencyKey: key });
  const fields = (name, valueType = 'decimal', unit = 'km', target = null) => ({ name, valueType, unit, target });
  const find = async (pred, conn = a) => (await read(conn)).find(pred);
  const count = async (sql, args) => Number((await admin.query(sql, args)).rows[0].n);
  const activeOrder = async () => (await read()).filter(d => d.isActive).map(d => d.id);

  await check('ensure: an account without metrics gets the 4 system definitions exactly once, also under concurrent reads', async () => {
    assert.equal(await count('select count(*) n from public.user_metrics where user_id=$1', [fresh]), 0);
    const c2 = await connect(); await role(c2, fresh);
    await c.query('begin'); await c.query('select public.mobile_read_metric_definitions()');
    const concurrent = c2.query('select public.mobile_read_metric_definitions() r');
    await new Promise(r => setTimeout(r, 150)); await c.query('commit');
    const late = (await concurrent).rows[0].r.definitions;
    const defs = await read(c);
    assert.deepEqual(defs.map(d => d.systemKey), ['steps', 'water', 'mate', 'sleep']);
    assert.deepEqual(late.map(d => d.systemKey), ['steps', 'water', 'mate', 'sleep']);
    assert.deepEqual(defs.map(d => [d.name, d.unit, d.valueType, d.target === null ? null : Number(d.target)]),
      [['Pasos', 'pasos', 'integer', 10000], ['Agua', 'L', 'decimal', 2.5], ['Mate', 'L', 'decimal', null], ['Sueño', 'min', 'duration', 480]]);
    assert.ok(defs.every(d => d.isActive && d.hasHistory === false && typeof d.updatedAt === 'string'));
    await read(c); await read(c);
    assert.equal(await count('select count(*) n from public.user_metrics where user_id=$1', [fresh]), 4);
    await read(a); await read(stranger);
  });

  let custom;
  await check('create: valid custom metric, double tap / retry replays without duplicates, reused key with other data conflicts', async () => {
    const create = intent('create', 'create-1', null, fields('  Distancia  ', 'decimal', ' km ', 5.25));
    const first = await mutate(a, create), again = await mutate(a, create);
    assert.equal(first.response_status, 200); assert.equal(first.replayed, false);
    assert.equal(again.replayed, true); assert.deepEqual(again.response_body, first.response_body);
    custom = first.response_body.definition;
    assert.deepEqual([custom.name, custom.unit, custom.valueType, Number(custom.target), custom.systemKey, custom.isActive, custom.hasHistory, custom.sortOrder],
      ['Distancia', 'km', 'decimal', 5.25, null, true, false, 4]);
    assert.equal(await count("select count(*) n from public.user_metrics where user_id=$1 and name='Distancia'", [owner]), 1);
    const reused = await mutate(a, intent('create', 'create-1', null, fields('Otra')));
    assert.equal(reused.response_status, 409); assert.equal(reused.response_body.error, 'IDEMPOTENCY_KEY_REUSED');
    const duration = (await mutate(a, intent('create', 'create-2', null, fields('Meditación', 'duration', 'h', 20)))).response_body.definition;
    assert.equal(duration.unit, 'min');
    const blankUnit = (await mutate(a, intent('create', 'create-3', null, fields('Veces', 'integer', '   ', null)))).response_body.definition;
    assert.equal(blankUnit.unit, null);
    for (const bad of [fields(''), fields('x'.repeat(81)), fields('A', 'boolean'), fields('A', 'integer', 'u', 1.5), fields('A', 'decimal', 'u', -1),
      fields('A', 'decimal', 'x'.repeat(17)), { ...fields('A'), userId: other }]) {
      await assert.rejects(mutate(a, intent('create', `bad-${Math.random().toString(36).slice(2)}`, null, bad)), /INVALID_METRIC_DEFINITION/);
    }
    await assert.rejects(mutate(a, { ...intent('create', 'bad-shape', null, fields('A')), userId: other }), /INVALID_METRIC_DEFINITION/);
    // Ownership: the creator is always the token identity.
    assert.equal(await count("select count(*) n from public.user_metrics where user_id=$1 and system_key is null", [other]), 0);
  });

  await check('update: system target only, custom metadata, CAS without overwrite, history keeps type/unit', async () => {
    const steps = await find(d => d.systemKey === 'steps');
    const target = await mutate(a, intent('update', 'upd-1', steps, fields('Pasos', 'integer', 'pasos', 12000)));
    assert.equal(target.response_status, 200); assert.equal(Number(target.response_body.definition.target), 12000);
    const rename = await mutate(a, intent('update', 'upd-2', await find(d => d.systemKey === 'steps'), fields('Caminata', 'integer', 'pasos', 12000)));
    assert.equal(rename.response_status, 409); assert.equal(rename.response_body.error, 'SYSTEM_METRIC_IMMUTABLE');
    const retype = await mutate(a, intent('update', 'upd-3', await find(d => d.systemKey === 'water'), fields('Agua', 'integer', 'L', 2)));
    assert.equal(retype.response_body.error, 'SYSTEM_METRIC_IMMUTABLE');
    assert.equal((await find(d => d.systemKey === 'steps')).name, 'Pasos');
    // Custom without history may change everything.
    const changed = await mutate(a, intent('update', 'upd-4', custom, fields('Distancia corrida', 'integer', 'm', 5000)));
    assert.equal(changed.response_status, 200); custom = changed.response_body.definition;
    assert.deepEqual([custom.name, custom.valueType, custom.unit, Number(custom.target)], ['Distancia corrida', 'integer', 'm', 5000]);
    // CAS: Web changes the target after Mobile opened the definition.
    const opened = custom;
    await b.query('update public.user_metrics set target_value=7000 where id=$1', [custom.id]);
    const stale = await mutate(a, intent('update', 'upd-5', opened, fields('Distancia corrida', 'integer', 'm', 6000)));
    assert.equal(stale.response_status, 409); assert.equal(stale.response_body.error, 'METRIC_CHANGED');
    assert.equal((await mutate(a, intent('update', 'upd-5', opened, fields('Distancia corrida', 'integer', 'm', 6000)))).replayed, true);
    custom = await find(d => d.id === custom.id); assert.equal(Number(custom.target), 7000);
    // Record history, then type/unit are frozen; the old value is not reinterpreted.
    assert.equal((await values(a, 'val-1', yesterday, [{ metricId: custom.id, definitionUpdatedAt: custom.updatedAt, expectedUpdatedAt: null, value: 4200 }])).response_status, 200);
    custom = await find(d => d.id === custom.id); assert.equal(custom.hasHistory, true);
    const meaning = await mutate(a, intent('update', 'upd-6', custom, fields('Distancia corrida', 'decimal', 'km', 6)));
    assert.equal(meaning.response_status, 409); assert.equal(meaning.response_body.error, 'METRIC_HAS_HISTORY');
    assert.equal(meaning.response_body.message, 'Una métrica con historial no puede cambiar de tipo o unidad.');
    const after = await find(d => d.id === custom.id); assert.deepEqual([after.valueType, after.unit], ['integer', 'm']);
    assert.equal(Number((await admin.query('select value from public.daily_metric_values where metric_id=$1', [custom.id])).rows[0].value), 4200);
    // Name and target stay editable with history.
    const named = await mutate(a, intent('update', 'upd-7', custom, fields('Correr', 'integer', 'm', null)));
    assert.equal(named.response_status, 200); custom = named.response_body.definition; assert.equal(custom.target, null); assert.equal(custom.hasHistory, true);
    // Nutrition/Daily Metrics read sees the new definition immediately.
    const snap = (await a.query('select public.mobile_read_nutrition_day($1::date) r', [yesterday])).rows[0].r;
    assert.equal(snap.activity.data.metrics.find(x => x.id === custom.id).label, 'Correr');
  });

  await check('archive: leaves the active list, history stays representable, new values rejected, correction allowed', async () => {
    const r = await mutate(a, intent('archive', 'arch-1', custom));
    assert.equal(r.response_status, 200); custom = r.response_body.definition;
    assert.equal(custom.isActive, false); assert.equal(custom.hasHistory, true);
    assert.ok(!(await activeOrder()).includes(custom.id));
    assert.equal(await count('select count(*) n from public.daily_metric_values where metric_id=$1', [custom.id]), 1);
    const past = (await a.query('select public.mobile_read_nutrition_day($1::date) r', [yesterday])).rows[0].r.activity.data.metrics.find(x => x.id === custom.id);
    assert.deepEqual([past.isActive, Number(past.value)], [false, 4200]);
    const now = (await a.query('select public.mobile_read_nutrition_day($1::date) r', [today])).rows[0].r.activity.data.metrics;
    assert.ok(!now.some(x => x.id === custom.id));
    const fresh = await values(a, 'val-2', today, [{ metricId: custom.id, definitionUpdatedAt: custom.updatedAt, expectedUpdatedAt: null, value: 1 }]);
    assert.equal(fresh.response_body.error, 'METRIC_UNAVAILABLE');
    const v = (await admin.query('select updated_at::text u from public.daily_metric_values where metric_id=$1', [custom.id])).rows[0].u;
    assert.equal((await values(a, 'val-3', yesterday, [{ metricId: custom.id, definitionUpdatedAt: custom.updatedAt, expectedUpdatedAt: v, value: 4300 }])).response_status, 200);
    assert.equal((await mutate(a, intent('archive', 'arch-2', custom))).response_body.error, 'METRIC_CHANGED');
  });

  await check('restore: back to the end of the active list, identity and history kept, CAS', async () => {
    custom = await find(d => d.id === custom.id);
    const stale = { ...custom, updatedAt: '2020-01-01T00:00:00+00:00' };
    assert.equal((await mutate(a, intent('restore', 'rest-0', stale))).response_body.error, 'METRIC_CHANGED');
    const r = await mutate(a, intent('restore', 'rest-1', custom));
    assert.equal(r.response_status, 200); custom = r.response_body.definition;
    const order = await activeOrder();
    assert.equal(order.at(-1), custom.id); assert.equal(custom.hasHistory, true); assert.equal(custom.name, 'Correr');
    assert.equal((await mutate(a, intent('restore', 'rest-2', custom))).response_body.error, 'METRIC_CHANGED');
    const snap = (await a.query('select public.mobile_read_nutrition_day($1::date) r', [today])).rows[0].r.activity.data.metrics;
    assert.equal(snap.at(-1).id, custom.id);
  });

  await check('delete: custom without history only; history and system rejected; ownership; no orphaned facts', async () => {
    const temp = (await mutate(a, intent('create', 'del-c', null, fields('Temporal')))).response_body.definition;
    const r = await mutate(a, intent('delete', 'del-1', temp));
    assert.equal(r.response_status, 200); assert.equal(r.response_body.definition, null);
    assert.equal(await find(d => d.id === temp.id), undefined);
    assert.equal((await mutate(a, intent('delete', 'del-1', temp))).replayed, true);
    assert.equal((await mutate(a, intent('delete', 'del-2', temp))).response_status, 404);
    const hist = await mutate(a, intent('delete', 'del-3', custom));
    assert.equal(hist.response_body.error, 'METRIC_HAS_HISTORY'); assert.equal(hist.response_body.message, 'Esta métrica tiene historial y sólo puede archivarse.');
    const sys = await mutate(a, intent('delete', 'del-4', await find(d => d.systemKey === 'mate')));
    assert.equal(sys.response_body.error, 'SYSTEM_METRIC_PROTECTED');
    const foreign = await find(d => d.systemKey === 'water', stranger);
    const ownCustom = (await mutate(stranger, intent('create', 'del-s', null, fields('Ajena')))).response_body.definition;
    for (const target of [foreign, ownCustom]) {
      const r2 = await mutate(a, intent('delete', `del-x-${target.id}`, target));
      assert.equal(r2.response_status, 404);
      const r3 = await mutate(a, intent('update', `upd-x-${target.id}`, target, fields('Hack')));
      assert.equal(r3.response_status, 404);
    }
    assert.ok(await find(d => d.id === ownCustom.id, stranger));
    assert.ok(!(await read(a)).some(d => d.id === ownCustom.id || d.id === foreign.id));
    assert.equal(await count('select count(*) n from public.daily_metric_values v where not exists(select 1 from public.user_metrics m where m.id=v.metric_id)'), 0);
    // A concurrent first value on a "deletable" metric turns delete into archive-only.
    const racy = (await mutate(a, intent('create', 'del-r', null, fields('Carrera')))).response_body.definition;
    await b.query('begin');
    await b.query('insert into public.daily_metric_values(user_id,metric_id,metric_date,value) values($1,$2,$3,1)', [owner, racy.id, yesterday]);
    const pending = mutate(a, intent('delete', 'del-r2', racy));
    await new Promise(r2 => setTimeout(r2, 150)); await b.query('commit');
    assert.equal((await pending).response_body.error, 'METRIC_HAS_HISTORY');
  });

  await check('reorder: full active list with order CAS, rejects missing/extra/foreign ids and concurrent changes atomically', async () => {
    const before = await activeOrder();
    const reversed = [...before].reverse();
    const ok = await reorder(a, { operation: 'reorder', metricIds: reversed, expectedMetricIds: before, idempotencyKey: 'ord-1' });
    assert.equal(ok.response_status, 200); assert.deepEqual(await activeOrder(), reversed);
    assert.equal((await reorder(a, { operation: 'reorder', metricIds: reversed, expectedMetricIds: before, idempotencyKey: 'ord-1' })).replayed, true);
    const snap = (await a.query('select public.mobile_read_nutrition_day($1::date) r', [today])).rows[0].r.activity.data.metrics.map(x => x.id);
    assert.deepEqual(snap, reversed);
    const sortOrders = async () => (await admin.query('select id, sort_order from public.user_metrics where user_id=$1 order by id', [owner])).rows;
    const frozen = await sortOrders();
    // Stale expected order (another device reordered) → conflict, nothing applied.
    const stale = await reorder(a, { operation: 'reorder', metricIds: before, expectedMetricIds: [reversed[1], reversed[0], ...reversed.slice(2)], idempotencyKey: 'ord-2' });
    assert.equal(stale.response_status, 409); assert.equal(stale.response_body.error, 'METRIC_ORDER_CHANGED');
    // Missing one active id / extra archived id / foreign id.
    const archived = (await read()).find(d => !d.isActive)
      ?? (await mutate(a, intent('archive', 'ord-a', await find(d => d.systemKey === 'mate')))).response_body.definition;
    const now = await activeOrder();
    const missing = now.slice(1);
    assert.equal((await reorder(a, { operation: 'reorder', metricIds: missing, expectedMetricIds: missing, idempotencyKey: 'ord-3' })).response_body.error, 'METRIC_ORDER_CHANGED');
    const extra = [...now, archived.id];
    assert.equal((await reorder(a, { operation: 'reorder', metricIds: extra, expectedMetricIds: extra, idempotencyKey: 'ord-4' })).response_body.error, 'METRIC_ORDER_CHANGED');
    const foreign = [...now.slice(1), (await read(stranger))[0].id];
    assert.equal((await reorder(a, { operation: 'reorder', metricIds: foreign, expectedMetricIds: foreign, idempotencyKey: 'ord-5' })).response_body.error, 'METRIC_ORDER_CHANGED');
    await assert.rejects(reorder(a, { operation: 'reorder', metricIds: now, expectedMetricIds: missing, idempotencyKey: 'ord-6' }), /INVALID_METRIC_ORDER/);
    await assert.rejects(reorder(a, { operation: 'reorder', metricIds: [now[0], now[0]], expectedMetricIds: [now[0], now[0]], idempotencyKey: 'ord-7' }), /INVALID_METRIC_ORDER/);
    // Web archives a metric after Mobile loaded the list → conflict, no partial order.
    const loaded = await activeOrder(); const snapshot = await sortOrders();
    await b.query('update public.user_metrics set is_active=false, archived_at=now() where id=$1', [loaded[0]]);
    const raced = await reorder(a, { operation: 'reorder', metricIds: [...loaded].reverse(), expectedMetricIds: loaded, idempotencyKey: 'ord-8' });
    assert.equal(raced.response_body.error, 'METRIC_ORDER_CHANGED');
    assert.deepEqual((await sortOrders()).map(r => r.sort_order), snapshot.map(r => r.sort_order));
    assert.ok(frozen.length > 0);
    // The other user's order is untouched by all of the above.
    assert.deepEqual((await read(stranger)).filter(d => d.isActive).map(d => d.systemKey).slice(0, 4), ['steps', 'water', 'mate', 'sleep']);
  });

  await check('reads are owner-scoped; anon cannot execute; Web direct paths keep working', async () => {
    const mine = await read(a), theirs = await read(stranger);
    assert.ok(mine.every(d => !theirs.some(t => t.id === d.id)));
    const grants = (await admin.query("select has_function_privilege('anon','public.mobile_mutate_metric_definition(jsonb)','execute') m, has_function_privilege('anon','public.mobile_read_metric_definitions()','execute') r, has_function_privilege('anon','public.mobile_reorder_metric_definitions(jsonb)','execute') o")).rows[0];
    assert.deepEqual(grants, { m: false, r: false, o: false });
    const active = (await read(b)).filter(d => d.isActive).map(d => d.id);
    await b.query('select public.reorder_user_metrics($1::uuid[])', [active]);
    await b.query("insert into public.user_metrics(user_id,name,unit,value_type,sort_order) values($1,'Web','u','decimal',99)", [owner]);
    assert.ok(await find(d => d.name === 'Web'));
  });
  await check('presentation EXPAND: opt-in shape, system edits, legacy writes/receipts and Web preserve presentation', async () => {
    const opt = async conn => (await conn.query('select public.mobile_read_metric_presentations() r')).rows[0].r.definitions;
    const water = await find(d => d.systemKey === 'water');
    const extended = {...fields(water.name,water.valueType,water.unit,water.target),icon:'book',quickValue:0.25};
    const input = intent('update','presentation-water',water,extended);
    const first = await mutate(a,input);
    assert.equal(first.response_status,200); assert.equal(first.response_body.definition.icon,'book');
    assert.equal(Number(first.response_body.definition.quickValue),0.25);
    assert.deepEqual((await mutate(a,input)).response_body,first.response_body);
    assert.ok((await read()).every(d => !Object.hasOwn(d,'icon') && !Object.hasOwn(d,'quickValue')));
    let current = (await opt(a)).find(d => d.id===water.id);
    assert.equal(current.icon,'book'); assert.equal(Number(current.quickValue),0.25);
    const legacy = await mutate(a,intent('update','presentation-old',current,fields(current.name,current.valueType,current.unit,3)));
    assert.equal(legacy.response_status,200); assert.ok(!Object.hasOwn(legacy.response_body.definition,'icon'));
    await b.query('update public.user_metrics set target_value=4 where id=$1',[water.id]);
    current=(await opt(a)).find(d=>d.id===water.id);
    assert.equal(current.icon,'book'); assert.equal(Number(current.quickValue),0.25);
    const rawDay = (await a.query('select public.mobile_read_nutrition_day($1::date) r',[today])).rows[0].r;
    assert.ok(rawDay.activity.data.metrics.every(d=>!Object.hasOwn(d,'icon')&&!Object.hasOwn(d,'quickValue')));
    assert.ok((await opt(stranger)).every(d=>d.id!==water.id));
    assert.equal((await mutate(stranger,intent('update','presentation-foreign',current,extended))).response_status,404);
    assert.equal((await stranger.query('update public.user_metrics set icon=$1 where id=$2 returning id',['heart',water.id])).rows.length,0);
    const security=(await admin.query("select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('mobile_read_metric_presentations','mobile_mutate_metric_definition','mobile_reorder_metric_definitions')")).rows;
    assert.equal(security.length,3); assert.ok(security.every(p=>!p.prosecdef));
    assert.equal((await admin.query("select has_function_privilege('anon','public.mobile_read_metric_presentations()','execute') allowed")).rows[0].allowed,false);
  });
  await check('presentation EXPAND: format-open icons and quick-value rules also enforced by table constraints', async () => {
    for (const [type,value,valid] of [['decimal',0.1234,true],['decimal',0.12345,false],['integer',1,true],['integer',1.5,false],['duration',30,true],['duration',1.5,false],['decimal',0,false],['decimal',-1,false]]) {
      const f={...fields('Porción',type,'u'),icon:'future-icon-key',quickValue:value};
      const input=intent('create',`quick-${type}-${value}`,null,f);
      if(valid) assert.equal((await mutate(a,input)).response_status,200);
      else await assert.rejects(mutate(a,input),/INVALID_METRIC_DEFINITION/);
    }
    for(const icon of ['Water','has space','x'.repeat(33),'bad_underscore']) await assert.rejects(mutate(a,intent('create',`bad-icon-${Math.random()}`,null,{...fields('Ícono'),icon,quickValue:null})),/INVALID_METRIC_DEFINITION/);
    const d=await find(d=>d.name==='Web');
    await assert.rejects(a.query('update public.user_metrics set quick_value=0 where id=$1',[d.id]),/user_metrics_quick_value_domain/);
    await assert.rejects(a.query("update public.user_metrics set icon='NO' where id=$1",[d.id]),/user_metrics_icon_format/);
  });
  console.log(`M5.3 + presentation metric definitions harness: ${checks} checks passed`);
} finally {
  for (const c of clients) await c.end().catch(() => undefined);
  if (started) await pg.stop().catch(() => undefined);
  await rm(directory, { recursive: true, force: true });
}
