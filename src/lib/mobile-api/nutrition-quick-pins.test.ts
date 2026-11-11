import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MobileApiUnauthorizedError } from './auth';
import { parseQuickOptions, parseQuickPins, parseQuickPinsConflict, parseQuickPinsWrite } from './nutrition-quick-contract';
vi.mock('server-only', () => ({}));
vi.mock('./supabase', () => ({ authenticateMobileMutationAccessToken: vi.fn() }));
import { authenticateMobileMutationAccessToken } from './supabase';
import { buildQuickOptions } from './nutrition-quick-server';
import { GET } from '@/app/api/mobile/v1/nutrition/quick-options/route';
import { OPTIONS, PUT } from '@/app/api/mobile/v1/nutrition/quick-pins/route';

// #479 increment A: pinned saved meals, contract + GET section + PUT endpoint (the database side is quick-pins.local.test.ts).
const date = '2026-11-11', user = '47900000-0000-4000-8000-000000000001';
const id = (n: number) => `47900000-0000-4000-8000-${String(100 + n).padStart(12, '0')}`;
const ids = (count: number) => Array.from({ length: count }, (_, n) => id(n));
const snapshot = (revision: number, list: string[], state = 'active') => ({ revision, items: list.map(value => ({ id: value, state })) });
const write = (list: string[], expectedRevision = 0, idempotencyKey = 'pins:1') => ({ savedMealIds: list, expectedRevision, idempotencyKey });
const rpc = vi.fn();
const request = (body: unknown, auth = 'Bearer token', method = 'PUT') => new NextRequest('https://ownlevel.fit/api/mobile/v1/nutrition/quick-pins', {
  method, headers: { authorization: auth, 'Content-Type': 'application/json' }, ...(method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
});
const savedRow = { id: id(0), version: 'a'.repeat(64), name: 'Avena', description: null, template_type: 'manual', calories: 300, protein_g: 10, carbs_g: 40, fat_g: 5, items: [], is_active: true };
const raw = (pins?: unknown) => ({ today: date, saved: { status: 'ok', rows: [savedRow] }, suggested: { status: 'ok', rows: [] }, ...(pins === undefined ? {} : { pins }) });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(authenticateMobileMutationAccessToken).mockResolvedValue({ userId: user, supabase: { rpc } } as never); });

describe('#479 pins contract', () => {
  it('a new account is «ok, revision 0, no pins»; 0 to 6 ids keep their order and state', () => {
    expect(parseQuickPins({ status: 'ok', revision: 0, items: [] })).toEqual({ status: 'ok', revision: 0, items: [] });
    const six = { status: 'ok', ...snapshot(4, ids(6)) };
    six.items[1]!.state = 'archived'; six.items[5]!.state = 'deleted';
    expect(parseQuickPins(six)).toEqual(six);
    expect(parseQuickPins({ status: 'ok', revision: 1, items: [{ id: id(0).toUpperCase(), state: 'active' }] })).toEqual({ status: 'ok', ...snapshot(1, [id(0)]) });
  });
  it('anything absent, incompatible or invalid is «unavailable», never zero pins', () => {
    for (const value of [undefined, null, {}, { status: 'unavailable' }, { status: 'ok', revision: 1, items: ids(7).map(v => ({ id: v, state: 'active' })) },
      { status: 'ok', revision: 1, items: [{ id: id(0), state: 'active' }, { id: id(0), state: 'active' }] },
      { status: 'ok', revision: 1, items: [{ id: 'nope', state: 'active' }] }, { status: 'ok', revision: 1, items: [{ id: id(0), state: 'hidden' }] },
      { status: 'ok', revision: 0, items: [{ id: id(0), state: 'active' }] }, { status: 'ok', revision: -1, items: [] }, { status: 'ok', revision: 1.5, items: [] },
      { status: 'ok', revision: 1, items: [], extra: true }, { status: 'ok', revision: 1, items: [{ id: id(0), state: 'active', name: 'x' }] }]) {
      expect(parseQuickPins(value)).toEqual({ status: 'unavailable' });
    }
  });
  it('pins never take saved or suggested down, and an older server without them is «unavailable»', () => {
    const options = { today: date, saved: { status: 'ok', items: [] }, suggested: { status: 'unavailable' } };
    expect(parseQuickOptions(options)).toEqual({ ...options, pins: { status: 'unavailable' } });
    expect(parseQuickOptions({ ...options, pins: { status: 'ok', revision: 9, items: 'x' } })).toEqual({ ...options, pins: { status: 'unavailable' } });
    expect(parseQuickOptions({ ...options, pins: { status: 'ok', ...snapshot(2, [id(0)], 'archived') } })?.pins).toEqual({ status: 'ok', ...snapshot(2, [id(0)], 'archived') });
  });
  it('the write takes 0–6 distinct ids, a revision and a key, and nothing else', () => {
    expect(parseQuickPinsWrite(write([]))).toEqual(write([]));
    expect(parseQuickPinsWrite(write(ids(6), 3))).toEqual(write(ids(6), 3));
    expect(parseQuickPinsWrite(write([id(0).toUpperCase()]))).toEqual(write([id(0)]));
    for (const value of [write(ids(7)), write([id(0), id(0)]), write([id(0), id(0).toUpperCase()]), write(['nope']), write([id(0)], -1), write([id(0)], 1.5),
      write([id(0)], 0, ''), write([id(0)], 0, 'a b'), write([id(0)], 0, 'k'.repeat(129)), { ...write([]), userId: user }, { savedMealIds: [], expectedRevision: 0 }, null]) {
      expect(parseQuickPinsWrite(value)).toBeUndefined();
    }
  });
  it('a conflict carries server truth when it has it', () => {
    expect(parseQuickPinsConflict({ error: 'QUICK_PINS_CHANGED', message: 'm', current: snapshot(2, [id(1)]) })).toEqual({ error: 'QUICK_PINS_CHANGED', message: 'm', current: snapshot(2, [id(1)]) });
    expect(parseQuickPinsConflict({ error: 'IDEMPOTENCY_KEY_REUSED', message: 'm', current: null })?.current).toBeNull();
    expect(parseQuickPinsConflict({ error: 'QUICK_PIN_UNAVAILABLE', message: 'm', current: { revision: 0, items: [{ id: id(0), state: 'active' }] } })).toBeUndefined();
    expect(parseQuickPinsConflict({ error: 'OTHER', message: 'm', current: null })).toBeUndefined();
  });
});

describe('#479 GET quick-options with pins', () => {
  it('stays one RPC, keeps the legacy sections identical and adds pins', async () => {
    rpc.mockResolvedValueOnce({ data: raw(), error: null }).mockResolvedValueOnce({ data: raw({ status: 'ok', ...snapshot(3, [id(0), id(1)]) }), error: null });
    const legacy = await (await GET(request(null, 'Bearer token', 'GET'))).json();
    const response = await GET(request(null, 'Bearer token', 'GET')), body = await response.json();
    expect(response.status).toBe(200); expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(2, 'mobile_read_quick_options', {}, { get: true });
    expect(body.pins).toEqual({ status: 'ok', ...snapshot(3, [id(0), id(1)]) });
    // Older apps read only today, saved and suggested: those are byte for byte what they were without pins.
    expect(JSON.stringify({ today: body.today, saved: body.saved, suggested: body.suggested })).toBe(JSON.stringify({ today: legacy.today, saved: legacy.saved, suggested: legacy.suggested }));
    expect(Object.keys(body)).toEqual(['today', 'saved', 'suggested', 'pins']);
    expect(legacy.pins).toEqual({ status: 'unavailable' });
  });
  it('a failed or invalid pins section is «unavailable» and the confirmed saved meals stay', () => {
    for (const pins of [{ status: 'unavailable' }, { status: 'ok', revision: 0, items: [{ id: id(0), state: 'active' }] }, { status: 'ok' }]) {
      const options = buildQuickOptions(raw(pins));
      expect(options?.pins).toEqual({ status: 'unavailable' });
      expect(options?.saved).toMatchObject({ status: 'ok', items: [{ source: { kind: 'saved', id: id(0) } }] });
    }
    expect(buildQuickOptions({ ...raw({ status: 'ok', ...snapshot(1, [id(0)]) }), saved: { status: 'unavailable' } })).toMatchObject({ saved: { status: 'unavailable' }, pins: { status: 'ok', revision: 1 } });
  });
});

describe('#479 PUT quick-pins', () => {
  it('authenticates first and validates before any RPC; no client identity is accepted', async () => {
    expect((await PUT(request(write([]), ''))).status).toBe(401);
    vi.mocked(authenticateMobileMutationAccessToken).mockRejectedValueOnce(new MobileApiUnauthorizedError());
    expect((await PUT(request(write([])))).status).toBe(401);
    for (const body of [write(ids(7)), write([id(0), id(0)]), write(['nope']), { ...write([]), userId: user }, '{not json']) {
      const response = await PUT(request(body)); expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
    }
    expect(rpc).not.toHaveBeenCalled();
    const options = await OPTIONS(request(null, 'Bearer token', 'OPTIONS')); expect(options.status).toBe(204); expect(options.headers.get('Cache-Control')).toBe('no-store');
  });
  it('writes through the RPC only and returns the confirmed pins; a replay returns the same receipt', async () => {
    const receipt = snapshot(1, ids(6));
    rpc.mockResolvedValueOnce({ data: [{ response_status: 200, response_body: receipt, replayed: false }], error: null })
      .mockResolvedValueOnce({ data: [{ response_status: 200, response_body: receipt, replayed: true }], error: null });
    const first = await PUT(request(write(ids(6)))), again = await PUT(request(write(ids(6))));
    expect(first.status).toBe(200); expect(await first.json()).toEqual(receipt); expect(await again.json()).toEqual(receipt);
    expect(rpc).toHaveBeenCalledWith('mobile_put_quick_pins', { p_saved_meal_ids: ids(6), p_expected_revision: 0, p_idempotency_key: 'pins:1' });
    expect(first.headers.get('Cache-Control')).toBe('no-store');
  });
  it.each(['QUICK_PINS_CHANGED', 'QUICK_PIN_UNAVAILABLE', 'IDEMPOTENCY_KEY_REUSED'])('keeps %s explicit, with server truth', async error => {
    const body = { error, message: 'm', current: error === 'IDEMPOTENCY_KEY_REUSED' ? null : snapshot(2, [id(3)]) };
    rpc.mockResolvedValueOnce({ data: [{ response_status: 409, response_body: body, replayed: false }], error: null });
    const response = await PUT(request(write([id(0)]))); expect(response.status).toBe(409); expect(await response.json()).toEqual(body);
  });
  it('maps database refusals, and keeps every unknown outcome «unavailable» (safe to replay with the same key)', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'Revisá las comidas fijadas.' } });
    expect((await PUT(request(write([id(0)])))).status).toBe(400);
    rpc.mockResolvedValueOnce({ data: null, error: { code: '40001', message: 'QUICK_PINS_CHANGED' } });
    const lost = await PUT(request(write([id(0)]))); expect(lost.status).toBe(409); expect(await lost.json()).toMatchObject({ error: 'QUICK_PINS_CHANGED', current: null });
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PT401', message: 'UNAUTHORIZED' } });
    expect((await PUT(request(write([id(0)])))).status).toBe(401);
    for (const outcome of [{ data: null, error: { code: '57014', message: 'timeout' } }, { data: null, error: { code: 'PGRST202', message: 'missing' } },
      { data: [{ response_status: 200, response_body: snapshot(1, [id(1), id(0)]) }], error: null },
      { data: [{ response_status: 200, response_body: snapshot(0, [id(0)]) }], error: null },
      { data: [{ response_status: 409, response_body: { error: 'QUICK_PINS_CHANGED', message: 'm' } }], error: null },
      { data: [], error: null }]) {
      rpc.mockResolvedValueOnce(outcome);
      const response = await PUT(request(write([id(0), id(1)], 0)));
      expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'DATA_UNAVAILABLE' });
    }
  });
});
