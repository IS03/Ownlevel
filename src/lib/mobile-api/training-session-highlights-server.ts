import 'server-only';
import { getWorkoutSessionDetail, listCompleteRobustExerciseHistory, type RobustExerciseHistoryItem } from '../phase2/training-robust';
import { buildExercisePerformance, type ExerciseReportSession } from '../phase2/exercise-insights';
import type { WorkoutSet } from '../phase2/types';
import type { RequestPerformanceContext } from '../request-performance';
import { MobileApiNotFoundError } from './auth';
import type { MobileSupabaseAuthenticatedContext } from './supabase';
import { parseMobileTrainingId } from './training';
import { HIGHLIGHT_WEIGHT_MODES, isKgWeightMode, parseSessionHighlights, type SessionHighlight, type SessionHighlightMark, type SessionHighlightsDto } from './training-session-highlights';
import { loadCompared, parseSessionSummary, type SessionExerciseComparison, type SessionSummaryDto } from './training-session-summary';

function bestMark(sets: WorkoutSet[]): SessionHighlightMark | null {
  const report: ExerciseReportSession = { sessionId: 'current', logDate: '', completedAt: null, routineId: null, routineName: '', decision: 'maintain', sets };
  const best = buildExercisePerformance([report]).bestWeight;
  return best && best.weightKg !== null && best.reps !== null ? { weightKg: best.weightKg, reps: best.reps } : null;
}
const better = (mark: SessionHighlightMark, previous: SessionHighlightMark) => mark.weightKg > previous.weightKg || mark.weightKg === previous.weightKg && mark.reps > previous.reps;
/** Same strict load record as history's bestWeight; equal load + more reps is an improvement, not another load record. */
export function exerciseHighlight(exerciseId: string, name: string, mode: string | null, sets: WorkoutSet[], history: RobustExerciseHistoryItem[]): SessionHighlight | null {
  if (!HIGHLIGHT_WEIGHT_MODES.some(value => value === mode)) return null;
  const mark = bestMark(sets);
  if (!mark) return null;
  const ordered = history.map(item => ({ value: bestMark(item.exercise.sets), item })).sort((a, b) => Date.parse(b.item.session.ended_at!) - Date.parse(a.item.session.ended_at!) || b.item.session.id.localeCompare(a.item.session.id));
  const previous = ordered.filter((row): row is { value: SessionHighlightMark; item: RobustExerciseHistoryItem } => row.value !== null);
  if (!previous.length) return null;
  const best = previous.reduce((left, right) => better(right.value, left.value) ? right : left).value;
  if (mark.weightKg > best.weightKg) return { kind: 'record', exerciseId, name, mark, previous: best, weightMode: mode! };
  const last = ordered[0]?.value;
  return last && better(mark, last) ? { kind: 'improvement', exerciseId, name, mark, previous: last, weightMode: mode! } : null;
}
type SessionDetail = NonNullable<Awaited<ReturnType<typeof getWorkoutSessionDetail>>>;
type Auth = { supabase: MobileSupabaseAuthenticatedContext['supabase']; userId: string; requestPerformance: RequestPerformanceContext };
const completed = (sets: WorkoutSet[]) => sets.filter(set => set.is_completed);
/** Earlier completed sessions with this exercise, newest first (the session itself never counts). */
function earlier(history: RobustExerciseHistoryItem[], detail: SessionDetail) {
  return history.filter(item => item.session.id !== detail.session.id && item.session.status === 'completed' && item.session.ended_at
    && Date.parse(item.session.ended_at) < Date.parse(detail.session.ended_at!))
    .sort((a, b) => Date.parse(b.session.ended_at!) - Date.parse(a.session.ended_at!) || b.session.id.localeCompare(a.session.id));
}
async function completedSession(id: unknown, auth: Auth) {
  const sessionId = parseMobileTrainingId(id, 'La sesión');
  const detail = await getWorkoutSessionDetail(sessionId, auth);
  if (!detail || detail.session.status !== 'completed' || !detail.session.ended_at) throw new MobileApiNotFoundError();
  return { sessionId, detail };
}
/** Four concurrent history reads, complete/paginated by the existing owner-scoped loader. */
async function histories(detail: SessionDetail, auth: Auth, wanted: (exercise: SessionDetail['exercises'][number]) => boolean) {
  const out = new Map<string, RobustExerciseHistoryItem[]>();
  const ids = [...new Set(detail.exercises.filter(wanted).map(exercise => exercise.exercise_id))];
  for (let offset = 0; offset < ids.length; offset += 4) {
    const rows = await Promise.all(ids.slice(offset, offset + 4).map(async id => [id, earlier(await listCompleteRobustExerciseHistory(id, auth), detail)] as const));
    rows.forEach(([id, items]) => out.set(id, items));
  }
  return out;
}
function highlightsOf(detail: SessionDetail, history: Map<string, RobustExerciseHistoryItem[]>): Pick<SessionHighlightsDto, 'volumeKg' | 'highlights'> {
  const weighted = detail.exercises.filter(exercise => isKgWeightMode(exercise.weight_mode_snapshot))
    .flatMap(exercise => exercise.sets.filter(set => set.is_completed && set.actual_weight_kg !== null && set.actual_reps !== null));
  const volumeKg = weighted.length ? weighted.reduce((total, set) => total + set.actual_weight_kg! * set.actual_reps!, 0) : null;
  const highlights = detail.exercises.flatMap(exercise => {
    if (!HIGHLIGHT_WEIGHT_MODES.some(mode => mode === exercise.weight_mode_snapshot) || !bestMark(exercise.sets)) return [];
    const before = (history.get(exercise.exercise_id) ?? []).filter(item => item.exercise.weight_mode_snapshot === exercise.weight_mode_snapshot);
    const item = exerciseHighlight(exercise.exercise_id, exercise.nombre_snapshot, exercise.weight_mode_snapshot, exercise.sets, before);
    return item ? [item] : [];
  });
  // One exercise can only appear once (the same exercise twice in a session is reported by its first entry).
  const seen = new Set<string>();
  return { volumeKg, highlights: highlights.filter(item => !seen.has(item.exerciseId) && !!seen.add(item.exerciseId)) };
}
export async function readMobileSessionHighlights(id: unknown, context: MobileSupabaseAuthenticatedContext, performance: RequestPerformanceContext): Promise<SessionHighlightsDto> {
  const auth = { supabase: context.supabase, userId: context.userId, requestPerformance: performance };
  const { sessionId, detail } = await completedSession(id, auth);
  const history = await histories(detail, auth, exercise => HIGHLIGHT_WEIGHT_MODES.some(mode => mode === exercise.weight_mode_snapshot) && !!bestMark(exercise.sets));
  // Never manufacture a receipt from incomplete data.
  const dto = { sessionId, ...highlightsOf(detail, history) };
  if (!parseSessionHighlights(dto)) throw new Error('Invalid session highlights');
  return dto;
}

/** Best set: by load then reps for load modes, by reps otherwise. */
function best(sets: WorkoutSet[], byLoad: boolean): { load: number; reps: number } | null {
  const done = completed(sets).filter(set => set.actual_reps !== null && set.actual_reps > 0 && (!byLoad || set.actual_weight_kg !== null));
  if (!done.length) return null;
  return done.map(set => ({ load: byLoad ? set.actual_weight_kg! : 0, reps: set.actual_reps! }))
    .reduce((left, right) => right.load > left.load || right.load === left.load && right.reps > left.reps ? right : left);
}
/** How one exercise of the session went against the last time it was done before it. */
export function exerciseComparison(exercise: SessionDetail['exercises'][number], before: RobustExerciseHistoryItem[]): SessionExerciseComparison {
  const base = { sessionExerciseId: exercise.id, exerciseId: exercise.exercise_id };
  const last = before[0];
  if (!last) return { ...base, status: 'first', change: null, previous: null };
  const previous = { sessionId: last.session.id, endedAt: last.session.ended_at!,
    sets: completed(last.exercise.sets).sort((a, b) => a.set_number - b.set_number).map(set => ({ weightKg: set.actual_weight_kg, reps: set.actual_reps })) };
  if (last.exercise.weight_mode_snapshot !== exercise.weight_mode_snapshot) return { ...base, status: 'not_comparable', change: null, previous: null };
  const byLoad = loadCompared(exercise.weight_mode_snapshot);
  const now = best(exercise.sets, byLoad), then = best(last.exercise.sets, byLoad);
  if (!now || !then) return { ...base, status: 'not_comparable', change: null, previous };
  if (now.load !== then.load) return { ...base, status: now.load > then.load ? 'improved' : 'declined', change: { kind: 'weight', amount: Math.round((now.load - then.load) * 100) / 100 }, previous };
  if (now.reps !== then.reps) return { ...base, status: now.reps > then.reps ? 'improved' : 'declined', change: { kind: 'reps', amount: now.reps - then.reps }, previous };
  return { ...base, status: 'same', change: null, previous };
}
/** One read for "Entrenamiento guardado" and the completed session: highlights + per-exercise comparison. */
export async function readMobileSessionSummary(id: unknown, context: MobileSupabaseAuthenticatedContext, performance: RequestPerformanceContext): Promise<SessionSummaryDto> {
  const auth = { supabase: context.supabase, userId: context.userId, requestPerformance: performance };
  const { sessionId, detail } = await completedSession(id, auth);
  const history = await histories(detail, auth, () => true);
  const dto: SessionSummaryDto = { sessionId, ...highlightsOf(detail, history),
    exercises: detail.exercises.map(exercise => exerciseComparison(exercise, history.get(exercise.exercise_id) ?? [])) };
  if (!parseSessionSummary(dto)) throw new Error('Invalid session summary');
  return dto;
}
