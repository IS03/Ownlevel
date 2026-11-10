import { describe, expect, it } from "vitest";

import { buildTrainingAnalysis, type TrainingAnalysisSource } from "../phase2/training-analysis";
import { trainingAnalysisExercisePath, trainingAnalysisWorkspacePath } from "../phase2/training-analysis-navigation";
import { buildTrainingComparison } from "../phase2/training-comparison";
import type { MuscleGroup, WorkoutSession, WorkoutSessionExercise, WorkoutSet } from "../phase2/types";
import { buildTrainingMusclesAnalytics, TRAINING_CROSS_MUSCLE_METRICS } from "./training-muscles";
import { withKnownExecution } from "./known-execution.fixture";

type Observation = {
  id: string;
  exerciseId: string;
  name: string;
  date: string;
  muscle: MuscleGroup;
  detail: string | null;
  mode?: string | null;
  weight: number;
  reps: number;
  setCount?: number;
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
    sessions.push({ id: sessionId, user_id: "user", day_log_id: dayId, routine_id: "legs", routine_name_snapshot: "LEGS", session_name: null, status: "completed", started_at: `${item.date}T10:00:00.000Z`, ended_at: `${item.date}T11:00:00.000Z`, energy_level: null, performance_level: null, pain_level: null, pain_note: null, abs_completed: false, treadmill_minutes: null, treadmill_distance_km: null, treadmill_speed_kmh: null, treadmill_incline_percent: null, notes: null, created_at: `${item.date}T10:00:00.000Z`, updated_at: `${item.date}T11:00:00.000Z` });
    sessionExercises.push({ id: sessionExerciseId, user_id: "user", workout_session_id: sessionId, routine_exercise_id: null, exercise_id: item.exerciseId, exercise_order: 1, source_type: "routine", nombre_snapshot: item.name, grupo_muscular_snapshot: item.muscle, muscle_group_label_snapshot: item.detail, implement_snapshot: null, weight_mode_snapshot: item.mode === undefined ? "Peso total" : item.mode, rest_min_seconds_snapshot: null, rest_max_seconds_snapshot: null, planned_sets_count: item.setCount ?? 1, next_adjustment_snapshot: "maintain", next_adjustment_note_snapshot: null, decision: "maintain", decision_note: null, apply_to_routine: false, routine_note_snapshot: null, notes: null, series_reales: null, reps_reales: null, peso_real: null, is_completed: true, completed_at: `${item.date}T10:45:00.000Z`, created_at: `${item.date}T10:00:00.000Z`, updated_at: `${item.date}T10:45:00.000Z` });
    for (let index = 0; index < (item.setCount ?? 1); index += 1) sets.push({ id: `set-${item.id}-${index}`, user_id: "user", workout_session_exercise_id: sessionExerciseId, set_number: index + 1, target_reps: null, target_weight_kg: null, target_rir: null, actual_reps: item.reps, actual_weight_kg: item.weight, is_completed: true, completed_at: `${item.date}T10:30:00.000Z`, notes: null, created_at: `${item.date}T10:00:00.000Z`, updated_at: `${item.date}T10:30:00.000Z` });
    dates.push([dayId, item.date]);
  }
  return withKnownExecution({ sessions, sessionExercises, sets, dateByDayLog: new Map(dates) });
}

const observations: Observation[] = [
  { id: "quad-before", exerciseId: "press", name: "Prensa", date: "2026-08-27", muscle: "piernas", detail: "Cuádriceps", weight: 80, reps: 10, setCount: 2 },
  { id: "quad-now", exerciseId: "press", name: "Prensa", date: "2026-09-03", muscle: "piernas", detail: "Cuádriceps", weight: 100, reps: 10, setCount: 2 },
  { id: "abductor-before", exerciseId: "abductor", name: "Abductores", date: "2026-08-28", muscle: "piernas", detail: "Abductores", weight: 40, reps: 12 },
  { id: "abductor-now", exerciseId: "abductor", name: "Abductores", date: "2026-09-04", muscle: "piernas", detail: "Abductores", weight: 40, reps: 12 },
  { id: "calf-now", exerciseId: "calf", name: "Gemelos", date: "2026-09-05", muscle: "piernas", detail: "Pantorrillas", weight: 30, reps: 15 },
  { id: "broad-now", exerciseId: "squat", name: "Sentadilla", date: "2026-09-06", muscle: "piernas", detail: "Piernas", weight: 60, reps: 8 },
  { id: "mode-before", exerciseId: "lunge", name: "Zancadas", date: "2026-08-29", muscle: "piernas", detail: "Cuádriceps", mode: "Peso total", weight: 20, reps: 10 },
  { id: "mode-now", exerciseId: "lunge", name: "Zancadas", date: "2026-09-07", muscle: "piernas", detail: "Cuádriceps", mode: "Por mancuerna", weight: 12, reps: 10 },
  { id: "chest-now", exerciseId: "fly", name: "Aperturas", date: "2026-09-02", muscle: "pecho", detail: "Pectoral mayor", weight: 20, reps: 12 },
];

function analytics(selectedMuscleKey: string | null = "piernas", selectedSubzoneKey: string | null = null) {
  const data = source(observations);
  const primary = buildTrainingAnalysis(data, { today: "2026-09-07", period: "custom", range: { start: "2026-09-01", end: "2026-09-07" } });
  const reference = buildTrainingAnalysis(data, { today: "2026-08-31", period: "custom", range: { start: "2026-08-25", end: "2026-08-31" } });
  return { data, primary, reference, result: buildTrainingMusclesAnalytics({ source: data, primary, reference, referenceDefinition: { type: "other_period", period: reference.range, label: "Otro período" }, selectedMuscleKey, selectedSubzoneKey }) };
}

describe("Training V2 — muscle analytics", () => {
  it("keeps the broad canonical group instead of relabeling all legs as Abductores", () => {
    const { primary, result } = analytics();
    expect(primary.muscles.find((muscle) => muscle.key === "piernas")?.label).toBe("Piernas");
    expect(result.muscles.find((muscle) => muscle.key === "piernas")?.label).toBe("Piernas");
    expect(result.muscles.some((muscle) => muscle.label === "Abductores")).toBe(false);
  });

  it("aggregates only comparable exercises in the broad group and respects weight_mode", () => {
    const legs = analytics().result.selected!;
    expect(legs.performance.summary).toMatchObject({ improved: 1, stable: 1, comparable: 2, insufficient: 3 });
    expect(legs.performance.exercises.find((item) => item.exerciseId === "lunge")).toMatchObject({ status: "insufficient_data", reason: "different_weight_mode" });
    expect(legs.performance.exercises.find((item) => item.exerciseId === "press")).toMatchObject({ status: "improved", isPersonalRecord: true, signal: { kind: "new_best_weight" } });
  });

  it("creates subzones only from explicit historical detail and counts every set once", () => {
    const detail = analytics().result.selected!;
    expect(detail.subzones.map((zone) => zone.label)).toEqual(["Cuádriceps", "Abductores", "Pantorrillas"]);
    expect(detail.subzones.find((zone) => zone.label === "Cuádriceps")?.sets).toBe(3);
    expect(detail.subzones.reduce((sum, zone) => sum + zone.sets, 0)).toBe(5);
    expect(detail.muscle.summary.sets).toBe(6);
    expect(detail.subzones.every((zone) => zone.ratio === zone.sets / detail.muscle.summary.sets)).toBe(true);
    expect(detail.subzones.some((zone) => zone.label === "Piernas")).toBe(false);
  });

  it("supports group → real subzone → scoped exercise performance", () => {
    const zoneKey = "cuádriceps";
    const zone = analytics("piernas", zoneKey).result.selected?.selectedSubzone;
    expect(zone).toMatchObject({ key: zoneKey, label: "Cuádriceps", sets: 3 });
    expect(zone?.performance.summary).toMatchObject({ improved: 1, comparable: 1, insufficient: 1 });
    expect(zone?.exerciseIds.sort()).toEqual(["lunge", "press"]);
  });

  it("treats an empty baseline as insufficient instead of zero", () => {
    const chest = analytics("pecho").result.selected!;
    expect(chest.performance.summary).toMatchObject({ comparable: 0, insufficient: 1 });
    expect(chest.confidenceNote).toContain("No hay suficiente historial");
    expect(chest.loadComparison.results.every((metric) => metric.eligibility.status !== "comparable")).toBe(true);
    expect(chest.loadComparison.results.every((metric) => metric.deltaPercent === null)).toBe(true);
  });

  it("preserves custom range and group/subzone context through exercise navigation", () => {
    const state = { view: "muscles" as const, period: "custom" as const, customFrom: "2026-09-01", customTo: "2026-09-07", routineId: null, muscleKey: "piernas", muscleZoneKey: "cuádriceps" };
    expect(trainingAnalysisWorkspacePath(state)).toContain("period=custom&from=2026-09-01&to=2026-09-07&muscle=piernas&zone=cu%C3%A1driceps");
    expect(trainingAnalysisExercisePath("press", state)).toContain("view=muscles&period_from=2026-09-01&period_to=2026-09-07&muscle=piernas&zone=cu%C3%A1driceps");
  });

  it("keeps cross-muscle comparison limited to load without a global progress score", () => {
    const { primary } = analytics();
    const comparison = buildTrainingComparison({ kind: "muscles", analysis: primary, requestedA: "piernas", requestedB: "pecho" });
    expect(comparison.metrics).toEqual([...TRAINING_CROSS_MUSCLE_METRICS]);
    expect(comparison).not.toHaveProperty("performanceScore");
  });
});
