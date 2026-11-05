import { describe, expect, it, jest } from '@jest/globals';
import { exerciseConfigurationApi } from './training-exercise-configuration';
import { createMobileApiClient } from './client';
const sid = '93671000-0000-4000-8000-000000000021', press = '93671000-0000-4000-8000-000000000031';
const state = { contractVersion: 'training-exercise-configuration/1', sessionId: sid, sessionStatus: 'in_progress', items: [] };
const response = (status: number, body: unknown) => ({ status, ok: status < 300, text: async () => JSON.stringify(body) }) as Response;
const body = { contractVersion: 'training-exercise-configuration/1' as const, sessionExerciseId: press, expectedRevision: 0,
  value: { kind: 'recorded' as const, label: 'Agarre neutro', source: 'entered' as const, repeatedFrom: null }, idempotencyKey: 'variant:1' };
function port(fetcher: typeof fetch) {
  return exerciseConfigurationApi(createMobileApiClient({ auth: { getAccessToken: async () => ({ status: 'ok', accessToken: 'synthetic' }), revalidateAfterUnauthorized: async () => ({ status: 'invalid' }) },
    config: { appEnv: 'development', baseUrl: 'http://127.0.0.1:3007', host: '127.0.0.1', timeoutMs: 1000 }, fetchImplementation: fetcher,
    runtime: { appVersion: '1', build: '1', platform: 'ios' }, telemetry: { record: () => undefined } }), sid);
}
describe('exercise configuration Mobile API', () => {
  it('sends the exact frozen body again after a lost response', async () => {
    const fetcher = jest.fn<typeof fetch>().mockRejectedValueOnce(Error('lost response')).mockResolvedValue(response(200, state));
    const api = port(fetcher);
    expect((await api.write(body)).status).toBe('unavailable');
    expect((await api.write(body)).status).toBe('ok');
    expect(fetcher.mock.calls[1][0]).toBe(`http://127.0.0.1:3007/api/mobile/v1/training/sessions/${sid}/exercise-configurations`);
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'PATCH', body: JSON.stringify(body) });
    expect(fetcher.mock.calls[1][1]?.body).toBe(fetcher.mock.calls[0][1]?.body);
  });
  it.each(['CONFIGURATION_CHANGED', 'REPEATED_CONFIGURATION_MISMATCH', 'IDEMPOTENCY_KEY_REUSED', 'SESSION_DISCARDED'])('reads %s as a conflict, never as an unknown outcome', async code => {
    const fetcher = jest.fn<typeof fetch>().mockResolvedValue(response(409, { error: code, message: 'Revisá lo guardado' }));
    expect((await port(fetcher).write(body)).status).toBe('conflict'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not present a malformed or foreign read as an empty one', async () => {
    const fetcher = jest.fn<typeof fetch>().mockResolvedValueOnce(response(200, {})).mockResolvedValueOnce(response(200, { ...state, sessionId: press }));
    const api = port(fetcher); expect((await api.read()).status).toBe('unavailable'); expect((await api.read()).status).toBe('unavailable');
  });
});
