import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { exerciseSetLabel, fetchLastExercise } from './exercise-detail-model';
import type { MobileApiClient } from '@/api/client';
const mockHistory = jest.fn<(...args: unknown[]) => Promise<unknown>>(), mockSession = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('@/api/training-history', () => ({ fetchTrainingExerciseHistory: (...args: unknown[]) => mockHistory(...args) }));
jest.mock('@/api/active-session', () => ({ fetchSessionDetail: (...args: unknown[]) => mockSession(...args) }));
const client = {} as MobileApiClient, meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' }, latest = { sessionId: 'session', logDate: '2026-10-13', routineName: 'PUSH' };
beforeEach(() => { mockHistory.mockReset(); mockSession.mockReset(); });
describe('exercise last performance', () => {
  it('distinguishes true empty from unavailable without fetching invented sets', async () => {
    mockHistory.mockResolvedValueOnce({ status: 'ok', data: { latest: null }, meta }).mockResolvedValueOnce({ status: 'unavailable', reason: 'network', meta });
    expect(await fetchLastExercise(client, 'exercise')).toMatchObject({ status: 'ok', data: { latest: null, sets: [] } });
    expect(await fetchLastExercise(client, 'exercise')).toMatchObject({ status: 'unavailable' }); expect(mockSession).not.toHaveBeenCalled();
  });
  it('reads actual completed sets with the historical weight mode and no guessed defaults', async () => {
    mockHistory.mockResolvedValue({ status: 'ok', data: { latest }, meta });
    mockSession.mockResolvedValue({ status: 'ok', data: { session: { status: 'completed' }, exercises: [{ exerciseId: 'exercise', weightModeSnapshot: 'Lingotes (no kg)', payload: { sets: [
      { setNumber: 1, actualWeightKg: 0, actualReps: null, isCompleted: true }, { setNumber: 2, actualWeightKg: 10, actualReps: 12, isCompleted: false }] } }] }, meta });
    expect(await fetchLastExercise(client, 'exercise')).toMatchObject({ status: 'ok', data: { weightMode: 'Lingotes (no kg)', sets: [{ actualWeightKg: 0, actualReps: null }] } });
    mockSession.mockResolvedValue({ status: 'unavailable', reason: 'network', meta }); expect(await fetchLastExercise(client, 'exercise')).toMatchObject({ status: 'unavailable' });
  });
  it.each([
    [null, null, 'Peso total', '—'], [0, 12, 'Peso total', '0 kg × 12'], [55, 12, 'Total con barra', '55 kg × 12'],
    [3, 10, 'Lingotes (no kg)', '3 placas × 10'], [45, null, 'Tiempo (segundos)', '45 s'], [0, 10, 'Peso corporal', '10 reps'], [null, 0, null, '0 reps'],
  ])('formats missing/zero and mode (%s, %s, %s)', (actualWeightKg, actualReps, mode, label) => {
    expect(exerciseSetLabel({ actualWeightKg: actualWeightKg as number | null, actualReps: actualReps as number | null }, mode as string | null)).toBe(label);
  });
});
