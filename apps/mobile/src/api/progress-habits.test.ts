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
  expect(String(url)).toBe('https://example.test/api/mobile/v1/progress/habits?includeToday=1');
  expect(new Headers(init?.headers).get('authorization')).toBe('Bearer token');
  const wrong = await fetchProgressHabitWeek(client, '2026-10-12');
  expect(wrong).toMatchObject({ status: 'unavailable', reason: 'invalid_response' });
  // An older server answering without today is not this read (its counts would be out of other days).
  const { includesToday: _ignored, ...older } = data;
  fetchImplementation.mockResolvedValueOnce({ status: 200, ok: true, text: async () => JSON.stringify({ ...older, items: older.items.map(item => ({ ...item, coverage: { ...item.coverage, eligible: 5 } })) }) } as Response);
  expect(await fetchProgressHabitWeek(client, data.weekStart)).toMatchObject({ status: 'unavailable' });
});
