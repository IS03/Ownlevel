import 'server-only';
import { getWorkoutSessionDetail, listCompleteRobustExerciseHistory, type RobustExerciseHistoryItem } from '../phase2/training-robust';
import { buildExercisePerformance, type ExerciseReportSession } from '../phase2/exercise-insights';
import type { WorkoutSet } from '../phase2/types';
import type { RequestPerformanceContext } from '../request-performance';
import { MobileApiNotFoundError } from './auth';
import type { MobileSupabaseAuthenticatedContext } from './supabase';
import { parseMobileTrainingId } from './training';
import { HIGHLIGHT_WEIGHT_MODES, isKgWeightMode, parseSessionHighlights, type SessionHighlight, type SessionHighlightMark, type SessionHighlightsDto } from './training-session-highlights';

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
export async function readMobileSessionHighlights(id: unknown, context: MobileSupabaseAuthenticatedContext, performance: RequestPerformanceContext): Promise<SessionHighlightsDto> {
  const sessionId = parseMobileTrainingId(id, 'La sesión');
  const auth = { supabase: context.supabase, userId: context.userId, requestPerformance: performance };
  const detail = await getWorkoutSessionDetail(sessionId, auth);
  if (!detail || detail.session.status !== 'completed' || !detail.session.ended_at) throw new MobileApiNotFoundError();
  const weighted = detail.exercises.filter(exercise => isKgWeightMode(exercise.weight_mode_snapshot))
    .flatMap(exercise => exercise.sets.filter(set => set.is_completed && set.actual_weight_kg !== null && set.actual_reps !== null));
  const volumeKg = weighted.length ? weighted.reduce((total, set) => total + set.actual_weight_kg! * set.actual_reps!, 0) : null;
  const highlights: SessionHighlight[] = [];
  // Four concurrent history reads, complete/paginated by the existing owner-scoped loader.
  for (let offset = 0; offset < detail.exercises.length; offset += 4) {
    const results = await Promise.all(detail.exercises.slice(offset, offset + 4).map(async exercise => {
      if (!HIGHLIGHT_WEIGHT_MODES.some(mode => mode === exercise.weight_mode_snapshot) || !bestMark(exercise.sets)) return null;
      const history = await listCompleteRobustExerciseHistory(exercise.exercise_id, auth);
      const before = history.filter(item => item.session.id !== sessionId && item.session.status === 'completed' && item.session.ended_at
        && Date.parse(item.session.ended_at) < Date.parse(detail.session.ended_at!) && item.exercise.weight_mode_snapshot === exercise.weight_mode_snapshot);
      return exerciseHighlight(exercise.exercise_id, exercise.nombre_snapshot, exercise.weight_mode_snapshot, exercise.sets, before);
    }));
    highlights.push(...results.filter((item): item is SessionHighlight => item !== null));
  }
  // One exercise can only appear once; never manufacture a receipt from incomplete data.
  const dto = { sessionId, volumeKg, highlights };
  if (!parseSessionHighlights(dto)) throw new Error('Invalid session highlights');
  return dto;
}
