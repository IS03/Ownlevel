import { describe, expect, it } from "vitest";

import type { TrainingAnalysisSource } from "../../phase2/training-analysis";
import type { WorkoutSession, WorkoutSessionExercise, WorkoutSet } from "../../phase2/types";
import { trainingPerformanceRelationshipSamples } from "./training";
import { withKnownExecution } from "../known-execution.fixture";

type ExerciseFact = { id: string; mode: string; weight: number | null; reps: number };
type SessionFact = { id: string; date: string; exercises: ExerciseFact[] };

function source(facts: SessionFact[]): TrainingAnalysisSource {
  const sessions: WorkoutSession[] = [];
  const sessionExercises: WorkoutSessionExercise[] = [];
  const sets: WorkoutSet[] = [];
  const dates = new Map<string, string>();
  for (const fact of facts) {
    const dayId = `day-${fact.id}`;
    sessions.push({
      id: fact.id, user_id: "user", day_log_id: dayId, routine_id: null, routine_name_snapshot: null, session_name: "Sesión", status: "completed",
      started_at: `${fact.date}T10:00:00Z`, ended_at: `${fact.date}T11:00:00Z`, energy_level: null, performance_level: null, pain_level: null,
      pain_note: null, abs_completed: false, treadmill_minutes: null, treadmill_distance_km: null, treadmill_speed_kmh: null, treadmill_incline_percent: null,
      notes: null, created_at: `${fact.date}T10:00:00Z`, updated_at: `${fact.date}T11:00:00Z`,
    });
    dates.set(dayId, fact.date);
    fact.exercises.forEach((exercise, index) => {
      const sessionExerciseId = `${fact.id}-${exercise.id}`;
      sessionExercises.push({
        id: sessionExerciseId, user_id: "user", workout_session_id: fact.id, routine_exercise_id: null, exercise_id: exercise.id, exercise_order: index + 1,
        source_type: "extra", nombre_snapshot: exercise.id, grupo_muscular_snapshot: "pecho", muscle_group_label_snapshot: "Pecho", implement_snapshot: null,
        weight_mode_snapshot: exercise.mode, rest_min_seconds_snapshot: null, rest_max_seconds_snapshot: null, planned_sets_count: 1,
        next_adjustment_snapshot: "maintain", next_adjustment_note_snapshot: null, decision: "maintain", decision_note: null, apply_to_routine: false,
        routine_note_snapshot: null, notes: null, series_reales: null, reps_reales: null, peso_real: null, is_completed: true,
        completed_at: `${fact.date}T10:45:00Z`, created_at: `${fact.date}T10:00:00Z`, updated_at: `${fact.date}T10:45:00Z`,
      });
      sets.push({
        id: `set-${sessionExerciseId}`, user_id: "user", workout_session_exercise_id: sessionExerciseId, set_number: 1,
        target_reps: null, target_weight_kg: null, target_rir: null, actual_reps: exercise.reps, actual_weight_kg: exercise.weight,
        is_completed: true, completed_at: `${fact.date}T10:30:00Z`, notes: null, created_at: `${fact.date}T10:00:00Z`, updated_at: `${fact.date}T10:30:00Z`,
      });
    });
  }
  return withKnownExecution({ sessions, sessionExercises, sets, dateByDayLog: dates });
}

describe("Relationships V2 training performance outcome", () => {
  it("reuses comparable exercise status and reports a proportion, not mixed kg", () => {
    const data = source([
      { id: "before", date: "2026-08-01", exercises: [
        { id: "press", mode: "Peso total", weight: 20, reps: 8 },
        { id: "row", mode: "Peso total", weight: 50, reps: 10 },
      ] },
      { id: "current", date: "2026-08-05", exercises: [
        { id: "press", mode: "Peso total", weight: 20, reps: 10 },
        { id: "row", mode: "Peso total", weight: 50, reps: 10 },
      ] },
    ]);
    const result = trainingPerformanceRelationshipSamples(data, { start: "2026-08-01", end: "2026-08-10" });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ entityId: "current", value: 50, context: { improved: 1, stable: 1, comparable: 2 } });
  });

  it("excludes incompatible weight modes instead of normalizing them", () => {
    const data = source([
      { id: "before", date: "2026-08-01", exercises: [{ id: "press", mode: "Peso total", weight: 20, reps: 8 }] },
      { id: "current", date: "2026-08-05", exercises: [{ id: "press", mode: "Por mancuerna", weight: 20, reps: 10 }] },
    ]);
    expect(trainingPerformanceRelationshipSamples(data, { start: "2026-08-01", end: "2026-08-10" })).toEqual([]);
  });
});
