// Disposable local Supabase ONLY: the seed runs through a local container and the API must be loopback. Skipped without the explicit status file.
// OWNLEVEL_INSIGHTS_LOCAL_STATUS=<status.json> OWNLEVEL_INSIGHTS_LOCAL_DB=<db container> npx vitest run src/lib/mobile-api/performance-insights.local.test.ts
// OWNLEVEL_INSIGHTS_LOCAL_SCALE_OUT=<file> also measures the whole read over five synthetic years.
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { buildInsightsReadModel, insightsDaysPage, insightsRelation, insightsRelations, insightsSummary } from "../progress/insights-engine";
import { parseCompleteInsights, parsePerformanceInsights } from "./performance-insights-contract";
import { buildQuickOptions } from "./nutrition-quick-server";
import { clearInsightsSnapshots, readConsistentInsightsSource, readInsightsSnapshot } from "./performance-insights-server";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";

vi.mock("server-only", () => ({}));
const statusFile = process.env.OWNLEVEL_INSIGHTS_LOCAL_STATUS, container = process.env.OWNLEVEL_INSIGHTS_LOCAL_DB;

function localStack() {
  if (!/^supabase_db_ownlevel-receipt-[a-f0-9]{8}$/.test(container!)) throw Error("Refuse a non-disposable container");
  const status = JSON.parse(readFileSync(statusFile!, "utf8").replace(/^﻿/, ""));
  if (new URL(status.API_URL).hostname !== "127.0.0.1") throw Error("Loopback API required");
  const docker = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs/DockerDesktop/resources/bin/docker.exe") : "docker";
  const sql = (input: string) => {
    const run = spawnSync(docker, ["--context", "desktop-linux", "exec", "-i", container!, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input, encoding: "utf8", maxBuffer: 1 << 26 });
    if (run.status !== 0) throw Error(run.stderr || run.stdout);
    return run.stdout.trim();
  };
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const user = async () => {
    const email = `insights-${randomUUID()}@example.invalid`, password = randomBytes(24).toString("hex");
    const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (made.error) throw made.error;
    const http = { requests: 0, times: [] as { path: string; ms: number }[] };
    const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false }, global: { fetch: async (...args: Parameters<typeof fetch>) => {
      http.requests++;
      const started = performance.now(), response = await fetch(...args);
      http.times.push({ path: new URL(String(args[0])).pathname.split("/").pop()!, ms: Math.round(performance.now() - started) });
      return response;
    } } });
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
    return { id: made.data.user.id, client, http };
  };
  return { status, sql, user };
}
const contextOf = (id: string, client: unknown) => ({ userId: id, supabase: client }) as unknown as MobileSupabaseAuthenticatedContext;

describe.runIf(!!statusFile && !!container)("loader contra PostgREST local descartable", () => {
  it("reads through RLS with the real selects, only for the token's owner", async () => {
    const { status, sql, user } = localStack();
    const owner = await user(), other = await user();
    const exercise = randomUUID(), foreign = randomUUID(), metric = randomUUID(), s1 = randomUUID(), s2 = randomUUID(), s3 = randomUUID(), active = randomUUID(), meal = randomUUID();
    const session = (id: string, who: string, date: string, reps: number, ex: string, state = "completed") => `
      select set_config('request.jwt.claim.sub','${who}',false);
      insert into public.day_logs(user_id,log_date) values('${who}','${date}') on conflict do nothing;
      insert into public.workout_sessions(id,user_id,day_log_id,started_at)
        select '${id}','${who}',id,'${date}T18:00:00Z' from public.day_logs where user_id='${who}' and log_date='${date}';
      insert into public.workout_session_exercises(user_id,workout_session_id,exercise_id,exercise_order) values('${who}','${id}','${ex}',1);
      update public.workout_session_exercises set is_completed=true,implement_snapshot='barra',weight_mode_snapshot='Peso total' where workout_session_id='${id}';
      update public.workout_sets t set actual_reps=${reps},actual_weight_kg=50,is_completed=true,completed_at='${date}T18:10:00Z' from public.workout_session_exercises x where x.id=t.workout_session_exercise_id and x.workout_session_id='${id}';
      ${state === "completed" ? `update public.workout_sessions set status='completed',ended_at='${date}T19:00:00Z' where id='${id}';` : ""}`;
    sql(`
      select set_config('request.jwt.claim.sub','${owner.id}',false);
      insert into public.profiles(user_id) values('${owner.id}'),('${other.id}') on conflict do nothing;
      insert into public.exercises(id,user_id,nombre,weight_mode) values('${exercise}','${owner.id}','SYNTHETIC PRESS','Peso total'),('${foreign}','${other.id}','SYNTHETIC OTHER','Peso total');
      ${session(s1, owner.id, "2026-03-01", 8, exercise)}
      ${session(s2, owner.id, "2026-03-02", 9, exercise)}
      ${session(active, owner.id, "2026-03-03", 9, exercise, "in_progress")}
      ${session(s3, other.id, "2026-03-02", 3, foreign)}
      select set_config('request.jwt.claim.sub','${owner.id}',false);
      insert into public.workout_session_feelings(session_id,revision,facts,updated_at) values('${s2}',1,'{"energyPre":{"value":4,"instrumentVersion":"energy-fatigue/1","declaredMoment":"pre","declaredAt":"2026-03-02T17:55:00Z","capturedAt":"2026-03-02T17:55:00Z","source":"mobile","receivedAt":"2026-03-02T17:55:01Z","temporalQuality":"unverified_client_clock"}}'::jsonb,now());
      insert into public.user_metrics(id,user_id,name,unit,value_type,is_active,archived_at) values('${metric}','${owner.id}','SYNTHETIC METRIC',null,'decimal',false,now());
      insert into public.daily_metric_values(user_id,metric_id,metric_date,value) values('${owner.id}','${metric}','2026-03-02',0);
      insert into public.meal_entries(id,user_id,day_log_id,title,final_calories,final_protein_g,final_carbs_g,final_fat_g,source_type,entry_kind,consumed_at)
        select '${meal}','${owner.id}',id,'SYNTHETIC',500,30,60,10,'manual','meal','2026-03-02T16:00:00Z' from public.day_logs where user_id='${owner.id}' and log_date='2026-03-02';
      notify pgrst,'reload schema';`);
    owner.http.requests = 0;
    const { source } = await readConsistentInsightsSource(contextOf(owner.id, owner.client));
    // Every request PostgREST really received: 2 revision rounds of 7 plus one page per stream.
    expect(owner.http.requests).toBe(14 + 7);
    expect(source.sessions.map(row => row.id).sort()).toEqual([s1, s2].sort());
    expect(source.sessions.find(row => row.id === s2)!.date).toBe("2026-03-02");
    expect(source.exercises.every(row => row.exerciseId === exercise)).toBe(true);
    expect(source.sets.length).toBeGreaterThan(0); expect(typeof source.sets[0]!.actualLoad).toBe("number");
    expect(source.feelings.map(row => row.sessionId)).toEqual([s2]);
    expect(source.metricDefinitions.find(row => row.id === metric)?.archived).toBe(true);
    expect(source.meals.map(row => row.id)).toEqual([meal]);

    const model = buildInsightsReadModel(source, { today: "2026-12-01", permutations: 19 });
    expect(parseCompleteInsights(JSON.parse(JSON.stringify(model)))).toBeTruthy();
    const latest = model.facts.days[0]!;
    expect(latest.date).toBe("2026-03-02"); expect(latest.sessions[0]!.exercises[0]).toMatchObject({ exerciseId: exercise, status: "insufficient_comparison", reason: "missing_context", referenceSessionId: null });
    expect(model.limits.configurationSnapshots).toEqual({ known: 0, total: 2 }); expect(model.limits.mealTimeEvidence.unverified).toBe(1);
    expect(latest.sessions[0]!.context.feelings.energyPre).toMatchObject({ value: 4, timing: "before_start" });
    expect(latest.sessions[0]!.context.carbsPre3h).toEqual({ value: null, state: "unverified_meal_time_in_scope" });
    expect(latest.context.metrics).toEqual([{ metricId: metric, value: 0 }]);

    // RLS, not the filter, is what protects other people's rows: the owner's token cannot read them by asking for that user.
    const stolen = await readConsistentInsightsSource(contextOf(other.id, owner.client));
    expect(stolen.source).toMatchObject({ sessions: [], exercises: [], sets: [], feelings: [], metricValues: [], meals: [] });
    const anonymous = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
    await expect(readConsistentInsightsSource(contextOf(owner.id, anonymous))).rejects.toThrow();
  }, 120_000);

  // Needs the schema of the time provenance EXPAND. Every meal comes through the path that really writes it.
  it("carries each meal's time from its producer to the eligibility of the window", async () => {
    const { status, sql, user } = localStack();
    const owner = await user(), exercise = randomUUID(), id = owner.id;
    const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    sql(`select set_config('request.jwt.claim.sub','${id}',false);
      insert into public.profiles(user_id) values('${id}') on conflict do nothing;
      insert into public.exercises(id,user_id,nombre,weight_mode) values('${exercise}','${id}','SYNTHETIC PRESS','Peso total');`);
    const train = (date: string, reps: number, start = `${date}T18:00:00Z`, end = `${date}T19:00:00Z`) => { const session = randomUUID(); sql(`
      select set_config('request.jwt.claim.sub','${id}',false);
      insert into public.day_logs(user_id,log_date) values('${id}','${date}') on conflict do nothing;
      insert into public.workout_sessions(id,user_id,day_log_id,started_at) select '${session}','${id}',id,'${start}' from public.day_logs where user_id='${id}' and log_date='${date}';
      insert into public.workout_session_exercises(user_id,workout_session_id,exercise_id,exercise_order) values('${id}','${session}','${exercise}',1);
      update public.workout_session_exercises set is_completed=true,implement_snapshot='barra',weight_mode_snapshot='Peso total' where workout_session_id='${session}';
      update public.workout_sets t set actual_reps=${reps},actual_weight_kg=50,is_completed=true,completed_at='${start}' from public.workout_session_exercises x where x.id=t.workout_session_exercise_id and x.workout_session_id='${session}';
      update public.workout_sessions set status='completed',ended_at='${end}' where id='${session}';`); };
    const at = (date: string) => `${date}T13:00:00-03:00`; // 16:00 UTC: two hours before the session.
    const manual = async (date: string, over: Record<string, unknown>) => {
      const { data, error } = await owner.client.rpc("mobile_mutate_manual_meal", { p_intent: { operation: "create", sourceDate: date, mealId: null, expectedUpdatedAt: null, forceDuplicate: true, idempotencyKey: randomUUID(),
        fields: { date, title: "SYNTHETIC", description: null, calories: 500, proteinG: 30, carbsG: 60, fatG: 10, ...over } } });
      expect(error).toBeNull(); expect(data[0].response_status).toBe(201);
      return data[0].response_body as { mealId: string; updatedAt: string };
    };
    const chatgpt = async (name: string, date: string, over: Record<string, unknown>) => {
      const { data, error } = await admin.rpc(name, { p_user_id: id, p_log_date: date, p_title: `G${randomUUID().slice(0, 8)}`, p_description: null, p_calories: 500, p_protein_g: 30, p_carbs_g: 60, p_fat_g: 10, p_idempotency_key: randomUUID(), p_force_duplicate: true, ...over });
      expect(error).toBeNull();
      return data.meal.id as string;
    };
    const today = sql("select (now() at time zone 'America/Argentina/Cordoba')::date;");
    const cases = ["2026-04-01", "2026-04-02", "2026-04-03", "2026-04-04", "2026-04-05", "2026-04-06", "2026-04-07", "2026-04-08", "2026-04-09", "2026-04-10", "2026-04-11", "2026-04-12"];
    cases.forEach((date, index) => train(date, 8 + index % 3));
    // In the next hour, so that a meal registered now falls inside its window; its day is compared, not left open, by reading from tomorrow.
    train(today, 9, sql("select to_char((now()+interval '1 hour') at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"');"), sql("select to_char((now()+interval '2 hours') at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"');"));

    const expected: Record<string, { source: string; carbs: { value: number | null; state: string } }> = {};
    const stored = (mealId: string) => sql(`select coalesce(consumed_at_source,'NULL') from public.meal_entries where id='${mealId}';`);
    const check = (date: string, mealId: string, source: string, carbs: { value: number | null; state: string }) => { expected[date] = { source, carbs }; expect(stored(mealId), date).toBe(source); };
    const recorded = { value: 60, state: "recorded" }, unverified = { value: null, state: "unverified_meal_time_in_scope" }, untimed = { value: null, state: "untimed_meal_in_scope" };

    check(cases[0]!, (await manual(cases[0]!, { consumedAt: at(cases[0]!), consumedAtSource: "user_declared" })).mealId, "user_declared", recorded);
    check(cases[1]!, (await manual(cases[1]!, { consumedAt: at(cases[1]!) })).mealId, "NULL", unverified);
    check(cases[2]!, (await manual(cases[2]!, {})).mealId, "default_clock", untimed);
    const edited = await manual(cases[3]!, { consumedAt: at(cases[3]!), consumedAtSource: "user_declared" });
    const change = await owner.client.rpc("mobile_mutate_manual_meal", { p_intent: { operation: "edit", sourceDate: cases[3]!, mealId: edited.mealId, expectedUpdatedAt: edited.updatedAt, forceDuplicate: false, idempotencyKey: randomUUID(),
      fields: { date: cases[3]!, title: "SYNTHETIC", description: null, calories: 500, proteinG: 30, carbsG: 60, fatG: 10, consumedAt: `${cases[3]!}T14:00:00-03:00` } } });
    expect(change.data[0].response_status).toBe(200);
    check(cases[3]!, edited.mealId, "NULL", unverified);
    const declaredAgain = await manual(cases[4]!, { consumedAt: at(cases[4]!) });
    const statement = await owner.client.rpc("mobile_mutate_manual_meal", { p_intent: { operation: "edit", sourceDate: cases[4]!, mealId: declaredAgain.mealId, expectedUpdatedAt: declaredAgain.updatedAt, forceDuplicate: false, idempotencyKey: randomUUID(),
      fields: { date: cases[4]!, title: "SYNTHETIC", description: null, calories: 500, proteinG: 30, carbsG: 60, fatG: 10, consumedAt: at(cases[4]!), consumedAtSource: "user_declared" } } });
    expect(statement.data[0].response_status).toBe(200);
    check(cases[4]!, declaredAgain.mealId, "user_declared", recorded);
    const name = `H${randomUUID().slice(0, 8)}`.toUpperCase();
    sql(`insert into public.saved_meals(user_id,name,template_type,calories,protein_g,carbs_g,fat_g) values('${id}','${name}','manual',400,20,60,10);`);
    const options = buildQuickOptions((await owner.client.rpc("mobile_read_quick_options", {}, { get: true })).data);
    if (!options || options.saved.status !== "ok") throw Error("Quick options unavailable");
    const option = options.saved.items.find((item: { name: string }) => item.name === name)!;
    const quick = await owner.client.rpc("mobile_confirm_quick_meal", { p_intent: { operation: "register", date: cases[5]!, source: option.source, quantities: null, idempotencyKey: randomUUID(), consumedAt: at(cases[5]!), consumedAtSource: "user_declared" } });
    expect(quick.data[0].response_status).toBe(201);
    check(cases[5]!, quick.data[0].response_body.resourceId, "user_declared", recorded);
    check(cases[6]!, await chatgpt("create_chatgpt_meal_for_integration_v4", cases[6]!, { p_consumed_at: at(cases[6]!), p_time_source: "user_declared" }), "user_declared", recorded);
    check(cases[7]!, await chatgpt("create_chatgpt_meal_for_integration_v2", cases[7]!, { p_consumed_at: at(cases[7]!) }), "NULL", unverified);
    check(cases[8]!, await chatgpt("create_chatgpt_meal_for_integration_v2", cases[8]!, {}), "default_clock", untimed);
    const web = await owner.client.from("meal_entries").insert({ user_id: id, day_log_id: sql(`select id from public.day_logs where user_id='${id}' and log_date='${cases[9]!}';`), title: "WEB", final_calories: 500, final_protein_g: 30, final_carbs_g: 60, final_fat_g: 10, source_type: "manual", entry_kind: "meal", consumed_at: `${cases[9]!}T16:00:00Z`, consumed_at_source: "default_clock" }).select("id").single();
    expect(web.error).toBeNull();
    check(cases[9]!, web.data!.id, "default_clock", untimed);
    // An old import: no column, only its marker. The marker keeps working, and nothing was written to the column for it.
    const imported = randomUUID();
    sql(`insert into public.meal_entries(id,user_id,day_log_id,title,final_calories,final_protein_g,final_carbs_g,final_fat_g,source_type,entry_kind,consumed_at,raw_input)
      select '${imported}','${id}',l.id,'IMPORTED',500,30,60,10,'manual','meal','${cases[10]!}T16:00:00Z','{"originalTimeKnown":true}' from public.day_logs l where l.user_id='${id}' and l.log_date='${cases[10]!}';`);
    check(cases[10]!, imported, "NULL", recorded);
    expected[cases[11]!] = { source: "none", carbs: { value: null, state: "no_registered_meal" } };
    const nowMeal = await chatgpt("create_chatgpt_meal_for_integration_v3", today, { p_time_source: "registration" });
    check(today, nowMeal, "registration_now", untimed);

    clearInsightsSnapshots();
    owner.http.requests = 0;
    const tomorrow = sql("select ((now() at time zone 'America/Argentina/Cordoba')::date + 1)::text;");
    const snapshot = await readInsightsSnapshot(contextOf(id, owner.client), tomorrow);
    const pages = owner.http.requests;
    expect(pages).toBe(14 + 7);
    const summary = insightsSummary(snapshot, { limit: 120 });
    expect(parsePerformanceInsights(JSON.parse(JSON.stringify(summary)))).toBeTruthy();
    for (const [date, row] of Object.entries(expected)) {
      const day = summary.facts.days.find(item => item.date === date)!;
      expect(day.sessions[0]!.context.carbsPre3h, `${date}, ${row.source}`).toEqual(row.carbs);
    }
    expect(summary.limits.mealTimeEvidence).toEqual({ explicit: 5, registration: 1, unverified: 3, unknown: 3 });

    // Into the window: only what was declared or imported becomes a pair, and each exclusion says why.
    const relation = insightsRelation(snapshot, "partial:meal_window:carbsG:pre_3h");
    expect(parsePerformanceInsights(JSON.parse(JSON.stringify(relation)))).toBeTruthy();
    // The first training day has nothing to compare with, so it is not an outcome day.
    const declaredDays = Object.entries(expected).filter(([date, row]) => row.carbs.state === "recorded" && date !== cases[0]!).map(([date]) => date).sort();
    expect(relation.pairs!.map(pair => pair.date)).toEqual(declaredDays);
    expect(relation.pairs!.every(pair => pair.exposure === 60)).toBe(true);
    expect(relation.item!.exclusions).toMatchObject({ unverified_meal_time_in_scope: 3, untimed_meal_in_scope: 4, no_registered_meal_in_window: 1 });

    // The same revision answers without reading again; a new meal changes it.
    owner.http.requests = 0;
    expect(await readInsightsSnapshot(contextOf(id, owner.client), tomorrow)).toBe(snapshot);
    expect(owner.http.requests).toBe(7);
    await manual(cases[11]!, { consumedAt: at(cases[11]!), consumedAtSource: "user_declared" });
    const after = await readInsightsSnapshot(contextOf(id, owner.client), tomorrow);
    expect(after).not.toBe(snapshot); expect(after.revision).not.toBe(snapshot.revision);
    expect(insightsSummary(after, { limit: 120 }).facts.days.find(day => day.date === cases[11]!)!.sessions[0]!.context.carbsPre3h).toEqual(recorded);
  }, 120_000);

  it.runIf(!!process.env.OWNLEVEL_INSIGHTS_LOCAL_SCALE_OUT)("measures the whole read over five synthetic years", async () => {
    const { sql, user } = localStack();
    const owner = await user(), id = owner.id;
    const seedStarted = performance.now();
    sql(`select set_config('request.jwt.claim.sub','${id}',false);
      insert into public.profiles(user_id) values('${id}') on conflict do nothing;
      insert into public.exercises(user_id,nombre,weight_mode) select '${id}','SYNTHETIC '||g,'Peso total' from generate_series(1,40) g;
      insert into public.user_metrics(user_id,name,value_type) select '${id}','SYNTHETIC M'||g,'decimal' from generate_series(1,20) g;
      do $seed$ declare d date; s uuid; ex uuid[]; n int := 0; i int; begin
        ex := array(select e.id from public.exercises e where e.user_id='${id}' order by e.id);
        for d in select g::date from generate_series('2021-01-01'::date,'2025-12-31'::date,'1 day') g loop
          insert into public.day_logs(user_id,log_date) values('${id}',d);
          insert into public.daily_metric_values(user_id,metric_id,metric_date,value) select '${id}',m.id,d,floor(random()*100) from public.user_metrics m where m.user_id='${id}' and random()<0.8;
          insert into public.meal_entries(user_id,day_log_id,title,final_calories,final_protein_g,final_carbs_g,final_fat_g,source_type,entry_kind,consumed_at)
            select '${id}',l.id,'SYNTHETIC',500,30,floor(random()*90),10,'manual','meal',(d::timestamp + make_interval(hours => 8+g*3)) at time zone 'UTC' from public.day_logs l cross join generate_series(0,3) g where l.user_id='${id}' and l.log_date=d;
          continue when random() >= 5.0/7;
          n := n + 1; s := gen_random_uuid();
          insert into public.workout_sessions(id,user_id,day_log_id,started_at) select s,'${id}',l.id,(d::timestamp + interval '18 hours') at time zone 'UTC' from public.day_logs l where l.user_id='${id}' and l.log_date=d;
          for i in 0..5 loop insert into public.workout_session_exercises(user_id,workout_session_id,exercise_id,exercise_order) values('${id}',s,ex[1+(n*3+i)%40],i+1); end loop;
          update public.workout_session_exercises set is_completed=true,implement_snapshot='barra',weight_mode_snapshot='Peso total' where workout_session_id=s;
          update public.workout_sets t set actual_reps=8+floor(random()*3),actual_weight_kg=50,is_completed=true,completed_at=(d::timestamp + interval '18 hours 10 minutes') at time zone 'UTC' from public.workout_session_exercises x where x.id=t.workout_session_exercise_id and x.workout_session_id=s;
          update public.workout_sessions set status='completed',ended_at=(d::timestamp + interval '19 hours') at time zone 'UTC' where id=s;
        end loop; end $seed$;`);
    const seedSeconds = Math.round((performance.now() - seedStarted) / 1000);
    const context = contextOf(id, owner.client);
    const kib = (value: unknown) => Math.round(Buffer.byteLength(JSON.stringify(value)) / 102.4) / 10;
    const timed = async <T,>(work: () => Promise<T> | T) => { owner.http.requests = 0; owner.http.times = []; const started = performance.now(); const value = await work(); return { value, ms: Math.round(performance.now() - started), requests: owner.http.requests, slowest: [...owner.http.times].sort((a, b) => b.ms - a.ms)[0] }; };
    const runs: unknown[] = [];
    let rows = {};
    // A freshly seeded database has no statistics yet: production runs with autovacuum, so both situations are measured.
    for (let run = 0; run < 7; run++) {
      if (run === 2) sql("analyze;");
      clearInsightsSnapshots();
      const today = "2030-01-01";
      const full = await timed(() => readInsightsSnapshot(context, today));
      const reuse = await timed(() => readInsightsSnapshot(context, today));
      expect(reuse.value).toBe(full.value); expect(reuse.requests).toBe(7);
      const snapshot = full.value;
      const summary = insightsSummary(snapshot), next = summary.facts.page.nextBefore!;
      const relations = await timed(() => insightsRelations(snapshot));
      const pick = snapshot.partial.lane.candidates.find(row => row.values.size > 0)!.definition.id;
      runs.push({ analyzed: run >= 2, fullRead: { ms: full.ms, requests: full.requests, slowest: full.slowest }, reuse: { ms: reuse.ms, requests: reuse.requests, slowest: reuse.slowest }, relationsMs: relations.ms,
        responseKiB: { summary: kib(summary), daysPage: kib(insightsDaysPage(snapshot, { before: next })), relations: kib(relations.value), relationDetail: kib(insightsRelation(snapshot, pick)) } });
      rows = { sessions: snapshot.history.sessions, partialComparable: snapshot.partial.totals.comparable, partialOutcomeDays: snapshot.partial.outcomeDays, strictComparable: snapshot.totals.comparable };
    }
    writeFileSync(process.env.OWNLEVEL_INSIGHTS_LOCAL_SCALE_OUT!, JSON.stringify({ seedSeconds, rows, runs }, null, 2));
  }, 1_500_000);
});
