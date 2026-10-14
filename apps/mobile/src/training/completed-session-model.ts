import type { SessionDetailDto, SessionFinishedDto, SessionFinishMetadata, SessionSetDto } from '@/api/active-session';
import { durationLabel } from './active-session-model';
import { exerciseSetLabel } from './exercise-detail-model';
import type { MobileRoutineColorKey } from '@/api/home';

// Read-only projection of a closed session. Derived only from server truth;
// it never reads local drafts or the active-session controller.
export type CompletedMetadataItem = { key: keyof SessionFinishMetadata; label: string; value: string };
export type CompletedSessionModel = {
  name: string;
  color: MobileRoutineColorKey | null;
  startedAt: string;
  endedAt: string | null;
  /** Sum of weight × reps over completed sets of kg exercises; null when none has both (missing ≠ 0). */
  volumeKg: number | null;
  status: 'completed' | 'discarded';
  logDate: string;
  duration: string | null;
  exerciseCount: number;
  completedExerciseCount: number;
  completedSetCount: number;
  metadata: CompletedMetadataItem[];
  /** Done exercises first; the ones with no completed set go last (shown in grey). */
  exercises: { id: string; exerciseId: string; name: string; identity: string; done: boolean; sets: { setNumber: number; label: string; completed: boolean }[] }[];
};

export function sessionDuration(startedAt: string, endedAt: string | null): string | null {
  if (!endedAt) return null;
  const milliseconds = Date.parse(endedAt) - Date.parse(startedAt);
  return Number.isFinite(milliseconds) && milliseconds >= 0 ? durationLabel(milliseconds) : null;
}
/** Only answered fields are shown: missing stays absent, a recorded 0 pain is shown. */
export function metadataItems(metadata: SessionFinishMetadata): CompletedMetadataItem[] {
  const items: CompletedMetadataItem[] = [];
  if (metadata.energyLevel !== null) items.push({ key: 'energyLevel', label: 'Energía', value: `${metadata.energyLevel}/5` });
  if (metadata.performanceLevel !== null) items.push({ key: 'performanceLevel', label: 'Rendimiento', value: `${metadata.performanceLevel}/5` });
  if (metadata.painLevel !== null) items.push({ key: 'painLevel', label: 'Dolor', value: `${metadata.painLevel}/10` });
  if (metadata.notes) items.push({ key: 'notes', label: 'Notas', value: metadata.notes });
  return items;
}
const KG_MODES = new Set(['Peso total', 'Por mancuerna', 'Por brazo', 'Total con barra']);
function setLabel(set: SessionSetDto, mode: string | null) { return exerciseSetLabel(set, mode ?? 'Peso total'); }
export function completedSessionModel(detail: SessionDetailDto): CompletedSessionModel {
  const { session } = detail;
  const exercises = detail.exercises.map(exercise => ({
    id: exercise.id, exerciseId: exercise.exerciseId, name: exercise.nameSnapshot,
    identity: [exercise.muscleGroupLabelSnapshot, exercise.implementSnapshot, exercise.weightModeSnapshot].filter(Boolean).join(' · '),
    done: exercise.payload.sets.some(set => set.isCompleted),
    sets: exercise.payload.sets.map(set => ({ setNumber: set.setNumber, label: setLabel(set, exercise.weightModeSnapshot), completed: set.isCompleted })),
  })).sort((left, right) => Number(right.done) - Number(left.done));
  const weighted = detail.exercises.filter(exercise => KG_MODES.has(exercise.weightModeSnapshot ?? 'Peso total'))
    .flatMap(exercise => exercise.payload.sets.filter(set => set.isCompleted && set.actualWeightKg !== null && set.actualReps !== null));
  const volumeKg = weighted.length ? weighted.reduce((total, set) => total + set.actualWeightKg! * set.actualReps!, 0) : null;
  return {
    name: session.name, color: session.routineColor, startedAt: session.startedAt, endedAt: session.endedAt, volumeKg, status: session.status === 'discarded' ? 'discarded' : 'completed', logDate: session.logDate,
    duration: sessionDuration(session.startedAt, session.endedAt), exerciseCount: exercises.length,
    completedExerciseCount: exercises.filter(exercise => exercise.sets.some(set => set.completed)).length,
    completedSetCount: exercises.reduce((total, exercise) => total + exercise.sets.filter(set => set.completed).length, 0),
    metadata: metadataItems({ energyLevel: session.metadata.energyLevel, performanceLevel: session.metadata.performanceLevel,
      painLevel: session.metadata.painLevel, notes: session.metadata.notes }),
    exercises,
  };
}
/** Post-workout base: exactly the finish response's server truth. */
export function postWorkoutSummary(finished: SessionFinishedDto) {
  return {
    name: finished.name, duration: sessionDuration(finished.startedAt, finished.endedAt),
    line: [plural(finished.completedSetCount, 'serie completada', 'series completadas'),
      plural(finished.completedExerciseCount, 'ejercicio', 'ejercicios')].join(' · '),
    metadata: metadataItems(finished.metadata),
  };
}
function plural(value: number, singular: string, pluralForm: string) { return `${value} ${value === 1 ? singular : pluralForm}`; }
