import { describe, expect, it } from "vitest";

import { buildTrainingAnalysis, type TrainingAnalysisSource } from "../phase2/training-analysis";
import { buildTrainingComparison } from "../phase2/training-comparison";
import type { MuscleGroup, WorkoutSession, WorkoutSessionExercise, WorkoutSet } from "../phase2/types";
import { buildTrainingRoutinesAnalytics, TRAINING_CROSS_ROUTINE_METRICS } from "./training-routines";
import { withKnownExecution } from "./known-execution.fixture";

type Observation = {
  id: string;
  routineId: string;
  routineName: string;
  exerciseId: string;
  exerciseName: string;
  date: string;
  weight: number;
  reps: number;
  muscle?: MuscleGroup;
  muscleLabel?: string;
};

function source(observations: Observation[]): TrainingAnalysisSource {
  const sessions: WorkoutSession[] = [];
  const sessionExercises: WorkoutSessionExercise[] = [];
  const sets: WorkoutSet[] = [];
  const dates: Array<[string, string]> = [];
  for (const item of observations) {
    const sessionId = `session-${item.id}`;
    const dayId = `day-${item.id}`;
    const sessionExerciseId = `session-exercise-${item.id}`;
    sessions.push({
      id: sessionId, user_id: "user", day_log_id: dayId, routine_id: item.routineId, routine_name_snapshot: item.routineName, session_name: null, status: "completed", started_at: `${item.date}T10:00:00.000Z`, ended_at: `${item.date}T11:00:00.000Z`, energy_level: null, performance_level: null, pain_level: null, pain_note: null, abs_completed: false, treadmill_minutes: null, treadmill_distance_km: null, treadmill_speed_kmh: null, treadmill_incline_percent: null, notes: null, created_at: `${item.date}T10:00:00.000Z`, updated_at: `${item.date}T11:00:00.000Z`,
    });
    sessionExercises.push({
      id: sessionExerciseId, user_id: "user", workout_session_id: sessionId, routine_exercise_id: null, exercise_id: item.exerciseId, exercise_order: 1, source_type: "routine", nombre_snapshot: item.exerciseName, grupo_muscular_snapshot: item.muscle ?? "pecho", muscle_group_label_snapshot: item.muscleLabel ?? "Pecho", implement_snapshot: null, weight_mode_snapshot: "Peso total", rest_min_seconds_snapshot: null, rest_max_seconds_snapshot: null, planned_sets_count: 1, next_adjustment_snapshot: "maintain", next_adjustment_note_snapshot: null, decision: "maintain", decision_note: null, apply_to_routine: false, routine_note_snapshot: null, notes: null, series_reales: null, reps_reales: null, peso_real: null, is_completed: true, completed_at: `${item.date}T10:45:00.000Z`, created_at: `${item.date}T10:00:00.000Z`, updated_at: `${item.date}T10:45:00.000Z`,
    });
    sets.push({
      id: `set-${item.id}`, user_id: "user", workout_session_exercise_id: sessionExerciseId, set_number: 1, target_reps: null, target_weight_kg: null, target_rir: null, actual_reps: item.reps, actual_weight_kg: item.weight, is_completed: true, completed_at: `${item.date}T10:30:00.000Z`, notes: null, created_at: `${item.date}T10:00:00.000Z`, updated_at: `${item.date}T10:30:00.000Z`,
    });
    dates.push([dayId, item.date]);
  }
  return withKnownExecution({ sessions, sessionExercises, sets, dateByDayLog: new Map(dates) });
}

const observations: Observation[] = [
  { id: "push-before", routineId: "push", routineName: "PUSH viejo", exerciseId: "press", exerciseName: "Press", date: "2026-08-28", weight: 20, reps: 8 },
  { id: "push-now", routineId: "push", routineName: "PUSH", exerciseId: "press", exerciseName: "Press", date: "2026-09-03", weight: 20, reps: 11 },
  { id: "push-new", routineId: "push", routineName: "PUSH", exerciseId: "lateral", exerciseName: "Laterales", date: "2026-09-04", weight: 8, reps: 12, muscle: "hombros", muscleLabel: "Hombros" },
  { id: "pull-before", routineId: "pull", routineName: "PULL", exerciseId: "press", exerciseName: "Press", date: "2026-08-27", weight: 50, reps: 10 },
  { id: "pull-now", routineId: "pull", routineName: "PULL", exerciseId: "press", exerciseName: "Press", date: "2026-09-02", weight: 50, reps: 7 },
  { id: "archived-now", routineId: "archived", routineName: "Archivada", exerciseId: "fly", exerciseName: "Aperturas", date: "2026-09-05", weight: 10, reps: 10 },
  { id: "deleted-now", routineId: "deleted", routineName: "Rutina eliminada", exerciseId: "dip", exerciseName: "Fondos", date: "2026-09-06", weight: 5, reps: 10 },
];

function analytics(selectedRoutineId: string | null = "push") {
  const data = source(observations);
  const routines = [
    { id: "push", nombre: "PUSH actual", is_active: true },
    { id: "pull", nombre: "PULL", is_active: true },
    { id: "archived", nombre: "Archivada actual", is_active: false },
  ];
  const primary = buildTrainingAnalysis(data, { today: "2026-09-07", period: "custom", range: { start: "2026-09-01", end: "2026-09-07" }, routines });
  const reference = buildTrainingAnalysis(data, { today: "2026-08-31", period: "custom", range: { start: "2026-08-25", end: "2026-08-31" }, routines });
  return {
    data,
    primary,
    reference,
    result: buildTrainingRoutinesAnalytics({
      source: data,
      primary,
      reference,
      referenceDefinition: { type: "other_period", period: reference.range, label: "Otro período" },
      selectedRoutineId,
    }),
  };
}

describe("Training V2 — routine analytics", () => {
  it("counts only comparable exercises inside each routine", () => {
    const result = analytics().result;
    const push = result.routines.find((routine) => routine.id === "push")!;
    const pull = result.routines.find((routine) => routine.id === "pull")!;
    expect(push.performance.summary).toMatchObject({ improved: 1, comparable: 1, insufficient: 1 });
    expect(pull.performance.summary).toMatchObject({ declined: 1, comparable: 1, insufficient: 0 });
    expect(push.performance.exercises.find((exercise) => exercise.exerciseId === "lateral")).toMatchObject({ status: "insufficient_data", reason: "new_exercise" });
  });

  it("scopes the same exercise_id to its routine instead of mixing contexts", () => {
    const result = analytics().result;
    expect(result.routines.find((routine) => routine.id === "push")?.performance.exercises[0]?.status).toBe("improved");
    expect(result.routines.find((routine) => routine.id === "pull")?.performance.exercises[0]?.status).toBe("declined");
  });

  it("keeps archived and deleted historical routines navigable by canonical id", () => {
    const result = analytics(null).result;
    expect(result.routines.find((routine) => routine.id === "archived")).toMatchObject({ name: "Archivada", isActive: false, sessions: 1 });
    expect(result.routines.find((routine) => routine.id === "deleted")).toMatchObject({ name: "Rutina eliminada", isActive: false, sessions: 1 });
  });

  it("reports a missing baseline as insufficient instead of comparing against zero", () => {
    const selected = analytics("archived").result.selected!;
    expect(selected.performance.summary).toMatchObject({ comparable: 0, insufficient: 1 });
    expect(selected.confidenceNote).toContain("No hay suficiente historial");
    expect(selected.loadComparison.results.every((metric) => metric.eligibility.status !== "comparable")).toBe(true);
    expect(selected.loadComparison.results.every((metric) => metric.deltaPercent === null)).toBe(true);
  });

  it("builds muscle distribution from real primary snapshots without double counting sets", () => {
    const distribution = analytics("push").result.selected!.muscleDistribution;
    expect(distribution).toEqual([
      { key: "hombros", label: "Hombros", sets: 1, ratio: 0.5 },
      { key: "pecho", label: "Pecho", sets: 1, ratio: 0.5 },
    ]);
    expect(distribution.reduce((sum, muscle) => sum + muscle.sets, 0)).toBe(2);
    expect(distribution.reduce((sum, muscle) => sum + muscle.ratio, 0)).toBe(1);
  });

  it("accepts custom A/B ranges through the canonical period analyses", () => {
    const { result } = analytics("push");
    expect(result.selected?.loadComparison.primaryPeriod).toMatchObject({ start: "2026-09-01", end: "2026-09-07" });
    expect(result.selected?.loadComparison.reference).toMatchObject({ type: "other_period", period: { start: "2026-08-25", end: "2026-08-31" } });
  });

  it("keeps cross-routine comparison limited to load and composition metrics", () => {
    const { primary } = analytics();
    const comparison = buildTrainingComparison({ kind: "routines", analysis: primary, requestedA: "archived", requestedB: "push" });
    expect(comparison.a?.id).toBe("archived");
    expect(comparison.metrics).toEqual([...TRAINING_CROSS_ROUTINE_METRICS]);
    expect(comparison).not.toHaveProperty("performanceScore");
  });
});
