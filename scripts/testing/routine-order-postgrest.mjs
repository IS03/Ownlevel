// Optional real HTTP regression for #334. Called only by the disposable local
// m9 runner; there is no remote DB URL option and no production credentials.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';

export async function verifyRoutineOrderPostgrest({ admin, pgPort, owner, directory, binary }) {
  const listener = createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const httpPort = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  // The old SQL fixture uses legacy JWT GUCs; PostgREST 14 uses the JSON GUC.
  // This is fixture plumbing only, never a change to production Auth.
  await admin.query(`create or replace function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
  $$`);
  const secret = 'local-fixture-only-not-a-production-secret';
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const message = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role: 'authenticated', sub: owner, exp: Math.floor(Date.now() / 1000) + 300 })}`;
  const token = `${message}.${createHmac('sha256', secret).update(message).digest('base64url')}`;
  const config = join(directory, 'postgrest.conf');
  await writeFile(config, `db-uri = "postgresql://postgres:local-test@127.0.0.1:${pgPort}/postgres"
db-schemas = "public"
db-anon-role = "anon"
db-pool = 1
db-channel-enabled = false
server-host = "127.0.0.1"
server-port = ${httpPort}
jwt-secret = "${secret}"
log-level = "crit"
`, { mode: 0o600 });
  // PostgREST environment settings override its config file. Never inherit a
  // remote PGRST_DB_URI (or any other PGRST_* setting) into this local fixture.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PGRST_')));
  const child = spawn(binary, [config], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', spawnError;
  child.on('error', error => { spawnError = error; });
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const request = (rpc, body) => fetch(`http://127.0.0.1:${httpPort}/rpc/${rpc}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(1500),
  });
  const rollbackCount = async () => {
    await admin.query('select pg_stat_clear_snapshot()');
    return Number((await admin.query('select xact_rollback::text from pg_stat_database where datname=current_database()')).rows[0].xact_rollback);
  };
  let before, after, elapsed;
  try {
    let snapshot;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (spawnError) throw spawnError;
      try {
        const response = await request('mobile_training_routines_snapshot', {});
        if (response.ok) { snapshot = await response.json(); break; }
      } catch { /* Local process/cache startup only; no write retries. */ }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(snapshot, `Local PostgREST did not become ready: ${output}`);
    // Drain startup/schema-cache statistics before starting the counter delta.
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal((await request('mobile_training_routines_snapshot', {})).status, 200);
    before = await rollbackCount();
    const started = performance.now();
    // One HTTP request, deliberately stale CAS. On v14.5 + 40001 this times out
    // and keeps rolling transactions back even after the HTTP client aborts.
    const response = await request('mobile_reorder_training_routines', {
      p_routine_ids: [], p_expected_list_version: 0, p_idempotency_key: 'http-stale',
    });
    elapsed = Math.round(performance.now() - started);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { code: 'PT409', message: 'ROUTINE_LIST_CHANGED', details: null, hint: null });
    const fresh = await request('mobile_training_routines_snapshot', {});
    assert.deepEqual(await fresh.json(), snapshot, 'conflict cannot change list or version');
    // Also exercise successful writes/replay through the same real HTTP server.
    const intent = { p_routine_ids: snapshot.routines.filter(r => r.isActive).map(r => r.id).reverse(),
      p_expected_list_version: snapshot.listVersion, p_idempotency_key: 'http-valid' };
    const saved = await request('mobile_reorder_training_routines', intent);
    assert.equal(saved.status, 200);
    const result = await saved.json();
    const replay = await request('mobile_reorder_training_routines', intent);
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), [{ ...result[0], replayed: true }]);
    // PostgreSQL flushes cumulative statistics at intervals when going idle.
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal((await request('mobile_training_routines_snapshot', {})).status, 200);
    after = await rollbackCount();
  } finally {
    // Stop only this fixture's child. SIGKILL also bounds a failing regression
    // against the old v14.5 infinite loop; it never targets an existing service.
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await once(child, 'exit');
    }
  }
  assert.equal(after - before, 1, 'one rejected HTTP write must roll back only once');
  console.log(`PASS actual PostgREST: one stale request → HTTP 409 in ${elapsed} ms, ${after - before} rollback; unchanged CAS snapshot, success + replay`);
}
