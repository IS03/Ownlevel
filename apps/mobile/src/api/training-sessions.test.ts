import { describe, expect, it, jest } from '@jest/globals';

import type { MobileApiClient } from './client';
import { createMobileApiClient } from './client';
import { parseMobileTrainingSessionStartResponse, startMobileTrainingSession } from './training-sessions';

const session = {
  id: '11111111-1111-4111-8111-111111111111',
  routineId: null,
  name: 'Sesión libre',
  logDate: '2026-09-28',
  startedAt: '2026-09-28T14:05:00.000Z',
};

describe('Mobile start session contract', () => {
  it('parses started and active responses, including null and routine UUID', () => {
    expect(parseMobileTrainingSessionStartResponse({ status: 'started', session })).toEqual({ status: 'started', session });
    const withRoutine = { ...session, routineId: '22222222-2222-4222-8222-222222222222' };
    expect(parseMobileTrainingSessionStartResponse({ status: 'active', code: 'ACTIVE_SESSION_EXISTS', session: withRoutine }))
      .toEqual({ status: 'active', code: 'ACTIVE_SESSION_EXISTS', session: withRoutine });
  });

  it('rejects malformed dates, timestamps, UUIDs, wrong codes and extra data', () => {
    for (const invalid of [
      { ...session, id: 'invalid' },
      { ...session, routineId: 'invalid' },
      { ...session, name: '' },
      { ...session, logDate: '2026-02-30' },
      { ...session, startedAt: 'yesterday' },
      { ...session, startedAt: '2026-02-30T12:00:00Z' },
      { ...session, startedAt: '2026-09-28T25:00:00Z' },
      { ...session, userId: 'unexpected' },
    ]) expect(parseMobileTrainingSessionStartResponse({ status: 'started', session: invalid })).toBeUndefined();
    expect(parseMobileTrainingSessionStartResponse({ status: 'active', code: 'OTHER', session })).toBeUndefined();
    expect(parseMobileTrainingSessionStartResponse({ status: 'conflict', code: 'IDEMPOTENCY_KEY_REUSED', session })).toBeUndefined();
  });

  it('sends one explicit POST through the existing client', async () => {
    const request = jest.fn<MobileApiClient['request']>().mockResolvedValue({
      status: 'ok', data: { status: 'started', session },
      meta: { durationMs: 1, httpStatus: 201, outcome: 'ok' },
    });
    const client = { request, read: jest.fn() } as MobileApiClient;
    await startMobileTrainingSession(client, { routineId: null, idempotencyKey: 'same-intent' });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      method: 'POST', path: '/api/mobile/v1/training/sessions',
      body: { templateTargetsOnly: true, routineId: null, idempotencyKey: 'same-intent' },
      parse: parseMobileTrainingSessionStartResponse,
    });
  });

  it('never retries start after a PGRST303-style server failure', async () => {
    const fetchImplementation = jest.fn<typeof fetch>().mockResolvedValue({
      ok: false, status: 503, text: async () => JSON.stringify({ error: 'PGRST303' }),
    } as Response);
    const client = createMobileApiClient({
      auth: {
        getAccessToken: async () => ({ status: 'ok', accessToken: 'test-token' }),
        revalidateAfterUnauthorized: async () => ({ status: 'invalid' }),
      },
      config: { appEnv: 'development', baseUrl: 'https://example.test', host: 'example.test', timeoutMs: 1_000 },
      fetchImplementation,
      runtime: { appVersion: '1', build: '1', platform: 'ios' },
      telemetry: { record: () => undefined },
    });
    await expect(startMobileTrainingSession(client, { routineId: null, idempotencyKey: 'one' }))
      .resolves.toMatchObject({ status: 'unavailable', reason: 'server' });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });
});
