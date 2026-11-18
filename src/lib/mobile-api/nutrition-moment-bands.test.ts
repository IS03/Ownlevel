import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DEFAULT_MEAL_MOMENT_BANDS, mealMomentAtMinute, parseMealMomentBands, parseMealMomentBandsConflict, parseMealMomentBandsRead, parseMealMomentBandsWrite } from './nutrition-moment-bands-contract';
vi.mock('server-only', () => ({}));
vi.mock('./supabase', () => ({ authenticateMobileMutationAccessToken: vi.fn() }));
import { authenticateMobileMutationAccessToken } from './supabase';
import { GET, OPTIONS, PUT } from '@/app/api/mobile/v1/nutrition/moment-bands/route';

// Personal meal moment bands: contract and endpoints (the SQL is checked against a disposable local Postgres).
const user = '53300000-0000-4000-8000-000000000001';
const mine = { breakfastFrom: 420, lunchFrom: 720, snackFrom: 960, dinnerFrom: 1200, dinnerUntil: 1410 };
const rpc = vi.fn();
const request = (body?: unknown, auth = 'Bearer token', method = 'PUT') => new NextRequest('https://ownlevel.fit/api/mobile/v1/nutrition/moment-bands', {
  method, headers: { authorization: auth, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
});
const write = (bands: unknown = mine, expectedRevision = 0, idempotencyKey = 'bands:1') => ({ bands, expectedRevision, idempotencyKey });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(authenticateMobileMutationAccessToken).mockResolvedValue({ userId: user, supabase: { rpc } } as never); });

describe('meal moment bands contract', () => {
  it('the defaults are the bands every account had: 05, 11, 15, 19 and 23 h', () => {
    expect(DEFAULT_MEAL_MOMENT_BANDS).toEqual({ breakfastFrom: 300, lunchFrom: 660, snackFrom: 900, dinnerFrom: 1140, dinnerUntil: 1380 });
    expect([299, 300, 659, 660, 899, 900, 1139, 1140, 1379, 1380].map(m => mealMomentAtMinute(m) ?? null))
      .toEqual([null, 'breakfast', 'breakfast', 'lunch', 'lunch', 'snack', 'snack', 'dinner', 'dinner', null]);
  });
  it('personal bands move the limits: breakfast until 12 keeps 11:30 as breakfast', () => {
    const late = { ...mine, lunchFrom: 720 };
    expect(mealMomentAtMinute(690)).toBe('lunch'); expect(mealMomentAtMinute(690, late)).toBe('breakfast');
    expect(mealMomentAtMinute(0, { ...mine, breakfastFrom: 0 })).toBe('breakfast'); expect(mealMomentAtMinute(1439, { ...mine, dinnerUntil: 1440 })).toBe('dinner');
  });
  it('only strictly increasing whole minutes on the 15-minute grid, within one day', () => {
    expect(parseMealMomentBands(mine)).toEqual(mine);
    for (const bad of [{ ...mine, lunchFrom: 420 }, { ...mine, snackFrom: 700 }, { ...mine, dinnerUntil: 1455 }, { ...mine, breakfastFrom: -15 },
      { ...mine, lunchFrom: 725 }, { ...mine, lunchFrom: 720.5 }, { ...mine, lunchFrom: '720' }, { ...mine, extra: 1 }, { breakfastFrom: 300 }, null, []]) {
      expect(parseMealMomentBands(bad)).toBeUndefined();
    }
  });
  it('a read is «never written» only as revision 0 without bands; anything else invalid is unavailable, never the defaults', () => {
    expect(parseMealMomentBandsRead({ status: 'ok', revision: 0, bands: null })).toEqual({ status: 'ok', revision: 0, bands: null });
    expect(parseMealMomentBandsRead({ status: 'ok', revision: 3, bands: mine })).toEqual({ status: 'ok', revision: 3, bands: mine });
    for (const bad of [undefined, null, {}, { status: 'unavailable' }, { status: 'ok', revision: 0, bands: mine }, { status: 'ok', revision: 2, bands: null },
      { status: 'ok', revision: -1, bands: null }, { status: 'ok', revision: 1, bands: { ...mine, lunchFrom: 400 } }, { status: 'ok', revision: 1, bands: mine, extra: 1 }]) {
      expect(parseMealMomentBandsRead(bad)).toEqual({ status: 'unavailable' });
    }
  });
  it('a write needs valid bands, a revision and a key; a conflict carries the server truth or null', () => {
    expect(parseMealMomentBandsWrite(write())).toEqual(write());
    for (const bad of [write({ ...mine, lunchFrom: 300 }), write(mine, -1), write(mine, 0, 'bad key'), { ...write(), userId: user }, write(mine, 1.5)]) expect(parseMealMomentBandsWrite(bad)).toBeUndefined();
    expect(parseMealMomentBandsConflict({ error: 'MEAL_MOMENT_BANDS_CHANGED', message: 'x', current: { revision: 2, bands: mine } })).toEqual({ error: 'MEAL_MOMENT_BANDS_CHANGED', message: 'x', current: { revision: 2, bands: mine } });
    expect(parseMealMomentBandsConflict({ error: 'IDEMPOTENCY_KEY_REUSED', message: 'x', current: null })?.current).toBeNull();
    expect(parseMealMomentBandsConflict({ error: 'OTHER', message: 'x', current: null })).toBeUndefined();
  });
});

describe('GET /nutrition/moment-bands', () => {
  it('reads through RLS with the Bearer identity and answers the snapshot', async () => {
    rpc.mockResolvedValue({ data: { revision: 2, bands: mine }, error: null });
    const response = await GET(request(undefined, 'Bearer token', 'GET'));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ status: 'ok', revision: 2, bands: mine });
    expect(rpc).toHaveBeenCalledWith('mobile_read_meal_moment_bands', {}, { get: true });
  });
  it('a missing function or an invalid row is «unavailable» (200), never a fake default', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing' } });
    expect(await (await GET(request(undefined, 'Bearer token', 'GET'))).json()).toEqual({ status: 'unavailable' });
    rpc.mockResolvedValueOnce({ data: { revision: 1, bands: { ...mine, lunchFrom: 1 } }, error: null });
    expect(await (await GET(request(undefined, 'Bearer token', 'GET'))).json()).toEqual({ status: 'unavailable' });
  });
  it('no session is 401', async () => {
    const { MobileApiUnauthorizedError } = await import('./auth');
    vi.mocked(authenticateMobileMutationAccessToken).mockRejectedValueOnce(new MobileApiUnauthorizedError());
    expect((await GET(request(undefined, 'Bearer token', 'GET'))).status).toBe(401);
    expect((await GET(request(undefined, '', 'GET'))).status).toBe(401);
  });
});

describe('PUT /nutrition/moment-bands', () => {
  const answer = (status: number, body: unknown) => rpc.mockResolvedValue({ data: [{ response_status: status, response_body: body, replayed: false }], error: null });
  it('sends the five limits, the revision and the key; 200 echoes the confirmed bands', async () => {
    answer(200, { revision: 1, bands: mine });
    const response = await PUT(request(write()));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ revision: 1, bands: mine });
    expect(rpc).toHaveBeenCalledWith('mobile_put_meal_moment_bands', { p_breakfast_from: 420, p_lunch_from: 720, p_snack_from: 960, p_dinner_from: 1200,
      p_dinner_until: 1410, p_expected_revision: 0, p_idempotency_key: 'bands:1' });
  });
  it('a receipt with other bands is an unknown outcome (503), never a confirmation', async () => {
    answer(200, { revision: 1, bands: { ...mine, lunchFrom: 690 } });
    expect((await PUT(request(write()))).status).toBe(503);
  });
  it('409 carries the server truth; a lost CAS outside the lock is 409 without it', async () => {
    answer(409, { error: 'MEAL_MOMENT_BANDS_CHANGED', message: 'Tus horarios cambiaron en otro dispositivo.', current: { revision: 4, bands: mine } });
    const response = await PUT(request(write(mine, 3)));
    expect(response.status).toBe(409); expect((await response.json()).current).toEqual({ revision: 4, bands: mine });
    rpc.mockResolvedValueOnce({ data: null, error: { code: '40001', message: 'MEAL_MOMENT_BANDS_CHANGED' } });
    const lost = await PUT(request(write(mine, 3)));
    expect(lost.status).toBe(409); expect((await lost.json()).current).toBeNull();
  });
  it('invalid input is 400 without calling the database; an arbitrary userId is never accepted', async () => {
    for (const body of [write({ ...mine, snackFrom: 700 }), { ...write(), userId: user }, 'not json']) {
      expect((await PUT(request(body))).status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'x' } });
    expect((await PUT(request(write()))).status).toBe(400);
  });
  it('a database failure is 503 (the same key can be replayed); OPTIONS answers CORS', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'boom' } });
    expect((await PUT(request(write()))).status).toBe(503);
    expect((await OPTIONS(request(undefined, 'Bearer token', 'OPTIONS'))).status).toBe(204);
  });
});
