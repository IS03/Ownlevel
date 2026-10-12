import { parseRoutineColor } from './routine-color';
import type { MobileReadResult, MobileRoutineColorKey } from './home';
import type { MobileApiClient } from './client';
import type { MobileApiMutationResult, MobileApiReadResult } from './results';

export const MOBILE_TRAINING_ROUTINES_API_PATH =
  '/api/mobile/v1/training/routines' as const;
export const MOBILE_TRAINING_INITIAL_PLAN_API_PATH =
  '/api/mobile/v1/training/routines/initial-plan' as const;

export type MobileTrainingRoutine = {
  id: string;
  name: string;
  color: MobileRoutineColorKey | null;
  order: number;
  isActive: boolean;
  exerciseCount: number;
  setCount: number;
};

export type MobileTrainingRoutinesResponse = {
  routines: MobileReadResult<MobileTrainingRoutine[]>;
  initialPlan: MobileReadResult<{
    imported: boolean;
    routinesFound: number;
  }>;
};

export type MobileTrainingRoutineCreateResponse = {
  routine: MobileTrainingRoutine;
};

export type MobileTrainingRoutineStatusResponse = {
  routine: {
    id: string;
    isActive: boolean;
    updatedAt: string;
  };
};

export type MobileTrainingInitialPlanResponse = {
  routines: number;
  exercises: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function parseRoutine(value: unknown): MobileTrainingRoutine | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !UUID_PATTERN.test(value.id) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    parseRoutineColor(value.color) === undefined ||
    !isNonNegativeInteger(value.order) ||
    typeof value.isActive !== 'boolean' ||
    !isNonNegativeInteger(value.exerciseCount) ||
    !isNonNegativeInteger(value.setCount)
  ) {
    return undefined;
  }
  return {
    id: value.id,
    name: value.name,
    color: parseRoutineColor(value.color)!,
    order: value.order,
    isActive: value.isActive,
    exerciseCount: value.exerciseCount,
    setCount: value.setCount,
  };
}

function parseReadResult<T>(
  value: unknown,
  parse: (data: unknown) => T | undefined,
): MobileReadResult<T> | undefined {
  if (!isRecord(value)) return undefined;
  if (value.status === 'unavailable') return { status: 'unavailable' };
  if (value.status !== 'ok' || !('data' in value)) return undefined;
  const data = parse(value.data);
  return data === undefined ? undefined : { status: 'ok', data };
}

function parseRoutineList(value: unknown): MobileTrainingRoutine[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const routines = value.map(parseRoutine);
  return routines.some((routine) => routine === undefined)
    ? undefined
    : routines as MobileTrainingRoutine[];
}

function parseInitialPlanStatus(
  value: unknown,
): { imported: boolean; routinesFound: number } | undefined {
  if (
    !isRecord(value) ||
    typeof value.imported !== 'boolean' ||
    !isNonNegativeInteger(value.routinesFound)
  ) {
    return undefined;
  }
  return { imported: value.imported, routinesFound: value.routinesFound };
}

export function parseMobileTrainingRoutinesResponse(
  value: unknown,
): MobileTrainingRoutinesResponse | undefined {
  if (!isRecord(value)) return undefined;
  const routines = parseReadResult(value.routines, parseRoutineList);
  const initialPlan = parseReadResult(value.initialPlan, parseInitialPlanStatus);
  return routines && initialPlan ? { routines, initialPlan } : undefined;
}

function parseCreateResponse(value: unknown): MobileTrainingRoutineCreateResponse | undefined {
  if (!isRecord(value)) return undefined;
  const routine = parseRoutine(value.routine);
  return routine ? { routine } : undefined;
}

function parseStatusResponse(value: unknown): MobileTrainingRoutineStatusResponse | undefined {
  if (!isRecord(value) || !isRecord(value.routine)) return undefined;
  const routine = value.routine;
  if (
    typeof routine.id !== 'string' ||
    !UUID_PATTERN.test(routine.id) ||
    typeof routine.isActive !== 'boolean' ||
    typeof routine.updatedAt !== 'string' ||
    !TIMESTAMP_PATTERN.test(routine.updatedAt)
  ) {
    return undefined;
  }
  return {
    routine: {
      id: routine.id,
      isActive: routine.isActive,
      updatedAt: routine.updatedAt,
    },
  };
}

function parseInitialPlanResponse(value: unknown): MobileTrainingInitialPlanResponse | undefined {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.routines) ||
    !isNonNegativeInteger(value.exercises)
  ) {
    return undefined;
  }
  return { routines: value.routines, exercises: value.exercises };
}

export function fetchMobileTrainingRoutines(
  client: MobileApiClient,
  signal?: AbortSignal,
): Promise<MobileApiReadResult<MobileTrainingRoutinesResponse>> {
  return client.read({
    parse: parseMobileTrainingRoutinesResponse,
    path: MOBILE_TRAINING_ROUTINES_API_PATH,
    signal,
  });
}

export function createMobileTrainingRoutine(
  client: MobileApiClient,
  input: { name: string; color: MobileRoutineColorKey; idempotencyKey: string },
): Promise<MobileApiMutationResult<MobileTrainingRoutineCreateResponse>> {
  return client.request({
    body: input,
    method: 'POST',
    parse: parseCreateResponse,
    path: MOBILE_TRAINING_ROUTINES_API_PATH,
  });
}

export function setMobileTrainingRoutineStatus(
  client: MobileApiClient,
  id: string,
  isActive: boolean,
): Promise<MobileApiMutationResult<MobileTrainingRoutineStatusResponse>> {
  return client.request({
    body: { isActive },
    method: 'PATCH',
    parse: parseStatusResponse,
    path: `${MOBILE_TRAINING_ROUTINES_API_PATH}/${encodeURIComponent(id)}`,
  });
}

export function importMobileTrainingInitialPlan(
  client: MobileApiClient,
): Promise<MobileApiMutationResult<MobileTrainingInitialPlanResponse>> {
  return client.request({
    method: 'POST',
    parse: parseInitialPlanResponse,
    path: MOBILE_TRAINING_INITIAL_PLAN_API_PATH,
  });
}
