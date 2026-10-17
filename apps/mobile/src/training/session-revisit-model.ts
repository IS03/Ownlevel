import type { SessionDetailDto } from '@/api/active-session';
import { loadCompared, type SessionSummaryDto } from '@/api/session-summary';
import { isKgWeightMode } from '@/api/session-highlights';
import { volumeLabel } from './history-model';
import { completedSessionModel } from './completed-session-model';
import { exerciseSetLabel } from './exercise-detail-model';
import { MUSCLE_GROUP_OPTIONS } from './exercise-library-model';

// SF1 · a closed session seen again. Server truth only: the detail for what was done and the summary for how it went
// against the last time. Without the summary nothing is compared (never "↗" or "=" by guess).
export type RevisitFeeling = { key: 'energyLevel' | 'performanceLevel' | 'painLevel'; label: string; value: number; scale: 5 | 10 };
export type RevisitStatus = { kind: 'record' | 'improved' | 'declined' | 'same' | 'first'; label: string };
export type RevisitSet = { setNumber: number; label: string; completed: boolean; before: string | null; record: boolean };
export type RevisitExercise = {
  id: string; exerciseId: string; name: string; identity: string; done: boolean; line: string; note: string | null;
  status: RevisitStatus | null; sets: RevisitSet[];
};
export type RevisitModel = {
  sentence: string; achievement: string | null; line: string; note: string | null;
  feelings: RevisitFeeling[]; muscles: { label: string; sets: number }[]; exercises: RevisitExercise[];
};

const number = (value: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value);
const plural = (value: number, one: string, many: string) => `${number(value)} ${value === 1 ? one : many}`;
function unitOf(mode: string | null) {
  return mode === 'Peso corporal' ? 'reps' : mode === 'Lingotes (no kg)' ? 'placas' : mode === 'Tiempo (segundos)' ? 's' : isKgWeightMode(mode ?? 'Peso total') ? 'kg' : null;
}
function compact(weight: number | null, reps: number | null, mode: string | null) {
  if (mode === 'Peso corporal') return reps === null ? null : number(reps);
  return weight !== null && reps !== null ? `${number(weight)}×${number(reps)}` : weight !== null ? number(weight) : reps !== null ? number(reps) : null;
}
/** "90×10 · 90×9 · 90×8 kg": the completed sets in a line, the unit once at the end. */
export function setsLine(sets: { actualWeightKg: number | null; actualReps: number | null; isCompleted: boolean }[], mode: string | null) {
  const parts = sets.filter(set => set.isCompleted).map(set => compact(set.actualWeightKg, set.actualReps, mode)).filter((part): part is string => part !== null);
  if (!parts.length) return 'no hecha';
  const unit = unitOf(mode);
  return `${parts.join(' · ')}${unit ? ` ${unit}` : ''}`;
}
function statusOf(row: SessionSummaryDto['exercises'][number] | undefined, record: { weightKg: number; mode: string } | undefined, mode: string | null): RevisitStatus | null {
  if (record) return { kind: 'record', label: `récord ${number(record.weightKg)} ${isKgWeightMode(record.mode) ? 'kg' : 'placas'}` };
  if (!row) return null;
  if (row.status === 'first') return { kind: 'first', label: 'primera vez' };
  if (row.status === 'same') return { kind: 'same', label: '=' };
  if (!row.change || (row.status !== 'improved' && row.status !== 'declined')) return null;
  const amount = Math.abs(row.change.amount), arrow = row.status === 'improved' ? '↗' : '↘';
  const load = mode === 'Lingotes (no kg)' ? 'placas' : 'kg';
  // volume: the best set tied and the rest of the work decided (load × reps, or total reps when the mode compares reps).
  const label = row.change.kind === 'reps' ? plural(amount, 'rep', 'reps') : row.change.kind === 'weight' ? `${number(amount)} ${load}`
    : `${loadCompared(mode) ? `${number(amount)} ${load}` : plural(amount, 'rep', 'reps')} en total`;
  return { kind: row.status, label: `${arrow} ${label}` };
}

export function revisitModel(detail: SessionDetailDto, summary?: SessionSummaryDto): RevisitModel {
  const base = completedSessionModel(detail);
  const data = summary?.sessionId === detail.session.id ? summary : undefined;
  const rows = new Map(data?.exercises.map(row => [row.sessionExerciseId, row]));
  const records = new Map(data?.highlights.filter(item => item.kind === 'record').map(item => [item.exerciseId, item]));
  // One record per exercise: it goes to the first session exercise whose sets hold the mark.
  const recordOwner = new Map<string, string>();
  for (const [exerciseId, item] of records) {
    const owner = detail.exercises.find(exercise => exercise.exerciseId === exerciseId && exercise.payload.sets.some(set => set.isCompleted
      && set.actualWeightKg === item.mark.weightKg && set.actualReps === item.mark.reps)) ?? detail.exercises.find(exercise => exercise.exerciseId === exerciseId);
    if (owner) recordOwner.set(owner.id, exerciseId);
  }
  const exercises = detail.exercises.map(exercise => {
    const row = rows.get(exercise.id), recordId = recordOwner.get(exercise.id), record = recordId ? records.get(recordId) : undefined;
    const mode = exercise.weightModeSnapshot, before = row?.previous && row.status !== 'not_comparable' ? row.previous.sets : [];
    let marked = false;
    const sets = exercise.payload.sets.map((set, index) => {
      const previous = before[index], shown = previous ? compact(previous.weightKg, previous.reps, mode) : null;
      const isRecord = !marked && !!record && set.isCompleted && set.actualWeightKg === record.mark.weightKg && set.actualReps === record.mark.reps;
      if (isRecord) marked = true;
      return { setNumber: set.setNumber, label: exerciseSetLabel(set, mode ?? 'Peso total'), completed: set.isCompleted, before: shown, record: isRecord };
    });
    return {
      id: exercise.id, exerciseId: exercise.exerciseId, name: exercise.nameSnapshot,
      identity: [exercise.muscleGroupLabelSnapshot, exercise.implementSnapshot, mode].filter(Boolean).join(' · '),
      done: exercise.payload.sets.some(set => set.isCompleted), line: setsLine(exercise.payload.sets, mode),
      note: exercise.payload.notes.trim() || null,
      status: statusOf(row, record ? { weightKg: record.mark.weightKg, mode: record.weightMode } : undefined, mode), sets,
    };
  }).sort((left, right) => Number(right.done) - Number(left.done));

  const recordCount = exercises.filter(exercise => exercise.status?.kind === 'record').length;
  const improvedCount = exercises.filter(exercise => exercise.status?.kind === 'improved').length;
  const achievement = [recordCount ? plural(recordCount, 'récord', 'récords') : null,
    improvedCount ? `${plural(improvedCount, 'ejercicio', 'ejercicios')} mejor que la última vez` : null].filter(Boolean).join(' y ');
  const sets = plural(base.completedSetCount, 'serie', 'series');
  const volume = volumeLabel(base.volumeKg);
  const groups = new Map<string, number>();
  for (const exercise of detail.exercises) {
    const done = exercise.payload.sets.filter(set => set.isCompleted).length;
    if (done) { const label = exercise.muscleGroupLabelSnapshot ?? MUSCLE_GROUP_OPTIONS.find(option => option.value === exercise.muscleGroupSnapshot)?.label ?? 'Otros'; groups.set(label, (groups.get(label) ?? 0) + done); }
  }
  const metadata = detail.session.metadata;
  const feelings: RevisitFeeling[] = [];
  if (metadata.energyLevel !== null) feelings.push({ key: 'energyLevel', label: 'Energía', value: metadata.energyLevel, scale: 5 });
  if (metadata.performanceLevel !== null) feelings.push({ key: 'performanceLevel', label: 'Rendimiento', value: metadata.performanceLevel, scale: 5 });
  if (metadata.painLevel !== null) feelings.push({ key: 'painLevel', label: 'Dolor', value: metadata.painLevel, scale: 10 });
  return {
    sentence: base.duration ? `${sets} en ${base.duration}.` : `${sets}.`,
    achievement: achievement ? `${achievement}.` : null,
    line: [volume ? `${volume} movidos` : null, `${base.completedExerciseCount} de ${base.exerciseCount} ejercicios`].filter(Boolean).join(' · '),
    note: metadata.notes?.trim() || null,
    feelings,
    muscles: [...groups].map(([label, count]) => ({ label, sets: count })).sort((left, right) => right.sets - left.sets),
    exercises,
  };
}
