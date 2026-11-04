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
  it('preserves exact wire body, session and microsecond CAS via the authenticated API', async () => {
    const fetcher = jest.fn<typeof fetch>().mockResolvedValue(response(200, state)); const api = port(fetcher);
    expect((await api.read()).status).toBe('ok');
    const body = { contractVersion: 'training-feelings/1' as const, operation: 'finish' as const, expectedRevision: 2, patch: {}, idempotencyKey: 'finish:1', metadata: {}, expectedSessionUpdatedAt: state.sessionUpdatedAt };
    await api.write(body);
    expect(fetcher.mock.calls[1][0]).toBe(`http://127.0.0.1:3007/api/mobile/v1/training/sessions/${sid}/finish-with-feelings`);
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'POST', body: JSON.stringify(body) });
  });
  it('recognizes FEELINGS_CHANGED as a conflict and never automatically retries mutations', async () => {
    const fetcher = jest.fn<typeof fetch>().mockResolvedValue(response(409, { error: 'FEELINGS_CHANGED', message: 'Revisá lo guardado' }));
    const result = await port(fetcher).write({ contractVersion: 'training-feelings/1', operation: 'save', expectedRevision: 0, patch: {}, idempotencyKey: 'save:1' });
    expect(result.status).toBe('conflict'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not present malformed or mismatched reads as empty successes', async () => {
    const fetcher = jest.fn<typeof fetch>().mockResolvedValueOnce(response(200, {})).mockResolvedValueOnce(response(200, { ...state, sessionId: '93670000-0000-4000-8000-000000000011' }));
    const api = port(fetcher); expect((await api.read()).status).toBe('unavailable'); expect((await api.read()).status).toBe('unavailable');
  });
});
