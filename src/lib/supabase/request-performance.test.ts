import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const home = readFileSync("src/app/(app)/home/page.tsx", "utf8");
const today = readFileSync("src/app/(app)/today/page.tsx", "utf8");
const server = readFileSync("src/lib/supabase/server.ts", "utf8");
const browser = readFileSync("src/lib/supabase/client.ts", "utf8");
const middleware = readFileSync("src/lib/supabase/middleware.ts", "utf8");
const train = readFileSync("src/app/(app)/train/page.tsx", "utf8");
const session = readFileSync("src/app/(app)/train/session/[id]/page.tsx", "utf8");
const nutritionDay = readFileSync("src/lib/nutrition/day.ts", "utf8");
const robustTraining = readFileSync("src/lib/phase2/training-robust.ts", "utf8");
const nutritionReports = readFileSync("src/lib/nutrition/reports.ts", "utf8");
const progressHome = readFileSync("src/lib/progress/home-server.ts", "utf8");

describe("request-scoped authenticated reads", () => {
  it("shares one verified context across Home loaders and uses its bounded training read model", () => {
    expect(home).toContain("const auth = await requireAuthenticatedRequestContext()");
    expect(home).toContain("getMyProfile(auth)");
    expect(home).toContain("getNutritionDaySummary(today, auth)");
    expect(home).toContain("getHomeActiveTrainingSnapshot(auth)");
    expect(home).toContain("getHomeTrainingSnapshot(today, auth)");
    expect(home).toContain("listWorkoutStartRoutines(auth)");
    expect(home).not.toContain("getTrainingProgress(");
    expect(home).not.toContain("listCompletedSessionHistory(");
  });

  it("shares the verified context with Today without caching nutrition globally", () => {
    expect(today).toContain("const auth = await requireAuthenticatedRequestContext()");
    expect(today).toContain("getNutritionDay(today, undefined, auth)");
    expect(server).toContain("export const getVerifiedRequestContext = cache(");
    expect(server).toContain("supabase.auth.getClaims()");
    expect(server).not.toContain("unstable_cache");
  });

  it("reuses the verified context across Train and parallel session loaders", () => {
    expect(train).toContain("const auth = await requireAuthenticatedRequestContext()");
    expect(train).toContain("getInProgressSessionForUser(auth)");
    expect(train).toContain("listWorkoutStartRoutines(auth)");
    expect(train).toContain("listTrainingDaysInMonth({ month }, auth)");
    expect(train).toContain('operation: "train.routines"');
    expect(session).toContain("const auth = await requireAuthenticatedRequestContext()");
    expect(session).toContain("const [detail, exercises] = await Promise.all([");
    expect(session).toContain("getWorkoutSessionDetail(id, auth)");
    expect(session).toContain("listExercises({ includeArchived: false }, auth)");
    expect(session).toContain("listRecentRobustExerciseHistoryByExercise({");
    expect(session).toContain("}, auth)");
  });

  it("propagates bounded request metadata and keeps Progress errors on the canonical logger", () => {
    expect(server).toContain("const requestPerformance = requestPerformanceContext(requestHeaders)");
    expect(server).toContain("return { supabase, userId, requestPerformance }");
    expect(middleware).toContain("requestPerformanceContext(request.headers)");
    expect(progressHome).toContain("operation,");
    expect(progressHome).toContain('layer: "database"');
    expect(progressHome).toContain("...requestPerformance");
    expect(progressHome).toContain('isolated("progress.activity-values"');
    expect(progressHome).not.toContain("console.error");
    expect(progressHome).not.toContain("[progress-home]");
  });

  it("keeps Home payloads bounded to a meal count and summary columns", () => {
    expect(nutritionDay).toContain('.select("id", { count: "exact", head: true })');
    expect(robustTraining).toContain(
      '"id, day_log_id, routine_id, routine_name_snapshot, session_name, status, started_at, ended_at, day_log:day_logs!inner(log_date), exercises:workout_session_exercises(id, workout_session_id, is_completed, muscle_group_label_snapshot, grupo_muscular_snapshot, sets:workout_sets(workout_session_exercise_id, actual_reps, actual_weight_kg, is_completed, set_kind))"',
    );
    expect(robustTraining).toContain(
      '"id, routine_name_snapshot, session_name, started_at, day_log:day_logs(log_date), exercises:workout_session_exercises(sets:workout_sets(is_completed))"',
    );
    expect(robustTraining).not.toContain(
      '"*, day_log:day_logs!inner(log_date), exercises:workout_session_exercises(*, sets:workout_sets(*))"',
    );
  });

  it("loads nutrition comparison through one combined range instead of duplicating the report reads", () => {
    expect(nutritionReports).toContain("const combinedRange = { start: previousRange.start, end: range.end }");
    expect(nutritionReports).toContain("const facts = await readNutritionReportFacts(combinedRange, context)");
    expect(nutritionReports.match(/readNutritionReportFacts\(combinedRange, context\)/g)).toHaveLength(1);
  });

  it("installs the Data API transport retry without changing middleware auth", () => {
    expect(server).toContain("fetch: createResilientSupabaseFetch(undefined, {");
    expect(server).toContain("requestTimeoutMs: SUPABASE_SERVER_REQUEST_TIMEOUT_MS");
    expect(browser).toContain("fetch: createResilientSupabaseFetch()");
    expect(middleware).not.toContain("createResilientSupabaseFetch");
    expect(middleware).toContain("supabase.auth.getClaims()");
  });

  it("uses verified claims instead of a remote getUser call in the training action path", () => {
    expect(robustTraining).toContain("requireAuthenticatedRequestContext()");
    expect(robustTraining).not.toContain("supabase.auth.getUser()");
  });
});
