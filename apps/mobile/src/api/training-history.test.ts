import { describe, expect, it, jest } from '@jest/globals';
import { createMobileApiClient } from './client';
import {
  correctSession, discardSession, fetchTrainingDay, fetchTrainingExerciseHistory, fetchTrainingHistory, fetchTrainingHistoryExercises,
  parseSessionCorrected, parseTrainingDay, parseTrainingExerciseHistory, parseTrainingHistoryExercises, parseTrainingHistoryPage,
  type SessionCorrectionInput,
} from './training-history';

const sessionId = '34300000-0000-4000-8000-000000000001';
const otherId = '34300000-0000-4000-8000-000000000002';
const exerciseId = '34300000-0000-4000-8000-000000000003';
const ts = '2026-10-01T12:00:00.123456+00:00', later = '2026-10-01T13:05:00.654321+00:00';
const session = { id: sessionId, routineId: null, routineName: 'PUSH', routineColor: 'violet', logDate: '2026-10-01', startedAt: ts,
  endedAt: later, durationMilliseconds: 3_900_000, exercisesCompleted: 2, completedSets: 6, volumeKg: null };
const metadata = { energyLevel: 4, performanceLevel: null, painLevel: 0, painNote: 'rodilla', treadmillMinutes: 10, treadmillDistanceKm: 1.5,
  treadmillSpeedKmh: null, treadmillInclinePercent: null, notes: null };
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

describe('M3.4-3 history read contracts', () => {
  it('parses history pages strictly, keeping missing volume/duration as null (never 0)', () => {
    expect(parseTrainingHistoryPage({ sessions: [session], nextCursor: 'abc_DEF-1' })).toEqual({ sessions: [session], nextCursor: 'abc_DEF-1' });
    expect(parseTrainingHistoryPage({ sessions: [{ ...session, durationMilliseconds: null }], nextCursor: null })?.sessions[0].durationMilliseconds).toBeNull();
    for (const invalid of [{ sessions: [{ ...session, extra: 1 }], nextCursor: null }, { sessions: [{ ...session, completedSets: -1 }], nextCursor: null },
      { sessions: [{ ...session, routineColor: {} }], nextCursor: null }, { sessions: [session], nextCursor: 'bad cursor!' }, { sessions: {}, nextCursor: null }]) {
      expect(parseTrainingHistoryPage(invalid)).toBeUndefined();
    }
  });
  it('rejects a day response for another date or containing sessions from another day', () => {
    const day = { date: '2026-10-01', sessions: [session], summary: { sessionCount: 1, exercisesCompleted: 2, completedSets: 6, durationMilliseconds: null, volumeKg: null } };
    expect(parseTrainingDay(day, '2026-10-01')).toEqual(day);
    expect(parseTrainingDay(day, '2026-10-02')).toBeUndefined();
    expect(parseTrainingDay({ ...day, sessions: [{ ...session, logDate: '2026-09-30' }] }, '2026-10-01')).toBeUndefined();
    expect(parseTrainingDay({ ...day, sessions: [], summary: { ...day.summary, sessionCount: 0 } }, '2026-10-01')?.sessions).toEqual([]);
  });
  it('parses exercise directory and detail, rejecting a detail for another exercise', () => {
    const row = { id: exerciseId, name: 'Press', muscleGroup: 'pecho', muscleLabel: null, implement: null, weightMode: null, lastDate: '2026-10-01',
      sessions: 3, lastMark: { weightKg: 60, reps: 5 }, bestMark: null };
    expect(parseTrainingHistoryExercises({ exercises: [row] })).toEqual([row]);
    expect(parseTrainingHistoryExercises({ exercises: [{ ...row, lastMark: { weightKg: -1, reps: 5 } }] })).toBeUndefined();
    const entry = { sessionId, logDate: '2026-10-01', routineName: 'PUSH', mark: { weightKg: null, reps: 12 }, completedSets: 3, rirValues: [2, 1] };
    const detail = { exercise: { id: exerciseId, name: 'Press', muscleGroup: null, muscleLabel: null, implement: null, weightMode: null },
      latest: entry, best: null, sessions: [entry], hasMore: false };
    expect(parseTrainingExerciseHistory(detail, exerciseId)).toEqual(detail);
    expect(parseTrainingExerciseHistory(detail, otherId)).toBeUndefined();
    expect(parseTrainingExerciseHistory({ ...detail, sessions: [{ ...entry, rirValues: ['x'] }] }, exerciseId)).toBeUndefined();
  });
  it('reads the documented endpoints with the opaque cursor and bounded limit', async () => {
    const fetch = jest.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(200, { sessions: [], nextCursor: null }))
      .mockResolvedValueOnce(response(200, { date: '2026-10-01', sessions: [], summary: { sessionCount: 0, exercisesCompleted: 0, completedSets: 0, durationMilliseconds: null, volumeKg: null } }))
      .mockResolvedValueOnce(response(200, { exercises: [] }))
      .mockResolvedValueOnce(response(404, { error: 'NOT_FOUND', message: 'x' }));
    const api = client(fetch);
    expect(await fetchTrainingHistory(api, 'cur_1')).toMatchObject({ status: 'ok' });
    expect(await fetchTrainingDay(api, '2026-10-01')).toMatchObject({ status: 'ok' });
    expect(await fetchTrainingHistoryExercises(api)).toMatchObject({ status: 'ok', data: [] });
    expect(await fetchTrainingExerciseHistory(api, exerciseId, 40)).toMatchObject({ status: 'unavailable' });
    expect(fetch.mock.calls.map(([url]) => String(url).replace('https://example.test', ''))).toEqual([
      '/api/mobile/v1/training/history?limit=20&cursor=cur_1', '/api/mobile/v1/training/days/2026-10-01',
      '/api/mobile/v1/training/history/exercises', `/api/mobile/v1/training/history/exercises/${exerciseId}?limit=40`]);
  });
});

describe('M3.4-3 correction and discard contracts', () => {
  const input: SessionCorrectionInput = { expectedSessionUpdatedAt: ts, metadata, idempotencyKey: 'correct:1',
    exercises: [{ sessionExerciseId: exerciseId, expectedUpdatedAt: ts, notes: null, sets: [{ setNumber: 1, actualReps: 0, actualWeightKg: null, notes: null }] }] };
  const corrected = { status: 'corrected', sessionId, sessionUpdatedAt: later, metadata,
    exercises: [{ id: exerciseId, updatedAt: later, notes: null, sets: input.exercises[0].sets }] };
  it('PUTs the full correction once and accepts only the corrected server truth for this session', async () => {
    expect(parseSessionCorrected(corrected)).toEqual(corrected);
    expect(parseSessionCorrected({ ...corrected, metadata: { ...metadata, painLevel: 11 } })).toBeUndefined();
    const fetch = jest.fn<typeof globalThis.fetch>().mockResolvedValue(response(200, corrected));
    expect(await correctSession(client(fetch), sessionId, input)).toMatchObject({ status: 'ok', data: corrected });
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe(`https://example.test/api/mobile/v1/training/sessions/${sessionId}/correction`);
    expect(init?.method).toBe('PUT'); expect(JSON.parse(String(init?.body))).toEqual(input); expect(fetch).toHaveBeenCalledTimes(1);
    const other = jest.fn<typeof globalThis.fetch>().mockResolvedValue(response(200, { ...corrected, sessionId: otherId }));
    expect(await correctSession(client(other), sessionId, input)).toMatchObject({ status: 'unavailable' });
  });
  it('keeps CAS conflicts explicit and never retries a lost write', async () => {
    for (const error of ['SESSION_CHANGED', 'SESSION_EXERCISE_CHANGED', 'SESSION_DISCARDED', 'SESSION_NOT_COMPLETED']) {
      const fetch = jest.fn<typeof globalThis.fetch>().mockResolvedValue(response(409, { error, message: 'conflict' }));
      expect(await correctSession(client(fetch), sessionId, input)).toMatchObject({ status: 'conflict', code: error });
    }
    const lost = jest.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('Network request failed'));
    expect(await discardSession(client(lost), sessionId, 'discard:1')).toMatchObject({ status: 'unavailable' });
    expect(lost).toHaveBeenCalledTimes(1);
  });
  it('POSTs discard with the caller key', async () => {
    const fetch = jest.fn<typeof globalThis.fetch>().mockResolvedValue(response(200, { status: 'discarded', sessionId, sessionUpdatedAt: later }));
    expect(await discardSession(client(fetch), sessionId, 'discard:1')).toMatchObject({ status: 'ok', data: { status: 'discarded', sessionId } });
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe(`https://example.test/api/mobile/v1/training/sessions/${sessionId}/discard`);
    expect(init?.method).toBe('POST'); expect(JSON.parse(String(init?.body))).toEqual({ idempotencyKey: 'discard:1' });
  });
});

it.each(['sand', 'stone', 'slate', 'graphite', 'future-color'])('preserves completed session and missing metrics with unknown color %s', routineColor => {
  const parsed = parseTrainingHistoryPage({ sessions: [{ ...session, routineColor }], nextCursor: null });
  expect(parsed).toEqual({ sessions: [{ ...session, routineColor: null }], nextCursor: null });
});
