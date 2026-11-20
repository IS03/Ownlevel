import type { ProgressTrainingTimes, TrainingTimeGroup, TrainingTimeSelection, TrainingTimeSession } from '@/api/training-times';

// Fictitious wire responses. The Mobile test graph never imports the server's calculation engine.
export const TIMES_TODAY = '2026-08-31';
const id = (n: number) => `93674430-0000-4000-8000-${String(n).padStart(12, '0')}`;
const execution = { key: `${id(500)}|["peso total","kg","barra","recorded:prueba"]`, exerciseId: id(500), name: 'Press', implement: 'Barra', configuration: 'recorded:prueba', mode: 'Peso total', unit: 'kg' as const };
const allRows: TrainingTimeSession[] = Array.from({ length: 12 }, (_, i) => ({
  id: id(10 + i), date: `2026-08-${String(i + 3).padStart(2, '0')}`, name: i < 6 ? 'Rutina A' : 'Rutina B', routineId: id(i < 6 ? 700 : 701),
  startedAt: `2026-08-${String(i + 3).padStart(2, '0')}T${i < 6 ? '08' : '16'}:00:00-03:00`, minute: i < 6 ? 480 : 960, minutes: 60,
  energy: { value: 3, state: 'recorded' }, performance: { improved: 1, stable: 0, declined: 0, ambiguous: 0, insufficient: 0 }, load: null,
}));
const group = (rows: TrainingTimeSession[], fromMinute = 0, toMinute = 1440): TrainingTimeGroup => {
  const n = rows.filter(row => row.minute >= fromMinute && row.minute < toMinute).length;
  return { fromMinute, toMinute, sessions: n, duration: { n, median: n ? 60 : null }, energy: { n, median: n ? 3 : null, distribution: [0, 0, n, 0, 0] },
    performance: { improved: n, stable: 0, declined: 0, ambiguous: 0, insufficient: 0 }, load: { n: rows[0]?.load ? n : 0, median: rows[0]?.load && n ? 20 : null } };
};
export function timesFixture(selection: TrainingTimeSelection = { routine: null, execution: null, bin: null, offset: 0 }): ProgressTrainingTimes {
  const rows = allRows.filter(row => selection.routine === null || row.routineId === selection.routine).map(row => ({ ...row, load: selection.execution ? { value: 20, reps: 10 } : null }));
  const selected = selection.bin === null ? rows : rows.filter(row => Math.floor(row.minute / 120) === selection.bin);
  return {
    contractVersion: 'training-times/1', timeBasis: 'stored_start', timezone: 'America/Argentina/Cordoba', today: TIMES_TODAY, revision: 'a'.repeat(32), selection,
    period: { preset: 'custom', start: '2026-08-01', end: TIMES_TODAY, days: 31, previousStart: '2026-07-01', previousEnd: '2026-07-31', bucket: 'week', includesToday: true },
    routines: [{ id: id(700), name: 'Rutina A', sessions: 6 }, { id: id(701), name: 'Rutina B', sessions: 6 }], executions: [execution],
    coverage: { sessions: rows.length, timed: rows.length, missingStart: 0, invalidStart: 0, differentDay: 0, futureStart: 0 },
    total: group(rows), bins: Array.from({ length: 12 }, (_, i) => group(rows, i * 120, (i + 1) * 120)), bands: Array.from({ length: 4 }, (_, i) => group(rows, i * 360, (i + 1) * 360)),
    page: { total: selected.length, rows: selected.slice(selection.offset, selection.offset + 30), nextOffset: null },
  };
}
