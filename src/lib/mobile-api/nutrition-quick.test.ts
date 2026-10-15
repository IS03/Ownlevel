import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MobileApiUnauthorizedError } from './auth';
import { parseQuickIntent, parseQuickSelection, parseQuickPreview, parseQuickResponse } from './nutrition-quick-contract';
vi.mock('server-only', () => ({}));
vi.mock('./supabase', () => ({ authenticateMobileMutationAccessToken: vi.fn() }));
import { authenticateMobileMutationAccessToken } from './supabase';
import { buildQuickOptions } from './nutrition-quick-server';
import { GET, OPTIONS } from '@/app/api/mobile/v1/nutrition/quick-options/route';
import { POST as preview } from '@/app/api/mobile/v1/nutrition/days/[date]/meal-preview/route';
import { POST as confirm } from '@/app/api/mobile/v1/nutrition/days/[date]/meal-registrations/route';
const date = '2026-10-03', id = '42100000-0000-4000-8000-000000000001', version = 'a'.repeat(64);
const selection = { date, source: { kind: 'suggestion', id, version }, quantities: null };
const intent = { ...selection, operation: 'register', idempotencyKey: 'quick:1' };
const snapshot = { title: null, description: 'Pasta', calories: 300, proteinG: null, carbsG: 20, fatG: 0, precision: null, contextType: null, sourceNote: null };
const p = { status: 'preview', selection, snapshot, items: [] };
const receipt = { status: 'registered', operation: 'register', date, resourceId: id, updatedAt: `${date}T12:00:00.123456Z` };
const rpc = vi.fn();
const request = (body: unknown = intent, auth = 'Bearer token') => new NextRequest(`https://ownlevel.fit/api/mobile/v1/nutrition/days/${date}/meal-registrations`, {
  method: 'POST', headers: { authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const params = { params: Promise.resolve({ date }) };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(authenticateMobileMutationAccessToken).mockResolvedValue({ userId: id, supabase: { rpc } } as never); });
describe('Quick Nutrition contracts and routes', () => {
  it('preserves unknown versus zero, optional text and source fingerprints', () => {
    expect(parseQuickPreview(p)).toEqual(p); expect(parseQuickResponse(receipt)).toEqual(receipt);
    expect(parseQuickIntent(intent)).toEqual(intent); expect(parseQuickSelection(selection)).toEqual(selection);
    expect(parseQuickIntent({ ...intent, operation: 'saveSuggestion' })).toBeDefined();
  });
  it('normalizes adjusted quantities without accepting authority from the client', () => {
    const adjusted = { ...selection, source: { ...selection.source, kind: 'saved' }, quantities: [{ itemId: id, quantity: 1.25 }] };
    expect(parseQuickSelection(adjusted)).toEqual(adjusted);
    for (const q of [0, -1, '1', 1.234, Infinity, 1000001]) expect(parseQuickSelection({ ...adjusted, quantities: [{ itemId: id, quantity: q }] })).toBeUndefined();
    for (const patch of [{ user_id: id }, { calories: 10 }, { date: '2026-02-30' }, { source: { ...selection.source, version: 'old' } }]) expect(parseQuickIntent({ ...intent, ...patch })).toBeUndefined();
    expect(parseQuickSelection({ ...adjusted, quantities: [...adjusted.quantities, ...adjusted.quantities] })).toBeUndefined();
    expect(parseQuickIntent({ ...intent, source: adjusted.source, operation: 'saveSuggestion' })).toBeUndefined();
  });
  it('uses existing deterministic candidate grouping, and independent availability', () => {
    const raw = { id, version, log_date: '2026-10-02', title: 'Pasta', description: null, final_calories: 300, final_protein_g: null, final_carbs_g: 20, final_fat_g: 0,
      created_at: '2026-10-02T12:00:00Z', entry_kind: 'meal', source_type: 'manual', deleted_at: null };
    const result = buildQuickOptions({ today: date, saved: { status: 'unavailable' }, suggested: { status: 'ok', rows: [raw, { ...raw, id: '42100000-0000-4000-8000-000000000002', created_at: '2026-10-02T11:00:00Z' }, { ...raw, id: '42100000-0000-4000-8000-000000000003', final_protein_g: 0 }] } });
    expect(result?.saved.status).toBe('unavailable'); expect(result?.suggested).toMatchObject({ status: 'ok', items: [{ useCount: 2, proteinG: null, fatG: 0 }, { useCount: 1, proteinG: 0 }] });
    expect(buildQuickOptions({ today: date, saved: { status: 'ok', rows: [] }, suggested: { status: 'ok', rows: [] } })).toMatchObject({ saved: { items: [] }, suggested: { items: [] } });
  });
  it('authenticates before parsing, never accepts client ownership, and returns no-store', async () => {
    expect((await confirm(request(intent, ''), params)).status).toBe(401); expect(rpc).not.toHaveBeenCalled();
    vi.mocked(authenticateMobileMutationAccessToken).mockRejectedValueOnce(new MobileApiUnauthorizedError());
    expect((await GET(request())).status).toBe(401);
    expect((await confirm(request({ ...intent, user_id: id }), params)).status).toBe(400);
    expect((await preview(request(selection), { params: Promise.resolve({ date: '2026-10-02' }) })).status).toBe(400);
    const options = await OPTIONS(request()); expect(options.status).toBe(204); expect(options.headers.get('Cache-Control')).toBe('no-store');
  });
  it('previews and confirms through RPC only, including stored replay receipts', async () => {
    rpc.mockResolvedValueOnce({ data: [{ response_status: 200, response_body: p }], error: null });
    const pr = await preview(request(selection), params); expect(pr.status).toBe(200); expect(await pr.json()).toEqual(p);
    expect(rpc).toHaveBeenLastCalledWith('mobile_preview_quick_meal', { p_selection: selection });
    rpc.mockResolvedValueOnce({ data: [{ response_status: 201, response_body: receipt, replayed: true }], error: null });
    const cr = await confirm(request(), params); expect(cr.status).toBe(201); expect(await cr.json()).toEqual(receipt);
    expect(rpc).toHaveBeenLastCalledWith('mobile_confirm_quick_meal', { p_intent: intent }); expect(cr.headers.get('Cache-Control')).toBe('no-store');
  });
  it('reads options without changing the historical suggestion window', async () => {
    rpc.mockResolvedValueOnce({ data: { today: date, saved: { status: 'ok', rows: [] }, suggested: { status: 'ok', rows: [] } }, error: null });
    const r = await GET(request()); expect(r.status).toBe(200); expect(await r.json()).toMatchObject({ today: date });
    expect(rpc).toHaveBeenCalledWith('mobile_read_quick_options', {}, { get: true });
  });
  it.each(['QUICK_SOURCE_CHANGED', 'QUICK_SOURCE_UNAVAILABLE', 'QUICK_SOURCE_UNUSABLE', 'SAVED_NAME_EXISTS', 'IDEMPOTENCY_KEY_REUSED', 'DAY_HAS_HISTORICAL_SUMMARY'])('preserves %s explicitly', async error => {
    const body = { error, message: 'review' }; rpc.mockResolvedValueOnce({ data: [{ response_status: 409, response_body: body }], error: null });
    const r = await confirm(request(), params); expect(r.status).toBe(409); expect(await r.json()).toEqual(body);
  });
  it('invalid quantities are 400; ambiguous execution and mismatched responses remain unavailable', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023' } }); expect((await confirm(request(), params)).status).toBe(400);
    rpc.mockResolvedValueOnce({ data: null, error: { code: '57014' } }); expect((await confirm(request(), params)).status).toBe(503);
    rpc.mockResolvedValueOnce({ data: [{ response_status: 201, response_body: { ...receipt, date: '2026-10-02' } }], error: null }); expect((await confirm(request(), params)).status).toBe(503);
    rpc.mockResolvedValueOnce({ data: [{ response_status: 200, response_body: { ...p, selection: { ...selection, source: { ...selection.source, version: 'b'.repeat(64) } } } }], error: null }); expect((await preview(request(selection), params)).status).toBe(503);
  });
});

describe('M9 quick timing EXPAND', () => {
  it('preserves legacy shapes and includes timing in preview/confirmation identity', () => {
    const timed = { ...selection, mealLabel: 'lunch', consumedAt: `${date}T13:40:00-03:00` };
    expect(parseQuickSelection(selection)).toEqual(selection);
    expect(parseQuickSelection(timed)).toMatchObject({ mealLabel: 'lunch', consumedAt: `${date}T16:40:00.000Z` });
    expect(parseQuickIntent({ ...timed, operation: 'register', idempotencyKey: 'm9:timed' })).toMatchObject({ consumedAt: `${date}T16:40:00.000Z` });
    expect(parseQuickPreview({ ...p, selection: timed })?.selection).toMatchObject({ mealLabel: 'lunch' });
    expect(parseQuickSelection({ ...timed, consumedAt: `${date}T01:00:00Z` })).toBeUndefined();
    expect(parseQuickSelection({ ...timed, consumedAt: null })).toBeUndefined();
  });
  it('rejects a preview that silently drops the chosen timing', async () => {
    rpc.mockResolvedValueOnce({ data: [{ response_status: 200, response_body: p }], error: null });
    const response = await preview(request({ ...selection, mealLabel: 'dinner' }), params);
    expect(response.status).toBe(503);
  });
});
