import { expect, it, jest } from '@jest/globals';
import { createMobileApiClient } from './client';
import { fetchProgressHabitWeek } from './progress';
import { homeProgressHabits } from '../home/home-test-fixtures';

it('requests the additive weekly API with a bearer and rejects a response for another week', async () => {
  const data = homeProgressHabits();
  const fetchImplementation = jest.fn<typeof fetch>().mockResolvedValue({ status: 200, ok: true, text: async () => JSON.stringify(data) } as Response);
  const client = createMobileApiClient({
    auth: { getAccessToken: async () => ({ status: 'ok', accessToken: 'token' }), revalidateAfterUnauthorized: async () => ({ status: 'invalid' }) },
    config: { appEnv: 'development', baseUrl: 'https://example.test', host: 'example.test', timeoutMs: 1000 },
    fetchImplementation, runtime: { appVersion: '1', build: '1', platform: 'ios' }, telemetry: { record: () => undefined },
  });
  expect((await fetchProgressHabitWeek(client, data.weekStart)).status).toBe('ok');
  const [url, init] = fetchImplementation.mock.calls[0];
  expect(String(url)).toBe('https://example.test/api/mobile/v1/progress/habits');
  expect(new Headers(init?.headers).get('authorization')).toBe('Bearer token');
  const wrong = await fetchProgressHabitWeek(client, '2026-10-12');
  expect(wrong).toMatchObject({ status: 'unavailable', reason: 'invalid_response' });
});
