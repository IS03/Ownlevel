import { cordobaDateOf } from '../phase2/cordoba-date';
import { buildPerformanceInsightsV1 } from './performance-insights';
import { contextIssue, contextKey } from './performance-insights/exposure';
import { instantMs, parseSessionFeelings, toPerformanceSessions } from './insights-engine/source-adapter';
import { priorFeelingFact } from './insights-engine/prior-feelings';
import type { InsightsSource } from './insights-engine/types';
import { TRAINING_TIMES_CONTRACT, TRAINING_TIMES_PAGE_SIZE, TRAINING_TIMES_ZONE, type ProgressTrainingTimes, type TrainingTimeCounts, type TrainingTimeExecution, type TrainingTimeGroup, type TrainingTimeSelection, type TrainingTimeSession } from '../mobile-api/progress-training-times-contract';
import type { ProgressPeriod } from '../mobile-api/progress-contract';
import { trainingStartTime } from './training-start-time';

const emptyCounts = (): TrainingTimeCounts => ({ improved: 0, stable: 0, declined: 0, ambiguous: 0, insufficient: 0 });
export const trainingTimeMedian = (values: readonly number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
export function trainingTimeGroup(rows: readonly TrainingTimeSession[], fromMinute = 0, toMinute = 1440): TrainingTimeGroup {
  const chosen = rows.filter(row => row.minute >= fromMinute && row.minute < toMinute);
  const durations = chosen.flatMap(r => r.minutes === null ? [] : [r.minutes]);
  const energy = chosen.flatMap(r => r.energy.value === null ? [] : [r.energy.value]);
  const loads = chosen.flatMap(r => r.load === null ? [] : [r.load.value]);
  const performance = emptyCounts();
  for (const row of chosen) for (const key of Object.keys(performance) as (keyof TrainingTimeCounts)[]) performance[key] += row.performance[key];
  return { fromMinute, toMinute, sessions: chosen.length, duration: { n: durations.length, median: trainingTimeMedian(durations) },
    energy: { n: energy.length, distribution: [1, 2, 3, 4, 5].map(value => energy.filter(e => e === value).length), median: trainingTimeMedian(energy) },
    performance, load: { n: loads.length, median: trainingTimeMedian(loads) } };
}

/** Descriptions by saved session start. Never a causal model or a search for a winning hour. */
export function buildTrainingTimes(source: InsightsSource, options: { today: string; period: ProgressPeriod; revision: string; selection: TrainingTimeSelection }): ProgressTrainingTimes {
  const { today, period, revision, selection } = options;
  const adapted = toPerformanceSessions(source);
  const performance = buildPerformanceInsightsV1({ sessions: adapted.sessions, historyCoverage: 'complete', exclusionDetail: 'summary', output: 'compact' });
  if (adapted.orphanRows || performance.integrity !== 'valid') throw new Error('Invalid training timing source');
  const results = new Map(performance.sessions.map(s => [s.sessionId, s]));
  const blocksBySession = new Map(adapted.sessions.map(s => [s.id, s.exercises]));
  const facts = new Map(source.feelings.map(f => [f.sessionId, f.facts]));
  const setsByBlock = new Map<string, typeof source.sets[number][]>();
  for (const set of source.sets) { const rows = setsByBlock.get(set.sessionExerciseId) ?? []; rows.push(set); setsByBlock.set(set.sessionExerciseId, rows); }
  const firstBySession = new Map<string, number>();
  for (const e of source.exercises) for (const set of setsByBlock.get(e.id) ?? []) {
    const at = set.isCompleted ? instantMs(set.completedAt) : null;
    if (at !== null) firstBySession.set(e.sessionId, Math.min(firstBySession.get(e.sessionId) ?? Infinity, at));
  }
  const sessions = source.sessions.filter(s => s.status === 'completed' && s.date && s.date >= period.start && s.date <= period.end);
  const routines = new Map<string, { id: string; name: string; sessions: number }>();
  for (const s of sessions) { const id = s.routineId?.toLowerCase() ?? 'free', old = routines.get(id); routines.set(id, { id, name: id === 'free' ? 'Sesiones libres' : s.routineName ?? s.name ?? 'Rutina', sessions: (old?.sessions ?? 0) + 1 }); }
  if (selection.routine !== null && !routines.has(selection.routine)) throw new Error('Unknown timing routine');
  const inRoutine = sessions.filter(s => selection.routine === null || (s.routineId?.toLowerCase() ?? 'free') === selection.routine);
  const executions = new Map<string, TrainingTimeExecution>();
  const keyOf = (id: string, context: Parameters<typeof contextKey>[0]) => `${id.toLowerCase()}|${contextKey(context)}`;
  const names = new Map(source.exercises.map(e => [e.id, e.name]));
  for (const s of inRoutine) for (const block of blocksBySession.get(s.id) ?? []) {
    const c = block.context;
    if (contextIssue(c) || !['kg', 'lingotes'].includes(c.unit ?? '') || !block.completed
      || !block.sets.some(set => set.completed && set.amount !== null && Number.isSafeInteger(set.amount) && set.amount > 0 && set.load !== null && Number.isFinite(set.load) && set.load >= 0)) continue;
    const key = keyOf(block.exerciseId, c);
    executions.set(key, { key, exerciseId: block.exerciseId.toLowerCase(), name: names.get(block.id) ?? 'Ejercicio', implement: c.implement!, configuration: c.configuration!, mode: c.weightMode!, unit: c.unit as 'kg' | 'lingotes' });
  }
  if (selection.execution !== null && !executions.has(selection.execution)) throw new Error('Unknown timing execution');
  const coverage = { sessions: 0, timed: 0, missingStart: 0, invalidStart: 0, differentDay: 0, futureStart: 0 };
  const rows: TrainingTimeSession[] = [];
  for (const s of inRoutine) {
    const blocks = blocksBySession.get(s.id) ?? [];
    const selected = selection.execution ? blocks.filter(b => keyOf(b.exerciseId, b.context) === selection.execution) : blocks;
    if (selection.execution && !selected.length) continue;
    coverage.sessions++;
    const time = trainingStartTime(s, today), end = instantMs(s.endedAt);
    if (time.state !== 'timed') { coverage[time.state]++; continue; }
    const { start, minute } = time;
    coverage.timed++;
    const parsed = parseSessionFeelings(facts.get(s.id) ?? {}, s, firstBySession.get(s.id) ?? null);
    const energy = priorFeelingFact({ feelings: parsed.values, unreadableFeelings: parsed.unreadable }, facts.get(s.id), 'energyPre');
    const counts = emptyCounts(), selectedId = selection.execution ? executions.get(selection.execution)!.exerciseId : null;
    for (const exercise of results.get(s.id)?.exercises ?? []) {
      if (selectedId && exercise.exerciseId !== selectedId) continue;
      const key = ({ improved: 'improved', observed_stable: 'stable', declined: 'declined', ambiguous_evidence: 'ambiguous', insufficient_comparison: 'insufficient' } as const)[exercise.status];
      counts[key]++;
    }
    const candidates = selection.execution ? selected.filter(b => b.completed && !contextIssue(b.context)).flatMap(b => b.sets).filter(set => set.completed && set.amount !== null && Number.isSafeInteger(set.amount) && set.amount > 0 && set.load !== null && Number.isFinite(set.load) && set.load >= 0 && (executions.get(selection.execution!)!.unit !== 'lingotes' || Number.isSafeInteger(set.load))) : [];
    const best = candidates.sort((a, b) => b.load! - a.load! || b.amount! - a.amount!)[0];
    rows.push({ id: s.id, date: s.date!, name: s.routineName ?? s.name ?? 'Sesión libre', routineId: s.routineId?.toLowerCase() ?? null,
      startedAt: s.startedAt!, minute, minutes: end !== null && end > start && cordobaDateOf(end) <= today ? (end - start) / 60_000 : null,
      energy, performance: counts, load: best ? { value: best.load!, reps: best.amount! } : null });
  }
  rows.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt) || a.id.localeCompare(b.id));
  const pageRows = selection.bin === null ? rows : rows.filter(r => Math.floor(r.minute / 120) === selection.bin);
  const page = pageRows.slice(selection.offset, selection.offset + TRAINING_TIMES_PAGE_SIZE), next = selection.offset + page.length;
  return { contractVersion: TRAINING_TIMES_CONTRACT, timezone: TRAINING_TIMES_ZONE, timeBasis: 'stored_start', today, period, revision, selection,
    routines: [...routines.values()].sort((a, b) => b.sessions - a.sessions || a.id.localeCompare(b.id)),
    executions: [...executions.values()].sort((a, b) => a.name.localeCompare(b.name, 'es-AR') || a.key.localeCompare(b.key)), coverage,
    total: trainingTimeGroup(rows), bins: Array.from({ length: 12 }, (_, i) => trainingTimeGroup(rows, i * 120, (i + 1) * 120)),
    bands: Array.from({ length: 4 }, (_, i) => trainingTimeGroup(rows, i * 360, (i + 1) * 360)),
    page: { total: pageRows.length, nextOffset: next < pageRows.length ? next : null, rows: page } };
}
