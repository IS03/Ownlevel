import type { SessionDetailDto, SessionSetDto } from '@/api/active-session';
import { setOrdinal, type SessionExerciseDraft } from './active-session-model';
import { exerciseSetLabel } from './exercise-detail-model';

/**
 * #645: what the Live Activity shows of the workout: the sets done over the total (the session screen's own count, warmups
 * included) and the next set to do. Only what is known: a set with no planned or typed load reads without it, never «0».
 */
export type SessionLiveProgress = {
  completedSets: number;
  totalSets: number;
  /** `setId`: the draft row's local id, only from the mounted session (a lock-screen action must hit that very row). */
  next: { exerciseId: string; setId: string | null; exerciseName: string; set: string; load: string | null } | null;
};
type Exercise = { id: string; name: string; weightMode: string | null; sets: (Pick<SessionSetDto, 'isCompleted' | 'targetReps' | 'targetWeightKg' | 'actualReps' | 'actualWeightKg' | 'setKind'> & { localId?: string })[] };

const typed = (value: string) => {
  const text = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
};
/** A draft's rows, with what was typed (or nothing) as numbers. */
export function draftSets(draft: SessionExerciseDraft): Exercise['sets'] {
  return draft.sets.map(set => ({ ...set, actualReps: typed(set.actualReps), actualWeightKg: typed(set.actualWeightKg) }));
}

export function liveProgress(exercises: readonly Exercise[]): SessionLiveProgress | null {
  if (!exercises.length) return null;
  let completedSets = 0, totalSets = 0, next: SessionLiveProgress['next'] = null;
  for (const exercise of exercises) {
    totalSets += exercise.sets.length;
    completedSets += exercise.sets.filter(set => set.isCompleted).length;
    const index = exercise.sets.findIndex(set => !set.isCompleted);
    if (next || index < 0) continue;
    const row = exercise.sets[index]!, ordinal = setOrdinal(exercise.sets, index);
    // What the user typed for that set wins over the plan; the plan fills what was not typed.
    const reps = row.actualReps ?? row.targetReps, weight = row.actualWeightKg ?? row.targetWeightKg;
    const load = reps === null && weight === null ? null : exerciseSetLabel({ actualReps: reps, actualWeightKg: weight }, exercise.weightMode);
    next = { exerciseId: exercise.id, setId: row.localId ?? null, exerciseName: exercise.name, set: ordinal.warmup ? 'Calentamiento' : `Serie ${ordinal.number} de ${ordinal.total}`, load: load === '—' ? null : load };
  }
  return { completedSets, totalSets, next };
}

/** From a confirmed detail, with this device's unsent drafts on top (keyed by session exercise id). */
export function detailProgress(detail: SessionDetailDto, drafts: ReadonlyMap<string, SessionExerciseDraft> = new Map()): SessionLiveProgress | null {
  return liveProgress([...detail.exercises].sort((a, b) => a.order - b.order).map(exercise => {
    const draft = drafts.get(exercise.id);
    return { id: exercise.id, name: exercise.nameSnapshot, weightMode: exercise.weightModeSnapshot, sets: draft ? draftSets(draft) : exercise.payload.sets };
  }));
}
