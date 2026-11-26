import type { MobileTrainingMuscleGroup } from '@/api/exercises';
import type { TrainingHistoryExercise } from '@/api/training-history';
import { MUSCLE_GROUP_OPTIONS } from '@/training/exercise-library-model';

/**
 * #639 · The last date each muscle group had sets, from the recorded exercises (their own last date). Only groups that
 * have recorded exercises; one with exercises but no finished sets says so (null), never a made-up date. The longest
 * ago comes first: it is what one looks for.
 */
export type MuscleRecency = { group: MobileTrainingMuscleGroup; label: string; lastDate: string | null; exercises: number };
export function muscleRecency(exercises: readonly TrainingHistoryExercise[]): MuscleRecency[] {
  return MUSCLE_GROUP_OPTIONS.flatMap(option => {
    const mine = exercises.filter(exercise => exercise.muscleGroup === option.value);
    if (!mine.length) return [];
    const lastDate = mine.map(exercise => exercise.lastDate).filter((date): date is string => !!date).sort().at(-1) ?? null;
    return [{ group: option.value, label: option.label, lastDate, exercises: mine.length }];
  }).sort((a, b) => a.lastDate === b.lastDate ? 0 : a.lastDate === null ? 1 : b.lastDate === null ? -1 : a.lastDate.localeCompare(b.lastDate));
}
export function daysSince(date: string, today: string) {
  return Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86_400_000);
}
export function recencyLabel(date: string | null, today: string) {
  if (!date) return 'Sin series todavía';
  const days = daysSince(date, today);
  return days <= 0 ? 'Hoy' : days === 1 ? 'Ayer' : `Hace ${days} días`;
}
