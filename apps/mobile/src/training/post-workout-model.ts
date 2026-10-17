import type { SessionDetailDto, SessionFinishedDto } from '@/api/active-session';
import { loadCompared, type SessionSummaryDto } from '@/api/session-summary';
import { compactWeekdayDate, volumeLabel } from './history-model';
import { sessionDuration } from './completed-session-model';
import { exerciseSetLabel } from './exercise-detail-model';
import { sessionFeelings, type RevisitFeeling } from './session-revisit-model';

// SF2/SF3 · just finished. The base is the finish receipt (server truth); the summary read adds records and what improved.
// Nothing is promised before it arrives and nothing is invented when it does not: no record and no improvement → no block.
export type PostWorkoutHero =
  | { kind: 'record'; title: string; name: string; mark: string; before: string; more: string | null }
  | { kind: 'improved'; title: string; count: string; names: string; rest: string | null };
export type PostWorkoutRow = { id: string; kind: 'improvement' | 'added'; title: string; detail: string };
export type PostWorkoutModel = {
  title: string; line: string; hero: PostWorkoutHero | null; rows: PostWorkoutRow[]; feelings: RevisitFeeling[]; note: string | null;
};

const MAX_ROWS = 3;
const number = (value: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value);
const plural = (value: number, one: string, many: string) => `${number(value)} ${value === 1 ? one : many}`;
/** "A", "A y B", "A, B y C", "A, B y 2 más". */
function list(names: string[]) {
  const shown = names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} más`] : names;
  return shown.length < 2 ? shown.join('') : `${shown.slice(0, -1).join(', ')} y ${shown[shown.length - 1]}`;
}
type Exercise = SessionDetailDto['exercises'][number];
/** The best completed set, the same rule as the comparison: load then reps, or reps when the mode compares reps. */
function bestSet(exercise: Exercise) {
  const byLoad = loadCompared(exercise.weightModeSnapshot);
  const done = exercise.payload.sets.filter(set => set.isCompleted && set.actualReps !== null && set.actualReps > 0 && (!byLoad || set.actualWeightKg !== null));
  if (!done.length) return null;
  const better = (a: (typeof done)[number], b: (typeof done)[number]) => byLoad && a.actualWeightKg !== b.actualWeightKg ? a.actualWeightKg! > b.actualWeightKg! : a.actualReps! > b.actualReps!;
  const best = done.reduce((left, right) => better(right, left) ? right : left);
  return exerciseSetLabel(best, exercise.weightModeSnapshot ?? 'Peso total');
}
function changeText(change: NonNullable<SessionSummaryDto['exercises'][number]['change']>, mode: string | null) {
  const unit = mode === 'Lingotes (no kg)' ? 'placas' : 'kg';
  if (change.kind === 'weight') return `+${number(change.amount)} ${unit} que la última vez`;
  if (change.kind === 'reps') return `${plural(change.amount, 'rep', 'reps')} más que la última vez`;
  return loadCompared(mode) ? `+${number(change.amount)} ${unit} en total` : `${plural(change.amount, 'rep', 'reps')} más en total`;
}

export function postWorkoutModel(finished: SessionFinishedDto, summary?: SessionSummaryDto, detail?: SessionDetailDto): PostWorkoutModel {
  const data = summary?.sessionId === finished.sessionId ? summary : undefined;
  const exercises = detail?.session.id === finished.sessionId ? detail.exercises : [];
  const volume = volumeLabel(data?.volumeKg ?? null);
  const line = [compactWeekdayDate(finished.logDate), sessionDuration(finished.startedAt, finished.endedAt),
    plural(finished.completedSetCount, 'serie', 'series'), volume].filter(Boolean).join(' · ');

  const records = data?.highlights.filter(item => item.kind === 'record') ?? [];
  const recordIds = new Set(records.map(item => item.exerciseId));
  const markOf = (item: (typeof records)[number]) => exerciseSetLabel({ actualWeightKg: item.mark.weightKg, actualReps: item.mark.reps }, item.weightMode);
  const improved = (data?.exercises ?? []).filter(row => row.status === 'improved' && row.change && !recordIds.has(row.exerciseId)).flatMap(row => {
    const exercise = exercises.find(item => item.id === row.sessionExerciseId);
    const name = exercise?.nameSnapshot ?? data?.highlights.find(item => item.exerciseId === row.exerciseId)?.name;
    if (!name) return [];
    const mark = exercise ? bestSet(exercise) : null, mode = exercise?.weightModeSnapshot ?? null;
    return [{ id: `improvement-${row.sessionExerciseId}`, kind: 'improvement' as const, title: name, detail: [mark, changeText(row.change!, mode)].filter(Boolean).join(' · ') }];
  });

  let hero: PostWorkoutHero | null = null;
  if (records.length) {
    const [first, ...others] = records;
    hero = { kind: 'record', title: records.length === 1 ? '¡Récord hoy!' : `¡${records.length} récords hoy!`, name: first.name, mark: markOf(first),
      before: `Antes: ${exerciseSetLabel({ actualWeightKg: first.previous.weightKg, actualReps: first.previous.reps }, first.weightMode)}.`,
      more: others.length === 1 ? `Y ${others[0].name} ${markOf(others[0])}.` : others.length ? `Y ${others.length} más: ${list(others.map(item => item.name))}.` : null };
  } else if (improved.length) {
    const compared = (data?.exercises ?? []).filter(row => row.status === 'improved' || row.status === 'same' || row.status === 'declined');
    const restSame = compared.length > improved.length && compared.every(row => row.status !== 'declined');
    hero = { kind: 'improved', title: `Mejor que la última ${finished.routineId ? finished.name : 'vez'}`,
      count: improved.length === 1 ? '1 ejercicio subió' : `${improved.length} ejercicios subieron`, names: list(improved.map(row => row.title)),
      rest: restSame ? 'Los demás quedaron igual que la última vez.' : null };
  }
  const added = (finished.routineAdditions ?? []).filter(item => item.outcome === 'added').map(item => ({
    id: `added-${item.sessionExerciseId}`, kind: 'added' as const, title: `${item.name} se sumó a ${finished.name}`, detail: 'Va a estar en tu próxima sesión' }));
  return {
    title: finished.routineId ? `${finished.name} guardado` : 'Entrenamiento guardado', line, hero,
    rows: [...improved, ...added].slice(0, MAX_ROWS), feelings: sessionFeelings(finished.metadata), note: finished.metadata.notes?.trim() || null,
  };
}
