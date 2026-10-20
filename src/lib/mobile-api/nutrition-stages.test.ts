import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('server-only', () => ({}));
vi.mock('./supabase', () => ({ authenticateMobileMutationAccessToken: vi.fn() }));
import { authenticateMobileMutationAccessToken } from './supabase';
import { GET, POST, OPTIONS } from '@/app/api/mobile/v1/nutrition/stages/route';
import { parseNutritionStages, parseStagesIntent, parseStagesResult, type StagesIntent } from './nutrition-stages-contract';

const today = '2026-10-16', rpc = vi.fn();
const id = (n: number) => `41600000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const fields = { name: 'Etapa', kind: 'surplus', baseWaterL: 0, trainingCalorieDeltaKcal: 0, trainingWaterDeltaL: 0,
  weekdays: Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, calorieTargetKcal: 2000, proteinTargetG: 0 })) };
const stage = { ...fields, id: id(1), kind: null, startsOn: today, endsOn: null, sequenceId: null, position: null, duration: null, status: 'current' };
const list = { today, listVersion: 7, current: stage, upcoming: [], past: [], sequences: [], suggestions: null };
const base = { date: today, expectedListVersion: 7, idempotencyKey: 'stages:1' };
const replace = { ...base, operation: 'replace_from_today', stage: fields, future_stages: 'keep' };
const request = (method = 'GET', body?: unknown, token = 'Bearer token', query = '') => new NextRequest(`https://www.ownlevel.fit/api/mobile/v1/nutrition/stages${query}`, {
  method, headers: { authorization: token, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticateMobileMutationAccessToken).mockResolvedValue({ userId: 'owner', supabase: { rpc } } as never);
});

describe('Nutrition stages strict shared contract and API', () => {
  it('v2 is opt-in: protein extra and optional water only with ?targets=2; each shape is exact', async () => {
    const fields2 = { ...fields, baseWaterL: null, trainingProteinDeltaG: 25 };
    const stage2 = { ...stage, baseWaterL: null, trainingProteinDeltaG: 25 };
    const list2 = { ...list, current: stage2 };
    expect(parseNutritionStages(list2, 2)?.current).toMatchObject({ baseWaterL: null, trainingProteinDeltaG: 25 });
    expect(parseNutritionStages(list2)).toBeUndefined(); // v1 never reads a missing water as 0
    expect(parseNutritionStages(list, 2)).toBeUndefined(); // v2 always carries the protein extra
    expect(parseStagesIntent({ ...replace, stage: fields2 }, 2)).toBeDefined();
    expect(parseStagesIntent({ ...replace, stage: fields2 })).toBeUndefined();
    expect(parseStagesIntent(replace, 2)).toBeUndefined();
    for (const bad of [{ ...fields2, trainingWaterDeltaL: 0.5 }, { ...fields2, trainingProteinDeltaG: -1 }, { ...fields2, trainingProteinDeltaG: 1000.5 }, { ...fields2, trainingProteinDeltaG: 1.234 }]) {
      expect(parseStagesIntent({ ...replace, stage: bad }, 2)).toBeUndefined();
    }
    expect(parseStagesIntent({ ...replace, stage: { ...fields2, baseWaterL: 2, trainingWaterDeltaL: 0.5 } }, 2)).toBeDefined();
    rpc.mockResolvedValue({ data: list2, error: null });
    expect(await (await GET(request('GET', undefined, 'Bearer token', '?targets=2'))).json()).toEqual(list2);
    expect(rpc).toHaveBeenCalledWith('mobile_read_nutrition_stages_v2', {}, { get: true });
    const receipt = { status: 'confirmed', operation: 'replace_from_today', date: today, list: list2 };
    rpc.mockResolvedValue({ data: [{ response_status: 200, response_body: receipt, replayed: false }], error: null });
    expect(await (await POST(request('POST', { ...replace, stage: fields2 }, 'Bearer token', '?targets=2'))).json()).toEqual(receipt);
    expect(rpc).toHaveBeenLastCalledWith('mobile_mutate_nutrition_stages_v2', { p_intent: parseStagesIntent({ ...replace, stage: fields2 }, 2) });
    rpc.mockClear();
    expect((await POST(request('POST', replace, 'Bearer token', '?targets=2'))).status).toBe(400);
    expect((await POST(request('POST', { ...replace, stage: fields2 }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('distinguishes no plan, old untyped plan, zero and unavailable', async () => {
    expect(parseNutritionStages({ ...list, current: null })).toBeDefined();
    expect(parseNutritionStages(list)?.current).toMatchObject({ kind: null, baseWaterL: 0 });
    rpc.mockResolvedValue({ data: list, error: null });
    const response = await GET(request());
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(list);
    expect(rpc).toHaveBeenCalledWith('mobile_read_nutrition_stages', {}, { get: true });
    rpc.mockResolvedValue({ data: null, error: { code: '42P01' } });
    expect((await GET(request())).status).toBe(503);
    rpc.mockResolvedValue({ data: { ...list, current: { ...stage, weekdays: [] } }, error: null });
    expect((await GET(request())).status).toBe(503);
  });
  it('requires token identity and rejects unknown/client ownership fields before RPC', async () => {
    expect((await POST(request('POST', replace, ''))).status).toBe(401);
    for (const payload of [{ ...replace, userId: id(3) }, { ...replace, stage: { ...fields, user_id: id(3) } }, { ...replace, future_stages: undefined }, { ...replace, expectedListVersion: -1 }]) {
      expect((await POST(request('POST', payload))).status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
    expect((await OPTIONS(request())).status).toBe(204);
  });
  const intents = [replace,
    { ...base, operation: 'schedule_sequence', name: 'Volumen', start_date: today, after_end: 'keep_last', maintenanceStage: null, stages: [{ ...fields, duration: { unit: 'months', value: 3 } }] },
    { ...base, operation: 'update_future', stageId: id(1), stage: fields, startsOn: '2026-11-01', duration: { unit: 'weeks', value: 4 } },
    { ...base, operation: 'delete_future', stageId: id(1) }, { ...base, operation: 'cancel_sequence', sequenceId: id(2) }];
  it.each(intents)('validates and sends $operation to one transactional RPC', async input => {
    const parsed = parseStagesIntent(input)!; expect(parsed).toBeDefined();
    const receipt = { status: 'confirmed', operation: input.operation, date: today, list };
    rpc.mockResolvedValue({ data: [{ response_status: 200, response_body: receipt, replayed: false }], error: null });
    expect(await (await POST(request('POST', input))).json()).toEqual(receipt);
    expect(rpc).toHaveBeenCalledWith('mobile_mutate_nutrition_stages', { p_intent: parsed });
    rpc.mockResolvedValue({ data: [{ response_status: 200, response_body: { ...receipt, date: '2026-10-15' }, replayed: false }], error: null });
    expect((await POST(request('POST', input))).status).toBe(503);
  });
  it('rejects malformed dates, unsupported durations, missing maintenance and repeated weekdays', () => {
    const schedule = intents[1];
    for (const p of [{ ...schedule, start_date: '2026-02-30' }, { ...schedule, after_end: 'maintenance' },
      ...[0, -1, 1.5, 25].map(value => ({ ...schedule, stages: [{ ...fields, duration: { unit: 'months', value } }] })),
      { ...replace, stage: { ...fields, weekdays: Array(7).fill(fields.weekdays[0]) } },
      { ...replace, stage: { ...fields, kind: null } }, { ...replace, stage: { ...fields, baseWaterL: null } }]) expect(parseStagesIntent(p)).toBeUndefined();
    expect(parseStagesIntent({ ...schedule, after_end: 'maintenance', maintenanceStage: { ...fields, kind: 'maintenance' } })).toBeDefined();
  });
  it.each(['STAGES_CHANGED', 'STAGES_DAY_CHANGED', 'IDEMPOTENCY_KEY_REUSED'])('returns %s with the server list instead of retrying', async error => {
    const conflict = { status: 'conflict', error, message: 'Revisá tus etapas.', list: { ...list, listVersion: 12 } };
    rpc.mockResolvedValue({ data: [{ response_status: 409, response_body: conflict, replayed: false }], error: null });
    const response = await POST(request('POST', replace));
    expect(response.status).toBe(409); expect(await response.json()).toEqual(conflict); expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('checks receipts on replay too and keeps confirmed validation separate from unknown outcomes', async () => {
    rpc.mockResolvedValue({ data: [{ response_status: 400, response_body: { status: 'validation', message: 'La etapa ya empezó.' }, replayed: true }], error: null });
    expect((await POST(request('POST', replace))).status).toBe(400);
    rpc.mockResolvedValue({ data: null, error: { code: '57014' } }); expect((await POST(request('POST', replace))).status).toBe(503);
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'SQL internals' } });
    expect(await (await POST(request('POST', replace))).json()).toEqual({ status: 'validation', message: 'Revisá los valores y las fechas de las etapas.' });
    expect(parseStagesResult({ status: 'conflict', error: 'STAGES_CHANGED', message: 'Cambió', list: null })).toBeUndefined();
  });
  it('validates chronological boundaries, unique ids, seven days, and actual suggestion arithmetic', () => {
    expect(parseNutritionStages({ ...list, current: { ...stage, endsOn: '2026-11-01' } })).toBeUndefined();
    expect(parseNutritionStages({ ...list, past: [{ ...stage, status: 'past' }] })).toBeUndefined();
    expect(parseNutritionStages({ ...list, upcoming: [{ ...stage, status: 'upcoming', startsOn: '2026-10-15' }] })).toBeUndefined();
    const suggestions = { expenditureKcal: 2400, maintenance: 2400, deficit: 2160, surplus: 2520, recomposition: null, custom: null };
    expect(parseNutritionStages({ ...list, suggestions })).toBeDefined();
    expect(parseNutritionStages({ ...list, suggestions: { ...suggestions, deficit: 2000 } })).toBeUndefined();
    expect(parseStagesIntent(replace) as StagesIntent).toMatchObject({ stage: { weekdays: fields.weekdays } });
  });
});
