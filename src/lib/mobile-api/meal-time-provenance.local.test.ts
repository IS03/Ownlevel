// Disposable local Supabase ONLY: the API must be loopback and the database container disposable. Skipped without the explicit status file.
// OWNLEVEL_INSIGHTS_LOCAL_STATUS=<status.json> OWNLEVEL_INSIGHTS_LOCAL_DB=<db container> npx vitest run src/lib/mobile-api/meal-time-provenance.local.test.ts
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildQuickOptions } from "./nutrition-quick-server";

vi.mock("server-only", () => ({}));

const statusFile = process.env.OWNLEVEL_INSIGHTS_LOCAL_STATUS, container = process.env.OWNLEVEL_INSIGHTS_LOCAL_DB;
const DAY = "2026-10-20", OTHER_DAY = "2026-10-21";
const at = (clock: string, day = DAY) => `${day}T${clock}:00-03:00`;
const fields = (over: Record<string, unknown> = {}) => ({ date: DAY, title: "Prueba", description: null, calories: 500, proteinG: 30, carbsG: 60, fatG: 10, ...over });

describe.runIf(!!statusFile && !!container)("procedencia de la hora contra Postgres local descartable", () => {
  let admin: SupabaseClient, client: SupabaseClient, userId: string, sql: (input: string) => string;
  const source = (id: string) => sql(`select coalesce(consumed_at_source,'NULL') from public.meal_entries where id='${id}';`);
  const mutate = async (operation: string, body: Record<string, unknown>) => {
    const { data, error } = await client.rpc("mobile_mutate_manual_meal", { p_intent: { operation, sourceDate: DAY, mealId: null, expectedUpdatedAt: null, forceDuplicate: true, idempotencyKey: randomUUID(), ...body } });
    return { row: data?.[0] as { response_status: number; response_body: { mealId: string; updatedAt: string }; replayed: boolean } | undefined, error };
  };
  const create = async (over: Record<string, unknown> = {}, title = `P${randomUUID().slice(0, 8)}`) => {
    const { row, error } = await mutate("create", { forceDuplicate: false, fields: fields({ title, ...over }) });
    expect(error).toBeNull(); expect(row!.response_status).toBe(201);
    return row!.response_body;
  };
  const edit = async (meal: { mealId: string; updatedAt: string }, over: Record<string, unknown>, sourceDate = DAY) => {
    const { row, error } = await mutate("edit", { forceDuplicate: false, sourceDate, mealId: meal.mealId, expectedUpdatedAt: meal.updatedAt, fields: fields(over) });
    expect(error).toBeNull(); expect(row!.response_status).toBe(200);
    return row!.response_body;
  };

  beforeAll(async () => {
    if (!/^supabase_db_ownlevel-receipt-[a-f0-9]{8}$/.test(container!)) throw Error("Refuse a non-disposable container");
    const status = JSON.parse(readFileSync(statusFile!, "utf8").replace(/^﻿/, ""));
    if (new URL(status.API_URL).hostname !== "127.0.0.1") throw Error("Loopback API required");
    const docker = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs/DockerDesktop/resources/bin/docker.exe") : "docker";
    sql = (input: string) => {
      const run = spawnSync(docker, ["--context", "desktop-linux", "exec", "-i", container!, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input, encoding: "utf8" });
      if (run.status !== 0) throw Error(run.stderr || run.stdout);
      return run.stdout.trim();
    };
    admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
    const email = `provenance-${randomUUID()}@example.invalid`, password = randomBytes(24).toString("hex");
    const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (made.error) throw made.error;
    userId = made.data.user.id;
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
  });

  describe("creación", () => {
    it("records the clock when no time arrives", async () => {
      expect(source((await create()).mealId)).toBe("default_clock");
    });
    it("keeps an old client's time unknown: a time arriving proves nothing", async () => {
      expect(source((await create({ consumedAt: at("13:00") })).mealId)).toBe("NULL");
    });
    it("records a stated time", async () => {
      expect(source((await create({ consumedAt: at("13:00"), consumedAtSource: "user_declared" })).mealId)).toBe("user_declared");
    });
    it.each([[{ consumedAtSource: "user_declared" }], [{ consumedAt: at("13:00"), consumedAtSource: "default_clock" }], [{ consumedAt: at("13:00"), consumedAtSource: "imported" }], [{ consumedAt: at("13:00"), consumedAtSource: null }]])("rejects a statement without a time or outside the contract: %j", async over => {
      const { error } = await mutate("create", { fields: fields(over) });
      expect(error?.message).toBe("INVALID_MEAL_TIME");
    });
    it("keeps the idempotency hash of an old payload, and a statement is a different request", async () => {
      const key = randomUUID(), intent = { operation: "create", sourceDate: DAY, mealId: null, expectedUpdatedAt: null, forceDuplicate: true, idempotencyKey: key };
      const first = await client.rpc("mobile_mutate_manual_meal", { p_intent: { ...intent, fields: fields({ consumedAt: at("13:00") }) } });
      const replay = await client.rpc("mobile_mutate_manual_meal", { p_intent: { ...intent, fields: fields({ consumedAt: at("13:00") }) } });
      expect(first.data[0].response_status).toBe(201); expect(replay.data[0].replayed).toBe(true);
      const stated = await client.rpc("mobile_mutate_manual_meal", { p_intent: { ...intent, fields: fields({ consumedAt: at("13:00"), consumedAtSource: "user_declared" }) } });
      expect(stated.data[0].response_body.error).toBe("IDEMPOTENCY_KEY_REUSED");
    });
  });

  describe("edición", () => {
    it("omitting the time preserves the origin", async () => {
      const meal = await create({ consumedAt: at("13:00"), consumedAtSource: "user_declared" });
      await edit(meal, { title: "Otra" });
      expect(source(meal.mealId)).toBe("user_declared");
    });
    it("resending the same value without a statement preserves the origin", async () => {
      const meal = await create({ consumedAt: at("13:00"), consumedAtSource: "user_declared" });
      await edit(meal, { consumedAt: at("13:00") });
      expect(source(meal.mealId)).toBe("user_declared");
    });
    it("resending a clock time does not turn it into a stated one", async () => {
      const meal = await create();
      // Place it on the test day: the server stamped today's clock, and a time must stay on the meal's own day.
      const updatedAt = sql(`update public.meal_entries set consumed_at='${at("12:00")}' where id='${meal.mealId}' returning updated_at;`).split("\n")[0]!;
      await edit({ mealId: meal.mealId, updatedAt }, { consumedAt: at("12:00") });
      expect(source(meal.mealId)).toBe("default_clock");
    });
    it("records an explicit edit even when the chosen value equals the previous one", async () => {
      const meal = await create({ consumedAt: at("13:00") });
      expect(source(meal.mealId)).toBe("NULL");
      await edit(meal, { consumedAt: at("13:00"), consumedAtSource: "user_declared" });
      expect(source(meal.mealId)).toBe("user_declared");
    });
    it("a different time without a statement can no longer be vouched for", async () => {
      const meal = await create({ consumedAt: at("13:00"), consumedAtSource: "user_declared" });
      await edit(meal, { consumedAt: at("15:30") });
      expect(source(meal.mealId)).toBe("NULL");
    });
    it("a different time with a statement is recorded", async () => {
      const meal = await create();
      await edit(meal, { consumedAt: at("15:30"), consumedAtSource: "user_declared" });
      expect(source(meal.mealId)).toBe("user_declared");
    });
    it("a move to another day at the same clock time preserves the origin; another clock time does not", async () => {
      const meal = await create({ consumedAt: at("13:00"), consumedAtSource: "user_declared" });
      const moved = await edit(meal, { date: OTHER_DAY, consumedAt: at("13:00", OTHER_DAY) });
      expect(source(meal.mealId)).toBe("user_declared");
      await edit({ mealId: meal.mealId, updatedAt: moved.updatedAt }, { date: DAY, consumedAt: at("14:00") }, OTHER_DAY);
      expect(source(meal.mealId)).toBe("NULL");
    });
    it("deleting leaves it as it was", async () => {
      const meal = await create({ consumedAt: at("13:00"), consumedAtSource: "user_declared" });
      const { row } = await mutate("delete", { mealId: meal.mealId, expectedUpdatedAt: meal.updatedAt, fields: null, forceDuplicate: false });
      expect(row!.response_status).toBe(200);
      expect(source(meal.mealId)).toBe("user_declared");
    });
  });

  describe("registro rápido", () => {
    const confirm = async (over: Record<string, unknown>) => {
      const name = `H${randomUUID().slice(0, 8)}`.toUpperCase();
      sql(`insert into public.saved_meals(user_id,name,template_type,calories,protein_g,carbs_g,fat_g) values('${userId}','${name}','manual',400,20,50,10);`);
      const options = await client.rpc("mobile_read_quick_options", {}, { get: true });
      const parsed = buildQuickOptions(options.data);
      if (!parsed || parsed.saved.status !== "ok") throw Error("Quick options unavailable");
      const option = parsed.saved.items.find((item: { name: string }) => item.name === name)!;
      return client.rpc("mobile_confirm_quick_meal", { p_intent: { operation: "register", date: DAY, source: option.source, quantities: null, idempotencyKey: randomUUID(), ...over } });
    };
    it.each([[{}, "default_clock"], [{ consumedAt: at("09:00") }, "NULL"], [{ consumedAt: at("09:00"), consumedAtSource: "user_declared" }, "user_declared"]])("%j is recorded as %s", async (over, expected) => {
      const { data, error } = await confirm(over);
      expect(error).toBeNull(); expect(data[0].response_status).toBe(201);
      expect(source(data[0].response_body.resourceId)).toBe(expected);
    });
    it("rejects a statement without a time", async () => {
      expect((await confirm({ consumedAtSource: "user_declared" })).error?.message).toBe("INVALID_MEAL_TIME");
    });
  });

  describe("ChatGPT", () => {
    const args = (over: Record<string, unknown> = {}) => ({ p_user_id: userId, p_log_date: DAY, p_title: `G${randomUUID().slice(0, 8)}`, p_description: null, p_calories: 500, p_protein_g: 30, p_carbs_g: 60, p_fat_g: 10, p_idempotency_key: randomUUID(), p_force_duplicate: true, ...over });
    const created = (data: { meal: { id: string } }) => data.meal.id;
    it("v2 without a time records the clock, and with a time leaves the origin unknown", async () => {
      const clock = await admin.rpc("create_chatgpt_meal_for_integration_v2", args());
      expect(source(created(clock.data))).toBe("default_clock");
      const time = await admin.rpc("create_chatgpt_meal_for_integration_v2", args({ p_consumed_at: at("13:00") }));
      expect(source(created(time.data))).toBe("NULL");
    });
    it("v1 still answers and records the clock", async () => {
      const { data } = await admin.rpc("create_chatgpt_meal_for_integration", args());
      expect(source(created(data))).toBe("default_clock");
    });
    it("v3 records a meal eaten now and keeps its legacy marker", async () => {
      const today = sql(`select (now() at time zone 'America/Argentina/Cordoba')::date;`);
      const { data, error } = await admin.rpc("create_chatgpt_meal_for_integration_v3", args({ p_log_date: today, p_time_source: "registration" }));
      expect(error).toBeNull();
      expect(source(created(data))).toBe("registration_now");
      expect(sql(`select raw_input from public.meal_entries where id='${created(data)}';`)).toContain('"timeSource":"registration"');
    });
    it("v4 records a stated time, marks it only once, and refuses a statement without a time", async () => {
      const key = randomUUID(), stated = args({ p_consumed_at: at("13:00"), p_time_source: "user_declared", p_idempotency_key: key });
      const first = await admin.rpc("create_chatgpt_meal_for_integration_v4", stated);
      expect(source(created(first.data))).toBe("user_declared");
      const replay = await admin.rpc("create_chatgpt_meal_for_integration_v4", stated);
      expect(replay.data).toMatchObject({ created: false, idempotent_replay: true });
      expect((await admin.rpc("create_chatgpt_meal_for_integration_v4", args({ p_time_source: "user_declared" }))).error?.message).toBe("invalid_request");
      expect((await admin.rpc("create_chatgpt_meal_for_integration_v4", args({ p_consumed_at: at("13:00"), p_time_source: "registration" }))).error?.message).toBe("invalid_request");
    });
    it("a user token cannot call the integration functions", async () => {
      expect((await client.rpc("create_chatgpt_meal_for_integration_v4", args())).error).not.toBeNull();
    });
  });

  it("never backfills: a row written without the column stays unknown, whatever its timestamps say", async () => {
    const id = sql(`set local role postgres; insert into public.day_logs(user_id,log_date) values('${userId}','2026-09-01') on conflict do nothing;
      insert into public.meal_entries(user_id,day_log_id,final_calories,source_type,entry_kind,consumed_at) select '${userId}',id,100,'manual','meal',now() from public.day_logs where user_id='${userId}' and log_date='2026-09-01' returning id;`).split("\n").find(line => /^[0-9a-f-]{36}$/.test(line))!;
    expect(source(id)).toBe("NULL");
    const { error } = await client.from("meal_entries").update({ consumed_at_source: "nonsense" }).eq("id", id);
    expect(error).not.toBeNull();
  });
});
