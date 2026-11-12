import { jest } from '@jest/globals';
import type { MobileTrainingExercise } from '@/api/exercises';
import type { RoutineExercisePickerBodyProps } from './routine-exercise-picker-body.types';

/** Library-shaped exercise; `index` keeps ids unique and names stable for large lists. */
export function pickerExercise(index: number, patch: Partial<MobileTrainingExercise> = {}): MobileTrainingExercise {
  return { id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, name: `EJERCICIO ${index}`, muscleGroup: 'pecho', muscleGroupLabel: 'Pecho', implement: 'Barra', weightMode: 'Peso total',
    suggestedSets: null, suggestedReps: null, suggestedWeight: null, suggestedRir: null, suggestedRestMinSeconds: null, suggestedRestMaxSeconds: null, notes: null,
    isActive: true, routineIds: [], updatedAt: '2026-11-01T10:00:00.000Z', ...patch };
}
export function pickerExercises(count: number) { return Array.from({ length: count }, (_, index) => pickerExercise(index + 1)); }
export const LONG_NAME = 'PRESS INCLINADO CON MANCUERNAS AGARRE NEUTRO Y PAUSA EN EL PECHO AL FINAL DE CADA REPETICION SEGUN TECNICA';

/** Defaults: routine picker, ready library, nothing selected. Handlers are fresh mocks the caller can assert on. */
export function pickerProps(patch: Partial<RoutineExercisePickerBodyProps> = {}) {
  const props: RoutineExercisePickerBodyProps = { canCreate: true, query: '', onQuery: jest.fn(), group: null, onGroup: jest.fn(), rows: [], existing: new Set(), selected: [], disabled: false,
    onToggle: jest.fn(), onCreate: jest.fn(), ...patch };
  return props as RoutineExercisePickerBodyProps & { onQuery: jest.Mock; onGroup: jest.Mock; onToggle: jest.Mock; onCreate: jest.Mock };
}
