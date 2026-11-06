// Disposable local Supabase ONLY: the seed runs through a local container and the API must be loopback. Skipped without the explicit status file.
// OWNLEVEL_INSIGHTS_LOCAL_STATUS=<status.json> OWNLEVEL_INSIGHTS_LOCAL_DB=<db container> npx vitest run src/lib/mobile-api/performance-insights-evidence.local.test.ts
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { exerciseSubset, insightsExerciseEvidence } from "../progress/insights-engine";
import { parsePerformanceInsights } from "./performance-insights-contract";
import { EXERCISE_EVIDENCE_SELECT, readConsistentExerciseSource, readExerciseSource, readInsightsSource } from "./performance-insights-server";
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
    const email = `evidence-${randomUUID()}@example.invalid`, password = randomBytes(24).toString("hex");
    const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (made.error) throw made.error;
    const http = { paths: [] as string[] };
    const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false }, global: { fetch: async (...args: Parameters<typeof fetch>) => {
      http.paths.push(new URL(String(args[0])).pathname.split("/").pop()!);
      return fetch(...args);
    } } });
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
    return { id: made.data.user.id, client, http };
  };
  return { sql, user };
}
const contextOf = (id: string, client: unknown) => ({ userId: id, supabase: client }) as unknown as MobileSupabaseAuthenticatedContext;
const rowsOf = (text: string) => text ? text.split("\n").map(line => line.split("|")) : [];

/**
 * One person with 230 sessions: five blocks of the exercise in each (orders 1, 2, 3, 4 and 6), another exercise between them,
 * three sets per block, some unfinished, and variants recorded on some blocks. The last session stays in progress. Another person
 * trains their own exercise the same way. 229 × 5 = 1145 rows: two pages of 1000.
 */
function seed(sql: (input: string) => string, owner: string, other: string) {
  const exercise = randomUUID(), between = randomUUID(), foreign = randomUUID();
  sql(`select set_config('request.jwt.claim.sub','${owner}',false);
    insert into public.profiles(user_id) values('${owner}'),('${other}') on conflict do nothing;
    insert into public.exercises(id,user_id,nombre,weight_mode) values('${exercise}','${owner}','SYNTHETIC PRESS','Peso total'),('${between}','${owner}','SYNTHETIC ROW','Peso total'),('${foreign}','${other}','SYNTHETIC OTHER','Peso total');
    do $seed$ declare who uuid; ex uuid; s uuid; d date; total int; begin
      for who, ex, total in select * from (values('${owner}'::uuid,'${exercise}'::uuid,230),('${other}'::uuid,'${foreign}'::uuid,4)) v loop
        for i in 0..total-1 loop
          d := '2025-01-01'::date + i; s := gen_random_uuid();
          perform set_config('request.jwt.claim.sub', who::text, false);
          insert into public.day_logs(user_id,log_date) values(who,d) on conflict do nothing;
          insert into public.workout_sessions(id,user_id,day_log_id,started_at) select s,who,id,(d::timestamp + interval '18 hours') at time zone 'UTC' from public.day_logs where user_id=who and log_date=d;
          for k in 1..6 loop insert into public.workout_session_exercises(user_id,workout_session_id,exercise_id,exercise_order) values(who,s,case when k = 5 and who = '${owner}'::uuid then '${between}'::uuid else ex end,k); end loop;
          update public.workout_session_exercises set is_completed=true,implement_snapshot='barra',weight_mode_snapshot='Peso total' where workout_session_id=s;
          insert into public.workout_sets(user_id,workout_session_exercise_id,set_number) select who,x.id,g from public.workout_session_exercises x cross join generate_series(2,3) g where x.workout_session_id=s;
          update public.workout_sets t set actual_reps=6+t.set_number+(i % 3),actual_weight_kg=40+x.exercise_order*2.5,is_completed=not(t.set_number=3 and i % 7=0),completed_at=(d::timestamp + interval '18 hours 10 minutes') at time zone 'UTC'
            from public.workout_session_exercises x where x.id=t.workout_session_exercise_id and x.workout_session_id=s;
          insert into public.workout_session_exercise_configurations(session_exercise_id,user_id,revision,kind,label,source,recorded_phase,updated_at)
            select x.id,who,1,case when x.exercise_order=1 then 'recorded' else 'not_applicable' end,case when x.exercise_order=1 then public.training_configuration_label('Agarre Medio') end,'entered','during_session',now()
            from public.workout_session_exercises x where x.workout_session_id=s and ((x.exercise_order=1 and i % 2=0) or (x.exercise_order=2 and i % 5=0));
          if i < total-1 then update public.workout_sessions set status='completed',ended_at=(d::timestamp + interval '19 hours') at time zone 'UTC' where id=s; end if;
        end loop;
      end loop; end $seed$;
    notify pgrst,'reload schema';`);
  return { exercise, between, foreign };
}

describe.runIf(!!statusFile && !!container)("#411 lectura de un ejercicio contra PostgREST local descartable", () => {
  it("reads one exercise's whole history in pages, with the real shape, matching SQL row by row, only for the token's owner", async () => {
    const { sql, user } = localStack();
    const owner = await user(), other = await user();
    const { exercise, between, foreign } = seed(sql, owner.id, other.id);
    const truthRows = rowsOf(sql(`select x.id,x.workout_session_id,x.exercise_order,l.log_date,coalesce(c.kind,''),coalesce(c.label,'') from public.workout_session_exercises x
      join public.workout_sessions s on s.id=x.workout_session_id join public.day_logs l on l.id=s.day_log_id left join public.workout_session_exercise_configurations c on c.session_exercise_id=x.id
      where x.user_id='${owner.id}' and x.exercise_id='${exercise}' and s.status='completed' order by x.id`));
    const truthSets = rowsOf(sql(`select t.id,t.workout_session_exercise_id,t.set_number,t.actual_reps,t.actual_weight_kg,t.is_completed from public.workout_sets t
      join public.workout_session_exercises x on x.id=t.workout_session_exercise_id join public.workout_sessions s on s.id=x.workout_session_id
      where x.user_id='${owner.id}' and x.exercise_id='${exercise}' and s.status='completed' order by t.id`));
    expect(truthRows).toHaveLength(229 * 5);
    expect(truthSets).toHaveLength(229 * 5 * 3);
    // The rows of the unfinished session exist: the read has to leave them out.
    expect(+sql(`select count(*) from public.workout_session_exercises x join public.workout_sessions s on s.id=x.workout_session_id where x.exercise_id='${exercise}' and s.status<>'completed'`)).toBe(5);

    // The raw page as PostgREST sends it, with the loader's own select.
    const raw = await owner.client.from("workout_session_exercises").select(EXERCISE_EVIDENCE_SELECT).eq("user_id", owner.id).eq("exercise_id", exercise).eq("session.status", "completed")
      .eq("sets.user_id", owner.id).eq("set_count.user_id", owner.id).order("id").order("id", { referencedTable: "sets" }).range(0, 9);
    expect(raw.error).toBeNull();
    const first = raw.data![0] as unknown as Record<string, unknown>;
    expect(Object.keys((first.sets as Record<string, unknown>[])[0]!).sort()).toEqual(["actual_reps", "actual_weight_kg", "completed_at", "id", "is_completed", "set_number"]);
    expect(first.set_count).toEqual([{ count: 3 }]);
    expect(first.session).toMatchObject({ id: first.workout_session_id, status: "completed", day: { log_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) } });
    expect(Array.isArray((first.session as Record<string, unknown>).day)).toBe(false);
    expect(typeof first.exercise_order).toBe("number");
    // One to one by primary key: an object or null, never a list. Seen as both here.
    const configurations = (raw.data as unknown as Record<string, unknown>[]).map(row => row.configuration);
    expect(configurations.every(value => value === null || (typeof value === "object" && !Array.isArray(value)))).toBe(true);

    owner.http.paths.length = 0;
    const { source } = await readConsistentExerciseSource(contextOf(owner.id, owner.client), exercise);
    // Counter, two pages of rows, counter. No set stream: every embedded list matched its own count.
    expect(owner.http.paths).toEqual(["insights_source_revisions", "workout_session_exercises", "workout_session_exercises", "insights_source_revisions"]);
    expect(source.exercises.map(row => [row.id, row.sessionId, String(row.order)])).toEqual(truthRows.map(([id, session, order]) => [id, session, order]));
    expect(source.exercises.map(row => row.configuration)).toEqual(truthRows.map(([, , , , kind, label]) => kind === "recorded" ? `recorded:${label.toLocaleLowerCase("es-AR")}` : kind || null));
    expect(source.exercises.every(row => row.exerciseId === exercise)).toBe(true);
    expect(source.sets.map(row => [row.id, row.sessionExerciseId, String(row.setNumber), String(row.actualReps), Number(row.actualLoad), row.isCompleted ? "t" : "f"]))
      .toEqual(truthSets.map(([id, block, number, reps, load, done]) => [id, block, number, reps, Number(load), done]));
    const dates = new Map(truthRows.map(([, session, , date]) => [session, date]));
    expect(source.sessions).toHaveLength(229);
    expect(source.sessions.every(row => row.status === "completed" && row.date === dates.get(row.id))).toBe(true);
    expect(source.exercises.some(row => row.exerciseId === between)).toBe(false);

    // The same evidence as from the whole history Insights reads, for every exposure of a sample of sessions, in both lanes.
    const whole = exerciseSubset(await readInsightsSource(contextOf(owner.id, owner.client)), exercise);
    const strip = (body: ReturnType<typeof insightsExerciseEvidence>) => JSON.parse(JSON.stringify(body, (key, value) => key === "setNumber" || key === "blockOrder" ? undefined : value));
    for (const session of source.sessions.filter((_, index) => index % 23 === 0)) for (const lane of ["strict", "partial"] as const) {
      const bounded = insightsExerciseEvidence(source, { sessionId: session.id, exerciseId: exercise, lane }, { today: "2026-11-06", method: 2 });
      expect(strip(bounded)).toEqual(strip(insightsExerciseEvidence(whole, { sessionId: session.id, exerciseId: exercise, lane }, { today: "2026-11-06", method: 2 })));
      expect(parsePerformanceInsights(JSON.parse(JSON.stringify(bounded)))).toBeDefined();
    }

    // Isolation by token: another account reads nothing of this exercise, even naming the owner's id; the owner reads nothing of theirs.
    for (const [who, client, id] of [[other.id, other.client, exercise], [owner.id, other.client, exercise], [owner.id, owner.client, foreign]] as const) {
      const empty = await readExerciseSource(contextOf(who, client), id);
      expect([empty.sessions.length, empty.exercises.length, empty.sets.length]).toEqual([0, 0, 0]);
    }
    const theirs = await readExerciseSource(contextOf(other.id, other.client), foreign);
    expect(theirs.exercises).toHaveLength(3 * 6);
    expect(theirs.sets.every(set => theirs.exercises.some(row => row.id === set.sessionExerciseId))).toBe(true);
  }, 600_000);
});
