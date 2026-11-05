// Disposable local Supabase ONLY (#367 configuration): PostgreSQL + PostgREST + Auth, never a remote project. Skipped without the status file.
// Needs the schema of this branch with 20261105211040 and 20261106120000 applied: run insights-source-revision.local.test.ts first,
// which applies both, or apply them by hand.
// OWNLEVEL_INSIGHTS_LOCAL_STATUS=<status.json> OWNLEVEL_INSIGHTS_LOCAL_DB=<db container> npx vitest run src/lib/mobile-api/exercise-configuration.local.test.ts
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { insightsSummary } from "../progress/insights-engine";
import { parseConfigurationsResponse } from "./training-exercise-configuration-contract";
import { clearInsightsSnapshots, readInsightsSnapshot, readInsightsSource } from "./performance-insights-server";
import type { MobileSupabaseAuthenticatedContext } from "./supabase";

vi.mock("server-only", () => ({}));
const statusFile = process.env.OWNLEVEL_INSIGHTS_LOCAL_STATUS, container = process.env.OWNLEVEL_INSIGHTS_LOCAL_DB;
const contextOf = (id: string, client: SupabaseClient) => ({ userId: id, supabase: client }) as unknown as MobileSupabaseAuthenticatedContext;
const recorded = (label: string, source = "entered", repeatedFrom: string | null = null) => ({ kind: "recorded", label, source, repeatedFrom });

describe.runIf(!!statusFile && !!container)("configuración por sesión con PostgREST real", () => {
  let sql: (input: string) => string, anonymous: SupabaseClient;
  let owner: { id: string; client: SupabaseClient }, other: { id: string; client: SupabaseClient };
  const exercise = randomUUID();
  const sessions: string[] = [], blocks: string[] = [];
  const mutate = (who: { client: SupabaseClient }, session: string, body: Record<string, unknown>) =>
    who.client.rpc("mutate_training_exercise_configuration_v1", { p_session_id: session, p_input: { contractVersion: "training-exercise-configuration/1", ...body } });
  const read = async (session: string, who = owner) => {
    const { data, error } = await who.client.rpc("read_training_exercise_configurations_v1", { p_session_id: session });
    if (error) throw error;
    return parseConfigurationsResponse(data);
  };
  const revisionOf = (block: string) => sql(`select coalesce((select revision from public.workout_session_exercise_configurations where session_exercise_id='${block}'),0);`);
  const counter = () => Number(sql(`select coalesce((select revision from public.insights_source_revisions where user_id='${owner.id}'),0);`));

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
    expect(sql("select to_regclass('public.workout_session_exercise_configurations') is not null and to_regclass('public.insights_source_revisions') is not null;")).toBe("t");
    const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    anonymous = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
    const signIn = async () => {
      const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
      const email = `configuration-${randomUUID()}@example.invalid`, password = randomBytes(24).toString("hex");
      const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (made.error) throw made.error;
      const signed = await client.auth.signInWithPassword({ email, password });
      if (signed.error) throw signed.error;
      sql(`insert into public.profiles(user_id) values('${made.data.user.id}') on conflict do nothing;`);
      return { id: made.data.user.id, client };
    };
    owner = await signIn(); other = await signIn();
    // Four completed sessions of one exercise, a day apart, 50 kg x 8, 9, 10, 11. The fourth has two blocks of the same exercise.
    sql(`select set_config('request.jwt.claim.sub','${owner.id}',false);
      insert into public.exercises(id,user_id,nombre,weight_mode,implement) values('${exercise}','${owner.id}','SYNTHETIC PRESS','Peso total','Mancuerna');`);
    for (let day = 1; day <= 4; day++) {
      const session = randomUUID(), date = `2026-03-0${day}`;
      sessions.push(session);
      const ids = day === 4 ? [randomUUID(), randomUUID()] : [randomUUID()];
      blocks.push(...ids);
      sql(`select set_config('request.jwt.claim.sub','${owner.id}',false);
        insert into public.day_logs(user_id,log_date) values('${owner.id}','${date}') on conflict do nothing;
        insert into public.workout_sessions(id,user_id,day_log_id,started_at) select '${session}','${owner.id}',l.id,'${date}T18:00:00Z' from public.day_logs l where l.user_id='${owner.id}' and l.log_date='${date}';
        ${ids.map((block, index) => `insert into public.workout_session_exercises(id,user_id,workout_session_id,exercise_id,exercise_order) values('${block}','${owner.id}','${session}','${exercise}',${index + 1});`).join("\n")}
        -- The exercise first: completing it syncs the legacy columns into its sets, so the sets are written after.
        update public.workout_session_exercises set is_completed=true where workout_session_id='${session}';
        update public.workout_sets t set actual_reps=${7 + day},actual_weight_kg=50,is_completed=true from public.workout_session_exercises x where x.id=t.workout_session_exercise_id and x.workout_session_id='${session}';
        update public.workout_sessions set status='completed',ended_at='${date}T19:00:00Z' where id='${session}';`);
    }
    sql("notify pgrst,'reload schema';");
  }, 120_000);

  it("RLS: cada cuenta lee lo suyo, nadie escribe directo y sin sesión no hay lectura", async () => {
    expect((await mutate(owner, sessions[0]!, { sessionExerciseId: blocks[0], expectedRevision: 0, value: recorded("Agarre neutro"), idempotencyKey: "rls-1" })).error).toBeNull();
    const own = await owner.client.from("workout_session_exercise_configurations").select("session_exercise_id,kind,label");
    expect(own.data).toEqual([{ session_exercise_id: blocks[0], kind: "recorded", label: "Agarre neutro" }]);
    expect((await other.client.from("workout_session_exercise_configurations").select("*")).data).toEqual([]);
    expect((await anonymous.from("workout_session_exercise_configurations").select("*")).error?.code).toBe("42501");
    for (const write of [
      owner.client.from("workout_session_exercise_configurations").insert({ session_exercise_id: blocks[1], user_id: owner.id, revision: 1, kind: "not_applicable", source: "entered", updated_at: new Date().toISOString() }),
      owner.client.from("workout_session_exercise_configurations").update({ label: "X" }).eq("session_exercise_id", blocks[0]!),
      owner.client.from("workout_session_exercise_configurations").delete().eq("session_exercise_id", blocks[0]!),
    ]) expect((await write).error?.code).toBe("42501");
    expect(sql(`select label from public.workout_session_exercise_configurations where session_exercise_id='${blocks[0]}';`)).toBe("Agarre neutro");
    const foreign = await mutate(other, sessions[0]!, { sessionExerciseId: blocks[0], expectedRevision: 1, value: null, idempotencyKey: "rls-2" });
    expect(foreign.error?.message).toBe("TRAINING_SESSION_NOT_FOUND");
    expect((await other.client.rpc("read_training_exercise_configurations_v1", { p_session_id: sessions[0] })).error?.message).toBe("TRAINING_SESSION_NOT_FOUND");
    expect((await anonymous.rpc("read_training_exercise_configurations_v1", { p_session_id: sessions[0] })).error).not.toBeNull();
  });

  it("RPC: CAS, replay de una respuesta perdida, clave reutilizada, borrado explícito y No aplica", async () => {
    const body = { sessionExerciseId: blocks[1], expectedRevision: 0, value: recorded("  agarre   NEUTRO "), idempotencyKey: "cas-1" };
    const first = await mutate(owner, sessions[1]!, body);
    expect(first.error).toBeNull();
    // The answer is lost; the client sends the identical request again and gets the identical answer, marked as a replay.
    const again = await mutate(owner, sessions[1]!, body);
    expect(again.data[0].response_body).toEqual(first.data[0].response_body);
    expect([first.data[0].replayed, again.data[0].replayed]).toEqual([false, true]);
    expect(revisionOf(blocks[1]!)).toBe("1");
    expect((await mutate(owner, sessions[1]!, { ...body, value: recorded("Otra") })).error?.message).toBe("IDEMPOTENCY_KEY_REUSED");
    expect((await mutate(owner, sessions[1]!, { ...body, idempotencyKey: "cas-stale", value: recorded("Otra") })).error?.message).toBe("CONFIGURATION_CHANGED");
    expect((await mutate(owner, sessions[1]!, { ...body, idempotencyKey: "cas-omit", value: undefined })).error?.message).toBe("INVALID_CONFIGURATION_INPUT");
    const cleared = await mutate(owner, sessions[1]!, { sessionExerciseId: blocks[1], expectedRevision: 1, value: null, idempotencyKey: "cas-clear" });
    expect(parseConfigurationsResponse(cleared.data[0].response_body).items[0]).toMatchObject({ revision: 2, value: null });
    const na = await mutate(owner, sessions[1]!, { sessionExerciseId: blocks[1], expectedRevision: 2, value: { kind: "not_applicable", label: null, source: "entered", repeatedFrom: null }, idempotencyKey: "cas-na" });
    expect(parseConfigurationsResponse(na.data[0].response_body).items[0]!.value?.kind).toBe("not_applicable");
  });

  it("«Como la última vez»: ofrece el valor anterior y solo acepta esa fila con ese valor", async () => {
    const state = await read(sessions[2]!);
    // Session 2 holds "not applicable" now: that is the latest single value before session 3.
    expect(state.items[0]!.previous).toMatchObject({ sessionExerciseId: blocks[1], value: { kind: "not_applicable", label: null } });
    expect((await mutate(owner, sessions[2]!, { sessionExerciseId: blocks[2], expectedRevision: 0, value: recorded("Agarre neutro", "repeated_previous", blocks[1]!), idempotencyKey: "rep-wrong" })).error?.message).toBe("REPEATED_CONFIGURATION_MISMATCH");
    expect((await mutate(owner, sessions[2]!, { sessionExerciseId: blocks[2], expectedRevision: 0, value: recorded("Agarre neutro", "repeated_previous", blocks[3]!), idempotencyKey: "rep-later" })).error?.message).toBe("REPEATED_CONFIGURATION_MISMATCH");
    expect((await mutate(owner, sessions[2]!, { sessionExerciseId: blocks[2], expectedRevision: 0, value: recorded("Agarre neutro", "repeated_previous", blocks[0]!), idempotencyKey: "rep-ok" })).error).toBeNull();
    expect((await read(sessions[2]!)).items[0]!.value).toEqual(recorded("Agarre neutro", "repeated_previous", blocks[0]!));
  });

  it("PostgREST embebe la configuración como objeto (uno a uno), y nulo sin fila", async () => {
    const { data, error } = await owner.client.from("workout_session_exercises").select("id,configuration:workout_session_exercise_configurations(kind,label)").in("id", [blocks[0]!, blocks[3]!]).order("id");
    expect(error).toBeNull();
    const byId = new Map(data!.map(row => [row.id, row.configuration]));
    expect(byId.get(blocks[0]!)).toEqual({ kind: "recorded", label: "Agarre neutro" });
    expect(byId.get(blocks[3]!)).toBeNull();
  });

  it("escritura → loader → comparador, bloques mezclados, y la corrección de una sesión completada invalida lo leído", async () => {
    // Session 2 back to a named variant equal to session 1; session 4 gets two different ones in its two blocks.
    await mutate(owner, sessions[1]!, { sessionExerciseId: blocks[1], expectedRevision: Number(revisionOf(blocks[1]!)), value: recorded("Agarre neutro"), idempotencyKey: "flow-2" });
    await mutate(owner, sessions[3]!, { sessionExerciseId: blocks[3], expectedRevision: 0, value: recorded("Agarre neutro"), idempotencyKey: "flow-4a" });
    await mutate(owner, sessions[3]!, { sessionExerciseId: blocks[4], expectedRevision: 0, value: recorded("Agarre prono"), idempotencyKey: "flow-4b" });
    const source = await readInsightsSource(contextOf(owner.id, owner.client));
    expect(source.exercises.map(row => [row.id, row.configuration])).toEqual(expect.arrayContaining([[blocks[0], "recorded:agarre neutro"], [blocks[4], "recorded:agarre prono"]]));
    clearInsightsSnapshots();
    const today = "2026-04-01";
    const before = await readInsightsSnapshot(contextOf(owner.id, owner.client), today);
    const status = (snapshot: typeof before, session: string) => insightsSummary(snapshot, { limit: 60 }).facts.days.flatMap(day => day.sessions).find(row => row.sessionId === session)!.exercises[0]!;
    expect(status(before, sessions[1]!)).toMatchObject({ status: "improved", referenceSessionId: sessions[0] });
    expect(status(before, sessions[2]!)).toMatchObject({ status: "improved", referenceSessionId: sessions[1] });
    // Two variants in one session are never one comparable exposure.
    expect(status(before, sessions[3]!)).toMatchObject({ status: "insufficient_comparison", reason: "mixed_context" });
    expect(insightsSummary(before, { limit: 60 }).partial.totals.total).toBe(0);

    // A correction on a completed session moves the counter and the next read sees it, without reusing the old answer.
    const moved = counter();
    await mutate(owner, sessions[2]!, { sessionExerciseId: blocks[2], expectedRevision: Number(revisionOf(blocks[2]!)), value: recorded("Banco 30°"), idempotencyKey: "flow-fix" });
    expect(counter()).toBe(moved + 1);
    const after = await readInsightsSnapshot(contextOf(owner.id, owner.client), today);
    expect(after.revision).not.toBe(before.revision);
    expect(status(after, sessions[2]!)).toMatchObject({ status: "insufficient_comparison" });
    expect(status(after, sessions[2]!).reason).not.toBe("direct_evidence");
  }, 60_000);
});
