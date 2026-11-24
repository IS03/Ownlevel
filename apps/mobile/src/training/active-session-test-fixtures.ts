import type { SessionDetailDto, SessionExerciseDto, SessionExercisePayloadDto, SessionFinishedDto, SessionFinishMetadata } from '@/api/active-session';
export const SESSION_ID = '11111111-1111-4111-8111-111111111111';
export const EXERCISE_ID = '22222222-2222-4222-8222-222222222222';
export const SECOND_ID = '33333333-3333-4333-8333-333333333333';
export const VERSION = '2026-09-30T12:00:00.123456+00:00';
export const NEXT_VERSION = '2026-09-30T12:00:01.123457+00:00';
export function testPayload(notes = ''): SessionExercisePayloadDto {
  return { isCompleted: false, decision: 'maintain', decisionNote: '', applyToRoutine: false, notes,
    sets: [{ setNumber: 1, targetReps: 8, targetWeightKg: 40, targetRir: 2, actualReps: 8, actualWeightKg: 40, isCompleted: false, notes: null }] };
}
export function testExercise(id = EXERCISE_ID, order = 1): SessionExerciseDto {
  return { id, exerciseId: id, routineExerciseId: null, order, nameSnapshot: order === 1 ? 'PRESS' : 'ROW',
    muscleGroupSnapshot: 'pecho', muscleGroupLabelSnapshot: null, implementSnapshot: 'Barra', weightModeSnapshot: 'Peso total',
    restMinSecondsSnapshot: 90, restMaxSecondsSnapshot: 120, nextAdjustmentSnapshot: 'increase_reps', nextAdjustmentNoteSnapshot: null,
    updatedAt: VERSION, payload: testPayload() };
}
export function testDetail(): SessionDetailDto {
  return { session: { id: SESSION_ID, routineId: null, routineNameSnapshot: null, name: 'Sesión libre', status: 'in_progress', logDate: '2026-09-30',
    startedAt: VERSION, endedAt: null, updatedAt: VERSION, routineColor: null,
    metadata: { energyLevel: null, performanceLevel: null, painLevel: null, painNote: null, treadmillMinutes: null, treadmillDistanceKm: null, treadmillSpeedKmh: null, treadmillInclinePercent: null, notes: null } },
    exercises: [testExercise(), testExercise(SECOND_ID, 2)], quickHistory: { status: 'ok', data: { [EXERCISE_ID]: [], [SECOND_ID]: [] } }, loadPatterns: { status: 'unavailable' } };
}
export const FINISHED_VERSION = '2026-09-30T13:05:00.654321+00:00';
export function testFinished(metadata: SessionFinishMetadata = { energyLevel: null, performanceLevel: null, painLevel: null, notes: null }): SessionFinishedDto {
  return { status: 'finished', sessionId: SESSION_ID, sessionStatus: 'completed', name: 'Sesión libre', routineId: null, logDate: '2026-09-30',
    startedAt: VERSION, endedAt: '2026-09-30T13:05:00.000000+00:00', sessionUpdatedAt: FINISHED_VERSION, metadata,
    exerciseCount: 2, completedExerciseCount: 1, completedSetCount: 1 };
}
