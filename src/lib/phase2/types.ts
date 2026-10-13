import type { RoutineColorKey } from "./routine-colors";

export type MuscleGroup =
  | "pecho"
  | "espalda"
  | "piernas"
  | "hombros"
  | "bíceps"
  | "tríceps"
  | "abdomen"
  | "cardio";

export type TrainingAdjustment =
  | "maintain"
  | "increase_weight"
  | "increase_reps"
  | "custom";

export type Exercise = {
  id: string;
  user_id: string;
  source_key: string | null;
  nombre: string;
  grupo_muscular: MuscleGroup | null;
  muscle_group_label: string | null;
  implement: string | null;
  weight_mode: string | null;
  series_sugeridas: number | null;
  reps_sugeridas: number | null;
  peso_sugerido: number | null;
  rir_sugerido: number | null;
  descanso_min_sugerido_segundos: number | null;
  descanso_max_sugerido_segundos: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Routine = {
  id: string;
  user_id: string;
  source_key: string | null;
  nombre: string;
  color: RoutineColorKey | null;
  routine_order: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RoutineExercise = {
  id: string;
  routine_id: string;
  exercise_id: string;
  exercise_order: number;
  next_adjustment: TrainingAdjustment;
  next_adjustment_note: string | null;
  rest_min_seconds: number | null;
  rest_max_seconds: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type RoutineExerciseSet = {
  id: string;
  user_id: string;
  routine_exercise_id: string;
  set_number: number;
  target_reps: number | null;
  target_weight_kg: number | null;
  target_rir: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkoutSessionStatus = "in_progress" | "completed" | "discarded";

export type WorkoutSession = {
  id: string;
  user_id: string;
  day_log_id: string;
  routine_id: string | null;
  routine_name_snapshot: string | null;
  session_name: string | null;
  status: WorkoutSessionStatus;
  started_at: string;
  ended_at: string | null;
  energy_level: number | null;
  performance_level: number | null;
  pain_level: number | null;
  pain_note: string | null;
  abs_completed: boolean;
  treadmill_minutes: number | null;
  treadmill_distance_km: number | null;
  treadmill_speed_kmh: number | null;
  treadmill_incline_percent: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkoutSessionExercise = {
  add_to_routine_on_finish?: boolean;
  id: string;
  user_id: string;
  workout_session_id: string;
  routine_exercise_id: string | null;
  exercise_id: string;
  exercise_order: number;
  source_type: "routine" | "extra" | "manual_new";
  nombre_snapshot: string;
  grupo_muscular_snapshot: MuscleGroup | null;
  muscle_group_label_snapshot: string | null;
  implement_snapshot: string | null;
  weight_mode_snapshot: string | null;
  rest_min_seconds_snapshot: number | null;
  rest_max_seconds_snapshot: number | null;
  planned_sets_count: number;
  next_adjustment_snapshot: TrainingAdjustment;
  next_adjustment_note_snapshot: string | null;
  decision: TrainingAdjustment;
  decision_note: string | null;
  apply_to_routine: boolean;
  routine_note_snapshot: string | null;
  notes: string | null;
  series_reales: number | null;
  reps_reales: number | null;
  peso_real: number | null;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkoutSet = {
  id: string;
  user_id: string;
  workout_session_exercise_id: string;
  set_number: number;
  target_reps: number | null;
  target_weight_kg: number | null;
  target_rir: number | null;
  actual_reps: number | null;
  actual_weight_kg: number | null;
  is_completed: boolean;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EditableRoutineSet = Pick<
  RoutineExerciseSet,
  "set_number" | "target_reps" | "target_weight_kg" | "target_rir" | "notes"
>;

export type EditableWorkoutSet = Pick<
  WorkoutSet,
  | "set_number"
  | "target_reps"
  | "target_weight_kg"
  | "target_rir"
  | "actual_reps"
  | "actual_weight_kg"
  | "is_completed"
  | "notes"
>;

export type RoutineExerciseTemplate = RoutineExercise & {
  exercise: Pick<
    Exercise,
    | "id"
    | "nombre"
    | "grupo_muscular"
    | "muscle_group_label"
    | "implement"
    | "weight_mode"
    | "is_active"
  >;
  sets: RoutineExerciseSet[];
};

export type WorkoutSessionExerciseDetail = WorkoutSessionExercise & {
  sets: WorkoutSet[];
};

export type WorkoutSessionDetail = {
  session: WorkoutSession;
  routineColor: RoutineColorKey | null;
  logDate: string;
  exercises: WorkoutSessionExerciseDetail[];
};

export type CompletedSessionSummary = {
  id: string;
  routineId: string | null;
  routineName: string;
  logDate: string;
  startedAt: string;
  endedAt: string;
  durationMilliseconds: number | null;
  exercisesCompleted: number;
  completedSets: number;
  volumeKg?: number | null;
  routineColor?: RoutineColorKey | null;
  muscleGroups: string[];
};

export type RoutineContinuity = {
  routineId: string;
  routineName: string;
  routineColor?: RoutineColorKey | null;
  lastLogDate: string | null;
  daysSince: number | null;
};

export type CompletedSessionCorrectionInput = {
  sessionId: string;
  expectedSessionUpdatedAt: string;
  metadata: Pick<
    SessionMetadataInput,
    | "energy_level"
    | "performance_level"
    | "pain_level"
    | "pain_note"
    | "treadmill_minutes"
    | "treadmill_distance_km"
    | "treadmill_speed_kmh"
    | "treadmill_incline_percent"
    | "notes"
  >;
  exercises: Array<{
    id: string;
    expectedUpdatedAt: string;
    notes: string;
    sets: Array<{
      id: string;
      actual_reps: number | null;
      actual_weight_kg: number | null;
      notes: string;
    }>;
  }>;
};

export type WorkoutSessionClient = Pick<
  WorkoutSession,
  | "id"
  | "routine_id"
  | "routine_name_snapshot"
  | "session_name"
  | "status"
  | "started_at"
  | "ended_at"
  | "energy_level"
  | "performance_level"
  | "pain_level"
  | "pain_note"
  | "treadmill_minutes"
  | "treadmill_distance_km"
  | "treadmill_speed_kmh"
  | "treadmill_incline_percent"
  | "notes"
>;

export type WorkoutSessionExerciseClient = Pick<
  WorkoutSessionExercise,
  | "id"
  | "exercise_id"
  | "routine_exercise_id"
  | "nombre_snapshot"
  | "grupo_muscular_snapshot"
  | "muscle_group_label_snapshot"
  | "implement_snapshot"
  | "weight_mode_snapshot"
  | "rest_min_seconds_snapshot"
  | "rest_max_seconds_snapshot"
  | "next_adjustment_snapshot"
  | "next_adjustment_note_snapshot"
  | "decision"
  | "decision_note"
  | "apply_to_routine"
  | "notes"
  | "updated_at"
> & {
  sets: EditableWorkoutSet[];
};

export type WorkoutSessionClientDetail = {
  session: WorkoutSessionClient;
  routineColor: RoutineColorKey | null;
  logDate: string;
  exercises: WorkoutSessionExerciseClient[];
};

export type SessionMetadataInput = {
  session_name: string;
  energy_level: number | null;
  performance_level: number | null;
  pain_level: number | null;
  pain_note: string;
  treadmill_minutes: number | null;
  treadmill_distance_km: number | null;
  treadmill_speed_kmh: number | null;
  treadmill_incline_percent: number | null;
  notes: string;
};

export type WorkoutExercisePayload = {
  is_completed: boolean;
  decision: TrainingAdjustment;
  decision_note: string;
  apply_to_routine: boolean;
  notes: string;
  sets: EditableWorkoutSet[];
};

export type RoutineExercisePayload = {
  next_adjustment: TrainingAdjustment;
  rest_min_seconds: number | null;
  rest_max_seconds: number | null;
  notes: string;
  sets: EditableRoutineSet[];
};

export type WeeklyTrainingSummary = {
  weekStart: string;
  weekEnd: string;
  sessions: number;
  exercises: number;
  sets: number;
  minutes: number;
  volumeKg: number;
  routines: Record<string, number>;
  muscleGroups: Record<string, number>;
  trainingDays: string[];
};

export type ExerciseProgressSummary = {
  exerciseId: string;
  name: string;
  muscleGroup: string | null;
  sessions: number;
  lastDate: string;
  bestWeightKg: number | null;
  totalVolumeKg: number;
  lastDecision: TrainingAdjustment;
  lastSets: EditableWorkoutSet[];
};
