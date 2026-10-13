import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  handleMobileExplicitMutationRequest,
  MobileApiConflictError,
} from "./auth";
import {
  parseMobileTrainingRoutineDetailResponse,
  parseMobileTrainingRoutineIdentity,
  parseMobileTrainingRoutineTemplate,
  parseMobileTrainingSessionStart,
  parseMobileTrainingSessionStartResponse,
} from "./training";

const routineId = "11111111-1111-4111-8111-111111111111";
const relationId = "22222222-2222-4222-8222-222222222222";
const exerciseId = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-09-28T12:00:00.000Z";

const targets = {
  nextAdjustment: "maintain" as const,
  nextAdjustmentNote: null,
  restMinSeconds: 90,
  restMaxSeconds: 120,
  notes: "",
  sets: [
    {
      setNumber: 1,
      targetReps: 10,
      targetWeightKg: 40.5,
      targetRir: 2,
      notes: null,
    },
  ],
};

describe("M3.2A Mobile Training contracts", () => {
  it("strictly parses identity CAS without client ownership fields", () => {
    expect(parseMobileTrainingRoutineIdentity({
      name: " Push ",
      color: "violet",
      expectedUpdatedAt: timestamp,
    })).toEqual({ name: "Push", color: "violet", expectedUpdatedAt: timestamp });
    expect(() => parseMobileTrainingRoutineIdentity({
      name: "Push",
      color: null,
      expectedUpdatedAt: timestamp,
      userId: "attacker",
    })).toThrow("propiedades no permitidas");
  });

  it("strictly validates recursive desired-state templates", () => {
    const parsed = parseMobileTrainingRoutineTemplate({
      expectedTemplateVersion: 7,
      items: [{ routineExerciseId: relationId, exerciseId, targets }],
    });
    expect(parsed.items[0]?.targets.sets[0]?.targetWeightKg).toBe(40.5);

    expect(() => parseMobileTrainingRoutineTemplate({
      expectedTemplateVersion: 7,
      items: [{
        routineExerciseId: relationId,
        exerciseId,
        targets: { ...targets, arbitrary: true },
      }],
    })).toThrow("propiedades no permitidas");
    expect(() => parseMobileTrainingRoutineTemplate({
      expectedTemplateVersion: 7,
      items: [{
        routineExerciseId: null,
        exerciseId,
        targets: { ...targets, sets: [{ ...targets.sets[0], targetReps: "10" }] },
      }],
    })).toThrow();
    expect(() => parseMobileTrainingRoutineTemplate({
      expectedTemplateVersion: 7,
      items: [{
        routineExerciseId: null,
        exerciseId,
        targets: { ...targets, sets: [{ ...targets.sets[0], setNumber: 2 }] },
      }],
    })).toThrow("numeradas");
  });

  it("rejects duplicate exercises and invalid target boundaries", () => {
    expect(() => parseMobileTrainingRoutineTemplate({
      expectedTemplateVersion: 7,
      items: [
        { routineExerciseId: relationId, exerciseId, targets },
        { routineExerciseId: null, exerciseId, targets },
      ],
    })).toThrow("repetirse");
    expect(() => parseMobileTrainingRoutineTemplate({
      expectedTemplateVersion: 7,
      items: [{
        routineExerciseId: relationId,
        exerciseId,
        targets: { ...targets, restMinSeconds: 121, restMaxSeconds: 120 },
      }],
    })).toThrow("mínimo");
  });

  it("parses atomic detail including zero values and archived exercises", () => {
    const detail = parseMobileTrainingRoutineDetailResponse({
      routine: {
        id: routineId,
        name: "PUSH",
        color: "violet",
        isActive: false,
        updatedAt: timestamp,
        templateVersion: 7,
      },
      items: [{
        routineExerciseId: relationId,
        exerciseOrder: 1,
        exercise: {
          id: exerciseId,
          name: "PRESS",
          muscleGroup: "pecho",
          muscleGroupLabel: null,
          implement: "Barra",
          weightMode: "Peso total",
          isActive: false,
        },
        updatedAt: timestamp,
        targets: {
          ...targets,
          restMinSeconds: 0,
          restMaxSeconds: 0,
          sets: [{ ...targets.sets[0], targetReps: 0, targetWeightKg: 0, targetRir: 0 }],
        },
      }],
    });
    expect(detail.items[0]?.exercise.isActive).toBe(false);
    expect(detail.items[0]?.targets.sets[0]).toMatchObject({
      targetReps: 0,
      targetWeightKg: 0,
      targetRir: 0,
    });
  });

  it("strictly parses start requests and exact started/active responses", () => {
    expect(parseMobileTrainingSessionStart({
      routineId: null,
      idempotencyKey: "session:start:1",
    })).toEqual({ routineId: null, idempotencyKey: "session:start:1" });
    expect(() => parseMobileTrainingSessionStart({
      routineId: null,
      idempotencyKey: "session:start:1",
      user_id: "attacker",
    })).toThrow("propiedades no permitidas");

    const session = {
      id: relationId,
      routineId,
      name: "PUSH",
      logDate: "2026-09-28",
      startedAt: timestamp,
    };
    expect(parseMobileTrainingSessionStartResponse({ status: "started", session }))
      .toEqual({ status: "started", session });
    expect(parseMobileTrainingSessionStartResponse({
      status: "active",
      code: "ACTIVE_SESSION_EXISTS",
      session,
    })).toEqual({ status: "active", code: "ACTIVE_SESSION_EXISTS", session });
  });

  it("emits the exact idempotency mismatch contract", async () => {
    await expect(handleMobileExplicitMutationRequest("Bearer valid", {
      authenticate: async () => ({ userId: "user-1" }),
      mutate: async () => {
        throw new MobileApiConflictError("La clave ya fue usada con otros datos.");
      },
    })).resolves.toEqual({
      status: 409,
      body: {
        status: "conflict",
        code: "IDEMPOTENCY_KEY_REUSED",
        message: "La clave ya fue usada con otros datos.",
      },
    });
  });
});

const migration = readFileSync(
  "supabase/migrations/20260928140340_mobile_routine_editor_start_expand.sql",
  "utf8",
);
const webTraining = readFileSync("src/lib/phase2/training.ts", "utf8");
const robustTraining = readFileSync("src/lib/phase2/training-robust.ts", "utf8");

function sqlFunction(name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = migration.match(
    new RegExp(`create(?: or replace)? function public\\.${escaped}\\([\\s\\S]*?\\n\\$\\$;`),
  );
  expect(match, `Missing SQL function ${name}`).not.toBeNull();
  return match?.[0] ?? "";
}

describe("M3.2A SQL safety contract", () => {
  it("uses additive logical template versioning for Web and Mobile writes", () => {
    expect(migration).toContain("add column if not exists template_version bigint not null default 1");
    expect(migration).toContain("referencing new table as new_rows");
    expect(migration).toContain("for each statement execute function");
    expect(migration).toContain("ownlevel.template_bumped_");
    expect(migration).toContain("bump_training_routine_template_once(p_routine_id)");
    expect(migration).not.toMatch(/for each row execute function public\.bump_routine_templates/);
    expect(migration).not.toMatch(/drop\s+table/i);
  });

  it("bypasses legacy defaults only inside the Mobile desired-state transaction", () => {
    expect(migration).toContain("current_setting('ownlevel.skip_routine_default_sets', true) = 'on'");
    expect(sqlFunction("routine_exercises_apply_exercise_defaults")).toContain(
      "ownlevel.skip_routine_default_sets",
    );
    expect(sqlFunction("routine_exercises_create_default_sets")).toContain(
      "ownlevel.skip_routine_default_sets",
    );
    expect(migration).toMatch(
      /set_config\('ownlevel\.skip_routine_default_sets', 'on', true\)[\s\S]+insert into public\.routine_exercises[\s\S]+set_config\('ownlevel\.skip_routine_default_sets', 'off', true\)/,
    );
    expect(migration).toContain("jsonb_array_length(v_targets -> 'sets') not between 1 and 50");
  });

  it("puts every transactional template writer in the shared lock domain", () => {
    for (const functionName of [
      "mobile_replace_training_routine_template",
      "replace_routine_exercises",
      "sync_exercise_active_routine_memberships",
      "save_routine_exercise",
      "move_routine_exercise",
      "finish_workout_session",
    ]) {
      expect(sqlFunction(functionName)).toContain("lock_training_user_mutations()");
    }
    expect(webTraining).toContain('supabase.rpc("replace_routine_exercises"');
    expect(webTraining).toContain('supabase.rpc("sync_exercise_active_routine_memberships"');
  });

  it("keeps detail and template writes invoker-scoped and transactional", () => {
    expect(migration).toMatch(/mobile_training_routine_detail[\s\S]+security invoker/);
    expect(migration).toMatch(/mobile_replace_training_routine_template[\s\S]+security invoker/);
    expect(migration).toContain("TRAINING_ROUTINE_TEMPLATE_CORRUPT");
    expect(migration).toContain("ROUTINE_TEMPLATE_CHANGED");
    expect(migration).toMatch(/delete from public\.routine_exercises[\s\S]+update public\.routine_exercises[\s\S]+insert into public\.routine_exercises[\s\S]+delete from public\.routine_exercise_sets[\s\S]+insert into public\.routine_exercise_sets/);
  });

  it("serializes starts and stores both started and already-active responses", () => {
    expect(migration).toContain("training.session.start.v1");
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(migration).toContain("America/Argentina/Cordoba");
    expect(migration).toContain("public.get_or_create_day_log(v_today)");
    expect(migration).toContain("public.start_workout_session(v_day_log.id, p_routine_id)");
    expect(migration).toContain("'code', 'ACTIVE_SESSION_EXISTS'");
    expect(migration).toContain("response_status = 409");
    expect(sqlFunction("start_workout_session")).toMatch(
      /lock_training_user_mutations\(\)[\s\S]+order by e\.id[\s\S]+for share of e/,
    );
    expect(migration).toContain("uniq_workout_sessions_user_in_progress");
    expect(robustTraining).toContain('message?.includes("ACTIVE_SESSION_EXISTS")');
  });

  it("maps nested missing resources without disclosing cross-user existence", () => {
    expect(migration).toContain("TRAINING_ROUTINE_EXERCISE_NOT_FOUND");
    expect(migration).toContain("TRAINING_EXERCISE_NOT_FOUND");
    expect(migration).toMatch(
      /if not v_exercise_is_active then[\s\S]+errcode = '22023'/,
    );
  });

  it("closes the definer RPC and never accepts client ownership", () => {
    expect(migration.match(/security definer/g)).toHaveLength(1);
    expect(migration).not.toContain("p_user_id");
    expect(migration).not.toContain("service_role");
    expect(migration).toMatch(/mobile_start_training_session[\s\S]+set search_path = ''/);
    expect(migration).toContain("revoke all on function public.mobile_start_training_session(text, uuid) from public, anon");
    expect(migration).toContain("grant execute on function public.mobile_start_training_session(text, uuid) to authenticated");
  });
});

it("accepts only the opt-in template policy and preserves legacy start parsing", () => {
  const body = { routineId: null, idempotencyKey: "policy" };
  expect(parseMobileTrainingSessionStart(body)).toEqual(body);
  expect(parseMobileTrainingSessionStart({ ...body, templateTargetsOnly: true })).toEqual({ ...body, templateTargetsOnly: true });
  expect(() => parseMobileTrainingSessionStart({ ...body, templateTargetsOnly: false })).toThrow();
});
