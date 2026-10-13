import type { MobileTrainingExercise } from '@/api/exercises';
import type { RoutineDetail, RoutineSet, RoutineTargets, RoutineTemplatePayload } from '@/api/routine-editor';

import { formatRest, normalizeExerciseSearch, parseRest } from './exercise-library-model';

export type SetDraft = {
  targetReps: string;
  targetWeightKg: string;
  targetRir: string;
  notes: string | null;
};

export type TargetsDraft = {
  nextAdjustment: RoutineTargets['nextAdjustment'];
  nextAdjustmentNote: string | null;
  restMin: string;
  restMax: string;
  notes: string;
  sets: SetDraft[];
};

export function draftFromTargets(targets: RoutineTargets): TargetsDraft {
  return {
    nextAdjustment: targets.nextAdjustment,
    nextAdjustmentNote: targets.nextAdjustmentNote,
    restMin: formatRest(targets.restMinSeconds),
    restMax: formatRest(targets.restMaxSeconds),
    notes: targets.notes ?? '',
    sets: targets.sets.map((set) => ({
      targetReps: set.targetReps === null ? '' : String(set.targetReps),
      targetWeightKg: set.targetWeightKg === null ? '' : String(set.targetWeightKg).replace('.', ','),
      targetRir: set.targetRir === null ? '' : String(set.targetRir),
      notes: set.notes,
    })),
  };
}

export function isTargetsDirty(draft: TargetsDraft, confirmed: RoutineTargets): boolean {
  return JSON.stringify(draft) !== JSON.stringify(draftFromTargets(confirmed));
}

export function toggleAdjustment(
  current: RoutineTargets['nextAdjustment'],
  clicked: 'increase_weight' | 'increase_reps',
): RoutineTargets['nextAdjustment'] {
  return current === clicked ? 'maintain' : clicked;
}

function parseNumber(value: string, label: string, max: number, integer: boolean): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^\d+(?:[.,]\d+)?$/.test(normalized)) throw new Error(`${label} no es válido.`);
  const parsed = Number(normalized.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max ||
    (integer && !Number.isInteger(parsed))) throw new Error(`${label} debe estar entre 0 y ${max}${integer ? ' y ser entero' : ''}.`);
  if (!integer && Math.abs(parsed * 100 - Math.round(parsed * 100)) > 1e-8) {
    throw new Error(`${label} admite hasta 2 decimales.`);
  }
  return parsed;
}

export function targetsFromDraft(draft: TargetsDraft): RoutineTargets {
  if (draft.sets.length < 1 || draft.sets.length > 50) {
    throw new Error('La cantidad de series debe estar entre 1 y 50.');
  }
  const min = parseRest(draft.restMin, 'Descanso mínimo');
  const max = parseRest(draft.restMax, 'Descanso máximo');
  if (min !== null && max !== null && min > max) {
    throw new Error('El descanso mínimo no puede superar al máximo.');
  }
  const sets: RoutineSet[] = draft.sets.map((set, index) => ({
    setNumber: index + 1,
    targetReps: parseNumber(set.targetReps, 'Repeticiones', 1000, true),
    targetWeightKg: parseNumber(set.targetWeightKg, 'Peso', 9999.99, false),
    targetRir: parseNumber(set.targetRir, 'RIR', 10, true),
    notes: set.notes,
  }));
  if (draft.notes.length > 1000) throw new Error('Las observaciones no pueden superar 1000 caracteres.');
  return {
    nextAdjustment: draft.nextAdjustment,
    nextAdjustmentNote: draft.nextAdjustmentNote,
    restMinSeconds: min,
    restMaxSeconds: max,
    notes: draft.notes === '' ? null : draft.notes,
    sets,
  };
}

export function addSet(draft: TargetsDraft): TargetsDraft {
  if (draft.sets.length >= 50) throw new Error('La rutina admite hasta 50 series por ejercicio.');
  const last = draft.sets.at(-1);
  return {
    ...draft,
    sets: [...draft.sets, {
      targetReps: last?.targetReps ?? '',
      targetWeightKg: last?.targetWeightKg ?? '',
      targetRir: last?.targetRir ?? '',
      notes: null,
    }],
  };
}

export function removeSet(draft: TargetsDraft, index: number): TargetsDraft {
  if (draft.sets.length <= 1) throw new Error('El ejercicio necesita al menos una serie.');
  return { ...draft, sets: draft.sets.filter((_, candidate) => candidate !== index) };
}

export function templatePayload(
  detail: RoutineDetail,
  replacements: ReadonlyMap<string, RoutineTargets> = new Map(),
): RoutineTemplatePayload {
  return {
    expectedTemplateVersion: detail.routine.templateVersion,
    items: detail.items.map((item) => ({
      routineExerciseId: item.routineExerciseId,
      exerciseId: item.exercise.id,
      targets: replacements.get(item.routineExerciseId) ?? item.targets,
    })),
  };
}

export function targetsFromCatalog(_exercise: MobileTrainingExercise): RoutineTargets {
  return {
    nextAdjustment: 'maintain',
    nextAdjustmentNote: null,
    restMinSeconds: null,
    restMaxSeconds: null,
    notes: null,
    sets: [{
      setNumber: 1,
      targetReps: null,
      targetWeightKg: null,
      targetRir: null,
      notes: null,
    }],
  };
}

export function pickerExercises(
  exercises: readonly MobileTrainingExercise[],
  existingIds: ReadonlySet<string>,
  query: string,
  group: string | null,
): MobileTrainingExercise[] {
  const normalized = normalizeExerciseSearch(query);
  return exercises.filter((exercise) => exercise.isActive && !existingIds.has(exercise.id) &&
    (group === null || exercise.muscleGroup === group) &&
    normalizeExerciseSearch([
      exercise.name, exercise.muscleGroup, exercise.muscleGroupLabel, exercise.implement,
    ].filter(Boolean).join(' ')).includes(normalized))
    .sort((a, b) => a.name.localeCompare(b.name, 'es-AR'));
}

export function reorderTemplate(
  payload: RoutineTemplatePayload,
  index: number,
  offset: -1 | 1,
): RoutineTemplatePayload {
  const next = [...payload.items];
  const target = index + offset;
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return payload;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return { ...payload, items: next };
}


/** Wheel choices include the saved value so opening a picker never rounds a legacy rest. */
export function restWheelValues(current: string): (number | null)[] {
  const saved = parseRest(current, 'Descanso');
  const values = Array.from({ length: 241 }, (_, index) => index * 15);
  if (saved !== null && !values.includes(saved)) values.push(saved);
  return [null, ...values.sort((a, b) => a - b)];
}
export function changeRest(draft: TargetsDraft, field: 'restMin' | 'restMax', seconds: number | null): TargetsDraft {
  const next = { ...draft, [field]: formatRest(seconds) };
  const min = parseRest(next.restMin, 'Descanso mínimo'), max = parseRest(next.restMax, 'Descanso máximo');
  if (min !== null && max !== null && min > max) {
    if (field === 'restMin') next.restMin = formatRest(max);
    else next.restMax = formatRest(min);
  }
  return next;
}
export function exerciseIdentity(exercise: RoutineDetail['items'][number]['exercise']): string {
  return [exercise.muscleGroupLabel?.trim() || (exercise.muscleGroup ? exercise.muscleGroup[0]!.toLocaleUpperCase('es-AR') + exercise.muscleGroup.slice(1) : null),
    exercise.implement, exercise.weightMode].filter(Boolean).join(' · ');
}
export function appendExercises(detail: RoutineDetail, selected: readonly MobileTrainingExercise[]): RoutineTemplatePayload {
  const payload = templatePayload(detail), existing = new Set(detail.items.map(item => item.exercise.id));
  for (const exercise of selected) {
    if (!exercise.isActive || existing.has(exercise.id)) throw new Error('La selección cambió. Revisá los ejercicios antes de agregarlos.');
    existing.add(exercise.id);
    payload.items.push({ routineExerciseId: null, exerciseId: exercise.id, targets: targetsFromCatalog(exercise) });
  }
  return payload;
}
export function validateTargetsDraft(draft: TargetsDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const check = (key: string, parse: () => unknown) => { try { parse(); } catch (cause) { errors[key] = cause instanceof Error ? cause.message : 'Revisá este valor.'; } };
  draft.sets.forEach((set, index) => {
    check(`sets.${index}.targetReps`, () => parseNumber(set.targetReps, 'Repeticiones', 1000, true));
    check(`sets.${index}.targetWeightKg`, () => parseNumber(set.targetWeightKg, 'Peso', 9999.99, false));
    check(`sets.${index}.targetRir`, () => parseNumber(set.targetRir, 'RIR', 10, true));
  });
  check('rest', () => { const min = parseRest(draft.restMin, 'Descanso mínimo'), max = parseRest(draft.restMax, 'Descanso máximo');
    if (min !== null && max !== null && min > max) throw new Error('El descanso mínimo no puede superar al máximo.'); });
  if (draft.notes.length > 1000) errors.notes = 'Las notas admiten hasta 1000 caracteres.';
  return errors;
}

export function restWheelChoices(draft: TargetsDraft, field: 'restMin' | 'restMax'): (number | null)[] {
  const bound = parseRest(draft[field === 'restMin' ? 'restMax' : 'restMin'], 'Descanso');
  return restWheelValues(draft[field]).filter(value => value === null || bound === null || (field === 'restMin' ? value <= bound : value >= bound));
}
