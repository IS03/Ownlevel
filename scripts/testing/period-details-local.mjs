// Creates ONLY a fresh, loopback-only disposable stack. No status files, existing tokens or remote URLs are read.
// node scripts/testing/period-details-local.mjs
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(import.meta.dirname, '../..');
const feelingsOnly = process.argv.length === 3 && process.argv[2] === '--feelings-only';
assert.ok(process.argv.length === 2 || feelingsOnly, 'Only --feelings-only is supported');
const task = `ownlevel-period-${randomUUID().slice(0, 8)}`;
const db = `${task}-db`, rest = `${task}-rest`;
const auth = `${task}-auth-migrations`;
const label = 'ownlevel.period-details-test';
const postgresImage = 'public.ecr.aws/supabase/postgres:17.6.1.105';
const restImage = 'public.ecr.aws/supabase/postgrest:v16.5';
const authImage = 'public.ecr.aws/supabase/gotrue:v2.197.0';
const password = 'ownlevel-synthetic-local-only';
const created = [];
let networkCreated = false;
function docker(args, input) {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 16 << 20, timeout: 120_000 });
  if (r.status !== 0) throw Error(r.stderr || r.stdout || String(r.error));
  return r.stdout.trim();
}
const sql = (input, user = 'postgres') => docker(['exec', '-i', db, 'psql', '-X', '-h', '127.0.0.1', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], input);
try {
  // Do not follow a TCP/SSH Docker context to somebody else's machine.
  const endpoint = docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
  assert.match(endpoint, /^(npipe:|unix:\/\/)/, 'Local Docker engine required');
  docker(['network', 'create', '--label', `${label}=${task}`, task]); networkCreated = true;
  created.push(db);
  docker(['run', '-d', '--name', db, '--label', `${label}=${task}`, '--network', task,
    '--tmpfs', '/var/lib/postgresql/data', '-e', `POSTGRES_PASSWORD=${password}`, postgresImage]);
  for (let n = 0; ; n++) {
    try { if (sql('select 1') === '1') break; } catch { /* still starting */ }
    if (n === 59) throw Error('Disposable PostgreSQL did not become ready');
    await delay(500);
  }
  // GoTrue supplies its canonical auth tables; no server, login or JWT is used by these reader tests.
  sql(`alter role supabase_auth_admin password '${password}';`, 'supabase_admin');
  created.push(auth);
  docker(['run', '--rm', '--name', auth, '--label', `${label}=${task}`, '--network', task, '-e', 'GOTRUE_DB_DRIVER=postgres',
    '-e', `GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${password}@${db}:5432/postgres?search_path=auth`,
    '-e', 'GOTRUE_JWT_SECRET=ownlevel-synthetic-secret-never-used-for-tokens',
    '-e', 'API_EXTERNAL_URL=http://127.0.0.1', '-e', 'GOTRUE_SITE_URL=http://127.0.0.1', authImage, 'gotrue', 'migrate']);
  assert.equal(sql("select to_regclass('public.profiles') is null"), 't', 'Refuse an initialized product schema');
  const migrations = readdirSync(resolve(root, 'supabase/migrations')).filter(n => n.endsWith('.sql')).sort();
  for (const name of migrations) {
    try { sql(readFileSync(resolve(root, 'supabase/migrations', name), 'utf8')); }
    catch (error) { throw Error(`Migration ${name}: ${error.message}`); }
  }
  // Local test transport only: substitute a whitelisted synthetic identity BEFORE RLS, never a privileged reader role.
  sql(`create schema ownlevel_period_test;
    grant usage on schema ownlevel_period_test to authenticated;
    create function ownlevel_period_test.identity() returns void language plpgsql security invoker set search_path='' as $$
    declare who text := current_setting('request.headers',true)::jsonb->>'x-ownlevel-test-user';
    begin
      if current_user <> 'authenticated' then raise exception 'NON_RLS_TEST_ROLE'; end if;
      if who not in ('93670421-0000-4000-8000-000000000001','93670421-0000-4000-8000-000000000002') or who is null then raise exception 'SYNTHETIC_IDENTITY_REQUIRED'; end if;
      perform set_config('request.jwt.claims',json_build_object('sub',who,'role','authenticated')::text,true);
      perform set_config('request.jwt.claim.sub',who,true);
      perform set_config('request.jwt.claim.role','authenticated',true);
      perform public.ownlevel_restrict_oauth_data_api();
    end $$;
    revoke all on function ownlevel_period_test.identity() from public;
    grant execute on function ownlevel_period_test.identity() to authenticated;
    alter role authenticator login password '${password}';
    -- The project's in-database pre-request setting takes precedence over an environment variable.
    -- Chain the real guard after assigning the synthetic fixture identity in this isolated database only.
    alter role authenticator set pgrst.db_pre_request='ownlevel_period_test.identity';`, 'supabase_admin');
  created.push(rest);
  docker(['run', '-d', '--name', rest, '--label', `${label}=${task}`, '--network', task, '-p', '127.0.0.1::3000',
    '-e', `PGRST_DB_URI=postgres://authenticator:${password}@${db}:5432/postgres`, '-e', 'PGRST_DB_SCHEMAS=public',
    '-e', 'PGRST_DB_ANON_ROLE=authenticated', '-e', 'PGRST_DB_PRE_REQUEST=ownlevel_period_test.identity',
    '-e', 'PGRST_DB_MAX_ROWS=1000', restImage]);
  const port = docker(['port', rest, '3000/tcp']).match(/^127\.0\.0\.1:(\d+)$/)?.[1];
  assert.ok(port, 'Loopback port required');
  const url = `http://127.0.0.1:${port}`;
  for (let n = 0; ; n++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(1000) }); if (r.status === 400 || r.ok) break; } catch { /* still starting */ }
    if (n === 59) throw Error('Disposable PostgREST did not become ready');
    await delay(500);
  }
  console.log(JSON.stringify({ stack: task, postgres: sql('show server_version'), postgrest: docker(['exec', rest, 'postgrest', '--version']), migrations: migrations.length, lastMigration: migrations.at(-1), url, maxRows: 1000 }));
  const exitCode = await new Promise((done, reject) => {
    const child = spawn(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', 'src/lib/mobile-api/performance-insights-period-details.local.test.ts', ...(feelingsOnly ? ['-t', 'resolves every nested feeling/set join'] : [])], {
      cwd: root, stdio: 'inherit', env: { ...process.env, OWNLEVEL_PERIOD_LOCAL_DB: db, OWNLEVEL_PERIOD_LOCAL_URL: url, OWNLEVEL_PERIOD_LOCAL_TASK: task },
    });
    child.once('error', reject); child.once('exit', code => done(code ?? 1));
  });
  if (exitCode !== 0) process.exitCode = exitCode;
} catch (error) {
  if (created.includes(rest)) {
    try {
      console.error(docker(['inspect', '--format', '{{.State.Status}} {{json .NetworkSettings.Ports}}', rest]));
      console.error(docker(['logs', '--tail', '10', rest]));
    } catch { /* A failed docker run may not have created the named container. Preserve the original error. */ }
  }
  throw error;
} finally {
  // Only these freshly-created names, with this run's label. Never prune, reset or enumerate/delete existing databases.
  for (const name of created.reverse()) {
    const inspected = spawnSync('docker', ['inspect', '--format', `{{index .Config.Labels "${label}"}}`, name], { encoding: 'utf8' });
    if (inspected.status !== 0 && /No such (object|container)/i.test(inspected.stderr)) continue; // --rm helper or a failed start
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.equal(inspected.stdout.trim(), task);
    docker(['rm', '-f', '-v', name]);
  }
  if (networkCreated) {
    assert.equal(docker(['network', 'inspect', '--format', `{{index .Labels "${label}"}}`, task]), task);
    docker(['network', 'rm', task]);
  }
  console.log(`Removed only disposable stack ${task}`);
}
