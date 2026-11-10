import { describe, expect, it } from "vitest";

import { buildTrainingAnalysis, type TrainingAnalysisSource } from "../phase2/training-analysis";
import type { WorkoutSession, WorkoutSessionExercise, WorkoutSet } from "../phase2/types";
import { buildTrainingExerciseMarks, buildTrainingExercisesAnalytics } from "./training-exercises";
import { withKnownExecution } from "./known-execution.fixture";

type Observation = { id: string; exerciseId: string; name: string; date: string; mode: string; weight: number | null; reps: number; routineId?: string };

function source(items: Observation[]): TrainingAnalysisSource {
  const sessions: WorkoutSession[] = [];
  const sessionExercises: WorkoutSessionExercise[] = [];
  const sets: WorkoutSet[] = [];
  const dates: Array<[string, string]> = [];
  for (const item of items) {
    const sessionId = `session-${item.id}`;
    const sessionExerciseId = `exercise-${item.id}`;
    const dayId = `day-${item.id}`;
    sessions.push({ id: sessionId, user_id: "user", day_log_id: dayId, routine_id: item.routineId ?? "routine", routine_name_snapshot: "PUSH", session_name: null, status: "completed", started_at: `${item.date}T10:00:00Z`, ended_at: `${item.date}T11:00:00Z`, energy_level: null, performance_level: null, pain_level: null, pain_note: null, abs_completed: false, treadmill_minutes: null, treadmill_distance_km: null, treadmill_speed_kmh: null, treadmill_incline_percent: null, notes: null, created_at: `${item.date}T10:00:00Z`, updated_at: `${item.date}T11:00:00Z` });
    sessionExercises.push({ id: sessionExerciseId, user_id: "user", workout_session_id: sessionId, routine_exercise_id: null, exercise_id: item.exerciseId, exercise_order: 1, source_type: "routine", nombre_snapshot: item.name, grupo_muscular_snapshot: "pecho", muscle_group_label_snapshot: "Pecho", implement_snapshot: null, weight_mode_snapshot: item.mode, rest_min_seconds_snapshot: null, rest_max_seconds_snapshot: null, planned_sets_count: 1, next_adjustment_snapshot: "maintain", next_adjustment_note_snapshot: null, decision: "maintain", decision_note: null, apply_to_routine: false, routine_note_snapshot: null, notes: null, series_reales: 1, reps_reales: item.reps, peso_real: item.weight, is_completed: true, completed_at: `${item.date}T10:45:00Z`, created_at: `${item.date}T10:00:00Z`, updated_at: `${item.date}T10:45:00Z` });
    sets.push({ id: `set-${item.id}`, user_id: "user", workout_session_exercise_id: sessionExerciseId, set_number: 1, target_reps: null, target_weight_kg: null, target_rir: null, actual_reps: item.reps, actual_weight_kg: item.weight, is_completed: true, completed_at: `${item.date}T10:30:00Z`, notes: null, created_at: `${item.date}T10:00:00Z`, updated_at: `${item.date}T10:30:00Z` });
    dates.push([dayId, item.date]);
  }
  return withKnownExecution({ sessions, sessionExercises, sets, dateByDayLog: new Map(dates) });
}

function analytics(items: Observation[], selectedExerciseId: string | null = null) {
  const data = source(items);
  const primary = buildTrainingAnalysis(data, { today: "2026-09-07", period: "custom", range: { start: "2026-09-01", end: "2026-09-07" } });
  const reference = buildTrainingAnalysis(data, { today: "2026-08-31", period: "custom", range: { start: "2026-08-25", end: "2026-08-31" } });
  return buildTrainingExercisesAnalytics({ source: data, primary, reference, referenceDefinition: { type: "previous_period", period: reference.range, label: "Período anterior" }, selectedExerciseId });
}

describe("Training V2 — exercise analytics", () => {
  it("uses the exact same canonical signal in list and detail", () => {
    const result = analytics([
      { id: "before", exerciseId: "press", name: "Press", date: "2026-08-28", mode: "Peso total", weight: 20, reps: 8 },
      { id: "now", exerciseId: "press", name: "Press", date: "2026-09-03", mode: "Peso total", weight: 20, reps: 11 },
    ], "press");
    const list = result.exercises.find((item) => item.id === "press")!;
    expect(list.performance).toMatchObject({ status: "improved", signal: { kind: "new_rep_record" } });
    expect(result.selected?.performance.signal).toEqual(list.performance.signal);
  });

  it("keeps historical exercises navigable without inventing current activity", () => {
    const result = analytics([{ id: "old", exerciseId: "archived", name: "Press histórico", date: "2026-07-01", mode: "Peso total", weight: 30, reps: 8 }]);
    expect(result.exercises[0]).toMatchObject({ id: "archived", hasPrimaryData: false, sessions: 0, performance: { status: "insufficient_data", reason: "not_trained_in_primary" } });
  });

  it("treats empty baseline and weight_mode changes as insufficient, never zero", () => {
    expect(analytics([{ id: "now", exerciseId: "new", name: "Nuevo", date: "2026-09-03", mode: "Peso total", weight: 20, reps: 10 }], "new").selected?.performance).toMatchObject({ status: "insufficient_data", referenceSampleSize: 0 });
    const changed = analytics([
      { id: "before", exerciseId: "press", name: "Press", date: "2026-08-28", mode: "Peso total", weight: 20, reps: 10 },
      { id: "now", exerciseId: "press", name: "Press", date: "2026-09-03", mode: "Por mancuerna", weight: 12, reps: 10 },
    ], "press");
    expect(changed.selected?.performance).toMatchObject({ status: "insufficient_data", reason: "different_weight_mode" });
    expect(changed.selected?.loadComparison.results.every((item) => item.deltaPercent === null)).toBe(false);
  });

  it("derives non-duplicated marks for load, time, lingotes and bodyweight", () => {
    const sessions = (mode: string, weight: number | null, reps: number) => analytics([
      { id: mode, exerciseId: "exercise", name: "Ejercicio", date: "2026-09-03", mode, weight, reps },
    ], "exercise").selected!.allSessions;
    expect(buildTrainingExerciseMarks(sessions("Peso total", 25, 8), "Peso total").map((mark) => mark.kind)).toEqual(["best_load", "best_volume"]);
    expect(buildTrainingExerciseMarks(sessions("Lingotes (no kg)", 5, 10), "Lingotes (no kg)")).toMatchObject([{ kind: "best_load", unit: "lingotes" }]);
    expect(buildTrainingExerciseMarks(sessions("Tiempo (segundos)", null, 60), "Tiempo (segundos)")).toMatchObject([{ kind: "best_time", unit: "s", value: 60 }]);
    expect(buildTrainingExerciseMarks(sessions("Peso corporal", null, 12), "Peso corporal")).toMatchObject([{ kind: "best_reps", unit: "reps", value: 12 }]);
  });

  it("scopes an individual report by routine without changing exercise identity", () => {
    const data = source([
      { id: "push-before", exerciseId: "press", name: "Press", date: "2026-08-28", mode: "Peso total", weight: 20, reps: 8, routineId: "push" },
      { id: "push-now", exerciseId: "press", name: "Press", date: "2026-09-03", mode: "Peso total", weight: 20, reps: 10, routineId: "push" },
      { id: "other-now", exerciseId: "press", name: "Press", date: "2026-09-04", mode: "Peso total", weight: 15, reps: 6, routineId: "other" },
    ]);
    const primary = buildTrainingAnalysis(data, { today: "2026-09-07", period: "custom", range: { start: "2026-09-01", end: "2026-09-07" } });
    const reference = buildTrainingAnalysis(data, { today: "2026-08-31", period: "custom", range: { start: "2026-08-25", end: "2026-08-31" } });
    const result = buildTrainingExercisesAnalytics({ source: data, primary, reference, referenceDefinition: { type: "previous_period", period: reference.range, label: "Anterior" }, selectedExerciseId: "press", routineId: "push" });
    expect(result.selected?.performance.status).toBe("improved");
    expect(result.selected?.currentSessions).toHaveLength(1);
  });
});
