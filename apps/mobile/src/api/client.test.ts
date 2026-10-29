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
import { confirmedReads, clearConfirmedReads } from './confirmed-read-cache';

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

it.each([false, true])('invalidates retained analytical reads after a settled write (ambiguous=%s), without caching operational reads', async ambiguous => {
  const fetcher = jest.fn<typeof fetch>().mockResolvedValue(response(200, { value: 'ok' }));
  const { values } = dependencies({ fetchImplementation: fetcher });
  const client = createMobileApiClient(values), cache = confirmedReads(client);
  const entry = cache.get('body', '30', async () => ({ status: 'ok', data: 1, meta: { durationMs: 1, httpStatus: 200, outcome: 'ok' } }));
  await cache.ensure(entry, 'initial'); expect(entry.invalidated).toBe(false);
  if (ambiguous) fetcher.mockRejectedValueOnce(new Error('network'));
  const result = await client.request({ method: 'PUT', path: '/api/mobile/v1/body/weights/2026-10-01', body: {}, parse: v => v });
  expect(result.status).toBe(ambiguous ? 'unavailable' : 'ok'); expect(entry.invalidated).toBe(true); expect(fetcher).toHaveBeenCalledTimes(1);
  await client.request({ method: 'GET', path: '/api/mobile/v1/body', parse: v => v });
  await client.request({ method: 'GET', path: '/api/mobile/v1/body', parse: v => v });
  expect(fetcher).toHaveBeenCalledTimes(3); clearConfirmedReads(client);
});
it('preserves a confirmed mutation receipt even if a presentation invalidation observer fails', async () => {
  const { values } = dependencies(), client = createMobileApiClient(values), cache = confirmedReads(client);
  jest.spyOn(cache, 'invalidate').mockImplementationOnce(() => { throw new Error('observer'); });
  const result = await client.request({ method: 'PUT', path: '/api/mobile/v1/body/weights/fixture', body: {}, parse: value => value });
  expect(result.status).toBe('ok'); clearConfirmedReads(client);
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

it('keeps exercise identity CAS conflict explicit and never retries its write', async () => {
  const fetchImplementation = jest.fn(async () => response(409, { error: 'EXERCISE_CHANGED', message: 'Recargá el ejercicio.' })) as unknown as typeof fetch;
  const setup = dependencies({ fetchImplementation });
  const result = await createMobileApiClient(setup.values).request({ method: 'PATCH', path: '/api/mobile/v1/training/exercises/id', body: {}, parse: () => undefined });
  expect(result).toMatchObject({ status: 'conflict', code: 'EXERCISE_CHANGED' });
  expect(fetchImplementation).toHaveBeenCalledTimes(1);
});

describe('in-flight GET transport reuse', () => {
  const path = '/api/mobile/v1/training/history?limit=20' as const;
  const drain = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  function deferred() {
    let resolve!: (value: Response) => void;
    const promise = new Promise<Response>(done => { resolve = done; });
    return { promise, resolve };
  }
  it('shares one HTTP request while each consumer parses independently, then reads the network again', async () => {
    const pending = deferred();
    const fetcher = jest.fn<typeof fetch>().mockReturnValueOnce(pending.promise).mockResolvedValue(response(200, { value: 3 }));
    const client = createMobileApiClient(dependencies({ fetchImplementation: fetcher }).values);
    const first = client.read({ path, parse: value => (value as { value: number }).value });
    const second = client.request({ method: 'GET', path, parse: value => `value:${(value as { value: number }).value}` });
    await drain();
    expect(fetcher).toHaveBeenCalledTimes(1);
    pending.resolve(response(200, { value: 2 }));
    await expect(first).resolves.toMatchObject({ status: 'ok', data: 2 });
    await expect(second).resolves.toMatchObject({ status: 'ok', data: 'value:2' });
    await client.read({ path, parse: value => value });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(['query', 'token', 'client', 'resource'] as const)('keeps distinct %s contexts separate', async kind => {
    const a = deferred(), b = deferred();
    const fetcher = jest.fn<typeof fetch>().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const setup = dependencies({ fetchImplementation: fetcher });
    if (kind === 'token') setup.getAccessToken.mockResolvedValueOnce({ status: 'ok', accessToken: 'owner-a' }).mockResolvedValueOnce({ status: 'ok', accessToken: 'owner-b' });
    const client = createMobileApiClient(setup.values);
    const other = kind === 'client' ? createMobileApiClient(setup.values) : client;
    const first = client.read({ path: kind === 'resource' ? '/api/mobile/v1/home' : path, parse: value => value });
    const second = other.read({ path: kind === 'query' ? '/api/mobile/v1/training/history?limit=20&cursor=next' : kind === 'resource' ? '/api/mobile/v1/training' : path, parse: value => value });
    await drain(); expect(fetcher).toHaveBeenCalledTimes(2);
    a.resolve(response(200, { value: 'a' })); b.resolve(response(200, { value: 'b' }));
    await expect(first).resolves.toMatchObject({ status: 'ok', data: { value: 'a' } });
    await expect(second).resolves.toMatchObject({ status: 'ok', data: { value: 'b' } });
  });
  it('cancels one consumer without aborting the shared transport for another', async () => {
    const pending = deferred(), controller = new AbortController();
    const fetcher = jest.fn<typeof fetch>().mockReturnValue(pending.promise);
    const client = createMobileApiClient(dependencies({ fetchImplementation: fetcher }).values);
    const first = client.read({ path, signal: controller.signal, parse: value => value });
    const second = client.read({ path, parse: value => value });
    await drain(); controller.abort();
    await expect(first).resolves.toMatchObject({ status: 'unavailable', reason: 'aborted' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(false);
    pending.resolve(response(200, { value: 'confirmed' }));
    await expect(second).resolves.toMatchObject({ status: 'ok', data: { value: 'confirmed' } });
  });
  it('retires the transport when everyone cancels; a late completion cannot remove a newer request', async () => {
    const old = deferred(), fresh = deferred();
    const a = new AbortController(), b = new AbortController();
    const fetcher = jest.fn<typeof fetch>().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const client = createMobileApiClient(dependencies({ fetchImplementation: fetcher }).values);
    const first = client.read({ path, signal: a.signal, parse: value => value });
    const second = client.read({ path, signal: b.signal, parse: value => value });
    await drain(); a.abort(); b.abort(); await Promise.all([first, second]);
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    const next = client.read({ path, parse: value => value });
    await drain(); old.resolve(response(200, { value: 'obsolete' })); await drain();
    const joined = client.read({ path, parse: value => value });
    await drain(); expect(fetcher).toHaveBeenCalledTimes(2);
    fresh.resolve(response(200, { value: 'fresh' }));
    expect((await Promise.all([next, joined])).every(result => result.status === 'ok' && (result.data as { value: string }).value === 'fresh')).toBe(true);
  });
  it('includes body consumption in the shared operation and isolates parser failures', async () => {
    let finish!: (body: string) => void;
    const body = new Promise<string>(resolve => { finish = resolve; });
    const fetcher = jest.fn<typeof fetch>().mockResolvedValue({ status: 200, ok: true, text: () => body } as Response);
    const client = createMobileApiClient(dependencies({ fetchImplementation: fetcher }).values);
    const invalid = client.read({ path, parse: () => undefined }); await drain();
    const valid = client.read({ path, parse: value => value }); await drain();
    expect(fetcher).toHaveBeenCalledTimes(1); finish('{"value":"confirmed"}');
    await expect(invalid).resolves.toMatchObject({ status: 'unavailable', reason: 'invalid_response' });
    await expect(valid).resolves.toMatchObject({ status: 'ok', data: { value: 'confirmed' } });
  });
  it('cleans up a shared failure so recovery makes a fresh request without automatic retry', async () => {
    const pending = deferred();
    const fetcher = jest.fn<typeof fetch>().mockReturnValueOnce(pending.promise).mockResolvedValue(response(200, { value: 'recovered' }));
    const client = createMobileApiClient(dependencies({ fetchImplementation: fetcher }).values);
    const first = client.read({ path, parse: value => value }), second = client.read({ path, parse: value => value });
    await drain(); pending.resolve(response(503, {}));
    expect((await Promise.all([first, second])).every(result => result.status === 'unavailable')).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(client.read({ path, parse: value => value })).resolves.toMatchObject({ status: 'ok', data: { value: 'recovered' } });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('times out all waiting consumers even when fetch ignores abort, then permits recovery', async () => {
    jest.useFakeTimers();
    const fetcher = jest.fn<typeof fetch>().mockReturnValueOnce(new Promise(() => {})).mockResolvedValue(response(200, { value: 'recovered' }));
    const client = createMobileApiClient(dependencies({ fetchImplementation: fetcher }).values);
    const first = client.read({ path, parse: value => value }), second = client.read({ path, parse: value => value });
    await drain(); jest.advanceTimersByTime(1001);
    const results = await Promise.all([first, second]);
    expect(results).toEqual([expect.objectContaining({ status: 'unavailable', reason: 'timeout' }), expect.objectContaining({ status: 'unavailable', reason: 'timeout' })]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(client.read({ path, parse: value => value })).resolves.toMatchObject({ status: 'ok' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('coalesces each token generation of a concurrent 401 renewal, preserving the existing auth flow', async () => {
    const old = deferred(), fresh = deferred();
    const fetcher = jest.fn<typeof fetch>().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const client = createMobileApiClient(dependencies({ fetchImplementation: fetcher, revalidation: { status: 'renewed', accessToken: renewedAccessToken, session: {} as never } }).values);
    const first = client.read({ path, parse: value => value }), second = client.read({ path, parse: value => value });
    await drain(); expect(fetcher).toHaveBeenCalledTimes(1);
    old.resolve(response(401, {})); await drain(); expect(fetcher).toHaveBeenCalledTimes(2);
    expect((fetcher.mock.calls[1][1]?.headers as Record<string, string>).Authorization).toBe(`Bearer ${renewedAccessToken}`);
    fresh.resolve(response(200, { value: 'renewed' }));
    expect((await Promise.all([first, second])).every(result => result.status === 'ok')).toBe(true);
  });
  it.each([false, true])('never joins a pre-write read during retained-read revalidation (ambiguous=%s)', async ambiguous => {
    const old = deferred(), fresh = deferred(); let gets = 0;
    const fetcher = jest.fn<typeof fetch>((_url, init) => init?.method === 'GET'
      ? (++gets === 1 ? old.promise : fresh.promise)
      : ambiguous ? Promise.reject(new Error('unconfirmed write')) : Promise.resolve(response(200, {})));
    const client = createMobileApiClient(dependencies({ fetchImplementation: fetcher }).values);
    const outside = client.read({ path, parse: value => value });
    const cache = confirmedReads(client);
    const entry = cache.get('training', 'history', signal => client.read({ path, signal, parse: value => value }));
    const unfocus = cache.focus(entry);
    const initial = cache.ensure(entry, 'initial'); await drain(); expect(fetcher).toHaveBeenCalledTimes(1);
    await client.request({ method: 'POST', path: '/api/mobile/v1/training/sessions/fixture/discard', body: {}, parse: value => value });
    await drain(); expect(fetcher).toHaveBeenCalledTimes(3);
    const revalidation = cache.reload(entry); await drain(); expect(fetcher).toHaveBeenCalledTimes(3);
    fresh.resolve(response(200, { value: 'after-write' })); await revalidation;
    old.resolve(response(200, { value: 'before-write' })); await Promise.all([initial, outside]);
    expect(entry.resource.getSnapshot()).toMatchObject({ status: 'ready', current: { data: { value: 'after-write' } } });
    unfocus(); clearConfirmedReads(client);
  });
  it('never coalesces mutations even with identical URL and body', async () => {
    const pending = deferred(); const fetcher = jest.fn<typeof fetch>().mockReturnValue(pending.promise);
    const client = createMobileApiClient(dependencies({ fetchImplementation: fetcher }).values);
    const input = { method: 'PUT' as const, path: '/api/mobile/v1/training/routines/order' as const, body: {}, parse: (value: unknown) => value };
    const first = client.request(input), second = client.request(input);
    await drain(); expect(fetcher).toHaveBeenCalledTimes(2);
    pending.resolve(response(409, { error: 'ROUTINE_LIST_CHANGED' }));
    expect((await Promise.all([first, second])).every(result => result.status === 'conflict')).toBe(true);
  });

});
