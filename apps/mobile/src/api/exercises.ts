import { parseRoutineColor } from './routine-color';
import type { MobileApiClient } from './client';
import type { MobileReadResult, MobileRoutineColorKey } from './home';
import type { MobileApiMutationResult, MobileApiReadResult } from './results';

export const MOBILE_TRAINING_EXERCISES_API_PATH =
  '/api/mobile/v1/training/exercises' as const;

export type MobileTrainingMuscleGroup =
  | 'pecho'
  | 'espalda'
  | 'piernas'
  | 'hombros'
  | 'bíceps'
  | 'tríceps'
  | 'abdomen'
  | 'cardio';

export type MobileTrainingExerciseMutation = {
  name: string;
  muscleGroup: MobileTrainingMuscleGroup | null;
  muscleGroupLabel: string | null;
  implement: string | null;
  weightMode: string | null;
  suggestedSets: number | null;
  suggestedReps: number | null;
  suggestedWeight: number | null;
  suggestedRir: number | null;
  suggestedRestMinSeconds: number | null;
  suggestedRestMaxSeconds: number | null;
  notes: string | null;
};

export type MobileTrainingExercise = MobileTrainingExerciseMutation & {
  id: string;
  isActive: boolean;
  routineIds: string[];
  updatedAt: string;
};

export type MobileTrainingExerciseRoutine = {
  id: string;
  name: string;
  color: MobileRoutineColorKey | null;
};

export type MobileTrainingExercisesResponse = {
  catalog: MobileReadResult<{
    exercises: MobileTrainingExercise[];
    routines: MobileTrainingExerciseRoutine[];
  }>;
};

export type MobileTrainingExerciseMutationResponse = {
  exercise: MobileTrainingExercise;
  warning?: string;
};

export type MobileTrainingExerciseStatusResponse = {
  exercise: { id: string; isActive: boolean; updatedAt: string };
};

const MUSCLE_GROUPS = new Set<MobileTrainingMuscleGroup>([
  'pecho', 'espalda', 'piernas', 'hombros', 'bíceps', 'tríceps', 'abdomen', 'cardio',
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableText(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function nullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function numberInRange(value: unknown, maximum: number, integer = false): boolean {
  return value === null || (
    nullableNumber(value) && value >= 0 && value <= maximum && (!integer || Number.isInteger(value))
  );
}

function parseExercise(value: unknown): MobileTrainingExercise | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.id !== 'string' || !UUID_PATTERN.test(value.id) ||
    typeof value.name !== 'string' || !value.name.trim() ||
    (value.muscleGroup !== null && !MUSCLE_GROUPS.has(value.muscleGroup as MobileTrainingMuscleGroup)) ||
    !nullableText(value.muscleGroupLabel) || !nullableText(value.implement) ||
    !nullableText(value.weightMode) || !numberInRange(value.suggestedSets, 100, true) ||
    !numberInRange(value.suggestedReps, 1000, true) ||
    !numberInRange(value.suggestedWeight, 9999.99) ||
    !numberInRange(value.suggestedRir, 10, true) ||
    !numberInRange(value.suggestedRestMinSeconds, 3600, true) ||
    !numberInRange(value.suggestedRestMaxSeconds, 3600, true) || !nullableText(value.notes) ||
    ((value.suggestedRestMinSeconds === null) !== (value.suggestedRestMaxSeconds === null)) ||
    (typeof value.suggestedRestMinSeconds === 'number' &&
      typeof value.suggestedRestMaxSeconds === 'number' &&
      value.suggestedRestMinSeconds > value.suggestedRestMaxSeconds) ||
    typeof value.isActive !== 'boolean' || !Array.isArray(value.routineIds) ||
    !value.routineIds.every((id) => typeof id === 'string' && UUID_PATTERN.test(id)) ||
    new Set(value.routineIds).size !== value.routineIds.length ||
    typeof value.updatedAt !== 'string' || !TIMESTAMP_PATTERN.test(value.updatedAt)
  ) {
    return undefined;
  }
  return value as MobileTrainingExercise;
}

function parseRoutine(value: unknown): MobileTrainingExerciseRoutine | undefined {
  if (
    !isRecord(value) || typeof value.id !== 'string' || !UUID_PATTERN.test(value.id) ||
    typeof value.name !== 'string' || !value.name.trim() ||
    parseRoutineColor(value.color) === undefined
  ) {
    return undefined;
  }
  return { ...value, color: parseRoutineColor(value.color)! } as MobileTrainingExerciseRoutine;
}

function parseCatalog(value: unknown): MobileTrainingExercisesResponse['catalog'] | undefined {
  if (!isRecord(value)) return undefined;
  if (value.status === 'unavailable') return { status: 'unavailable' };
  if (value.status !== 'ok' || !isRecord(value.data)) return undefined;
  if (!Array.isArray(value.data.exercises) || !Array.isArray(value.data.routines)) return undefined;
  const exercises = value.data.exercises.map(parseExercise);
  const routines = value.data.routines.map(parseRoutine);
  if (exercises.some((item) => !item) || routines.some((item) => !item)) return undefined;
  return {
    status: 'ok',
    data: {
      exercises: exercises as MobileTrainingExercise[],
      routines: routines as MobileTrainingExerciseRoutine[],
    },
  };
}

export function parseMobileTrainingExercisesResponse(
  value: unknown,
): MobileTrainingExercisesResponse | undefined {
  if (!isRecord(value)) return undefined;
  const catalog = parseCatalog(value.catalog);
  return catalog ? { catalog } : undefined;
}

function parseMutationResponse(value: unknown): MobileTrainingExerciseMutationResponse | undefined {
  if (!isRecord(value)) return undefined;
  const exercise = parseExercise(value.exercise);
  if (!exercise || (value.warning !== undefined && typeof value.warning !== 'string')) return undefined;
  return {
    exercise,
    ...(typeof value.warning === 'string' ? { warning: value.warning } : {}),
  };
}

function parseStatusResponse(value: unknown): MobileTrainingExerciseStatusResponse | undefined {
  if (!isRecord(value) || !isRecord(value.exercise)) return undefined;
  const exercise = value.exercise;
  if (
    typeof exercise.id !== 'string' || !UUID_PATTERN.test(exercise.id) ||
    typeof exercise.isActive !== 'boolean' || typeof exercise.updatedAt !== 'string' ||
    !TIMESTAMP_PATTERN.test(exercise.updatedAt)
  ) return undefined;
  return { exercise: exercise as MobileTrainingExerciseStatusResponse['exercise'] };
}

export function fetchMobileTrainingExercises(
  client: MobileApiClient,
  signal?: AbortSignal,
): Promise<MobileApiReadResult<MobileTrainingExercisesResponse>> {
  return client.read({
    parse: parseMobileTrainingExercisesResponse,
    path: MOBILE_TRAINING_EXERCISES_API_PATH,
    signal,
  });
}

export function createMobileTrainingExercise(
  client: MobileApiClient,
  input: {
    exercise: MobileTrainingExerciseMutation;
    routineIds: [] | [string];
    idempotencyKey: string;
  },
): Promise<MobileApiMutationResult<MobileTrainingExerciseMutationResponse>> {
  return client.request({
    body: input,
    method: 'POST',
    parse: parseMutationResponse,
    path: MOBILE_TRAINING_EXERCISES_API_PATH,
  });
}

export function updateMobileTrainingExercise(
  client: MobileApiClient,
  id: string,
  exercise: MobileTrainingExerciseMutation,
  routineIds: string[],
): Promise<MobileApiMutationResult<MobileTrainingExerciseMutationResponse>> {
  return client.request({
    body: { operation: 'update', exercise, routineIds },
    method: 'PATCH',
    parse: parseMutationResponse,
    path: `${MOBILE_TRAINING_EXERCISES_API_PATH}/${encodeURIComponent(id)}`,
  });
}

export function setMobileTrainingExerciseStatus(
  client: MobileApiClient,
  id: string,
  isActive: boolean,
): Promise<MobileApiMutationResult<MobileTrainingExerciseStatusResponse>> {
  return client.request({
    body: { operation: 'set_status', isActive },
    method: 'PATCH',
    parse: parseStatusResponse,
    path: `${MOBILE_TRAINING_EXERCISES_API_PATH}/${encodeURIComponent(id)}`,
  });
}
