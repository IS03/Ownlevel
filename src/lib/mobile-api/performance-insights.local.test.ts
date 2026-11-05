// Disposable local Supabase ONLY: the seed runs through a local container and the API must be loopback. Skipped without the explicit status file.
// OWNLEVEL_INSIGHTS_LOCAL_STATUS=<status.json> OWNLEVEL_INSIGHTS_LOCAL_DB=<db container> npx vitest run src/lib/mobile-api/performance-insights.local.test.ts
// OWNLEVEL_INSIGHTS_LOCAL_SCALE_OUT=<file> also measures the whole read over five synthetic years.
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { buildInsightsReadModel, insightsDaysPage, insightsRelation, insightsRelations, insightsSummary } from "../progress/insights-engine";
import { parseCompleteInsights } from "./performance-insights-contract";
import { clearInsightsSnapshots, readConsistentInsightsSource, readInsightsRevision, readInsightsSnapshot, readInsightsSource } from "./performance-insights-server";
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
    const http = { requests: 0, times: [] as { path: string; ms: number }[], hook: null as ((url: string) => Promise<void>) | null };
    const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false }, global: { fetch: async (...args: Parameters<typeof fetch>) => {
      http.requests++;
      await http.hook?.(decodeURIComponent(String(args[0])));
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
    // Every request PostgREST really received: the counter before and after, plus one page per stream.
    expect(owner.http.requests).toBe(2 + 7);
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

  // Two real transactions. B starts first, A starts and commits later, then B commits: B's row changes while count and max(updated_at) stay.
  describe("la colisión de cantidad y máximo, con el contador", () => {
    const seed = async () => {
      const { sql, user } = localStack();
      const owner = await user(), id = owner.id, metric = randomUUID(), dates = ["2026-05-01", "2026-05-02"];
      const value = (date: string, next: number) => `update public.daily_metric_values set value=${next} where user_id='${id}' and metric_id='${metric}' and metric_date='${date}';`;
      sql(`select set_config('request.jwt.claim.sub','${id}',false);
        insert into public.profiles(user_id) values('${id}') on conflict do nothing;
        insert into public.user_metrics(id,user_id,name,value_type) values('${metric}','${id}','SYNTHETIC METRIC','decimal');
        insert into public.daily_metric_values(user_id,metric_id,metric_date,value) values('${id}','${metric}','${dates[0]}',10),('${id}','${metric}','${dates[1]}',20);`);
      /** Holds a transaction open: B's now() stays earlier than A's, whatever the wall clock does afterwards. */
      const openTransaction = (statement: string) => {
        const docker = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs/DockerDesktop/resources/bin/docker.exe") : "docker";
        const psql = spawn(docker, ["--context", "desktop-linux", "exec", "-i", container!, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], { stdio: ["pipe", "ignore", "ignore"] });
        const closed = new Promise<number | null>(resolve => psql.on("close", resolve));
        psql.stdin.write(`begin;\n${statement}\n`);
        return { commit: async () => { psql.stdin.end("commit;\n"); expect(await closed).toBe(0); } };
      };
      const applied = (updated: string) => sql(`select count(*) from public.daily_metric_values where user_id='${id}' and updated_at='${updated}';`);
      return { sql, owner, id, metric, dates, value, openTransaction, applied, context: contextOf(id, owner.client) };
    };
    const valueOf = (source: { metricValues: readonly { date: string; value: unknown }[] }, date: string) => Number(source.metricValues.find(row => row.date === date)!.value);
    /** Waits until the open transaction really holds its row: its update has been sent and its now() is earlier than A's. */
    const settled = () => new Promise(resolve => setTimeout(resolve, 1500));
    it("does not reuse a warm result when an older transaction commits after a newer one", async () => {
      const { sql, value, dates, openTransaction, context, id, metric } = await seed();
      const exercise = randomUUID(), session = randomUUID();
      sql(`select set_config('request.jwt.claim.sub','${id}',false);
        insert into public.exercises(id,user_id,nombre,weight_mode) values('${exercise}','${id}','SYNTHETIC','Peso total');
        insert into public.day_logs(user_id,log_date) values('${id}','${dates[0]}') on conflict do nothing;
        insert into public.workout_sessions(id,user_id,day_log_id,started_at) select '${session}','${id}',l.id,'${dates[0]}T18:00:00Z' from public.day_logs l where l.user_id='${id}' and l.log_date='${dates[0]}';
        insert into public.workout_session_exercises(user_id,workout_session_id,exercise_id,exercise_order) values('${id}','${session}','${exercise}',1);
        update public.workout_sessions set status='completed',ended_at='${dates[0]}T19:00:00Z' where id='${session}';`);
      clearInsightsSnapshots();
      const shown = (snapshot: Awaited<ReturnType<typeof readInsightsSnapshot>>) => insightsSummary(snapshot, { limit: 120 }).facts.days.find(day => day.date === dates[0])!.context.metrics.find(row => row.metricId === metric)!.value;
      const b = openTransaction(value(dates[0]!, 11));
      await settled();
      sql(value(dates[1]!, 21));
      const warm = await readInsightsSnapshot(context, "2030-01-01");
      expect(shown(warm)).toBe(10);
      // Warm: the same counter gives the same result without reading again.
      expect(await readInsightsSnapshot(context, "2030-01-01")).toBe(warm);
      const before = await readInsightsRevision(context);
      await b.commit();
      expect(valueOf((await readInsightsSource(context)), dates[0]!)).toBe(11);
      expect(await readInsightsRevision(context)).not.toBe(before);
      const next = await readInsightsSnapshot(context, "2030-01-01");
      expect(shown(next)).toBe(11);
      expect(next.revision).not.toBe(warm.revision);
    }, 60_000);
    it("detects that same change during a read, and reads again", async () => {
      const { sql, value, dates, openTransaction, context, owner } = await seed();
      const b = openTransaction(value(dates[0]!, 11));
      await settled();
      sql(value(dates[1]!, 21));
      // Commits once the first revision is read, while the streams are being read.
      let committed = false;
      owner.http.hook = async url => { if (!committed && url.includes("metric_date") ) { committed = true; await b.commit(); } };
      owner.http.requests = 0;
      const { source } = await readConsistentInsightsSource(context);
      owner.http.hook = null;
      expect(committed).toBe(true);
      // A retry: two attempts of the counter twice and one page per stream. The read it publishes has the committed value.
      expect(owner.http.requests).toBe(2 * (2 + 7));
      expect(valueOf(source, dates[0]!)).toBe(11);
    }, 60_000);

    const withSessions = async () => {
      const seeded = await seed();
      const { sql, id } = seeded;
      const session = (date: string) => {
        const row = randomUUID(), library = randomUUID(), exercise = randomUUID();
        sql(`select set_config('request.jwt.claim.sub','${id}',false);
          insert into public.exercises(id,user_id,nombre,weight_mode) values('${library}','${id}','SYNTHETIC ${library.slice(0, 8)}','Peso total');
          insert into public.day_logs(user_id,log_date) values('${id}','${date}') on conflict do nothing;
          insert into public.workout_sessions(id,user_id,day_log_id,started_at) select '${row}','${id}',l.id,'${date}T18:00:00Z' from public.day_logs l where l.user_id='${id}' and l.log_date='${date}';
          insert into public.workout_session_exercises(id,user_id,workout_session_id,exercise_id,exercise_order) values('${exercise}','${id}','${row}','${library}',1);`);
        return { row, exercise, set: sql(`select id from public.workout_sets where workout_session_exercise_id='${exercise}' order by set_number limit 1;`) };
      };
      const finished = (date: string) => {
        const made = session(date);
        sql(`select set_config('request.jwt.claim.sub','${id}',false); update public.workout_sessions set status='completed',ended_at='${date}T19:00:00Z' where id='${made.row}';`);
        return made;
      };
      clearInsightsSnapshots();
      return { ...seeded, session, finished };
    };
    it("does not reuse a warm result when a set or an exercise leaves a completed session or enters one", async () => {
      const { owner, context, session, finished } = await withSessions();
      const done = finished("2026-06-01"), other = finished("2026-06-02"), open = session("2026-06-03");
      const warmed = async () => { const warm = await readInsightsSnapshot(context, "2030-01-01"); expect(await readInsightsSnapshot(context, "2030-01-01")).toBe(warm); return warm; };

      // A set leaves for the session in progress: its origin is what changes.
      let warm = await warmed();
      expect((await readInsightsSource(context)).sets.map(row => row.id)).toContain(done.set);
      expect((await owner.client.from("workout_sets").update({ workout_session_exercise_id: open.exercise, set_number: 40 }).eq("id", done.set)).error).toBeNull();
      expect((await readInsightsSnapshot(context, "2030-01-01")).revision).not.toBe(warm.revision);
      expect((await readInsightsSource(context)).sets.map(row => row.id)).not.toContain(done.set);

      // And comes back: now its destination is what changes.
      warm = await warmed();
      expect((await owner.client.from("workout_sets").update({ workout_session_exercise_id: other.exercise, set_number: 41 }).eq("id", done.set)).error).toBeNull();
      expect((await readInsightsSnapshot(context, "2030-01-01")).revision).not.toBe(warm.revision);
      expect((await readInsightsSource(context)).sets.map(row => row.id)).toContain(done.set);

      // An exercise leaves.
      warm = await warmed();
      expect((await owner.client.from("workout_session_exercises").update({ workout_session_id: open.row, exercise_order: 50 }).eq("id", other.exercise)).error).toBeNull();
      expect((await readInsightsSnapshot(context, "2030-01-01")).revision).not.toBe(warm.revision);
      expect((await readInsightsSource(context)).exercises.map(row => row.id)).not.toContain(other.exercise);
    }, 60_000);
    it("invalidates twice and fails neither when one holds a completed session and the other commits a metric and a set of it", async () => {
      const { sql, id, value, dates, openTransaction, context, finished } = await withSessions();
      const done = finished("2026-06-05");
      const as = `select set_config('request.jwt.claim.sub','${id}',false);`;
      const holder = openTransaction(`${as} update public.workout_sessions set session_name='RETENIDA' where id='${done.row}';`);
      const writer = openTransaction(`${as} ${value(dates[0]!, 11)} update public.workout_sets set actual_reps=12 where id='${done.set}';`);
      await settled();
      const warm = await readInsightsSnapshot(context, "2030-01-01");
      // A commit that waited for the holder would never get here: the holder has not committed yet.
      await writer.commit();
      const afterWriter = await readInsightsSnapshot(context, "2030-01-01");
      expect(afterWriter.revision).not.toBe(warm.revision);
      let source = await readInsightsSource(context);
      expect(valueOf(source, dates[0]!)).toBe(11);
      expect(source.sets.find(row => row.id === done.set)!.actualReps).toBe(12);
      expect(source.sessions.find(row => row.id === done.row)!.name).toBeNull();
      await holder.commit();
      expect((await readInsightsSnapshot(context, "2030-01-01")).revision).not.toBe(afterWriter.revision);
      source = await readInsightsSource(context);
      expect(source.sessions.find(row => row.id === done.row)!.name).toBe("RETENIDA");
      expect(sql(`select session_name from public.workout_sessions where id='${done.row}';`)).toBe("RETENIDA");
    }, 60_000);
  });

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
      expect(reuse.value).toBe(full.value); expect(reuse.requests).toBe(1);
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
