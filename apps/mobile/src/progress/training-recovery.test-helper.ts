import { recoveryBin, type ProgressTrainingRecovery, type RecoveryGroup, type RecoveryRow, type RecoverySelection } from '@/api/training-recovery';

// Fictitious contract responses; Mobile fixtures do not import the backend calculation engine.
export const RECOVERY_TODAY = '2026-08-31';
export const recoveryFixtureId = (n: number) => `93674430-0000-4000-8000-${String(n).padStart(12, '0')}`;
const counts = { improved: 1, stable: 0, declined: 0, ambiguous: 0, insufficient: 0 };
const group = (rows: RecoveryRow[]): RecoveryGroup => ({ sessions: rows.length, energy: { n: rows.length, median: rows.length ? 4 : null, distribution: [0, 0, 0, rows.length, 0] },
  fatigue: { n: rows.length, median: rows.length ? 2 : null, distribution: [0, rows.length, 0, 0, 0] }, performance: { ...counts, improved: rows.length } });
export function recoveryFixture(selection: RecoverySelection = { scope: 'all', routine: null, bin: null, offset: 0 }): ProgressTrainingRecovery {
  const all: RecoveryRow[] = [0, 1, 2].map(i => ({ id: recoveryFixtureId(i + 10), date: `2026-08-0${i + 1}`, name: i === 1 ? 'PULL' : 'PUSH', routineId: recoveryFixtureId(i === 1 ? 701 : 700),
    startedAt: `2026-08-0${i + 1}T08:00:00-03:00`, energy: { value: 4, state: 'recorded' }, fatigue: { value: 2, state: 'recorded' }, performance: counts,
    gap: i === 0 || selection.scope === 'routine' && i === 1 ? { state: 'no_previous', hours: null, intervening: null, previous: null }
      : { state: 'paired', hours: selection.scope === 'routine' ? 47 : 23, intervening: selection.scope === 'routine' ? 1 : 0,
        previous: { id: recoveryFixtureId(selection.scope === 'routine' ? 10 : i + 9), date: selection.scope === 'routine' ? '2026-08-01' : `2026-08-0${i}`, name: selection.scope === 'routine' || i === 1 ? 'PUSH' : 'PULL', endedAt: `${selection.scope === 'routine' ? '2026-08-01' : `2026-08-0${i}`}T09:00:00-03:00` } } }));
  const rows = all.filter(r => selection.routine === null || r.routineId === selection.routine), paired = rows.filter(r => r.gap.state === 'paired');
  const selected = selection.bin === null ? rows : paired.filter(r => recoveryBin(r.gap.hours!) === selection.bin);
  return { contractVersion: 'training-recovery/1', timeBasis: 'stored_end_to_start', timezone: 'America/Argentina/Cordoba', today: RECOVERY_TODAY, revision: 'a'.repeat(32), selection,
    period: { preset: 'custom', start: '2026-08-01', end: RECOVERY_TODAY, days: 31, previousStart: '2026-07-01', previousEnd: '2026-07-31', bucket: 'week', includesToday: true },
    routines: [{ id: recoveryFixtureId(700), name: 'PUSH', sessions: 2 }, { id: recoveryFixtureId(701), name: 'PULL', sessions: 1 }],
    coverage: { sessions: rows.length, paired: paired.length, currentTimeExcluded: 0, excluded: { no_previous: rows.length - paired.length, no_routine: 0, invalid_previous: 0, uncertain_order: 0, overlap: 0 } },
    total: group(paired), groups: Array.from({ length: 5 }, (_, i) => group(paired.filter(r => recoveryBin(r.gap.hours!) === i))),
    page: { total: selected.length, rows: selected.slice(selection.offset, selection.offset + 30), nextOffset: null } };
}
