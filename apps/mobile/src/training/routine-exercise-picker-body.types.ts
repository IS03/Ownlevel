import type { MobileTrainingExercise, MobileTrainingMuscleGroup } from '@/api/exercises';
export type RoutineExercisePickerBodyProps = {
  session?: boolean;
  canCreate: boolean; query: string; onQuery: (value: string) => void; group: MobileTrainingMuscleGroup | null; onGroup: (value: MobileTrainingMuscleGroup | null) => void;
  rows: MobileTrainingExercise[]; existing: ReadonlySet<string>; selected: readonly string[]; disabled: boolean;
  onToggle: (id: string) => void; onCreate: () => void;
  /** Session only: the row being added (spinner) or just confirmed (✓). */
  adding?: { id: string; done: boolean } | null;
};
