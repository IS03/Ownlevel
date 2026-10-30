import { expect, it, jest } from '@jest/globals';
import { createMobileApiClient } from './client';
import { fetchProgressTrainingRecords } from './progress';
import { homeProgressRecords } from '../home/home-test-fixtures';

it("requests Home's records read with a bearer and rejects a response for another period", async () => {
  const data = homeProgressRecords();
  const fetchImplementation = jest.fn<typeof fetch>().mockResolvedValue({ status: 200, ok: true, text: async () => JSON.stringify(data) } as Response);
  const client = createMobileApiClient({
    auth: { getAccessToken: async () => ({ status: 'ok', accessToken: 'token' }), revalidateAfterUnauthorized: async () => ({ status: 'invalid' }) },
    config: { appEnv: 'development', baseUrl: 'https://example.test', host: 'example.test', timeoutMs: 1000 },
    fetchImplementation, runtime: { appVersion: '1', build: '1', platform: 'ios' }, telemetry: { record: () => undefined },
  });
  expect(await fetchProgressTrainingRecords(client, { period: '30' })).toMatchObject({ status: 'ok', data });
  const [url, init] = fetchImplementation.mock.calls[0];
  expect(String(url)).toBe('https://example.test/api/mobile/v1/progress/training/records?period=30');
  expect(new Headers(init?.headers).get('authorization')).toBe('Bearer token');
  expect(await fetchProgressTrainingRecords(client, { period: '7' })).toMatchObject({ status: 'unavailable', reason: 'invalid_response' });
});
