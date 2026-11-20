import { isNutritionDate } from './nutrition-day-contract';
import { parseProgressPeriod, type ProgressPeriod } from './progress-contract';
import type { TrainingTimeCounts } from './progress-training-times-contract';

export const RECOVERY_BINS = [
  { fromHours: 0, toHours: 24, label: 'Menos de 24 h' },
  { fromHours: 24, toHours: 48, label: '24–48 h' },
  { fromHours: 48, toHours: 72, label: '48–72 h' },
  { fromHours: 72, toHours: 168, label: '3–7 días' },
  { fromHours: 168, toHours: null, label: '7 días o más' },
] as const;
export type RecoverySelection = { scope: 'all' | 'routine'; routine: string | null; bin: number | null; offset: number };
export type RecoveryFeeling = { n: number; median: number | null; distribution: number[] };
export type RecoveryGroup = { sessions: number; energy: RecoveryFeeling; fatigue: RecoveryFeeling; performance: TrainingTimeCounts };
export type RecoveryGapState = 'paired' | 'no_previous' | 'no_routine' | 'uncertain_order' | 'invalid_previous' | 'overlap';
export type RecoveryRow = {
  id: string; date: string; name: string; routineId: string | null; startedAt: string;
  energy: { value: number | null; state: string }; fatigue: { value: number | null; state: string }; performance: TrainingTimeCounts;
  gap: { state: RecoveryGapState; hours: number | null; intervening: number | null; previous: { id: string; date: string; name: string; endedAt: string } | null };
};
export type ProgressTrainingRecovery = {
  contractVersion: 'training-recovery/1'; timeBasis: 'stored_end_to_start'; timezone: 'America/Argentina/Cordoba'; today: string; period: ProgressPeriod; revision: string;
  selection: RecoverySelection; routines: { id: string; name: string; sessions: number }[];
  coverage: { sessions: number; paired: number; currentTimeExcluded: number; excluded: Record<Exclude<RecoveryGapState, 'paired'>, number> };
  total: RecoveryGroup; groups: RecoveryGroup[]; page: { total: number; nextOffset: number | null; rows: RecoveryRow[] };
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown): v is string => typeof v === 'string';
const counts = (v: unknown): v is TrainingTimeCounts => object(v) && ['improved', 'stable', 'declined', 'ambiguous', 'insufficient'].every(k => count(v[k]));
const feeling = (v: unknown, max: number): v is RecoveryFeeling => object(v) && count(v.n) && v.n <= max
  && (v.n === 0 ? v.median === null : finite(v.median) && v.median >= 1 && v.median <= 5)
  && Array.isArray(v.distribution) && v.distribution.length === 5 && v.distribution.every(count) && v.distribution.reduce((a, b) => a + b, 0) === v.n;
const group = (v: unknown): v is RecoveryGroup => object(v) && count(v.sessions) && feeling(v.energy, v.sessions) && feeling(v.fatigue, v.sessions) && counts(v.performance);
const fact = (v: unknown) => object(v) && ['recorded', 'late', 'unknown_time', 'not_recorded', 'unreadable', 'other_instrument'].includes(String(v.state))
  && (v.state === 'recorded' ? count(v.value) && v.value >= 1 && v.value <= 5 : v.value === null);
export const recoveryBin = (hours: number) => RECOVERY_BINS.findIndex(bin => hours >= bin.fromHours && (bin.toHours === null || hours < bin.toHours));
export function parseProgressTrainingRecovery(v: unknown): ProgressTrainingRecovery | undefined {
  if (!object(v) || v.contractVersion !== 'training-recovery/1' || v.timeBasis !== 'stored_end_to_start' || v.timezone !== 'America/Argentina/Cordoba'
    || !isNutritionDate(v.today) || !text(v.revision) || !/^[a-f0-9]{32}$/.test(v.revision) || !object(v.selection) || !['all', 'routine'].includes(String(v.selection.scope))
    || !(v.selection.routine === null || text(v.selection.routine)) || !(v.selection.bin === null || count(v.selection.bin) && v.selection.bin < 5) || !count(v.selection.offset)) return;
  const period = parseProgressPeriod(v.period), selection = v.selection as unknown as RecoverySelection;
  if (!period || !object(v.coverage) || !count(v.coverage.sessions) || !count(v.coverage.paired) || !count(v.coverage.currentTimeExcluded) || !object(v.coverage.excluded)) return;
  const excluded = v.coverage.excluded, reasons = ['no_previous', 'no_routine', 'uncertain_order', 'invalid_previous', 'overlap'];
  if (!reasons.every(k => count(excluded[k])) || reasons.reduce((sum, k) => sum + Number(excluded[k]), 0) + v.coverage.paired + v.coverage.currentTimeExcluded !== v.coverage.sessions
    || !group(v.total) || v.total.sessions !== v.coverage.paired || !Array.isArray(v.groups) || v.groups.length !== 5 || !v.groups.every(group)
    || v.groups.reduce((sum, g) => sum + g.sessions, 0) !== v.total.sessions) return;
  const total = v.total;
  const groups = v.groups;
  if (['energy', 'fatigue'].some(k => groups.reduce((sum, g) => sum + g[k as 'energy' | 'fatigue'].n, 0) !== total[k as 'energy' | 'fatigue'].n)) return;
  if (Object.keys(total.performance).some(k => groups.reduce((sum, g) => sum + g.performance[k as keyof TrainingTimeCounts], 0) !== total.performance[k as keyof TrainingTimeCounts])) return;
  if (!Array.isArray(v.routines) || !v.routines.every(r => object(r) && text(r.id) && text(r.name) && count(r.sessions))
    || selection.routine !== null && !v.routines.some(r => r.id === selection.routine)) return;
  if (!object(v.page) || !count(v.page.total) || v.page.total > v.coverage.sessions - v.coverage.currentTimeExcluded
    || !(v.page.nextOffset === null || count(v.page.nextOffset)) || !Array.isArray(v.page.rows) || v.page.rows.length > 30) return;
  const rows = v.page.rows;
  if (v.page.total !== (selection.bin === null ? v.coverage.sessions - v.coverage.currentTimeExcluded : groups[selection.bin]!.sessions)) return;
  if (!rows.every(r => object(r) && text(r.id) && isNutritionDate(r.date) && r.date >= period.start && r.date <= period.end && text(r.name)
    && (r.routineId === null || text(r.routineId)) && text(r.startedAt) && Number.isFinite(Date.parse(r.startedAt)) && counts(r.performance) && fact(r.energy) && fact(r.fatigue)
    && object(r.gap) && ['paired', ...reasons].includes(String(r.gap.state))
    && (r.gap.state === 'paired' ? finite(r.gap.hours) && r.gap.hours >= 0 && object(r.gap.previous) && text(r.gap.previous.id) && isNutritionDate(r.gap.previous.date)
      && text(r.gap.previous.name) && text(r.gap.previous.endedAt) && Number.isFinite(Date.parse(r.gap.previous.endedAt))
      && Math.abs((Date.parse(r.startedAt) - Date.parse(r.gap.previous.endedAt)) / 3_600_000 - r.gap.hours) < 1e-8
      : r.gap.hours === null && r.gap.previous === null)
    && (r.gap.intervening === null || count(r.gap.intervening))
    && (selection.bin === null || finite(r.gap.hours) && recoveryBin(r.gap.hours) === selection.bin)
    && (selection.routine === null || (r.routineId ?? 'free') === selection.routine))) return;
  const next = selection.offset + rows.length;
  if (rows.length !== Math.min(30, Math.max(0, v.page.total - selection.offset)) || v.page.nextOffset !== (next < v.page.total ? next : null) || new Set(rows.map(r => r.id)).size !== rows.length) return;
  return v as unknown as ProgressTrainingRecovery;
}
