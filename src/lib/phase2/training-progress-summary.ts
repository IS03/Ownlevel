import { completedWorkSet } from "./training-set-kind";
import type {
  WorkoutSession,
  WorkoutSessionExercise,
  WorkoutSet,
  WeeklyTrainingSummary,
} from "./types";

type TrainingProgressSource = {
  sessions: Array<Pick<
    WorkoutSession,
    "id" | "day_log_id" | "routine_name_snapshot" | "session_name" | "status" | "started_at" | "ended_at"
  >>;
  sessionExercises: Array<Pick<
    WorkoutSessionExercise,
    "id" | "workout_session_id" | "grupo_muscular_snapshot" | "muscle_group_label_snapshot"
  >>;
  sets: Array<Pick<
    WorkoutSet,
    "workout_session_exercise_id" | "actual_reps" | "actual_weight_kg" | "is_completed" | "set_kind"
  >>;
  dateByDayLog: Map<string, string>;
};

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addUtcDays(value: string, days: number): string {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

export function mondayOfIsoDate(value: string): string {
  const date = parseIsoDate(value);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return isoDate(date);
}

export function formatTrainingMinutes(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  if (hours === 0) return `${remainingMinutes} min`;
  if (remainingMinutes === 0) return `${hours} h`;
  return `${hours} h ${remainingMinutes} min`;
}

function sessionMinutes(session: TrainingProgressSource["sessions"][number]): number {
  if (!session.started_at || !session.ended_at) return 0;
  const milliseconds =
    new Date(session.ended_at).getTime() - new Date(session.started_at).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 0;
  return Math.round(milliseconds / 60_000);
}

function workoutSetVolume(set: TrainingProgressSource["sets"][number]): number {
  return (set.actual_reps ?? 0) * (set.actual_weight_kg ?? 0);
}

function muscleGroupName(exercise: TrainingProgressSource["sessionExercises"][number]): string {
  const label = exercise.muscle_group_label_snapshot?.trim();
  if (label) return label;
  const group = exercise.grupo_muscular_snapshot;
  if (!group) return "Sin grupo";
  return `${group.slice(0, 1).toLocaleUpperCase("es-AR")}${group.slice(1)}`;
}

function emptyWeek(weekStart: string): WeeklyTrainingSummary {
  return {
    weekStart,
    weekEnd: addUtcDays(weekStart, 6),
    sessions: 0,
    exercises: 0,
    sets: 0,
    minutes: 0,
    volumeKg: 0,
    routines: {},
    muscleGroups: {},
    trainingDays: [],
  };
}

export function buildWeeklyTrainingSummaries(
  data: TrainingProgressSource,
  currentDate: string,
): WeeklyTrainingSummary[] {
  const completedSessions = data.sessions.filter(
    (session) => session.status === "completed",
  );
  const currentWeek = mondayOfIsoDate(currentDate);
  const sessionDates = completedSessions
    .map((session) => data.dateByDayLog.get(session.day_log_id))
    .filter((date): date is string => {
      if (!date) return false;
      return mondayOfIsoDate(date) <= currentWeek;
    });
  const firstWeek = sessionDates.length
    ? mondayOfIsoDate([...sessionDates].sort()[0])
    : currentWeek;

  const weekMap = new Map<string, WeeklyTrainingSummary>();
  let cursor = firstWeek;
  let guard = 0;
  while (cursor <= currentWeek && guard < 520) {
    weekMap.set(cursor, emptyWeek(cursor));
    cursor = addUtcDays(cursor, 7);
    guard += 1;
  }

  const completedSessionIds = new Set(completedSessions.map((session) => session.id));
  const sessionById = new Map(completedSessions.map((session) => [session.id, session]));
  const setsByExercise = new Map<string, TrainingProgressSource["sets"]>();
  for (const set of data.sets) {
    if (!completedWorkSet(set)) continue;
    const current = setsByExercise.get(set.workout_session_exercise_id) ?? [];
    current.push(set);
    setsByExercise.set(set.workout_session_exercise_id, current);
  }

  for (const session of completedSessions) {
    const date = data.dateByDayLog.get(session.day_log_id);
    if (!date) continue;
    const summary = weekMap.get(mondayOfIsoDate(date));
    if (!summary) continue;
    summary.sessions += 1;
    summary.minutes += sessionMinutes(session);
    summary.trainingDays.push(date);
    const routineName = session.routine_name_snapshot ?? session.session_name ?? "Sesión libre";
    summary.routines[routineName] = (summary.routines[routineName] ?? 0) + 1;
  }

  for (const exercise of data.sessionExercises) {
    if (!completedSessionIds.has(exercise.workout_session_id)) continue;
    const session = sessionById.get(exercise.workout_session_id);
    if (!session) continue;
    const date = data.dateByDayLog.get(session.day_log_id);
    if (!date) continue;
    const summary = weekMap.get(mondayOfIsoDate(date));
    if (!summary) continue;
    const completedSets = setsByExercise.get(exercise.id) ?? [];
    if (completedSets.length === 0) continue;
    summary.exercises += 1;
    summary.sets += completedSets.length;
    summary.volumeKg += completedSets.reduce(
      (total, set) => total + workoutSetVolume(set),
      0,
    );
    const group = muscleGroupName(exercise);
    summary.muscleGroups[group] = (summary.muscleGroups[group] ?? 0) + completedSets.length;
  }

  for (const summary of weekMap.values()) {
    summary.trainingDays = [...new Set(summary.trainingDays)].sort();
  }

  return [...weekMap.values()].sort((left, right) =>
    right.weekStart.localeCompare(left.weekStart),
  );
}
