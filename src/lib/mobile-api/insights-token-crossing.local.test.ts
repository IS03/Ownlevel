// Disposable local Supabase ONLY: the API must be loopback and the database container disposable. Skipped without the explicit status file.
// Each write is a real PostgREST request under a synthetic user's token.
// Needs the schema of this branch WITH 20261104190000 applied: insights-source-revision.local.test.ts applies it, so run that one first, or apply the file by hand.
// Everything else it creates itself: synthetic Auth users, their profile, sessions, metrics, routines and views, plus the test_hold hook below, removed at the end.
// To see the failure: apply the file as of 567200269112 instead, and run the tests named "de varias filas". They end in 40P01.
// Without the campaign: OWNLEVEL_CROSSING_ROUNDS=3 OWNLEVEL_CROSSING_BIG_ROUNDS=3. The rounds only look for the window; the tests with the hook force it.
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

  describe("la tabla de la segunda pasada", () => {
    it("no se puede tocar: ni con un token, ni sin él, ni con service_role", async () => {
      const owner = await user();
      for (const token of [owner.token, null, status.SERVICE_ROLE_KEY]) {
        for (const reply of [await rest("GET", "insights_source_pending?select=tx", token), await rest("POST", "insights_source_pending", token, { source: "direct", has_old: false, has_new: true, new_user: owner.id }), await rest("DELETE", "insights_source_pending?source=eq.direct", token)]) {
          expect(reply.code).toBe("42501");
        }
      }
      expect((await rest("POST", "rpc/insights_apply_source_change", owner.token, {})).status).not.toBe(200);
      expect(sql(`select r.rolname from pg_roles r where r.rolname in ('anon','authenticated','service_role')
        and (has_table_privilege(r.oid,'public.insights_source_pending','select,insert,update,delete,truncate,references,trigger,maintain') or has_sequence_privilege(r.oid,'public.insights_source_pending_id_seq','usage,select,update'));`)).toBe("");
    }, 60_000);

    it("es unlogged, con RLS y sin políticas, y ninguna publicación la lleva", () => {
      expect(sql(`select string_agg(c.relname||'='||c.relpersistence::text,',' order by c.relname) from pg_class c where c.relname in ('insights_source_pending','insights_source_pending_id_seq','insights_source_pending_once');`)).toBe("insights_source_pending=u,insights_source_pending_id_seq=u,insights_source_pending_once=u");
      expect(sql(`select c.relrowsecurity from pg_class c where c.oid='public.insights_source_pending'::regclass;`)).toBe("t");
      expect(sql(`select count(*) from pg_policy p where p.polrelid='public.insights_source_pending'::regclass;`)).toBe("0");
      expect(sql(`select count(*) from pg_publication_tables p where p.tablename='insights_source_pending';`)).toBe("0");
    });

    it("todo lo diferido corre en la primera vuelta y no escribe fuentes: ningún recheck puede quedar después del contador", () => {
      const functions = sql(`select distinct p.proname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid
        where t.tgdeferrable and c.relnamespace in ('public'::regnamespace,'ownlevel_private'::regnamespace) order by 1;`).split("\n");
      expect(functions).toEqual(["insights_apply_source_change", "insights_source_changed", "unique_key_recheck"]);
      expect(sql(`select count(*) from pg_trigger t join pg_proc p on p.oid=t.tgfoid where p.proname='unique_key_recheck' and t.tgrelid in ('public.progress_views'::regclass,'public.routine_exercises'::regclass,'public.workout_session_exercises'::regclass);`)).toBe("3");
      expect(sql(`select count(*) from pg_trigger t where t.tgname='insights_apply_source_change' and t.tgrelid='public.insights_source_pending'::regclass and t.tginitdeferred;`)).toBe("1");
    });

    const openConnections: Array<() => void> = [];
    afterEach(() => { for (const end of openConnections.splice(0)) end(); });
    /** A real connection. Each step ends at its own barrier; psql goes on after an error, which stays in `errors()`. */
    const connect = () => {
      const name = `crossing_${randomBytes(4).toString("hex")}`;
      const psql = spawn(docker, ["--context", "desktop-linux", "exec", "-i", container!, "psql", "-X", "-U", "postgres", "-d", "postgres", "-q", "-At"], { stdio: "pipe" });
      let out = "", errors = "", barrier = 0;
      psql.stdout.on("data", chunk => { out += chunk; });
      psql.stderr.on("data", chunk => { errors += chunk; });
      psql.stdin.write(`set application_name='${name}'; set lock_timeout='12s';\n`);
      const step = (statement: string) => {
        const mark = `BARRIER_${name}_${++barrier}`;
        psql.stdin.write(`${statement}\n\\echo ${mark}\n`);
        return new Promise<void>((resolve, reject) => {
          const limit = Date.now() + 20_000;
          const check = () => { if (out.includes(mark)) resolve(); else if (Date.now() > limit) reject(Error(`${mark} not reached: ${statement}\n${errors}`)); else setTimeout(check, 25); };
          check();
        });
      };
      const terminate = () => { try { sql(`select pg_terminate_backend(pid) from pg_stat_activity where application_name='${name}';`); } catch { /* Already gone. */ } };
      openConnections.push(() => { psql.kill(); terminate(); });
      /** How many notes this connection sees, its own transaction included. */
      const ownNotes = async () => { const start = out.length; await step(`select 'notes='||count(*) from public.insights_source_pending;`); return Number(/notes=(\d+)/.exec(out.slice(start))?.[1] ?? -1); };
      return { name, step, ownNotes, terminate, errors: () => errors, close: () => { psql.stdin.end(); } };
    };
    const finishedOrWaiting = async (who: { name: string }, step: Promise<void>) => {
      let finished = false;
      void step.then(() => { finished = true; }, () => { finished = true; });
      for (let attempt = 0; attempt < 100; attempt++) {
        if (finished) return "finished";
        if (sql(`select wait_event_type from pg_stat_activity where application_name='${who.name}';`) === "Lock") return "waiting";
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return "neither";
    };
    const asUser = (id: string) => `select set_config('request.jwt.claim.sub','${id}',false);`;
    const committedNotes = () => sql(`select count(*) from public.insights_source_pending;`);
    // A note is written during the commit. This fires the first pass earlier, and only that one, to look at the note from inside.
    const firstPassNow = "set constraints public.insights_source_changed immediate;";
    const seedMetrics = (id: string) => {
      const a = randomUUID(), b = randomUUID();
      sql(`insert into public.user_metrics(id,user_id,name,unit,value_type) values('${a}','${id}','M${a.slice(0, 8)}',null,'decimal'),('${b}','${id}','M${b.slice(0, 8)}',null,'decimal');
        insert into public.daily_metric_values(user_id,metric_id,metric_date,value) values('${id}','${a}','2026-06-10',1),('${id}','${b}','2026-06-10',1);`);
      return { write: (metric: string) => `update public.daily_metric_values set value=value+1 where metric_id='${metric}';`, value: (metric: string) => sql(`select value from public.daily_metric_values where metric_id='${metric}';`), a, b };
    };
    const seedRoutine = (id: string) => {
      const routine = randomUUID(), three = randomUUID(), four = randomUUID(), first = randomUUID(), second = randomUUID();
      sql(`insert into public.routines(id,user_id,nombre) values('${routine}','${id}','R${routine.slice(0, 8)}');
        insert into public.exercises(id,user_id,nombre,weight_mode) values('${three}','${id}','H${three.slice(0, 8)}','Peso total'),('${four}','${id}','F${four.slice(0, 8)}','Peso total');
        insert into public.routine_exercises(id,routine_id,exercise_id,exercise_order) values('${first}','${routine}','${three}',1),('${second}','${routine}','${four}',2);`);
      return { routine, first, second };
    };
    const seedViews = (id: string) => {
      const a = randomUUID(), b = randomUUID();
      sql(`insert into public.progress_views(id,user_id,position,name,definition) values('${a}','${id}',1,'A','{"measure":"x"}'),('${b}','${id}',2,'B','{"measure":"x"}');`);
      return { a, b };
    };

    it("commit: la nota solo existe dentro de su transacción, una por cambio distinto, y se borra al confirmar", async () => {
      const owner = await user(), metrics = seedMetrics(owner.id), before = counter(owner.id), tx = connect();
      await tx.step(`begin; ${firstPassNow} ${metrics.write(metrics.a)} ${metrics.write(metrics.a)} ${metrics.write(metrics.b)}`);
      expect(await tx.ownNotes()).toBe(1);
      expect(committedNotes()).toBe("0");
      await tx.step("commit;");
      expect(tx.errors()).toBe("");
      expect(await tx.ownNotes()).toBe(0);
      expect(committedNotes()).toBe("0");
      expect(counter(owner.id)).toBe(before + 1);
      tx.close();
    }, 60_000);

    it("rollback: sin notas ni contador, y lo siguiente confirma con normalidad", async () => {
      const owner = await user(), metrics = seedMetrics(owner.id), before = counter(owner.id), tx = connect(), value = metrics.value(metrics.a);
      await tx.step(`begin; ${firstPassNow} ${metrics.write(metrics.a)}`);
      expect(await tx.ownNotes()).toBe(1);
      await tx.step("rollback;");
      expect(await tx.ownNotes()).toBe(0);
      expect(committedNotes()).toBe("0");
      expect(metrics.value(metrics.a)).toBe(value);
      expect(counter(owner.id)).toBe(before);
      await tx.step(`begin; ${metrics.write(metrics.a)} commit;`);
      expect(tx.errors()).toBe("");
      expect(counter(owner.id)).toBe(before + 1);
      tx.close();
    }, 60_000);

    it("savepoint: lo deshecho no cuenta, y anotar de nuevo sí", async () => {
      const owner = await user(), metrics = seedMetrics(owner.id), before = counter(owner.id), tx = connect();
      await tx.step(`begin; ${firstPassNow} savepoint s; ${metrics.write(metrics.a)}`);
      expect(await tx.ownNotes()).toBe(1);
      await tx.step("rollback to s;");
      expect(await tx.ownNotes()).toBe(0);
      await tx.step("commit;");
      expect(counter(owner.id)).toBe(before);
      await tx.step(`begin; ${firstPassNow} savepoint s; ${metrics.write(metrics.a)} rollback to s; ${metrics.write(metrics.a)} savepoint t; ${metrics.write(metrics.b)} rollback to t;`);
      expect(await tx.ownNotes()).toBe(1);
      await tx.step("commit;");
      expect(tx.errors()).toBe("");
      expect(counter(owner.id)).toBe(before + 1);
      expect(committedNotes()).toBe("0");
      tx.close();
    }, 60_000);

    it("desconexión antes del commit: sin notas ni contador, y sin dejar ningún bloqueo", async () => {
      const owner = await user(), metrics = seedMetrics(owner.id), before = counter(owner.id), value = metrics.value(metrics.a), tx = connect();
      await tx.step(`begin; ${firstPassNow} ${metrics.write(metrics.a)}`);
      expect(await tx.ownNotes()).toBe(1);
      tx.terminate();
      await until("the connection gone", () => sql(`select count(*) from pg_stat_activity where application_name='${tx.name}';`) === "0");
      expect(committedNotes()).toBe("0");
      expect(metrics.value(metrics.a)).toBe(value);
      expect(counter(owner.id)).toBe(before);
      const next = connect();
      await next.step(`begin; ${metrics.write(metrics.a)} commit;`);
      expect(next.errors()).toBe("");
      expect(counter(owner.id)).toBe(before + 1);
      next.close();
    }, 60_000);

    it("desconexión durante la segunda pasada, esperando el bloqueo: nada queda, ni la escritura", async () => {
      const owner = await user(), metrics = seedMetrics(owner.id), before = counter(owner.id), value = metrics.value(metrics.a);
      const holder = connect(), tx = connect();
      await holder.step(`begin; select pg_advisory_xact_lock(hashtextextended('${owner.id}',367));`);
      await tx.step(`begin; ${metrics.write(metrics.a)}`);
      const committing = tx.step("commit;");
      void committing.catch(() => undefined);
      expect(await finishedOrWaiting(tx, committing)).toBe("waiting");
      tx.terminate();
      await until("the connection gone", () => sql(`select count(*) from pg_stat_activity where application_name='${tx.name}';`) === "0");
      await holder.step("rollback;");
      expect(committedNotes()).toBe("0");
      expect(metrics.value(metrics.a)).toBe(value);
      expect(counter(owner.id)).toBe(before);
      holder.close();
    }, 60_000);

    it("concurrentes con la misma nota: ninguna espera a la otra al anotar, cada una ve la suya y cuentan las dos", async () => {
      const owner = await user(), metrics = seedMetrics(owner.id), before = counter(owner.id), t1 = connect(), t2 = connect();
      await t1.step(`begin; ${firstPassNow} ${metrics.write(metrics.a)}`);
      const write = t2.step(`begin; ${firstPassNow} ${metrics.write(metrics.b)}`);
      expect(await finishedOrWaiting(t2, write)).toBe("finished");
      await write;
      expect(await t1.ownNotes()).toBe(1);
      expect(await t2.ownNotes()).toBe(1);
      await Promise.all([t1.step("commit;"), t2.step("commit;")]);
      expect(t1.errors() + t2.errors()).toBe("");
      expect(committedNotes()).toBe("0");
      expect(counter(owner.id)).toBe(before + 2);
      t1.close(); t2.close();
    }, 60_000);

    // The other deferred constraints, with real commits. The hook is not needed here: an open connection holds a transaction by itself.
    it("orden de rutinas: dos escrituras de producto se ordenan antes del commit, sin ciclo", async () => {
      const owner = await user(), metrics = seedMetrics(owner.id), routine = seedRoutine(owner.id), before = counter(owner.id);
      const t1 = connect(), t2 = connect();
      await t1.step(`${asUser(owner.id)} begin; ${metrics.write(metrics.a)} update public.routine_exercises set exercise_order=5 where id='${routine.first}';`);
      await t2.step(`${asUser(owner.id)} begin; ${metrics.write(metrics.b)}`);
      const insert = t2.step(`update public.routine_exercises set exercise_order=5 where id='${routine.second}';`);
      // Same user and a same-order write: the existing per-user lock makes it wait here, holding nothing of the counter.
      expect(await finishedOrWaiting(t2, insert)).toBe("waiting");
      await t1.step("commit;");
      await insert;
      await t2.step("commit;");
      expect(t1.errors()).toBe("");
      expect(t2.errors()).toContain("routine_exercises_unique_order");
      expect(t2.errors()).not.toContain("deadlock");
      expect(counter(owner.id)).toBe(before + 1); // Only what committed.
      expect(sql(`select exercise_order from public.routine_exercises where id='${routine.first}';`)).toBe("5");
      expect(sql(`select exercise_order from public.routine_exercises where id='${routine.second}';`)).toBe("2");
      t1.close(); t2.close();
    }, 90_000);

    it("orden de rutinas y vistas: un intercambio dentro de la misma transacción convive con el contador", async () => {
      const owner = await user(), metrics = seedMetrics(owner.id), routine = seedRoutine(owner.id), views = seedViews(owner.id), before = counter(owner.id);
      const tx = connect();
      await tx.step(`${asUser(owner.id)} begin; ${metrics.write(metrics.a)}
        update public.routine_exercises set exercise_order=case id when '${routine.first}' then 2 else 1 end where id in ('${routine.first}','${routine.second}');
        update public.progress_views set position=case id when '${views.a}' then 2 else 1 end where id in ('${views.a}','${views.b}');
        ${metrics.write(metrics.b)} commit;`);
      expect(tx.errors()).toBe("");
      expect(counter(owner.id)).toBe(before + 1);
      expect(sql(`select exercise_order from public.routine_exercises where id='${routine.first}';`)).toBe("2");
      expect(sql(`select position from public.progress_views where id='${views.a}';`)).toBe("2");
      tx.close();
    }, 90_000);

    it("mientras una transacción tiene el contador: rutinas y vistas no esperan, y otro commit con fuentes sí", async () => {
      const owner = await user(), metrics = seedMetrics(owner.id), routine = seedRoutine(owner.id), views = seedViews(owner.id), before = counter(owner.id);
      const holding = connect(), routineWriter = connect(), viewWriter = connect(), metricWriter = connect();
      // Firing the deferred triggers now holds the counter's lock exactly as a commit does, with time to act around it.
      await holding.step(`${asUser(owner.id)} begin; ${metrics.write(metrics.a)} set constraints all immediate;`);
      const moving = routineWriter.step(`${asUser(owner.id)} begin; select public.move_routine_exercise('${routine.first}',1); commit;`);
      expect(await finishedOrWaiting(routineWriter, moving)).toBe("finished");
      await moving;
      const reordering = viewWriter.step(`${asUser(owner.id)} begin; select * from ownlevel_private.reorder_progress_views(array['${views.b}','${views.a}']::uuid[],0,'reorder-${randomUUID()}'); commit;`);
      expect(await finishedOrWaiting(viewWriter, reordering)).toBe("finished");
      await reordering;
      expect(routineWriter.errors() + viewWriter.errors()).toBe("");
      expect(sql(`select exercise_order from public.routine_exercises where id='${routine.first}';`)).toBe("2");
      expect(sql(`select position from public.progress_views where id='${views.a}';`)).toBe("2");
      await metricWriter.step(`${asUser(owner.id)} begin; ${metrics.write(metrics.b)}`);
      const committing = metricWriter.step("commit;");
      expect(await finishedOrWaiting(metricWriter, committing)).toBe("waiting");
      await holding.step("commit;");
      await committing;
      expect(holding.errors() + metricWriter.errors()).toBe("");
      expect(counter(owner.id)).toBe(before + 2);
      holding.close(); routineWriter.close(); viewWriter.close(); metricWriter.close();
    }, 90_000);

    // Two transactions cross on the counter and on a same-position recheck. Only the second one to write has a recheck queued, and it runs before the counter.
    it.each(["position", "session"] as const)("cruce con otro recheck pendiente (%s): espera sin tener el contador, y es violación de unicidad", async which => {
      const owner = await user(), metrics = seedMetrics(owner.id);
      const views = which === "position" ? seedViews(owner.id) : null, session = which === "session" ? seedSession(owner.id, "in_progress", "2026-06-11") : null;
      const before = counter(owner.id);
      const first = views ? `insert into public.progress_views(id,user_id,position,name,definition) values('${randomUUID()}','${owner.id}',5,'C','{"measure":"x"}');` : `update public.workout_session_exercises set exercise_order=50 where id='${session!.x1}';`;
      const second = views ? `insert into public.progress_views(id,user_id,position,name,definition) values('${randomUUID()}','${owner.id}',5,'D','{"measure":"x"}');` : `update public.workout_session_exercises set exercise_order=50 where id='${session!.x2}';`;
      const t1 = connect(), t2 = connect();
      // T1 writes the position first and has no recheck queued. T2 finds it in progress, so it has one, after its counter write.
      await t1.step(`begin; ${first} ${metrics.write(metrics.a)}`);
      await t2.step(`begin; ${metrics.write(metrics.b)} ${second}`);
      const t2Commit = t2.step("commit;");
      expect(await finishedOrWaiting(t2, t2Commit)).toBe("waiting");
      await Promise.all([t1.step("commit;"), t2Commit]);
      expect(t1.errors()).toBe("");
      expect(t2.errors()).toContain(views ? "progress_views_position_key" : "workout_session_exercises_unique_order");
      expect(t2.errors()).not.toContain("deadlock");
      const stored = views ? sql(`select count(*) from public.progress_views where user_id='${owner.id}' and position=5;`) : sql(`select count(*) from public.workout_session_exercises where workout_session_id='${session!.session}' and exercise_order=50;`);
      expect(stored).toBe("1");
      expect(counter(owner.id)).toBe(before + 1);
      expect(committedNotes()).toBe("0");
      t1.close(); t2.close();
    }, 90_000);

    it("el mismo cruce de posición sin escrituras en fuentes: espera y violación de unicidad, nunca deadlock", async () => {
      const owner = await user(), before = counter(owner.id);
      const row = (name: string) => `insert into public.progress_views(id,user_id,position,name,definition) values('${randomUUID()}','${owner.id}',5,'${name}','{"measure":"x"}');`;
      const t1 = connect(), t2 = connect();
      await t1.step(`begin; ${row("C")}`);
      await t2.step(`begin; ${row("D")}`);
      const t2Commit = t2.step("commit;");
      expect(await finishedOrWaiting(t2, t2Commit)).toBe("waiting");
      await t1.step("commit;");
      await t2Commit;
      expect(t1.errors()).toBe("");
      expect(t2.errors()).toContain("progress_views_position_key");
      expect(t2.errors()).not.toContain("deadlock");
      expect(counter(owner.id)).toBe(before);
      t1.close(); t2.close();
    }, 90_000);
  });

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
