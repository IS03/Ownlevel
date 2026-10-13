import { describe, expect, it } from '@jest/globals';

import type { MobileTrainingExercise } from '@/api/exercises';

import {
  DEFAULT_EXERCISE_LIBRARY_FILTERS,
  exerciseFormFromDto,
  exerciseMutationFromForm,
  exerciseIdentityMutation,
  filterExercises,
  groupExercises,
  normalizeExerciseSearch,
  sortExercises,
  type ExerciseLibraryFilters,
} from './exercise-library-model';

function item(overrides: Partial<MobileTrainingExercise> = {}): MobileTrainingExercise {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Press inclinado',
    muscleGroup: 'pecho',
    muscleGroupLabel: 'Pectoral mayor',
    implement: 'Máquina',
    weightMode: 'Peso total',
    suggestedSets: 3,
    suggestedReps: 10,
    suggestedWeight: 60,
    suggestedRir: 2,
    suggestedRestMinSeconds: 90,
    suggestedRestMaxSeconds: 120,
    notes: null,
    isActive: true,
    routineIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    updatedAt: '2026-09-28T12:00:00.000Z',
    ...overrides,
  };
}

describe('exercise library model', () => {
  it('normalizes case and diacritics', () => {
    expect(normalizeExerciseSearch('  BÍCEPS   Máquina ')).toBe('biceps maquina');
  });

  it.each([
    ['name', 'PRESS'],
    ['muscle group', 'pecho'],
    ['muscle label', 'pectoral'],
    ['implement', 'maquina'],
    ['weight mode', 'PESO TOTAL'],
  ])('searches by %s', (_field, query) => {
    expect(filterExercises([item()], query, DEFAULT_EXERCISE_LIBRARY_FILTERS)).toHaveLength(1);
  });

  it('groups all domain groups plus unclassified in domain order', () => {
    const exercises = [
      item({ name: 'Pecho', muscleGroup: 'pecho' }),
      item({ id: '22222222-2222-4222-8222-222222222222', name: 'Espalda', muscleGroup: 'espalda' }),
      item({ id: '33333333-3333-4333-8333-333333333333', name: 'Piernas', muscleGroup: 'piernas' }),
      item({ id: '44444444-4444-4444-8444-444444444444', name: 'Hombros', muscleGroup: 'hombros' }),
      item({ id: '55555555-5555-4555-8555-555555555555', name: 'Bíceps', muscleGroup: 'bíceps' }),
      item({ id: '66666666-6666-4666-8666-666666666666', name: 'Tríceps', muscleGroup: 'tríceps' }),
      item({ id: '77777777-7777-4777-8777-777777777777', name: 'Abdomen', muscleGroup: 'abdomen' }),
      item({ id: '88888888-8888-4888-8888-888888888888', name: 'Cardio', muscleGroup: 'cardio' }),
      item({ id: '99999999-9999-4999-8999-999999999999', name: 'Libre', muscleGroup: null }),
    ];
    const groups = groupExercises(exercises);
    expect(groups.map((group) => group.value)).toEqual([
      'pecho', 'espalda', 'piernas', 'hombros', 'bíceps', 'tríceps', 'abdomen', 'cardio', 'none',
    ]);
    expect(groups.every((group) => group.exercises.length === 1)).toBe(true);
  });

  it('sorts flat search results alphabetically', () => {
    expect(sortExercises([item({ name: 'Remo' }), item({ name: 'Aperturas' })]).map((exercise) => exercise.name))
      .toEqual(['Aperturas', 'Remo']);
  });

  it('applies OR within categories and AND between categories', () => {
    const push = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const pull = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const exercises = [
      item({ name: 'Press', routineIds: [push], muscleGroup: 'pecho', implement: 'Máquina' }),
      item({ id: '22222222-2222-4222-8222-222222222222', name: 'Remo', routineIds: [pull], muscleGroup: 'espalda', implement: 'Polea' }),
      item({ id: '33333333-3333-4333-8333-333333333333', name: 'Libre', routineIds: [], muscleGroup: null, implement: 'Banda' }),
      item({ id: '44444444-4444-4444-8444-444444444444', name: 'Archivado', isActive: false, routineIds: [] }),
    ];
    const filters: ExerciseLibraryFilters = {
      usage: 'assigned',
      routineIds: [push, pull],
      muscleGroups: ['pecho', 'espalda'],
      implements: ['Máquina', 'Polea'],
      status: 'active',
    };
    expect(filterExercises(exercises, '', filters).map((exercise) => exercise.name)).toEqual(['Press', 'Remo']);
    expect(filterExercises(exercises, '', { ...filters, usage: 'unassigned', routineIds: [], muscleGroups: ['none'], implements: [] })
      .map((exercise) => exercise.name)).toEqual(['Libre']);
    expect(filterExercises(exercises, '', { ...DEFAULT_EXERCISE_LIBRARY_FILTERS, status: 'archived' })
      .map((exercise) => exercise.name)).toEqual(['Archivado']);
    expect(filterExercises(exercises, '', { ...DEFAULT_EXERCISE_LIBRARY_FILTERS, status: 'all' })).toHaveLength(4);
  });

  it('prepopulates unknown values and creates a valid mutation', () => {
    const form = exerciseFormFromDto(item({ implement: 'Implemento propio', weightMode: 'Modo propio' }));
    expect(form).toMatchObject({
      implement: 'Implemento propio',
      weightMode: 'Modo propio',
      suggestedRestMin: '1:30',
      suggestedRestMax: '2:00',
    });
    expect(exerciseMutationFromForm(form)).toMatchObject({
      implement: 'Implemento propio',
      weightMode: 'Modo propio',
      suggestedRestMinSeconds: 90,
      suggestedRestMaxSeconds: 120,
    });
  });

  it('validates integer ranges, weight, paired rest and notes', () => {
    const base = exerciseFormFromDto(item());
    expect(() => exerciseMutationFromForm({ ...base, suggestedSets: '101' })).toThrow(/Series/);
    expect(() => exerciseMutationFromForm({ ...base, suggestedReps: '1.5' })).toThrow(/entero/);
    expect(() => exerciseMutationFromForm({ ...base, suggestedRir: '11' })).toThrow(/RIR/);
    expect(() => exerciseMutationFromForm({ ...base, suggestedWeight: '10000' })).toThrow(/Peso/);
    expect(() => exerciseMutationFromForm({ ...base, suggestedRestMax: '' })).toThrow(/ambos descansos/);
    expect(() => exerciseMutationFromForm({ ...base, suggestedRestMin: '3:00', suggestedRestMax: '2:00' }))
      .toThrow(/mínimo/);
    expect(() => exerciseMutationFromForm({ ...base, notes: 'x'.repeat(1001) })).toThrow(/Notas/);
  });
});

it('creates only identity with null defaults and preserves Web defaults when editing', () => {
  const original = item({ suggestedWeight: 0, suggestedSets: 5 });
  const values = exerciseFormFromDto(original);
  expect(exerciseIdentityMutation(values)).toMatchObject({ suggestedSets: null, suggestedWeight: null, suggestedReps: null, suggestedRir: null, suggestedRestMinSeconds: null, suggestedRestMaxSeconds: null });
  expect(exerciseIdentityMutation({ ...values, name: 'Otro' }, original)).toMatchObject({ name: 'Otro', suggestedWeight: 0, suggestedSets: 5, suggestedReps: original.suggestedReps, suggestedRestMinSeconds: 90, suggestedRestMaxSeconds: 120 });
});
