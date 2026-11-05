// Disposable local Supabase ONLY: the API must be loopback and the database container disposable. Skipped without the explicit status file.
// Needs the integrated schema. Each write is a real PostgREST request under a synthetic user's token.
// OWNLEVEL_INSIGHTS_LOCAL_STATUS=<status.json> OWNLEVEL_INSIGHTS_LOCAL_DB=<db container> npx vitest run src/lib/mobile-api/insights-token-crossing.local.test.ts
//
// A request is one transaction, so a token cannot hold it open. To cross two of them on demand, a trigger that exists only in this
// disposable database stops the first request after its write and before its commit. It stretches a window that exists anyway:
// it writes nothing and takes no lock the product takes. The test without the hook checks whether the window opens by itself.
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const statusFile = process.env.OWNLEVEL_INSIGHTS_LOCAL_STATUS, container = process.env.OWNLEVEL_INSIGHTS_LOCAL_DB;
const docker = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs/DockerDesktop/resources/bin/docker.exe") : "docker";
const HOLD_KEY = 367367;
const NATURAL_ROUNDS = Number(process.env.OWNLEVEL_CROSSING_ROUNDS ?? 300);
const BIG_ROWS = Number(process.env.OWNLEVEL_CROSSING_BIG_ROWS ?? 4000), BIG_ROUNDS = Number(process.env.OWNLEVEL_CROSSING_BIG_ROUNDS ?? 15), BIG_DELAY_MS = Number(process.env.OWNLEVEL_CROSSING_BIG_DELAY ?? 100);

type Reply = { status: number; code: string | null; rows: unknown[] | null };

describe.runIf(!!statusFile && !!container)("el cruce del contador, con token real", () => {
  let status: { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };
  const sql = (input: string) => {
    const run = spawnSync(docker, ["--context", "desktop-linux", "exec", "-i", container!, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input, encoding: "utf8", maxBuffer: 1 << 26, timeout: 60_000 });
    if (run.status !== 0) throw Error(run.stderr || run.stdout || String(run.error));
    return run.stdout.trim();
  };
  const user = async () => {
    const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const email = `crossing-${randomUUID()}@example.invalid`, password = randomBytes(24).toString("hex");
    const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (made.error) throw made.error;
    const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
    const id = made.data.user.id;
    sql(`insert into public.profiles(user_id) values('${id}') on conflict do nothing;`);
    return { id, token: signed.data.session!.access_token };
  };
  /** The request as any holder of the token can send it. */
  const rest = async (method: string, path: string, token: string | null, body?: unknown): Promise<Reply> => {
    const response = await fetch(`${status.API_URL}/rest/v1/${path}`, { method, signal: AbortSignal.timeout(40_000),
      headers: { apikey: status.ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json", Prefer: "return=representation" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { status: response.status, code: Array.isArray(parsed) ? null : (parsed as { code?: string } | null)?.code ?? null, rows: Array.isArray(parsed) ? parsed : null };
  };
  const counter = (id: string) => Number(sql(`select coalesce((select revision from public.insights_source_revisions where user_id='${id}'),0);`));
  const patchOrder = (token: string | null, row: string, order: number) => rest("PATCH", `workout_session_exercises?id=eq.${row}`, token, { exercise_order: order });
  const orderOf = (row: string) => Number(sql(`select exercise_order from public.workout_session_exercises where id='${row}';`));
  const stamp = (row: string) => sql(`select updated_at from public.workout_session_exercises where id='${row}';`);
  const duplicatedOrders = (session: string) => sql(`select count(*) from (select exercise_order from public.workout_session_exercises where workout_session_id='${session}' group by exercise_order having count(*)>1) d;`);

  const seedSession = (id: string, state: "completed" | "in_progress", date: string, ids: { x1?: string; x2?: string } = {}) => {
    const session = randomUUID(), one = randomUUID(), two = randomUUID(), x1 = ids.x1 ?? randomUUID(), x2 = ids.x2 ?? randomUUID();
    sql(`select set_config('request.jwt.claim.sub','${id}',false);
      insert into public.day_logs(user_id,log_date) values('${id}','${date}') on conflict do nothing;
      insert into public.exercises(id,user_id,nombre,weight_mode) values('${one}','${id}','O${one.slice(0, 8)}','Peso total'),('${two}','${id}','T${two.slice(0, 8)}','Peso total');
      insert into public.workout_sessions(id,user_id,day_log_id,started_at) select '${session}','${id}',l.id,'${date}T18:00:00Z' from public.day_logs l where l.user_id='${id}' and l.log_date='${date}';
      insert into public.workout_session_exercises(id,user_id,workout_session_id,exercise_id,exercise_order) values('${x1}','${id}','${session}','${one}',1),('${x2}','${id}','${session}','${two}',2);
      ${state === "completed" ? `update public.workout_sessions set status='completed',ended_at='${date}T19:00:00Z' where id='${session}';` : ""}`);
    return { session, x1, x2 };
  };
  const holder = () => {
    const psql = spawn(docker, ["--context", "desktop-linux", "exec", "-i", container!, "psql", "-X", "-U", "postgres", "-d", "postgres", "-q", "-At"], { stdio: "pipe" });
    psql.stdin.write(`select pg_advisory_lock(${HOLD_KEY});\n`);
    const held = () => sql(`select count(*) from pg_locks where locktype='advisory' and objid=${HOLD_KEY} and granted;`) === "1";
    return { held, release: () => { psql.stdin.end(); }, kill: () => psql.kill() };
  };
  const holders: Array<() => void> = [];
  afterEach(() => { for (const end of holders.splice(0)) end(); });
  const until = async (what: string, check: () => boolean, limit = 15_000) => {
    const end = Date.now() + limit;
    while (Date.now() < end) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 40)); }
    throw Error(`Never happened: ${what}`);
  };
  const stoppedAtHook = () => sql(`select count(*) from pg_locks where locktype='advisory' and objid=${HOLD_KEY} and not granted;`) === "1";
  const waitingOnTransaction = () => sql(`select count(*) from pg_locks where locktype='transactionid' and not granted;`) === "1";
  const deadlocksLogged = () => { const logs = spawnSync(docker, ["--context", "desktop-linux", "logs", container!], { encoding: "utf8", maxBuffer: 1 << 28 }); return ((logs.stdout ?? "") + (logs.stderr ?? "")).split("deadlock detected").length - 1; };
  /** What the three outcomes look like from outside. */
  const outcome = (reply: Reply) => reply.status === 200 && (reply.rows?.length ?? 0) > 0 ? "committed" : reply.code === "40P01" ? "deadlock" : reply.code === "23505" ? "unique_violation" : reply.status === 200 ? "no_row" : `rejected:${reply.status}:${reply.code}`;

  beforeAll(() => {
    if (!/^supabase_db_ownlevel-receipt-[a-f0-9]{8}$/.test(container!)) throw Error("Refuse a non-disposable container");
    status = JSON.parse(readFileSync(statusFile!, "utf8").replace(/^﻿/, ""));
    if (new URL(status.API_URL).hostname !== "127.0.0.1") throw Error("Loopback API required");
    sql(`create table if not exists public.test_hold_rows(row_id uuid primary key);
      create or replace function public.test_hold_after_write() returns trigger language plpgsql security definer set search_path='' as $$
      begin
        if exists (select 1 from public.test_hold_rows h where h.row_id=new.id) then perform pg_catalog.pg_advisory_xact_lock(${HOLD_KEY}); end if;
        return null;
      end $$;
      drop trigger if exists test_hold on public.workout_session_exercises;
      create trigger test_hold after update on public.workout_session_exercises for each row execute function public.test_hold_after_write();
      drop trigger if exists test_hold on public.progress_views;
      create trigger test_hold after update on public.progress_views for each row execute function public.test_hold_after_write();
      notify pgrst,'reload schema';`);
  });
  afterAll(() => {
    if (!container || !statusFile) return;
    sql(`drop trigger if exists test_hold on public.workout_session_exercises; drop trigger if exists test_hold on public.progress_views;
      drop function if exists public.test_hold_after_write(); drop table if exists public.test_hold_rows; notify pgrst,'reload schema';`);
  });

  /** T1 stops after its write. T2 writes the same order, so it queues a recheck, and commits. Then T1 goes on. */
  const crossExerciseOrder = async (state: "completed" | "in_progress", date: string, releaseAfterMs: number) => {
    const owner = await user(), seed = seedSession(owner.id, state, date), before = counter(owner.id);
    const stamps = { x1: stamp(seed.x1), x2: stamp(seed.x2) };
    sql(`insert into public.test_hold_rows(row_id) values('${seed.x1}');`);
    const lock = holder(); holders.push(lock.kill);
    await until("the hold lock", lock.held);
    const logged = deadlocksLogged();
    const t1 = patchOrder(owner.token, seed.x1, 50);
    await until("T1 stopped after its write", stoppedAtHook);
    const t2 = patchOrder(owner.token, seed.x2, 50);
    await until("T2 waiting for T1 at its recheck", waitingOnTransaction);
    await new Promise(resolve => setTimeout(resolve, releaseAfterMs));
    lock.release();
    const [first, second] = await Promise.all([t1, t2]);
    sql(`delete from public.test_hold_rows where row_id='${seed.x1}';`);
    const committed = [first, second].filter(reply => outcome(reply) === "committed").length;
    return { owner, seed, before, stamps, first, second, committed, logged: deadlocksLogged() - logged, outcomes: [outcome(first), outcome(second)] };
  };
  const checkExactlyOneWon = (run: Awaited<ReturnType<typeof crossExerciseOrder>>, state: "completed" | "in_progress") => {
    const { seed, stamps, first, second, owner, before } = run;
    expect(run.committed).toBe(1);
    expect(orderOf(seed.x1)).toBe(outcome(first) === "committed" ? 50 : 1);
    expect(orderOf(seed.x2)).toBe(outcome(second) === "committed" ? 50 : 2);
    expect(duplicatedOrders(seed.session)).toBe("0");
    // The loser left nothing behind: not its row, not its updated_at, not the counter.
    const loser = outcome(first) === "committed" ? seed.x2 : seed.x1;
    expect(stamp(loser)).toBe(loser === seed.x1 ? stamps.x1 : stamps.x2);
    expect(counter(owner.id)).toBe(before + (state === "completed" ? 1 : 0));
  };

  it("permisos: otro token, ningún token y lo que el dueño sí puede", async () => {
    const owner = await user(), stranger = await user(), seed = seedSession(owner.id, "completed", "2026-07-01");
    const before = counter(owner.id);
    const other = await patchOrder(stranger.token, seed.x1, 50);
    const none = await patchOrder(null, seed.x1, 50);
    console.log("[permissions]", JSON.stringify({ stranger: outcome(other), anonymous: outcome(none) }));
    expect(outcome(other)).toBe("no_row");
    expect(outcome(none)).toBe("no_row");
    expect(orderOf(seed.x1)).toBe(1); expect(counter(owner.id)).toBe(before);
    // The owner is allowed, on a completed session too: nothing in grants, policies or triggers refuses it.
    const own = await patchOrder(owner.token, seed.x1, 60);
    expect(outcome(own)).toBe("committed");
    expect(orderOf(seed.x1)).toBe(60); expect(counter(owner.id)).toBe(before + 1);
    // Without a shared position, two at once simply finish.
    const later = counter(owner.id);
    const both = await Promise.all([patchOrder(owner.token, seed.x1, 70), patchOrder(owner.token, seed.x2, 71)]);
    expect(both.map(outcome)).toEqual(["committed", "committed"]);
    expect(counter(owner.id)).toBe(later + 2);
  }, 60_000);

  it.each([
    ["completed", "2026-07-02", 200],
    ["completed", "2026-07-03", 1500],
    ["in_progress", "2026-07-04", 200],
    ["in_progress", "2026-07-05", 1500],
  ] as const)("exercise_order por PATCH, sesión %s, %s, T1 sigue a los %i ms", async (state, date, release) => {
    const run = await crossExerciseOrder(state, date, release);
    console.log("[crossing]", JSON.stringify({ state, release, outcomes: run.outcomes, statuses: [run.first.status, run.second.status], deadlocksLogged: run.logged, orders: [orderOf(run.seed.x1), orderOf(run.seed.x2)], counter: counter(run.owner.id) - run.before }));
    checkExactlyOneWon(run, state);
  }, 90_000);

  it("exercise_order por PATCH sin gancho: pares reales a la vez, buscando la ventana sola", async () => {
    const owner = await user(), seed = seedSession(owner.id, "completed", "2026-07-06");
    sql(`select count(*) from public.test_hold_rows;`);
    const before = counter(owner.id), logged = deadlocksLogged();
    const tally: Record<string, number> = {};
    let committed = 0;
    const started = Date.now();
    for (let round = 0; round < NATURAL_ROUNDS; round++) {
      const replies = await Promise.all([patchOrder(owner.token, seed.x1, 1000 + round), patchOrder(owner.token, seed.x2, 1000 + round)]);
      for (const reply of replies) { const key = outcome(reply); tally[key] = (tally[key] ?? 0) + 1; if (key === "committed") committed++; }
      expect(replies.filter(reply => outcome(reply) === "committed").length).toBeGreaterThanOrEqual(1);
    }
    const deadlocks = deadlocksLogged() - logged;
    console.log("[natural]", JSON.stringify({ rounds: NATURAL_ROUNDS, tally, deadlocksLogged: deadlocks, ms: Date.now() - started, counter: counter(owner.id) - before }));
    expect(duplicatedOrders(seed.session)).toBe("0");
    expect(counter(owner.id)).toBe(before + committed);
    expect(tally.deadlock ?? 0).toBe(deadlocks);
  }, 590_000);

  it("por qué una sola fila no cruzaba: su recheck va antes que el contador en la cola", () => {
    const triggers = sql(`select t.tgname from pg_trigger t where t.tgrelid='public.workout_session_exercises'::regclass and t.tgdeferrable order by t.tgname collate "C";`).split("\n");
    console.log("[deferred triggers]", JSON.stringify(triggers));
    expect(triggers[0]).toMatch(/^Unique_ConstraintTrigger/);
    expect(triggers).toContain("insights_source_changed");
  });

  /** T1 stops after its write in session B. T2 writes one row of A, which takes the counter, and one of B at the same position, which waits for T1. */
  const crossManyRows = async (date: [string, string], releaseAfterMs: number) => {
    const owner = await user(), head = `00000000-${randomUUID().slice(9)}`, tail = `ffffffff-${randomUUID().slice(9)}`;
    const a = seedSession(owner.id, "completed", date[0], { x1: head }), b = seedSession(owner.id, "completed", date[1], { x2: tail });
    const before = counter(owner.id), logged = deadlocksLogged();
    sql(`insert into public.test_hold_rows(row_id) values('${b.x1}');`);
    const lock = holder(); holders.push(lock.kill);
    await until("the hold lock", lock.held);
    const t1 = patchOrder(owner.token, b.x1, 50);
    await until("T1 stopped after its write", stoppedAtHook);
    const t2 = rest("PATCH", `workout_session_exercises?id=in.(${head},${tail})`, owner.token, { exercise_order: 50 });
    await until("T2 waiting for T1 at its recheck", waitingOnTransaction);
    await new Promise(resolve => setTimeout(resolve, releaseAfterMs));
    lock.release();
    const [first, second] = await Promise.all([t1, t2]);
    sql(`delete from public.test_hold_rows where row_id='${b.x1}';`);
    return { owner, a, b, before, first, second, logged: deadlocksLogged() - logged, head, tail };
  };
  const checkManyRows = (run: Awaited<ReturnType<typeof crossManyRows>>) => {
    const { first, second, a, b, owner, before, head, tail } = run;
    const secondWon = outcome(second) === "committed", firstWon = outcome(first) === "committed";
    expect(Number(firstWon) + Number(secondWon)).toBe(1);
    // The recheck runs before the counter is taken, so T2 waits holding nothing T1 needs: T1 wins, T2 gets the unique violation.
    expect(run.logged).toBe(0);
    expect([outcome(first), outcome(second)]).toEqual(["committed", "unique_violation"]);
    // All of T2 or none of it, and T1 the same.
    expect(orderOf(head)).toBe(secondWon ? 50 : 1);
    expect(orderOf(tail)).toBe(secondWon ? 50 : 2);
    expect(orderOf(b.x1)).toBe(firstWon ? 50 : 1);
    expect(duplicatedOrders(a.session)).toBe("0"); expect(duplicatedOrders(b.session)).toBe("0");
    expect(counter(owner.id)).toBe(before + 1);
  };

  it.each([[["2026-07-07", "2026-07-08"], 200], [["2026-07-09", "2026-07-10"], 1500]] as const)("exercise_order por PATCH de varias filas (%j), T1 sigue a los %i ms", async (dates, release) => {
    const run = await crossManyRows([dates[0], dates[1]], release);
    console.log("[many rows]", JSON.stringify({ release, outcomes: [outcome(run.first), outcome(run.second)], statuses: [run.first.status, run.second.status], deadlocksLogged: run.logged, orders: { t2: [orderOf(run.head), orderOf(run.tail)], t1: orderOf(run.b.x1) }, counter: counter(run.owner.id) - run.before }));
    checkManyRows(run);
  }, 90_000);

  it("exercise_order por PATCH de varias filas sin gancho: la ventana sola", async () => {
    const owner = await user(), head = `00000000-${randomUUID().slice(9)}`, tail = `ffffffff-${randomUUID().slice(9)}`;
    const a = seedSession(owner.id, "completed", "2026-07-11", { x1: head }), b = seedSession(owner.id, "completed", "2026-07-12", { x2: tail });
    const before = counter(owner.id), logged = deadlocksLogged(), tally: Record<string, number> = {};
    let committed = 0;
    const started = Date.now();
    for (let round = 0; round < NATURAL_ROUNDS; round++) {
      const replies = await Promise.all([patchOrder(owner.token, b.x1, 2000 + round), rest("PATCH", `workout_session_exercises?id=in.(${head},${tail})`, owner.token, { exercise_order: 2000 + round })]);
      for (const reply of replies) { const key = outcome(reply); tally[key] = (tally[key] ?? 0) + 1; if (key === "committed") committed++; }
    }
    const deadlocks = deadlocksLogged() - logged;
    console.log("[natural many rows]", JSON.stringify({ rounds: NATURAL_ROUNDS, tally, deadlocksLogged: deadlocks, ms: Date.now() - started, counter: counter(owner.id) - before }));
    expect(duplicatedOrders(a.session)).toBe("0"); expect(duplicatedOrders(b.session)).toBe("0");
    expect(counter(owner.id)).toBe(before + committed);
    expect(deadlocks).toBe(0); expect(tally.deadlock ?? 0).toBe(0);
  }, 590_000);

  // No hook at all: only the token. T1 is slow because of its own size, and T2 arrives while it is still writing.
  it("sin gancho, solo con el token: un PATCH grande da la ventana a uno de varias filas", async () => {
    const owner = await user(), head = `00000000-${randomUUID().slice(9)}`, tail = `ffffffff-${randomUUID().slice(9)}`, shared = randomUUID();
    const a = seedSession(owner.id, "completed", "2026-07-13", { x1: head }), b = seedSession(owner.id, "completed", "2026-07-14", { x2: tail });
    sql(`select set_config('request.jwt.claim.sub','${owner.id}',false);
      insert into public.exercises(id,user_id,nombre,weight_mode) values('${shared}','${owner.id}','B${shared.slice(0, 8)}','Peso total');
      update public.workout_session_exercises set exercise_id='${shared}' where id='${b.x1}';
      with days as (insert into public.day_logs(user_id,log_date) select '${owner.id}',date '1990-01-01'+g from generate_series(0,${BIG_ROWS - 1}) g returning id,log_date),
      sessions as (insert into public.workout_sessions(user_id,day_log_id,started_at,status,ended_at) select '${owner.id}',id,log_date+time '18:00','completed',log_date+time '19:00' from days returning id)
      insert into public.workout_session_exercises(user_id,workout_session_id,exercise_id,exercise_order) select '${owner.id}',id,'${shared}',1 from sessions;`);
    const before = counter(owner.id), logged = deadlocksLogged(), tally: Record<string, number> = {};
    let committed = 0;
    const started = Date.now();
    for (let round = 0; round < BIG_ROUNDS; round++) {
      const big = rest("PATCH", `workout_session_exercises?exercise_id=eq.${shared}&select=id`, owner.token, { exercise_order: 3000 + round });
      await new Promise(resolve => setTimeout(resolve, BIG_DELAY_MS));
      const small = rest("PATCH", `workout_session_exercises?id=in.(${head},${tail})&select=id`, owner.token, { exercise_order: 3000 + round });
      const replies = await Promise.all([big, small]);
      for (const reply of replies) { const key = outcome(reply); tally[key] = (tally[key] ?? 0) + 1; if (key === "committed") committed++; }
    }
    const deadlocks = deadlocksLogged() - logged;
    console.log("[token only]", JSON.stringify({ rows: BIG_ROWS + 1, rounds: BIG_ROUNDS, delayMs: BIG_DELAY_MS, tally, deadlocksLogged: deadlocks, ms: Date.now() - started, counter: counter(owner.id) - before }));
    expect(duplicatedOrders(a.session)).toBe("0"); expect(duplicatedOrders(b.session)).toBe("0");
    expect(counter(owner.id)).toBe(before + committed);
    expect(deadlocks).toBe(0); expect(tally.deadlock ?? 0).toBe(0);
  }, 590_000);

  it("la segunda pasada no deja rastro ni se puede tocar con un token", async () => {
    const owner = await user();
    expect(sql(`select count(*) from public.insights_source_pending;`)).toBe("0");
    for (const reply of [await rest("GET", "insights_source_pending?select=tx", owner.token), await rest("POST", "insights_source_pending", owner.token, { source: "direct", has_old: false, has_new: true, new_user: owner.id })]) {
      expect(reply.status).toBe(403); expect(reply.code).toBe("42501");
    }
    expect((await rest("POST", "rpc/insights_apply_source_change", owner.token, {})).status).not.toBe(200);
  }, 60_000);

  describe("vistas de progreso, con los permisos reales", () => {
    const seedViews = (id: string) => {
      const a = randomUUID(), b = randomUUID();
      sql(`insert into public.progress_views(id,user_id,position,name,definition) values('${a}','${id}',1,'A','{"measure":"x"}'),('${b}','${id}',2,'B','{"measure":"x"}');`);
      return { a, b };
    };
    const positions = (id: string) => sql(`select string_agg(position::text,',' order by position) from public.progress_views where user_id='${id}';`);
    const listVersion = (id: string) => Number(sql(`select coalesce((select version from ownlevel_private.progress_view_lists where user_id='${id}'),0);`));
    const rpc = (token: string, name: string, body: unknown) => rest("POST", `rpc/${name}`, token, body);

    it("escritura directa: la tabla la rechaza por permisos, sin efectos", async () => {
      const owner = await user(), views = seedViews(owner.id), before = counter(owner.id);
      const insert = await rest("POST", "progress_views", owner.token, { user_id: owner.id, position: 5, name: "C", definition: { measure: "x" } });
      const update = await rest("PATCH", `progress_views?id=eq.${views.a}`, owner.token, { position: 5 });
      const remove = await rest("DELETE", `progress_views?id=eq.${views.a}`, owner.token);
      const reads = await rest("GET", `progress_views?id=eq.${views.a}&select=id`, owner.token);
      console.log("[views direct]", JSON.stringify([insert, update, remove].map(reply => [reply.status, reply.code])));
      for (const reply of [insert, update, remove]) { expect(reply.status).toBe(403); expect(reply.code).toBe("42501"); }
      expect(reads.rows).toHaveLength(1);
      expect(positions(owner.id)).toBe("1,2"); expect(counter(owner.id)).toBe(before);
    }, 60_000);

    it("reordenar por la RPC real, cruzado: el segundo espera al inicio y recibe conflicto, sin deadlock", async () => {
      const owner = await user(), views = seedViews(owner.id), before = counter(owner.id), version = listVersion(owner.id), logged = deadlocksLogged();
      sql(`insert into public.test_hold_rows(row_id) values('${views.a}');`);
      const lock = holder(); holders.push(lock.kill);
      await until("the hold lock", lock.held);
      const reorder = (ids: string[]) => rpc(owner.token, "mobile_reorder_progress_views", { p_view_ids: ids, p_expected_list_version: version, p_idempotency_key: `reorder-${randomUUID()}` });
      const t1 = reorder([views.b, views.a]);
      await until("T1 stopped after its write", stoppedAtHook);
      const t2 = reorder([views.b, views.a]);
      await until("T2 waiting at the start", () => sql(`select count(*) from pg_locks where locktype='advisory' and not granted and objid<>${HOLD_KEY};`) === "1");
      lock.release();
      const [first, second] = await Promise.all([t1, t2]);
      sql(`delete from public.test_hold_rows where row_id='${views.a}';`);
      console.log("[views rpc]", JSON.stringify([[first.status, first.code], [second.status, second.code]]));
      expect(first.status).toBe(200);
      expect(second.code).toBe("40001");
      expect(positions(owner.id)).toBe("1,2");
      expect(sql(`select position from public.progress_views where id='${views.a}';`)).toBe("2");
      expect(listVersion(owner.id)).toBe(version + 1);
      expect(counter(owner.id)).toBe(before); // Views are not a source.
      expect(deadlocksLogged() - logged).toBe(0);
    }, 60_000);

    it("ninguna función que escribe vistas escribe fuentes, y todas se ordenan por usuario", () => {
      const rows = sql(`select p.proname, p.prosrc ~* '(insert into|update|delete from)\\s+public\\.(workout_sessions|workout_session_exercises|workout_sets|workout_session_feelings|user_metrics|daily_metric_values|meal_entries|day_logs)\\y', p.prosrc ~* 'lock_progress_views'
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','ownlevel_private') and p.prosrc ~* '(insert into|update|delete from)\\s+public\\.progress_views\\y' order by 1;`).split("\n").map(line => line.split("|"));
      console.log("[views writers]", JSON.stringify(rows));
      expect(rows.length).toBeGreaterThan(0);
      for (const [name, writesSource, locks] of rows) { expect(writesSource, name).toBe("f"); expect(locks, name).toBe("t"); }
    });
  });
});
