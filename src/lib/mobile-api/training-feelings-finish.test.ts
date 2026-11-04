import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../../app/api/mobile/v1/training/sessions/[sessionId]/finish-with-feelings/route';
import { parseFeelingsFinishEnvelope } from './training-feelings-finish-contract';
import { parseFeelingsResponse } from './training-feelings';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./supabase', () => ({ authenticateMobileMutationAccessToken: mocks.auth }));
const sid = '93670000-0000-4000-8000-000000000010', xid = '93670000-0000-4000-8000-000000000020', time = '2026-11-04T10:00:00.123456Z';
const feelings = { contractVersion: 'training-feelings/1', sessionId: sid, sessionStatus: 'completed', sessionUpdatedAt: time, endedAt: time, revision: 1, values: {} };
const finished = { status: 'finished', sessionId: sid, sessionStatus: 'completed', name: 'ORIGINAL', routineId: xid, logDate: '2026-11-04', startedAt: time, endedAt: time, sessionUpdatedAt: time,
  metadata: { energyLevel: 2, performanceLevel: null, painLevel: 0, notes: 'original' }, exerciseCount: 1, completedExerciseCount: 1, completedSetCount: 1,
  routineAdditions: [{ sessionExerciseId: xid, exerciseId: xid, name: 'ORIGINAL PRESS', outcome: 'added' }] };
const envelope = { contractVersion: 'training-feelings-finish/2', feelings, finished };
const input = { contractVersion: 'training-feelings/1', operation: 'finish', expectedRevision: 0, patch: {}, idempotencyKey: 'synthetic:finish', expectedSessionUpdatedAt: time, metadata: {} };
const request = (query = '', authorization = 'Bearer synthetic') => new NextRequest(`http://127.0.0.1/api/mobile/v1/training/sessions/${sid}/finish-with-feelings${query}`, { method: 'POST', headers: { authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
beforeEach(() => {
  mocks.rpc.mockReset(); mocks.auth.mockReset(); mocks.auth.mockResolvedValue({ userId: 'token-derived', supabase: { rpc: mocks.rpc } });
});
describe('negotiated finish receipt without changing installed clients', () => {
  it('keeps v1 exact without query negotiation', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ response_status: 200, response_body: feelings, replayed: false }], error: null });
    const result = await POST(request(), { params: Promise.resolve({ sessionId: sid }) });
    expect(result.status).toBe(200); expect(await result.json()).toEqual(feelings); expect(mocks.rpc).toHaveBeenCalledWith('mutate_training_feelings_v1', { p_session_id: sid, p_input: input });
  });
  it.each([false,true])('returns the original richer snapshot for explicit negotiation (replay=%s)', async replayed => {
    mocks.rpc.mockResolvedValue({ data: [{ response_status: 200, response_body: envelope, replayed }], error: null });
    const result = await POST(request('?routineAdditions=1'), { params: Promise.resolve({ sessionId: sid }) });
    expect(result.status).toBe(200); expect(await result.json()).toEqual(envelope); expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('finish_training_feelings_v2', { p_session_id: sid, p_input: input }); expect(result.headers.get('Cache-Control')).toBe('no-store');
  });
  it.each(['?routineAdditions=0','?routineAdditions=1&other=1','?routineAdditions=1&routineAdditions=1'])('rejects unknown/duplicate negotiation: %s', async query => {
    const result = await POST(request(query), { params: Promise.resolve({ sessionId: sid }) }); expect(result.status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('refuses an impossible upgrade from an old committed receipt and keeps auth required', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PT409', message: 'FEELINGS_RECEIPT_VERSION_UNAVAILABLE' } });
    const result = await POST(request('?routineAdditions=1'), { params: Promise.resolve({ sessionId: sid }) });
    expect(result.status).toBe(409); expect((await result.json()).error).toBe('FEELINGS_RECEIPT_VERSION_UNAVAILABLE');
    mocks.rpc.mockClear(); expect((await POST(request('?routineAdditions=1',''), { params: Promise.resolve({ sessionId: sid }) })).status).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('does not fall back or return a partial success when the migration or rich receipt is unavailable', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42883', message: 'missing function' } }).mockResolvedValueOnce({ data: [{ response_status: 200, response_body: feelings, replayed: false }], error: null });
    for(let n=0;n<2;n++) expect((await POST(request('?routineAdditions=1'), { params: Promise.resolve({ sessionId: sid }) })).status).toBe(503);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it('strictly validates summary/outcomes and cross-session consistency', () => {
    expect(parseFeelingsFinishEnvelope(envelope,parseFeelingsResponse)).toEqual(envelope);
    for(const changed of [ { ...envelope, extra: true }, { ...envelope, finished: { ...finished, routineAdditions: undefined } },
      { ...envelope, finished: { ...finished, metadata: { ...finished.metadata, energyPost: 4 } } },
      { ...envelope, finished: { ...finished, sessionId: xid } }, { ...envelope, finished: { ...finished, endedAt: '2026-11-04T11:00:00Z' } },
      { ...envelope, finished: { ...finished, routineAdditions: [{ ...finished.routineAdditions[0], outcome: 'guessed' }] } } ]) expect(() => parseFeelingsFinishEnvelope(changed,parseFeelingsResponse)).toThrow();
  });
});
