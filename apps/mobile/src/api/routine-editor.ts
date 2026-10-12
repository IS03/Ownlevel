import { isKnownRoutineColor, parseRoutineColor } from './routine-color';
import type { MobileApiClient } from './client';
import type { MobileRoutineColorKey } from './home';
import type { MobileTrainingMuscleGroup } from './exercises';
import type { MobileApiMutationResult, MobileApiReadResult } from './results';

export type RoutineSet = {
  setNumber: number;
  targetReps: number | null;
  targetWeightKg: number | null;
  targetRir: number | null;
  notes: string | null;
};

export type RoutineTargets = {
  nextAdjustment: 'maintain' | 'increase_weight' | 'increase_reps' | 'custom';
  nextAdjustmentNote: string | null;
  restMinSeconds: number | null;
  restMaxSeconds: number | null;
  notes: string | null;
  sets: RoutineSet[];
};

export type RoutineDetail = {
  routine: {
    id: string;
    name: string;
    color: MobileRoutineColorKey | null;
    /** Retained so an older editor cannot silently clear a newer color. */
    unrecognizedColor?: string;
    isActive: boolean;
    updatedAt: string;
    templateVersion: number;
  };
  items: {
    routineExerciseId: string;
    exerciseOrder: number;
    exercise: {
      id: string;
      name: string;
      muscleGroup: MobileTrainingMuscleGroup | null;
      muscleGroupLabel: string | null;
      implement: string | null;
      weightMode: string | null;
      isActive: boolean;
    };
    updatedAt: string;
    targets: RoutineTargets;
  }[];
};

export type RoutineTemplatePayload = {
  expectedTemplateVersion: number;
  items: { routineExerciseId: string | null; exerciseId: string; targets: RoutineTargets }[];
};

export type RoutineDetailLoad = { kind: 'detail'; detail: RoutineDetail } | { kind: 'not_found' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const GROUPS = new Set(['pecho', 'espalda', 'piernas', 'hombros', 'bíceps', 'tríceps', 'abdomen', 'cardio']);
const ADJUSTMENTS = new Set(['maintain', 'increase_weight', 'increase_reps', 'custom']);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableText(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function number(value: unknown, max: number, integer = false): boolean {
  return value === null || (
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max &&
    (!integer || Number.isInteger(value))
  );
}

function parseSets(value: unknown): RoutineSet[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return undefined;
  const sets: RoutineSet[] = [];
  for (const [index, raw] of value.entries()) {
    if (!record(raw) || raw.setNumber !== index + 1 ||
      !number(raw.targetReps, 1000, true) || !number(raw.targetWeightKg, 9999.99) ||
      (typeof raw.targetWeightKg === 'number' &&
        Math.abs(raw.targetWeightKg * 100 - Math.round(raw.targetWeightKg * 100)) > 1e-8) ||
      !number(raw.targetRir, 10, true) || !nullableText(raw.notes)) return undefined;
    sets.push(raw as RoutineSet);
  }
  return sets;
}

function parseTargets(value: unknown): RoutineTargets | undefined {
  if (!record(value) || !ADJUSTMENTS.has(value.nextAdjustment as string) ||
    !nullableText(value.nextAdjustmentNote) || !nullableText(value.notes) ||
    !number(value.restMinSeconds, 3600, true) || !number(value.restMaxSeconds, 3600, true) ||
    (typeof value.restMinSeconds === 'number' && typeof value.restMaxSeconds === 'number' &&
      value.restMinSeconds > value.restMaxSeconds)) return undefined;
  const sets = parseSets(value.sets);
  if (!sets) return undefined;
  return { ...value, sets } as RoutineTargets;
}

export function parseRoutineDetail(value: unknown): RoutineDetail | undefined {
  if (!record(value) || !record(value.routine) || !Array.isArray(value.items)) return undefined;
  const routine = value.routine;
  if (typeof routine.id !== 'string' || !UUID.test(routine.id) ||
    typeof routine.name !== 'string' || !routine.name.trim() ||
    parseRoutineColor(routine.color) === undefined ||
    typeof routine.isActive !== 'boolean' || typeof routine.updatedAt !== 'string' ||
    !TIMESTAMP.test(routine.updatedAt) || !Number.isSafeInteger(routine.templateVersion) ||
    (routine.templateVersion as number) < 1) return undefined;
  const items: RoutineDetail['items'] = [];
  const ids = new Set<string>();
  const relationIds = new Set<string>();
  let previousOrder = 0;
  for (const raw of value.items) {
    if (!record(raw) || !record(raw.exercise) ||
      typeof raw.routineExerciseId !== 'string' || !UUID.test(raw.routineExerciseId) ||
      relationIds.has(raw.routineExerciseId) ||
      !Number.isSafeInteger(raw.exerciseOrder) || (raw.exerciseOrder as number) <= previousOrder ||
      typeof raw.updatedAt !== 'string' ||
      !TIMESTAMP.test(raw.updatedAt)) return undefined;
    const exercise = raw.exercise;
    if (typeof exercise.id !== 'string' || !UUID.test(exercise.id) || ids.has(exercise.id) ||
      typeof exercise.name !== 'string' || !exercise.name.trim() ||
      (exercise.muscleGroup !== null && !GROUPS.has(exercise.muscleGroup as string)) ||
      !nullableText(exercise.muscleGroupLabel) || !nullableText(exercise.implement) ||
      !nullableText(exercise.weightMode) || typeof exercise.isActive !== 'boolean') return undefined;
    const targets = parseTargets(raw.targets);
    if (!targets) return undefined;
    ids.add(exercise.id);
    relationIds.add(raw.routineExerciseId);
    previousOrder = raw.exerciseOrder as number;
    items.push({ ...raw, targets } as RoutineDetail['items'][number]);
  }
  return { routine: { ...routine, color: parseRoutineColor(routine.color)!,
    ...(typeof routine.color === 'string' && !isKnownRoutineColor(routine.color) ? { unrecognizedColor: routine.color } : {}),
  } as RoutineDetail['routine'], items };
}

function parseIdentityResponse(value: unknown): { routine: RoutineDetail['routine'] } | undefined {
  const parsed = parseRoutineDetail(record(value) ? { routine: value.routine, items: [] } : undefined);
  return parsed ? { routine: parsed.routine } : undefined;
}

function path(id: string): `/${string}` {
  return `/api/mobile/v1/training/routines/${encodeURIComponent(id)}`;
}

export async function fetchRoutineDetail(
  client: MobileApiClient,
  id: string,
  signal?: AbortSignal,
): Promise<MobileApiReadResult<RoutineDetailLoad>> {
  // GET uses request so a real 404 survives; read() intentionally collapses it.
  const result = await client.request({ method: 'GET', path: path(id), parse: parseRoutineDetail, signal });
  if (result.status === 'ok') return { status: 'ok', data: { kind: 'detail', detail: result.data }, meta: result.meta };
  if (result.status === 'not_found') return { status: 'ok', data: { kind: 'not_found' }, meta: result.meta };
  if (result.status === 'auth_required' || result.status === 'unauthorized' || result.status === 'unavailable') return result;
  return { status: 'unavailable', reason: 'invalid_response', meta: result.meta };
}

export function updateRoutineIdentity(
  client: MobileApiClient,
  id: string,
  payload: { name: string; color: MobileRoutineColorKey | null; expectedUpdatedAt: string },
): Promise<MobileApiMutationResult<{ routine: RoutineDetail['routine'] }>> {
  return client.request({ method: 'PATCH', path: `${path(id)}/identity`, body: payload, parse: parseIdentityResponse });
}

export function replaceRoutineTemplate(
  client: MobileApiClient,
  id: string,
  payload: RoutineTemplatePayload,
): Promise<MobileApiMutationResult<RoutineDetail>> {
  return client.request({ method: 'PUT', path: `${path(id)}/template`, body: payload, parse: parseRoutineDetail });
}
