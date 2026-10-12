import { parseRoutineColor } from './routine-color';
import type { MobileApiClient } from './client';
import type { MobileApiReadResult } from './results';

export const MOBILE_HOME_API_PATH = '/api/mobile/v1/home' as const;

export type MobileReadResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'unavailable' };

export type MobileRoutineColorKey =
  | 'violet'
  | 'indigo'
  | 'blue'
  | 'cyan'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'rose'
  | 'sand'
  | 'stone'
  | 'slate'
  | 'graphite';

export type MobileHomeWorkoutStartRoutine = {
  id: string;
  name: string;
  color: MobileRoutineColorKey | null;
  exerciseCount: number;
  setCount: number;
};

export type MobileHomeTodaySession = {
  id: string;
  name: string;
  startedAt: string;
  endedAt: string;
  durationMilliseconds: number | null;
  exercisesCompleted: number;
  completedSets: number;
  status: 'completed';
};

export type MobileHomeResponse = {
  date: string;
  profile: MobileReadResult<{ displayName: string | null }>;
  nutrition: MobileReadResult<{
    calories: number;
    calorieTarget: number | null;
    proteinG: number;
    proteinTargetG: number | null;
    mealCount: number;
    waterL: number | null;
    waterTargetL: number | null;
    energyBalanceKcal: number | null;
  }>;
  training: {
    activeSession: MobileReadResult<{
      id: string;
      name: string;
      logDate: string;
      startedAt: string;
      exercisesCompleted: number;
      totalExercises: number;
      completedSets: number;
      totalSets: number;
      progressPercent: number;
    } | null>;
    workoutStartRoutines: MobileReadResult<MobileHomeWorkoutStartRoutine[]>;
    week: MobileReadResult<{
      summary: {
        weekStart: string;
        weekEnd: string;
        sessions: number;
        sets: number;
        minutes: number;
        routines: Record<string, number>;
        muscleGroups: Record<string, number>;
        trainingDays: string[];
      };
      todaySessions: MobileHomeTodaySession[];
    }>;
  };
};


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNullableNonNegativeNumber(value: unknown): value is number | null {
  return value === null || isNonNegativeNumber(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && isNonNegativeNumber(value);
}

function parseCountRecord(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const entries = Object.entries(value);
  if (entries.some(([key, count]) => !key.trim() || !isCount(count))) {
    return undefined;
  }
  return Object.fromEntries(entries) as Record<string, number>;
}

function parseReadResult<T>(
  value: unknown,
  parser: (data: unknown) => T | undefined,
): MobileReadResult<T> | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.status === 'unavailable') {
    return { status: 'unavailable' };
  }
  if (value.status !== 'ok' || !('data' in value)) {
    return null;
  }

  const data = parser(value.data);
  return data === undefined ? null : { status: 'ok', data };
}

function parseProfile(value: unknown) {
  if (
    !isRecord(value) ||
    !(typeof value.displayName === 'string' || value.displayName === null)
  ) {
    return undefined;
  }
  return { displayName: value.displayName };
}

function parseNutrition(value: unknown) {
  if (
    !isRecord(value) ||
    !isNonNegativeNumber(value.calories) ||
    !isNullableNonNegativeNumber(value.calorieTarget) ||
    !isNonNegativeNumber(value.proteinG) ||
    !isNullableNonNegativeNumber(value.proteinTargetG) ||
    !isCount(value.mealCount) ||
    !isNullableNonNegativeNumber(value.waterL) ||
    !isNullableNonNegativeNumber(value.waterTargetL) ||
    !isNullableFiniteNumber(value.energyBalanceKcal)
  ) {
    return undefined;
  }

  return {
    calories: value.calories,
    calorieTarget: value.calorieTarget,
    proteinG: value.proteinG,
    proteinTargetG: value.proteinTargetG,
    mealCount: value.mealCount,
    waterL: value.waterL,
    waterTargetL: value.waterTargetL,
    energyBalanceKcal: value.energyBalanceKcal,
  };
}

function parseActiveSession(value: unknown) {
  if (value === null) {
    return null;
  }
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !isIsoDate(value.logDate) ||
    !isTimestamp(value.startedAt) ||
    !isCount(value.exercisesCompleted) ||
    !isCount(value.totalExercises) ||
    !isCount(value.completedSets) ||
    !isCount(value.totalSets) ||
    !isCount(value.progressPercent) ||
    value.progressPercent > 100
  ) {
    return undefined;
  }

  return {
    id: value.id,
    name: value.name,
    logDate: value.logDate,
    startedAt: value.startedAt,
    exercisesCompleted: value.exercisesCompleted,
    totalExercises: value.totalExercises,
    completedSets: value.completedSets,
    totalSets: value.totalSets,
    progressPercent: value.progressPercent,
  };
}

function parseWeekSummary(value: unknown) {
  const routines = isRecord(value) ? parseCountRecord(value.routines) : undefined;
  const muscleGroups = isRecord(value)
    ? parseCountRecord(value.muscleGroups)
    : undefined;
  if (
    !isRecord(value) ||
    !isIsoDate(value.weekStart) ||
    !isIsoDate(value.weekEnd) ||
    !isCount(value.sessions) ||
    !isCount(value.sets) ||
    !isNonNegativeNumber(value.minutes) ||
    !routines ||
    !muscleGroups ||
    !Array.isArray(value.trainingDays) ||
    !value.trainingDays.every(isIsoDate)
  ) {
    return null;
  }

  return {
    weekStart: value.weekStart,
    weekEnd: value.weekEnd,
    sessions: value.sessions,
    sets: value.sets,
    minutes: value.minutes,
    routines,
    muscleGroups,
    trainingDays: [...value.trainingDays],
  };
}

function parseWorkoutStartRoutine(value: unknown): MobileHomeWorkoutStartRoutine | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    parseRoutineColor(value.color) === undefined ||
    !isCount(value.exerciseCount) ||
    !isCount(value.setCount)
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    color: parseRoutineColor(value.color)!,
    exerciseCount: value.exerciseCount,
    setCount: value.setCount,
  };
}

function parseWorkoutStartRoutines(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const routines = value.map(parseWorkoutStartRoutine);
  return routines.some((routine) => routine === null)
    ? undefined
    : routines.filter(
        (routine): routine is MobileHomeWorkoutStartRoutine => routine !== null,
      );
}

function parseTodaySession(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !isTimestamp(value.startedAt) ||
    !isTimestamp(value.endedAt) ||
    !isNullableNonNegativeNumber(value.durationMilliseconds) ||
    !isCount(value.exercisesCompleted) ||
    !isCount(value.completedSets) ||
    value.status !== 'completed'
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    startedAt: value.startedAt,
    endedAt: value.endedAt,
    durationMilliseconds: value.durationMilliseconds,
    exercisesCompleted: value.exercisesCompleted,
    completedSets: value.completedSets,
    status: 'completed' as const,
  };
}

function parseWeek(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.todaySessions)) {
    return undefined;
  }

  const summary = parseWeekSummary(value.summary);
  const todaySessions = value.todaySessions.map(parseTodaySession);
  if (!summary || todaySessions.some((session) => session === null)) {
    return undefined;
  }

  return {
    summary,
    todaySessions: todaySessions.filter(
      (session): session is NonNullable<typeof session> => session !== null,
    ),
  };
}

// Source of truth: src/lib/mobile-api/contracts.ts. Kept local so Metro never
// imports Next.js/server modules before shared packages are introduced.
export function parseMobileHomeResponse(value: unknown): MobileHomeResponse | null {
  if (!isRecord(value) || !isIsoDate(value.date) || !isRecord(value.training)) {
    return null;
  }

  const profile = parseReadResult(value.profile, parseProfile);
  const nutrition = parseReadResult(value.nutrition, parseNutrition);
  const activeSession = parseReadResult(
    value.training.activeSession,
    parseActiveSession,
  );
  const workoutStartRoutines = parseReadResult(
    value.training.workoutStartRoutines,
    parseWorkoutStartRoutines,
  );
  const week = parseReadResult(value.training.week, parseWeek);

  if (!profile || !nutrition || !activeSession || !workoutStartRoutines || !week) {
    return null;
  }

  return {
    date: value.date,
    profile,
    nutrition,
    training: { activeSession, workoutStartRoutines, week },
  };
}

export function fetchMobileHome(
  client: MobileApiClient,
  signal?: AbortSignal,
): Promise<MobileApiReadResult<MobileHomeResponse>> {
  return client.read({
    parse: (value) => parseMobileHomeResponse(value) ?? undefined,
    path: MOBILE_HOME_API_PATH,
    signal,
  });
}
