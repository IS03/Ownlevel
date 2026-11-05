// Disposable local Supabase ONLY (#367 sleep night and body weight): PostgreSQL + PostgREST + Auth, never a remote project.
// Needs this branch's schema with 20261107120000 applied. Skipped without the status file.
// OWNLEVEL_INSIGHTS_LOCAL_STATUS=<status.json> OWNLEVEL_INSIGHTS_LOCAL_DB=<db container> npx vitest run src/lib/mobile-api/sleep-weight.local.test.ts
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { insightsSummary } from "../progress/insights-engine";
import { clearInsightsSnapshots, readInsightsSnapshot, readInsightsSource } from "./performance-insights-server";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";

vi.mock("server-only", () => ({}));
const statusFile = process.env.OWNLEVEL_INSIGHTS_LOCAL_STATUS, container = process.env.OWNLEVEL_INSIGHTS_LOCAL_DB;
const contextOf = (id: string, client: SupabaseClient) => ({ userId: id, supabase: client }) as unknown as MobileSupabaseAuthenticatedContext;
const DAY = "2026-04-07";

describe.runIf(!!statusFile && !!container)("sueño y peso con PostgREST real", () => {
  let sql: (input: string) => string;
  let owner: { id: string; client: SupabaseClient; requests: () => number }, other: { id: string; client: SupabaseClient };
  let sleep: string, steps: string;
  const sleepOf = async (date = DAY) => (await readInsightsSource(contextOf(owner.id, owner.client))).metricValues.find(row => row.metricId === sleep && row.date === date);
  const counter = () => Number(sql(`select coalesce((select revision from public.insights_source_revisions where user_id='${owner.id}'),0);`));
  const definition = (metric: string) => sql(`select to_json(updated_at)#>>'{}' from public.user_metrics where id='${metric}';`);
  const valueStamp = (date = DAY) => sql(`select to_json(updated_at)#>>'{}' from public.daily_metric_values where metric_id='${sleep}' and metric_date='${date}';`) || null;
  const mobile = (date: string, value: number | null, ids: string[], key = randomUUID()) => owner.client.rpc(ids.length ? "mobile_mutate_nutrition_day_v2" : "mobile_mutate_nutrition_day", {
    p_intent: { operation: "metrics", date, idempotencyKey: key, changes: [{ metricId: sleep, definitionUpdatedAt: definition(sleep), expectedUpdatedAt: valueStamp(date), value }] },
    ...(ids.length ? { p_sleep_night_metric_ids: ids } : {}) });

  beforeAll(async () => {
    if (!/^supabase_db_ownlevel-receipt-[a-f0-9]{8}$/.test(container!)) throw Error("Refuse a non-disposable container");
    const status = JSON.parse(readFileSync(statusFile!, "utf8").replace(/^﻿/, ""));
    if (new URL(status.API_URL).hostname !== "127.0.0.1") throw Error("Loopback API required");
    const docker = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs/DockerDesktop/resources/bin/docker.exe") : "docker";
    sql = (input: string) => {
      const run = spawnSync(docker, ["--context", "desktop-linux", "exec", "-i", container!, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input, encoding: "utf8", maxBuffer: 1 << 26 });
      if (run.status !== 0) throw Error(run.stderr || run.stdout);
      return run.stdout.trim();
    };
    expect(sql("select current_setting('server_version');")).toMatch(/^17\.6/);
    expect(sql("select to_regclass('public.daily_metric_value_conventions') is not null;")).toBe("t");
    const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const signIn = async () => {
      let requests = 0;
      const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false }, global: { fetch: async (...args: Parameters<typeof fetch>) => { requests++; return fetch(...args); } } });
      const email = `sleep-${randomUUID()}@example.invalid`, password = randomBytes(24).toString("hex");
      const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (made.error) throw made.error;
      const signed = await client.auth.signInWithPassword({ email, password });
      if (signed.error) throw signed.error;
      sql(`insert into public.profiles(user_id) values('${made.data.user.id}') on conflict do nothing;`);
      const ensured = await client.rpc("ensure_user_metrics");
      if (ensured.error) throw ensured.error;
      return { id: made.data.user.id, client, requests: () => requests };
    };
    owner = await signIn(); other = await signIn();
    sleep = sql(`select id from public.user_metrics where user_id='${owner.id}' and system_key='sleep';`);
    steps = sql(`select id from public.user_metrics where user_id='${owner.id}' and system_key='steps';`);
    expect(sleep).toMatch(/^[0-9a-f-]{36}$/);
  }, 120_000);

  it("Web: the v2 save declares the night with the write; the v1 save and a direct upsert, as older clients, never do", async () => {
    expect((await owner.client.rpc("save_daily_metric_values_v2", { p_metric_date: DAY, p_values: { [sleep]: 420, [steps]: 9000 }, p_historical: false, p_sleep_night_metric_ids: [sleep] })).error).toBeNull();
    expect((await sleepOf())?.sleepNight).toBe("declared");
    // The embed PostgREST really returns: an object, one-to-one by primary key.
    const embed = await owner.client.from("daily_metric_values").select("metric_date,night:daily_metric_value_conventions(convention)").eq("metric_id", sleep).eq("metric_date", DAY).single();
    expect(embed.data?.night).toEqual({ convention: "sleep_night_ending_on_date/1" });
    // An older Web save edits the value: the declaration no longer matches it.
    expect((await owner.client.rpc("save_daily_metric_values", { p_metric_date: DAY, p_values: { [sleep]: 430 }, p_historical: false })).error).toBeNull();
    expect((await sleepOf())?.sleepNight).toBe("stale_declaration");
    expect((await owner.client.rpc("save_daily_metric_values_v2", { p_metric_date: DAY, p_values: { [sleep]: 440 }, p_historical: false, p_sleep_night_metric_ids: [sleep] })).error).toBeNull();
    expect((await sleepOf())?.sleepNight).toBe("declared");
    expect((await owner.client.from("daily_metric_values").update({ value: 450 }).eq("metric_id", sleep).eq("metric_date", DAY)).error).toBeNull();
    expect((await sleepOf())?.sleepNight).toBe("stale_declaration");
    // A wrapper call cannot declare a metric that is not sleep, nor one it did not write.
    expect((await owner.client.rpc("save_daily_metric_values_v2", { p_metric_date: DAY, p_values: { [steps]: 1 }, p_historical: false, p_sleep_night_metric_ids: [steps] })).error?.message).toBe("NOT_A_SLEEP_METRIC");
    expect((await owner.client.rpc("save_daily_metric_values_v2", { p_metric_date: DAY, p_values: { [steps]: 2 }, p_historical: false, p_sleep_night_metric_ids: [sleep] })).error?.message).toBe("INVALID_SLEEP_DECLARATION");
    expect((await sleepOf())?.sleepNight).toBe("stale_declaration");
  });

  it("explicit confirmation needs the exact version; nobody writes the table directly; another account sees nothing", async () => {
    expect((await owner.client.rpc("declare_sleep_night_v1", { p_date: DAY, p_metric_id: sleep, p_expected_updated_at: "2020-01-01T00:00:00Z" })).error?.message).toBe("SLEEP_VALUE_CHANGED");
    expect((await owner.client.rpc("declare_sleep_night_v1", { p_date: DAY, p_metric_id: steps, p_expected_updated_at: valueStamp() })).error?.message).toBe("NOT_A_SLEEP_METRIC");
    expect((await owner.client.rpc("declare_sleep_night_v1", { p_date: DAY, p_metric_id: sleep, p_expected_updated_at: valueStamp() })).error).toBeNull();
    expect((await sleepOf())?.sleepNight).toBe("declared");
    const valueId = sql(`select id from public.daily_metric_values where metric_id='${sleep}' and metric_date='${DAY}';`);
    for (const write of [owner.client.from("daily_metric_value_conventions").update({ declared_value: 1 }).eq("value_id", valueId),
      owner.client.from("daily_metric_value_conventions").delete().eq("value_id", valueId),
      owner.client.from("daily_metric_value_conventions").insert({ value_id: valueId, user_id: owner.id, convention: "sleep_night_ending_on_date/1", declared_updated_at: valueStamp(), declared_value: 450, declared_date: DAY })])
      expect((await write).error?.code).toBe("42501");
    expect((await other.client.from("daily_metric_value_conventions").select("*")).data).toEqual([]);
    expect((await other.client.rpc("declare_sleep_night_v1", { p_date: DAY, p_metric_id: sleep, p_expected_updated_at: valueStamp() })).error?.message).toBe("NOT_A_SLEEP_METRIC");
    // A value never moves to another date: the domain refuses it. Changing the date is a delete and a new value, and the
    // delete takes the declaration with it.
    expect(() => sql(`update public.daily_metric_values set metric_date='2026-04-06' where metric_id='${sleep}' and metric_date='${DAY}';`)).toThrow(/daily_metric_identity_is_immutable/);
    sql(`delete from public.daily_metric_values where id='${valueId}';`);
    expect(sql(`select count(*) from public.daily_metric_value_conventions where value_id='${valueId}';`)).toBe("0");
  });

  it("Mobile: v2 declares with the write; a replay declares nothing new; v1 and a clear leave nothing declared", async () => {
    const date = "2026-04-08", key = randomUUID();
    const first = await mobile(date, 480, [sleep], key);
    expect(first.data?.[0]).toMatchObject({ response_status: 200, replayed: false });
    expect((await sleepOf(date))?.sleepNight).toBe("declared");
    const declaredAt = sql(`select declared_at from public.daily_metric_value_conventions c join public.daily_metric_values v on v.id=c.value_id where v.metric_id='${sleep}' and v.metric_date='${date}';`);
    // The answer was lost: the identical request replays its receipt and touches nothing.
    const again = await owner.client.rpc("mobile_mutate_nutrition_day_v2", { p_intent: { operation: "metrics", date, idempotencyKey: key, changes: [{ metricId: sleep, definitionUpdatedAt: definition(sleep), expectedUpdatedAt: null, value: 480 }] }, p_sleep_night_metric_ids: [sleep] });
    expect(again.data?.[0]).toMatchObject({ response_status: 200, replayed: true });
    expect(sql(`select declared_at from public.daily_metric_value_conventions c join public.daily_metric_values v on v.id=c.value_id where v.metric_id='${sleep}' and v.metric_date='${date}';`)).toBe(declaredAt);
    expect((await mobile(date, 490, [])).data?.[0]).toMatchObject({ response_status: 200 });
    expect((await sleepOf(date))?.sleepNight).toBe("stale_declaration");
    expect((await mobile(date, null, [sleep])).data?.[0]).toMatchObject({ response_status: 200 });
    expect(await sleepOf(date)).toBeUndefined();
    expect(sql(`select count(*) from public.daily_metric_value_conventions c join public.daily_metric_values v on v.id=c.value_id where v.metric_id='${sleep}' and v.metric_date='${date}';`)).toBe("0");
  });

  it("weight: read from the session's day in the same page, and a correction invalidates the cached answer", async () => {
    const session = randomUUID(), exercise = randomUUID();
    sql(`select set_config('request.jwt.claim.sub','${owner.id}',false);
      insert into public.day_logs(user_id,log_date,weight_kg) values('${owner.id}','2026-04-09',80.4) on conflict (user_id,log_date) do update set weight_kg=excluded.weight_kg;
      insert into public.exercises(id,user_id,nombre,weight_mode) values('${exercise}','${owner.id}','SYNTHETIC','Peso total');
      insert into public.workout_sessions(id,user_id,day_log_id,started_at) select '${session}','${owner.id}',id,'2026-04-09T18:00:00Z' from public.day_logs where user_id='${owner.id}' and log_date='2026-04-09';
      insert into public.workout_session_exercises(user_id,workout_session_id,exercise_id,exercise_order) values('${owner.id}','${session}','${exercise}',1);
      update public.workout_sessions set status='completed',ended_at='2026-04-09T19:00:00Z' where id='${session}';`);
    const before = owner.requests();
    const source = await readInsightsSource(contextOf(owner.id, owner.client));
    // Seven streams of one page each: weight and the night ride in the pages already read.
    expect(owner.requests() - before).toBe(7);
    expect(source.sessions.find(row => row.id === session)?.dayWeightKg).toBe(80.4);
    clearInsightsSnapshots();
    const first = await readInsightsSnapshot(contextOf(owner.id, owner.client), "2026-05-01", 2);
    expect(insightsSummary(first).facts.days.find(day => day.date === "2026-04-09")?.context.bodyWeight).toEqual({ value: 80.4, state: "recorded" });
    const moved = counter();
    sql(`update public.day_logs set weight_kg=81 where user_id='${owner.id}' and log_date='2026-04-09';`);
    expect(counter()).toBe(moved + 1);
    const after = await readInsightsSnapshot(contextOf(owner.id, owner.client), "2026-05-01", 2);
    expect(after.revision).not.toBe(first.revision);
    expect(insightsSummary(after).facts.days.find(day => day.date === "2026-04-09")?.context.bodyWeight).toEqual({ value: 81, state: "recorded" });
    // Method 1 is its own entry: it never serves, or is served, a method 2 answer.
    expect(insightsSummary(await readInsightsSnapshot(contextOf(owner.id, owner.client), "2026-05-01")).methodVersion).toBe("insights-engine/1");
  }, 60_000);
});

describe.runIf(!!statusFile && !!container && !!process.env.OWNLEVEL_LOADER_COST_OUT)("costo del loader: las dos lecturas que cambian", () => {
  it("times the old and the new select of sessions and of metric values, same rows, alternated", async () => {
    const status = JSON.parse(readFileSync(statusFile!, "utf8").replace(/^\uFEFF/, ""));
    const docker = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs/DockerDesktop/resources/bin/docker.exe") : "docker";
    const sql = (input: string) => { const run = spawnSync(docker, ["--context", "desktop-linux", "exec", "-i", container!, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input, encoding: "utf8", maxBuffer: 1 << 26 }); if (run.status !== 0) throw Error(run.stderr); return run.stdout.trim(); };
    const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
    const email = `cost-${randomUUID()}@example.invalid`, password = randomBytes(24).toString("hex");
    const made = await admin.auth.admin.createUser({ email, password, email_confirm: true }); if (made.error) throw made.error;
    await client.auth.signInWithPassword({ email, password }); const id = made.data.user.id;
    sql(`insert into public.profiles(user_id) values('${id}') on conflict do nothing;`); await client.rpc("ensure_user_metrics");
    // One year: a session every other day with its weight, a sleep value every day, half of them declared.
    sql(`select set_config('request.jwt.claim.sub','${id}',false);
      insert into public.day_logs(user_id,log_date,weight_kg) select '${id}',d::date,80+(extract(doy from d)::int%10)/10.0 from generate_series('2025-01-01'::date,'2025-12-31'::date,'1 day') d;
      insert into public.workout_sessions(user_id,day_log_id,started_at,status,ended_at) select '${id}',l.id,l.log_date+time '18:00','completed',l.log_date+time '19:00' from public.day_logs l where l.user_id='${id}' and extract(doy from l.log_date)::int%2=0;
      insert into public.daily_metric_values(user_id,metric_id,metric_date,value) select '${id}',m.id,l.log_date,420 from public.day_logs l, public.user_metrics m where l.user_id='${id}' and m.user_id='${id}' and m.system_key='sleep';
      insert into public.daily_metric_value_conventions(value_id,user_id,convention,declared_updated_at,declared_value,declared_date) select v.id,v.user_id,'sleep_night_ending_on_date/1',v.updated_at,v.value,v.metric_date from public.daily_metric_values v where v.user_id='${id}' and extract(doy from v.metric_date)::int%2=0;`);
    const selects = {
      sessionsBefore: () => client.from("workout_sessions").select("id,routine_id,routine_name_snapshot,session_name,status,started_at,ended_at,energy_level,performance_level,pain_level,day:day_logs!inner(log_date)").eq("user_id", id).eq("status", "completed").order("id").range(0, 999),
      sessionsAfter: () => client.from("workout_sessions").select("id,routine_id,routine_name_snapshot,session_name,status,started_at,ended_at,energy_level,performance_level,pain_level,day:day_logs!inner(log_date,weight_kg)").eq("user_id", id).eq("status", "completed").order("id").range(0, 999),
      valuesBefore: () => client.from("daily_metric_values").select("id,metric_id,metric_date,value").eq("user_id", id).order("id").range(0, 999),
      valuesAfter: () => client.from("daily_metric_values").select("id,metric_id,metric_date,value,updated_at,night:daily_metric_value_conventions(convention,declared_updated_at,declared_value,declared_date)").eq("user_id", id).order("id").range(0, 999),
    };
    const times: Record<string, number[]> = {}, bytes: Record<string, number> = {};
    for (let round = 0; round < 12; round++) for (const [key, run] of Object.entries(selects)) {
      const started = performance.now(), { data, error } = await run(); if (error) throw error;
      (times[key] ??= []).push(performance.now() - started); bytes[key] = JSON.stringify(data).length;
    }
    const median = (rows: number[]) => [...rows].sort((a, b) => a - b)[rows.length >> 1]!;
    const result = Object.fromEntries(Object.entries(times).map(([key, rows]) => [key, { medianMs: Math.round(median(rows.slice(2)) * 10) / 10, bytes: bytes[key] }]));
    writeFileSync(process.env.OWNLEVEL_LOADER_COST_OUT!, JSON.stringify(result, null, 2));
    expect(Object.keys(result)).toHaveLength(4);
  }, 120_000);
});
