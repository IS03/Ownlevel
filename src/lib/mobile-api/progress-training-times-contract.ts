import { isNutritionDate } from './nutrition-day-contract';
import { parseProgressPeriod, type ProgressPeriod } from './progress-contract';

export const TRAINING_TIMES_CONTRACT = 'training-times/1' as const;
export const TRAINING_TIMES_ZONE = 'America/Argentina/Cordoba' as const;
export const TRAINING_TIMES_PAGE_SIZE = 30;
export type TrainingTimeMetric = 'sessions' | 'duration' | 'energy' | 'improvements' | 'load';
export type TrainingTimeSelection = { routine: string | null; execution: string | null; bin: number | null; offset: number };
export type TrainingTimeCounts = { improved: number; stable: number; declined: number; ambiguous: number; insufficient: number };
export type ComparisonContext = { complete: number; partial: number };
export type TrainingTimeGroup = {
  comparisonContext?: ComparisonContext;
  fromMinute: number; toMinute: number; sessions: number;
  duration: { n: number; median: number | null };
  energy: { n: number; distribution: number[]; median: number | null };
  performance: TrainingTimeCounts;
  load: { n: number; median: number | null };
};
export type TrainingTimeExecution = { key: string; exerciseId: string; name: string; implement: string; configuration: string; mode: string; unit: 'kg' | 'lingotes' };
export type TrainingTimeSession = {
  comparisonContext?: ComparisonContext;
  id: string; date: string; name: string; routineId: string | null; startedAt: string; minute: number; minutes: number | null;
  energy: { value: number | null; state: string }; performance: TrainingTimeCounts;
  load: { value: number; reps: number } | null;
};
export type ProgressTrainingTimes = {
  contractVersion: typeof TRAINING_TIMES_CONTRACT; timezone: typeof TRAINING_TIMES_ZONE;
  /** The database's saved start, not a certification of the actual start of old workouts. */
  timeBasis: 'stored_start'; today: string; period: ProgressPeriod; revision: string; selection: TrainingTimeSelection;
  routines: { id: string; name: string; sessions: number }[]; executions: TrainingTimeExecution[];
  coverage: { sessions: number; timed: number; missingStart: number; invalidStart: number; differentDay: number; futureStart: number };
  total: TrainingTimeGroup; bins: TrainingTimeGroup[]; bands: TrainingTimeGroup[];
  page: { total: number; nextOffset: number | null; rows: TrainingTimeSession[] };
};

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const count = (v: unknown): v is number => finite(v) && Number.isSafeInteger(v) && v >= 0;
const nullable = (v: unknown): v is number | null => v === null || finite(v);
const text = (v: unknown): v is string => typeof v === 'string';
const counts = (v: unknown): v is TrainingTimeCounts => record(v) && ['improved', 'stable', 'declined', 'ambiguous', 'insufficient'].every(k => count(v[k]));
/** Optional EXPAND: absent means the server did not provide a breakdown, never zero. */
export function validComparisonContext(v: unknown, performance: TrainingTimeCounts) {
  return v === undefined || record(v) && count(v.complete) && count(v.partial)
    && v.complete + v.partial === performance.improved + performance.stable + performance.declined;
}
export function validComparisonContextTotals(total: ComparisonContext | undefined, groups: readonly { comparisonContext?: ComparisonContext }[]) {
  if (!total || groups.some(group => group.comparisonContext === undefined)) return true;
  return (['complete', 'partial'] as const).every(key => groups.reduce((sum, group) => sum + group.comparisonContext![key], 0) === total[key]);
}
const measure = (v: unknown, limit: number) => record(v) && count(v.n) && v.n <= limit && nullable(v.median)
  && ((v.n === 0) === (v.median === null)) && (v.median === null || v.median >= 0);
export function validTrainingTimeGroup(v: unknown): v is TrainingTimeGroup {
  if (!record(v) || !count(v.fromMinute) || !count(v.toMinute) || v.fromMinute >= v.toMinute || v.toMinute > 1440 || !count(v.sessions)
    || !measure(v.duration, v.sessions) || !measure(v.load, v.sessions) || !measure(v.energy, v.sessions) || !record(v.energy) || !counts(v.performance) || !validComparisonContext(v.comparisonContext, v.performance)) return false;
  return Array.isArray(v.energy.distribution) && v.energy.distribution.length === 5 && v.energy.distribution.every(count)
    && v.energy.distribution.reduce((a, b) => a + b, 0) === v.energy.n
    && (v.energy.median === null || (finite(v.energy.median) && v.energy.median >= 1 && v.energy.median <= 5));
}
export function parseProgressTrainingTimes(v: unknown): ProgressTrainingTimes | undefined {
  if (!record(v) || v.contractVersion !== TRAINING_TIMES_CONTRACT || v.timezone !== TRAINING_TIMES_ZONE || v.timeBasis !== 'stored_start'
    || !isNutritionDate(v.today) || !parseProgressPeriod(v.period) || !text(v.revision) || !/^[a-f0-9]{32}$/.test(v.revision)
    || !record(v.selection) || ![v.selection.routine, v.selection.execution].every(x => x === null || text(x))
    || !(v.selection.bin === null || (count(v.selection.bin) && v.selection.bin < 12)) || !count(v.selection.offset)
    || !record(v.coverage) || !['sessions', 'timed', 'missingStart', 'invalidStart', 'differentDay', 'futureStart'].every(k => count((v.coverage as Record<string, unknown>)[k]))) return;
  const c = v.coverage as ProgressTrainingTimes['coverage'];
  if (c.timed + c.missingStart + c.invalidStart + c.differentDay + c.futureStart !== c.sessions || !validTrainingTimeGroup(v.total) || v.total.sessions !== c.timed || v.total.fromMinute !== 0 || v.total.toMinute !== 1440) return;
  const total = v.total;
  for (const [key, length, step] of [['bins', 12, 120], ['bands', 4, 360]] as const) {
    const rows = v[key];
    if (!Array.isArray(rows) || rows.length !== length || !rows.every((g, i) => validTrainingTimeGroup(g) && g.fromMinute === i * step && g.toMinute === (i + 1) * step)
      || rows.reduce((sum, g) => sum + g.sessions, 0) !== c.timed || !validComparisonContextTotals(total.comparisonContext, rows)) return;
    if (['duration', 'energy', 'load'].some(measure => rows.reduce((sum, g) => sum + g[measure].n, 0) !== total[measure as 'duration' | 'energy' | 'load'].n)
      || Object.keys(total.performance).some(key => rows.reduce((sum, g) => sum + g.performance[key], 0) !== total.performance[key as keyof TrainingTimeCounts])) return;
  }
  if (!Array.isArray(v.routines) || !v.routines.every(r => record(r) && text(r.id) && text(r.name) && count(r.sessions))
    || new Set(v.routines.map(r => r.id)).size !== v.routines.length
    || !Array.isArray(v.executions) || !v.executions.every(e => record(e) && ['key', 'exerciseId', 'name', 'implement', 'configuration', 'mode'].every(k => text(e[k])) && ['kg', 'lingotes'].includes(String(e.unit)))
    || new Set(v.executions.map(e => e.key)).size !== v.executions.length) return;
  const selection = v.selection;
  if (selection.routine !== null && !v.routines.some(r => r.id === selection.routine)
    || selection.execution !== null && !v.executions.some(e => e.key === selection.execution)) return;
  if (!record(v.page) || !count(v.page.total) || v.page.total > c.timed || !(v.page.nextOffset === null || count(v.page.nextOffset))
    || !Array.isArray(v.page.rows) || v.page.rows.length > TRAINING_TIMES_PAGE_SIZE) return;
  const rows = v.page.rows;
  const period = parseProgressPeriod(v.period)!;
  if (!rows.every(r => record(r) && text(r.id) && isNutritionDate(r.date) && text(r.name) && (r.routineId === null || text(r.routineId))
    && text(r.startedAt) && Number.isFinite(Date.parse(r.startedAt)) && finite(r.minute) && r.minute >= 0 && r.minute < 1440
    && nullable(r.minutes) && (r.minutes === null || r.minutes > 0) && counts(r.performance) && validComparisonContext(r.comparisonContext, r.performance) && record(r.energy) && ['recorded', 'late', 'unknown_time', 'not_recorded', 'unreadable', 'other_instrument'].includes(String(r.energy.state))
    && ((r.energy.state === 'recorded') === (r.energy.value !== null))
    && (r.energy.value === null || (count(r.energy.value) && r.energy.value >= 1 && r.energy.value <= 5))
    && (r.load === null || (record(r.load) && finite(r.load.value) && r.load.value >= 0 && count(r.load.reps) && r.load.reps > 0)))) return;
  if (new Set(rows.map(r => r.id)).size !== rows.length || rows.length !== Math.min(TRAINING_TIMES_PAGE_SIZE, Math.max(0, v.page.total - v.selection.offset))
    || rows.some(r => r.date < period.start || r.date > period.end || selection.bin !== null && Math.floor(r.minute / 120) !== selection.bin
      || selection.routine !== null && (r.routineId ?? 'free') !== selection.routine)) return;
  const next = v.selection.offset + rows.length;
  if (v.page.nextOffset !== (next < v.page.total ? next : null)) return;
  return v as unknown as ProgressTrainingTimes;
}
