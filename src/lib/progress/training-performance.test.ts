import { describe, expect, it } from "vitest";

import {
  buildTrainingFeelings,
  buildTrainingPerformanceComparison,
} from "./training-performance";
import type { TrainingAnalysisSource } from "../phase2/training-analysis";
import { configurationIdentity } from "../mobile-api/training-exercise-configuration-contract";
import type { WorkoutSession, WorkoutSessionExercise, WorkoutSet } from "../phase2/types";

type Observation = {
  id: string;
  exerciseId?: string;
  name?: string;
  date: string;
  mode?: string | null;
  sets?: Array<{ weight: number | null; reps: number | null }>;
  feedback?: { energy?: number | null; performance?: number | null; pain?: number | null };
  /** Implement snapshot; defaults to "Barra" (a known execution, so mode semantics are tested on their own). */
  implement?: string | null;
  /** Stored variant (#367); defaults to «no aplica». null = nothing stored (history before the capture). */
  configuration?: { kind: "recorded" | "not_applicable" | null; label: string | null } | null;
  /** Shares a session with another observation (repeated blocks of one exercise). */
  session?: string;
};

function source(observations: Observation[]): TrainingAnalysisSource {
  const sessions: WorkoutSession[] = [];
  const sessionExercises: WorkoutSessionExercise[] = [];
  const sets: WorkoutSet[] = [];
  const dates: Array<[string, string]> = [];
  const configurations = new Map<string, string | null>();
  for (const observation of observations) {
    const sessionId = `session-${observation.session ?? observation.id}`;
    const sessionExerciseId = `session-exercise-${observation.id}`;
    const dayId = `day-${observation.id}`;
    if (!sessions.some((session) => session.id === sessionId)) sessions.push({
      id: sessionId, user_id: "user", day_log_id: dayId, routine_id: "routine", routine_name_snapshot: "Rutina", session_name: null, status: "completed", started_at: `${observation.date}T10:00:00.000Z`, ended_at: `${observation.date}T11:00:00.000Z`, energy_level: observation.feedback?.energy ?? null, performance_level: observation.feedback?.performance ?? null, pain_level: observation.feedback?.pain ?? null, pain_note: null, abs_completed: false, treadmill_minutes: null, treadmill_distance_km: null, treadmill_speed_kmh: null, treadmill_incline_percent: null, notes: null, created_at: `${observation.date}T10:00:00.000Z`, updated_at: `${observation.date}T11:00:00.000Z`,
    });
    sessionExercises.push({
      id: sessionExerciseId, user_id: "user", workout_session_id: sessionId, routine_exercise_id: null, exercise_id: observation.exerciseId ?? "press", exercise_order: 1, source_type: "routine", nombre_snapshot: observation.name ?? "Press", grupo_muscular_snapshot: "pecho", muscle_group_label_snapshot: "Pecho", implement_snapshot: observation.implement === undefined ? "Barra" : observation.implement, weight_mode_snapshot: observation.mode === undefined ? "Peso total" : observation.mode, rest_min_seconds_snapshot: null, rest_max_seconds_snapshot: null, planned_sets_count: 1, next_adjustment_snapshot: "maintain", next_adjustment_note_snapshot: null, decision: "maintain", decision_note: null, apply_to_routine: false, routine_note_snapshot: null, notes: null, series_reales: null, reps_reales: null, peso_real: null, is_completed: true, completed_at: `${observation.date}T10:45:00.000Z`, created_at: `${observation.date}T10:00:00.000Z`, updated_at: `${observation.date}T10:45:00.000Z`,
    });
    for (const [index, set] of (observation.sets ?? [{ weight: 20, reps: 10 }]).entries()) {
      sets.push({ id: `set-${observation.id}-${index}`, user_id: "user", workout_session_exercise_id: sessionExerciseId, set_number: index + 1, target_reps: null, target_weight_kg: null, target_rir: null, actual_reps: set.reps, actual_weight_kg: set.weight, is_completed: true, completed_at: `${observation.date}T10:30:00.000Z`, notes: null, created_at: `${observation.date}T10:00:00.000Z`, updated_at: `${observation.date}T10:30:00.000Z` });
    }
    const identity = configurationIdentity(observation.configuration === undefined ? { kind: "not_applicable", label: null } : observation.configuration);
    if (identity) configurations.set(sessionExerciseId, identity);
    dates.push([dayId, observation.date]);
  }
  return { sessions, sessionExercises, sets, dateByDayLog: new Map(dates), configurations };
}

const periods = { primaryPeriod: { start: "2026-09-01", end: "2026-09-07" }, referencePeriod: { start: "2026-08-25", end: "2026-08-31" } };

function compare(observations: Observation[]) {
  return buildTrainingPerformanceComparison({ source: source(observations), ...periods });
}

describe("Training V2 comparable performance", () => {
  it("marks more reps at the same load as an improvement", () => {
    const result = compare([
      { id: "before", date: "2026-08-28", sets: [{ weight: 20, reps: 8 }] },
      { id: "now", date: "2026-09-03", sets: [{ weight: 20, reps: 11 }] },
    ]).exercises[0]!;
    expect(result.status).toBe("improved");
    expect(result.signal).toMatchObject({ kind: "new_rep_record", currentValue: 11, referenceValue: 8, contextValue: 20 });
  });

  it("marks more load at equal reps as an improvement", () => {
    const result = compare([
      { id: "before", date: "2026-08-28", sets: [{ weight: 17.5, reps: 10 }] },
      { id: "now", date: "2026-09-03", sets: [{ weight: 20, reps: 10 }] },
    ]).exercises[0]!;
    expect(result).toMatchObject({ status: "improved", isPersonalRecord: true });
    expect(result.signal?.kind).toBe("new_best_weight");
  });

  it("keeps equal direct performance stable and marks a clear comparable decline", () => {
    expect(compare([
      { id: "before", date: "2026-08-28", sets: [{ weight: 20, reps: 10 }] },
      { id: "now", date: "2026-09-03", sets: [{ weight: 20, reps: 10 }] },
    ]).exercises[0]?.status).toBe("stable");
    const decline = compare([
      { id: "before", date: "2026-08-28", sets: [{ weight: 20, reps: 10 }] },
      { id: "now", date: "2026-09-03", sets: [{ weight: 20, reps: 7 }] },
    ]).exercises[0]!;
    expect(decline.status).toBe("declined");
    expect(decline.signal?.kind).toBe("fewer_reps_same_load");
  });

  it("never turns a new exercise or an empty reference period into zero", () => {
    const result = compare([{ id: "now", date: "2026-09-03", sets: [{ weight: 20, reps: 10 }] }]);
    expect(result.exercises[0]).toMatchObject({ status: "insufficient_data", reason: "new_exercise", referenceSampleSize: 0 });
    expect(result.summary).toMatchObject({ comparable: 0, improved: 0, insufficient: 1 });
  });

  it("keeps exercise_id and weight_mode as mandatory comparison identity", () => {
    const differentIds = compare([
      { id: "before", exerciseId: "old-id", name: "Press", date: "2026-08-28" },
      { id: "now", exerciseId: "new-id", name: "Press", date: "2026-09-03" },
    ]);
    expect(differentIds.summary.comparable).toBe(0);
    expect(differentIds.exercises.every((item) => item.status === "insufficient_data")).toBe(true);

    const differentModes = compare([
      { id: "before", date: "2026-08-28", mode: "Peso total" },
      { id: "now", date: "2026-09-03", mode: "Por mancuerna" },
    ]).exercises[0]!;
    expect(differentModes).toMatchObject({ status: "insufficient_data", reason: "different_weight_mode" });
  });

  it("requires complete sets and a known mode", () => {
    expect(compare([
      { id: "before", date: "2026-08-28", sets: [{ weight: 20, reps: null }] },
      { id: "now", date: "2026-09-03", sets: [{ weight: 20, reps: 10 }] },
    ]).exercises[0]).toMatchObject({ status: "insufficient_data", reason: "incomplete_sets" });
    expect(compare([
      { id: "before", date: "2026-08-28", mode: null },
      { id: "now", date: "2026-09-03", mode: null },
    ]).exercises[0]).toMatchObject({ status: "insufficient_data", reason: "missing_weight_mode" });
  });

  it("recognizes a real PR against earlier history without inventing a global score", () => {
    const result = compare([
      { id: "historic", date: "2026-08-10", sets: [{ weight: 22.5, reps: 8 }] },
      { id: "before", date: "2026-08-28", sets: [{ weight: 20, reps: 10 }] },
      { id: "now", date: "2026-09-03", sets: [{ weight: 25, reps: 8 }] },
    ]).exercises[0]!;
    expect(result).toMatchObject({ status: "improved", isPersonalRecord: true });
    expect(result.signal?.kind).toBe("new_best_weight");
  });

  it("calculates PRs only against history with the same weight_mode", () => {
    const result = compare([
      { id: "historic-other-mode", date: "2026-08-10", mode: "Peso total", sets: [{ weight: 100, reps: 8 }] },
      { id: "before", date: "2026-08-28", mode: "Por mancuerna", sets: [{ weight: 20, reps: 10 }] },
      { id: "now", date: "2026-09-03", mode: "Por mancuerna", sets: [{ weight: 25, reps: 10 }] },
    ]).exercises[0]!;
    expect(result).toMatchObject({ status: "improved", isPersonalRecord: true });
    expect(result.signal).toMatchObject({ kind: "new_best_weight", currentValue: 25, referenceValue: 20 });
  });

  it("uses only comparable exercises in the denominator", () => {
    const result = compare([
      { id: "press-before", exerciseId: "press", date: "2026-08-28", sets: [{ weight: 20, reps: 8 }] },
      { id: "press-now", exerciseId: "press", date: "2026-09-03", sets: [{ weight: 20, reps: 10 }] },
      { id: "new", exerciseId: "new", name: "Ejercicio nuevo", date: "2026-09-04" },
    ]);
    expect(result.summary).toMatchObject({ improved: 1, comparable: 1, insufficient: 1, headline: "1 de 1 ejercicios mejoraron" });
  });

  it("uses mode-specific semantics for bodyweight, lingotes and seconds", () => {
    const result = compare([
      { id: "bw-before", exerciseId: "pullup", date: "2026-08-27", mode: "Peso corporal", sets: [{ weight: null, reps: 6 }] },
      { id: "bw-now", exerciseId: "pullup", date: "2026-09-02", mode: "Peso corporal", sets: [{ weight: null, reps: 9 }] },
      { id: "pin-before", exerciseId: "machine", date: "2026-08-27", mode: "Lingotes (no kg)", sets: [{ weight: 6, reps: 10 }] },
      { id: "pin-now", exerciseId: "machine", date: "2026-09-02", mode: "Lingotes (no kg)", sets: [{ weight: 7, reps: 10 }] },
      { id: "time-before", exerciseId: "plank", date: "2026-08-27", mode: "Tiempo (segundos)", sets: [{ weight: null, reps: 30 }] },
      { id: "time-now", exerciseId: "plank", date: "2026-09-02", mode: "Tiempo (segundos)", sets: [{ weight: null, reps: 45 }] },
    ]);
    expect(result.exercises.find((item) => item.exerciseId === "pullup")?.signal?.kind).toBe("more_reps_bodyweight");
    expect(result.exercises.find((item) => item.exerciseId === "machine")?.signal?.description).toContain("lingotes");
    expect(result.exercises.find((item) => item.exerciseId === "plank")?.signal?.kind).toBe("more_time");
  });
});

describe("Training V2 session feelings", () => {
  it("requires at least two real observations and reports coverage", () => {
    const data = source([
      { id: "one", date: "2026-09-02", feedback: { energy: 4, performance: 3, pain: 0 } },
      { id: "two", date: "2026-09-03", feedback: { energy: 5, performance: null, pain: 2 } },
      { id: "three", date: "2026-09-04", feedback: {} },
    ]);
    const feelings = buildTrainingFeelings(data, periods.primaryPeriod);
    expect(feelings.find((item) => item.key === "energy")).toMatchObject({ average: 4.5, registeredCount: 2, eligibleCount: 3 });
    expect(feelings.find((item) => item.key === "pain")).toMatchObject({ average: 1, registeredCount: 2 });
    expect(feelings.some((item) => item.key === "performance")).toBe(false);
  });
});

// #402 P1-C2: the same exercise and load semantics are not enough; the implement and the variant must be known and equal.
describe("Training V2 comparable performance — implement and variant (P1-C2)", () => {
  const variant = (label: string) => ({ kind: "recorded" as const, label });
  const one = (observations: Observation[]) => compare(observations).exercises[0]!;

  it("compares the same exercise, mode, implement and recorded variant", () => {
    const result = one([
      { id: "before", date: "2026-08-28", implement: "Mancuernas", configuration: variant("Agarre neutro"), sets: [{ weight: 20, reps: 8 }] },
      { id: "now", date: "2026-09-03", implement: "Mancuernas", configuration: variant("Agarre neutro"), sets: [{ weight: 20, reps: 10 }] },
    ]);
    expect(result).toMatchObject({ status: "improved", reason: "comparable" });
  });

  it("does not compare dumbbells against a barbell, nor call the barbell set a record (the P1-C1 repro)", () => {
    const result = one([
      { id: "historic", date: "2026-08-10", implement: "Mancuernas", sets: [{ weight: 50, reps: 8 }] },
      { id: "before", date: "2026-08-28", implement: "Mancuernas", sets: [{ weight: 50, reps: 8 }] },
      { id: "now", date: "2026-09-03", implement: "Barra", sets: [{ weight: 50, reps: 10 }] },
    ]);
    expect(result).toMatchObject({ status: "insufficient_data", reason: "different_implement", isPersonalRecord: false, signal: null });
  });

  it("does not compare two different recorded variants, nor a variant against «no aplica»", () => {
    expect(one([
      { id: "before", date: "2026-08-28", configuration: variant("Agarre neutro"), sets: [{ weight: 20, reps: 8 }] },
      { id: "now", date: "2026-09-03", configuration: variant("Agarre prono"), sets: [{ weight: 20, reps: 10 }] },
    ])).toMatchObject({ status: "insufficient_data", reason: "different_configuration", isPersonalRecord: false });
    expect(one([
      { id: "before", date: "2026-08-28", configuration: { kind: "not_applicable", label: null }, sets: [{ weight: 20, reps: 8 }] },
      { id: "now", date: "2026-09-03", configuration: variant("Banco inclinado"), sets: [{ weight: 20, reps: 10 }] },
    ])).toMatchObject({ status: "insufficient_data", reason: "different_configuration" });
  });

  it("treats the same variant and implement with another case or spacing as the same", () => {
    expect(one([
      { id: "before", date: "2026-08-28", implement: "mancuernas", configuration: variant("agarre neutro"), sets: [{ weight: 20, reps: 8 }] },
      { id: "now", date: "2026-09-03", implement: " Mancuernas ", configuration: variant("Agarre Neutro"), sets: [{ weight: 20, reps: 10 }] },
    ])).toMatchObject({ status: "improved", reason: "comparable" });
  });

  it("never treats an unknown variant as equal to a recorded one, or to another unknown", () => {
    expect(one([
      { id: "before", date: "2026-08-28", configuration: null, sets: [{ weight: 20, reps: 8 }] },
      { id: "now", date: "2026-09-03", configuration: variant("Agarre neutro"), sets: [{ weight: 20, reps: 10 }] },
    ])).toMatchObject({ status: "insufficient_data", reason: "unknown_configuration" });
    expect(one([
      { id: "before", date: "2026-08-28", configuration: null, sets: [{ weight: 20, reps: 8 }] },
      { id: "now", date: "2026-09-03", configuration: null, sets: [{ weight: 20, reps: 10 }] },
    ])).toMatchObject({ status: "insufficient_data", reason: "unknown_configuration" });
    // A stored kind without a usable label is unknown too, never "the same as anything".
    expect(one([
      { id: "before", date: "2026-08-28", configuration: { kind: "recorded", label: "  " }, sets: [{ weight: 20, reps: 8 }] },
      { id: "now", date: "2026-09-03", configuration: { kind: "recorded", label: "  " }, sets: [{ weight: 20, reps: 10 }] },
    ])).toMatchObject({ reason: "unknown_configuration" });
  });

  it("does not compare when the implement is missing on either side", () => {
    expect(one([
      { id: "before", date: "2026-08-28", implement: null, sets: [{ weight: 20, reps: 8 }] },
      { id: "now", date: "2026-09-03", implement: "Barra", sets: [{ weight: 20, reps: 10 }] },
    ])).toMatchObject({ status: "insufficient_data", reason: "missing_implement" });
    expect(one([
      { id: "before", date: "2026-08-28", implement: "  ", sets: [{ weight: 20, reps: 8 }] },
      { id: "now", date: "2026-09-03", implement: "  ", sets: [{ weight: 20, reps: 10 }] },
    ])).toMatchObject({ reason: "missing_implement" });
  });

  it("compares «no aplica» against «no aplica»: a known answer on both sides", () => {
    expect(one([
      { id: "before", date: "2026-08-28", configuration: { kind: "not_applicable", label: null }, sets: [{ weight: 20, reps: 10 }] },
      { id: "now", date: "2026-09-03", configuration: { kind: "not_applicable", label: null }, sets: [{ weight: 20, reps: 7 }] },
    ])).toMatchObject({ status: "declined", reason: "comparable" });
  });

  it("history before the capture (no implement, no variant stored) degrades to insufficient data and never feeds a record", () => {
    const old = { implement: null, configuration: null };
    const result = compare([
      { id: "historic", date: "2026-08-10", ...old, sets: [{ weight: 30, reps: 5 }] },
      { id: "before", date: "2026-08-28", ...old, sets: [{ weight: 20, reps: 8 }] },
      { id: "now", date: "2026-09-03", sets: [{ weight: 25, reps: 8 }] },
    ]);
    expect(result.exercises[0]).toMatchObject({ status: "insufficient_data", reason: "missing_implement", isPersonalRecord: false });
    expect(result.summary).toMatchObject({ comparable: 0, improved: 0, insufficient: 1 });
    // Both sides from before the capture: the same, nothing is compared.
    expect(compare([
      { id: "before", date: "2026-08-28", ...old, sets: [{ weight: 20, reps: 8 }] },
      { id: "now", date: "2026-09-03", ...old, sets: [{ weight: 25, reps: 8 }] },
    ]).summary).toMatchObject({ comparable: 0, insufficient: 1 });
  });

  it("keeps several variants or implements within one period apart; a period with some unknown variant is unknown", () => {
    const reference = { id: "before", date: "2026-08-28", configuration: variant("Agarre neutro"), sets: [{ weight: 20, reps: 8 }] };
    expect(one([reference,
      { id: "a", date: "2026-09-02", configuration: variant("Agarre neutro"), sets: [{ weight: 20, reps: 10 }] },
      { id: "b", date: "2026-09-04", configuration: variant("Agarre prono"), sets: [{ weight: 20, reps: 10 }] },
    ])).toMatchObject({ status: "insufficient_data", reason: "mixed_configuration" });
    expect(one([reference,
      { id: "a", date: "2026-09-02", configuration: variant("Agarre neutro"), sets: [{ weight: 20, reps: 10 }] },
      { id: "b", date: "2026-09-04", configuration: null, sets: [{ weight: 20, reps: 10 }] },
    ])).toMatchObject({ status: "insufficient_data", reason: "unknown_configuration" });
    expect(one([reference,
      { id: "a", date: "2026-09-02", configuration: variant("Agarre neutro"), implement: "Barra", sets: [{ weight: 20, reps: 10 }] },
      { id: "b", date: "2026-09-04", configuration: variant("Agarre neutro"), implement: "Mancuernas", sets: [{ weight: 20, reps: 10 }] },
    ])).toMatchObject({ reason: "different_implement" });
    // Two blocks of the exercise in ONE session with different variants: also mixed.
    expect(one([reference,
      { id: "a", session: "same", date: "2026-09-02", configuration: variant("Agarre neutro"), sets: [{ weight: 20, reps: 10 }] },
      { id: "b", session: "same", date: "2026-09-02", configuration: variant("Agarre prono"), sets: [{ weight: 20, reps: 10 }] },
    ])).toMatchObject({ reason: "mixed_configuration" });
  });

  it("two sessions on the same day with the same variant stay comparable; with different variants they do not", () => {
    const reference = { id: "before", date: "2026-08-28", configuration: variant("Agarre neutro"), sets: [{ weight: 20, reps: 8 }] };
    expect(one([reference,
      { id: "am", date: "2026-09-03", configuration: variant("Agarre neutro"), sets: [{ weight: 20, reps: 9 }] },
      { id: "pm", date: "2026-09-03", configuration: variant("agarre neutro"), sets: [{ weight: 20, reps: 10 }] },
    ])).toMatchObject({ status: "improved", reason: "comparable" });
    expect(one([reference,
      { id: "am", date: "2026-09-03", configuration: variant("Agarre neutro"), sets: [{ weight: 20, reps: 9 }] },
      { id: "pm", date: "2026-09-03", configuration: variant("Agarre prono"), sets: [{ weight: 20, reps: 10 }] },
    ])).toMatchObject({ status: "insufficient_data", reason: "mixed_configuration" });
  });

  it("a record only counts against earlier sessions of the same variant", () => {
    const neutral = variant("Agarre neutro");
    // Older history with another variant had more reps at 20 kg: it does not hide the record of this variant.
    const result = one([
      { id: "historic-other", date: "2026-08-10", configuration: variant("Agarre prono"), sets: [{ weight: 20, reps: 15 }, { weight: 40, reps: 5 }] },
      { id: "before", date: "2026-08-28", configuration: neutral, sets: [{ weight: 20, reps: 8 }] },
      { id: "now", date: "2026-09-03", configuration: neutral, sets: [{ weight: 20, reps: 10 }] },
    ]);
    expect(result).toMatchObject({ status: "improved", isPersonalRecord: true });
    expect(result.signal).toMatchObject({ kind: "new_rep_record", currentValue: 10, referenceValue: 8 });
    // The same history with this variant does hide it.
    expect(one([
      { id: "historic-same", date: "2026-08-10", configuration: variant("AGARRE NEUTRO"), sets: [{ weight: 20, reps: 15 }] },
      { id: "before", date: "2026-08-28", configuration: neutral, sets: [{ weight: 20, reps: 8 }] },
      { id: "now", date: "2026-09-03", configuration: neutral, sets: [{ weight: 20, reps: 10 }] },
    ])).toMatchObject({ isPersonalRecord: false });
    // History of unknown variant (before the capture) never feeds a record, in either direction.
    expect(one([
      { id: "historic-unknown", date: "2026-08-10", configuration: null, sets: [{ weight: 20, reps: 15 }] },
      { id: "before", date: "2026-08-28", configuration: neutral, sets: [{ weight: 20, reps: 8 }] },
      { id: "now", date: "2026-09-03", configuration: neutral, sets: [{ weight: 20, reps: 10 }] },
    ])).toMatchObject({ isPersonalRecord: true, signal: { referenceValue: 8 } });
  });

  it("keeps the earlier reasons first: mode changes and incomplete sets", () => {
    expect(one([
      { id: "before", date: "2026-08-28", mode: "Por mancuerna", implement: "Mancuernas", sets: [{ weight: 20, reps: 8 }] },
      { id: "now", date: "2026-09-03", mode: "Peso total", implement: "Barra", sets: [{ weight: 40, reps: 8 }] },
    ])).toMatchObject({ reason: "different_weight_mode" });
    expect(one([
      { id: "before", date: "2026-08-28", sets: [{ weight: null, reps: 8 }] },
      { id: "now", date: "2026-09-03", sets: [{ weight: 20, reps: 8 }] },
    ])).toMatchObject({ reason: "incomplete_sets" });
    // An unknown variant is reported before incomplete sets: there is nothing to compare either way.
    expect(one([
      { id: "before", date: "2026-08-28", configuration: null, sets: [{ weight: null, reps: 8 }] },
      { id: "now", date: "2026-09-03", sets: [{ weight: 20, reps: 8 }] },
    ])).toMatchObject({ reason: "unknown_configuration" });
  });

  it("counts only comparable executions in «X de Y mejoraron»", () => {
    const result = compare([
      { id: "a-before", exerciseId: "a", date: "2026-08-28", sets: [{ weight: 20, reps: 8 }] },
      { id: "a-now", exerciseId: "a", date: "2026-09-03", sets: [{ weight: 20, reps: 10 }] },
      { id: "b-before", exerciseId: "b", date: "2026-08-28", implement: "Mancuernas", sets: [{ weight: 20, reps: 8 }] },
      { id: "b-now", exerciseId: "b", date: "2026-09-03", implement: "Barra", sets: [{ weight: 20, reps: 12 }] },
      { id: "c-before", exerciseId: "c", date: "2026-08-28", configuration: null, sets: [{ weight: 20, reps: 8 }] },
      { id: "c-now", exerciseId: "c", date: "2026-09-03", configuration: null, sets: [{ weight: 30, reps: 8 }] },
    ]);
    expect(result.summary).toMatchObject({ improved: 1, comparable: 1, insufficient: 2, headline: "1 de 1 ejercicios mejoraron" });
    // Only the comparable one may be a record; the barbell set and the unknown one never are.
    expect(result.exercises.filter((item) => item.isPersonalRecord).map((item) => item.exerciseId)).toEqual(["a"]);
  });
});
