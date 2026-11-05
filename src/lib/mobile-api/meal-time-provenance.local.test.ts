// Disposable local Supabase ONLY: the API must be loopback and the database container disposable. Skipped without the explicit status file.
// OWNLEVEL_INSIGHTS_LOCAL_STATUS=<status.json> OWNLEVEL_INSIGHTS_LOCAL_DB=<db container> npx vitest run src/lib/mobile-api/meal-time-provenance.local.test.ts
// Needs a schema WITHOUT the migration: it writes as an installed client, applies the migration itself, and then checks what happened to those writes.
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
  let admin: SupabaseClient, client: SupabaseClient, stranger: SupabaseClient, anonymous: SupabaseClient, userId: string, sql: (input: string) => string;
  const old = { manualKey: randomUUID(), manualFields: fields({ title: "ANTIGUA", consumedAt: at("13:00") }), manual: "", untimed: "", chatgptTimed: "", chatgptUntimed: "", chatgptKey: randomUUID() };
  const oldIntent = () => ({ operation: "create", sourceDate: DAY, mealId: null, expectedUpdatedAt: null, forceDuplicate: true, idempotencyKey: old.manualKey, fields: old.manualFields });
  const chatgptArgs = (over: Record<string, unknown> = {}) => ({ p_user_id: userId, p_log_date: DAY, p_title: `G${randomUUID().slice(0, 8)}`, p_description: null, p_calories: 500, p_protein_g: 30, p_carbs_g: 60, p_fat_g: 10, p_idempotency_key: randomUUID(), p_force_duplicate: true, ...over });
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
    const signIn = async () => {
      const signedClient = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
      const email = `provenance-${randomUUID()}@example.invalid`, password = randomBytes(24).toString("hex");
      const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (made.error) throw made.error;
      const signed = await signedClient.auth.signInWithPassword({ email, password });
      if (signed.error) throw signed.error;
      return { signedClient, id: made.data.user.id };
    };
    const owner = await signIn(), other = await signIn();
    client = owner.signedClient; userId = owner.id; stranger = other.signedClient;
    anonymous = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });

    // As it is today: an installed client and the deployed ChatGPT functions, before the column exists.
    if (sql("select count(*) from information_schema.columns where table_schema='public' and table_name='meal_entries' and column_name='consumed_at_source';") !== "0") throw Error("Needs a schema without the migration");
    const first = await client.rpc("mobile_mutate_manual_meal", { p_intent: oldIntent() });
    if (first.error || first.data[0].response_status !== 201) throw Error("Old write failed");
    old.manual = first.data[0].response_body.mealId;
    const untimed = await client.rpc("mobile_mutate_manual_meal", { p_intent: { ...oldIntent(), idempotencyKey: randomUUID(), fields: fields({ title: "ANTIGUA SIN HORA" }) } });
    old.untimed = untimed.data[0].response_body.mealId;
    old.chatgptTimed = (await admin.rpc("create_chatgpt_meal_for_integration_v2", chatgptArgs({ p_consumed_at: at("13:00"), p_idempotency_key: old.chatgptKey }))).data.meal.id;
    old.chatgptUntimed = (await admin.rpc("create_chatgpt_meal_for_integration_v2", chatgptArgs())).data.meal.id;

    sql(readFileSync(join(process.cwd(), "supabase/migrations/20261104180000_meal_time_provenance_expand.sql"), "utf8") + "\nnotify pgrst,'reload schema';");
    for (let attempt = 0; attempt < 50; attempt++) {
      const probe = await admin.rpc("create_chatgpt_meal_for_integration_v4", { p_user_id: userId, p_log_date: null, p_title: "x", p_description: null, p_calories: 1, p_protein_g: null, p_carbs_g: null, p_fat_g: null, p_idempotency_key: "probe" });
      if (probe.error?.code !== "PGRST202") break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }, 60_000);

  describe("lo escrito antes del EXPAND", () => {
    it("is left exactly as it was: nothing is inferred, whatever the row looks like", () => {
      for (const id of [old.manual, old.untimed, old.chatgptTimed, old.chatgptUntimed]) expect(source(id)).toBe("NULL");
      expect(sql("select count(*) from public.meal_entries where consumed_at_source is not null and created_at < (select max(created_at) from public.meal_entries where id='" + old.chatgptUntimed + "');")).toBe("0");
    });
    it("replays an old idempotency key with its old payload, without writing", async () => {
      const before = sql(`select updated_at from public.meal_entries where id='${old.manual}';`);
      const replay = await client.rpc("mobile_mutate_manual_meal", { p_intent: oldIntent() });
      expect(replay.error).toBeNull(); expect(replay.data[0]).toMatchObject({ response_status: 201, replayed: true });
      expect(replay.data[0].response_body.mealId).toBe(old.manual);
      expect(sql(`select updated_at from public.meal_entries where id='${old.manual}';`)).toBe(before);
      expect(source(old.manual)).toBe("NULL");
    });
    it("does not let a statement rewrite an old key's request", async () => {
      const reused = await client.rpc("mobile_mutate_manual_meal", { p_intent: { ...oldIntent(), fields: { ...old.manualFields, consumedAtSource: "user_declared" } } });
      expect(reused.data[0].response_body.error).toBe("IDEMPOTENCY_KEY_REUSED");
      expect(source(old.manual)).toBe("NULL");
    });
    it("replays an old ChatGPT key through v4 without marking the existing row", async () => {
      const replay = await admin.rpc("create_chatgpt_meal_for_integration_v4", chatgptArgs({ p_consumed_at: at("13:00"), p_time_source: "user_declared", p_idempotency_key: old.chatgptKey }));
      expect(replay.data).toMatchObject({ created: false, idempotent_replay: true });
      expect(source(old.chatgptTimed)).toBe("NULL");
    });
    it("stays unknown when edited without a statement, and only a statement moves it forward", async () => {
      const updatedAt = sql(`select updated_at from public.meal_entries where id='${old.manual}';`);
      const edited = await edit({ mealId: old.manual, updatedAt }, { title: "Otra", consumedAt: at("13:00") });
      expect(source(old.manual)).toBe("NULL");
      await edit(edited, { title: "Otra", consumedAt: at("13:00"), consumedAtSource: "user_declared" });
      expect(source(old.manual)).toBe("user_declared");
    });
  });

  describe("dueño, permisos y atomicidad", () => {
    it("does not let another account edit a meal or its origin", async () => {
      const meal = await create({ consumedAt: at("13:00") });
      const attempt = await stranger.rpc("mobile_mutate_manual_meal", { p_intent: { operation: "edit", sourceDate: DAY, mealId: meal.mealId, expectedUpdatedAt: meal.updatedAt, forceDuplicate: false, idempotencyKey: randomUUID(), fields: fields({ consumedAt: at("13:00"), consumedAtSource: "user_declared" }) } });
      expect(attempt.data[0].response_status).toBe(404);
      expect(source(meal.mealId)).toBe("NULL");
      const direct = await stranger.from("meal_entries").update({ consumed_at_source: "user_declared" }).eq("id", meal.mealId).select("id");
      expect(direct.data ?? []).toEqual([]);
      expect(source(meal.mealId)).toBe("NULL");
    });
    it("requires a session for the Mobile functions and the service role for ChatGPT's", async () => {
      expect((await anonymous.rpc("mobile_mutate_manual_meal", { p_intent: oldIntent() })).error).not.toBeNull();
      for (const caller of [client, anonymous]) for (const name of ["create_chatgpt_meal_for_integration_v4", "create_chatgpt_meal_for_integration_v2", "create_chatgpt_meal_for_integration_v3"]) expect((await caller.rpc(name, chatgptArgs())).error, name).not.toBeNull();
      const signature = "uuid,date,text,text,integer,numeric,numeric,numeric,text,boolean,timestamptz,text,text";
      expect(sql(`select has_function_privilege('authenticated','public.create_chatgpt_meal_for_integration_v4(${signature})','execute'), has_function_privilege('anon','public.create_chatgpt_meal_for_integration_v4(${signature})','execute'), has_function_privilege('service_role','public.create_chatgpt_meal_for_integration_v4(${signature})','execute');`)).toBe("f|f|t");
    });
    it("checks the OAuth grant before v4 writes, and records the statement when allowed", async () => {
      const ids = { client: randomUUID(), session: randomUUID(), grant: randomUUID() }, resource = "https://www.ownlevel.fit/mcp";
      sql(`insert into auth.oauth_clients(id,registration_type,redirect_uris,grant_types,client_type,token_endpoint_auth_method) values('${ids.client}','manual','http://127.0.0.1:3007/callback','authorization_code,refresh_token','public','none');
        insert into ownlevel_integrations.oauth_clients(client_id,resource,enabled) values('${ids.client}','${resource}',true);
        insert into ownlevel_integrations.oauth_grants(user_id,client_id,grant_id) values('${userId}','${ids.client}','${ids.grant}');
        insert into auth.sessions(id,user_id,oauth_client_id,not_after) values('${ids.session}','${userId}','${ids.client}',now()+interval '1 hour');`);
      const args = (over: Record<string, unknown> = {}) => ({ ...chatgptArgs({ p_consumed_at: at("13:00"), p_meal_label: null, p_time_source: "user_declared" }), p_client_id: ids.client, p_session_id: ids.session, p_grant_id: ids.grant, p_resource: resource, ...over });
      const allowed = await admin.rpc("create_chatgpt_meal_for_oauth_v4", args());
      expect(allowed.error).toBeNull();
      expect(source(allowed.data.meal.id)).toBe("user_declared");
      const denied = await admin.rpc("create_chatgpt_meal_for_oauth_v4", args({ p_grant_id: randomUUID(), p_title: "NO DEBE EXISTIR" }));
      expect(denied.error?.code).toBe("42501");
      expect(sql("select count(*) from public.meal_entries where title='NO DEBE EXISTIR';")).toBe("0");
    });
    it("leaves nothing behind when the write fails after the ledger: same time, same origin, and the key can retry", async () => {
      const meal = await create({ consumedAt: at("13:00"), consumedAtSource: "user_declared" });
      sql(`create function public.test_time_source_failure() returns trigger language plpgsql as $$ begin if new.title='FALLA' then raise exception 'SYNTHETIC_FAILURE'; end if; return new; end; $$;
        create trigger test_time_source_failure before update on public.meal_entries for each row execute function public.test_time_source_failure();`);
      const intent = { operation: "edit", sourceDate: DAY, mealId: meal.mealId, expectedUpdatedAt: meal.updatedAt, forceDuplicate: false, idempotencyKey: randomUUID(), fields: fields({ title: "FALLA", consumedAt: at("15:00") }) };
      const failed = await client.rpc("mobile_mutate_manual_meal", { p_intent: intent });
      sql("drop trigger test_time_source_failure on public.meal_entries; drop function public.test_time_source_failure();");
      expect(failed.error).not.toBeNull();
      expect(source(meal.mealId)).toBe("user_declared");
      expect(sql(`select to_char(consumed_at at time zone 'America/Argentina/Cordoba','HH24:MI') from public.meal_entries where id='${meal.mealId}';`)).toBe("13:00");
      expect(sql(`select count(*) from public.mobile_idempotency_keys where idempotency_key='${intent.idempotencyKey}';`)).toBe("0");
      const retried = await client.rpc("mobile_mutate_manual_meal", { p_intent: intent });
      expect(retried.data[0].response_status).toBe(200);
      expect(source(meal.mealId)).toBe("NULL");
    });
  });

  describe("evidencia legacy en raw_input", () => {
    const POSITIVE = '{"originalTimeKnown":true}';
    const iso = (clock: string) => new Date(at(clock)).toISOString();
    const raw = (id: string) => sql(`select coalesce(raw_input,'NULL') from public.meal_entries where id='${id}';`);
    const dayId = () => sql(`select id from public.day_logs where user_id='${userId}' and log_date='${DAY}';`);
    /** What the importer does, outside any session. */
    const imported = () => {
      const run = randomUUID(), meal = randomUUID();
      sql(`insert into public.nutrition_import_runs(id,user_id,source_name,source_sha256,counts,report) values('${run}','${userId}','sintético','${randomBytes(32).toString("hex")}','{}','{}');
        insert into public.meal_entries(id,user_id,day_log_id,title,final_calories,source_type,entry_kind,consumed_at,raw_input,legacy_import_source,legacy_import_id,import_run_id)
        values('${meal}','${userId}','${dayId()}','IMPORTADA',100,'sheet_import','meal','${iso("13:00")}','${POSITIVE}','sheet','${meal}','${run}');`);
      return { meal, run };
    };
    const row = () => ({ user_id: userId, day_log_id: dayId(), final_calories: 100, source_type: "manual", entry_kind: "meal", consumed_at: iso("10:00") });

    it("does not let a token insert a marker, nor any other text there", async () => {
      await create();
      for (const raw_input of [POSITIVE, '{"originalTimeKnown":false,"timeSource":"registration"}', '{"originalTime\\u004bnown":true}', '{"originalTimeKnown":true,"x":"\\u0000"}', "texto"]) {
        const { error } = await client.from("meal_entries").insert({ ...row(), title: "FORJADA", raw_input }).select("id");
        expect(error?.code, raw_input).toBe("42501");
      }
      expect(sql("select count(*) from public.meal_entries where title='FORJADA';")).toBe("0");
    });
    it("does not let a token add or change a marker by update", async () => {
      const meal = await create({ consumedAt: at("13:00") });
      const added = await client.from("meal_entries").update({ raw_input: POSITIVE }).eq("id", meal.mealId).select("id");
      expect(added.error?.code).toBe("42501");
      expect(raw(meal.mealId)).toBe("NULL");
      const { meal: importedMeal } = imported();
      for (const raw_input of ['{"originalTimeKnown":false}', null]) {
        expect((await client.from("meal_entries").update({ raw_input }).eq("id", importedMeal).select("id")).error?.code).toBe("42501");
        expect(raw(importedMeal)).toBe(POSITIVE);
      }
    });
    it("does not let a token claim a row came from an import, even with its own run", async () => {
      const run = randomUUID(), own = await client.from("nutrition_import_runs").insert({ id: run, user_id: userId, source_name: "x", source_sha256: randomBytes(32).toString("hex"), counts: {}, report: {} }).select("id");
      expect(own.error).toBeNull();
      const forged = { source_type: "sheet_import", legacy_import_source: "x", legacy_import_id: randomUUID(), import_run_id: run };
      expect((await client.from("meal_entries").insert({ ...row(), title: "FORJADA", ...forged }).select("id")).error?.code).toBe("42501");
      const meal = await create();
      expect((await client.from("meal_entries").update(forged).eq("id", meal.mealId).select("id")).error?.code).toBe("42501");
      expect((await client.from("meal_entries").update({ source_type: "sheet_import" }).eq("id", meal.mealId).select("id")).error?.code).toBe("42501");
    });
    it("drops a marker when the time changes directly, and no later step brings it back", async () => {
      const { meal, run } = imported();
      expect((await client.from("meal_entries").update({ consumed_at: iso("16:00") }).eq("id", meal).select("id")).error).toBeNull();
      expect(raw(meal)).toBe("NULL");
      // Going back to the original time does not restore what it was.
      expect((await client.from("meal_entries").update({ consumed_at: iso("13:00") }).eq("id", meal).select("id")).error).toBeNull();
      expect(raw(meal)).toBe("NULL");
      expect((await client.from("meal_entries").update({ raw_input: POSITIVE }).eq("id", meal).select("id")).error?.code).toBe("42501");
      expect(raw(meal)).toBe("NULL");
      // The row is still recognizably imported: that alone never made its time known.
      expect(sql(`select import_run_id from public.meal_entries where id='${meal}';`)).toBe(run);
      // Deleting it and writing it again is a new row of the session, with no evidence.
      expect((await client.from("meal_entries").update({ deleted_at: new Date().toISOString() }).eq("id", meal).select("id")).error).toBeNull();
      expect((await client.from("meal_entries").insert({ ...row(), title: "OTRA VEZ", raw_input: POSITIVE }).select("id")).error?.code).toBe("42501");
    });
    it("drops a marker when a function changes the time too, keeping the rest of the text", async () => {
      const meal = await create({ consumedAt: at("13:00") });
      sql(`update public.meal_entries set raw_input='{"originalTimeKnown":true,"sourceRow":7}' where id='${meal.mealId}';`);
      const updatedAt = sql(`select updated_at from public.meal_entries where id='${meal.mealId}';`);
      await edit({ mealId: meal.mealId, updatedAt }, { consumedAt: at("15:00") });
      expect(JSON.parse(raw(meal.mealId))).toEqual({ sourceRow: 7 });
    });
    it("leaves an import alone when the time does not change", async () => {
      const { meal } = imported();
      expect((await client.from("meal_entries").update({ title: "RENOMBRADA" }).eq("id", meal).select("id")).error).toBeNull();
      expect(raw(meal)).toBe(POSITIVE);
      expect((await client.from("meal_entries").update({ consumed_at: iso("13:00") }).eq("id", meal).select("id")).error).toBeNull();
      expect(raw(meal)).toBe(POSITIVE);
    });
    it("does not rewrite what is already stored, forged or not", async () => {
      const meal = await create();
      sql(`update public.meal_entries set raw_input='${POSITIVE}' where id='${meal.mealId}';`);
      expect((await client.from("meal_entries").update({ title: "OTRA" }).eq("id", meal.mealId).select("id")).error).toBeNull();
      expect(raw(meal.mealId)).toBe(POSITIVE);
    });
    it("keeps the writers that need it: ChatGPT's approximate time and the time cleared from the app", async () => {
      const today = sql("select (now() at time zone 'America/Argentina/Cordoba')::date;");
      const now = await admin.rpc("create_chatgpt_meal_for_integration_v3", chatgptArgs({ p_log_date: today, p_time_source: "registration" }));
      expect(raw(now.data.meal.id)).toContain('"timeSource":"registration"');
      const untimed = await admin.rpc("create_chatgpt_meal_for_integration_v2", chatgptArgs());
      const updatedAt = sql(`select updated_at from public.meal_entries where id='${untimed.data.meal.id}';`);
      await edit({ mealId: untimed.data.meal.id, updatedAt }, { consumedAt: at("13:00"), consumedAtSource: "user_declared" });
      expect(raw(untimed.data.meal.id)).toBe("NULL");
      expect(source(untimed.data.meal.id)).toBe("user_declared");
    });
  });

  describe("una hora automática nunca pasa a declarada", () => {
    const iso = (clock: string) => new Date(at(clock)).toISOString();
    it("does not let a token write a declaration around the functions", async () => {
      const meal = await create();
      const patched = await client.from("meal_entries").update({ consumed_at_source: "user_declared" }).eq("id", meal.mealId).select("id");
      expect(patched.error).not.toBeNull();
      expect(source(meal.mealId)).toBe("default_clock");
    });
    it("does not keep a declaration for a time changed around the functions", async () => {
      const meal = await create({ consumedAt: at("13:00"), consumedAtSource: "user_declared" });
      const patched = await client.from("meal_entries").update({ consumed_at: iso("16:00") }).eq("id", meal.mealId).select("id");
      expect(patched.error).toBeNull();
      expect(source(meal.mealId)).toBe("NULL");
    });
    it("lets Web record its clock on insert, and nothing stronger", async () => {
      const day = sql(`select id from public.day_logs where user_id='${userId}' and log_date='${DAY}';`);
      const row = { user_id: userId, day_log_id: day, final_calories: 100, source_type: "manual", entry_kind: "meal", consumed_at: iso("10:00") };
      const clock = await client.from("meal_entries").insert({ ...row, title: "WEB", consumed_at_source: "default_clock" }).select("id").single();
      expect(clock.error).toBeNull(); expect(source(clock.data!.id)).toBe("default_clock");
      for (const value of ["user_declared", "registration_now", "imported"]) expect((await client.from("meal_entries").insert({ ...row, title: "FALSA", consumed_at_source: value }).select("id")).error, value).not.toBeNull();
      const plain = await client.from("meal_entries").insert({ ...row, title: "SIN" }).select("id").single();
      expect(source(plain.data!.id)).toBe("NULL");
    });
    it("leaves an edit that does not touch the time alone", async () => {
      const meal = await create({ consumedAt: at("13:00"), consumedAtSource: "user_declared" });
      expect((await client.from("meal_entries").update({ title: "WEB EDITA" }).eq("id", meal.mealId).select("id")).error).toBeNull();
      expect(source(meal.mealId)).toBe("user_declared");
    });
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
    const args = chatgptArgs;
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
});
