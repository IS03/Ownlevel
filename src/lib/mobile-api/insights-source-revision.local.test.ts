// Disposable local Supabase ONLY: the API must be loopback and the database container disposable. Skipped without the explicit status file.
// OWNLEVEL_INSIGHTS_LOCAL_STATUS=<status.json> OWNLEVEL_INSIGHTS_LOCAL_DB=<db container> npx vitest run src/lib/mobile-api/insights-source-revision.local.test.ts
// Needs a schema WITHOUT the migration: it measures a write before applying it, and applies it itself.
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const statusFile = process.env.OWNLEVEL_INSIGHTS_LOCAL_STATUS, container = process.env.OWNLEVEL_INSIGHTS_LOCAL_DB;
const docker = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs/DockerDesktop/resources/bin/docker.exe") : "docker";
const DAY = "2026-05-01";

describe.runIf(!!statusFile && !!container)("revisión transaccional de las fuentes de Insights", () => {
  let admin: SupabaseClient, sql: (input: string) => string;
  let signIn: () => Promise<{ client: SupabaseClient; id: string }>;
  let owner: { client: SupabaseClient; id: string }, anonymous: SupabaseClient;
  const timings: Record<string, number> = {};

  const revision = async (who = owner) => {
    const { data, error } = await who.client.from("insights_source_revisions").select("revision").eq("user_id", who.id).maybeSingle();
    if (error) throw error;
    return Number(data?.revision ?? 0);
  };
  const moved = async (write: () => unknown | Promise<unknown>, who = owner) => { const before = await revision(who); await write(); return (await revision(who)) - before; };
  /** A transaction held open, as a slow request would. */
  const open = (statement: string) => {
    const psql = spawn(docker, ["--context", "desktop-linux", "exec", "-i", container!, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], { stdio: ["pipe", "ignore", "ignore"] });
    const closed = new Promise<number | null>(resolve => psql.on("close", resolve));
    psql.stdin.write(`begin;\n${statement}\n`);
    return { end: async (last: "commit" | "rollback" = "commit") => { psql.stdin.end(`${last};\n`); return closed; } };
  };
  const settle = () => new Promise(resolve => setTimeout(resolve, 1500));
  // A failed assertion must not leave a lock behind for the next test.
  const openConnections: Array<() => void> = [];
  afterEach(() => { for (const end of openConnections.splice(0)) end(); });
  /** A real connection. Each step ends at its own barrier, and neither a lock nor a step can hang past a bounded timeout. */
  const connect = () => {
    const name = `revision_${randomBytes(4).toString("hex")}`;
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
        const check = () => { if (out.includes(mark)) resolve(); else if (Date.now() > limit) reject(Error(`${mark} not reached: ${statement}\n${errors}`)); else setTimeout(check, 20); };
        check();
      });
    };
    const close = () => { psql.stdin.end(); };
    openConnections.push(() => { psql.kill(); sql(`select pg_terminate_backend(pid) from pg_stat_activity where application_name='${name}';`); });
    return { name, step, errors: () => errors, close };
  };
  /** Whether a step finished by itself or is waiting for a lock that someone else holds. */
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
  const asSession = (id: string) => `select set_config('request.jwt.claim.sub','${id}',false);`;
  const setsOf = (session: string, values: string) => `update public.workout_sets t set ${values} from public.workout_session_exercises x where x.id=t.workout_session_exercise_id and x.workout_session_id='${session}';`;
  const repsOf = (session: string) => sql(`select distinct t.actual_reps from public.workout_sets t join public.workout_session_exercises x on x.id=t.workout_session_exercise_id where x.workout_session_id='${session}';`);
  /** What a commit waits for: the lock of one account, held from outside to force an order. */
  const hold = (id: string) => `begin; select pg_advisory_xact_lock(hashtextextended('${id}',367));`;

  const seedProfile = (id: string) => sql(`select set_config('request.jwt.claim.sub','${id}',false); insert into public.profiles(user_id) values('${id}') on conflict do nothing;`);
  const seedSession = (id: string, date: string, reps = 8) => {
    const session = randomUUID(), exercise = randomUUID();
    sql(`select set_config('request.jwt.claim.sub','${id}',false);
      insert into public.exercises(id,user_id,nombre,weight_mode) values('${exercise}','${id}','SYNTHETIC ${exercise.slice(0, 8)}','Peso total');
      insert into public.day_logs(user_id,log_date) values('${id}','${date}') on conflict do nothing;
      insert into public.workout_sessions(id,user_id,day_log_id,started_at) select '${session}','${id}',l.id,'${date}T18:00:00Z' from public.day_logs l where l.user_id='${id}' and l.log_date='${date}';
      insert into public.workout_session_exercises(user_id,workout_session_id,exercise_id,exercise_order) values('${id}','${session}','${exercise}',1);
      update public.workout_sets t set actual_reps=${reps},actual_weight_kg=50,is_completed=true from public.workout_session_exercises x where x.id=t.workout_session_exercise_id and x.workout_session_id='${session}';`);
    return session;
  };
  /** Some triggers ask who is writing, so a seed says it. */
  const asUser = (id: string, statement: string) => sql(`select set_config('request.jwt.claim.sub','${id}',false);\n${statement}`);
  const complete = (session: string, date: string) => sql(`select set_config('request.jwt.claim.sub',(select user_id::text from public.workout_sessions where id='${session}'),false);\nupdate public.workout_sessions set status='completed',ended_at='${date}T19:00:00Z' where id='${session}';`);
  const metricValues = (id: string) => { const metric = randomUUID(); asUser(id, `insert into public.user_metrics(id,user_id,name,value_type) values('${metric}','${id}','M ${metric.slice(0, 8)}','decimal');
    insert into public.daily_metric_values(user_id,metric_id,metric_date,value) values('${id}','${metric}','2026-06-01',10),('${id}','${metric}','2026-06-02',20);`); return metric; };
  const meal = (id: string, date = DAY) => { const row = randomUUID(); sql(`select set_config('request.jwt.claim.sub','${id}',false);
    insert into public.day_logs(user_id,log_date) values('${id}','${date}') on conflict do nothing;
    insert into public.meal_entries(id,user_id,day_log_id,title,final_calories,source_type,entry_kind,consumed_at) select '${row}','${id}',l.id,'SYNTHETIC',100,'manual','meal','${date}T16:00:00Z' from public.day_logs l where l.user_id='${id}' and l.log_date='${date}';`); return row; };

  beforeAll(async () => {
    if (!/^supabase_db_ownlevel-receipt-[a-f0-9]{8}$/.test(container!)) throw Error("Refuse a non-disposable container");
    const status = JSON.parse(readFileSync(statusFile!, "utf8").replace(/^﻿/, ""));
    if (new URL(status.API_URL).hostname !== "127.0.0.1") throw Error("Loopback API required");
    sql = (input: string) => {
      const run = spawnSync(docker, ["--context", "desktop-linux", "exec", "-i", container!, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input, encoding: "utf8", maxBuffer: 1 << 26, timeout: 60_000 });
      if (run.status !== 0) throw Error(run.stderr || run.stdout);
      return run.stdout.trim();
    };
    admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    anonymous = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
    signIn = async () => {
      const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
      const email = `revision-${randomUUID()}@example.invalid`, password = randomBytes(24).toString("hex");
      const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (made.error) throw made.error;
      const signed = await client.auth.signInWithPassword({ email, password });
      if (signed.error) throw signed.error;
      return { client, id: made.data.user.id };
    };
    owner = await signIn();
    seedProfile(owner.id);

    // What a write costs, before and after. Same rows, one transaction each.
    const costUser = await signIn();
    seedProfile(costUser.id);
    const sessions = Array.from({ length: 30 }, (_, index) => { const date = `2025-01-${String(index + 1).padStart(2, "0")}`, session = seedSession(costUser.id, date); complete(session, date); return session; });
    asUser(costUser.id, `insert into public.day_logs(user_id,log_date) select '${costUser.id}',d::date from generate_series('2024-01-01'::date,'2024-12-31'::date,'1 day') d on conflict do nothing;
      insert into public.meal_entries(user_id,day_log_id,title,final_calories,source_type,entry_kind,consumed_at) select '${costUser.id}',l.id,'COSTO',100,'manual','meal','2024-06-01T16:00:00Z' from public.day_logs l where l.user_id='${costUser.id}' and l.log_date between '2024-01-01' and '2024-12-31';`);
    const time = (statement: string) => { const started = performance.now(); asUser(costUser.id, statement); return Math.round(performance.now() - started); };
    const writes = { sets: `update public.workout_sets set actual_reps=coalesce(actual_reps,0) where user_id='${costUser.id}';`, oneMeal: `update public.meal_entries set title='COSTO' where id=(select id from public.meal_entries where user_id='${costUser.id}' limit 1);`, meals: `update public.meal_entries set title='COSTO' where user_id='${costUser.id}' and title='COSTO';` };
    for (const [key, statement] of Object.entries(writes)) { time(statement); timings[`${key}Before`] = Math.min(time(statement), time(statement), time(statement)); }
    timings.rows = Number(sql(`select count(*) from public.workout_sets where user_id='${costUser.id}';`)); timings.mealRows = Number(sql(`select count(*) from public.meal_entries where user_id='${costUser.id}';`));
    expect(sessions).toHaveLength(30);

    sql(readFileSync(join(process.cwd(), "supabase/migrations/20261105211040_insights_source_revision_expand.sql"), "utf8") + "\nnotify pgrst,'reload schema';");
    for (let attempt = 0; attempt < 50; attempt++) {
      const probe = await owner.client.from("insights_source_revisions").select("revision").limit(1);
      if (!probe.error) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    for (const [key, statement] of Object.entries(writes)) { time(statement); timings[`${key}After`] = Math.min(time(statement), time(statement), time(statement)); }
    if (process.env.OWNLEVEL_REVISION_COST_OUT) writeFileSync(process.env.OWNLEVEL_REVISION_COST_OUT, JSON.stringify(timings, null, 2));
  }, 180_000);

  describe("la colisión de cantidad y máximo", () => {
    it("moves when a transaction that started earlier commits after a newer one", async () => {
      const metric = metricValues(owner.id);
      const set = (date: string, value: number) => `update public.daily_metric_values set value=${value} where user_id='${owner.id}' and metric_id='${metric}' and metric_date='${date}';`;
      const older = open(set("2026-06-01", 11));
      await settle();
      sql(set("2026-06-02", 21));
      const seen = await revision();
      expect(await older.end()).toBe(0);
      // What count + max(updated_at) reports here is identical: the proof that this is the case it could not see.
      expect(await revision()).toBe(seen + 1);
      expect(sql(`select count(*), max(updated_at) = (select updated_at from public.daily_metric_values where user_id='${owner.id}' and metric_id='${metric}' and metric_date='2026-06-02') from public.daily_metric_values where user_id='${owner.id}' and metric_id='${metric}';`)).toBe("2|t");
    }, 30_000);
    it("does not move for a transaction that does not commit", async () => {
      const metric = metricValues(owner.id), seen = await revision();
      const never = open(`update public.daily_metric_values set value=99 where user_id='${owner.id}' and metric_id='${metric}';`);
      await settle();
      expect(await never.end("rollback")).toBe(0);
      expect(await revision()).toBe(seen);
    }, 30_000);
    it("does not move before the commit: a reader cannot see the new value without the new data", async () => {
      const metric = metricValues(owner.id), seen = await revision();
      const pending = open(`update public.daily_metric_values set value=77 where user_id='${owner.id}' and metric_id='${metric}';`);
      await settle();
      expect(await revision()).toBe(seen);
      await pending.end();
      expect(await revision()).toBe(seen + 1);
      expect(Number(sql(`select distinct value from public.daily_metric_values where user_id='${owner.id}' and metric_id='${metric}';`))).toBe(77);
    }, 30_000);
  });

  describe("cubre las fuentes y sus dependencias", () => {
    const update = (statement: string) => () => asUser(owner.id, statement);
    it("meals: create, edit, soft and hard delete, through a token too", async () => {
      expect(await moved(() => meal(owner.id))).toBe(1);
      const row = meal(owner.id);
      expect(await moved(update(`update public.meal_entries set title='X' where id='${row}';`))).toBe(1);
      expect(await moved(async () => { const { error } = await owner.client.from("meal_entries").update({ title: "Y" }).eq("id", row); expect(error).toBeNull(); })).toBe(1);
      expect(await moved(update(`update public.meal_entries set deleted_at=now() where id='${row}';`))).toBe(1);
      expect(await moved(update(`delete from public.meal_entries where id='${row}';`))).toBe(1);
    });
    it("metrics: a definition and a value", async () => {
      const metric = metricValues(owner.id);
      expect(await moved(update(`update public.user_metrics set is_active=false,archived_at=now() where id='${metric}';`))).toBe(1);
      expect(await moved(update(`update public.daily_metric_values set value=1 where metric_id='${metric}' and metric_date='2026-06-01';`))).toBe(1);
      expect(await moved(update(`delete from public.daily_metric_values where metric_id='${metric}' and metric_date='2026-06-01';`))).toBe(1);
    });
    it("a completed session and everything under it, feelings and the day's date", async () => {
      const date = "2026-07-01", session = seedSession(owner.id, date);
      expect(await moved(() => complete(session, date))).toBe(1);
      expect(await moved(update(`update public.workout_sessions set session_name='X' where id='${session}';`))).toBe(1);
      expect(await moved(update(`update public.workout_session_exercises set implement_snapshot='barra' where workout_session_id='${session}';`))).toBe(1);
      expect(await moved(update(`update public.workout_sets t set actual_reps=9 from public.workout_session_exercises x where x.id=t.workout_session_exercise_id and x.workout_session_id='${session}';`))).toBe(1);
      expect(await moved(update(`insert into public.workout_session_feelings(session_id,revision,facts,updated_at) values('${session}',1,'{}',now());`))).toBe(1);
      expect(await moved(update(`update public.day_logs set log_date='2026-07-02' where user_id='${owner.id}' and log_date='${date}';`))).toBe(1);
      expect(await moved(update(`update public.workout_sessions set status='discarded' where id='${session}';`))).toBe(1);
    });
    it("does not move for what Insights does not read", async () => {
      const date = "2026-07-10", session = seedSession(owner.id, date);
      expect(await moved(update(`update public.workout_sets t set actual_reps=9 from public.workout_session_exercises x where x.id=t.workout_session_exercise_id and x.workout_session_id='${session}';`))).toBe(0);
      expect(await moved(update(`update public.workout_session_exercises set implement_snapshot='barra' where workout_session_id='${session}';`))).toBe(0);
      expect(await moved(update(`update public.workout_sessions set session_name='EN CURSO' where id='${session}';`))).toBe(0);
      expect(await moved(update(`update public.day_logs set steps=100 where user_id='${owner.id}' and log_date='${date}';`))).toBe(0);
      expect(await moved(() => complete(session, date))).toBe(1);
    });
    it("moves once per transaction, however many rows it touches", async () => {
      const a = meal(owner.id), b = meal(owner.id);
      expect(await moved(update(`begin; update public.meal_entries set title='A' where id='${a}'; update public.meal_entries set title='B' where id='${b}'; commit;`))).toBe(1);
    });
    it("sees a session completed while another transaction was writing under it", async () => {
      const date = "2026-07-20", session = seedSession(owner.id, date);
      const set = `update public.workout_sets t set actual_reps=11 from public.workout_session_exercises x where x.id=t.workout_session_exercise_id and x.workout_session_id='${session}';`;
      const writer = open(set);
      await settle();
      const seen = await revision();
      complete(session, date);
      const afterCompleting = await revision();
      expect(afterCompleting).toBe(seen + 1);
      await writer.end();
      // Its write lands in a session that is now completed, so it has to count.
      expect(await revision()).toBe(afterCompleting + 1);
    }, 30_000);
  });

  describe("orden de los bloqueos, con conexiones reales", () => {
    let user: { client: SupabaseClient; id: string };
    beforeAll(async () => { user = await signIn(); seedProfile(user.id); });
    const completed = (date: string) => { const session = seedSession(user.id, date); complete(session, date); return session; };

    it("does not deadlock: one holds a completed session, the other changes a metric and then a set of that session", async () => {
      const session = completed("2026-10-01"), metric = metricValues(user.id), t1 = connect(), t2 = connect();
      await t1.step(`${asSession(user.id)} begin; update public.workout_sessions set session_name='T1' where id='${session}';`);
      await t2.step(`${asSession(user.id)} begin; update public.daily_metric_values set value=5 where metric_id='${metric}' and metric_date='2026-06-01'; ${setsOf(session, "actual_reps=12")}`);
      const before = await revision(user);
      // The metric comes first in the queue. If the set then waited for T1 with the counter already held, T1's commit would close the cycle.
      const commit2 = t2.step("commit;");
      const seen = await finishedOrWaiting(t2, commit2);
      await t1.step("commit;");
      await commit2;
      t1.close(); t2.close();
      expect(t1.errors() + t2.errors()).toBe("");
      expect(seen).toBe("finished");
      expect(await revision(user)).toBe(before + 2);
      expect(sql(`select session_name from public.workout_sessions where id='${session}';`)).toBe("T1");
      expect(repsOf(session)).toBe("12");
      expect(Number(sql(`select value from public.daily_metric_values where metric_id='${metric}' and metric_date='2026-06-01';`))).toBe(5);
    }, 60_000);
    it("does not deadlock: one holds a set and commits while the other holds its session and waits for that set", async () => {
      const session = completed("2026-10-02"), t1 = connect(), t2 = connect();
      await t1.step(`${asSession(user.id)} begin; update public.workout_sessions set session_name='T1' where id='${session}';`);
      await t2.step(`${asSession(user.id)} begin; ${setsOf(session, "actual_reps=13")}`);
      const before = await revision(user);
      const write1 = t1.step(setsOf(session, "actual_weight_kg=60"));
      expect(await finishedOrWaiting(t1, write1)).toBe("waiting");
      await t2.step("commit;");
      await write1;
      await t1.step("commit;");
      t1.close(); t2.close();
      expect(t1.errors() + t2.errors()).toBe("");
      expect(await revision(user)).toBe(before + 2);
      expect(repsOf(session)).toBe("13");
    }, 60_000);
    it("lets concurrent writers under one completed session finish, and counts all of them", async () => {
      const session = completed("2026-10-03");
      asUser(user.id, `insert into public.workout_sets(user_id,workout_session_exercise_id,set_number) select x.user_id,x.id,n from public.workout_session_exercises x, generate_series(20,27) n where x.workout_session_id='${session}';`);
      const all = sql(`select t.id from public.workout_sets t join public.workout_session_exercises x on x.id=t.workout_session_exercise_id where x.workout_session_id='${session}';`).split("\n");
      const before = await revision(user);
      const writes = all.map(id => user.client.from("workout_sets").update({ actual_reps: 7 }).eq("id", id).select("id"));
      for (const { error, data } of await Promise.all(writes)) { expect(error).toBeNull(); expect(data).toHaveLength(1); }
      expect(await revision(user)).toBe(before + all.length);
    }, 60_000);
    it("a writer that commits before the session completes does not move it; the completion that comes after does", async () => {
      const date = "2026-10-04", session = seedSession(user.id, date), writer = connect(), completer = connect();
      await completer.step(`${asSession(user.id)} begin; update public.workout_sessions set status='completed',ended_at='${date}T19:00:00Z' where id='${session}';`);
      await writer.step(`${asSession(user.id)} begin; ${setsOf(session, "actual_reps=14")}`);
      const before = await revision(user);
      const commit = writer.step("commit;");
      expect(await finishedOrWaiting(writer, commit)).toBe("finished");
      expect(await revision(user)).toBe(before);
      await completer.step("commit;");
      writer.close(); completer.close();
      expect(writer.errors() + completer.errors()).toBe("");
      // Whoever sees the new counter also sees that set.
      expect(await revision(user)).toBe(before + 1);
      expect(repsOf(session)).toBe("14");
    }, 60_000);
    it("a writer queued behind a completion reads the session after it, so it counts", async () => {
      const date = "2026-10-05", session = seedSession(user.id, date), gate = connect(), completer = connect(), writer = connect();
      await completer.step(`${asSession(user.id)} begin; update public.workout_sessions set status='completed',ended_at='${date}T19:00:00Z' where id='${session}';`);
      await writer.step(`${asSession(user.id)} begin; ${setsOf(session, "actual_reps=15")}`);
      const before = await revision(user);
      await gate.step(hold(user.id));
      const completing = completer.step("commit;");
      expect(await finishedOrWaiting(completer, completing)).toBe("waiting");
      const writing = writer.step("commit;");
      expect(await finishedOrWaiting(writer, writing)).toBe("waiting");
      await gate.step("commit;");
      await completing; await writing;
      gate.close(); completer.close(); writer.close();
      expect(gate.errors() + completer.errors() + writer.errors()).toBe("");
      expect(await revision(user)).toBe(before + 2);
    }, 60_000);
    it("a commit waiting for its own account does not hold up another account", async () => {
      const other = await signIn();
      seedProfile(other.id);
      const row = meal(user.id), gate = connect(), writer = connect();
      await gate.step(hold(user.id));
      await writer.step(`begin; update public.meal_entries set title='ESPERA' where id='${row}';`);
      const commit = writer.step("commit;");
      expect(await finishedOrWaiting(writer, commit)).toBe("waiting");
      expect(await moved(() => meal(other.id), other)).toBe(1);
      await gate.step("commit;");
      await commit;
      gate.close(); writer.close();
      expect(gate.errors() + writer.errors()).toBe("");
    }, 60_000);
    it("deleting an account while a write of it is about to commit finishes both", async () => {
      const gone = await signIn();
      seedProfile(gone.id);
      const row = meal(gone.id), writer = connect();
      await writer.step(`${asSession(gone.id)} begin; update public.meal_entries set title='ULTIMA' where id='${row}';`);
      // A query is lazy: this sends it now.
      const deleting = Promise.resolve(gone.client.rpc("mobile_delete_account", { p_confirmation: "ELIMINAR" }));
      let blocked = false;
      for (let attempt = 0; attempt < 100 && !blocked; attempt++) {
        blocked = sql(`select count(*) from pg_stat_activity a, pg_stat_activity w where w.application_name='${writer.name}' and w.pid = any(pg_blocking_pids(a.pid));`) !== "0";
        if (!blocked) await new Promise(resolve => setTimeout(resolve, 50));
      }
      expect(blocked).toBe(true);
      await writer.step("commit;");
      writer.close();
      const { data, error } = await deleting;
      expect(writer.errors()).toBe("");
      expect(error).toBeNull(); expect(data).toEqual({ status: "deleted" });
      expect(sql(`select count(*) from public.insights_source_revisions where user_id='${gone.id}';`)).toBe("0");
    }, 60_000);
  });

  describe("padre anterior y nuevo", () => {
    let user: { client: SupabaseClient; id: string };
    const parents = { completed: "", in_progress: "", discarded: "" };
    let order = 100;
    beforeAll(async () => {
      user = await signIn();
      seedProfile(user.id);
      parents.completed = seedSession(user.id, "2026-11-01");
      complete(parents.completed, "2026-11-01");
      parents.discarded = seedSession(user.id, "2026-11-02");
      asUser(user.id, `update public.workout_sessions set status='discarded' where id='${parents.discarded}';`);
      parents.in_progress = seedSession(user.id, "2026-11-03");
    });
    const addExercise = (session: string, who = user.id) => {
      const row = randomUUID(), library = randomUUID();
      asUser(who, `insert into public.exercises(id,user_id,nombre,weight_mode) values('${library}','${who}','MOVIDO ${library.slice(0, 8)}','Peso total');
        insert into public.workout_session_exercises(id,user_id,workout_session_id,exercise_id,exercise_order) values('${row}','${who}','${session}','${library}',${++order});`);
      return row;
    };
    const firstSet = (exercise: string) => sql(`select id from public.workout_sets where workout_session_exercise_id='${exercise}' order by set_number limit 1;`);
    const cases = [["completed", "in_progress", 1], ["completed", "discarded", 1], ["in_progress", "completed", 1], ["discarded", "completed", 1], ["in_progress", "discarded", 0], ["discarded", "in_progress", 0]] as const;

    it.each(cases)("an exercise moved by its owner from %s to %s moves the counter %i time(s)", async (from, to, times) => {
      const row = addExercise(parents[from]);
      expect(await moved(async () => {
        const { data, error } = await user.client.from("workout_session_exercises").update({ workout_session_id: parents[to], exercise_order: ++order }).eq("id", row).select("workout_session_id");
        expect(error).toBeNull(); expect(data).toEqual([{ workout_session_id: parents[to] }]);
      }, user)).toBe(times);
    });
    it.each(cases)("a set moved by its owner from %s to %s moves the counter %i time(s)", async (from, to, times) => {
      const source = addExercise(parents[from]), target = addExercise(parents[to]), row = firstSet(source);
      expect(row).not.toBe("");
      expect(await moved(async () => {
        const { data, error } = await user.client.from("workout_sets").update({ workout_session_exercise_id: target, set_number: 40 }).eq("id", row).select("workout_session_exercise_id");
        expect(error).toBeNull(); expect(data).toEqual([{ workout_session_exercise_id: target }]);
      }, user)).toBe(times);
    });
    it.each(cases)("feelings moved from %s to %s move the counter %i time(s)", async (from, to, times) => {
      asUser(user.id, `delete from public.workout_session_feelings where session_id in ('${parents.completed}','${parents.in_progress}','${parents.discarded}');
        insert into public.workout_session_feelings(session_id,revision,facts,updated_at) values('${parents[from]}',1,'{}',now());`);
      // Only the server writes feelings: a token cannot move them.
      const refused = await user.client.from("workout_session_feelings").update({ session_id: parents[to] }).eq("session_id", parents[from]).select("session_id");
      expect(refused.data ?? []).toEqual([]);
      expect(await moved(() => asUser(user.id, `update public.workout_session_feelings set session_id='${parents[to]}' where session_id='${parents[from]}';`), user)).toBe(times);
    });
    it("moves once when one transaction moves several rows, and remembers the origin of a chain of moves", async () => {
      const a = addExercise(parents.completed), b = addExercise(parents.completed);
      expect(await moved(() => asUser(user.id, `begin; update public.workout_session_exercises set workout_session_id='${parents.in_progress}',exercise_order=${++order} where id='${a}'; update public.workout_session_exercises set workout_session_id='${parents.in_progress}',exercise_order=${++order} where id='${b}'; commit;`), user)).toBe(1);
      // Out of a completed session and on to another open one, in one transaction: the origin still lost a row.
      const c = addExercise(parents.completed);
      expect(await moved(() => asUser(user.id, `begin; update public.workout_session_exercises set workout_session_id='${parents.discarded}',exercise_order=${++order} where id='${c}'; update public.workout_session_exercises set workout_session_id='${parents.in_progress}',exercise_order=${++order} where id='${c}'; commit;`), user)).toBe(1);
    });
    it("a set moved to another account moves both counters, and a token cannot do it", async () => {
      const other = await signIn();
      seedProfile(other.id);
      const theirs = seedSession(other.id, "2026-11-10");
      complete(theirs, "2026-11-10");
      const theirExercise = addExercise(theirs, other.id), source = addExercise(parents.completed), row = firstSet(source);
      const before = [await revision(user), await revision(other)];
      const refused = await user.client.from("workout_sets").update({ workout_session_exercise_id: theirExercise, set_number: 41 }).eq("id", row).select("id");
      expect(refused.error !== null || (refused.data ?? []).length === 0).toBe(true);
      expect([await revision(user), await revision(other)]).toEqual(before);
      expect(sql(`select workout_session_exercise_id from public.workout_sets where id='${row}';`)).toBe(source);
      asUser(user.id, `update public.workout_sets set workout_session_exercise_id='${theirExercise}',set_number=41 where id='${row}';`);
      expect([await revision(user), await revision(other)]).toEqual([before[0] + 1, before[1] + 1]);
    }, 30_000);
  });

  describe("no rompe lo que ya funciona", () => {
    it("lets concurrent writers of one account finish, and counts all of them", async () => {
      const rows = Array.from({ length: 12 }, () => meal(owner.id, "2026-08-01"));
      const before = await revision();
      const writes = rows.map(row => owner.client.from("meal_entries").update({ title: "CONCURRENTE" }).eq("id", row).select("id"));
      for (const { error } of await Promise.all(writes)) expect(error).toBeNull();
      expect(await revision()).toBe(before + rows.length);
    }, 30_000);
    it("keeps the counter of each account apart, and out of reach", async () => {
      const other = await signIn();
      seedProfile(other.id);
      const before = await revision();
      expect(await moved(() => meal(other.id), other)).toBe(1);
      expect(await revision()).toBe(before);
      const stolen = await owner.client.from("insights_source_revisions").select("revision").eq("user_id", other.id);
      expect(stolen.data).toEqual([]);
      expect((await anonymous.from("insights_source_revisions").select("revision")).data ?? []).toEqual([]);
      expect((await owner.client.from("insights_source_revisions").update({ revision: 1 }).eq("user_id", owner.id)).error).not.toBeNull();
      expect((await owner.client.from("insights_source_revisions").insert({ user_id: owner.id, revision: 99 })).error).not.toBeNull();
      expect((await owner.client.rpc("insights_bump_source_revision", { p_user: owner.id })).error).not.toBeNull();
      expect((await anonymous.rpc("insights_bump_source_revision", { p_user: owner.id })).error).not.toBeNull();
      expect((await owner.client.rpc("insights_lock_source_revision", { p_user: owner.id })).error).not.toBeNull();
      expect((await owner.client.rpc("insights_session_counts", { p_session: randomUUID() })).error).not.toBeNull();
    });
    it("reads as nothing for an account that has not changed, not as an error", async () => {
      const fresh = await signIn();
      expect(await revision(fresh)).toBe(0);
    });
    it("does not get in the way of deleting an account with data", async () => {
      const gone = await signIn();
      seedProfile(gone.id);
      meal(gone.id); metricValues(gone.id);
      const date = "2026-09-01", session = seedSession(gone.id, date);
      complete(session, date);
      expect(await revision(gone)).toBeGreaterThan(0);
      // The product's own path: everything in one transaction, with the triggers firing at its commit, once the user is gone.
      const { data, error } = await gone.client.rpc("mobile_delete_account", { p_confirmation: "ELIMINAR" });
      expect(error).toBeNull(); expect(data).toEqual({ status: "deleted" });
      expect(sql(`select count(*) from auth.users where id='${gone.id}';`)).toBe("0");
      expect(sql(`select count(*) from public.insights_source_revisions where user_id='${gone.id}';`)).toBe("0");
      expect(sql(`select count(*) from public.meal_entries where user_id='${gone.id}';`)).toBe("0");
    }, 30_000);
    it("works through the functions that finish and discard a session, each moving it once", async () => {
      const date = "2026-09-10", session = seedSession(owner.id, date);
      asUser(owner.id, `update public.workout_session_exercises set is_completed=true where workout_session_id='${session}';`);
      expect(await moved(async () => { const { error } = await owner.client.rpc("finish_workout_session", { p_session_id: session, p_metadata: {} }); expect(error).toBeNull(); })).toBe(1);
      expect(sql(`select status from public.workout_sessions where id='${session}';`)).toBe("completed");
      const key = randomUUID();
      expect(await moved(async () => { const { error } = await owner.client.rpc("mobile_discard_completed_session", { p_session_id: session, p_idempotency_key: key }); expect(error).toBeNull(); })).toBe(1);
      expect(sql(`select status from public.workout_sessions where id='${session}';`)).toBe("discarded");
      expect(await moved(async () => { const { error } = await owner.client.rpc("mobile_discard_completed_session", { p_session_id: session, p_idempotency_key: key }); expect(error).toBeNull(); })).toBe(0);
    }, 30_000);
    it("works through the functions that already write meals", async () => {
      const key = randomUUID(), intent = { operation: "create", sourceDate: DAY, mealId: null, expectedUpdatedAt: null, forceDuplicate: true, idempotencyKey: key, fields: { date: DAY, title: "RPC", description: null, calories: 500, proteinG: 30, carbsG: 60, fatG: 10 } };
      expect(await moved(async () => { const { data, error } = await owner.client.rpc("mobile_mutate_manual_meal", { p_intent: intent }); expect(error).toBeNull(); expect(data[0].response_status).toBe(201); })).toBe(1);
      // Replaying the same key writes nothing, so nothing moves.
      expect(await moved(async () => { const { data } = await owner.client.rpc("mobile_mutate_manual_meal", { p_intent: intent }); expect(data[0].replayed).toBe(true); })).toBe(0);
    });
  });
});
