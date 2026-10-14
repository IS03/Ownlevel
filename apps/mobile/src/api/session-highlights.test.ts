import { expect, it, jest } from '@jest/globals';
import { createMobileApiClient } from './client';
import { fetchSessionHighlights, parseSessionHighlights } from './session-highlights';
const id = '11111111-1111-4111-8111-111111111111', exerciseId = '22222222-2222-4222-8222-222222222222';
const row = { kind: 'record', exerciseId, name: 'Remo', weightMode: 'Peso total', mark: { weightKg: 60, reps: 10 }, previous: { weightKg: 50, reps: 10 } };
const data = { sessionId: id, volumeKg: 600, highlights: [row] };
it('parses null versus zero and rejects malformed, duplicate, non-comparable or fabricated marks', () => {
  expect(parseSessionHighlights(data)).toEqual(data);
  for (const volumeKg of [null, 0]) expect(parseSessionHighlights({ ...data, volumeKg })?.volumeKg).toBe(volumeKg);
  for (const value of [{ ...data, volumeKg: -1 }, { ...data, volumeKg: NaN }, { ...data, extra: true }, { ...data, highlights: [row, row] },
    ...[{ ...row, kind: 'unknown' }, { ...row, weightMode: 'Peso corporal' }, { ...row, mark: { weightKg: 50, reps: 11 } },
      { ...row, kind: 'improvement', mark: { weightKg: 40, reps: 20 } }, { ...row, mark: { weightKg: 60, reps: 1.2 } }, { ...row, previous: null }].map(item => ({ ...data, highlights: [item] }))]) {
    expect(parseSessionHighlights(value)).toBeUndefined();
  }
  expect(parseSessionHighlights({ ...data, highlights: [{ ...row, kind: 'improvement', mark: { weightKg: 50, reps: 11 } }] })).toBeDefined();
});
it('uses a bearer read and rejects a receipt bound to another session', async () => {
  const fetchImplementation = jest.fn<typeof fetch>().mockResolvedValue({ status: 200, ok: true, text: async () => JSON.stringify(data) } as Response);
  const client = createMobileApiClient({ auth: { getAccessToken: async () => ({ status: 'ok', accessToken: 'token' }), revalidateAfterUnauthorized: async () => ({ status: 'invalid' }) },
    config: { appEnv: 'development', baseUrl: 'https://example.test', host: 'example.test', timeoutMs: 1000 }, fetchImplementation,
    runtime: { appVersion: '1', build: '1', platform: 'ios' }, telemetry: { record: () => undefined } });
  expect((await fetchSessionHighlights(client, id)).status).toBe('ok');
  const [url, init] = fetchImplementation.mock.calls[0];
  expect(String(url)).toBe(`https://example.test/api/mobile/v1/training/sessions/${id}/highlights`);
  expect(new Headers(init?.headers).get('authorization')).toBe('Bearer token');
  expect(await fetchSessionHighlights(client, exerciseId)).toMatchObject({ status: 'unavailable', reason: 'invalid_response' });
});
