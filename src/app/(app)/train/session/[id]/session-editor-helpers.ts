import type {
  SessionMetadataInput,
  WorkoutExercisePayload,
  WorkoutSessionClient,
  WorkoutSessionClientDetail,
  WorkoutSessionDetail,
  WorkoutSessionExerciseClient,
} from "@/lib/phase2/types";

export type SelectableTrainingDecision = Extract<
  WorkoutSessionExerciseClient["decision"],
  "increase_weight" | "increase_reps"
>;

export function toggleTrainingDecision(
  current: WorkoutSessionExerciseClient["decision"],
  clicked: SelectableTrainingDecision | "maintain",
): WorkoutSessionExerciseClient["decision"] {
  if (clicked === "maintain") return "maintain";
  return current === clicked ? "maintain" : clicked;
}

/** Keeps an expanded card at the same viewport position after sibling layout changes. */
export function calculateScrollCompensation(beforeTop: number, afterTop: number) {
  return afterTop - beforeTop;
}

/** A note alone is informational; only reminders or target updates configure a future action. */
export function hasFutureExerciseAction(
  decision: WorkoutSessionExerciseClient["decision"],
  applyToRoutine: boolean,
) {
  return decision !== "maintain" || applyToRoutine;
}

export type CompactAutosaveStatus = "idle" | "saved" | "saving" | "dirty" | "error";

/** Normal autosave phases share a header slot; only failures open recovery UI. */
export function compactAutosaveStatus(input: {
  saved: boolean;
  saving: boolean;
  dirty: boolean;
  error: string | null;
}): CompactAutosaveStatus {
  if (input.error) return "error";
  if (input.saving) return "saving";
  if (input.dirty) return "dirty";
  if (input.saved) return "saved";
  return "idle";
}

export function workoutPayloadFromDetail(
  exercise: WorkoutSessionExerciseClient,
): WorkoutExercisePayload {
  const sets = exercise.sets.map((set) => ({
    set_number: set.set_number,
      target_reps: set.target_reps,
      target_weight_kg: set.target_weight_kg,
      target_rir: set.target_rir,
    actual_reps: set.actual_reps,
    actual_weight_kg: set.actual_weight_kg,
    is_completed: set.is_completed,
    notes: set.notes,
  }));
  return {
    is_completed: sets.some((set) => set.is_completed),
    decision: exercise.decision,
    decision_note: exercise.decision_note ?? "",
    apply_to_routine: exercise.routine_exercise_id
      ? exercise.apply_to_routine
      : false,
    notes: exercise.notes ?? "",
    sets,
  };
}

/**
 * A reminder belongs to the session that created it, not to the new decision
 * the user is making now. Keep the display formatting in one place so the
 * collapsed and expanded exercise cards cannot disagree.
 */
export function nextSessionReminder(
  adjustment: WorkoutSessionExerciseClient["next_adjustment_snapshot"],
  note: WorkoutSessionExerciseClient["next_adjustment_note_snapshot"],
): string | null {
  switch (adjustment) {
    case "increase_weight":
      return "Subir peso";
    case "increase_reps":
      return "Subir repeticiones";
    case "custom": {
      const normalized = note?.trim();
      return normalized || null;
    }
    case "maintain":
    default:
      return null;
  }
}

export function sessionMetadataFromSession(
  session: WorkoutSessionClient,
): SessionMetadataInput {
  return {
    session_name: session.session_name ?? session.routine_name_snapshot ?? "",
    energy_level: session.energy_level,
    performance_level: session.performance_level,
    pain_level: session.pain_level,
    pain_note: session.pain_note ?? "",
    treadmill_minutes: session.treadmill_minutes,
    treadmill_distance_km: session.treadmill_distance_km,
    treadmill_speed_kmh: session.treadmill_speed_kmh,
    treadmill_incline_percent: session.treadmill_incline_percent,
    notes: session.notes ?? "",
  };
}

export function clientDetailFromWorkoutDetail(
  detail: WorkoutSessionDetail,
): WorkoutSessionClientDetail {
  const session = detail.session;
  return {
    session: {
      id: session.id,
      routine_id: session.routine_id,
      routine_name_snapshot: session.routine_name_snapshot,
      session_name: session.session_name,
      status: session.status,
      started_at: session.started_at,
      ended_at: session.ended_at,
      energy_level: session.energy_level,
      performance_level: session.performance_level,
      pain_level: session.pain_level,
      pain_note: session.pain_note,
      treadmill_minutes: session.treadmill_minutes,
      treadmill_distance_km: session.treadmill_distance_km,
      treadmill_speed_kmh: session.treadmill_speed_kmh,
      treadmill_incline_percent: session.treadmill_incline_percent,
      notes: session.notes,
    },
    routineColor: detail.routineColor,
    logDate: detail.logDate,
    exercises: detail.exercises.map((exercise) => ({
      id: exercise.id,
      exercise_id: exercise.exercise_id,
      routine_exercise_id: exercise.routine_exercise_id,
      nombre_snapshot: exercise.nombre_snapshot,
      grupo_muscular_snapshot: exercise.grupo_muscular_snapshot,
      muscle_group_label_snapshot: exercise.muscle_group_label_snapshot,
      implement_snapshot: exercise.implement_snapshot,
      weight_mode_snapshot: exercise.weight_mode_snapshot,
      rest_min_seconds_snapshot: exercise.rest_min_seconds_snapshot,
      rest_max_seconds_snapshot: exercise.rest_max_seconds_snapshot,
      next_adjustment_snapshot: exercise.next_adjustment_snapshot,
      next_adjustment_note_snapshot: exercise.next_adjustment_note_snapshot,
      decision: exercise.decision,
      decision_note: exercise.decision_note,
      apply_to_routine: exercise.apply_to_routine,
      notes: exercise.notes,
      updated_at: exercise.updated_at,
      sets: exercise.sets.map((set) => ({
        set_number: set.set_number,
        target_reps: set.target_reps,
        target_weight_kg: set.target_weight_kg,
        target_rir: set.target_rir,
        actual_reps: set.actual_reps,
        actual_weight_kg: set.actual_weight_kg,
        is_completed: set.is_completed,
        set_kind: set.set_kind,
        notes: set.notes,
      })),
    })),
  };
}

/**
 * Cardio belongs to a real session exercise. Prefer the enum snapshot and use
 * the historical label only as a compatibility fallback for older snapshots.
 */
export function sessionHasCardioExercise(
  exercises: ReadonlyArray<
    Pick<
      WorkoutSessionExerciseClient,
      "grupo_muscular_snapshot" | "muscle_group_label_snapshot"
    >
  >,
) {
  return exercises.some(
    (exercise) =>
      exercise.grupo_muscular_snapshot === "cardio" ||
      (exercise.grupo_muscular_snapshot === null &&
        exercise.muscle_group_label_snapshot?.trim().toLocaleLowerCase("es-AR") ===
          "cardio"),
  );
}

export function renumberWorkoutPayload(
  payload: WorkoutExercisePayload,
): WorkoutExercisePayload {
  const sets = payload.sets.map((set, index) => ({
    ...set,
    set_number: index + 1,
  }));
  return {
    ...payload,
    sets,
    is_completed: sets.some((set) => set.is_completed),
  };
}

export type ExercisePayloadEntry = {
  id: string;
  payload: WorkoutExercisePayload;
};

export function exerciseCompletion(payload: WorkoutExercisePayload) {
  const completedSets = payload.sets.filter((set) => set.is_completed).length;
  const totalSets = payload.sets.length;
  return {
    completedSets,
    totalSets,
    hasStarted: completedSets > 0,
    isComplete: totalSets > 0 && completedSets === totalSets,
  };
}

/** Compact, stable progress copy for the collapsed exercise header. */
export function exerciseProgressLabel(payload: WorkoutExercisePayload) {
  const { completedSets, totalSets } = exerciseCompletion(payload);
  return `${completedSets}/${totalSets}`;
}

export function initialExpandedExerciseId(
  exercises: ExercisePayloadEntry[],
): string | null {
  const partial = exercises.find(({ payload }) => {
    const completion = exerciseCompletion(payload);
    return completion.hasStarted && !completion.isComplete;
  });
  if (partial) return partial.id;

  const incomplete = exercises.find(
    ({ payload }) => !exerciseCompletion(payload).isComplete,
  );
  return incomplete?.id ?? null;
}

export function completionStats(payloads: WorkoutExercisePayload[]) {
  let completedSets = 0;
  let totalSets = 0;
  let completedExercises = 0;
  for (const payload of payloads) {
    const completion = exerciseCompletion(payload);
    completedSets += completion.completedSets;
    totalSets += completion.totalSets;
    if (completion.isComplete) completedExercises += 1;
  }
  return { completedSets, totalSets, completedExercises };
}

const CORDOBA_TIME_ZONE = "America/Argentina/Cordoba";

function timestampMilliseconds(value: string | null | undefined): number | null {
  if (!value) return null;
  const milliseconds = new Date(value).getTime();
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function formatWorkoutClockTime(value: string | null | undefined): string | null {
  const milliseconds = timestampMilliseconds(value);
  if (milliseconds === null) return null;
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: CORDOBA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(milliseconds));
}

export function getWorkoutElapsedMilliseconds(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
): number | null {
  const start = timestampMilliseconds(startedAt);
  const end = timestampMilliseconds(endedAt);
  if (start === null || end === null || end < start) return null;
  return end - start;
}

export function formatWorkoutDuration(milliseconds: number | null): string | null {
  if (milliseconds === null || !Number.isFinite(milliseconds) || milliseconds < 0) {
    return null;
  }
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes === 0) return "<1 min";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours === 0
    ? `${minutes} min`
    : `${hours} h ${String(remainingMinutes).padStart(2, "0")} min`;
}

export function formatWorkoutTimeRange(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
): string | null {
  const start = formatWorkoutClockTime(startedAt);
  const end = formatWorkoutClockTime(endedAt);
  return start && end ? `${start}–${end}` : null;
}
