// Disposable local Supabase ONLY: the seed runs through a local container and the API must be loopback. Skipped without the explicit status file.
// OWNLEVEL_INSIGHTS_LOCAL_STATUS=<status.json> OWNLEVEL_INSIGHTS_LOCAL_DB=<db container> npx vitest run src/lib/mobile-api/performance-insights.local.test.ts
// OWNLEVEL_INSIGHTS_LOCAL_SCALE_OUT=<file> also measures the whole read over five synthetic years.
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { buildInsightsReadModel } from "../progress/insights-engine";
import { parsePerformanceInsights } from "./performance-insights-contract";
import { readConsistentInsightsSource, readInsightsRevision, readInsightsSource } from "./performance-insights-server";
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
    const source = await readConsistentInsightsSource(contextOf(owner.id, owner.client));
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
    expect(parsePerformanceInsights(JSON.parse(JSON.stringify(model)))).toBeTruthy();
    const latest = model.facts.days[0]!;
    expect(latest.date).toBe("2026-03-02"); expect(latest.sessions[0]!.exercises[0]).toMatchObject({ exerciseId: exercise, status: "insufficient_comparison", reason: "missing_context", referenceSessionId: null });
    expect(model.limits.configurationSnapshots).toEqual({ known: 0, total: 2 }); expect(model.limits.mealTimeEvidence.unverified).toBe(1);
    expect(latest.sessions[0]!.context.feelings.energyPre).toMatchObject({ value: 4, timing: "before_start" });
    expect(latest.sessions[0]!.context.carbsPre3h).toEqual({ value: null, state: "unverified_meal_time_in_scope" });
    expect(latest.context.metrics).toEqual([{ metricId: metric, value: 0 }]);

    // RLS, not the filter, is what protects other people's rows: the owner's token cannot read them by asking for that user.
    const stolen = await readConsistentInsightsSource(contextOf(other.id, owner.client));
    expect(stolen).toMatchObject({ sessions: [], exercises: [], sets: [], feelings: [], metricValues: [], meals: [] });
    const anonymous = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
    await expect(readConsistentInsightsSource(contextOf(owner.id, anonymous))).rejects.toThrow();
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
    const runs: { analyzed: boolean; revisionMs: number; revisionByTable: { path: string; ms: number }[]; streamsMs: number; readMs: number; requests: number; modelMs: number; bytes: number }[] = [];
    let rows = {};
    // A freshly seeded database has no statistics yet: production runs with autovacuum, so both situations are measured.
    for (let run = 0; run < 7; run++) {
      if (run === 2) sql("analyze;");
      owner.http.times = [];
      const revisionStarted = performance.now();
      await readInsightsRevision(contextOf(id, owner.client));
      const revisionMs = Math.round(performance.now() - revisionStarted);
      const revisionByTable = [...owner.http.times];
      await readInsightsSource(contextOf(id, owner.client));
      const streamsMs = Math.round(performance.now() - revisionStarted) - revisionMs;
      owner.http.requests = 0;
      const started = performance.now();
      const source = await readConsistentInsightsSource(contextOf(id, owner.client));
      const read = performance.now();
      const requests = owner.http.requests;
      const model = buildInsightsReadModel(source, { today: "2030-01-01" });
      runs.push({ analyzed: run >= 2, revisionMs, revisionByTable, streamsMs, readMs: Math.round(read - started), requests, modelMs: Math.round(performance.now() - read), bytes: Buffer.byteLength(JSON.stringify(model)) });
      rows = { sessions: source.sessions.length, exercises: source.exercises.length, sets: source.sets.length, metricValues: source.metricValues.length, meals: source.meals.length, comparable: model.facts.totals.comparable, outcomeDays: model.history.outcomeDays };
    }
    writeFileSync(process.env.OWNLEVEL_INSIGHTS_LOCAL_SCALE_OUT!, JSON.stringify({ seedSeconds, rows, runs }, null, 2));
  }, 1_500_000);
});
