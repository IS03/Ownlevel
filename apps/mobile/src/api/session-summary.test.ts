import { beforeEach, expect, it, jest } from '@jest/globals';
import { createMobileApiClient } from './client';
import { fetchSessionSummary, forgetSessionSummary, prefetchSessionSummary, readSessionSummary } from './session-summary';
const id = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const data = { sessionId: id, volumeKg: 600, highlights: [], exercises: [{ sessionExerciseId: other, exerciseId: other, status: 'first', change: null, previous: null }] };
let fetchImplementation: jest.Mock<typeof fetch>;
const client = () => createMobileApiClient({ auth: { getAccessToken: async () => ({ status: 'ok', accessToken: 'token' }), revalidateAfterUnauthorized: async () => ({ status: 'invalid' }) },
  config: { appEnv: 'development', baseUrl: 'https://example.test', host: 'example.test', timeoutMs: 1000 }, fetchImplementation,
  runtime: { appVersion: '1', build: '1', platform: 'ios' }, telemetry: { record: () => undefined } });
const reply = (body: unknown, status = 200) => ({ status, ok: status < 400, text: async () => JSON.stringify(body) }) as Response;
beforeEach(() => { fetchImplementation = jest.fn<typeof fetch>().mockResolvedValue(reply(data)); });

it('reads the summary with the bearer and rejects one bound to another session', async () => {
  const api = client();
  expect((await fetchSessionSummary(api, id)).status).toBe('ok');
  const [url, init] = fetchImplementation.mock.calls[0];
  expect(String(url)).toBe(`https://example.test/api/mobile/v1/training/sessions/${id}/summary`);
  expect(new Headers(init?.headers).get('authorization')).toBe('Bearer token');
  expect(await fetchSessionSummary(api, other)).toMatchObject({ status: 'unavailable', reason: 'invalid_response' });
});
it('the screen reuses the read started on the tap; a failure is not kept and a correction forgets it', async () => {
  const api = client();
  void prefetchSessionSummary(api, id);
  expect((await readSessionSummary(api, id)).status).toBe('ok');
  expect(fetchImplementation).toHaveBeenCalledTimes(1);
  forgetSessionSummary(api, id);
  await readSessionSummary(api, id);
  expect(fetchImplementation).toHaveBeenCalledTimes(2);

  const failing = client();
  fetchImplementation.mockResolvedValueOnce(reply({ error: { code: 'x' } }, 503));
  expect((await readSessionSummary(failing, other)).status).not.toBe('ok');
  await readSessionSummary(failing, other);
  expect(fetchImplementation).toHaveBeenCalledTimes(4);
});
it('a stale read is read again', async () => {
  const api = client();
  await prefetchSessionSummary(api, id, 0);
  await prefetchSessionSummary(api, id, 10 * 60_000);
  expect(fetchImplementation).toHaveBeenCalledTimes(2);
});
