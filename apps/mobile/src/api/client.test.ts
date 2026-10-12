import { afterEach, describe, expect, it, jest } from '@jest/globals';

import type {
  MobileApiAccessTokenResult,
  MobileApiSessionRevalidationResult,
} from '@/auth/service';

import {
  createMobileApiClient,
  type MobileApiAuthPort,
  type MobileApiClientDependencies,
} from './client';
import type { MobileApiTelemetry, MobileApiTelemetryEvent } from './telemetry';

const accessToken = 'private-access-token';
const renewedAccessToken = 'private-renewed-token';

function response(status: number, body: unknown, rawBody?: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => rawBody ?? JSON.stringify(body),
  } as Response;
}

function dependencies(overrides: {
  authResult?: MobileApiAccessTokenResult;
  fetchImplementation?: typeof fetch;
  revalidation?: MobileApiSessionRevalidationResult;
  timeoutMs?: number;
} = {}) {
  const getAccessToken = jest.fn(async () =>
    overrides.authResult ?? { status: 'ok', accessToken } as const,
  );
  const revalidateAfterUnauthorized = jest.fn(async () =>
    overrides.revalidation ?? { status: 'invalid' } as const,
  );
  const events: MobileApiTelemetryEvent[] = [];
  const telemetry: MobileApiTelemetry = {
    record(event) {
      events.push(event);
    },
  };
  const auth: MobileApiAuthPort = {
    getAccessToken,
    revalidateAfterUnauthorized,
  };
  const values: MobileApiClientDependencies = {
    auth,
    config: {
      appEnv: 'development',
      baseUrl: 'https://www.ownlevel.fit',
      host: 'www.ownlevel.fit',
      timeoutMs: overrides.timeoutMs ?? 1_000,
    },
    fetchImplementation:
      overrides.fetchImplementation ??
      (jest.fn(async () => response(200, { value: 'ok' })) as unknown as typeof fetch),
    runtime: { appVersion: '1.2.3', build: '45', platform: 'ios' },
    telemetry,
  };

  return { auth, events, getAccessToken, revalidateAfterUnauthorized, values };
}

afterEach(() => {
  jest.useRealTimers();
});

describe('Mobile API client', () => {
  it('sends a just-in-time Bearer token and native compatibility headers', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(async () =>
      response(200, { value: 'confirmed' }),
    );
    const setup = dependencies({
      fetchImplementation,
    });
    const client = createMobileApiClient(setup.values);

    await expect(client.read({
      path: '/api/mobile/v1/home',
      parse: (value) => value,
    })).resolves.toMatchObject({ status: 'ok', data: { value: 'confirmed' } });

    expect(setup.getAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://www.ownlevel.fit/api/mobile/v1/home',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'X-OWNLEVEL-App-Version': '1.2.3',
          'X-OWNLEVEL-Build': '45',
          'X-OWNLEVEL-Platform': 'ios',
        },
      }),
    );
    const init = fetchImplementation.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).not.toHaveProperty('X-OWNLEVEL-Bridge-Version');
  });

  it('returns auth_required without issuing a request when no session exists', async () => {
    const fetchImplementation = jest.fn<typeof fetch>();
    const setup = dependencies({
      authResult: { status: 'auth_required' },
      fetchImplementation,
    });
    const client = createMobileApiClient(setup.values);

    await expect(client.read({
      path: '/api/mobile/v1/home',
      parse: (value) => value,
    })).resolves.toMatchObject({ status: 'auth_required' });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('keeps valid empty and null payloads distinct from unavailable', async () => {
    const emptyFetch = jest.fn(async () => response(200, []));
    const emptyClient = createMobileApiClient(dependencies({
      fetchImplementation: emptyFetch as unknown as typeof fetch,
    }).values);
    await expect(emptyClient.read({
      path: '/api/mobile/v1/empty',
      parse: (value) => Array.isArray(value) ? value : undefined,
    })).resolves.toMatchObject({ status: 'ok', data: [] });

    const nullFetch = jest.fn(async () => response(200, null));
    const nullClient = createMobileApiClient(dependencies({
      fetchImplementation: nullFetch as unknown as typeof fetch,
    }).values);
    await expect(nullClient.read<null>({
      path: '/api/mobile/v1/nullable',
      parse: (value) => value === null ? null : undefined,
    })).resolves.toMatchObject({ status: 'ok', data: null });
  });

  it.each([
    ['malformed JSON', response(200, null, '{broken')],
    ['schema mismatch', response(200, { wrong: true })],
  ])('maps %s to invalid_response', async (_label, apiResponse) => {
    const fetchImplementation = jest.fn(async () => apiResponse);
    const client = createMobileApiClient(dependencies({
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    }).values);

    await expect(client.read({
      path: '/api/mobile/v1/home',
      parse: (value) =>
        typeof value === 'object' && value !== null && 'expected' in value
          ? value
          : undefined,
    })).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'invalid_response',
    });
  });

  it('maps validation and not-found errors for future mutations', async () => {
    const fetchImplementation = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(400, {
        error: 'VALIDATION_ERROR',
        message: 'invalid input',
      }))
      .mockResolvedValueOnce(response(404, {
        error: 'NOT_FOUND',
        message: 'missing',
      }));
    const client = createMobileApiClient(dependencies({ fetchImplementation }).values);
    const request = {
      body: { amount: 1 },
      method: 'POST' as const,
      parse: (value: unknown) => value,
      path: '/api/mobile/v1/resource' as const,
    };

    await expect(client.request(request)).resolves.toMatchObject({
      status: 'validation',
      message: 'invalid input',
    });
    await expect(client.request(request)).resolves.toMatchObject({
      status: 'not_found',
      message: 'missing',
    });
    const init = fetchImplementation.mock.calls[0]?.[1] as RequestInit;
    expect(init).toMatchObject({
      body: JSON.stringify({ amount: 1 }),
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    });
  });

  it('maps a durable idempotency conflict without retrying the mutation', async () => {
    const fetchImplementation = jest.fn<typeof fetch>().mockResolvedValue(
      response(409, {
        error: 'IDEMPOTENCY_KEY_REUSED',
        message: 'La clave ya fue usada con otros datos.',
      }),
    );
    const client = createMobileApiClient(dependencies({ fetchImplementation }).values);

    await expect(client.request({
      body: { name: 'Push' },
      method: 'POST',
      path: '/api/mobile/v1/training/routines',
      parse: (value) => value,
    })).resolves.toMatchObject({
      status: 'conflict',
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('preserves the active-session conflict body without retrying the mutation', async () => {
    const body = {
      status: 'active',
      code: 'ACTIVE_SESSION_EXISTS',
      session: {
        id: '11111111-1111-4111-8111-111111111111',
        routineId: null,
        name: 'Sesión libre',
        logDate: '2026-09-28',
        startedAt: '2026-09-28T12:00:00.000Z',
      },
    };
    const fetchImplementation = jest.fn<typeof fetch>().mockResolvedValue(
      response(409, body),
    );
    const client = createMobileApiClient(dependencies({ fetchImplementation }).values);

    await expect(client.request({
      body: { routineId: null, idempotencyKey: 'session:start:1' },
      method: 'POST',
      path: '/api/mobile/v1/training/sessions',
      parse: (value) => value === body ? value : (
        typeof value === 'object' && value !== null && 'session' in value
          ? value
          : undefined
      ),
    })).resolves.toMatchObject({
      status: 'conflict',
      code: 'ACTIVE_SESSION_EXISTS',
      data: body,
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it.each([500, 503])('maps HTTP %s to server unavailable', async (status) => {
    const fetchImplementation = jest.fn(async () => response(status, {
      error: 'UNAVAILABLE',
    }));
    const client = createMobileApiClient(dependencies({
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    }).values);

    await expect(client.read({
      path: '/api/mobile/v1/home',
      parse: (value) => value,
    })).resolves.toMatchObject({ status: 'unavailable', reason: 'server' });
  });

  it('maps network errors without invalidating Auth', async () => {
    const fetchImplementation = jest.fn(async () => {
      throw new Error('offline');
    });
    const setup = dependencies({
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    });
    const client = createMobileApiClient(setup.values);

    await expect(client.read({
      path: '/api/mobile/v1/home',
      parse: (value) => value,
    })).resolves.toMatchObject({ status: 'unavailable', reason: 'network' });
    expect(setup.revalidateAfterUnauthorized).not.toHaveBeenCalled();
  });

  it('settles with timeout even when fetch does not honor abort', async () => {
    jest.useFakeTimers();
    const fetchImplementation = jest.fn(
      () => new Promise<Response>(() => undefined),
    );
    const client = createMobileApiClient(dependencies({
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
      timeoutMs: 50,
    }).values);
    const request = client.read({
      path: '/api/mobile/v1/home',
      parse: (value) => value,
    });

    await jest.advanceTimersByTimeAsync(51);
    await expect(request).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'timeout',
    });
  });

  it('distinguishes caller abort and does not fetch when already aborted', async () => {
    const fetchImplementation = jest.fn<typeof fetch>();
    const client = createMobileApiClient(dependencies({ fetchImplementation }).values);
    const controller = new AbortController();
    controller.abort();

    await expect(client.read({
      path: '/api/mobile/v1/home',
      parse: (value) => value,
      signal: controller.signal,
    })).resolves.toMatchObject({ status: 'unavailable', reason: 'aborted' });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('revalidates a 401 and retries a read once only with a renewed token', async () => {
    const fetchImplementation = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(401, { error: 'UNAUTHORIZED' }))
      .mockResolvedValueOnce(response(200, { confirmed: true }));
    const setup = dependencies({
      fetchImplementation,
      revalidation: {
        status: 'renewed',
        accessToken: renewedAccessToken,
        session: {} as never,
      },
    });
    const client = createMobileApiClient(setup.values);

    await expect(client.read({
      path: '/api/mobile/v1/home',
      parse: (value) => value,
    })).resolves.toMatchObject({ status: 'ok', data: { confirmed: true } });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(setup.revalidateAfterUnauthorized).toHaveBeenCalledWith(accessToken);
    const retryInit = fetchImplementation.mock.calls[1]?.[1] as RequestInit;
    expect(retryInit.headers).toMatchObject({
      Authorization: `Bearer ${renewedAccessToken}`,
    });
  });

  it('does not retry a mutation after 401 even if Auth renews the token', async () => {
    const fetchImplementation = jest.fn<typeof fetch>()
      .mockResolvedValue(response(401, { error: 'UNAUTHORIZED' }));
    const setup = dependencies({
      fetchImplementation,
      revalidation: {
        status: 'renewed',
        accessToken: renewedAccessToken,
        session: {} as never,
      },
    });
    const client = createMobileApiClient(setup.values);

    await expect(client.request({
      body: { value: 1 },
      method: 'POST',
      path: '/api/mobile/v1/mutation',
      parse: (value) => value,
    })).resolves.toMatchObject({ status: 'unauthorized' });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('keeps a transient Auth revalidation failure unavailable instead of logging out', async () => {
    const fetchImplementation = jest.fn<typeof fetch>()
      .mockResolvedValue(response(401, { error: 'UNAUTHORIZED' }));
    const setup = dependencies({
      fetchImplementation,
      revalidation: { status: 'unavailable', session: null },
    });
    const client = createMobileApiClient(setup.values);

    await expect(client.read({
      path: '/api/mobile/v1/home',
      parse: (value) => value,
    })).resolves.toMatchObject({ status: 'unavailable', reason: 'auth' });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('never includes tokens, request bodies, or query values in telemetry', async () => {
    const fetchImplementation = jest.fn(async () => response(200, { ok: true }));
    const setup = dependencies({
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    });
    const client = createMobileApiClient(setup.values);

    await client.request({
      body: { meal: 'private meal', userId: 'private-user' },
      method: 'POST',
      path: '/api/mobile/v1/nutrition?secret=query-value',
      parse: (value) => value,
    });

    expect(setup.events).toHaveLength(1);
    expect(setup.events[0]?.path).toBe('/api/mobile/v1/nutrition');
    const serialized = JSON.stringify(setup.events);
    expect(serialized).not.toContain(accessToken);
    expect(serialized).not.toContain('private meal');
    expect(serialized).not.toContain('private-user');
    expect(serialized).not.toContain('query-value');
  });
});


describe('Saved Meal catalog conflict codes',()=>{
 it.each(['SAVED_CHANGED','SAVED_UNAVAILABLE','SAVED_FOOD_CHANGED','SAVED_FOOD_UNAVAILABLE'])('%s stays explicit without retry',async code=>{
  const fetchImplementation=jest.fn(async()=>response(409,{error:code,message:'Review source'})) as unknown as typeof fetch;
  const d=dependencies({fetchImplementation});const client=createMobileApiClient(d.values);
  const result=await client.request({method:'PATCH',path:'/api/mobile/v1/nutrition/saved-meals/id',body:{},parse:()=>undefined});
  expect(result).toMatchObject({status:'conflict',code,message:'Review source'});expect(fetchImplementation).toHaveBeenCalledTimes(1);
 });
});

it('keeps routine-list CAS conflict explicit and never retries its write', async () => {
  const fetchImplementation = jest.fn(async () => response(409, { error: 'ROUTINE_LIST_CHANGED', message: 'Recargá la lista.' })) as unknown as typeof fetch;
  const setup = dependencies({ fetchImplementation });
  const result = await createMobileApiClient(setup.values).request({ method: 'PUT', path: '/api/mobile/v1/training/routines/order', body: {}, parse: () => undefined });
  expect(result).toMatchObject({ status: 'conflict', code: 'ROUTINE_LIST_CHANGED' });
  expect(fetchImplementation).toHaveBeenCalledTimes(1);
});
