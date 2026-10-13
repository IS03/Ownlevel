import type { MobileTrainingExercise, MobileTrainingMuscleGroup } from '@/api/exercises';
export type RoutineExercisePickerBodyProps = {
  canCreate: boolean; query: string; onQuery: (value: string) => void; group: MobileTrainingMuscleGroup | null; onGroup: (value: MobileTrainingMuscleGroup | null) => void;
  rows: MobileTrainingExercise[]; existing: ReadonlySet<string>; selected: readonly string[]; disabled: boolean;
  onToggle: (id: string) => void; onCreate: () => void;
};
