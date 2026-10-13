import { fetchSessionDetail, type SessionSetDto } from '@/api/active-session';
import { fetchTrainingExerciseHistory, type TrainingExerciseHistorySession } from '@/api/training-history';
import type { MobileApiClient } from '@/api/client';
import type { MobileApiReadResult } from '@/api/results';
import { exerciseUnavailable } from './use-exercise-library';
export type LastExerciseRead = { latest: TrainingExerciseHistorySession | null; sets: SessionSetDto[]; weightMode: string | null };
export async function fetchLastExercise(client: MobileApiClient, exerciseId: string, signal?: AbortSignal): Promise<MobileApiReadResult<LastExerciseRead>> {
  const history = await fetchTrainingExerciseHistory(client, exerciseId, 1, signal);
  if (history.status !== 'ok') return history;
  if (!history.data.latest) return { ...history, data: { latest: null, sets: [], weightMode: null } };
  const session = await fetchSessionDetail(client, history.data.latest.sessionId, signal);
  if (session.status !== 'ok') return { ...exerciseUnavailable, meta: session.meta };
  const exercise = session.data.exercises.find(item => item.exerciseId === exerciseId);
  if (!exercise || session.data.session.status !== 'completed') return { ...exerciseUnavailable, meta: session.meta };
  return { ...history, data: { latest: history.data.latest, sets: exercise.payload.sets.filter(set => set.isCompleted), weightMode: exercise.weightModeSnapshot } };
}
export function exerciseSetLabel(set: Pick<SessionSetDto, 'actualWeightKg' | 'actualReps'>, mode: string | null): string {
  const number = (value: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value);
  const reps = set.actualReps === null ? null : `${number(set.actualReps)} reps`;
  if (mode === 'Peso corporal') return reps ?? '—';
  const unit = mode === 'Lingotes (no kg)' ? 'placas' : mode === 'Tiempo (segundos)' ? 's' : ['Peso total', 'Por mancuerna', 'Por brazo', 'Total con barra'].includes(mode ?? '') ? 'kg' : null;
  const weight = set.actualWeightKg === null ? null : `${number(set.actualWeightKg)}${unit ? ` ${unit}` : ''}`;
  return weight && set.actualReps !== null ? `${weight} × ${number(set.actualReps)}` : weight ?? reps ?? '—';
}
