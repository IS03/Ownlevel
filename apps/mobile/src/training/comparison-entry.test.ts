import { describe, expect, it } from '@jest/globals';
import type { TrainingHistorySession } from '@/api/training-history';
import { comparisonEntry } from './training-hub-model';

const session = (id: string, logDate: string, routineId: string | null, routineName: string, startedAt = `${logDate}T21:00:00Z`): TrainingHistorySession => ({
  id, routineId, routineName, routineColor: routineId ? 'blue' as TrainingHistorySession['routineColor'] : null, logDate, startedAt, endedAt: startedAt,
  durationMilliseconds: 3_600_000, exercisesCompleted: 5, completedSets: 15, volumeKg: null,
});
const PULL = 'pull', PUSH = 'push';

describe('comparisonEntry · the double entry to Comparaciones', () => {
  it('today: names the routine and the earlier session of the same routine it is compared with', () => {
    const entry = comparisonEntry([session('a', '2026-11-10', PULL, 'PULL'), session('b', '2026-11-16', PUSH, 'PUSH'), session('c', '2026-11-17', PULL, 'PULL')], '2026-11-17');
    expect(entry).toMatchObject({ kind: 'session', sessionId: 'c', routineId: PULL, routineName: 'PULL', today: true, when: 'de hoy', previous: 'del martes 10' });
  });
  it('no session today: the last one, said as such (yesterday, or its weekday and day)', () => {
    expect(comparisonEntry([session('b', '2026-11-16', PUSH, 'PUSH')], '2026-11-17')).toMatchObject({ sessionId: 'b', today: false, when: 'de ayer', previous: 'anterior' });
    expect(comparisonEntry([session('b', '2026-11-12', PUSH, 'PUSH')], '2026-11-17')).toMatchObject({ when: 'del jueves 12' });
  });
  it('an earlier session outside what the landing loaded is «la anterior», never a made-up date', () => {
    expect(comparisonEntry([session('c', '2026-11-17', PULL, 'PULL'), session('b', '2026-11-16', PUSH, 'PUSH')], '2026-11-17')).toMatchObject({ previous: 'anterior' });
  });
  it('two sessions of the same routine today: the later one against the earlier', () => {
    const entry = comparisonEntry([session('m', '2026-11-17', PULL, 'PULL', '2026-11-17T12:00:00Z'), session('n', '2026-11-17', PULL, 'PULL', '2026-11-17T22:00:00Z')], '2026-11-17');
    expect(entry).toMatchObject({ sessionId: 'n', previous: 'de más temprano' });
  });
  it('a free session has no routine to relate; future sessions are ignored; nothing known is the general entry', () => {
    expect(comparisonEntry([session('f', '2026-11-17', null, 'Sesión libre')], '2026-11-17')).toMatchObject({ routineId: null, previous: 'anterior' });
    expect(comparisonEntry([session('x', '2026-11-18', PULL, 'PULL')], '2026-11-17')).toEqual({ kind: 'general' });
    expect(comparisonEntry([], '2026-11-17')).toEqual({ kind: 'general' });
  });
});
