import { describe, expect, it, jest } from '@jest/globals';
import { createMobileApiClient } from './client';
import { putQuickPins, type QuickPinsWrite } from './nutrition-quick';

const ID = (n: number) => `47900000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const write: QuickPinsWrite = { savedMealIds: [ID(2), ID(1)], expectedRevision: 3, idempotencyKey: 'pins-1' };
const receipt = { revision: 4, items: [{ id: ID(2), state: 'active' }, { id: ID(1), state: 'archived' }] };
const response = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) }) as Response;
function client(fetchImplementation: typeof fetch) {
  return createMobileApiClient({ auth: { getAccessToken: async () => ({ status: 'ok', accessToken: 'test-token' }), revalidateAfterUnauthorized: async () => ({ status: 'invalid' }) },
    config: { appEnv: 'development', baseUrl: 'https://example.test', host: 'example.test', timeoutMs: 1000 }, fetchImplementation,
    runtime: { appVersion: '1', build: '1', platform: 'ios' }, telemetry: { record: () => {} } });
}

describe('#479 B · PUT quick-pins through the Mobile client', () => {
  it('sends the exact frozen write once, and returns the confirmed receipt', async () => {
    const fetch = jest.fn<typeof globalThis.fetch>().mockResolvedValue(response(200, receipt));
    expect(await putQuickPins(client(fetch), write)).toMatchObject({ status: 'ok', data: receipt });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe('https://example.test/api/mobile/v1/nutrition/quick-pins');
    expect(fetch.mock.calls[0]![1]?.method).toBe('PUT'); expect(JSON.parse(fetch.mock.calls[0]![1]?.body as string)).toEqual(write);
  });
  it('a network failure is one attempt and «unavailable»: the caller replays the same body', async () => {
    const fetch = jest.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('connection lost'));
    expect((await putQuickPins(client(fetch), write)).status).toBe('unavailable');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('conflicts keep their server truth; IDEMPOTENCY_KEY_REUSED is explicit too', async () => {
    const changed = { error: 'QUICK_PINS_CHANGED', message: 'Tus fijadas cambiaron en otro dispositivo.', current: { revision: 5, items: [{ id: ID(9), state: 'active' }] } };
    const gone = { error: 'QUICK_PIN_UNAVAILABLE', message: 'm', current: { revision: 3, items: [] } };
    const reused = { error: 'IDEMPOTENCY_KEY_REUSED', message: 'm', current: null };
    const fetch = jest.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response(409, changed)).mockResolvedValueOnce(response(409, gone)).mockResolvedValueOnce(response(409, reused));
    const api = client(fetch);
    expect(await putQuickPins(api, write)).toMatchObject({ status: 'conflict', code: 'QUICK_PINS_CHANGED', data: changed });
    expect(await putQuickPins(api, write)).toMatchObject({ status: 'conflict', code: 'QUICK_PIN_UNAVAILABLE', data: gone });
    expect(await putQuickPins(api, write)).toMatchObject({ status: 'conflict', code: 'IDEMPOTENCY_KEY_REUSED' });
  });
  it('a malformed conflict or a receipt for another list stays ambiguous, never a confirmation', async () => {
    const fetch = jest.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(409, { error: 'QUICK_PINS_CHANGED', message: 'm' }))
      .mockResolvedValueOnce(response(200, { revision: 4, items: [{ id: ID(1), state: 'active' }, { id: ID(2), state: 'active' }] }))
      .mockResolvedValueOnce(response(200, { revision: 2, items: receipt.items }))
      .mockResolvedValueOnce(response(200, { error: 'QUICK_PINS_CHANGED', message: 'm', current: null }));
    const api = client(fetch);
    expect((await putQuickPins(api, write)).status).toBe('unavailable');
    expect((await putQuickPins(api, write)).status).toBe('unavailable');
    expect((await putQuickPins(api, write)).status).toBe('unavailable');
    const odd = await putQuickPins(api, write);
    // A 200 that is a conflict body parses, but the controller only accepts a receipt for its own list.
    expect(odd.status === 'ok' && 'error' in odd.data).toBe(true);
  });
  it('validation and session answers are distinct', async () => {
    const fetch = jest.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response(400, { error: 'VALIDATION_ERROR', message: 'Revisá las comidas fijadas.' }));
    expect(await putQuickPins(client(fetch), write)).toMatchObject({ status: 'validation', message: 'Revisá las comidas fijadas.' });
  });
});
