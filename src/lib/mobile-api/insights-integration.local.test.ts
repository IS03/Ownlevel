// Disposable local Supabase ONLY: the API must be loopback and the database container disposable. Skipped without the explicit status file.
// Needs every migration applied: #387 (meal time provenance), the finish receipt and #391 (source revision).
// OWNLEVEL_INSIGHTS_LOCAL_STATUS=<status.json> OWNLEVEL_INSIGHTS_LOCAL_DB=<db container> npx vitest run src/lib/mobile-api/insights-integration.local.test.ts
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { insightsSummary } from "../progress/insights-engine";
import { parsePerformanceInsights } from "./performance-insights-contract";
import { clearInsightsSnapshots, readInsightsSnapshot, readInsightsSource } from "./performance-insights-server";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";
import { finishTrainingFeelingsWithReceipt } from "./training-feelings-finish-server";
import { feelingsWireInput, TrainingFeelingsJournal, type FeelingsPort, type FeelingsResult } from "./training-feelings-journal";

vi.mock("server-only", () => ({}));
const statusFile = process.env.OWNLEVEL_INSIGHTS_LOCAL_STATUS, container = process.env.OWNLEVEL_INSIGHTS_LOCAL_DB;
const docker = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs/DockerDesktop/resources/bin/docker.exe") : "docker";
const TODAY = "2030-01-01", DATE = "2026-06-10";

function localStack() {
  if (!/^supabase_db_ownlevel-receipt-[a-f0-9]{8}$/.test(container!)) throw Error("Refuse a non-disposable container");
  const status = JSON.parse(readFileSync(statusFile!, "utf8").replace(/^﻿/, ""));
  if (new URL(status.API_URL).hostname !== "127.0.0.1") throw Error("Loopback API required");
  const sql = (input: string) => {
    const run = spawnSync(docker, ["--context", "desktop-linux", "exec", "-i", container!, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input, encoding: "utf8", maxBuffer: 1 << 26, timeout: 60_000 });
    if (run.status !== 0) throw Error(run.stderr || run.stdout || String(run.error));
    return run.stdout.trim();
  };
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const user = async () => {
    const email = `integration-${randomUUID()}@example.invalid`, password = randomBytes(24).toString("hex");
    const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (made.error) throw made.error;
    const http = { requests: 0 };
    const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false }, global: { fetch: async (...args: Parameters<typeof fetch>) => { http.requests++; return fetch(...args); } } });
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
    const id = made.data.user.id;
    sql(`insert into public.profiles(user_id) values('${id}') on conflict do nothing;`);
    return { id, client, http, context: { userId: id, supabase: client } as unknown as MobileSupabaseAuthenticatedContext };
  };
  return { sql, user };
}
type Owner = Awaited<ReturnType<ReturnType<typeof localStack>["user"]>>;

describe.runIf(!!statusFile && !!container)("Insights integrado, contra Postgres local descartable", () => {
  const stack = () => localStack();
  const counter = (sql: (input: string) => string, id: string) => Number(sql(`select coalesce((select revision from public.insights_source_revisions where user_id='${id}'),0);`));

  /** An in-progress session as the app leaves it right before finishing: two exercises with sets done, one without. */
  const seedFinishable = (sql: (input: string) => string, id: string, date = DATE) => {
    const session = randomUUID(), routine = randomUUID(), added = randomUUID(), existing = randomUUID(), skipped = randomUUID();
    sql(`select set_config('request.jwt.claim.sub','${id}',false);
      insert into public.day_logs(user_id,log_date) values('${id}','${date}') on conflict do nothing;
      insert into public.routines(id,user_id,nombre) values('${routine}','${id}','R${routine.slice(0, 8)}');
      insert into public.exercises(id,user_id,nombre,weight_mode) values('${added}','${id}','A${added.slice(0, 8)}','Peso total'),('${existing}','${id}','E${existing.slice(0, 8)}','Peso total'),('${skipped}','${id}','S${skipped.slice(0, 8)}','Peso total');
      insert into public.routine_exercises(routine_id,exercise_id,exercise_order) values('${routine}','${existing}',1);
      insert into public.workout_sessions(id,user_id,day_log_id,routine_id,started_at) select '${session}','${id}',l.id,'${routine}','${date}T18:00:00Z' from public.day_logs l where l.user_id='${id}' and l.log_date='${date}';
      insert into public.workout_session_exercises(user_id,workout_session_id,exercise_id,exercise_order,add_to_routine_on_finish) values('${id}','${session}','${added}',1,true),('${id}','${session}','${existing}',2,true),('${id}','${session}','${skipped}',3,true);
      update public.workout_session_exercises set implement_snapshot='barra',weight_mode_snapshot='Peso total' where workout_session_id='${session}';
      update public.workout_session_exercises set is_completed=true where workout_session_id='${session}' and exercise_id<>'${skipped}';
      update public.workout_sets t set actual_reps=8,actual_weight_kg=50,is_completed=true,completed_at='${date}T18:10:00Z' from public.workout_session_exercises x where x.id=t.workout_session_exercise_id and x.workout_session_id='${session}' and x.exercise_id<>'${skipped}';`);
    return { session, routine, added, existing, skipped };
  };
  const portOf = (owner: Owner, session: string, control: { dropNext: boolean; writes: number }): FeelingsPort => ({
    read: async () => {
      const { data, error } = await owner.client.rpc("read_training_feelings_v1", { p_session_id: session });
      return error ? { status: "unavailable" } as FeelingsResult : { status: "ok", data };
    },
    write: async input => {
      control.writes++;
      const result = await finishTrainingFeelingsWithReceipt(session, feelingsWireInput(input), owner.context);
      if (control.dropNext) { control.dropNext = false; throw Error("synthetic response lost after the commit"); }
      return { status: "ok", data: result.feelings, finished: result.finished };
    },
  });
  const memoryStorage = () => { const rows = new Map<string, string>(); return { getItem: async (key: string) => rows.get(key) ?? null, setItem: async (key: string, value: string) => { rows.set(key, value); } }; };
  const finish = async (owner: Owner, session: string, keyPrefix = "finish") => {
    const storage = memoryStorage(), journal = new TrainingFeelingsJournal(storage, portOf(owner, session, { dropNext: false, writes: 0 }), owner.id, session, "mobile", () => `${keyPrefix}-${randomUUID()}`);
    await journal.refresh(); await journal.change("energyPost", 4);
    expect(await journal.prepareFinish({})).toBeTruthy();
    expect(await journal.retry()).toBeTruthy();
    return journal;
  };
  const factOf = (snapshot: Awaited<ReturnType<typeof readInsightsSnapshot>>, session: string) => insightsSummary(snapshot, { limit: 120 }).facts.days.flatMap(day => day.sessions).find(item => item.sessionId === session);

  it("finish con sensaciones: respuesta perdida, recibo por la misma operación y hechos de esa sesión", async () => {
    const { sql, user } = stack(); clearInsightsSnapshots();
    const owner = await user(), other = await user();
    const seed = seedFinishable(sql, owner.id);
    const warm = await readInsightsSnapshot(owner.context, TODAY);
    expect(factOf(warm, seed.session)).toBeUndefined(); // In progress: Insights does not read it.
    const start = counter(sql, owner.id), otherStart = counter(sql, other.id);

    const control = { dropNext: true, writes: 0 }, storage = memoryStorage(), keys: string[] = [];
    const newKey = () => { const key = `finish-${randomUUID()}`; keys.push(key); return key; };
    const journal = new TrainingFeelingsJournal(storage, portOf(owner, seed.session, control), owner.id, seed.session, "mobile", newKey);
    await journal.refresh();
    await journal.change("energyPre", 3); await journal.change("energyPost", 4);
    const prepared = await journal.prepareFinish({});
    expect(prepared).toBeTruthy();

    // Committed, but the client never hears it: the answers stay pending, and Insights already sees the truth.
    expect(await journal.retry()).toBeNull();
    expect(journal.getSnapshot().pending).toBeTruthy();
    expect(counter(sql, owner.id)).toBe(start + 1);
    const seen = await readInsightsSnapshot(owner.context, TODAY);
    expect(seen.revision).not.toBe(warm.revision);
    expect(factOf(seen, seed.session)?.context.feelings.energyPost).toMatchObject({ value: 4 });

    // The app reopens from storage and retries the same operation: same key, same receipt, no second write in the sources.
    const reopened = new TrainingFeelingsJournal(storage, portOf(owner, seed.session, control), owner.id, seed.session, "mobile", newKey);
    const recovered = await reopened.retry();
    expect(recovered).toBeTruthy(); expect(keys).toHaveLength(1); expect(control.writes).toBe(2);
    const receipt = reopened.getSnapshot().finished!;
    expect(receipt.sessionId).toBe(seed.session);
    expect(receipt.routineAdditions!.map(row => row.outcome).sort()).toEqual(["added", "already_in_routine", "no_completed_sets"]);
    expect(counter(sql, owner.id)).toBe(start + 1);
    expect(counter(sql, other.id)).toBe(otherStart);
    expect(await reopened.confirmFinish()).toBe(true);

    // The replay moved nothing, so the same result is reused for one query. Facts of this session, and post feelings only as context.
    owner.http.requests = 0;
    const again = await readInsightsSnapshot(owner.context, TODAY);
    expect(owner.http.requests).toBe(1); expect(again).toBe(seen);
    const summary = insightsSummary(again, { limit: 120 });
    expect(parsePerformanceInsights(JSON.parse(JSON.stringify(summary)))).toBeTruthy();
    const fact = factOf(again, seed.session)!;
    expect(fact.routineId).toBe(seed.routine);
    expect(fact.context.feelings.energyPre).toMatchObject({ value: 3 });
    expect(fact.context.feelings.fatiguePost).toBeUndefined(); // Not recorded is not zero.
    expect(fact.exercises.map(row => row.exerciseId)).toEqual(expect.arrayContaining([seed.added, seed.existing]));
    expect(sql(`select count(*) from public.routine_exercises where routine_id='${seed.routine}' and exercise_id='${seed.added}';`)).toBe("1");
  }, 120_000);

  it("edición, invalidación y lectura nueva: corrección real, sensaciones, comida y descarte", async () => {
    const { sql, user } = stack(); clearInsightsSnapshots();
    const owner = await user(), seed = seedFinishable(sql, owner.id);
    const journal = await finish(owner, seed.session);
    expect(await journal.confirmFinish()).toBe(true);
    const repsOf = async () => [...new Set((await readInsightsSource(owner.context)).sets.map(row => row.actualReps).filter(value => value !== null))];

    // Warm: nothing moved, one query.
    const warm = await readInsightsSnapshot(owner.context, TODAY);
    owner.http.requests = 0;
    expect(await readInsightsSnapshot(owner.context, TODAY)).toBe(warm);
    expect(owner.http.requests).toBe(1);

    // The correction RPC as the endpoint calls it. Session, exercise and sets change in one transaction, so it counts once.
    const version = sql(`select to_json(updated_at)#>>'{}' from public.workout_sessions where id='${seed.session}';`);
    const exercises = JSON.parse(sql(`select json_agg(json_build_object('session_exercise_id',x.id,'expected_updated_at',x.updated_at,'notes',x.notes,'sets',(select json_agg(json_build_object('set_number',t.set_number,'actual_reps',case when t.actual_reps is null then null else 10 end,'actual_weight_kg',t.actual_weight_kg,'notes',t.notes) order by t.set_number) from public.workout_sets t where t.workout_session_exercise_id=x.id))) from public.workout_session_exercises x where x.workout_session_id='${seed.session}' and x.exercise_id='${seed.added}';`));
    const metadata = { energy_level: 3, performance_level: 2, pain_level: 1, pain_note: null, treadmill_minutes: null, treadmill_distance_km: null, treadmill_speed_kmh: null, treadmill_incline_percent: null, notes: "corregida" };
    const key = `correct-${randomUUID()}`, correct = (args: { key: string; version: string }) => owner.client.rpc("mobile_correct_completed_session", { p_session_id: seed.session, p_expected_session_updated_at: args.version, p_payload: { metadata, exercises }, p_idempotency_key: args.key });
    let before = counter(sql, owner.id);
    const corrected = await correct({ key, version });
    expect(corrected.error).toBeNull(); expect(corrected.data[0].replayed).toBe(false);
    expect(counter(sql, owner.id)).toBe(before + 1);
    owner.http.requests = 0;
    const afterCorrection = await readInsightsSnapshot(owner.context, TODAY);
    expect(owner.http.requests).toBe(2 + 7);
    expect(afterCorrection.revision).not.toBe(warm.revision);
    expect(await repsOf()).toEqual(expect.arrayContaining([8, 10]));

    // Same key replays and moves nothing; a stale version is refused and moves nothing: the result stays valid.
    before = counter(sql, owner.id);
    expect((await correct({ key, version })).data[0].replayed).toBe(true);
    expect((await correct({ key: `correct-${randomUUID()}`, version })).error?.message).toBe("SESSION_CHANGED");
    expect(counter(sql, owner.id)).toBe(before);
    owner.http.requests = 0;
    expect(await readInsightsSnapshot(owner.context, TODAY)).toBe(afterCorrection);
    expect(owner.http.requests).toBe(1);

    // Feelings corrected on the completed session.
    const feelings = (await owner.client.rpc("read_training_feelings_v1", { p_session_id: seed.session })).data as { revision: number };
    const saved = await owner.client.rpc("mutate_training_feelings_v1", { p_session_id: seed.session, p_input: { contractVersion: "training-feelings/1", operation: "save", expectedRevision: feelings.revision, idempotencyKey: `save-${randomUUID()}`,
      patch: { energyPost: { op: "set", value: 2, instrumentVersion: "energy-fatigue/1", declaredMoment: "post", declaredAt: null, capturedAt: "2026-06-10T20:00:00Z", source: "mobile" } } } });
    expect(saved.error).toBeNull();
    expect(counter(sql, owner.id)).toBe(before + 1);
    const afterFeelings = await readInsightsSnapshot(owner.context, TODAY);
    expect(afterFeelings.revision).not.toBe(afterCorrection.revision);
    expect(factOf(afterFeelings, seed.session)!.context.feelings.energyPost).toMatchObject({ value: 2 });

    // A meal edited: new counter, and a time restated without its origin stops being eligible.
    const mealFields = (over: Record<string, unknown>) => ({ date: DATE, title: "SYNTHETIC", description: null, calories: 500, proteinG: 30, carbsG: 60, fatG: 10, ...over });
    const atStart = `${DATE}T13:00:00-03:00`; // 16:00 UTC, two hours before the session.
    const meal = await owner.client.rpc("mobile_mutate_manual_meal", { p_intent: { operation: "create", sourceDate: DATE, mealId: null, expectedUpdatedAt: null, forceDuplicate: true, idempotencyKey: randomUUID(), fields: mealFields({ consumedAt: atStart, consumedAtSource: "user_declared" }) } });
    expect(meal.data[0].response_status).toBe(201);
    const declared = await readInsightsSnapshot(owner.context, TODAY);
    expect(factOf(declared, seed.session)!.context.carbsPre3h).toEqual({ value: 60, state: "recorded" });
    before = counter(sql, owner.id);
    const body = meal.data[0].response_body as { mealId: string; updatedAt: string };
    const edited = await owner.client.rpc("mobile_mutate_manual_meal", { p_intent: { operation: "edit", sourceDate: DATE, mealId: body.mealId, expectedUpdatedAt: body.updatedAt, forceDuplicate: false, idempotencyKey: randomUUID(), fields: mealFields({ carbsG: 70, consumedAt: `${DATE}T14:00:00-03:00` }) } });
    expect(edited.data[0].response_status).toBe(200);
    expect(counter(sql, owner.id)).toBe(before + 1);
    const afterMeal = await readInsightsSnapshot(owner.context, TODAY);
    expect(afterMeal.revision).not.toBe(declared.revision);
    expect(factOf(afterMeal, seed.session)!.context.carbsPre3h).toEqual({ value: null, state: "unverified_meal_time_in_scope" });

    // Discarded: it leaves history at once.
    before = counter(sql, owner.id);
    const discarded = await owner.client.rpc("mobile_discard_completed_session", { p_session_id: seed.session, p_idempotency_key: `discard-${randomUUID()}` });
    expect(discarded.error).toBeNull();
    expect(counter(sql, owner.id)).toBe(before + 1);
    expect(factOf(await readInsightsSnapshot(owner.context, TODAY), seed.session)).toBeUndefined();
  }, 120_000);

  describe("el contador junto a los constraints diferidos, con commits reales", () => {
    const openConnections: Array<() => void> = [];
    afterEach(() => { for (const end of openConnections.splice(0)) end(); });
    /** A real connection. Each step ends at its own barrier; psql goes on after an error, which stays in `errors()`. */
    const connect = (sql: (input: string) => string) => {
      const name = `integration_${randomBytes(4).toString("hex")}`;
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
      openConnections.push(() => { psql.kill(); try { sql(`select pg_terminate_backend(pid) from pg_stat_activity where application_name='${name}';`); } catch { /* Already gone. */ } });
      return { name, step, errors: () => errors, close: () => { psql.stdin.end(); } };
    };
    const finishedOrWaiting = async (sql: (input: string) => string, who: { name: string }, step: Promise<void>) => {
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
    const seedMetrics = (sql: (input: string) => string, id: string) => {
      const a = randomUUID(), b = randomUUID();
      sql(`insert into public.user_metrics(id,user_id,name,unit,value_type) values('${a}','${id}','M${a.slice(0, 8)}',null,'decimal'),('${b}','${id}','M${b.slice(0, 8)}',null,'decimal');
        insert into public.daily_metric_values(user_id,metric_id,metric_date,value) values('${id}','${a}','${DATE}',1),('${id}','${b}','${DATE}',1);`);
      return { write: (metric: string) => `update public.daily_metric_values set value=value+1 where metric_id='${metric}';`, a, b };
    };
    const seedRoutine = (sql: (input: string) => string, id: string) => {
      const routine = randomUUID(), one = randomUUID(), two = randomUUID(), three = randomUUID(), four = randomUUID(), first = randomUUID(), second = randomUUID();
      sql(`insert into public.routines(id,user_id,nombre) values('${routine}','${id}','R${routine.slice(0, 8)}');
        insert into public.exercises(id,user_id,nombre,weight_mode) values('${one}','${id}','O${one.slice(0, 8)}','Peso total'),('${two}','${id}','T${two.slice(0, 8)}','Peso total'),('${three}','${id}','H${three.slice(0, 8)}','Peso total'),('${four}','${id}','F${four.slice(0, 8)}','Peso total');
        insert into public.routine_exercises(id,routine_id,exercise_id,exercise_order) values('${first}','${routine}','${three}',1),('${second}','${routine}','${four}',2);`);
      return { routine, one, two, three, first, second };
    };
    const seedViews = (sql: (input: string) => string, id: string) => {
      const a = randomUUID(), b = randomUUID();
      sql(`insert into public.progress_views(id,user_id,position,name,definition) values('${a}','${id}',1,'A','{"measure":"x"}'),('${b}','${id}',2,'B','{"measure":"x"}');`);
      return { a, b };
    };
    const seedSession = (sql: (input: string) => string, id: string) => {
      const session = randomUUID(), one = randomUUID(), two = randomUUID(), x1 = randomUUID(), x2 = randomUUID();
      sql(`insert into public.day_logs(user_id,log_date) values('${id}','2026-06-11') on conflict do nothing;
        insert into public.exercises(id,user_id,nombre,weight_mode) values('${one}','${id}','O${one.slice(0, 8)}','Peso total'),('${two}','${id}','T${two.slice(0, 8)}','Peso total');
        insert into public.workout_sessions(id,user_id,day_log_id) select '${session}','${id}',l.id from public.day_logs l where l.user_id='${id}' and l.log_date='2026-06-11';
        insert into public.workout_session_exercises(id,user_id,workout_session_id,exercise_id,exercise_order) values('${x1}','${id}','${session}','${one}',1),('${x2}','${id}','${session}','${two}',2);`);
      return { session, x1, x2 };
    };

    it("orden de rutinas: dos escrituras de producto se ordenan antes del commit, sin ciclo", async () => {
      const { sql, user } = stack(), owner = await user();
      const metrics = seedMetrics(sql, owner.id), routine = seedRoutine(sql, owner.id), before = counter(sql, owner.id);
      const t1 = connect(sql), t2 = connect(sql);
      await t1.step(`${asUser(owner.id)} begin; ${metrics.write(metrics.a)} update public.routine_exercises set exercise_order=5 where id='${routine.first}';`);
      await t2.step(`${asUser(owner.id)} begin; ${metrics.write(metrics.b)}`);
      const insert = t2.step(`update public.routine_exercises set exercise_order=5 where id='${routine.second}';`);
      // Same user and a same-order write: the existing per-user lock makes it wait here, holding nothing of the counter.
      expect(await finishedOrWaiting(sql, t2, insert)).toBe("waiting");
      await t1.step("commit;");
      await insert;
      await t2.step("commit;");
      expect(t1.errors()).toBe("");
      expect(t2.errors()).toContain("routine_exercises_unique_order");
      expect(t2.errors()).not.toContain("deadlock");
      expect(counter(sql, owner.id)).toBe(before + 1); // Only what committed.
      expect(sql(`select exercise_order from public.routine_exercises where id='${routine.first}';`)).toBe("5");
      expect(sql(`select exercise_order from public.routine_exercises where id='${routine.second}';`)).toBe("2");
      t1.close(); t2.close();
    }, 90_000);

    it("orden de rutinas y vistas: un intercambio dentro de la misma transacción convive con el contador", async () => {
      const { sql, user } = stack(), owner = await user();
      const metrics = seedMetrics(sql, owner.id), routine = seedRoutine(sql, owner.id), views = seedViews(sql, owner.id), before = counter(sql, owner.id);
      const tx = connect(sql);
      await tx.step(`${asUser(owner.id)} begin; ${metrics.write(metrics.a)}
        update public.routine_exercises set exercise_order=case id when '${routine.first}' then 2 else 1 end where id in ('${routine.first}','${routine.second}');
        update public.progress_views set position=case id when '${views.a}' then 2 else 1 end where id in ('${views.a}','${views.b}');
        ${metrics.write(metrics.b)} commit;`);
      expect(tx.errors()).toBe("");
      expect(counter(sql, owner.id)).toBe(before + 1);
      expect(sql(`select exercise_order from public.routine_exercises where id='${routine.first}';`)).toBe("2");
      expect(sql(`select position from public.progress_views where id='${views.a}';`)).toBe("2");
      tx.close();
    }, 90_000);

    it("mientras una transacción tiene el contador: rutinas y vistas no esperan, y otro commit con fuentes sí", async () => {
      const { sql, user } = stack(), owner = await user();
      const metrics = seedMetrics(sql, owner.id), routine = seedRoutine(sql, owner.id), views = seedViews(sql, owner.id), before = counter(sql, owner.id);
      const holder = connect(sql), routineWriter = connect(sql), viewWriter = connect(sql), metricWriter = connect(sql);
      // Firing the deferred trigger now holds the counter's lock exactly as a commit does, with time to act around it.
      await holder.step(`${asUser(owner.id)} begin; ${metrics.write(metrics.a)} set constraints all immediate;`);
      const moving = routineWriter.step(`${asUser(owner.id)} begin; select public.move_routine_exercise('${routine.first}',1); commit;`);
      expect(await finishedOrWaiting(sql, routineWriter, moving)).toBe("finished");
      await moving;
      const reordering = viewWriter.step(`${asUser(owner.id)} begin; select * from ownlevel_private.reorder_progress_views(array['${views.b}','${views.a}']::uuid[],0,'reorder-${randomUUID()}'); commit;`);
      expect(await finishedOrWaiting(sql, viewWriter, reordering)).toBe("finished");
      await reordering;
      expect(routineWriter.errors() + viewWriter.errors()).toBe("");
      expect(sql(`select exercise_order from public.routine_exercises where id='${routine.first}';`)).toBe("2");
      expect(sql(`select position from public.progress_views where id='${views.a}';`)).toBe("2");
      await metricWriter.step(`${asUser(owner.id)} begin; ${metrics.write(metrics.b)}`);
      const committing = metricWriter.step("commit;");
      expect(await finishedOrWaiting(sql, metricWriter, committing)).toBe("waiting");
      await holder.step("commit;");
      await committing;
      expect(holder.errors() + metricWriter.errors()).toBe("");
      expect(counter(sql, owner.id)).toBe(before + 2);
      holder.close(); routineWriter.close(); viewWriter.close(); metricWriter.close();
    }, 90_000);

    it.each(["commit", "rollback"] as const)("finish que suma a la rutina frente a una rutina retenida (%s): espera al inicio, y solo queda lo confirmado", async ending => {
      const { sql, user } = stack(); clearInsightsSnapshots();
      const owner = await user(), seed = seedFinishable(sql, owner.id), metrics = seedMetrics(sql, owner.id);
      const warm = await readInsightsSnapshot(owner.context, TODAY), before = counter(sql, owner.id);
      expect(factOf(warm, seed.session)).toBeUndefined();
      const holder = connect(sql);
      const routineExercise = sql(`select id from public.routine_exercises where routine_id='${seed.routine}' and exercise_id='${seed.existing}';`);
      await holder.step(`${asUser(owner.id)} begin; update public.routine_exercises set notes='retenida' where id='${routineExercise}'; ${metrics.write(metrics.a)}`);
      let finished = false;
      const finishing = finish(owner, seed.session).then(result => { finished = true; return result; });
      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(finished).toBe(false);
      await holder.step(`${ending};`);
      const journal = await finishing;
      const receipt = journal.getSnapshot().finished!;
      expect(receipt.sessionId).toBe(seed.session);
      expect(receipt.routineAdditions!.map(row => row.outcome).sort()).toEqual(["added", "already_in_routine", "no_completed_sets"]);
      expect(await journal.confirmFinish()).toBe(true);
      expect(holder.errors()).toBe("");
      // The counter counts what committed, and the held transaction is all of it or none of it.
      const kept = ending === "commit";
      expect(counter(sql, owner.id)).toBe(before + (kept ? 2 : 1));
      expect(sql(`select notes is not distinct from 'retenida' from public.routine_exercises where id='${routineExercise}';`)).toBe(kept ? "t" : "f");
      expect(sql(`select value=${kept ? 2 : 1} from public.daily_metric_values where metric_id='${metrics.a}';`)).toBe("t");
      expect(sql(`select string_agg(re.exercise_order::text,',' order by re.exercise_order) from public.routine_exercises re where re.routine_id='${seed.routine}';`)).toBe("1,2");
      expect(sql(`select count(*) from public.workout_sessions where id='${seed.session}' and status='completed';`)).toBe("1");
      expect(sql(`select count(*) from public.insights_source_pending;`)).toBe("0");
      // Invalidated: a new read sees the finished session.
      const fresh = await readInsightsSnapshot(owner.context, TODAY);
      expect(fresh.revision).not.toBe(warm.revision);
      expect(factOf(fresh, seed.session)?.sessionId).toBe(seed.session);
      holder.close();
    }, 90_000);

    // Two transactions cross on the counter and on a same-position recheck. Only the second one to write has a recheck queued, and it runs before the counter.
    it.each(["position", "session"] as const)("cruce con otro recheck pendiente (%s): espera sin tener el contador, y es violación de unicidad", async which => {
      const { sql, user } = stack(), owner = await user(), metrics = seedMetrics(sql, owner.id);
      const views = which === "position" ? seedViews(sql, owner.id) : null, session = which === "session" ? seedSession(sql, owner.id) : null;
      const before = counter(sql, owner.id);
      const first = views ? `insert into public.progress_views(id,user_id,position,name,definition) values('${randomUUID()}','${owner.id}',5,'C','{"measure":"x"}');` : `update public.workout_session_exercises set exercise_order=50 where id='${session!.x1}';`;
      const second = views ? `insert into public.progress_views(id,user_id,position,name,definition) values('${randomUUID()}','${owner.id}',5,'D','{"measure":"x"}');` : `update public.workout_session_exercises set exercise_order=50 where id='${session!.x2}';`;
      const t1 = connect(sql), t2 = connect(sql);
      // T1 writes the position first and has no recheck queued. T2 finds it in progress, so it has one, after its counter write.
      await t1.step(`begin; ${first} ${metrics.write(metrics.a)}`);
      await t2.step(`begin; ${metrics.write(metrics.b)} ${second}`);
      const t2Commit = t2.step("commit;");
      expect(await finishedOrWaiting(sql, t2, t2Commit)).toBe("waiting");
      const t1Commit = t1.step("commit;");
      await Promise.all([t1Commit, t2Commit]);
      const errors = [t1.errors(), t2.errors()], failed = errors.filter(text => text.includes("ERROR"));
      expect(failed).toHaveLength(1);
      expect(t1.errors()).toBe("");
      expect(t2.errors()).toContain(views ? "progress_views_position_key" : "workout_session_exercises_unique_order");
      expect(t2.errors()).not.toContain("deadlock");
      const stored = views ? sql(`select count(*) from public.progress_views where user_id='${owner.id}' and position=5;`) : sql(`select count(*) from public.workout_session_exercises where workout_session_id='${session!.session}' and exercise_order=50;`);
      expect(stored).toBe("1");
      expect(counter(sql, owner.id)).toBe(before + 1);
      t1.close(); t2.close();
    }, 90_000);

    it("el mismo cruce de posición sin escrituras en fuentes: espera y violación de unicidad, nunca deadlock", async () => {
      const { sql, user } = stack(), owner = await user(), before = counter(sql, owner.id);
      const row = (name: string) => `insert into public.progress_views(id,user_id,position,name,definition) values('${randomUUID()}','${owner.id}',5,'${name}','{"measure":"x"}');`;
      const t1 = connect(sql), t2 = connect(sql);
      await t1.step(`begin; ${row("C")}`);
      await t2.step(`begin; ${row("D")}`);
      const t2Commit = t2.step("commit;");
      expect(await finishedOrWaiting(sql, t2, t2Commit)).toBe("waiting");
      await t1.step("commit;");
      await t2Commit;
      expect(t1.errors()).toBe("");
      expect(t2.errors()).toContain("progress_views_position_key");
      expect(t2.errors()).not.toContain("deadlock");
      expect(counter(sql, owner.id)).toBe(before);
      t1.close(); t2.close();
    }, 90_000);

    it("varias escrituras reales a la vez por PostgREST, de una misma cuenta: ninguna muere por el contador", async () => {
      const { sql, user } = stack(); clearInsightsSnapshots();
      const owner = await user(), metrics = seedMetrics(sql, owner.id), routine = seedRoutine(sql, owner.id);
      const seed = seedFinishable(sql, owner.id, "2026-06-12");
      const errors: unknown[] = [];
      const record = async (work: PromiseLike<{ error: unknown }>) => { const { error } = await work; if (error) errors.push(error); };
      const warm = await readInsightsSnapshot(owner.context, TODAY), before = counter(sql, owner.id);
      const metricWrites = 8;
      const finishing = finish(owner, seed.session).then(async journal => { const receipt = journal.getSnapshot().finished!; expect(await journal.confirmFinish()).toBe(true); return receipt; });
      const [receipt] = await Promise.all([
        finishing,
        ...Array.from({ length: 4 }, (_, index) => record(owner.client.rpc("move_routine_exercise", { p_routine_exercise_id: routine.first, p_direction: index % 2 ? -1 : 1 }))),
        ...Array.from({ length: metricWrites }, (_, index) => record(owner.client.from("daily_metric_values").update({ value: index }).eq("metric_id", index % 2 ? metrics.a : metrics.b))),
      ]);
      expect(errors).toEqual([]);
      // Every commit counted, each write landed whole, and nothing is left between them.
      expect(counter(sql, owner.id)).toBe(before + 1 + metricWrites);
      expect(receipt.sessionId).toBe(seed.session);
      expect(receipt.routineAdditions!.map(row => row.outcome).sort()).toEqual(["added", "already_in_routine", "no_completed_sets"]);
      expect(sql(`select count(*) from public.workout_sessions where id='${seed.session}' and status='completed';`)).toBe("1");
      expect(sql(`select string_agg(re.exercise_order::text,',' order by re.exercise_order) from public.routine_exercises re where re.routine_id='${seed.routine}';`)).toBe("1,2");
      expect(sql(`select string_agg(re.exercise_order::text,',' order by re.exercise_order) from public.routine_exercises re where re.routine_id='${routine.routine}';`)).toBe("1,2");
      expect(sql(`select value in (1,3,5,7) from public.daily_metric_values where metric_id='${metrics.a}';`)).toBe("t");
      expect(sql(`select value in (0,2,4,6) from public.daily_metric_values where metric_id='${metrics.b}';`)).toBe("t");
      expect(sql(`select count(*) from public.insights_source_pending;`)).toBe("0");
      const fresh = await readInsightsSnapshot(owner.context, TODAY);
      expect(fresh.revision).not.toBe(warm.revision);
      expect(factOf(fresh, seed.session)?.sessionId).toBe(seed.session);
    }, 120_000);
  });
});
