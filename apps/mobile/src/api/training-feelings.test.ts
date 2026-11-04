import { describe, expect, it, jest } from '@jest/globals';
import { trainingFeelingsApi } from './training-feelings';
import { createMobileApiClient } from './client';
const sid = '93670000-0000-4000-8000-000000000010';
const state = { contractVersion: 'training-feelings/1', sessionId: sid, sessionStatus: 'in_progress', sessionUpdatedAt: '2026-11-04T10:00:00.123456Z', endedAt: null, revision: 0, values: {} };
const response = (status: number, body: unknown) => ({ status, ok: status < 300, text: async () => JSON.stringify(body) }) as Response;
function port(fetcher: typeof fetch) {
  return trainingFeelingsApi(createMobileApiClient({ auth: { getAccessToken: async () => ({ status: 'ok', accessToken: 'synthetic' }), revalidateAfterUnauthorized: async () => ({ status: 'invalid' }) },
    config: { appEnv: 'development', baseUrl: 'http://127.0.0.1:3007', host: '127.0.0.1', timeoutMs: 1000 }, fetchImplementation: fetcher,
    runtime: { appVersion: '1', build: '1', platform: 'ios' }, telemetry: { record: () => undefined } }), sid);
}
describe('feelings Mobile API adoption', () => {
  it('negotiates an immutable routine receipt and replays the same wire request after a lost response', async () => {
    const feelings = { ...state, sessionStatus: 'completed', endedAt: state.sessionUpdatedAt };
    const finished = { status: 'finished', sessionId: sid, sessionStatus: 'completed', name: 'ORIGINAL', routineId: sid, logDate: '2026-11-04', startedAt: state.sessionUpdatedAt,
      endedAt: state.sessionUpdatedAt, sessionUpdatedAt: state.sessionUpdatedAt, metadata: { energyLevel: 2, performanceLevel: null, painLevel: 0, notes: 'original' },
      exerciseCount: 1, completedExerciseCount: 1, completedSetCount: 1, routineAdditions: [{ sessionExerciseId: sid, exerciseId: sid, name: 'ORIGINAL PRESS', outcome: 'added' }] };
    const fetcher = jest.fn<typeof fetch>().mockRejectedValueOnce(Error('lost response')).mockResolvedValue(response(200, { contractVersion: 'training-feelings-finish/2', feelings, finished }));
    const api = port(fetcher), wire = { contractVersion: 'training-feelings/1' as const, operation: 'finish' as const, expectedRevision: 0, patch: {}, idempotencyKey: 'same:1', metadata: {}, expectedSessionUpdatedAt: state.sessionUpdatedAt };
    const body = { ...wire, receiptVersion: 'training-feelings-finish/2' as const };
    expect((await api.write(body)).status).toBe('unavailable');
    expect(await api.write(body)).toMatchObject({ status: 'ok', data: feelings, finished });
    expect(fetcher).toHaveBeenCalledTimes(2); expect(fetcher.mock.calls[1][0]).toBe(`http://127.0.0.1:3007/api/mobile/v1/training/sessions/${sid}/finish-with-feelings?routineAdditions=1`);
    expect(fetcher.mock.calls[0][1]?.body).toBe(JSON.stringify(wire)); expect(fetcher.mock.calls[1][1]?.body).toBe(fetcher.mock.calls[0][1]?.body);
  });
  it('does not fall back to another finish if the richer receipt is unavailable', async () => {
    const fetcher = jest.fn<typeof fetch>().mockResolvedValue(response(200, { ...state, sessionStatus: 'completed', endedAt: state.sessionUpdatedAt }));
    const result = await port(fetcher).write({ contractVersion: 'training-feelings/1', operation: 'finish', receiptVersion: 'training-feelings-finish/2', expectedRevision: 0, patch: {}, idempotencyKey: 'same:2', metadata: {}, expectedSessionUpdatedAt: state.sessionUpdatedAt });
    expect(result.status).toBe('unavailable'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('preserves exact wire body, session and microsecond CAS via the authenticated API', async () => {
    const fetcher = jest.fn<typeof fetch>().mockResolvedValue(response(200, state)); const api = port(fetcher);
    expect((await api.read()).status).toBe('ok');
    const body = { contractVersion: 'training-feelings/1' as const, operation: 'finish' as const, expectedRevision: 2, patch: {}, idempotencyKey: 'finish:1', metadata: {}, expectedSessionUpdatedAt: state.sessionUpdatedAt };
    await api.write(body);
    expect(fetcher.mock.calls[1][0]).toBe(`http://127.0.0.1:3007/api/mobile/v1/training/sessions/${sid}/finish-with-feelings`);
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'POST', body: JSON.stringify(body) });
  });
  it.each(['FEELINGS_CHANGED', 'FEELINGS_RECEIPT_VERSION_UNAVAILABLE'])('recognizes %s as a conflict and never automatically retries mutations', async code => {
    const fetcher = jest.fn<typeof fetch>().mockResolvedValue(response(409, { error: code, message: 'Revisá lo guardado' }));
    const result = await port(fetcher).write({ contractVersion: 'training-feelings/1', operation: 'save', expectedRevision: 0, patch: {}, idempotencyKey: 'save:1' });
    expect(result.status).toBe('conflict'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not present malformed or mismatched reads as empty successes', async () => {
    const fetcher = jest.fn<typeof fetch>().mockResolvedValueOnce(response(200, {})).mockResolvedValueOnce(response(200, { ...state, sessionId: '93670000-0000-4000-8000-000000000011' }));
    const api = port(fetcher); expect((await api.read()).status).toBe('unavailable'); expect((await api.read()).status).toBe('unavailable');
  });
});
