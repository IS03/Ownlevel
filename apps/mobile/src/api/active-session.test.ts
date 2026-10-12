import { describe, expect, it, jest } from '@jest/globals';
import { createMobileApiClient } from './client';
import {
  parseSessionDetail, parseSessionExerciseSync, parseSessionExercisePayload,
  fetchSessionDetail, fetchSessionExerciseSync, saveSessionExercise,
  addSessionExercise, removeSessionExercise, cancelSession,
  canonicalSessionExercisePayload, finishSession, parseSessionFinished,
  type SessionDetailDto, type SessionExercisePayloadDto, type SessionFinishedDto,
} from './active-session';

const sessionId = '33300000-0000-4000-8000-000000000001';
const exerciseId = '33300000-0000-4000-8000-000000000002';
const relationId = '33300000-0000-4000-8000-000000000003';
const timestamp = '2026-09-29T12:00:00.123456+00:00';
const payload: SessionExercisePayloadDto = {
  isCompleted: true, decision: 'maintain', decisionNote: '', applyToRoutine: false, notes: 'session note',
  sets: [{ setNumber: 1, targetReps: 8, targetWeightKg: 0, targetRir: 0,
    actualReps: 0, actualWeightKg: null, isCompleted: true, notes: null }],
};
const detail: SessionDetailDto = {
  session: {
    id: sessionId, routineId: null, routineNameSnapshot: 'OLD ROUTINE', name: 'SESSION', status: 'in_progress',
    logDate: '2026-09-29', startedAt: timestamp, endedAt: null, updatedAt: timestamp, routineColor: null,
    metadata: { energyLevel: null, performanceLevel: null, painLevel: null, painNote: null,
      treadmillMinutes: null, treadmillDistanceKm: null, treadmillSpeedKmh: null, treadmillInclinePercent: null, notes: null },
  },
  exercises: [{ id: relationId, exerciseId, routineExerciseId: null, order: 3, nameSnapshot: 'OLD NAME',
    muscleGroupSnapshot: 'pecho', muscleGroupLabelSnapshot: null, implementSnapshot: 'OLD IMPLEMENT', weightModeSnapshot: null,
    restMinSecondsSnapshot: 90, restMaxSecondsSnapshot: 120, nextAdjustmentSnapshot: 'increase_reps',
    nextAdjustmentNoteSnapshot: null, updatedAt: timestamp, payload }],
  quickHistory: { status: 'ok', data: { [exerciseId]: [] } },
};
function response(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) } as Response;
}
function client(fetchImplementation: typeof fetch) {
  return createMobileApiClient({
    auth: { getAccessToken: async () => ({ status: 'ok', accessToken: 'token' }), revalidateAfterUnauthorized: async () => ({ status: 'invalid' }) },
    config: { appEnv: 'development', baseUrl: 'https://example.test', host: 'example.test', timeoutMs: 1000 },
    fetchImplementation, runtime: { appVersion: '1', build: '1', platform: 'ios' }, telemetry: { record: () => undefined },
  });
}
describe('M3.3B native session contracts (no UI)', () => {
  it('preserves snapshots, full per-exercise CAS and missing != zero', () => {
    expect(parseSessionDetail(detail)).toEqual(detail);
    expect(parseSessionDetail(detail)?.exercises[0].updatedAt).toBe(timestamp);
    expect(parseSessionDetail(detail)?.exercises[0].payload.sets[0]).toMatchObject({ actualReps: 0, actualWeightKg: null, targetRir: 0 });
    const partial = { ...payload, sets: [...payload.sets, { ...payload.sets[0], setNumber: 2, isCompleted: false }] };
    expect(parseSessionExercisePayload(partial)?.isCompleted).toBe(true);
    expect(partial.sets.every((set) => set.isCompleted)).toBe(false);
  });
  it('canonicalizes drafts/attempts/read-back consistently with SQL text normalization', async () => {
    const raw = { ...payload, decision: 'custom' as const, decisionNote: ' reminder ', sets: [{ ...payload.sets[0], notes: '' }] };
    const canonical = { ...raw, decisionNote: 'reminder', sets: [{ ...raw.sets[0], notes: null }] };
    expect(canonicalSessionExercisePayload(raw)).toEqual(canonical);
    expect(parseSessionExercisePayload(canonical)).toEqual(canonical);
    const fetch = jest.fn<typeof globalThis.fetch>().mockResolvedValue(response(200, { sessionExerciseId: relationId, updatedAt: timestamp }));
    await saveSessionExercise(client(fetch), sessionId, relationId, { expectedUpdatedAt: timestamp, payload: raw });
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string).payload).toEqual(canonical);
  });
  it('separates empty/unavailable history and tolerates a broken auxiliary resource', () => {
    expect(parseSessionDetail(detail)?.quickHistory).toEqual({ status: 'ok', data: { [exerciseId]: [] } });
    expect(parseSessionDetail({ ...detail, quickHistory: { status: 'unavailable' } })?.quickHistory).toEqual({ status: 'unavailable' });
    expect(parseSessionDetail({ ...detail, quickHistory: { status: 'ok', data: { [exerciseId]: [{}] } } })?.quickHistory).toEqual({ status: 'unavailable' });
    expect(parseSessionDetail({ ...detail, quickHistory: { status: 'ok', data: { [exerciseId]: Array(7).fill({}) } } })?.quickHistory).toEqual({ status: 'unavailable' });
  });
  it('parses contextual completed snapshots without turning absent recorded reps into zero', () => {
    const historical = { sessionId, logDate: '2026-09-28', completedAt: timestamp, routineId: null,
      routineName: 'OLD', decision: 'increase_weight', sets: [{ ...payload.sets[0], actualReps: null }] };
    expect(parseSessionDetail({ ...detail, quickHistory: { status: 'ok', data: { [exerciseId]: [historical] } } })?.quickHistory)
      .toEqual({ status: 'ok', data: { [exerciseId]: [historical] } });
  });
  it('rejects corrupt operational fields and recursive surprises', () => {
    for (const invalid of [
      { ...detail, session: { ...detail.session, status: 'unknown' } },
      { ...detail, session: { ...detail.session, userId: 'unexpected' } },
      { ...detail, session: { ...detail.session, startedAt: '2026-02-30T12:00:00Z' } },
      { ...detail, session: { ...detail.session, updatedAt: 'bad' } },
      { ...detail, exercises: [detail.exercises[0], detail.exercises[0]] },
      { ...detail, exercises: [{ ...detail.exercises[0], payload: { ...payload, isCompleted: false } }] },
      { ...detail, exercises: [{ ...detail.exercises[0], payload: { ...payload, sets: [{ ...payload.sets[0], actualReps: '8' }] } }] },
      { ...detail, exercises: [{ ...detail.exercises[0], payload: { ...payload, sets: [{ ...payload.sets[0], actualRir: 2 }] } }] },
    ]) expect(parseSessionDetail(invalid)).toBeUndefined();
  });
  it('has explicit closed/removed sync states and never infers them from invalid data', () => {
    expect(parseSessionExerciseSync({ status: 'active', updatedAt: timestamp, payload })).toEqual({ status: 'active', updatedAt: timestamp, payload });
    expect(parseSessionExerciseSync({ status: 'removed' })).toEqual({ status: 'removed' });
    expect(parseSessionExerciseSync({ status: 'session_closed', sessionStatus: 'completed' })).toEqual({ status: 'session_closed', sessionStatus: 'completed' });
    expect(parseSessionExerciseSync({ status: 'session_closed', sessionStatus: 'in_progress' })).toBeUndefined();
    expect(parseSessionExerciseSync({ status: 'active', updatedAt: timestamp, payload: null })).toBeUndefined();
  });
  it('preserves a real 404 for session detail, unlike generic read()', async () => {
    const fetch = jest.fn<typeof globalThis.fetch>().mockResolvedValue(response(404, { error: 'NOT_FOUND' }));
    expect(await fetchSessionDetail(client(fetch), sessionId)).toMatchObject({ status: 'not_found', meta: { httpStatus: 404 } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('recognizes all stable active-session conflicts without parsing SQL strings', async () => {
    for (const error of ['SESSION_EXERCISE_CHANGED', 'SESSION_CLOSED', 'SESSION_EXERCISE_REMOVED', 'SESSION_EXERCISE_ALREADY_EXISTS', 'IDEMPOTENCY_KEY_REUSED']) {
      const fetch = jest.fn<typeof globalThis.fetch>().mockResolvedValue(response(409, { error, message: 'domain conflict' }));
      expect(await saveSessionExercise(client(fetch), sessionId, relationId, { expectedUpdatedAt: timestamp, payload }))
        .toMatchObject({ status: 'conflict', code: error });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });
  it('does not repeat response-lost saves and permits an explicit read-back to prove server truth', async () => {
    const fetch = jest.fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce(response(200, { status: 'active', updatedAt: timestamp, payload }));
    const api = client(fetch);
    expect(await saveSessionExercise(api, sessionId, relationId, { expectedUpdatedAt: timestamp, payload })).toMatchObject({ status: 'unavailable', reason: 'network' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await fetchSessionExerciseSync(api, sessionId, relationId)).toMatchObject({ status: 'ok', data: { status: 'active', updatedAt: timestamp, payload } });
    expect(fetch).toHaveBeenCalledTimes(2);
    const body = JSON.parse(fetch.mock.calls[0][1]?.body as string);
    expect(body.expectedUpdatedAt).toBe(timestamp);
  });
  it('sends structural intents once and preserves keys/versions for caller-controlled replay', async () => {
    const fetch = jest.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(201, { status: 'added', sessionId, sessionExerciseId: relationId, exerciseId }))
      .mockResolvedValueOnce(response(200, { status: 'removed', sessionId, sessionExerciseId: relationId }))
      .mockResolvedValueOnce(response(200, { status: 'cancelled', sessionId }));
    const api = client(fetch);
    expect(await addSessionExercise(api, sessionId, { operation: 'add_existing', exerciseId, idempotencyKey: 'add:1' })).toMatchObject({ status: 'ok' });
    expect(await removeSessionExercise(api, sessionId, relationId, { expectedUpdatedAt: timestamp, idempotencyKey: 'remove:1' })).toMatchObject({ status: 'ok' });
    expect(await cancelSession(api, sessionId, 'cancel:1')).toMatchObject({ status: 'ok' });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[1][1]?.method).toBe('DELETE');
    expect(JSON.parse(fetch.mock.calls[1][1]?.body as string)).toEqual({ expectedUpdatedAt: timestamp, idempotencyKey: 'remove:1' });
    expect(JSON.parse(fetch.mock.calls[2][1]?.body as string)).toEqual({ idempotencyKey: 'cancel:1' });
  });
  it('does not retry structural errors and rejects a response for a different resource', async () => {
    const fetch = jest.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response(503, { error: 'DATA_UNAVAILABLE' }))
      .mockResolvedValueOnce(response(200, { ...detail, session: { ...detail.session, id: exerciseId } }));
    const api = client(fetch);
    expect(await cancelSession(api, sessionId, 'cancel:1')).toMatchObject({ status: 'unavailable' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await fetchSessionDetail(api, sessionId)).toMatchObject({ status: 'unavailable', reason: 'invalid_response' });
  });
});

describe('M3.4-2 finish contract (no UI)', () => {
  const finished: SessionFinishedDto = { status: 'finished', sessionId, sessionStatus: 'completed', name: 'SESSION', routineId: null,
    logDate: '2026-09-29', startedAt: timestamp, endedAt: '2026-09-29T13:00:00.000000+00:00', sessionUpdatedAt: '2026-09-29T13:00:00.123456+00:00',
    metadata: { energyLevel: 4, performanceLevel: null, painLevel: 0, notes: null }, exerciseCount: 2, completedExerciseCount: 1, completedSetCount: 3 };
  const body = { metadata: { energyLevel: 4, performanceLevel: null, painLevel: 0, notes: null }, idempotencyKey: 'finish:1' };
  it('accepts exactly the server truth shape, keeping null distinct from 0', () => {
    expect(parseSessionFinished(finished)).toEqual(finished);
    for (const invalid of [{ ...finished, extra: 1 }, { ...finished, sessionStatus: 'discarded' }, { ...finished, completedSetCount: -1 },
      { ...finished, endedAt: 'later' }, { ...finished, metadata: { ...finished.metadata, painLevel: 11 } },
      { ...finished, metadata: { ...finished.metadata, energyLevel: 0 } }, { ...finished, metadata: { ...finished.metadata, painNote: 'x' } }]) {
      expect(parseSessionFinished(invalid)).toBeUndefined();
    }
  });
  it('posts once with the caller key and rejects a response for another session', async () => {
    const fetch = jest.fn<typeof globalThis.fetch>().mockResolvedValue(response(200, finished));
    expect(await finishSession(client(fetch), sessionId, body)).toMatchObject({ status: 'ok', data: finished });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe(`https://example.test/api/mobile/v1/training/sessions/${sessionId}/finish`);
    expect(init?.method).toBe('POST'); expect(JSON.parse(String(init?.body))).toEqual(body);
    const other = jest.fn<typeof globalThis.fetch>().mockResolvedValue(response(200, { ...finished, sessionId: exerciseId }));
    expect(await finishSession(client(other), sessionId, body)).toMatchObject({ status: 'unavailable' });
  });
  it('maps definitive finish conflicts instead of treating them as an unknown outcome', async () => {
    for (const error of ['NO_COMPLETED_SETS', 'SESSION_CLOSED', 'IDEMPOTENCY_KEY_REUSED', 'SESSION_NOT_COMPLETED', 'SESSION_DISCARDED']) {
      const fetch = jest.fn<typeof globalThis.fetch>().mockResolvedValue(response(409, { error, message: 'domain conflict' }));
      expect(await finishSession(client(fetch), sessionId, body)).toMatchObject({ status: 'conflict', code: error });
    }
    const unknown = jest.fn<typeof globalThis.fetch>().mockResolvedValue(response(409, { error: 'SOMETHING_NEW' }));
    expect(await finishSession(client(unknown), sessionId, body)).toMatchObject({ status: 'unavailable' });
  });
});

it.each(['sand', 'stone', 'slate', 'graphite', 'future-color'])('preserves active-session truth with new or unknown color %s', routineColor => {
  const source = { ...detail, session: { ...detail.session, routineColor } };
  expect(parseSessionDetail(source)).toEqual({ ...detail, session: { ...detail.session, routineColor: routineColor === 'future-color' ? null : routineColor } });
  expect(source.session.routineColor).toBe(routineColor);
});
